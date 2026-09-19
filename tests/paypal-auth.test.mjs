import test from 'node:test'
import assert from 'node:assert/strict'
import { paypalAccessToken } from '../api/_checkout.js'

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
