import test from 'node:test'
import assert from 'node:assert/strict'
import { STOREFRONT_EVENTS, storefrontAnalyticsContext, trackStorefrontEvent, trackStorefrontEventOnce } from '../src/lib/storefront-analytics.js'

test('storefront analytics exposes the planned conversion and reliability events', () => {
  for (const name of ['search_submitted','filter_applied','product_card_clicked','pdp_viewed','add_to_bag','checkout_started','purchase_completed','custom_cta_clicked','designer_started','designer_completed','designer_load_error','image_load_error','catalog_unavailable','search_zero_results']) {
    assert.ok(STOREFRONT_EVENTS.includes(name),name)
  }
})

test('storefront analytics keeps an SSR-safe, bounded payload contract', () => {
  const payload = trackStorefrontEvent('product_card_clicked',{
    product_id:'listing-1',
    'Bad Key':'value\u0000with control text '.repeat(20),
    nested:{ secret:true }
  })
  assert.equal(payload.event,'jersevo_product_card_clicked')
  assert.equal(payload.product_id,'listing-1')
  assert.equal(payload.bad_key.length,120)
  assert.equal('nested' in payload,false)
  assert.equal(trackStorefrontEvent('arbitrary_event'),null)
})

test('storefront analytics enriches browser events without collecting a full referrer URL', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const local = new Map()
  const session = new Map()
  const storage = map => ({ getItem:key => map.get(key) || null, setItem:(key,value) => map.set(key,String(value)) })
  globalThis.window = {
    location:{ pathname:'/product/test-kit', search:'?utm_source=google&utm_medium=cpc&utm_campaign=launch', hostname:'www.jersevo.com' },
    innerWidth:390,
    matchMedia:() => ({ matches:true }),
    localStorage:storage(local),
    sessionStorage:storage(session),
    dataLayer:[],
    dispatchEvent:() => {}
  }
  globalThis.document = { referrer:'https://www.google.com/search?q=private-query' }
  try {
    const context = storefrontAnalyticsContext()
    assert.deepEqual(context,{
      route:'/product/test-kit',
      device_type:'mobile',
      visitor_type:'new',
      traffic_channel:'paid',
      traffic_source:'google',
      traffic_medium:'cpc',
      campaign:'launch'
    })
    const first = trackStorefrontEventOnce('purchase_completed','ET-ONE',{ value:123 })
    assert.equal(first.event,'jersevo_purchase_completed')
    assert.equal(trackStorefrontEventOnce('purchase_completed','ET-ONE',{ value:123 }),null)
    assert.equal(window.dataLayer.length,1)
    assert.equal(JSON.stringify(first).includes('private-query'),false)
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
