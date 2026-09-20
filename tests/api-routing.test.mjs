import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isEdgeRoute, isNodeBackendRoute, resolveApiTarget } from '../src/lib/api-client.js'
import { readiness, routeModules } from '../backend/src/server.mjs'

test('hybrid API routes resolve light calls to Supabase and heavy calls to Node', () => {
  assert.equal(resolveApiTarget('/api/cart-validate', { edgeOrigin: 'https://project.supabase.co/functions/v1', backendOrigin: 'https://api.jersevo.com' }), 'https://project.supabase.co/functions/v1/cart-validate')
  assert.equal(resolveApiTarget('/api/checkout-quote?x=1', { edgeOrigin: 'https://project.supabase.co/functions/v1', backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/checkout-quote?x=1')
  assert.equal(resolveApiTarget('/api/customer-upload', { backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/customer-upload')
  assert.equal(resolveApiTarget('/api/logo-preview', { backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/logo-preview')
  assert.equal(resolveApiTarget('/api/ai-logo-preview', { backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/ai-logo-preview')
  assert.equal(resolveApiTarget('/api/checkout-quote', { backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/checkout-quote')
  assert.equal(resolveApiTarget('/api/payment-webhook', { backendOrigin: 'https://api.jersevo.com' }), 'https://api.jersevo.com/api/payment-webhook')
  assert.equal(resolveApiTarget('/api/ai-listing-copy', { backendOrigin: 'https://api.jersevo.com' }), '/api/ai-listing-copy')
  assert.equal(resolveApiTarget('/api/ai-listing-media', { backendOrigin: 'https://api.jersevo.com' }), '/api/ai-listing-media')
  assert.equal(resolveApiTarget('/api/cart-validate', {}), '/api/cart-validate')
  assert.equal(isEdgeRoute('/api/checkout-quote'), false)
  assert.equal(isEdgeRoute('/api/member-quote'), true)
  assert.equal(isNodeBackendRoute('/api/ai-preview'), true)
  assert.equal(isNodeBackendRoute('/api/logo-preview'), true)
  assert.equal(isNodeBackendRoute('/api/ai-logo-preview'), true)
  assert.equal(isNodeBackendRoute('/api/newsletter-subscribe'), true)
  assert.equal(isNodeBackendRoute('/api/ai-listing-copy'), false)
  assert.equal(isNodeBackendRoute('/api/ai-listing-media'), false)
})

test('routing keeps server-only credentials out of the browser client', async () => {
  const source = await readFile(new URL('../src/lib/api-client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|PAYPAL_CLIENT_SECRET|PADDLE_API_KEY|AI_IMAGE_API_KEY/)
  const backend = await readFile(new URL('../backend/src/server.mjs', import.meta.url), 'utf8')
  assert.match(backend, /rawBody/)
  assert.match(backend, /Access-Control-Allow-Origin/)
})

test('Node runtime keeps the webhook route and fails readiness without server secrets', () => {
  assert.equal(routeModules.get('/api/payment-webhook'), 'payment-webhook.js')
  assert.equal(routeModules.get('/api/checkout-quote'), 'checkout-quote.js')
  assert.equal(routeModules.get('/api/cart-validate'), 'cart-validate.js')
  assert.equal(routeModules.get('/api/member-quote'), 'member-quote.js')
  assert.equal(routeModules.get('/api/membership-enroll'), 'membership-enroll.js')
  assert.equal(routeModules.get('/api/google-merchant-feed'), 'google-merchant-feed.js')
  assert.equal(routeModules.get('/api/ai-listing-media'), 'ai-listing-media.js')
  assert.equal(routeModules.get('/api/newsletter-subscribe'), 'newsletter-subscribe.js')
  const old = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CHECKOUT_SIGNING_SECRET', 'ALLOWED_ORIGINS', 'SITE_URL'].map(name => [name, process.env[name]]))
  for (const name of Object.keys(old)) delete process.env[name]
  try {
    const result = readiness()
    assert.equal(result.ready, false)
    assert.deepEqual(result.missing, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CHECKOUT_SIGNING_SECRET', 'ALLOWED_ORIGINS', 'SITE_URL'])
  } finally {
    for (const [name, value] of Object.entries(old)) {
      if (value == null) delete process.env[name]
      else process.env[name] = value
    }
  }
})
