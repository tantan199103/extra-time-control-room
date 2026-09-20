import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { listingMediaSlot } from '../src/lib/listing-media.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import {
  enforceSameOrigin,
  handleApiError,
  readBody,
  safeText,
  sendJson,
  serverSupabase,
  requireAdmin,
  bestEffort
} from './_security.js'

const UPSTREAM_TIMEOUT_MS = Math.min(
  240_000,
  Math.max(5_000, Number(process.env.AI_IMAGE_TIMEOUT_MS || (process.env.K_SERVICE ? 240_000 : 55_000)))
)

function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' || /aborted due to timeout|timed? out/i.test(String(error?.message || ''))
}
const MAX_REFERENCE_BYTES = 16 * 1024 * 1024
const MAX_GENERATED_BYTES = 20 * 1024 * 1024

function siteOrigin(request) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.FRONTEND_URL
  if (configured) {
    try { return new URL(configured).origin } catch {}
  }
  const forwarded = request.headers?.['x-forwarded-host'] || request.headers?.host || 'localhost:5173'
  const protocol = request.headers?.['x-forwarded-proto'] || (forwarded.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${forwarded}`
}

function cleanPrompt(value, maxLength = 600) {
  return safeText(value, maxLength)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:fangearsport|apikey\.(?:fun|fan)|openai|gpt-image-2)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function listingForAdmin(client, productId) {
  const columns = 'id,handle,title,subtitle,description,image,media,custom_fields,status'
  let result = await client.from('pod_products').select(columns).eq('id', productId).maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(columns).eq('handle', productId).maybeSingle()
  if (result.error) throw result.error
  return result.data
}

function imageCandidate(listing, origin) {
  const media = Array.isArray(listing?.media) ? listing.media : []
  return listing?.image || media.find(item => String(item?.type || '').toUpperCase() === 'IMAGE')?.url || ''
}

async function fetchReference(listing, origin) {
  const raw = imageCandidate(listing, origin)
  if (!raw) throw Object.assign(new Error('This listing has no primary image to use as a reference.'), { status:422 })
  let referenceUrl
  try { referenceUrl = new URL(raw, origin) } catch { throw Object.assign(new Error('The listing primary image URL is invalid.'), { status:422 }) }
  if (!['http:', 'https:'].includes(referenceUrl.protocol)) throw Object.assign(new Error('The listing primary image must be an HTTP or HTTPS image.'), { status:422 })
  const response = await fetch(referenceUrl, { signal:AbortSignal.timeout(15_000) })
  if (!response.ok) throw Object.assign(new Error(`Listing reference could not be loaded (${response.status}).`), { status:502 })
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw Object.assign(new Error('The listing primary image is not an image file.'), { status:422 })
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_REFERENCE_BYTES) throw Object.assign(new Error('The listing primary image is too large for generation.'), { status:422 })
  const extension = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : contentType.includes('avif') ? 'avif' : 'png'
  return { blob:new Blob([bytes], { type:contentType }), url:referenceUrl.toString(), filename:`${listing.id}-primary-reference.${extension}` }
}

async function generatedAsset(entry) {
  if (entry?.b64_json) {
    const type = String(entry.mime_type || entry.mimeType || 'image/png').toLowerCase()
    return { bytes:Buffer.from(entry.b64_json, 'base64'), type:type.startsWith('image/') ? type : 'image/png' }
  }
  if (!entry?.url || !/^https:\/\//i.test(entry.url)) return null
  const response = await fetch(entry.url, { signal:AbortSignal.timeout(20_000) })
  const type = (response.headers.get('content-type') || '').toLowerCase()
  if (!response.ok || !type.startsWith('image/')) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_GENERATED_BYTES) return null
  return { bytes, type }
}

async function cleanGeneratedAsset(asset) {
  if (!asset?.bytes?.length) return null
  const cleaned = await sanitizeImagePrivacyMetadata(new Blob([asset.bytes], { type:asset.type }))
  const bytes = Buffer.from(await cleaned.arrayBuffer())
  if (bytes.length > MAX_GENERATED_BYTES) return null
  return { bytes, type:cleaned.type || asset.type || 'image/png' }
}

async function optimizeGeneratedAsset(asset) {
  if (!asset?.bytes?.length) return null
  const markerText = asset.bytes.toString('latin1').toLowerCase()
  const hasProvenance = markerText.includes('c2pa') || markerText.includes('jumbf') || markerText.includes('cabx')
  if (hasProvenance) return { ...asset, optimized:false, provenancePreserved:true }
  const metadata = await sharp(asset.bytes).metadata()
  const pipeline = sharp(asset.bytes).rotate().resize({ width:2400, height:2400, fit:'inside', withoutEnlargement:true })
  const outputType = metadata.hasAlpha ? 'image/png' : 'image/webp'
  const output = metadata.hasAlpha
    ? await pipeline.png({ compressionLevel:9, effort:6 }).toBuffer()
    : await pipeline.webp({ quality:84, effort:5 }).toBuffer()
  const cleaned = await sanitizeImagePrivacyMetadata(new Blob([output], { type:outputType }))
  return { bytes:Buffer.from(await cleaned.arrayBuffer()), type:outputType, optimized:true, provenancePreserved:false }
}

function fieldLabels(listing) {
  const fields = Array.isArray(listing?.custom_fields) ? listing.custom_fields : []
  const labels = [...new Set(fields.map(field => cleanPrompt(field?.label || field?.key, 60)).filter(Boolean))].slice(0, 8)
  return labels.length ? labels : ['Name', 'Number', 'Team / City', 'Year', 'Color', 'Optional Photo']
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST listing media generation requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12_000)
    const client = serverSupabase()
    const admin = await requireAdmin(request, client)
    const productId = cleanPrompt(body.productId, 160)
    const slot = listingMediaSlot(cleanPrompt(body.slot, 60).toLowerCase())
    const direction = cleanPrompt(body.direction, 500)
    if (!productId || !slot) throw Object.assign(new Error('Choose a supported editorial media role.'), { status:422 })
    const listing = await listingForAdmin(client, productId)
    if (!listing) throw Object.assign(new Error('Listing not found.'), { status:404 })
    if (String(listing.status || '').toUpperCase() === 'ARCHIVED') throw Object.assign(new Error('Archived listings cannot generate new media.'), { status:409 })

    const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
    const apiUrl = process.env.AI_IMAGE_API_URL || `${process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1'}/images/edits`
    const model = process.env.AI_IMAGE_MODEL || 'gpt-image-2'
    if (!apiKey) throw Object.assign(new Error('AI media generation is not connected. Add AI_IMAGE_API_KEY in the server environment.'), { status:503 })

    const origin = siteOrigin(request)
    const reference = await fetchReference(listing, origin)
    const labels = fieldLabels(listing)
    const title = cleanPrompt(listing.title || listing.handle || 'the listing', 140)
    const extra = direction ? ` Additional art direction from the editor: ${direction}.` : ''
    const guideFields = labels.join(', ')
    const guardedPrompt = `Use the attached primary listing image as the exact and only garment reference for “${title}”. This is an editorial asset for the Extra Time product page. ${slot.prompt}${slot.id === 'custom-guide' ? ` The only supported editable fields are: ${guideFields}.` : ''} Do not redesign the garment, change the locked artwork, invent a team affiliation, add sponsors, add brand marks, add unrelated products, or include prices. Do not mention image generators or source websites.${extra}`
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', guardedPrompt)
    form.append('image[]', reference.blob, reference.filename)
    form.append('size', process.env.AI_IMAGE_SIZE || 'auto')
    form.append('quality', process.env.AI_IMAGE_QUALITY || 'medium')
    const upstream = await fetch(apiUrl, {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}` },
      body:form,
      signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    const payload = await upstream.json().catch(() => ({}))
    if (!upstream.ok) throw Object.assign(new Error(payload.error?.message || payload.message || 'AI provider rejected the editorial image request.'), { status:upstream.status })
    const rawAsset = await generatedAsset(payload.data?.[0])
    const asset = await optimizeGeneratedAsset(await cleanGeneratedAsset(rawAsset))
    if (!asset) throw Object.assign(new Error('AI provider returned no usable editorial image.'), { status:502 })

    const mediaId = `generated-${randomUUID()}`
    const extension = asset.type.includes('jpeg') ? 'jpg' : asset.type.includes('webp') ? 'webp' : 'png'
    const path = `${String(listing.id).replace(/[^a-zA-Z0-9-]/g, '-')}/editorial/${slot.id}-${mediaId}.${extension}`
    const { error:uploadError } = await client.storage.from('product-media').upload(path, asset.bytes, {
      contentType:asset.type,
      cacheControl:'31536000',
      upsert:false
    })
    if (uploadError) throw uploadError
    const { data:publicData } = client.storage.from('product-media').getPublicUrl(path)
    if (!publicData?.publicUrl) throw new Error('The generated image was stored but no public URL was returned.')
    const media = {
      id:mediaId,
      type:'IMAGE',
      url:publicData.publicUrl,
      path,
      filename:`${String(listing.handle || listing.id).slice(0,48)}-${slot.id}.${extension}`,
      alt:`${slot.alt} for ${title}`.slice(0,240),
      role:slot.id,
      optimized:Boolean(asset.optimized),
      provenance:{ source:'AI_GENERATED', aiGenerated:true, provider:'configured-server-provider', model, preserved:Boolean(asset.provenancePreserved) },
      createdAt:new Date().toISOString()
    }
    await bestEffort(client.from('pod_audit_logs').insert({
      actor_id:admin.id,
      entity_type:'product_media',
      entity_id:listing.id,
      action:'GENERATE_EDITORIAL_MEDIA',
      snapshot:{ media_id:mediaId, role:slot.id }
    }))
    return sendJson(response, 200, { productId:listing.id, slot:slot.id, media })
  } catch (error) {
    if (isTimeoutError(error)) return handleApiError(response, Object.assign(new Error('The AI image provider took too long to finish. Retry once or use a smaller reference image.'), { status:504 }), 'Editorial image generation failed.')
    return handleApiError(response, error, 'Editorial image generation failed.')
  }
}
