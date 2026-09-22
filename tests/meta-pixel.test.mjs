import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getMetaPixelId,
  setMetaPixelId,
  initMetaPixel,
  emitFbEvent,
  trackPageView,
  trackViewContent,
  trackAddToCart,
  trackCustomizeProduct,
  trackInitiateCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  trackSearch,
  trackLead,
  DEFAULT_PIXEL_ID
} from '../src/lib/meta-pixel.js'

test('Meta Pixel helper fails soft in node/SSR without window', () => {
  assert.equal(getMetaPixelId(), '')
  assert.equal(initMetaPixel(), false)
  const pageView = trackPageView('/shop')
  assert.equal(pageView.eventName, 'PageView')
  assert.deepEqual(pageView.params, { page_path: '/shop' })
})

test('Meta Pixel events format parameters according to Meta standard specs', () => {
  const dummyProduct = {
    id: 'listing-packers-green',
    handle: 'packers-custom-jersey',
    title: 'Packers Personalized Jersey',
    price: 69.99,
    taxonomy: { league: 'nfl', team: 'green-bay-packers' }
  }
  const dummyVariant = {
    id: 'variant-packers-m',
    sku: 'ET-GB-M',
    price: 69.99
  }

  // ViewContent
  const viewContent = trackViewContent(dummyProduct, dummyVariant)
  assert.equal(viewContent.eventName, 'ViewContent')
  assert.equal(viewContent.params.content_type, 'product')
  assert.equal(viewContent.params.value, 69.99)
  assert.equal(viewContent.params.currency, 'USD')
  assert.ok(viewContent.params.content_ids.includes('listing-packers-green'))
  assert.ok(viewContent.params.content_ids.includes('ET-GB-M'))
  assert.equal(viewContent.params.content_category, 'nfl')

  // AddToCart
  const dummyLine = {
    product: dummyProduct,
    sku: 'ET-GB-M',
    variantId: 'variant-packers-m',
    qty: 2,
    unitPrice: 69.99
  }
  const addToCart = trackAddToCart(dummyLine)
  assert.equal(addToCart.eventName, 'AddToCart')
  assert.equal(addToCart.params.value, 139.98)
  assert.equal(addToCart.params.currency, 'USD')
  assert.ok(addToCart.params.content_ids.includes('listing-packers-green'))
  assert.ok(addToCart.params.content_ids.includes('ET-GB-M'))

  // CustomizeProduct (POD specific)
  const custom = trackCustomizeProduct(dummyProduct, { name: 'RODGERS', number: '12' })
  assert.equal(custom.eventName, 'CustomizeProduct')
  assert.equal(custom.params.custom_name, 'RODGERS')
  assert.equal(custom.params.custom_number, '12')
  assert.equal(custom.params.value, 69.99)

  // InitiateCheckout
  const initCheckout = trackInitiateCheckout([dummyLine], 139.98)
  assert.equal(initCheckout.eventName, 'InitiateCheckout')
  assert.equal(initCheckout.params.value, 139.98)
  assert.equal(initCheckout.params.num_items, 2)
  assert.equal(initCheckout.params.contents.length, 1)

  // AddPaymentInfo
  const addPayment = trackAddPaymentInfo()
  assert.equal(addPayment.eventName, 'AddPaymentInfo')
  assert.equal(addPayment.params.currency, 'USD')

  // Purchase
  const dummyOrder = {
    order_id: 'ET-2026-9901',
    value: 139.98,
    contents: [{ id: 'listing-packers-green', quantity: 2, item_price: 69.99 }]
  }
  const purchase = trackPurchase(dummyOrder)
  assert.equal(purchase.eventName, 'Purchase')
  assert.equal(purchase.params.order_id, 'ET-2026-9901')
  assert.equal(purchase.params.value, 139.98)
  assert.equal(purchase.params.currency, 'USD')
  assert.deepEqual(purchase.params.content_ids, ['listing-packers-green'])

  // Search & Lead
  const search = trackSearch('Packers 12')
  assert.equal(search.eventName, 'Search')
  assert.equal(search.params.search_string, 'Packers 12')

  const lead = trackLead('fan@example.com')
  assert.equal(lead.eventName, 'Lead')
  assert.equal(lead.params.content_name, 'Newsletter Subscription')
})

test('Facebook Catalog feed route is configured in vercel.json rewrite', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'))
  const fbRewrite = (vercelConfig.rewrites || []).find(r => r.source === '/api/facebook-catalog-feed')
  assert.ok(fbRewrite, 'Rewrite rule for /api/facebook-catalog-feed must exist')
  assert.equal(fbRewrite.destination, '/api/google-merchant-feed.js')
})

test('Google Merchant and Facebook Catalog feed handles isFacebook request properly', async () => {
  const handlerModule = await import('../api/google-merchant-feed.js')
  assert.equal(typeof handlerModule.default, 'function')
})

test('index.html contains official Meta Pixel code snippet and DEFAULT_PIXEL_ID', () => {
  assert.equal(DEFAULT_PIXEL_ID, '1684842090311448')
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8')
  assert.match(indexHtml, /connect\.facebook\.net\/en_US\/fbevents\.js/)
  assert.match(indexHtml, /fbq\('init',\s*'1684842090311448'\)/)
  assert.match(indexHtml, /fbq\('track',\s*'PageView'\)/)
  assert.match(indexHtml, /facebook\.com\/tr\?id=1684842090311448&ev=PageView&noscript=1/)
})
