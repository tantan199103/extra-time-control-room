import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

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
  const bytes = await referenceResponse.arrayBuffer()
  if (bytes.byteLength > 16 * 1024 * 1024) throw Object.assign(new Error('The listing reference is too large for AI editing.'), { status:422 })
  return { blob:new Blob([bytes], { type:contentType }), url:referenceUrl }
}

async function generatedBytes(generated) {
  if (generated?.b64_json) return Buffer.from(generated.b64_json, 'base64')
  if (!generated?.url || !/^https:\/\//i.test(generated.url)) return null
  const response = await fetch(generated.url, { signal:AbortSignal.timeout(20000) })
  if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/')) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.length <= 20 * 1024 * 1024 ? buffer : null
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
    const prompt = safeText(body.prompt, 1200)
    if (!productId || prompt.length < 8) throw Object.assign(new Error('Describe the change in at least 8 characters.'), { status:422 })
    const listing = await publishedListing(client, productId)
    if (!listing?.image) throw Object.assign(new Error('This published listing has no AI reference image.'), { status:404 })
    const editableFields = (Array.isArray(listing.custom_fields) ? listing.custom_fields : []).map(field => safeText(field.label || field.key, 80)).filter(Boolean)
    if (!editableFields.length) throw Object.assign(new Error('This listing does not allow customer editing.'), { status:422 })

    const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
    const apiUrl = process.env.AI_IMAGE_API_URL || `${process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1'}/images/edits`
    const model = process.env.AI_IMAGE_MODEL || 'gpt-image-2'
    if (!apiKey) throw Object.assign(new Error('AI preview is not connected.'), { status:503 })
    const reference = await fetchReference(request, listing)
    const guardedPrompt = `Use the attached published listing image as the exact visual reference for ${listing.title}. Customer-editable areas are limited to: ${editableFields.join(', ')}. Preserve the jersey silhouette, camera angle, background, official marks, texture, seams, lighting and designer hierarchy unless the customer explicitly requests a broader new direction. Do not invent sponsors, brands or factual claims. Produce a realistic directional product preview, never a print-ready production file. Customer request: ${prompt}`
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', guardedPrompt)
    form.append('image[]', reference.blob, `${listing.id}-listing-reference.webp`)
    form.append('size', 'auto')
    form.append('quality', process.env.AI_IMAGE_QUALITY || 'medium')
    // Leave a small response/cleanup margin before the Vercel function's
    // 60-second maxDuration. A longer upstream timeout only turns a provider
    // stall into a platform timeout with no useful JSON error for the client.
    const upstream = await fetch(apiUrl, { method:'POST', headers:{ Authorization:`Bearer ${apiKey}` }, body:form, signal:AbortSignal.timeout(55000) })
    const result = await upstream.json().catch(() => ({}))
    if (!upstream.ok) throw Object.assign(new Error(result.error?.message || result.message || 'AI provider rejected the preview request.'), { status:upstream.status })
    const bytes = await generatedBytes(result.data?.[0])
    if (!bytes) throw Object.assign(new Error('AI provider returned no usable preview image.'), { status:502 })

    const previewId = randomUUID()
    const path = `${listing.id}/${identityHash.slice(0,16)}/${previewId}.png`
    const { error:uploadError } = await client.storage.from('ai-previews').upload(path, bytes, { contentType:'image/png', cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('ai-previews').createSignedUrl(path, 60 * 60 * 24)
    if (signError || !signed?.signedUrl) throw signError || new Error('Preview URL could not be created.')
    await client.from('pod_ai_preview_jobs').insert({ id:previewId, product_id:listing.id, session_hash:identityHash, storage_path:path, prompt, model, status:'COMPLETED' })
    return sendJson(response, 200, { productId:listing.id, model, imageUrl:signed.signedUrl, previewId, storage:{ bucket:'ai-previews', path }, referenceUrl:reference.url, prompt, expiresIn:86400 })
  } catch (error) {
    return handleApiError(response, error, 'AI preview failed.')
  }
}
