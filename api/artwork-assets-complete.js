import { artworkIdentity, ASSET_BUCKET, handleApiError, verifyUploadedArtwork, malwareScan } from './_artwork.js'
import { consumeQuota, enforceSameOrigin, readBody, safeText, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST artwork asset completion requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 20_000)
    const { identityHash } = artworkIdentity(request, body)
    const client = serverSupabase()
    await consumeQuota(client, 'artwork-asset-complete', identityHash)
    const id = safeText(body.id, 160)
    if (!/^asset_[A-Za-z0-9_-]{16,160}$/.test(id)) throw Object.assign(new Error('A valid artwork asset ID is required.'), { status: 422 })
    const claimedStorageKey = safeText(body.storageKey, 260)
    if (claimedStorageKey && !claimedStorageKey.startsWith(`quick/${identityHash.slice(0, 24)}/`)) throw Object.assign(new Error('The artwork upload does not belong to this session.'), { status: 403 })
    if (body.consent !== true) throw Object.assign(new Error('Confirm that you own or have permission to use the uploaded artwork.'), { status: 422 })
    const { data: row, error: rowError } = await client.from('pod_artwork_assets').select('*').eq('id', id).eq('session_hash', identityHash).maybeSingle()
    if (rowError) throw rowError
    if (!row) throw Object.assign(new Error('The artwork upload does not belong to this session.'), { status: 403 })
    const storageKey = String(row.storage_key || '')
    if (!storageKey.startsWith(`quick/${identityHash.slice(0, 24)}/`)) throw Object.assign(new Error('The artwork upload does not belong to this session.'), { status: 403 })
    if (row.verified === true) {
      const { data: signed, error: signError } = await client.storage.from(ASSET_BUCKET).createSignedUrl(row.storage_key, 60 * 60 * 24 * 7)
      if (signError || !signed?.signedUrl) throw signError || Object.assign(new Error('The verified artwork URL could not be created.'), { status: 503 })
      return sendJson(response, 200, { id, storageKey: row.storage_key, mime: row.mime, widthPx: row.width_px, heightPx: row.height_px, dpi: row.dpi, sha256: row.sha256, source: row.source, consent: row.consent === true, private: true, verified: true, url: signed.signedUrl, expiresIn: 604800, createdAt: row.created_at })
    }
    const verified = await verifyUploadedArtwork(client, row, { claimedSha256: body.sha256, claimedMime: body.mime, claimedSize: body.size })
    let scan
    try { scan = await malwareScan(verified.bytes, verified.mime) } catch (error) {
      await client.from('pod_artwork_assets').update({ scan_status: error?.code === 'MALWARE_DETECTED' ? 'infected' : 'failed', verified: false, error: safeText(error?.message, 240), updated_at: new Date().toISOString() }).eq('id', id).eq('session_hash', identityHash)
      throw error
    }
    const { error: uploadError } = await client.storage.from(ASSET_BUCKET).upload(row.storage_key, verified.bytes, { contentType: verified.mime, cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    const { data: updated, error: updateError } = await client.from('pod_artwork_assets').update({ mime: verified.mime, width_px: verified.widthPx, height_px: verified.heightPx, dpi: verified.dpi, sha256: verified.sha256, consent: true, verified: true, scan_status: scan.status === 'clean' ? 'clean' : 'skipped', scan_id: scan.scanId || null, verified_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString(), error: null }).eq('id', id).eq('session_hash', identityHash).select('*').single()
    if (updateError) throw updateError
    const { data: signed, error: signError } = await client.storage.from(ASSET_BUCKET).createSignedUrl(updated.storage_key, 60 * 60 * 24 * 7)
    if (signError || !signed?.signedUrl) throw signError || Object.assign(new Error('The verified artwork URL could not be created.'), { status: 503 })
    return sendJson(response, 200, { id: updated.id, storageKey: updated.storage_key, mime: updated.mime, widthPx: updated.width_px, heightPx: updated.height_px, dpi: updated.dpi, sha256: updated.sha256, source: updated.source, consent: true, private: true, verified: true, url: signed.signedUrl, expiresIn: 604800, createdAt: updated.created_at })
  } catch (error) { return handleApiError(response, error, 'The artwork upload could not be completed.') }
}
