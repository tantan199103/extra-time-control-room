import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { sanitizeImagePrivacyMetadata } from '../../src/lib/image-privacy.js'
import { artworkAssetExpired, malwareScan, checksum, extensionForMime } from '../../api/_artwork.js'

const MAX_ATTEMPTS = 3
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const JOB_TYPES = new Set(['generate', 'redesign', 'remix', 'inpaint', 'upscale', 'removeBackground', 'cleanup'])

const text = (value, max = 1200) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
const count = value => Math.max(1, Math.min(4, Math.trunc(Number(value) || 1)))

export function workerClient() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!/^https?:\/\//i.test(url) || !key) throw new Error('Supabase service credentials are required for the artwork worker.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function downloadAsset(client, row) {
  const { data, error } = await client.storage.from('customer-artwork').download(row.storage_key)
  if (error || !data) throw new Error('A source artwork asset could not be loaded.')
  const bytes = Buffer.from(await data.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('A source artwork asset is too large.')
  return { bytes, mime: row.mime || 'image/png' }
}

function basePrompt(job) {
  const style = text(job.style, 100)
  const prompt = text(job.prompt)
  const controls = job.params && typeof job.params === 'object' ? job.params : {}
  const palette = text(controls.palette, 40)
  const aspect = text(controls.aspect, 40)
  return [
    'Create a production-ready garment artwork on a transparent or clean background.',
    prompt || 'Create a bold sports-inspired artwork suitable for a printed garment.',
    style ? `Visual direction: ${style}.` : '', palette ? `Palette: ${palette}.` : '', aspect ? `Composition: ${aspect}.` : '',
    'Keep any user subject recognizable. Do not invent editable names, numbers or slogans; typography is added as separate text layers.',
    'Do not reproduce official team, league, sponsor or brand logos and do not claim affiliation.'
  ].filter(Boolean).join(' ')
}

async function moderateInput(prompt, sourceRows = [], sourceAssets = []) {
  const endpoint = String(process.env.AI_MODERATION_API_URL || '').trim()
  if (!endpoint) {
    if (String(process.env.ARTWORK_ALLOW_UNMODERATED || '').toLowerCase() === 'true' && process.env.NODE_ENV !== 'production') return
    throw Object.assign(new Error('Artwork moderation is not configured.'), { code: 'MODERATION_UNAVAILABLE' })
  }
  const input = [{ type: 'text', text: prompt }, ...sourceRows.map((row, index) => ({ type: 'image', assetId: row.id, data: sourceAssets[index] ? `data:${sourceAssets[index].mime};base64,${sourceAssets[index].bytes.toString('base64')}` : undefined }))]
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.AI_MODERATION_API_KEY ? { Authorization: `Bearer ${String(process.env.AI_MODERATION_API_KEY).trim()}` } : {}) }, body: JSON.stringify({ input }), signal: AbortSignal.timeout(40_000) }).catch(() => null)
  const result = await response?.json().catch(() => ({}))
  if (!response?.ok) throw Object.assign(new Error('Artwork moderation is temporarily unavailable.'), { code: 'MODERATION_UNAVAILABLE' })
  if (result.flagged === true || result.blocked === true || result.moderation?.flagged === true) throw Object.assign(new Error('This artwork direction was rejected by content moderation.'), { code: 'MODERATION_REJECTED' })
  if (result.flagged !== false && result.blocked !== false && result.moderation?.flagged == null && result.ok !== true) throw Object.assign(new Error('Artwork moderation returned an invalid result.'), { code: 'MODERATION_UNAVAILABLE' })
}

async function moderateOutput(bytes, mime, prompt) {
  const endpoint = String(process.env.AI_MODERATION_OUTPUT_URL || process.env.AI_MODERATION_API_URL || '').trim()
  if (!endpoint) {
    if (String(process.env.ARTWORK_ALLOW_UNMODERATED || '').toLowerCase() === 'true' && process.env.NODE_ENV !== 'production') return
    throw Object.assign(new Error('Artwork output moderation is not configured.'), { code: 'MODERATION_UNAVAILABLE' })
  }
  const input = `data:${mime};base64,${bytes.toString('base64')}`
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.AI_MODERATION_API_KEY ? { Authorization: `Bearer ${String(process.env.AI_MODERATION_API_KEY).trim()}` } : {}) }, body: JSON.stringify({ input: [{ type: 'text', text: prompt }, { type: 'image', data: input }] }), signal: AbortSignal.timeout(30_000) }).catch(() => null)
  const result = await response?.json().catch(() => ({}))
  if (!response?.ok) throw Object.assign(new Error('Artwork output moderation is temporarily unavailable.'), { code: 'MODERATION_UNAVAILABLE' })
  if (result.flagged === true || result.blocked === true || result.moderation?.flagged === true) throw Object.assign(new Error('The generated artwork was rejected by content moderation.'), { code: 'MODERATION_REJECTED' })
  if (result.flagged !== false && result.blocked !== false && result.moderation?.flagged == null && result.ok !== true) throw Object.assign(new Error('Artwork output moderation returned an invalid result.'), { code: 'MODERATION_UNAVAILABLE' })
}

function providerConfig() {
  const apiKey = String(process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw Object.assign(new Error('The image generation provider is not configured.'), { code: 'PROVIDER_UNAVAILABLE' })
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1').replace(/\/$/, '')
  return { apiKey, generationsUrl: String(process.env.AI_IMAGE_GENERATIONS_API_URL || `${base}/images/generations`).trim(), editsUrl: String(process.env.AI_IMAGE_EDITS_API_URL || process.env.AI_IMAGE_API_URL || `${base}/images/edits`).trim(), model: String(process.env.AI_IMAGE_MODEL || 'gpt-image-2').trim() }
}

async function requestImage(job, source) {
  const config = providerConfig()
  const prompt = basePrompt(job)
  if (source) {
    const form = new FormData()
    form.append('model', config.model)
    form.append('prompt', prompt)
    form.append('image[]', new Blob([source.bytes], { type: source.mime }), `source.${extensionForMime(source.mime)}`)
    form.append('output_format', 'png')
    if (job.params?.size) form.append('size', text(job.params.size, 30))
    const response = await fetch(config.editsUrl, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: AbortSignal.timeout(90_000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(new Error(text(result.error?.message || result.message || 'The image provider rejected the artwork job.', 400)), { code: response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REJECTED' })
    return { result, prompt }
  }
  const response = await fetch(config.generationsUrl, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, prompt, n: 1, output_format: 'png', ...(job.params?.size ? { size: text(job.params.size, 30) } : {}) }), signal: AbortSignal.timeout(90_000) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(text(result.error?.message || result.message || 'The image provider rejected the artwork job.', 400)), { code: response.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_REJECTED' })
  return { result, prompt }
}

async function generatedBytes(item) {
  if (item?.b64_json) return Buffer.from(String(item.b64_json), 'base64')
  const url = String(item?.url || '').trim()
  if (!/^https:\/\//i.test(url)) throw new Error('The image provider returned an invalid artwork URL.')
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('The generated artwork could not be downloaded.')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('The generated artwork is too large.')
  return bytes
}

async function normalizeGenerated(bytes) {
  let png
  try { png = await sharp(bytes, { failOn: 'error' }).rotate().png().toBuffer() } catch { throw new Error('The generated artwork is not a valid image.') }
  const clean = await sanitizeImagePrivacyMetadata(new Blob([png], { type: 'image/png' }))
  const output = Buffer.from(await clean.arrayBuffer())
  const metadata = await sharp(output).metadata()
  if (!metadata.width || !metadata.height || metadata.width > 16000 || metadata.height > 16000) throw new Error('The generated artwork dimensions are unsupported.')
  return { bytes: output, mime: 'image/png', widthPx: metadata.width, heightPx: metadata.height, dpi: Number(metadata.density) > 0 ? Number(metadata.density) : null, sha256: checksum(output) }
}

async function failJob(client, job, error) {
  const attempts = Number(job.attempts || 0)
  // These failures are tied to immutable input or policy and will not be
  // fixed by replaying the same job. Keep provider/moderation outages
  // retryable, but do not waste worker capacity on expired/unconsented input.
  const retryable = !['MODERATION_REJECTED', 'MALWARE_DETECTED', 'SOURCE_NOT_VERIFIED'].includes(error?.code) && attempts < Number(job.max_attempts || MAX_ATTEMPTS)
  const retryAfter = retryable ? new Date(Date.now() + Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.max(0, attempts - 1)))).toISOString() : null
  await client.from('pod_artwork_jobs').update({ status: 'failed', error: text(error?.message || 'Artwork job failed.', 500), retry_after: retryAfter, updated_at: new Date().toISOString(), worker_id: null, locked_at: null }).eq('id', job.id).eq('status', 'running')
  return { retryable, retryAfter }
}

export async function claimArtworkJob(client, workerId = `worker_${randomUUID()}`) {
  const now = new Date().toISOString()
  const { data: rows, error } = await client.from('pod_artwork_jobs').select('*').eq('status', 'queued').or(`retry_after.is.null,retry_after.lte.${now}`).order('created_at', { ascending: true }).limit(1)
  if (error) throw error
  const candidate = rows?.[0]
  if (!candidate) return null
  const attempts = Number(candidate.attempts || 0) + 1
  const { data: claimed, error: claimError } = await client.from('pod_artwork_jobs').update({ status: 'running', attempts, worker_id: workerId, locked_at: now, updated_at: now }).eq('id', candidate.id).eq('status', 'queued').select('*').maybeSingle()
  if (claimError) throw claimError
  return claimed || null
}

export async function processArtworkJob(client, job) {
  if (!job || !JOB_TYPES.has(job.type)) throw new Error('Unsupported artwork job type.')
  const sourceIds = Array.isArray(job.source_asset_ids) ? job.source_asset_ids : []
  let sources = []
  let sourceError = null
  if (sourceIds.length) {
    const result = await client.from('pod_artwork_assets').select('id, storage_key, mime, consent, verified, expires_at').in('id', sourceIds).eq('session_hash', job.session_hash)
    sources = result.data || []
    sourceError = result.error
  }
  if (sourceError) throw sourceError
  if (sources?.some(row => row.verified !== true || row.consent !== true || artworkAssetExpired(row.expires_at))) throw Object.assign(new Error('A source artwork asset is not verified, consented or is expired.'), { code: 'SOURCE_NOT_VERIFIED' })
  const variants = []
  const source = sources?.[0] ? await downloadAsset(client, sources[0]) : null
  await moderateInput(basePrompt(job), sources || [], source ? [source] : [])
  const requested = count(job.params?.variants)
  for (let index = 0; index < requested; index += 1) {
    const live = await client.from('pod_artwork_jobs').select('status').eq('id', job.id).maybeSingle()
    if (live.data?.status === 'cancelled') return { cancelled: true }
    const generated = await requestImage(job, source)
    const item = generated.result?.data?.[0]
    const bytes = await generatedBytes(item)
    const normalized = await normalizeGenerated(bytes)
    await malwareScan(normalized.bytes, normalized.mime)
    await moderateOutput(normalized.bytes, normalized.mime, generated.prompt)
    const assetId = `asset_${job.id}_${index}`
    const storageKey = `quick/${String(job.session_hash).slice(0, 24)}/${assetId}.png`
    const { error: uploadError } = await client.storage.from('customer-artwork').upload(storageKey, normalized.bytes, { contentType: normalized.mime, cacheControl: '3600', upsert: true })
    if (uploadError) throw uploadError
    const { error: assetError } = await client.from('pod_artwork_assets').upsert({ id: assetId, session_hash: job.session_hash, storage_key: storageKey, mime: normalized.mime, expected_mime: normalized.mime, expected_size: normalized.bytes.length, width_px: normalized.widthPx, height_px: normalized.heightPx, dpi: normalized.dpi, sha256: normalized.sha256, source: ['remix', 'redesign', 'inpaint'].includes(job.type) ? 'remix' : job.type === 'cleanup' || job.type === 'removeBackground' || job.type === 'upscale' ? 'cleanup' : 'ai-generated', consent: source ? sources.every(item => item.consent === true) : true, verified: true, scan_status: 'clean', verified_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), job_id: job.id, variant_index: index }, { onConflict: 'id' })
    if (assetError) throw assetError
    const { data: signed, error: signError } = await client.storage.from('customer-artwork').createSignedUrl(storageKey, 60 * 60 * 24)
    if (signError || !signed?.signedUrl) throw signError || new Error('A secure artwork preview URL could not be created.')
    variants.push({ id: `variant_${job.id}_${index}`, index, assetId, url: signed.signedUrl, status: 'verified', seed: Number(job.params?.seed || 0) + index, prompt: generated.prompt })
  }
  const { error: updateError } = await client.from('pod_artwork_jobs').update({ status: 'succeeded', variants, error: null, retry_after: null, updated_at: new Date().toISOString(), worker_id: null, locked_at: null }).eq('id', job.id).eq('status', 'running')
  if (updateError) throw updateError
  return { variants }
}

export async function processOne({ client = workerClient(), workerId = `worker_${randomUUID()}` } = {}) {
  const job = await claimArtworkJob(client, workerId)
  if (!job) return null
  try { return { jobId: job.id, ...(await processArtworkJob(client, job)) } } catch (error) { await failJob(client, job, error); return { jobId: job.id, failed: true, error: text(error?.message || 'Artwork job failed.', 500) } }
}

export async function runWorker({ client = workerClient(), intervalMs = Number(process.env.ARTWORK_WORKER_INTERVAL_MS || 2500) } = {}) {
  const workerId = `worker_${randomUUID()}`
  let stopping = false
  const stop = () => { stopping = true }
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  while (!stopping) {
    const result = await processOne({ client, workerId }).catch(error => ({ failed: true, error: text(error?.message || 'Worker poll failed.', 500) }))
    if (!result) await new Promise(resolve => setTimeout(resolve, Math.max(250, intervalMs)))
  }
}

if (process.argv[1] && process.argv[1].endsWith('artwork-worker.mjs')) runWorker().catch(error => { console.error(error); process.exitCode = 1 })
