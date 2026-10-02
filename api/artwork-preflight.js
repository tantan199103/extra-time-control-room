import { handleApiError } from './_artwork.js'
import { consumeQuota, enforceSameOrigin, readBody, requestIdentity, customerSession, safeText, sendJson, serverSupabase } from './_security.js'

const clamp = (value, min, max, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback }
const issue = (level, code, title, message) => ({ level, code, title, message })

function serverPrintAreas(product) {
  const metadata = product?.ai_metadata && typeof product.ai_metadata === 'object' ? product.ai_metadata : {}
  const custom = product?.custom_fields
  const candidates = [product?.print_areas, product?.printAreas, metadata.printAreas, metadata.print_areas, metadata.designer?.printAreas, metadata.designer?.print_areas, custom?.printAreas, custom?.print_areas, ...(Array.isArray(custom) ? custom.flatMap(item => [item?.printAreas, item?.print_areas, item?.value]?.filter(Array.isArray)) : [])]
  return candidates.find(Array.isArray) || []
}

function rotatedBounds(width, height, rotation) {
  const radians = Math.abs(Number(rotation) || 0) * Math.PI / 180
  return { width: Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)), height: Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)) }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST artwork preflight requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 40_000)
    const sessionId = customerSession(body)
    const client = serverSupabase()
    const identityHash = requestIdentity(request, sessionId)
    await consumeQuota(client, 'artwork-preflight', identityHash)
    const issues = []
    const assetId = safeText(body.assetId, 160)
    let asset = null
    if (!assetId) issues.push(issue('error', 'asset-missing', 'Artwork asset is missing', 'Select artwork that has completed secure upload.'))
    else {
      const { data, error } = await client.from('pod_artwork_assets').select('id, verified, consent, dpi, width_px, height_px, mime, source, sha256').eq('id', assetId).eq('session_hash', identityHash).maybeSingle()
      if (error) throw error
      asset = data
      if (!asset) issues.push(issue('error', 'asset-owner', 'Artwork asset is not available', 'This artwork does not belong to the current session.'))
      else {
        if (asset.verified !== true) issues.push(issue('error', 'asset-unverified', 'Artwork asset is not verified', 'Secure upload verification must finish before this artwork can be sent to print.'))
        if (body.consent !== true && asset.consent !== true) issues.push(issue('error', 'consent', 'Image permission is missing', 'Confirm that you own or may use the uploaded artwork.'))
        if (!asset.sha256) issues.push(issue('error', 'asset-checksum', 'Artwork checksum is missing', 'Upload the artwork again so its verified checksum can be recorded.'))
      }
    }
    const productId = safeText(body.productId, 160)
    const surfaceId = safeText(body.surfaceId || body.printArea?.id, 60)
    let area = null
    if (!productId || !surfaceId) issues.push(issue('error', 'surface', 'Print surface is not supported', 'Choose a published product and print surface with physical dimensions.'))
    else {
      let result = await client.from('pod_products').select('id, handle, status, custom_fields, print_areas, ai_metadata').eq('id', productId).eq('status', 'PUBLISHED').maybeSingle()
      if (!result.data && !result.error) result = await client.from('pod_products').select('id, handle, status, custom_fields, print_areas, ai_metadata').eq('handle', productId).eq('status', 'PUBLISHED').maybeSingle()
      if (result.error) throw result.error
      const areas = serverPrintAreas(result.data)
      area = areas.find(item => safeText(item?.id || item?.surface, 60) === surfaceId)
      if (!area || Number(area.widthMm || area.width_mm) <= 0 || Number(area.heightMm || area.height_mm) <= 0) issues.push(issue('error', 'surface', 'Print surface is not supported', 'This published product has no verified print area for the selected surface.'))
    }
    const transform = body.transform && typeof body.transform === 'object' ? body.transform : {}
    const width = clamp(transform.width, 0, 1.5, .72) * clamp(transform.scale, .05, 4, 1)
    const height = clamp(transform.height, 0, 1.5, .72) * clamp(transform.scale, .05, 4, 1)
    const x = clamp(transform.x, -1, 2, .5)
    const y = clamp(transform.y, -1, 2, .5)
    const rotation = clamp(transform.rotation, -360, 360, 0)
    const bounds = rotatedBounds(width, height, rotation)
    const areaWidth = Number(area?.widthMm || area?.width_mm || 0)
    const areaHeight = Number(area?.heightMm || area?.height_mm || 0)
    const safeInsetX = areaWidth ? Number(area?.safeAreaMm || area?.safe_area_mm || 12) / areaWidth : .04
    const safeInsetY = areaHeight ? Number(area?.safeAreaMm || area?.safe_area_mm || 12) / areaHeight : .04
    if (x - bounds.width / 2 < safeInsetX || x + bounds.width / 2 > 1 - safeInsetX || y - bounds.height / 2 < safeInsetY || y + bounds.height / 2 > 1 - safeInsetY) issues.push(issue('error', 'safe-area', 'Artwork exceeds the safe area', 'Move or scale the artwork so it remains inside the print boundary.'))
    if (asset && areaWidth && areaHeight) {
      const targetDpi = Number(area?.recommendedDpi || area?.maxDpi || area?.max_dpi || 300)
      const dpi = Number(asset.dpi || 0)
      if (!dpi || dpi < targetDpi) issues.push(issue('warning', 'dpi', 'DPI is below the target', dpi ? `This asset reports ${dpi} DPI; ${targetDpi} DPI is recommended.` : `This asset has no embedded DPI; ${targetDpi} DPI is recommended.`))
      const requiredWidthPx = Math.ceil(areaWidth * width / 25.4 * targetDpi)
      const requiredHeightPx = Math.ceil(areaHeight * height / 25.4 * targetDpi)
      if (Number(asset.width_px || 0) < requiredWidthPx || Number(asset.height_px || 0) < requiredHeightPx) issues.push(issue('warning', 'resolution', 'Artwork may print soft', `At this size the artwork should be at least ${requiredWidthPx}×${requiredHeightPx}px.`))
    }
    const textLayers = Array.isArray(body.layers) ? body.layers.filter(layer => layer && (layer.kind === 'text' || layer.type === 'text')) : []
    if (textLayers.some(layer => Number(layer.fontSizeMm || layer.fontSize || 0) > 0 && Number(layer.fontSizeMm || layer.fontSize) < 4)) issues.push(issue('warning', 'text-size', 'Text may be too small', 'Use at least 4 mm type for reliable garment printing.'))
    if (textLayers.some(layer => Number(layer.strokeWidthMm || layer.lineWidthMm || 0) > 0 && Number(layer.strokeWidthMm || layer.lineWidthMm) < .35)) issues.push(issue('warning', 'line-width', 'Lines may be too fine', 'Use at least 0.35 mm line weight for reliable garment printing.'))
    if (!issues.some(item => item.level === 'error')) issues.push(issue('pass', 'ready', 'Artwork passed preflight', 'Safe area, asset verification and print-surface checks are clear.'))
    return sendJson(response, 200, { ok: !issues.some(item => item.level === 'error'), issues, surfaceId, printArea: area ? { id: surfaceId, surface: area.surface || surfaceId, widthMm: areaWidth, heightMm: areaHeight, bleedMm: Number(area.bleedMm || area.bleed_mm || 5), safeAreaMm: Number(area.safeAreaMm || area.safe_area_mm || 12), maxDpi: Number(area.maxDpi || area.max_dpi || 300), maskUrl: area.maskUrl || area.mask_url || null } : null })
  } catch (error) { return handleApiError(response, error, 'The artwork preflight could not be completed.') }
}
