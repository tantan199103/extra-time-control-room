import { randomUUID } from 'node:crypto'
import { handleApiError, protect, readBody, safeText, sendJson } from './_artwork.js'
import { enforceSameOrigin } from './_security.js'

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

function serverPrintAreas(product) {
  const metadata = product?.ai_metadata && typeof product.ai_metadata === 'object' ? product.ai_metadata : {}
  const custom = product?.custom_fields
  const candidates = [
    product?.print_areas,
    product?.printAreas,
    metadata.printAreas,
    metadata.print_areas,
    metadata.designer?.printAreas,
    metadata.designer?.print_areas,
    metadata.quickCustomization?.printAreas,
    metadata.quick_customization?.print_areas,
    custom?.printAreas,
    custom?.print_areas,
    ...(Array.isArray(custom) ? custom.flatMap(item => [item?.printAreas, item?.print_areas, item?.value].filter(Array.isArray)) : [])
  ]
  return candidates.find(Array.isArray) || []
}

function areaFor(product, surfaceId) {
  const area = serverPrintAreas(product).find(item => safeText(item?.id || item?.surface, 60) === surfaceId)
  if (!area || Number(area.widthMm || area.width_mm) <= 0 || Number(area.heightMm || area.height_mm) <= 0) return null
  return area
}

function assertTransform(transform, area) {
  const input = transform && typeof transform === 'object' && !Array.isArray(transform) ? transform : {}
  const width = clamp(input.width, .01, 1.5, .72) * clamp(input.scale, .05, 4, 1)
  const height = clamp(input.height, .01, 1.5, .72) * clamp(input.scale, .05, 4, 1)
  const x = clamp(input.x, 0, 1, .5)
  const y = clamp(input.y, 0, 1, .5)
  const rotation = clamp(input.rotation, -180, 180, 0)
  const radians = Math.abs(rotation) * Math.PI / 180
  const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))
  const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  const safeX = Number(area.safeAreaMm || area.safe_area_mm || 12) / Number(area.widthMm || area.width_mm)
  const safeY = Number(area.safeAreaMm || area.safe_area_mm || 12) / Number(area.heightMm || area.height_mm)
  if (x - rotatedWidth / 2 < safeX || x + rotatedWidth / 2 > 1 - safeX || y - rotatedHeight / 2 < safeY || y + rotatedHeight / 2 > 1 - safeY) throw Object.assign(new Error('Artwork exceeds the selected print safe area.'), { status: 422 })
  return { x, y, width:clamp(input.width, .01, 1.5, .72), height:clamp(input.height, .01, 1.5, .72), scale:clamp(input.scale, .05, 4, 1), rotation, opacity:clamp(input.opacity, 0, 1, 1), flipX:Boolean(input.flipX), flipY:Boolean(input.flipY) }
}

async function publishedProduct(client, productId) {
  const fields = 'id,handle,title,status,price,image,updated_at,custom_fields,print_areas,ai_metadata'
  let result = await client.from('pod_products').select(fields).eq('id', productId).eq('status', 'PUBLISHED').maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(fields).eq('handle', productId).eq('status', 'PUBLISHED').maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST quick order requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 60_000)
    const { client, identityHash } = await protect(request, body, 'quick-customization-order')
    if (/data:image\//i.test(JSON.stringify(body))) throw Object.assign(new Error('Artwork bytes are not accepted in a quick order. Use a verified asset ID.'), { status: 422 })
    const productId = safeText(body.productId, 160)
    const variantId = safeText(body.variantId, 180)
    const surfaceId = safeText(body.surfaceId || 'front', 60)
    const assetId = safeText(body.assetId, 160)
    const idempotencyKey = safeText(body.idempotencyKey, 180)
    if (!productId || !variantId || !assetId || !/^[A-Za-z0-9_-]{16,180}$/.test(idempotencyKey)) throw Object.assign(new Error('Product, variant, verified artwork and request key are required.'), { status: 422 })
    if (body.consent !== true) throw Object.assign(new Error('Confirm that you own or have permission to use the artwork.'), { status: 422 })

    const { data: existing, error: existingError } = await client.from('pod_customization_orders').select('id,status,created_at').eq('idempotency_key', idempotencyKey).eq('session_hash', identityHash).maybeSingle()
    if (existingError && existingError.code !== 'PGRST116') throw existingError
    if (existing) return sendJson(response, 200, { order:existing, replayed:true })

    const assetResult = await client.from('pod_artwork_assets').select('id,storage_key,verified,consent,sha256,mime,width_px,height_px,dpi,source').eq('id', assetId).eq('session_hash', identityHash).maybeSingle()
    if (assetResult.error) throw assetResult.error
    const asset = assetResult.data
    if (!asset?.verified) throw Object.assign(new Error('The artwork asset is not verified for this session.'), { status: 422 })
    if (asset.consent !== true) throw Object.assign(new Error('Asset consent confirmation is required.'), { status: 422 })

    const product = await publishedProduct(client, productId)
    if (!product) throw Object.assign(new Error('This product is no longer published.'), { status: 404 })
    const area = areaFor(product, surfaceId)
    if (!area) throw Object.assign(new Error('This product does not support the selected print surface.'), { status: 422 })
    const variantResult = await client.from('pod_product_variants').select('id,product_id,sku,price,inventory,reserved_inventory,option_values,status').eq('id', variantId).eq('product_id', product.id).eq('status', 'ACTIVE').maybeSingle()
    if (variantResult.error) throw variantResult.error
    const variant = variantResult.data
    const available = Number(variant?.inventory || 0) - Number(variant?.reserved_inventory || 0)
    if (!variant || available < 1 || Number(variant.price ?? product.price ?? 0) <= 0) throw Object.assign(new Error('The selected size or colour is unavailable.'), { status: 409 })
    const transform = assertTransform(body.transform, area)

    const order = {
      id:`quick-${randomUUID()}`,
      product_id:product.id,
      variant_id:variant.id,
      template_id:null,
      template_version:null,
      listing_revision:product.updated_at || null,
      custom_schema:[],
      asset_refs:{ artwork:{ assetId:asset.id, storageKey:asset.storage_key, sha256:asset.sha256 || null } },
      ai_preview_id:null,
      idempotency_key:idempotencyKey,
      session_hash:identityHash,
      payload:{ source:'quick-ai', productId:product.id, variantId:variant.id, surfaceId, printArea:{ id:surfaceId, widthMm:Number(area.widthMm || area.width_mm), heightMm:Number(area.heightMm || area.height_mm), bleedMm:Number(area.bleedMm || area.bleed_mm || 5), safeAreaMm:Number(area.safeAreaMm || area.safe_area_mm || 12) }, assetId:asset.id, transform, adjustments:body.adjustments && typeof body.adjustments === 'object' ? body.adjustments : {}, lineage:body.lineage && typeof body.lineage === 'object' ? body.lineage : {}, consent:true, prompt:safeText(body.lineage?.prompt, 1200), style:safeText(body.lineage?.style, 80) },
      preview_front_url:null,
      status:'PREVIEW'
    }
    const inserted = await client.from('pod_customization_orders').insert(order).select('id,status,created_at').single()
    if (inserted.error?.code === '23505') {
      const replay = await client.from('pod_customization_orders').select('id,status,created_at').eq('idempotency_key', idempotencyKey).eq('session_hash', identityHash).maybeSingle()
      if (replay.data) return sendJson(response, 200, { order:replay.data, replayed:true })
    }
    if (inserted.error) throw inserted.error
    return sendJson(response, 201, { order:inserted.data, productId:product.id, variantId:variant.id, surfaceId, assetId:asset.id })
  } catch (error) {
    return handleApiError(response, error, 'The quick customization order could not be created.')
  }
}
