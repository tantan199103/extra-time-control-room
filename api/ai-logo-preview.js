import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, sendJson, serverSupabase } from './_security.js'
import { prepareExactImageEdit, validateExactImageEdit } from './_exact-image-edit.js'
import { compositeLogo, logoMetadata } from './_logo-composite.js'
import { assertCustomerAsset, downloadStorageAsset, fetchListingImage, logoField, publishedListing } from './_logo-request.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'

const allowedTreatments = new Map([
  ['EXACT', 'Keep the logo surface clean and unchanged.'],
  ['FABRIC', 'Add only a subtle fabric-print integration inside the logo area.'],
  ['VINTAGE', 'Add a restrained worn-print texture inside the logo area without erasing any letters or symbols.'],
  ['MONOCHROME', 'Use the listing artwork ink colour while preserving every shape and letter in the logo.']
])

function imageModels() {
  const configured = String(process.env.AI_IMAGE_MODELS || process.env.AI_IMAGE_MODEL || '')
    .split(',').map(value => value.trim()).filter(Boolean)
  return [...new Set(configured.length ? configured : ['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2'])].slice(0, 3)
}

function providerError(status, payload) {
  if (status === 401 || status === 403) return Object.assign(new Error('AI logo finish is temporarily unavailable because the image service credentials were rejected.'), { status:503 })
  if (status === 429) return Object.assign(new Error('AI logo finish is temporarily rate-limited or out of credit. Keep the exact placement or try again later.'), { status:503 })
  return Object.assign(new Error(payload.error?.message || payload.message || 'The image service rejected the logo finish request.'), { status })
}

function editForm({ model, prompt, prepared, logoBytes, listing }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('image[]', new Blob([prepared.imageBytes], { type:'image/png' }), `${listing.id}-locked-reference.png`)
  form.append('image[]', new Blob([logoBytes], { type:'image/png' }), `${listing.id}-exact-customer-logo.png`)
  form.append('mask', new Blob([prepared.maskBytes], { type:'image/png' }), `${listing.id}-logo-area-mask.png`)
  form.append('size', process.env.AI_IMAGE_SIZE || `${prepared.canvas.width}x${prepared.canvas.height}`)
  form.append('quality', process.env.AI_IMAGE_QUALITY || 'medium')
  if (model !== 'gpt-image-2') form.append('input_fidelity', 'high')
  form.append('output_format', 'png')
  return form
}

async function requestImageEdit({ prompt, prepared, logoBytes, listing }) {
  const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
  const apiUrl = process.env.AI_IMAGE_API_URL || `${process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1'}/images/edits`
  if (!apiKey) throw Object.assign(new Error('AI logo finish is not connected. The verified exact placement is still available.'), { status:503 })
  let lastFailure = null
  for (const model of imageModels()) {
    const upstream = await fetch(apiUrl, {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}` },
      body:editForm({ model, prompt, prepared, logoBytes, listing }),
      signal:AbortSignal.timeout(55000)
    })
    const result = await upstream.json().catch(() => ({}))
    if (upstream.ok) return { model, result }
    lastFailure = providerError(upstream.status, result)
    if ([401,403].includes(upstream.status)) break
    if (![400,404,409,422,429,500,502,503,504].includes(upstream.status)) break
  }
  throw lastFailure || Object.assign(new Error('No configured image model accepted the logo finish request.'), { status:503 })
}

async function generatedAsset(generated) {
  if (generated?.b64_json) return Buffer.from(generated.b64_json, 'base64')
  if (!generated?.url || !/^https:\/\//i.test(generated.url)) return null
  const response = await fetch(generated.url, { signal:AbortSignal.timeout(20000) })
  const type = response.headers.get('content-type') || ''
  if (!response.ok || !type.startsWith('image/')) return null
  const bytes = Buffer.from(await response.arrayBuffer())
  return bytes.length <= 20 * 1024 * 1024 ? bytes : null
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST AI logo preview requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12000)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'ai-logo-preview', identityHash)

    const productId = String(body.productId || '').trim().slice(0, 160)
    const listing = await publishedListing(client, productId)
    if (!listing) throw Object.assign(new Error('This listing is no longer published.'), { status:404 })
    const field = logoField(listing, body.fieldKey)
    if (field.allowAiFinish === false) throw Object.assign(new Error('AI finish is disabled for this logo area.'), { status:422 })
    const asset = assertCustomerAsset(listing.id, identityHash, body.assetRef, { kind:'logo' })
    const treatment = allowedTreatments.has(String(body.treatment || '').toUpperCase()) ? String(body.treatment).toUpperCase() : String(field.logoTreatment || 'FABRIC').toUpperCase()
    const instruction = allowedTreatments.get(treatment) || allowedTreatments.get('FABRIC')
    const [reference, logoBytes] = await Promise.all([fetchListingImage(request, listing), downloadStorageAsset(client, asset)])
    const prepared = await prepareExactImageEdit(reference.bytes, [field.previewRegion])
    const prompt = [
      `Edit the supplied listing image of “${listing.title}” in place.`,
      'The second supplied image is the customer logo and must be treated as an exact source asset, not as inspiration.',
      `Replace only the designer-approved ${field.label || field.key} area. ${instruction}`,
      'Preserve every letter, symbol, proportion and edge of the uploaded logo.',
      'Keep the original canvas, crop, garment, artwork, pattern, typography, lighting, shadows, folds and every pixel outside the transparent mask visually unchanged.',
      'Do not invent sponsors, words, badges or a new garment. If exact logo fidelity is not possible, return no image.'
    ].join(' ')
    const { model, result } = await requestImageEdit({ prompt, prepared, logoBytes, listing })
    const generated = await generatedAsset(result.data?.[0])
    if (!generated) throw Object.assign(new Error('The image service returned no usable logo preview.'), { status:502 })
    const verified = await validateExactImageEdit(prepared, generated)
    // The model may add surface texture, but the customer's normalized logo is
    // composited back on top so production never depends on generative text or
    // badge fidelity.
    const exactLogo = await compositeLogo(verified.bytes, logoBytes, field.previewRegion, { treatment })
    const clean = await sanitizeImagePrivacyMetadata(new Blob([exactLogo.bytes], { type:'image/png' }))
    const output = Buffer.from(await clean.arrayBuffer())
    const logo = await logoMetadata(logoBytes)
    const previewId = randomUUID()
    const path = `${listing.id}/${identityHash.slice(0,16)}/${previewId}.png`
    const { error:uploadError } = await client.storage.from('ai-previews').upload(path, output, { contentType:'image/png', cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('ai-previews').createSignedUrl(path, 60 * 60 * 24)
    if (signError || !signed?.signedUrl) throw signError || new Error('AI logo preview URL could not be created.')
    const { error:jobError } = await client.from('pod_ai_preview_jobs').insert({
      id:previewId,
      product_id:listing.id,
      session_hash:identityHash,
      storage_path:path,
      kind:'LOGO_AI_FINISH',
      source_asset_path:asset.path,
      metadata:{ fieldKey:field.key, treatment, exactLogoOverlay:true, lockedArtworkPreserved:true },
      prompt:`LOGO_AI_FINISH · ${field.key} · ${asset.path} · ${prompt}`,
      model,
      status:'COMPLETED'
    })
    if (jobError) throw jobError
    return sendJson(response, 200, {
      productId:listing.id,
      fieldKey:field.key,
      model,
      mode:'ai-logo-finish',
      treatment,
      imageUrl:signed.signedUrl,
      previewId,
      storage:{ bucket:'ai-previews', path },
      referenceUrl:reference.url,
      logo,
      direction:prompt,
      exactEdit:{ verified:true, exactLogoOverlay:true, protectedMeanDifference:verified.metrics.meanDifference, protectedChangedRatio:verified.metrics.changedRatio },
      expiresIn:86400
    })
  } catch (error) {
    return handleApiError(response, error, 'AI logo preview failed.')
  }
}
