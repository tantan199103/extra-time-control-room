import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, sendJson, serverSupabase } from './_security.js'
import { compositeLogo, logoMetadata } from './_logo-composite.js'
import { assertCustomerAsset, downloadStorageAsset, fetchListingImage, logoField, publishedListing } from './_logo-request.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST logo preview requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12000)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'logo-preview', identityHash)

    const productId = String(body.productId || '').trim().slice(0, 160)
    const listing = await publishedListing(client, productId)
    if (!listing) throw Object.assign(new Error('This listing is no longer published.'), { status:404 })
    const field = logoField(listing, body.fieldKey)
    const asset = assertCustomerAsset(listing.id, identityHash, body.assetRef, { kind:'logo' })
    const [reference, logoBytes] = await Promise.all([fetchListingImage(request, listing), downloadStorageAsset(client, asset)])
    const logo = await logoMetadata(logoBytes)
    const composite = await compositeLogo(reference.bytes, logoBytes, field.previewRegion, { treatment:field.logoTreatment })
    const cleaned = await sanitizeImagePrivacyMetadata(new Blob([composite.bytes], { type:'image/png' }))
    const output = Buffer.from(await cleaned.arrayBuffer())
    const previewId = randomUUID()
    const path = `${listing.id}/${identityHash.slice(0,16)}/${previewId}.png`
    const { error:uploadError } = await client.storage.from('ai-previews').upload(path, output, { contentType:'image/png', cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('ai-previews').createSignedUrl(path, 60 * 60 * 24)
    if (signError || !signed?.signedUrl) throw signError || new Error('Logo preview URL could not be created.')
    const { error:jobError } = await client.from('pod_ai_preview_jobs').insert({
      id:previewId,
      product_id:listing.id,
      session_hash:identityHash,
      storage_path:path,
      kind:'LOGO_EXACT',
      source_asset_path:asset.path,
      metadata:{ fieldKey:field.key, treatment:'EXACT', lockedArtworkPreserved:true },
      prompt:`LOGO_EXACT · ${field.key} · ${asset.path} · Exact customer logo placement in the approved ${field.label || field.key} area.`,
      model:'deterministic-logo-composite',
      status:'COMPLETED'
    })
    if (jobError) throw jobError
    return sendJson(response, 200, {
      productId:listing.id,
      fieldKey:field.key,
      model:'deterministic-logo-composite',
      mode:'exact-logo-composite',
      imageUrl:signed.signedUrl,
      previewId,
      storage:{ bucket:'ai-previews', path },
      referenceUrl:reference.url,
      logo,
      exactEdit:{ verified:true, lockedArtworkPreserved:true },
      expiresIn:86400
    })
  } catch (error) {
    return handleApiError(response, error, 'Logo preview failed.')
  }
}
