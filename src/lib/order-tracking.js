import { apiFetch } from './api-client'

export async function trackOrder(publicId, token) {
  const response = await apiFetch('/api/order-track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId, token }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Order tracking is unavailable.')
  return result.order
}

export function statusLabel(status) {
  return String(status || 'PENDING_PAYMENT').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase())
}
