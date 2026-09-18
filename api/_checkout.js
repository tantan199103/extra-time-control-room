import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { safeText, serverSupabase } from './_security.js'
import { normalizePaymentSettings, paymentServerReadiness } from '../src/lib/payment-config.js'
import { quoteCart } from './_membership.js'

const MAX_LINES = 100
const QUOTE_TTL_MS = 15 * 60 * 1000
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export const SHIPPING_METHODS = Object.freeze({
  STANDARD: { code: 'STANDARD', label: 'Standard tracked', amount: 8, eta: '5–8 business days' },
  EXPRESS: { code: 'EXPRESS', label: 'Express tracked', amount: 18, eta: '2–4 business days' }
})

export function hashToken(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

function signingSecret() {
  const secret = process.env.CHECKOUT_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw Object.assign(new Error('Checkout signing is not configured.'), { status: 503 })
  return secret
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sign(value) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url')
}

export function issueQuoteToken(snapshot) {
  const payload = Buffer.from(JSON.stringify({ ...snapshot, exp: Date.now() + QUOTE_TTL_MS }), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyQuoteToken(token) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) throw Object.assign(new Error('The checkout quote is missing or expired. Refresh the quote.'), { status: 409 })
  const expected = sign(payload)
  const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  if (!valid) throw Object.assign(new Error('The checkout quote is no longer valid. Refresh the quote.'), { status: 409 })
  let decoded
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { throw Object.assign(new Error('The checkout quote is invalid. Refresh the quote.'), { status: 409 }) }
  if (!decoded?.exp || Number(decoded.exp) <= Date.now()) throw Object.assign(new Error('The checkout quote expired. Refresh the quote.'), { status: 409 })
  return decoded
}

export function normalizeCheckoutLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw Object.assign(new Error('Your bag is empty.'), { status: 422 })
  const result = lines.slice(0, MAX_LINES).map((line, index) => {
    const productId = safeText(line?.productId, 160)
    const variantId = safeText(line?.variantId, 180)
    const lineKey = safeText(line?.lineKey || `${productId}:${variantId}:${index}`, 240)
    const qty = Math.max(1, Math.min(99, Math.trunc(Number(line?.qty || 1))))
    if (!productId || !variantId || !lineKey) throw Object.assign(new Error('Each bag line needs a listing and variation.'), { status: 422 })
    const custom = line?.customization && typeof line.customization === 'object' && !Array.isArray(line.customization) ? line.customization : null
    return { lineKey, productId, variantId, qty, customization: sanitizeCustomization(custom) }
  })
  if (new Set(result.map(line => line.lineKey)).size !== result.length) throw Object.assign(new Error('Bag lines must be unique.'), { status: 422 })
  return result
}

function sanitizeCustomization(value) {
  if (!value) return null
  const fieldsSource = value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) ? value.fields : {}
  const fields = Object.fromEntries(Object.entries(fieldsSource).slice(0, 30).map(([key, raw]) => [safeText(key, 80), safeText(raw, 500)]).filter(([key]) => key))
  const note = safeText(value.note, 500)
  const requestId = safeText(value.requestId, 180)
  const aiPreviewUrl = safeText(value.aiPreviewUrl, 1600)
  if (aiPreviewUrl && !/^https:\/\//i.test(aiPreviewUrl)) throw Object.assign(new Error('A customization preview must use a secure URL.'), { status: 422 })
  return { fields, note, requestId: requestId || null, aiPreviewUrl: aiPreviewUrl || null }
}

export function normalizeCustomer(input = {}) {
  const email = safeText(input.email, 240).toLowerCase()
  const name = safeText(input.name, 160)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 422 })
  if (name.length < 2) throw Object.assign(new Error('Enter the name for delivery.'), { status: 422 })
  return { email, name }
}

export function normalizeShipping(input = {}, { requireAddress = true } = {}) {
  const method = String(input.method || 'STANDARD').toUpperCase()
  if (!SHIPPING_METHODS[method]) throw Object.assign(new Error('Choose a valid delivery method.'), { status: 422 })
  const country = safeText(input.country, 2).toUpperCase()
  const address1 = safeText(input.address1, 240)
  const address2 = safeText(input.address2, 240)
  const city = safeText(input.city, 120)
  const state = safeText(input.state, 120)
  const postalCode = safeText(input.postalCode, 40)
  if (!country) throw Object.assign(new Error('Choose a delivery country.'), { status: 422 })
  if (requireAddress && (!address1 || !city || !postalCode)) throw Object.assign(new Error('Complete your country, address, city and postal code.'), { status: 422 })
  return { method, country, address1, address2, city, state, postalCode }
}

async function optionalCustomer(request, client) {
  const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

async function paymentSettings(client) {
  const { data, error } = await client.from('pod_store_settings').select('value').eq('key', 'payment').maybeSingle()
  if (error) throw error
  const settings = normalizePaymentSettings(data?.value || {})
  return { settings, readiness: paymentServerReadiness(settings, process.env) }
}

export async function buildCheckoutQuote(request, body, client = serverSupabase(), { requireAddress = false } = {}) {
  const lines = normalizeCheckoutLines(body.lines)
  const shipping = normalizeShipping(body.shipping || {}, { requireAddress })
  const user = await optionalCustomer(request, client)
  const variantIds = [...new Set(lines.map(line => line.variantId))]
  const productIds = [...new Set(lines.map(line => line.productId))]
  const [{ data: variants, error: variantError }, { data: products, error: productError }, { data: collections, error: collectionError }, storePayment] = await Promise.all([
    client.from('pod_product_variants').select('id,product_id,sku,option_values,price,compare_at,cost,inventory,reserved_inventory,status').in('id', variantIds),
    client.from('pod_products').select('id,handle,title,status,tags,image,custom_fields,updated_at').in('id', productIds),
    client.from('pod_collection_products').select('product_id,collection_id').in('product_id', productIds),
    paymentSettings(client)
  ])
  if (variantError || productError || collectionError) throw variantError || productError || collectionError
  const variantMap = new Map((variants || []).map(row => [row.id, row]))
  const productMap = new Map((products || []).map(row => [row.id, row]))
  const collectionMap = new Map(productIds.map(id => [id, (collections || []).filter(row => row.product_id === id).map(row => row.collection_id)]))
  const hydrated = lines.map(line => {
    const variant = variantMap.get(line.variantId)
    const product = productMap.get(line.productId)
    if (!product || product.status !== 'PUBLISHED' || !variant || variant.product_id !== product.id || variant.status !== 'ACTIVE') throw Object.assign(new Error('A listing or variation is no longer available.'), { status: 409 })
    const available = Math.max(0, Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0))
    if (available < line.qty) throw Object.assign(new Error(`Only ${available} unit(s) remain for ${variant.sku}.`), { status: 409 })
    return {
      ...line,
      sku: variant.sku,
      price: Number(variant.price),
      compareAt: variant.compare_at == null ? null : Number(variant.compare_at),
      cost: variant.cost == null ? null : Number(variant.cost),
      productTitle: product.title,
      productHandle: product.handle,
      productImage: product.image,
      options: variant.option_values || {},
      tags: product.tags || [],
      collections: collectionMap.get(product.id) || []
    }
  })
  let membership = null
  let program = null
  let rules = []
  if (user) {
    const [{ data: memberships, error: memberError }, { data: programRow, error: programError }, { data: ruleRows, error: ruleError }] = await Promise.all([
      client.from('pod_memberships').select('*').eq('user_id', user.id).in('status', ['ACTIVE', 'TRIALING']).order('current_period_end', { ascending: false }).limit(1),
      client.from('pod_membership_programs').select('*').eq('id', '90-club').maybeSingle(),
      client.from('pod_membership_discount_rules').select('*').eq('program_id', '90-club').eq('active', true)
    ])
    if (memberError || programError || ruleError) throw memberError || programError || ruleError
    membership = memberships?.[0] || null
    program = programRow || null
    rules = ruleRows || []
  }
  const memberQuote = quoteCart({ lines: hydrated, membership, program, rules, shipping: { country: shipping.country } })
  const freeThreshold = Math.max(0, Number(process.env.FREE_SHIPPING_THRESHOLD || 100))
  const memberSubsidyCap = Math.max(0, Number(memberQuote.shipping.subsidyCap || 0))
  const shippingPolicyFree = memberQuote.shipping.eligible && shipping.method === 'STANDARD' && memberSubsidyCap >= SHIPPING_METHODS.STANDARD.amount
  const standardFree = shipping.method === 'STANDARD' && (shippingPolicyFree || memberQuote.subtotal >= freeThreshold)
  const shippingBase = SHIPPING_METHODS[shipping.method].amount
  const memberShippingSubsidy = !standardFree && shipping.method === 'STANDARD' && memberQuote.shipping.eligible ? Math.min(shippingBase, memberSubsidyCap) : 0
  const shippingTotal = money(standardFree ? 0 : shippingBase - memberShippingSubsidy)
  const taxRate = Math.min(0.25, Math.max(0, Number(process.env.CHECKOUT_TAX_RATE || 0)))
  const taxTotal = money((memberQuote.subtotal + shippingTotal) * taxRate)
  const grandTotal = money(memberQuote.subtotal + shippingTotal + taxTotal)
  const paymentAvailable = Boolean(storePayment.settings.enabled && storePayment.readiness.ready && storePayment.settings.provider === 'PAYPAL')
  const snapshot = {
    version: 1,
    lines: memberQuote.lines.map(line => ({ lineKey: line.lineKey, productId: line.productId, variantId: line.variantId, qty: line.qty, publicUnit: line.publicUnit, finalUnit: line.finalUnit, discount: line.discount })),
    shipping: { method: shipping.method, country: shipping.country, amount: shippingTotal },
    currency: storePayment.settings.currency || 'USD',
    subtotal: memberQuote.subtotal,
    publicSubtotal: memberQuote.publicSubtotal,
    discount: memberQuote.discount,
    tax: taxTotal,
    total: grandTotal,
    member: memberQuote.member,
    userId: user?.id || null
  }
  const quoteToken = issueQuoteToken(snapshot)
  return {
    ...snapshot,
    member: memberQuote.member,
    membershipStatus: memberQuote.membershipStatus,
    shipping: { ...shipping, amount: shippingTotal, label: SHIPPING_METHODS[shipping.method].label, eta: SHIPPING_METHODS[shipping.method].eta, free: standardFree, reason: standardFree ? (shippingPolicyFree ? '90+ Club benefit' : `Free shipping over $${freeThreshold}`) : memberShippingSubsidy > 0 ? `90+ Club covers $${memberShippingSubsidy}` : 'Standard delivery rate' },
    taxRate,
    paymentAvailable,
    paymentMessage: paymentAvailable ? '' : 'Online payment is temporarily unavailable while the studio finishes payment setup.',
    quoteToken,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    lines: memberQuote.lines.map(line => ({ ...line, productTitle: hydrated.find(item => item.lineKey === line.lineKey)?.productTitle, productHandle: hydrated.find(item => item.lineKey === line.lineKey)?.productHandle, productImage: hydrated.find(item => item.lineKey === line.lineKey)?.productImage, options: hydrated.find(item => item.lineKey === line.lineKey)?.options, customization: lines.find(item => item.lineKey === line.lineKey)?.customization || null }))
  }
}

export async function getPaymentContext(client = serverSupabase(), { requireReady = true } = {}) {
  const context = await paymentSettings(client)
  if (requireReady && (!context.settings.enabled || context.settings.provider === 'NONE')) throw Object.assign(new Error('Online payment is not enabled yet. Please try again when the studio has connected a payment provider.'), { status: 503, code: 'PAYMENT_NOT_ENABLED' })
  if (requireReady && !context.readiness.ready) throw Object.assign(new Error('Online payment is temporarily unavailable while the payment provider is being configured.'), { status: 503, code: 'PAYMENT_NOT_READY', missing: context.readiness.missing })
  if (requireReady && context.settings.provider === 'PADDLE') throw Object.assign(new Error('Paddle checkout is not available for physical goods yet. Select PayPal after the shipping adapter is configured.'), { status: 501, code: 'PAYMENT_PROVIDER_UNSUPPORTED' })
  return context
}

export function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `ET-${date}-${randomBytes(3).toString('hex').toUpperCase()}`
}

export function trackingToken() {
  return randomBytes(24).toString('base64url')
}

export function quoteFingerprint(snapshot) {
  return hashToken(stable(snapshot))
}

export function sameQuote(a, b) {
  return quoteFingerprint(a) === quoteFingerprint(b)
}

export async function finalizePayment(client, orderId, status, providerPaymentId = '', providerEventId = '', payload = {}) {
  const { data, error } = await client.rpc('pod_finalize_order_payment', {
    p_order_id: orderId,
    p_payment_state: status,
    p_provider_payment_id: safeText(providerPaymentId, 240) || null,
    p_provider_event_id: safeText(providerEventId, 240) || null,
    p_event_payload: payload && typeof payload === 'object' ? payload : {}
  })
  if (error) throw error
  return data
}

export async function markPaymentPending(client, orderId, providerPaymentId = '', providerEventId = '', payload = {}) {
  const { data, error } = await client.rpc('pod_mark_order_payment_pending', {
    p_order_id: orderId,
    p_provider_payment_id: safeText(providerPaymentId, 240) || null,
    p_provider_event_id: safeText(providerEventId, 240) || null,
    p_event_payload: payload && typeof payload === 'object' ? payload : {}
  })
  if (error) throw error
  return data
}

export function paypalBaseUrl(environment = 'sandbox') {
  return String(environment).toLowerCase() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

export async function paypalAccessToken(environment = 'sandbox', configuredClientId = '') {
  const clientId = configuredClientId || process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) throw Object.assign(new Error('PayPal server credentials are missing.'), { status: 503 })
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${paypalBaseUrl(environment)}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.access_token) throw Object.assign(new Error(result.message || 'PayPal could not authorize the payment.'), { status: 502 })
  return result.access_token
}

export async function createPayPalOrder({ settings, total, currency, orderNumber: reference, returnUrl, cancelUrl, customer, shipping, lines = [] }) {
  const token = await paypalAccessToken(settings.environment, settings.paypal?.clientId)
  const shippingAddress = {
    name: { full_name: customer.name },
    address: {
      address_line_1: shipping.address1,
      ...(shipping.address2 ? { address_line_2: shipping.address2 } : {}),
      admin_area_2: shipping.city,
      ...(shipping.state ? { admin_area_1: shipping.state } : {}),
      postal_code: shipping.postalCode,
      country_code: shipping.country
    }
  }
  const response = await fetch(`${paypalBaseUrl(settings.environment)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': reference },
    body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: reference, custom_id: reference, invoice_id: reference, amount: { currency_code: currency, value: Number(total).toFixed(2) }, description: `${lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)} Extra Time item(s)`, shipping: shippingAddress }], application_context: { brand_name: 'Extra Time', user_action: 'PAY_NOW', return_url: returnUrl, cancel_url: cancelUrl, shipping_preference: 'SET_PROVIDED_ADDRESS' } })
  })
  const result = await response.json().catch(() => ({}))
  const approvalUrl = result.links?.find(link => link.rel === 'approve')?.href || ''
  if (!response.ok || !result.id || !approvalUrl) throw Object.assign(new Error(result.message || 'PayPal did not return a secure approval link.'), { status: 502 })
  let approval
  try { approval = new URL(approvalUrl) } catch { approval = null }
  if (!approval || approval.protocol !== 'https:' || !/((^|\.)paypal\.com|(^|\.)paypalobjects\.com)$/i.test(approval.hostname)) throw Object.assign(new Error('PayPal returned an invalid approval link.'), { status: 502 })
  return { id: result.id, approvalUrl, raw: result }
}

export async function capturePayPalOrder({ settings, providerOrderId }) {
  const token = await paypalAccessToken(settings.environment, settings.paypal?.clientId)
  const response = await fetch(`${paypalBaseUrl(settings.environment)}/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `capture-${providerOrderId}` } })
  let result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const alreadyCaptured = (result.details || []).some(detail => detail.issue === 'ORDER_ALREADY_CAPTURED')
    if (!alreadyCaptured) throw Object.assign(new Error(result.message || 'PayPal could not capture the payment.'), { status: 502 })
    const lookup = await fetch(`${paypalBaseUrl(settings.environment)}/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    result = await lookup.json().catch(() => ({}))
    if (!lookup.ok) throw Object.assign(new Error(result.message || 'PayPal could not verify the captured payment.'), { status: 502 })
  }
  const captures = result.purchase_units?.flatMap(unit => unit.payments?.captures || []) || []
  const completedCapture = captures.find(item => item.status === 'COMPLETED')
  const capture = completedCapture || captures[0]
  const captureStatus = String(capture?.status || result.status || '').toUpperCase()
  const amount = capture?.amount || result.purchase_units?.[0]?.payments?.captures?.[0]?.amount || null
  return {
    paid: Boolean(completedCapture) && result.status === 'COMPLETED',
    pending: captureStatus === 'PENDING' || ['APPROVED', 'PAYER_ACTION_REQUIRED'].includes(String(result.status || '').toUpperCase()),
    failed: ['DECLINED', 'FAILED', 'VOIDED'].includes(captureStatus),
    paymentId: capture?.id || result.id,
    captureStatus,
    amount: amount?.value == null ? null : Number(amount.value),
    currency: String(amount?.currency_code || '').toUpperCase(),
    raw: result
  }
}

export async function verifyPayPalWebhook({ settings, request, event }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false
  const token = await paypalAccessToken(settings.environment, settings.paypal?.clientId)
  const headers = request.headers || {}
  const body = { auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'], transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'], transmission_time: headers['paypal-transmission-time'], webhook_id: webhookId, webhook_event: event }
  if (Object.values(body).some(value => !value)) return false
  const response = await fetch(`${paypalBaseUrl(settings.environment)}/v1/notifications/verify-webhook-signature`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  return response.ok && result.verification_status === 'SUCCESS'
}

export function paddleSignatureValid(rawBody, signature) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const parts = Object.fromEntries(String(signature).split(';').map(item => item.split('=').map(value => value.trim())).filter(item => item.length === 2))
  const timestamp = parts.ts
  const h1 = parts.h1
  if (!timestamp || !h1) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex')
  // Paddle retries can arrive well after the first delivery.  Keep a bounded
  // replay window without rejecting legitimate retries during a short outage.
  return expected.length === h1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(h1)) && Number.isFinite(Number(timestamp)) && Math.abs(Date.now() / 1000 - Number(timestamp)) < 300
}
