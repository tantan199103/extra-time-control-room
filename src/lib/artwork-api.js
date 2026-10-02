import { apiFetch } from './api-client'
import { getCustomerSessionId } from './storefront-api'
import { normalizeArtworkAsset, normalizeArtworkJob } from './quick-artwork-schema'

const json = async response => {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Artwork service is unavailable.')
  return body
}

export async function createArtworkJob(payload) {
  const response = await apiFetch('/api/artwork-jobs', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  return normalizeArtworkJob(await json(response))
}

export async function getArtworkJob(id) {
  const response = await apiFetch(`/api/artwork-jobs?id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(getCustomerSessionId())}`)
  return normalizeArtworkJob(await json(response))
}

export async function retryArtworkJob(id) {
  const response = await apiFetch(`/api/artwork-jobs?id=${encodeURIComponent(id)}&action=retry`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ sessionId:getCustomerSessionId() }) })
  return normalizeArtworkJob(await json(response))
}

export async function cancelArtworkJob(id) {
  const response = await apiFetch(`/api/artwork-jobs?id=${encodeURIComponent(id)}&action=cancel`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ sessionId:getCustomerSessionId() }) })
  return normalizeArtworkJob(await json(response))
}

export async function completeArtworkAsset(payload) {
  const response = await apiFetch('/api/artwork-assets-complete', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  return normalizeArtworkAsset(await json(response))
}

export async function presignArtworkAsset(payload) {
  const response = await apiFetch('/api/artwork-assets-presign', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  return await json(response)
}

export async function preflightArtwork(payload) {
  const response = await apiFetch('/api/artwork-preflight', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  return await json(response)
}

export async function createQuickOrder(payload) {
  const response = await apiFetch('/api/quick-customization-order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  return await json(response)
}
