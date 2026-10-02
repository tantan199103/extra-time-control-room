import { randomUUID } from 'node:crypto'
import { artworkIdentity, ASSET_BUCKET, handleApiError, validateAssetInput } from './_artwork.js'
import { consumeQuota, enforceSameOrigin, readBody, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST artwork asset presign requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 20_000)
    const { sessionId, identityHash } = artworkIdentity(request, body)
    const client = serverSupabase()
    await consumeQuota(client, 'artwork-asset-presign', identityHash)
    const { mime, size } = validateAssetInput(body)
    const id = `asset_${randomUUID().replace(/-/g, '')}`
    const storageKey = `quick/${identityHash.slice(0, 24)}/${id}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`
    const { data: signed, error: signError } = await client.storage.from(ASSET_BUCKET).createSignedUploadUrl(storageKey)
    if (signError || !signed?.signedUrl || !signed?.token) throw signError || Object.assign(new Error('A secure artwork upload URL could not be created.'), { status: 503 })
    const { error: recordError } = await client.from('pod_artwork_assets').insert({ id, session_hash: identityHash, storage_key: storageKey, expected_mime: mime, expected_size: size, mime, source: 'upload', consent: false, verified: false, scan_status: 'pending' })
    if (recordError) {
      await client.storage.from(ASSET_BUCKET).remove([storageKey]).catch(() => {})
      throw recordError
    }
    return sendJson(response, 201, { id, storageKey, uploadUrl: signed.signedUrl, token: signed.token, bucket: ASSET_BUCKET, expiresIn: 600, mime, size, sessionId })
  } catch (error) { return handleApiError(response, error, 'The secure artwork upload could not be prepared.') }
}
