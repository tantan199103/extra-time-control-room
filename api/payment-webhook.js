import { finalizePayment, getPaymentContext, markPaymentPending, paddleSignatureValid, verifyPayPalWebhook, verifyStripeWebhook } from './_checkout.js'
import { handleApiError, rawRequestBody, readBody, readRawRequestBody, safeText, sendJson, serverSupabase } from './_security.js'

// Vercel must leave the webhook payload untouched so Stripe's signed raw
// body can be verified. The hybrid Node runtime already forwards rawBody.
export const config = { api: { bodyParser: false } }

function stripeAmount(data, eventType) {
  const cents = eventType.startsWith('checkout.session.') ? data?.amount_total : (data?.amount_received ?? data?.amount)
  return cents == null ? null : Number(cents) / 100
}

function stripeCurrency(data) {
  return String(data?.currency || '').toUpperCase()
}

function eventOrderReference(provider, data) {
  if (provider !== 'STRIPE') return ''
  return safeText(data?.metadata?.order_public_id || data?.payment_intent_data?.metadata?.order_public_id || '', 120)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST payment webhooks only.' })
  try {
    const rawBody = await readRawRequestBody(request, 90000) || rawRequestBody(request)
    const parsedBody = readBody(request, 90000)
    const client = serverSupabase()
    const { settings } = await getPaymentContext(client, { requireReady: false })

    let body = parsedBody
    let provider = ''
    let verified = false
    const headers = request.headers || {}
    const stripeSignature = headers['stripe-signature'] || headers['Stripe-Signature']
    const paypalHeaders = headers['paypal-auth-algo'] && headers['paypal-transmission-id']
    if (stripeSignature) {
      if (!rawBody) return sendJson(response, 400, { error: 'Stripe webhook raw body is required for signature verification.' })
      const event = verifyStripeWebhook(rawBody, stripeSignature)
      if (!event) return sendJson(response, 401, { error: 'Stripe webhook signature could not be verified.' })
      body = event
      provider = 'STRIPE'
      verified = true
    } else {
      provider = paypalHeaders ? 'PAYPAL' : headers['paddle-signature'] ? 'PADDLE' : settings.provider
      if (provider === 'PAYPAL') verified = await verifyPayPalWebhook({ settings, request, event: body })
      if (provider === 'PADDLE') {
        if (!rawBody) return sendJson(response, 400, { error: 'Paddle webhook raw body is required for signature verification.' })
        verified = paddleSignatureValid(rawBody, headers['paddle-signature'])
      }
    }
    if (!verified) return sendJson(response, 401, { error: 'Webhook signature could not be verified.' })

    const eventId = safeText(body.id || headers['paddle-event-id'], 240)
    if (!eventId) return sendJson(response, 400, { error: 'Webhook event id is required.' })
    const eventType = safeText(body.type || body.event_type || body.eventType || '', 120)
    const data = body.data?.object || body.resource || body.data || {}
    const reference = eventOrderReference(provider, data)
    const providerOrderId = provider === 'STRIPE'
      ? safeText(data.id || data.checkout_session_id || '', 240)
      : safeText(data.supplementary_data?.related_ids?.order_id || data.supplementary_data?.related_ids?.transaction_id || data.id || data.transaction_id || data.custom_data?.providerOrderId || data.custom_data?.orderNumber, 240)

    let order = null
    if (provider === 'STRIPE' && reference) {
      const { data: byReference, error } = await client.from('pod_orders').select('id,order_number,status,payment_status,provider_order_id,provider_payment_id,payment_provider,currency,grand_total').eq('payment_provider', provider).eq('order_number', reference).limit(1)
      if (error) throw error
      order = byReference?.[0] || null
    }
    if (!order && providerOrderId) {
      const { data: byProviderId, error } = await client.from('pod_orders').select('id,order_number,status,payment_status,provider_order_id,provider_payment_id,payment_provider,currency,grand_total').eq('payment_provider', provider).eq('provider_order_id', providerOrderId).limit(1)
      if (error) throw error
      order = byProviderId?.[0] || null
    }
    // PaymentIntent and charge events carry the Checkout session's order
    // reference in metadata but not the session id. Resolve by the stored
    // provider payment id as a final fallback.
    if (!order && provider === 'STRIPE' && (data.id || data.payment_intent)) {
      const paymentIds = [data.payment_intent, data.id].filter(Boolean).map(value => String(value))
      const { data: byPaymentId, error } = await client.from('pod_orders').select('id,order_number,status,payment_status,provider_order_id,provider_payment_id,payment_provider,currency,grand_total').eq('payment_provider', provider).in('provider_payment_id', paymentIds).limit(1)
      if (error) throw error
      order = byPaymentId?.[0] || null
    }
    if (!order) return sendJson(response, 202, { received: true, matched: false })

    let paid = false
    let pending = false
    let failed = false
    let refunded = false
    let cancelled = false
    if (provider === 'STRIPE') {
      paid = eventType === 'checkout.session.async_payment_succeeded' || eventType === 'payment_intent.succeeded' || (eventType === 'checkout.session.completed' && data.payment_status === 'paid')
      pending = (eventType === 'checkout.session.completed' && data.payment_status !== 'paid') || ['checkout.session.async_payment_processing', 'payment_intent.processing'].includes(eventType)
      failed = ['checkout.session.async_payment_failed', 'payment_intent.payment_failed'].includes(eventType)
      cancelled = ['checkout.session.expired', 'payment_intent.canceled'].includes(eventType)
      refunded = eventType === 'charge.refunded'
      if (paid) {
        const amount = stripeAmount(data, eventType)
        const currency = stripeCurrency(data)
        if (amount == null || !currency || currency !== String(order.currency || '').toUpperCase() || Math.abs(amount - Number(order.grand_total)) > 0.01) {
          const { error: reviewError } = await client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: order.status, message: 'The Stripe webhook amount or currency did not match the checkout total. Fulfillment is blocked pending review.', metadata: { providerEventId: eventId, provider, eventType, capturedAmount: amount, capturedCurrency: currency, orderAmount: Number(order.grand_total), orderCurrency: order.currency }, visible_to_customer: true })
          if (reviewError && reviewError.code !== '23505') throw reviewError
          return sendJson(response, 200, { received: true, matched: true, reviewRequired: true, error: 'Provider payment does not match the order total.' })
        }
      }
    } else {
      paid = provider === 'PAYPAL' ? eventType === 'PAYMENT.CAPTURE.COMPLETED' : ['transaction.completed', 'transaction.paid'].includes(eventType)
      pending = provider === 'PAYPAL' ? eventType === 'PAYMENT.CAPTURE.PENDING' : ['transaction.payment_pending'].includes(eventType)
      failed = provider === 'PAYPAL' ? ['PAYMENT.CAPTURE.DENIED', 'CHECKOUT.PAYMENT-APPROVAL.REVERSED'].includes(eventType) : ['transaction.payment_failed', 'transaction.canceled'].includes(eventType)
      refunded = provider === 'PAYPAL' ? ['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(eventType) : ['transaction.refunded'].includes(eventType)
      if (paid && provider === 'PAYPAL') {
        const amount = data.amount || data.seller_receivable_breakdown?.gross_amount || data.purchase_units?.[0]?.payments?.captures?.[0]?.amount || null
        const capturedAmount = amount?.value == null ? null : Number(amount.value)
        const capturedCurrency = String(amount?.currency_code || '').toUpperCase()
        if (!capturedCurrency || capturedAmount == null || capturedCurrency !== String(order.currency || '').toUpperCase() || Math.abs(capturedAmount - Number(order.grand_total)) > 0.01) {
          const { error: reviewError } = await client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: order.status, message: 'The provider webhook amount or currency did not match the checkout total. Fulfillment is blocked pending review.', metadata: { providerEventId: eventId, provider, eventType, capturedAmount, capturedCurrency, orderAmount: Number(order.grand_total), orderCurrency: order.currency }, visible_to_customer: true })
          if (reviewError && reviewError.code !== '23505') throw reviewError
          return sendJson(response, 200, { received: true, matched: true, reviewRequired: true, error: 'Provider capture does not match the order total.' })
        }
      }
    }
    if (!paid && !pending && !failed && !refunded && !cancelled) return sendJson(response, 200, { received: true, ignored: true })
    const providerPaymentId = safeText(data.payment_intent || data.id || data.payment_id || '', 240)
    const result = pending
      ? await markPaymentPending(client, order.id, providerPaymentId, eventId, { provider, eventType })
      : await finalizePayment(client, order.id, refunded ? 'REFUNDED' : cancelled ? 'CANCELLED' : paid ? 'PAID' : 'FAILED', providerPaymentId, eventId, { provider, eventType })
    if (paid && result.payment_status !== 'PAID') {
      const { error: reviewError } = await client.from('pod_order_events').insert({ order_id: order.id, event_type: 'PAYMENT_REVIEW_REQUIRED', status: result.status, message: 'The provider reported a completed capture after the local reservation closed. Support must reconcile this payment before fulfillment.', metadata: { providerEventId: eventId, provider, eventType }, visible_to_customer: true })
      if (reviewError && reviewError.code !== '23505') throw reviewError
    }
    return sendJson(response, 200, { received: true, matched: true, status: result.status, paymentStatus: result.payment_status })
  } catch (error) {
    return handleApiError(response, error, 'Payment webhook could not be processed.')
  }
}
