import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'

export const JOB_TYPES = new Set(['generate', 'redesign', 'remix', 'inpaint', 'upscale', 'removeBackground', 'cleanup'])
export const JOB_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const ASSET_SOURCES = new Set(['upload', 'ai-generated', 'remix', 'cleanup'])
export const MAX_ASSET_BYTES = 15 * 1024 * 1024
export const MAX_DIMENSION = 16000
export const ASSET_BUCKET = 'customer-artwork'

export function artworkIdentity(request, body = {}) {
  const sessionId = customerSession(body)
  return { sessionId, identityHash: requestIdentity(request, sessionId) }
}

export function validateAssetInput(body = {}) {
  const mime = safeText(body.mime, 80).toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw Object.assign(new Error('Only PNG, JPG or WebP artwork is supported.'), { status: 422 })
  const size = Number(body.size)
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ASSET_BYTES) throw Object.assign(new Error('Artwork must be between 1 byte and 15 MB.'), { status: 422 })
  return { mime, size }
}

export function checksum(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value || '')).digest('hex')
}

export function extensionForMime(mime) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
}

export function mimeForSharpFormat(format) {
  return ({ png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' })[String(format || '').toLowerCase()] || ''
}

export function normalizeSource(value, fallback = 'upload') {
  const source = safeText(value, 30).toLowerCase()
  return ASSET_SOURCES.has(source) ? source : fallback
}

/** Download the object again and validate bytes, not browser metadata. */
export async function verifyUploadedArtwork(client, row, { claimedSha256 = '', claimedMime = '', claimedSize = null } = {}) {
  if (!row || row.session_hash == null || !row.storage_key) throw Object.assign(new Error('The artwork upload could not be found.'), { status: 404 })
  const { data, error } = await client.storage.from(ASSET_BUCKET).download(row.storage_key)
  if (error || !data) throw Object.assign(new Error('The uploaded artwork could not be loaded.'), { status: 422 })
  const bytes = Buffer.from(await data.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) throw Object.assign(new Error('The uploaded artwork is too large.'), { status: 422 })
  if (claimedSize != null && Number(claimedSize) !== bytes.length) throw Object.assign(new Error('The uploaded artwork size does not match the secure upload.'), { status: 422 })
  if (row.expected_size != null && Number(row.expected_size) !== bytes.length) throw Object.assign(new Error('The uploaded artwork size does not match the secure upload.'), { status: 422 })
  const digest = checksum(bytes)
  if (claimedSha256 && !/^[a-f0-9]{64}$/i.test(String(claimedSha256))) throw Object.assign(new Error('The artwork checksum is invalid.'), { status: 422 })
  if (claimedSha256 && digest !== String(claimedSha256).toLowerCase()) throw Object.assign(new Error('The artwork checksum does not match the uploaded bytes.'), { status: 422 })
  if (row.sha256 && /^[a-f0-9]{64}$/i.test(String(row.sha256)) && digest !== String(row.sha256).toLowerCase()) throw Object.assign(new Error('The artwork checksum does not match the secure upload.'), { status: 422 })
  let metadata
  try { metadata = await sharp(bytes, { failOn: 'error' }).metadata() } catch { throw Object.assign(new Error('The selected artwork is not a valid image.'), { status: 422 }) }
  const actualMime = mimeForSharpFormat(metadata.format)
  const expectedMime = String(row.expected_mime || row.mime || claimedMime || '').toLowerCase()
  if (!actualMime || (expectedMime && actualMime !== expectedMime) || (claimedMime && actualMime !== String(claimedMime).toLowerCase())) throw Object.assign(new Error('The uploaded file type does not match its declared MIME type.'), { status: 422 })
  if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width < 2 || metadata.height < 2 || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) throw Object.assign(new Error('Artwork dimensions are outside the supported range.'), { status: 422 })
  let cleanBytes = bytes
  try {
    const clean = await sanitizeImagePrivacyMetadata(new Blob([bytes], { type: actualMime }))
    cleanBytes = Buffer.from(await clean.arrayBuffer())
  } catch { throw Object.assign(new Error('The artwork metadata could not be cleaned safely.'), { status: 422 }) }
  return { bytes: cleanBytes, originalBytes: bytes, mime: actualMime, widthPx: metadata.width, heightPx: metadata.height, dpi: Number(metadata.density) > 0 ? Number(metadata.density) : null, sha256: checksum(cleanBytes), originalSha256: digest }
}

/** Malware scan is mandatory in production. A local-only override is explicit. */
export async function malwareScan(bytes, mime, { signal } = {}) {
  const endpoint = String(process.env.ARTWORK_MALWARE_SCAN_URL || '').trim()
  if (!endpoint) {
    if (String(process.env.ARTWORK_ALLOW_UNSCANNED || '').toLowerCase() === 'true' && process.env.NODE_ENV !== 'production') return { status: 'skipped', scanner: 'development-override' }
    throw Object.assign(new Error('Artwork malware scanning is not configured.'), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' })
  }
  let url
  try { url = new URL(endpoint) } catch { throw Object.assign(new Error('Artwork malware scanner configuration is invalid.'), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' }) }
  if (!['https:', 'http:'].includes(url.protocol)) throw Object.assign(new Error('Artwork malware scanner configuration is invalid.'), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' })
  const payload = new FormData()
  payload.append('file', new Blob([bytes], { type: mime }), `artwork.${extensionForMime(mime)}`)
  let response
  try { response = await fetch(url, { method: 'POST', headers: process.env.ARTWORK_MALWARE_SCAN_TOKEN ? { Authorization: `Bearer ${String(process.env.ARTWORK_MALWARE_SCAN_TOKEN).trim()}` } : undefined, body: payload, signal: signal || AbortSignal.timeout(20_000) }) } catch { throw Object.assign(new Error('Artwork malware scanning is temporarily unavailable.'), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' }) }
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.clean !== true || result.infected === true) {
    if (result.infected === true || result.clean === false) throw Object.assign(new Error('The artwork file was rejected by malware scanning.'), { status: 422, code: 'MALWARE_DETECTED' })
    throw Object.assign(new Error('Artwork malware scanning is temporarily unavailable.'), { status: 503, code: 'MALWARE_SCAN_UNAVAILABLE' })
  }
  return { status: 'clean', scanner: url.hostname, scanId: safeText(result.id || result.scanId, 160) }
}

export async function protect(request, body, action) {
  enforceSameOrigin(request)
  const { identityHash } = artworkIdentity(request, body)
  const client = serverSupabase()
  await consumeQuota(client, action, identityHash)
  return { client, identityHash }
}

export function normalizeJobRow(row = {}) {
  return { id: String(row.id || ''), type: String(row.type || 'generate'), prompt: String(row.prompt || ''), style: String(row.style || ''), sourceAssetIds: Array.isArray(row.source_asset_ids) ? row.source_asset_ids : [], params: row.params && typeof row.params === 'object' ? row.params : {}, status: JOB_STATUSES.has(row.status) ? row.status : 'queued', variants: Array.isArray(row.variants) ? row.variants : [], error: String(row.error || ''), retryAfter: row.retry_after || null, attempts: Number(row.attempts || 0), createdAt: row.created_at, updatedAt: row.updated_at }
}

export async function findJob(client, id, identityHash) {
  const { data, error } = await client.from('pod_artwork_jobs').select('*').eq('id', id).eq('session_hash', identityHash).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Resolve a Quick AI artwork ID into the opaque storage reference used by a
 * 3D customization order. The browser may keep a signed preview URL, but it
 * must never be allowed to turn that URL (or arbitrary bytes) into an order
 * asset. Ownership, verification, consent, expiry and bucket path are all
 * checked against the requesting customer session here.
 */
export async function assertQuickArtworkAsset(client, assetId, identityHash) {
  const id = safeText(assetId, 160)
  if (!/^asset_[A-Za-z0-9_-]{16,160}$/.test(id)) {
    throw Object.assign(new Error('The Quick AI artwork asset ID is invalid.'), { status:422 })
  }
  const { data: row, error } = await client.from('pod_artwork_assets')
    .select('id,storage_key,mime,verified,consent,sha256,expires_at,source')
    .eq('id', id)
    .eq('session_hash', identityHash)
    .maybeSingle()
  if (error) throw error
  if (!row) throw Object.assign(new Error('The Quick AI artwork does not belong to this session.'), { status:422 })
  const expectedPrefix = `quick/${String(identityHash).slice(0, 24)}/`
  if (!String(row.storage_key || '').startsWith(expectedPrefix)) {
    throw Object.assign(new Error('The Quick AI artwork storage reference is invalid.'), { status:422 })
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(row.mime || '').toLowerCase())) {
    throw Object.assign(new Error('The Quick AI artwork file type is not supported.'), { status:422 })
  }
  if (row.verified !== true) throw Object.assign(new Error('The Quick AI artwork is not verified yet.'), { status:422 })
  if (row.consent !== true) throw Object.assign(new Error('Confirm that you own or have permission to use the Quick AI artwork.'), { status:422 })
  if (row.expires_at && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) <= Date.now()) {
    throw Object.assign(new Error('The Quick AI artwork has expired. Reopen the saved draft to generate a fresh asset.'), { status:422 })
  }
  return { bucket:ASSET_BUCKET, path:String(row.storage_key), assetId:row.id, sha256:row.sha256 || null, source:row.source || 'ai-generated' }
}

export function variantCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? Math.max(1, Math.min(4, Math.trunc(count))) : 1
}

export function assertId(value, label = 'ID') {
  const id = safeText(value, 160)
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw Object.assign(new Error(`Invalid ${label}.`), { status: 400 })
  return id
}

export function mockArtworkVariants(prompt = '', style = '', count = 4) {
  const safeCount = variantCount(count)
  return Array.from({ length: safeCount }, (_, i) => ({
    id: `mock-var-${i + 1}`,
    index: i,
    status: 'preview-only',
    assetId: null,
    previewUrl: '',
    prompt: safeText(prompt, 500),
    style: safeText(style, 60)
  }))
}

export { handleApiError, readBody, safeText, sendJson }
