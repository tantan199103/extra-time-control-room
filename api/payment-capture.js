import { capturePayPalOrder, finalizePayment, getPaymentContext, hashToken, markPaymentPending } from './_checkout.js'
import { bestEffort, consumeQuota, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST payment capture requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12000)
    const client = serverSupabase()
    await consumeQuota(client, 'payment-capture', requestIdentity(request, 'payment-capture'))
    const publicId = safeText(body.publicId, 80)
    const token = safeText(body.token, 180)
    const providerOrderId = safeText(body.providerOrderId, 240)
    if (!publicId || !token || !providerOrderId) throw Object.assign(new Error('The payment return is missing its secure order token.'), { status: 422 })
    await bestEffort(client.rpc('pod_expire_pending_orders'))
    const { data: order, error: orderError } = await client.from('pod_orders').select('id,order_number,tracking_token_hash,payment_provider,provider_order_id,status,payment_status,currency,grand_total,metadata').eq('order_number', publicId).maybeSingle()
    if (orderError) throw orderError
    if (!order || order.tracking_token_hash !== hashToken(token) || order.provider_order_id !== providerOrderId) throw Object.assign(new Error('That payment return cannot be matched to the order.'), { status: 403 })
    if (order.payment_status === 'PAID') return sendJson(response, 200, { paid: true, order: { publicId: order.order_number, token, status: order.status, paymentStatus: order.payment_status } })
    if (order.status !== 'PENDING_PAYMENT') throw Object.assign(new Error('This checkout reservation is closed. PayPal was not captured; start a new checkout from your bag.'), { status: 409 })
    const { settings } = await getPaymentContext(client, { requireReady: false })
    if (order.payment_provider !== 'PAYPAL') throw Object.assign(new Error('This order uses a different payment provider.'), { status: 409 })
    const orderSettings = { ...settings, provider: 'PAYPAL', environment: order.metadata?.paymentEnvironment || settings.environment }
    let capture
    try {
      capture = await capturePayPalOrder({ settings: orderSettings, providerOrderId })
    } catch (captureError) {
      // A timeout or provider 5xx can happen after PayPal has accepted the
      // capture. Keep the order pending for webhook reconciliation and never
      // encourage the shopper to pay a second time.
      await bestEffort(client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: order.status, message: 'The payment provider response was inconclusive. Support will reconcile the capture before fulfillment.', metadata: { provider: 'PAYPAL', stage: 'CAPTURE_RESPONSE', reason: safeText(captureError?.message, 240) }, visible_to_customer: true }))
      return sendJson(response, 502, { paid: false, reviewRequired: true, error: 'The payment provider response is inconclusive. Do not pay again; your order will be reconciled from the provider confirmation.' })
    }
    if (capture.pending) {
      const pending = await markPaymentPending(client, order.id, capture.paymentId, `capture-pending-${providerOrderId}`, { provider: 'PAYPAL', status: capture.captureStatus || 'PENDING' })
      return sendJson(response, 202, { paid: false, pending: true, order: { publicId: pending.order_number, token, status: pending.status, paymentStatus: pending.payment_status } })
    }
    if (!capture.paid) {
      await finalizePayment(client, order.id, 'FAILED', capture.paymentId, `capture-${providerOrderId}`, { provider: 'PAYPAL', status: capture.raw?.status || 'UNKNOWN' })
      return sendJson(response, 402, { paid: false, error: 'PayPal did not confirm the payment.' })
    }
    const captureAmountMismatch = !capture.currency || capture.amount == null || capture.currency !== String(order.currency || '').toUpperCase() || Math.abs(Number(capture.amount) - Number(order.grand_total)) > 0.01
    if (captureAmountMismatch) {
      await bestEffort(client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: order.status, message: 'The provider capture amount or currency did not match the checkout total. Fulfillment is blocked pending review.', metadata: { provider: 'PAYPAL', stage: 'CAPTURE_AMOUNT_MISMATCH', captureAmount: capture.amount, captureCurrency: capture.currency, orderAmount: Number(order.grand_total), orderCurrency: order.currency }, visible_to_customer: true }))
      return sendJson(response, 409, { paid: false, reviewRequired: true, error: 'The captured payment does not match the order total. Contact support with your order number before trying again.' })
    }
    const finalized = await finalizePayment(client, order.id, 'PAID', capture.paymentId, `capture-${providerOrderId}`, { provider: 'PAYPAL', status: 'COMPLETED' })
    if (finalized.payment_status !== 'PAID') {
      // A provider can capture after a shopper's pending reservation has been
      // expired (for example, a delayed browser return). Never tell the
      // shopper this is a paid order when our inventory transaction did not
      // confirm it. Route it to support/reconciliation instead.
      return sendJson(response, 409, { paid: false, reviewRequired: true, error: 'Payment was captured, but the reservation could not be confirmed. Please contact support with your order number.' })
    }
    return sendJson(response, 200, { paid: true, order: { publicId: finalized.order_number, token, status: finalized.status, paymentStatus: finalized.payment_status } })
  } catch (error) {
    return handleApiError(response, error, 'Payment could not be confirmed.')
  }
}
