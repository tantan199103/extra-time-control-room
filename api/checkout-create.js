import { hashToken, buildCheckoutQuote, createPayPalOrder, getPaymentContext, normalizeCheckoutLines, normalizeCustomer, normalizeShipping, orderNumber, quoteFingerprint, verifyQuoteToken } from './_checkout.js'
import { bestEffort, consumeQuota, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

function siteOrigin(request) {
  const configured = process.env.SITE_URL || process.env.VITE_SITE_URL || String(process.env.ALLOWED_ORIGINS || '').split(',')[0]
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol !== 'https:' && !/^localhost$|^127\.0\.0\.1$/.test(url.hostname)) throw new Error('insecure')
      return url.origin
    } catch {
      throw Object.assign(new Error('SITE_URL must be a valid HTTPS storefront origin.'), { status: 503 })
    }
  }
  // Local development can infer the Vite origin; production must configure a
  // canonical origin so provider redirects can never be built from an
  // attacker-controlled Host header.
  const host = request.headers?.['x-forwarded-host'] || request.headers?.host
  const proto = request.headers?.['x-forwarded-proto'] || 'http'
  if (host && (/^localhost(?::\d+)?$/.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host))) return `${proto}://${host}`
  throw Object.assign(new Error('SITE_URL is not configured for secure payment redirects.'), { status: 503 })
}

async function currentCustomer(request, client) {
  const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('Your customer session expired. Sign in again before checkout.'), { status: 401 })
  return data.user
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST checkout creation requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 70000)
    const client = serverSupabase()
    await consumeQuota(client, 'checkout-create', requestIdentity(request, 'checkout-create'))
    await bestEffort(client.rpc('pod_expire_pending_orders'))
    const customer = normalizeCustomer(body.customer || {})
    const shipping = normalizeShipping(body.shipping || {})
    const idempotencyKey = safeText(body.idempotencyKey, 180)
    if (!/^[a-zA-Z0-9_-]{16,180}$/.test(idempotencyKey)) throw Object.assign(new Error('Refresh checkout and try again with a valid order key.'), { status: 422 })
    const tokenSnapshot = verifyQuoteToken(body.quoteToken)
    const quote = await buildCheckoutQuote(request, { lines: body.lines, shipping }, client, { requireAddress: true })
    const expectedSnapshot = {
      version: 1,
      lines: quote.lines.map(line => ({ lineKey: line.lineKey, productId: line.productId, variantId: line.variantId, qty: line.qty, publicUnit: line.publicUnit, finalUnit: line.finalUnit, discount: line.discount })),
      shipping: { method: shipping.method, country: shipping.country, amount: quote.shipping.amount },
      currency: quote.currency,
      subtotal: quote.subtotal,
      publicSubtotal: quote.publicSubtotal,
      discount: quote.discount,
      tax: quote.tax,
      total: quote.total,
      member: quote.member,
      userId: tokenSnapshot.userId || null
    }
    if (quoteFingerprint(tokenSnapshot) !== quoteFingerprint({ ...expectedSnapshot, exp: tokenSnapshot.exp })) throw Object.assign(new Error('Prices or stock changed. Refresh the checkout quote.'), { status: 409 })
    const { settings } = await getPaymentContext(client)
    const user = await currentCustomer(request, client)
    if ((tokenSnapshot.userId || null) !== (user?.id || null)) throw Object.assign(new Error('Refresh the quote after signing in or out.'), { status: 409 })
    const rawTrackingToken = safeText(body.trackingToken, 180)
    if (!/^[a-zA-Z0-9_-]{40,180}$/.test(rawTrackingToken)) throw Object.assign(new Error('Refresh checkout to create a secure tracking token.'), { status: 422 })
    const orderNo = orderNumber()
    const sessionId = safeText(body.sessionId, 128)
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) throw Object.assign(new Error('Your checkout session is missing. Refresh the page and try again.'), { status: 422 })
    const lines = normalizeCheckoutLines(body.lines).map(line => {
      const quoted = quote.lines.find(item => item.lineKey === line.lineKey)
      return { ...line, finalUnit: quoted.finalUnit, publicUnit: quoted.publicUnit, discount: quoted.discount, sku: quoted.sku, productTitle: quoted.productTitle, productHandle: quoted.productHandle }
    })
    const payload = {
      orderNumber: orderNo,
      // Quota identity includes the network address, but order idempotency
      // must survive a mobile IP/proxy change while the shopper is returning
      // from the provider. Keep the order fingerprint tied to the browser
      // session only; never make duplicate protection depend on the IP.
      sessionHash: hashToken(sessionId),
      customerUserId: user?.id || '',
      customerEmail: customer.email,
      customerName: customer.name,
      shippingAddress: shipping,
      currency: quote.currency,
      paymentProvider: settings.provider,
      quoteHash: quoteFingerprint(expectedSnapshot),
      idempotencyKey,
      trackingTokenHash: hashToken(rawTrackingToken),
      memberPricing: quote.member,
      totals: { subtotal: quote.subtotal, publicSubtotal: quote.publicSubtotal, discount: quote.discount, shipping: quote.shipping.amount, tax: quote.tax, total: quote.total },
      lines,
      metadata: { shippingMethod: shipping.method, quoteExpiresAt: quote.expiresAt, paymentEnvironment: settings.environment }
    }
    const { data: created, error: createError } = await client.rpc('pod_create_pending_order', { payload })
    if (createError) throw createError
    const order = created || {}
    if (order.replayed) {
      if (order.tracking_token_hash && order.tracking_token_hash !== hashToken(rawTrackingToken)) throw Object.assign(new Error('Refresh checkout to continue with this order.'), { status: 409 })
      if (order.payment_status === 'PAID') {
        return sendJson(response, 200, { order: { publicId: order.order_number, token: rawTrackingToken, status: order.status, paymentStatus: order.payment_status, total: Number(order.grand_total), currency: order.currency }, provider: order.payment_provider, providerOrderId: order.provider_order_id || null, approvalUrl: null, paid: true, replayed: true })
      }
      if (['PAYMENT_FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(order.status)) throw Object.assign(new Error('This checkout attempt is closed. Start checkout again for a fresh stock reservation.'), { status: 409 })
      if (order.payment_provider === settings.provider && order.provider_order_id) {
        return sendJson(response, 200, { order: { publicId: order.order_number, token: rawTrackingToken, status: order.status, paymentStatus: order.payment_status, total: Number(order.grand_total), currency: order.currency }, provider: settings.provider, providerOrderId: order.provider_order_id, approvalUrl: order.metadata?.approvalUrl || null, replayed: true })
      }
    }
    let provider = { id: '', approvalUrl: '', checkoutUrl: '' }
    try {
      if (settings.provider === 'PAYPAL') {
        provider = await createPayPalOrder({ settings, total: quote.total, currency: quote.currency, orderNumber: orderNo, returnUrl: `${siteOrigin(request)}/checkout?payment=return&order=${encodeURIComponent(orderNo)}&tracking=${encodeURIComponent(rawTrackingToken)}`, cancelUrl: `${siteOrigin(request)}/checkout?payment=cancelled&order=${encodeURIComponent(orderNo)}&tracking=${encodeURIComponent(rawTrackingToken)}`, customer, shipping, lines: quote.lines })
      } else if (settings.provider === 'PADDLE') {
        throw Object.assign(new Error('Paddle checkout is unavailable for these physical products. Select PayPal in payment settings.'), { status: 501 })
      }
    } catch (providerError) {
      await bestEffort(client.rpc('pod_finalize_order_payment', { p_order_id: order.id, p_payment_state: 'FAILED', p_provider_payment_id: null, p_provider_event_id: `provider-create-${order.id}`, p_event_payload: { stage: 'PROVIDER_CREATE' } }))
      throw providerError
    }
    const { error: updateError } = await client.from('pod_orders').update({ provider_order_id: provider.id, metadata: { ...(order.metadata || {}), approvalUrl: provider.approvalUrl || provider.checkoutUrl || null } }).eq('id', order.id)
    if (updateError) {
      await bestEffort(client.rpc('pod_finalize_order_payment', { p_order_id: order.id, p_payment_state: 'FAILED', p_provider_payment_id: null, p_provider_event_id: `provider-link-${order.id}`, p_event_payload: { stage: 'PROVIDER_LINK' } }))
      throw updateError
    }
    return sendJson(response, 201, { order: { publicId: order.order_number, token: rawTrackingToken, status: order.status, paymentStatus: order.payment_status, total: Number(order.grand_total), currency: order.currency }, provider: settings.provider, providerOrderId: provider.id, approvalUrl: provider.approvalUrl || provider.checkoutUrl || null, replayed: false })
  } catch (error) {
    return handleApiError(response, error, 'Checkout could not be started.')
  }
}
