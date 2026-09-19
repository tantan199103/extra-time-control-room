import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IMPORT_ARTWORK_LOCK,
  IMPORT_STATUS,
  buildCollectionPlan,
  htmlToBlocks,
  mapSourceCategories,
  minorToMoney,
  normalizeSourceProduct,
  publicListingHasSourceReferences,
  sanitizePublicText,
  sanitizeSourceHtml,
  uniqueHandle
} from '../scripts/fangear-import-lib.mjs'

const categories = [
  { id: 20, name: 'Apparel', slug: 'apparel', parent: 0, count: 2 },
  { id: 19, name: 'NFL', slug: 'nfl', parent: 0, count: 2 },
  { id: 29, name: 'Green Bay Packers', slug: 'green-bay-packers', parent: 19, count: 1 },
  { id: 613, name: 'Football Jersey', slug: 'football-jersey', parent: 20, count: 2 }
]

test('minor currency values convert to dollars without floating point drift', () => {
  assert.equal(minorToMoney('5999', 2), 59.99)
  assert.equal(minorToMoney('100', 0), 100)
  assert.equal(minorToMoney('not-a-price', 2), null)
})

test('category map routes league, team and product group separately', () => {
  const result = mapSourceCategories(categories, [categories[2], categories[3], categories[1]])
  assert.equal(result.league, 'nfl')
  assert.equal(result.team, 'green-bay-packers')
  assert.equal(result.productGroup, 'Football Jersey')
  assert.equal(result.taxonomy.sport, 'football')
})

test('HTML sanitizer keeps semantic content and removes source links/wrappers', () => {
  const html = '<div class="group"><h2>Game night</h2><p>Read more at <a href="https://fangearsport.com/product/x">our source</a>.</p><script>bad()</script></div>'
  const clean = sanitizeSourceHtml(html)
  assert.equal(clean.includes('fangearsport.com'), false)
  assert.equal(clean.includes('class='), false)
  assert.equal(clean.includes('<script'), false)
  assert.match(clean, /Game night/)
  assert.deepEqual(htmlToBlocks(html, 'Demo').map(block => block.type), ['heading', 'paragraph'])
})

test('plain public text removes source URLs, editor artifacts and brand references', () => {
  const clean = sanitizePublicText('FGS PRO · Name &#038; number. https://fangearsport.com/product/demo gtx-trans')
  assert.equal(/fangear|gtx-trans|https?:/i.test(clean), false)
  assert.match(clean, /Name & number/)
})

test('product normalization creates draft listing, 70 percent lock and stable IDs', () => {
  const product = {
    id: 31748,
    name: 'Jordan Love Green Bay Rivalry Jersey',
    slug: 'jordan-love-green-bay-rivalry-jersey',
    sku: 'FG-NFL-GRBPKFT-30',
    short_description: '<p>Add your name and number for game day.</p>',
    description: '<h2>A green memory</h2><p>Built for the final minutes.</p>',
    prices: { price: '5999', regular_price: '6999', currency_minor_unit: 2 },
    categories: [categories[1], categories[2], categories[3]],
    tags: [{ name: 'NFL football jersey' }],
    images: [{ id: 1, src: 'https://fangearsport.com/wp-content/uploads/demo.webp', alt: 'Demo' }],
    attributes: [{ name: 'Size', terms: [{ name: 'S', slug: 's' }, { name: 'M', slug: 'm' }] }],
    variations: [{ id: 31749, attributes: [{ name: 'Size', value: 's' }] }, { id: 31750, attributes: [{ name: 'Size', value: 'm' }] }],
    is_in_stock: true
  }
  const item = normalizeSourceProduct(product, { categories, variationDetails: new Map(), usedHandles: new Set(), usedSkus: new Set() })
  assert.equal(item.listing.status, IMPORT_STATUS)
  assert.equal(item.listing.artworkLock, IMPORT_ARTWORK_LOCK)
  assert.equal(item.listing.price, 59.99)
  assert.equal(item.listing.compareAt, 69.99)
  assert.deepEqual(item.listing.options, [{ name: 'Size', values: ['S', 'M'] }])
  assert.deepEqual(item.listing.customFields.map(field => field.key), ['name', 'number'])
  assert.equal(item.listing.media.length, 0)
  assert.equal(publicListingHasSourceReferences(item.listing), false)
  assert.ok(item.media[0].sourceUrl.includes('fangearsport.com'))
})

test('handle collisions are deterministic and collection plan stays draft', () => {
  const used = new Set(['demo'])
  assert.equal(uniqueHandle('Demo', used), 'demo-2')
  const collections = buildCollectionPlan(categories, [{ id: 1, categories: [categories[1]] }])
  assert.ok(collections.every(collection => collection.status === 'DRAFT'))
  assert.ok(collections.some(collection => collection.name === 'NFL'))
})

test('wildcard source variations expand into complete option combinations', () => {
  const product = {
    id: 99,
    name: 'Wildcard jersey',
    slug: 'wildcard-jersey',
    prices: { price: '5900', regular_price: '5900', currency_minor_unit: 2 },
    attributes: [
      { name: 'Fit Type', terms: [{ name: 'Kids', slug: 'kids' }] },
      { name: 'Size', terms: [{ name: 'S', slug: 's' }, { name: 'M', slug: 'm' }] }
    ],
    variations: [{ id: 100, attributes: [{ name: 'Fit Type', value: 'kids' }] }],
    images: [],
    categories: [],
    tags: [],
    is_in_stock: true
  }
  const item = normalizeSourceProduct(product, { usedHandles: new Set(), usedSkus: new Set() })
  assert.deepEqual(item.listing.variants.map(variant => variant.values), [
    { 'Fit Type': 'Kids', Size: 'S' },
    { 'Fit Type': 'Kids', Size: 'M' }
  ])
  assert.equal(new Set(item.listing.variants.map(variant => variant.sku)).size, 2)
})
