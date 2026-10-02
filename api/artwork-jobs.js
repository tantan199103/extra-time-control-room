import { randomUUID } from 'node:crypto'
import { artworkAssetExpired, artworkIdentity, assertId, findJob, handleApiError, JOB_TYPES, normalizeJobRow, protect, readBody, safeText, sendJson, variantCount } from './_artwork.js'

const MAX_ATTEMPTS = 3

function boundedParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowed = ['aspect', 'palette', 'colorCount', 'strength', 'preserveSubject', 'preserveText', 'variants', 'seed', 'size', 'quality']
  const result = {}
  for (const key of allowed) {
    if (!(key in value)) continue
    const raw = value[key]
    if (typeof raw === 'string') result[key] = safeText(raw, 80)
    else if (typeof raw === 'boolean') result[key] = raw
    else if (Number.isFinite(Number(raw))) result[key] = Math.max(-100000, Math.min(100000, Number(raw)))
  }
  return result
}

async function ownedSourceAssets(client, ids, identityHash) {
  if (!ids.length) return []
  const { data, error } = await client.from('pod_artwork_assets').select('id, verified, consent, storage_key, mime, width_px, height_px, dpi, source, expires_at').in('id', ids).eq('session_hash', identityHash).eq('verified', true)
  if (error) throw error
  const byId = new Map((data || []).map(item => [item.id, item]))
  const rows = ids.map(id => byId.get(id)).filter(Boolean)
  if (rows.length !== ids.length || rows.some(row => !row.verified)) throw Object.assign(new Error('One or more reference assets are not verified for this session.'), { status: 422 })
  if (rows.some(row => row.consent !== true)) throw Object.assign(new Error('Confirm that you own or have permission to use every reference image.'), { status: 422 })
  if (rows.some(row => artworkAssetExpired(row.expires_at))) throw Object.assign(new Error('One or more reference assets have expired. Upload them again before generating artwork.'), { status: 422 })
  return rows
}

async function getExistingByKey(client, key, identityHash) {
  if (!key) return null
  const { data, error } = await client.from('pod_artwork_jobs').select('*').eq('idempotency_key', key).eq('session_hash', identityHash).maybeSingle()
  if (error && error.code !== '42703') throw error
  return data || null
}

export default async function handler(request, response) {
  try {
    const action = safeText(request.query?.action, 20).toLowerCase()
    if (request.method === 'GET') {
      const id = assertId(request.query?.id, 'artwork job ID')
      const { client, identityHash } = await protect(request, { sessionId: safeText(request.query?.sessionId, 128) }, 'artwork-job-status')
      const row = await findJob(client, id, identityHash)
      if (!row) return sendJson(response, 404, { error: 'Artwork job not found.' })
      return sendJson(response, 200, normalizeJobRow(row))
    }
    if (request.method !== 'POST' && request.method !== 'DELETE') return sendJson(response, 405, { error: 'Artwork jobs accept POST or GET.' })
    const body = readBody(request, 60_000)
    const { client, identityHash } = await protect(request, body, 'artwork-jobs')
    const id = safeText(request.query?.id || body.id, 160)
    if (action === 'cancel' || request.method === 'DELETE') {
      const jobId = assertId(id, 'artwork job ID')
      const existing = await findJob(client, jobId, identityHash)
      if (!existing) return sendJson(response, 404, { error: 'Artwork job not found.' })
      if (['succeeded', 'failed', 'cancelled'].includes(existing.status)) return sendJson(response, 409, { error: 'This artwork job can no longer be cancelled.', job: normalizeJobRow(existing) })
      const { data, error } = await client.from('pod_artwork_jobs').update({ status: 'cancelled', error: null, updated_at: new Date().toISOString() }).eq('id', jobId).eq('session_hash', identityHash).in('status', ['queued', 'running']).select('*').single()
      if (error) throw error
      return sendJson(response, 200, normalizeJobRow(data))
    }
    if (action === 'retry') {
      const jobId = assertId(id, 'artwork job ID')
      const existing = await findJob(client, jobId, identityHash)
      if (!existing) return sendJson(response, 404, { error: 'Artwork job not found.' })
      if (existing.status !== 'failed') return sendJson(response, 409, { error: 'Only failed artwork jobs can be retried.', job: normalizeJobRow(existing) })
      const attempts = Number(existing.attempts || 0)
      if (attempts >= MAX_ATTEMPTS) return sendJson(response, 429, { error: 'This artwork job has reached its retry limit.', retryAfter: existing.retry_after || null })
      const { data, error } = await client.from('pod_artwork_jobs').update({ status: 'queued', error: null, retry_after: null, attempts: attempts + 1, updated_at: new Date().toISOString() }).eq('id', jobId).eq('session_hash', identityHash).eq('status', 'failed').select('*').single()
      if (error) throw error
      return sendJson(response, 202, normalizeJobRow(data))
    }
    const type = safeText(body.type, 40)
    if (!JOB_TYPES.has(type)) throw Object.assign(new Error('Unsupported artwork job type.'), { status: 422 })
    const prompt = safeText(body.prompt, 1200)
    const sourceAssetIds = Array.isArray(body.sourceAssetIds) ? [...new Set(body.sourceAssetIds.map(value => safeText(value, 160)).filter(Boolean))].slice(0, 4) : []
    if (!prompt && !sourceAssetIds.length) throw Object.assign(new Error('A prompt or reference asset is required.'), { status: 422 })
    if (['redesign', 'remix', 'inpaint', 'upscale', 'removeBackground', 'cleanup'].includes(type) && !sourceAssetIds.length) throw Object.assign(new Error(`${type} requires a verified source asset.`), { status: 422 })
    await ownedSourceAssets(client, sourceAssetIds, identityHash)
    const params = boundedParams(body.params)
    const variants = variantCount(body.variants || params.variants)
    const idempotencyKey = safeText(body.idempotencyKey, 180)
    if (idempotencyKey) {
      const existing = await getExistingByKey(client, idempotencyKey, identityHash)
      if (existing) return sendJson(response, 200, { ...normalizeJobRow(existing), replayed: true })
    }
    const job = { id: `job_${randomUUID().replace(/-/g, '')}`, idempotency_key: idempotencyKey || `job_${randomUUID().replace(/-/g, '')}`, session_hash: identityHash, type, prompt, style: safeText(body.style, 80), source_asset_ids: sourceAssetIds, params: { ...params, variants }, status: 'queued', variants: [], error: null, retry_after: null, attempts: 0 }
    const { data, error } = await client.from('pod_artwork_jobs').insert(job).select('*').single()
    if (error?.code === '23505' && idempotencyKey) {
      const existing = await getExistingByKey(client, idempotencyKey, identityHash)
      if (existing) return sendJson(response, 200, { ...normalizeJobRow(existing), replayed: true })
    }
    if (error) throw error
    return sendJson(response, 202, normalizeJobRow(data))
  } catch (error) { return handleApiError(response, error, 'The artwork job could not be created.') }
}
