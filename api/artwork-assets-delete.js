import { artworkIdentity, ASSET_BUCKET, handleApiError } from './_artwork.js'
import { consumeQuota, enforceSameOrigin, readBody, safeText, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (!['POST', 'DELETE'].includes(request.method)) return sendJson(response, 405, { error: 'DELETE artwork asset requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 20_000)
    const { identityHash } = artworkIdentity(request, body)
    const client = serverSupabase()
    await consumeQuota(client, 'artwork-asset-delete', identityHash)
    const id = safeText(body.id || request.query?.id, 160)
    if (!/^asset_[A-Za-z0-9_-]{16,160}$/.test(id)) throw Object.assign(new Error('A valid artwork asset ID is required.'), { status: 422 })
    const { data: row, error: rowError } = await client.from('pod_artwork_assets').select('id, storage_key').eq('id', id).eq('session_hash', identityHash).maybeSingle()
    if (rowError) throw rowError
    if (!row) return sendJson(response, 404, { error: 'Artwork asset not found.' })
    const { error: removeError } = await client.storage.from(ASSET_BUCKET).remove([row.storage_key])
    if (removeError) throw removeError
    const { error: deleteError } = await client.from('pod_artwork_assets').delete().eq('id', id).eq('session_hash', identityHash)
    if (deleteError) throw deleteError
    return sendJson(response, 200, { deleted: true, id })
  } catch (error) { return handleApiError(response, error, 'The artwork asset could not be deleted.') }
}
