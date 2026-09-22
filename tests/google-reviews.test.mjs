import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_GOOGLE_MERCHANT_ID,
  getGoogleMerchantId,
  formatEstimatedDeliveryDate,
  formatDeliveryCountry,
  renderGoogleSurveyOptIn,
  renderGoogleRatingBadge
} from '../src/lib/google-reviews.js'

test('Google Merchant ID matches official merchant ID 5856459864', () => {
  assert.equal(DEFAULT_GOOGLE_MERCHANT_ID, 5856459864)
  assert.equal(getGoogleMerchantId(), 5856459864)
})

test('formatEstimatedDeliveryDate formats valid ISO YYYY-MM-DD dates', () => {
  // Direct valid date string
  assert.equal(formatEstimatedDeliveryDate('2026-10-05'), '2026-10-05')

  // Date object
  const specificDate = new Date('2026-10-15T12:00:00Z')
  assert.equal(formatEstimatedDeliveryDate(specificDate), '2026-10-15')

  // Default transit offset produces future date
  const estimated = formatEstimatedDeliveryDate(null, 10)
  assert.match(estimated, /^\d{4}-\d{2}-\d{2}$/)
  const today = new Date().toISOString().slice(0, 10)
  assert.ok(estimated > today)
})

test('formatDeliveryCountry normalizes country inputs to 2-letter ISO uppercase', () => {
  assert.equal(formatDeliveryCountry('us'), 'US')
  assert.equal(formatDeliveryCountry('US'), 'US')
  assert.equal(formatDeliveryCountry('USA'), 'US')
  assert.equal(formatDeliveryCountry('United States'), 'US')
  assert.equal(formatDeliveryCountry('ca'), 'CA')
  assert.equal(formatDeliveryCountry('Canada'), 'CA')
  assert.equal(formatDeliveryCountry('gb'), 'GB')
  assert.equal(formatDeliveryCountry('au'), 'AU')
  assert.equal(formatDeliveryCountry(''), 'US')
})

test('renderGoogleSurveyOptIn and renderGoogleRatingBadge fail soft in Node/SSR without window', () => {
  const optInResult = renderGoogleSurveyOptIn({
    orderId: 'ET-20260922-001',
    email: 'test@example.com'
  })
  assert.equal(optInResult.success, false)
  assert.equal(optInResult.reason, 'SSR_ENVIRONMENT')

  const badgeResult = renderGoogleRatingBadge()
  assert.equal(badgeResult.success, false)
  assert.equal(badgeResult.reason, 'SSR_ENVIRONMENT')
})

test('index.html contains official Google Customer Reviews script and renderOptIn handler', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8')
  assert.match(indexHtml, /apis\.google\.com\/js\/platform\.js\?onload=renderOptIn/)
  assert.match(indexHtml, /window\.renderOptIn\s*=\s*function/)
})

test('api/order-track.js queries and exposes customerEmail', () => {
  const orderTrackSrc = fs.readFileSync(path.resolve('api/order-track.js'), 'utf8')
  assert.match(orderTrackSrc, /customer_email/)
  assert.match(orderTrackSrc, /customerEmail:\s*order\.customer_email\s*\|\|\s*''/)
})
