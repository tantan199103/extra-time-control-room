import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePaymentSettings, paymentPublicConfig, paymentServerReadiness, validatePaymentSettings } from '../src/lib/payment-config.js'

test('payment settings normalize provider credentials without accepting commercial authority', () => {
  const result = validatePaymentSettings({ enabled:true, provider:'PADDLE', environment:'sandbox', currency:'USD', paddle:{ clientToken:'test_token', priceMap:{'variant-a':'pri_abc-123', bad:'not-a-price'} } })
  assert.equal(result.ok,true)
  assert.deepEqual(result.settings.paddle.priceMap, {'variant-a':'pri_abc-123'})
  assert.equal('price' in result.settings,false)
})

test('payment settings fail closed until server secrets exist', () => {
  const settings = normalizePaymentSettings({ enabled:true, provider:'PAYPAL', paypal:{ clientId:'client-id' } })
  assert.deepEqual(paymentServerReadiness(settings, {}), { ready:false, missing:['PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID'] })
  assert.deepEqual(paymentServerReadiness(settings, { PAYPAL_CLIENT_SECRET:'secret', PAYPAL_WEBHOOK_ID:'webhook' }), { ready:true, missing:[] })
})

test('public payment config exposes only browser-safe values', () => {
  const config = paymentPublicConfig({ enabled:true, provider:'PADDLE', environment:'live', paddle:{ clientToken:'live_token', priceMap:{'v':'pri_1'} } })
  assert.deepEqual(config, { enabled:true, provider:'PADDLE', environment:'live', currency:'USD', publicKey:'live_token', priceMap:{v:'pri_1'} })
  assert.equal('apiKey' in config,false)
})
