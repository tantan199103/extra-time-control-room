import test from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { buildStripeCheckoutSessionParams, verifyStripeWebhook } from '../api/_checkout.js'

const checkoutInput = {
  total: 78,
  currency: 'USD',
  orderNumber: 'ET-20260929-ABC123',
  returnUrl: 'https://www.jersevo.com/checkout?payment=return',
  cancelUrl: 'https://www.jersevo.com/checkout?payment=cancelled',
  customer: { email: 'buyer@example.com' },
  shipping: { country: 'US' },
  lines: [{ qty: 2, finalUnit: 30, productTitle: 'Custom Match Jersey', sku: 'JET-001-S' }],
  shippingAmount: 8,
  taxAmount: 10
}

test('Stripe Checkout payload is built from the authoritative order total', () => {
  const result = buildStripeCheckoutSessionParams(checkoutInput)
  assert.equal(result.mode, 'payment')
  assert.equal(result.client_reference_id, checkoutInput.orderNumber)
  assert.equal(result.metadata.order_public_id, checkoutInput.orderNumber)
  assert.equal(result.payment_intent_data.metadata.order_public_id, checkoutInput.orderNumber)
  assert.equal(result.line_items.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0), 7800)
  assert.equal(result.line_items[0].price_data.currency, 'usd')
  assert.equal(result.customer_email, 'buyer@example.com')
})

test('Stripe Checkout rejects quote and line-total mismatches', () => {
  assert.throws(() => buildStripeCheckoutSessionParams({ ...checkoutInput, total: 77.99 }), /no longer matches/i)
  assert.throws(() => buildStripeCheckoutSessionParams({ ...checkoutInput, currency: 'US dollars' }), /currency is invalid/i)
  assert.throws(() => buildStripeCheckoutSessionParams({ ...checkoutInput, returnUrl: 'http://evil.example/return' }), /redirect/i)
})

test('Stripe webhook signature verification rejects altered bodies', () => {
  const previousKey = process.env.STRIPE_SECRET_KEY
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test'
  try {
    const raw = JSON.stringify({ id:'evt_test', type:'checkout.session.completed', data:{ object:{ id:'cs_test_1' } } })
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET })
    assert.equal(verifyStripeWebhook(raw, signature)?.id, 'evt_test')
    assert.equal(verifyStripeWebhook(`${raw} `, signature), null)
    assert.equal(verifyStripeWebhook(raw, 't=1,v1=bad'), null)
  } finally {
    if (previousKey == null) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousKey
    if (previousSecret == null) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = previousSecret
  }
})
