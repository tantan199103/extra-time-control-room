import { finalizePayment, hashToken } from './_checkout.js'
import { consumeQuota, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

// PayPal sends the shopper back to the cancel URL without a payment capture.
// Record that cancellation server-side so the reservation is released now,
// rather than waiting for the 30-minute expiry job.
export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST payment cancellation requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12000)
    const client = serverSupabase()
    await consumeQuota(client, 'payment-cancel', requestIdentity(request, 'payment-cancel'))
    const publicId = safeText(body.publicId, 80)
    const token = safeText(body.token, 180)
    const providerOrderId = safeText(body.providerOrderId, 240)
    if (!publicId || !token) throw Object.assign(new Error('The payment cancellation is missing its secure order token.'), { status: 422 })
    const { data: order, error: orderError } = await client.from('pod_orders')
      .select('id,order_number,tracking_token_hash,payment_provider,provider_order_id,status,payment_status')
      .eq('order_number', publicId)
      .maybeSingle()
    if (orderError) throw orderError
    if (!order || order.tracking_token_hash !== hashToken(token) || (providerOrderId && order.provider_order_id !== providerOrderId)) {
      throw Object.assign(new Error('That payment cancellation cannot be matched to the order.'), { status: 403 })
    }
    if (order.payment_status === 'PAID') {
      return sendJson(response, 200, { cancelled: false, paid: true, order: { publicId: order.order_number, status: order.status, paymentStatus: order.payment_status } })
    }
    if (order.status !== 'PENDING_PAYMENT') {
      return sendJson(response, 200, { cancelled: order.status === 'CANCELLED', paid: false, order: { publicId: order.order_number, status: order.status, paymentStatus: order.payment_status } })
    }
    const finalized = await finalizePayment(client, order.id, 'CANCELLED', null, providerOrderId ? `cancel-${providerOrderId}` : `cancel-${order.id}`, { stage: 'SHOPPER_CANCELLED', provider: order.payment_provider })
    return sendJson(response, 200, { cancelled: true, paid: false, order: { publicId: finalized.order_number, status: finalized.status, paymentStatus: finalized.payment_status } })
  } catch (error) {
    return handleApiError(response, error, 'Payment cancellation could not be recorded.')
  }
}
