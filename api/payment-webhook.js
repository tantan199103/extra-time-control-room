import { finalizePayment, getPaymentContext, markPaymentPending, verifyPayPalWebhook, paddleSignatureValid } from './_checkout.js'
import { handleApiError, rawRequestBody, readBody, safeText, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST payment webhooks only.' })
  try {
    const rawBody = rawRequestBody(request)
    const body = readBody(request, 90000)
    const client = serverSupabase()
    const { settings } = await getPaymentContext(client, { requireReady: false })
    let verified = false
    const paypalHeaders = request.headers?.['paypal-auth-algo'] && request.headers?.['paypal-transmission-id']
    let provider = paypalHeaders ? 'PAYPAL' : request.headers?.['paddle-signature'] ? 'PADDLE' : settings.provider
    if (provider === 'PAYPAL') verified = await verifyPayPalWebhook({ settings, request, event: body })
    if (provider === 'PADDLE') {
      if (!rawBody) return sendJson(response, 400, { error: 'Paddle webhook raw body is required for signature verification.' })
      verified = paddleSignatureValid(rawBody, request.headers?.['paddle-signature'])
    }
    if (!verified) return sendJson(response, 401, { error: 'Webhook signature could not be verified.' })
    const eventId = safeText(body.id || request.headers?.['paddle-event-id'], 240)
    if (!eventId) return sendJson(response, 400, { error: 'Webhook event id is required.' })
    const eventType = safeText(body.event_type || body.eventType || '', 120)
    const data = body.resource || body.data || {}
    const providerOrderId = safeText(data.supplementary_data?.related_ids?.order_id || data.supplementary_data?.related_ids?.transaction_id || data.id || data.transaction_id || data.custom_data?.providerOrderId || data.custom_data?.orderNumber, 240)
    let orderQuery = client.from('pod_orders').select('id,order_number,status,payment_status,provider_order_id,payment_provider,currency,grand_total').limit(1)
    orderQuery = orderQuery.eq('payment_provider', provider).eq('provider_order_id', providerOrderId)
    const { data: orders, error: orderError } = await orderQuery
    if (orderError) throw orderError
    const order = orders?.[0]
    if (!order) return sendJson(response, 202, { received: true, matched: false })
    // A completed checkout order is not proof that the capture settled.  Only
    // a completed capture (or the provider's equivalent transaction event) can
    // consume inventory and move an order to CONFIRMED.
    const paid = provider === 'PAYPAL' ? eventType === 'PAYMENT.CAPTURE.COMPLETED' : ['transaction.completed', 'transaction.paid'].includes(eventType)
    const pending = provider === 'PAYPAL' ? eventType === 'PAYMENT.CAPTURE.PENDING' : ['transaction.payment_pending'].includes(eventType)
    const failed = provider === 'PAYPAL' ? ['PAYMENT.CAPTURE.DENIED', 'CHECKOUT.PAYMENT-APPROVAL.REVERSED'].includes(eventType) : ['transaction.payment_failed', 'transaction.canceled'].includes(eventType)
    const refunded = provider === 'PAYPAL' ? ['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(eventType) : ['transaction.refunded'].includes(eventType)
    if (!paid && !pending && !failed && !refunded) return sendJson(response, 200, { received: true, ignored: true })
    if (paid && provider === 'PAYPAL') {
      const amount = data.amount || data.seller_receivable_breakdown?.gross_amount || data.purchase_units?.[0]?.payments?.captures?.[0]?.amount || null
      const capturedAmount = amount?.value == null ? null : Number(amount.value)
      const capturedCurrency = String(amount?.currency_code || '').toUpperCase()
      if (!capturedCurrency || capturedAmount == null || capturedCurrency !== String(order.currency || '').toUpperCase() || Math.abs(capturedAmount - Number(order.grand_total)) > 0.01) {
        const { error: reviewError } = await client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: order.status, message: 'The provider webhook amount or currency did not match the checkout total. Fulfillment is blocked pending review.', metadata: { providerEventId: eventId, provider, eventType, capturedAmount, capturedCurrency, orderAmount: Number(order.grand_total), orderCurrency: order.currency }, visible_to_customer: true })
        if (reviewError && reviewError.code !== '23505') throw reviewError
        // The event was authenticated and recorded. A 2xx stops provider
        // retries while the order remains blocked for manual reconciliation.
        return sendJson(response, 200, { received: true, matched: true, reviewRequired: true, error: 'Provider capture does not match the order total.' })
      }
    }
    const result = pending
      ? await markPaymentPending(client, order.id, data.id || data.payment_id || '', eventId, { provider, eventType })
      : await finalizePayment(client, order.id, refunded ? 'REFUNDED' : paid ? 'PAID' : 'FAILED', data.id || data.payment_id || '', eventId, { provider, eventType })
    if (paid && result.payment_status !== 'PAID') {
      const { error: reviewError } = await client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: result.status, message: 'The provider reported a completed capture after the local reservation closed. Support must reconcile this payment before fulfillment.', metadata: { providerEventId: eventId, provider, eventType }, visible_to_customer: true })
      if (reviewError && reviewError.code !== '23505') throw reviewError
    }
    return sendJson(response, 200, { received: true, matched: true, status: result.status, paymentStatus: result.payment_status })
  } catch (error) {
    return handleApiError(response, error, 'Payment webhook could not be processed.')
  }
}
