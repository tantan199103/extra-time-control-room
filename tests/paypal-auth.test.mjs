import test from 'node:test'
import assert from 'node:assert/strict'
import { createPayPalOrder, paypalAccessToken } from '../api/_checkout.js'

test('PayPal OAuth trims credentials copied with whitespace', async () => {
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET
  const previousFetch = globalThis.fetch
  let authorization = ''
  process.env.PAYPAL_CLIENT_SECRET = 'secret-value\n'
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization
    return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const token = await paypalAccessToken('live', 'client-id\n')
    assert.equal(token, 'access-token')
    assert.equal(authorization, `Basic ${Buffer.from('client-id:secret-value').toString('base64')}`)
  } finally {
    globalThis.fetch = previousFetch
    if (previousSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET
    else process.env.PAYPAL_CLIENT_SECRET = previousSecret
  }
})

test('PayPal OAuth exposes a safe provider code for invalid credentials', async () => {
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET
  const previousFetch = globalThis.fetch
  process.env.PAYPAL_CLIENT_SECRET = 'secret-value'
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    await assert.rejects(
      () => paypalAccessToken('live', 'client-id'),
      error => error?.status === 502 && error?.code === 'PAYPAL_AUTH_FAILED' && /invalid_client/.test(error.message) && !/secret-value/.test(error.message)
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET
    else process.env.PAYPAL_CLIENT_SECRET = previousSecret
  }
})

test('PayPal order creation turns an invalid shipping address into an actionable checkout error', async () => {
  const previousSecret = process.env.PAYPAL_CLIENT_SECRET
  const previousFetch = globalThis.fetch
  process.env.PAYPAL_CLIENT_SECRET = 'client-secret'
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    if (requestCount === 1) return new Response(JSON.stringify({ access_token:'access-token' }), { status:200, headers:{ 'Content-Type':'application/json' } })
    return new Response(JSON.stringify({ name:'UNPROCESSABLE_ENTITY', details:[{ issue:'SHIPPING_ADDRESS_INVALID' }], debug_id:'safe-debug-id' }), { status:422, headers:{ 'Content-Type':'application/json' } })
  }
  try {
    await assert.rejects(
      () => createPayPalOrder({
        settings:{ environment:'live', paypal:{ clientId:'client-id' } }, total:20, currency:'USD', orderNumber:'ET-TEST',
        returnUrl:'https://www.jersevo.com/checkout?payment=return', cancelUrl:'https://www.jersevo.com/checkout?payment=cancelled',
        customer:{ name:'Test Buyer' }, shipping:{ address1:'1 Test Way', city:'Austin', state:'TX', postalCode:'78701', country:'US' }, lines:[{ qty:1 }]
      }),
      error => error.status === 422 && error.code === 'PAYPAL_SHIPPING_ADDRESS_INVALID' && /validate the delivery address/i.test(error.message)
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET
    else process.env.PAYPAL_CLIENT_SECRET = previousSecret
  }
})
