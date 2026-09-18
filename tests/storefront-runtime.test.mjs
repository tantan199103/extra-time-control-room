import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { availableOptionValue, buildFallbackCatalog, findStorefrontProduct, initialSelections, isSellableVariant, menuTargetProblem, prepareStorefrontProduct, reconcileCart, resolveVariant, sortCollectionProducts } from '../src/lib/storefront-model.js'
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

test('cart reconciliation removes unavailable variants and clamps live quantity', () => {
  const products=[{id:'p',handle:'p',name:'Piece',image:'/p.webp',variants:[{id:'v',sku:'P-S',status:'ACTIVE',inventory:2,price:90,values:{Size:'S'}}]}]
  const result=reconcileCart([{key:'p|v',product:{id:'p',name:'Piece'},variantId:'v',qty:4,unitPrice:1}],products)
  assert.equal(result.items[0].qty,2)
  assert.equal(result.items[0].unitPrice,90)
  assert.match(result.issues[0].message,/reduced/)
  assert.equal(isSellableVariant(products[0].variants[0]),true)
})

test('collection merchandising and menu validation follow published contracts', () => {
  const products=[{id:'a',updatedAt:'2026-01-01',inventory:8},{id:'b',updatedAt:'2026-02-01',inventory:1}]
  const collection={products:['a','b'],productLinks:[{productId:'a',sortOrder:0,featured:false},{productId:'b',sortOrder:1,featured:true}],sort:'FEATURED'}
  assert.deepEqual(sortCollectionProducts(products,collection).map(row=>row.id),['b','a'])
  assert.equal(menuTargetProblem('/unknown-page','PAGE').length>0,true)
  assert.equal(menuTargetProblem('/moments','PAGE'),'')
  assert.equal(menuTargetProblem('/product/a','PRODUCT'),'')
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
  const adminQueue=await readFile(new URL('../api/admin-customizations.js',import.meta.url),'utf8')
  assert.match(adminQueue,/requireAdmin/)
  assert.match(adminQueue,/createSignedUrl/)
  assert.match(order,/assetRefs/)
})

test('service worker excludes sensitive routes from runtime caching', async () => {
  const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
  assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(source,/url\.pathname\.startsWith\('\/admin'\)/)
})
