import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { availableOptionValue, buildFallbackCatalog, findStorefrontProduct, initialSelections, prepareStorefrontProduct, resolveVariant } from '../src/lib/storefront-model.js'
import { products as fallback } from '../src/data.js'

test('fallback catalogue has published-looking variants while live Supabase is unavailable', () => {
  const catalog=buildFallbackCatalog(fallback)
  assert.equal(catalog.length,fallback.length)
  assert.ok(catalog.every(product=>product.options.length===2 && product.variants.length===6))
  assert.equal(findStorefrontProduct(catalog,'after-90').handle,'after-90')
})

test('variation resolution respects option combinations and availability', () => {
  const product={options:[{name:'Size',values:['S','M']},{name:'Colour',values:['Black','White']}],variants:[
    {id:'s-black',status:'ACTIVE',inventory:2,values:{Size:'S',Colour:'Black'}},
    {id:'m-black',status:'ACTIVE',inventory:0,values:{Size:'M',Colour:'Black'}},
    {id:'m-white',status:'ACTIVE',inventory:3,values:{Size:'M',Colour:'White'}}
  ]}
  assert.equal(resolveVariant(product,{Size:'M',Colour:'White'}).id,'m-white')
  assert.equal(availableOptionValue(product,'Size','M',{Colour:'Black'}),false)
  assert.equal(availableOptionValue(product,'Size','M',{Colour:'White'}),true)
  assert.deepEqual(initialSelections(product,{Size:'S',Colour:'Purple'}),{Size:'S'})
})

test('storefront products do not expose private bridge audit metadata', () => {
  const product = prepareStorefrontProduct({
    id: 'private-audit', handle: 'private-audit', title: 'Private audit', status: 'PUBLISHED', ai_metadata: { bridge: { source: { provider: 'chatgpt-web' } } },
    media: [{ id: 'hero', type: 'IMAGE', url: '/hero.webp', bridge: { slotKey: 'hero', sourceHash: 'a'.repeat(64) } }], variants: []
  })
  assert.equal('aiMetadata' in product, false)
  assert.equal('ai_metadata' in product, false)
  assert.equal('bridge' in product.media[0], false)
})

test('storefront uses the public catalogue and server-validated custom request routes', async () => {
  const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  const adapter=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8')
  const ai=await readFile(new URL('../api/ai-preview.js',import.meta.url),'utf8')
  const order=await readFile(new URL('../api/customization-order.js',import.meta.url),'utf8')
  assert.match(main,/fetchStorefrontCatalog/)
  assert.match(main,/product\.customFields/)
  assert.match(main,/selectedVariant/)
  assert.match(adapter,/fetch\('\/api\/customization-order'/)
  assert.doesNotMatch(adapter,/from\('pod_customization_orders'\)\.insert/)
  assert.match(ai,/pod_consume_api_quota|consumeQuota/)
  assert.match(ai,/createSignedUrl/)
  assert.match(order,/field this listing does not allow/)
  assert.match(order,/idempotencyKey/)
})

test('service worker excludes sensitive routes from runtime caching', async () => {
  const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
  assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(source,/url\.pathname\.startsWith\('\/admin'\)/)
})
