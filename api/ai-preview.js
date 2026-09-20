import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'
import { buildExactPreviewDirection, normalizePreviewRegion } from '../src/lib/customization-ai.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import { prepareExactImageEdit, validateExactImageEdit } from './_exact-image-edit.js'

function getOrigin(request) {
  const forwarded = request.headers?.['x-forwarded-host'] || request.headers?.host || 'localhost:5173'
  const protocol = request.headers?.['x-forwarded-proto'] || (forwarded.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${forwarded}`
}

async function publishedListing(client, productId) {
  const columns = 'id, handle, title, subtitle, image, custom_fields, status'
  let result = await client.from('pod_products').select(columns).eq('id',productId).eq('status','PUBLISHED').maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(columns).eq('handle',productId).eq('status','PUBLISHED').maybeSingle()
  if (result.error) throw result.error
  return result.data
}

async function fetchReference(request, listing) {
  const referenceUrl = new URL(listing.image, getOrigin(request)).toString()
  const referenceResponse = await fetch(referenceUrl, { signal:AbortSignal.timeout(15000) })
  if (!referenceResponse.ok) throw Object.assign(new Error(`Listing reference could not be loaded (${referenceResponse.status}).`), { status:502 })
  const contentType = referenceResponse.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw Object.assign(new Error('The listing reference is not an image.'), { status:422 })
  const bytes = Buffer.from(await referenceResponse.arrayBuffer())
  if (bytes.byteLength > 16 * 1024 * 1024) throw Object.assign(new Error('The listing reference is too large for AI editing.'), { status:422 })
  return { bytes, url:referenceUrl }
}

async function generatedAsset(generated) {
  if (generated?.b64_json) {
    const type = String(generated.mime_type || generated.mimeType || 'image/png').toLowerCase()
    return { bytes:Buffer.from(generated.b64_json, 'base64'), type:type.startsWith('image/') ? type : 'image/png' }
  }
  if (!generated?.url || !/^https:\/\//i.test(generated.url)) return null
  const response = await fetch(generated.url, { signal:AbortSignal.timeout(20000) })
  const type = (response.headers.get('content-type') || '').toLowerCase()
  if (!response.ok || !type.startsWith('image/')) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.length <= 20 * 1024 * 1024 ? { bytes:buffer, type } : null
}

async function cleanGeneratedAsset(asset) {
  if (!asset?.bytes?.length) return null
  const clean = await sanitizeImagePrivacyMetadata(new Blob([asset.bytes], { type:asset.type }))
  const bytes = Buffer.from(await clean.arrayBuffer())
  return bytes.length <= 20 * 1024 * 1024 ? { bytes, type:clean.type || asset.type || 'image/png' } : null
}

function fieldValue(field, raw) {
  if (raw == null || raw === '') return ''
  if (field.type === 'photo') return ''
  const max = Math.min(500, Math.max(1, Number(field.maxLength || (field.type === 'textarea' ? 500 : 80))))
  const value = safeText(raw, max)
  if (field.type === 'number' && value && !/^\d+(?:\.\d+)?$/.test(value)) throw Object.assign(new Error(`${field.label} must be numeric.`), { status:422 })
  if (field.type === 'select' && value && !(field.options || []).includes(value)) throw Object.assign(new Error(`${field.label} is not an allowed choice.`), { status:422 })
  return value
}

function previewDirection(listing, body) {
  const schema = Array.isArray(listing.custom_fields) ? listing.custom_fields : []
  const editable = schema.filter(field => !['photo','logo','textarea'].includes(field.type))
  const incomingValues = body.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : {}
  const allowedKeys = new Set(editable.map(field => field.key))
  if (Object.keys(incomingValues).some(key => !allowedKeys.has(key))) throw Object.assign(new Error('The preview contains a field this listing does not allow.'), { status:422 })
  if (body.prompt || body.note || body.mode || body.selections) throw Object.assign(new Error('Freeform prompts and creative preview modes are not allowed.'), { status:422 })
  const details = editable.map(field => {
    const value = fieldValue(field, incomingValues[field.key])
    if (!value) return null
    const region = normalizePreviewRegion(field.previewRegion)
    if (!region) throw Object.assign(new Error(`${field.label || field.key} does not have a designer-approved edit area.`), { status:422 })
    return { label:field.label || field.key, value, region }
  }).filter(Boolean)
  try {
    return buildExactPreviewDirection({ title:listing.title, details })
  } catch (error) {
    throw Object.assign(error, { status:422 })
  }
}

function providerError(status, payload) {
  if (status === 401 || status === 403) return Object.assign(new Error('Visual previews are temporarily unavailable because the image service credentials were rejected.'), { status:503 })
  if (status === 429) return Object.assign(new Error('The image service is temporarily rate-limited or out of credit. Try again later.'), { status:503 })
  return Object.assign(new Error(payload.error?.message || payload.message || 'The image service rejected the preview request.'), { status })
}

function imageModels() {
  const configured = String(process.env.AI_IMAGE_MODELS || process.env.AI_IMAGE_MODEL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return [...new Set(configured.length ? configured : ['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2'])].slice(0, 3)
}

function editForm({ model, prompt, prepared, listing }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('image[]', new Blob([prepared.imageBytes], { type:'image/png' }), `${listing.id}-locked-reference.png`)
  form.append('mask', new Blob([prepared.maskBytes], { type:'image/png' }), `${listing.id}-approved-mask.png`)
  form.append('size', process.env.AI_IMAGE_SIZE || `${prepared.canvas.width}x${prepared.canvas.height}`)
  form.append('quality', process.env.AI_IMAGE_QUALITY || 'medium')
  if (model !== 'gpt-image-2') form.append('input_fidelity', 'high')
  form.append('output_format', 'png')
  return form
}

async function requestImageEdit({ apiUrl, apiKey, models, prompt, prepared, listing }) {
  let lastFailure = null
  for (const model of models) {
    const upstream = await fetch(apiUrl, {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}` },
      body:editForm({ model, prompt, prepared, listing }),
      signal:AbortSignal.timeout(55000)
    })
    const result = await upstream.json().catch(() => ({}))
    if (upstream.ok) return { model, result }
    lastFailure = providerError(upstream.status, result)
    // Authentication and billing failures apply to every model. Do not make
    // duplicate upstream calls that cannot succeed with the same credential.
    if ([401,403].includes(upstream.status)) break
    if (![400,404,409,422,429,500,502,503,504].includes(upstream.status)) break
  }
  throw lastFailure || Object.assign(new Error('The image service did not accept any configured edit model.'), { status:503 })
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST AI preview requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 18000)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'ai-preview', identityHash)

    const productId = safeText(body.productId, 160)
    if (!productId) throw Object.assign(new Error('Choose a published listing first.'), { status:422 })
    const listing = await publishedListing(client, productId)
    if (!listing?.image) throw Object.assign(new Error('This published listing has no AI reference image.'), { status:404 })
    const editableFields = (Array.isArray(listing.custom_fields) ? listing.custom_fields : []).filter(field => !['photo','logo','textarea'].includes(field.type) && normalizePreviewRegion(field.previewRegion))
    if (!editableFields.length) throw Object.assign(new Error('This product does not yet have designer-approved edit areas.'), { status:422 })

    const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
    const apiUrl = process.env.AI_IMAGE_API_URL || `${process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1'}/images/edits`
    const models = imageModels()
    if (!apiKey) throw Object.assign(new Error('Visual previews are temporarily unavailable because the image service is not connected.'), { status:503 })
    const direction = previewDirection(listing, body)
    const reference = await fetchReference(request, listing)
    const prepared = await prepareExactImageEdit(reference.bytes, direction.details.map(detail => detail.region))
    const guardedPrompt = `The attached image is the source image, not inspiration. The transparent mask is the complete and absolute edit boundary. Change only the requested value inside its matching masked area. Copy the existing typography, print treatment, perspective and surface texture. Every opaque-mask pixel must remain visually identical. Do not redraw, restyle or replace the garment. ${direction.direction}`
    // Leave a small response/cleanup margin before the Vercel function's
    // 60-second maxDuration. A longer upstream timeout only turns a provider
    // stall into a platform timeout with no useful JSON error for the client.
    const { model, result } = await requestImageEdit({ apiUrl, apiKey, models, prompt:guardedPrompt, prepared, listing })
    const generated = await generatedAsset(result.data?.[0])
    if (!generated) throw Object.assign(new Error('The image service returned no usable preview image.'), { status:502 })
    const verified = await validateExactImageEdit(prepared, generated.bytes)
    const asset = await cleanGeneratedAsset(verified)
    if (!asset) throw Object.assign(new Error('The verified preview image could not be prepared.'), { status:502 })

    const previewId = randomUUID()
    const extension = asset.type.includes('jpeg') ? 'jpg' : asset.type.includes('webp') ? 'webp' : 'png'
    const path = `${listing.id}/${identityHash.slice(0,16)}/${previewId}.${extension}`
    const { error:uploadError } = await client.storage.from('ai-previews').upload(path, asset.bytes, { contentType:asset.type, cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('ai-previews').createSignedUrl(path, 60 * 60 * 24)
    if (signError || !signed?.signedUrl) throw signError || new Error('Preview URL could not be created.')
    await client.from('pod_ai_preview_jobs').insert({ id:previewId, product_id:listing.id, session_hash:identityHash, storage_path:path, prompt:direction.direction, model, status:'COMPLETED' })
    return sendJson(response, 200, { productId:listing.id, model, imageUrl:signed.signedUrl, previewId, storage:{ bucket:'ai-previews', path }, referenceUrl:reference.url, direction:direction.direction, summary:direction.summary, mode:direction.mode, exactEdit:{ verified:true, protectedMeanDifference:verified.metrics.meanDifference, protectedChangedRatio:verified.metrics.changedRatio }, expiresIn:86400 })
  } catch (error) {
    return handleApiError(response, error, 'AI preview failed.')
  }
}
