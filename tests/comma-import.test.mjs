import test from 'node:test'
import assert from 'node:assert/strict'
import { buildListingInput, validateListing } from '../src/lib/catalog-model.js'
import { productMatchesCatalogCategory, catalogCategoryByHandle, catalogCategoryIntentFilter } from '../src/lib/catalog-taxonomy.js'
import {
  COMMA_IMPORT_STATUS,
  COMMA_VARIANT_STATUS,
  buildCommaCollectionPlan,
  classifyCommaSourceCollection,
  commaImportReport,
  commaHtmlToBlocks,
  convertCommaPrice,
  inferCommaTaxonomy,
  normalizeCommaProduct,
  normalizeCommaSize,
  parseAudMoney,
  publicCommaListingHasSourceReferences,
  sanitizeCommaPublicText
} from '../scripts/comma-import-lib.mjs'

function sourceProduct(overrides = {}) {
  return {
    id:10442321559868,
    title:'Spain 2010 Champions Jersey',
    handle:'spain-2010-champions-jersey',
    body_html:'<p>Spain\'s entire 2010 World Cup win, in one jersey.</p><ul><li>Embroidered tournament story.</li></ul>',
    published_at:'2026-09-01T00:00:00+10:00',
    created_at:'2026-08-01T00:00:00+10:00',
    updated_at:'2026-09-01T00:00:00+10:00',
    vendor:'Comma Football',
    product_type:'Jersey',
    tags:['2010', 'Iniesta', 'New Arrival', 'Size - Athletic Fit', 'Spain', 'World Cup', 'Track Inventory'],
    options:[{ name:'Size', position:1, values:['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] }],
    variants:['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size, index) => ({
      id:53946162676028 + index,
      title:size,
      option1:size,
      sku:`SOURCE-${size}`,
      price:'110.00',
      compare_at_price:'120.00',
      available:index > 0,
      grams:0
    })),
    images:[
      { id:55786135093564, src:'https://cdn.shopify.com/s/files/1/0697/0461/4204/files/1-Full-Front.png?v=1', width:2000, height:2500 },
      { id:55786135126332, src:'https://cdn.shopify.com/s/files/1/0697/0461/4204/files/2-Full-Back.png?v=1', width:2000, height:2500 }
    ],
    ...overrides
  }
}

test('AUD parsing is explicit and no implicit USD conversion occurs', () => {
  assert.equal(parseAudMoney('110.00'), 110)
  assert.equal(parseAudMoney('1,100.50'), 1100.5)
  assert.equal(parseAudMoney('bad'), null)
  assert.equal(convertCommaPrice('110.00'), 0)
  assert.equal(convertCommaPrice('110.00', { mode:'AUD_TO_USD', usdRate:0.66 }), 72.6)
  assert.equal(convertCommaPrice('110.00', { mode:'AUD_AS_USD' }), 110)
  assert.throws(() => convertCommaPrice('110.00', { mode:'AUD_TO_USD', usdRate:0 }), /positive USD rate/)
})

test('Shopify size and product data normalize to a safe draft contract', () => {
  assert.equal(normalizeCommaSize('XXS'), '2XS')
  assert.equal(normalizeCommaSize('XXL'), '2XL')
  const item = normalizeCommaProduct(sourceProduct())

  assert.equal(item.listing.status, COMMA_IMPORT_STATUS)
  assert.match(item.listing.title, /^Jersevo Custom Personalized /)
  assert.equal(item.listing.type, 'PERSONALIZED')
  assert.ok(item.listing.customFields.some(field => field.key === 'name'))
  assert.ok(item.listing.customFields.some(field => field.key === 'number'))
  assert.ok(item.listing.description.length >= 160)
  assert.match(item.listing.seo.title, /Jersevo.*Custom.*Personalized/i)
  assert.ok(item.listing.seo.title.length >= 30 && item.listing.seo.title.length <= 60)
  assert.ok(item.listing.seo.description.length >= 120)
  assert.ok(item.listing.tags.includes('jersevo'))
  assert.equal(item.listing.price, 0)
  assert.equal(item.listing.inventory, 0)
  assert.deepEqual(item.listing.options, [{ name:'Size', values:['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] }])
  assert.equal(item.listing.variants.length, 8)
  assert.ok(item.listing.variants.every(variant => variant.status === COMMA_VARIANT_STATUS))
  assert.ok(item.listing.variants.every(variant => variant.inventory === 0 && variant.price === 0))
  assert.equal(item.listing.aiMetadata.sourcePricing.currency, 'AUD')
  assert.equal(item.listing.aiMetadata.catalogReview.status, 'PENDING')
  assert.ok(item.listing.seoBlockReasons.includes('SOURCE_RIGHTS_REVIEW_REQUIRED'))
  assert.ok(item.listing.seoBlockReasons.includes('USD_PRICE_REQUIRED'))
  assert.deepEqual(validateListing(item.listing), [])
  assert.equal(buildListingInput(item.listing).variants[0].status, 'DRAFT')
})

test('IDs, handles, SKUs and source fingerprints are stable across reruns', () => {
  const first = normalizeCommaProduct(sourceProduct())
  const second = normalizeCommaProduct(sourceProduct())
  assert.equal(first.listing.id, second.listing.id)
  assert.equal(first.listing.handle, second.listing.handle)
  assert.equal(first.listing.sku, second.listing.sku)
  assert.equal(first.listing.aiMetadata.importFingerprint, second.listing.aiMetadata.importFingerprint)
  assert.deepEqual(first.listing.variants.map(variant => [variant.id, variant.sku]), second.listing.variants.map(variant => [variant.id, variant.sku]))
})

test('taxonomy captures national team, World Cup, player, fit and lifecycle', () => {
  const taxonomy = inferCommaTaxonomy(sourceProduct({
    title:'La Pulga Floral Jersey',
    tags:['Argentina', 'Lionel', 'Messi', 'Legends', 'Size - Athletic Fit', 'World Cup'],
    body_html:'<p>NOTE: This product is a pre-order and is estimated to ship later.</p>'
  })).taxonomy
  assert.equal(taxonomy.category, 'Soccer Jerseys')
  assert.equal(taxonomy.nationalTeam, 'argentina')
  assert.equal(taxonomy.player, 'lionel-messi')
  assert.equal(taxonomy.competition, 'world-cup')
  assert.equal(taxonomy.theme, 'football-legends')
  assert.equal(taxonomy.fit, 'athletic')
  assert.equal(taxonomy.lifecycle, 'pre-order')
})

test('club taxonomy reuses existing Jersevo league and team routes', () => {
  const arsenal = inferCommaTaxonomy(sourceProduct({ title:'North London Jersey', tags:['Arsenal', 'Premier League'] })).taxonomy
  const psg = inferCommaTaxonomy(sourceProduct({ title:'The Parisians Jersey', tags:['PSG', 'Ligue 1'] })).taxonomy
  assert.deepEqual([arsenal.league, arsenal.team], ['epl', 'arsenal'])
  assert.deepEqual([psg.league, psg.team], ['ligue1', 'paris-saint-germain'])
})

test('sanitization removes source branding, URLs and licensed claims from public copy', () => {
  const clean = sanitizeCommaPublicText('<p>Officially licensed Maradona® x Comma product. See https://commafootball.com/x</p>')
  assert.equal(/commafootball|licensed|https?:/i.test(clean), false)
  assert.match(clean, /Maradona collection/i)
  assert.deepEqual(commaHtmlToBlocks('<h2>Story</h2><p>A match memory.</p>', 'Demo').map(block => block.type), ['heading', 'paragraph'])
})

test('source-hosted media stays private until upload and public shape has no source URL', () => {
  const item = normalizeCommaProduct(sourceProduct())
  assert.equal(item.listing.media.length, 0)
  assert.match(item.media[0].sourceUrl, /cdn\.shopify\.com/)
  assert.equal(publicCommaListingHasSourceReferences(item.listing), false)
  assert.equal(publicCommaListingHasSourceReferences({ title:'Demo', image:'https://commafootball.com/demo.jpg' }), true)
})

test('only three canonical collection intents are generated, all as drafts', () => {
  const legend = normalizeCommaProduct(sourceProduct({ tags:['Spain', 'World Cup', 'Legends', 'Iniesta'] }))
  const collections = buildCommaCollectionPlan([legend])
  assert.deepEqual(collections.map(collection => collection.handle), ['world-cup-jerseys', 'national-team-jerseys', 'football-legends'])
  assert.ok(collections.every(collection => collection.status === 'DRAFT' && collection.products.length === 1))
  assert.equal(classifyCommaSourceCollection({ title:'2025 BFCM Price Drop', handle:'2025-bfcm-price-drop', products_count:35 }), 'OPERATIONAL')
  assert.equal(classifyCommaSourceCollection({ title:'Argentina', handle:'argentina', products_count:49 }), 'CUSTOMER_INTENT')
  const report = commaImportReport({ items:[legend], collections, sourceCollections:[{ id:1, title:'Argentina', handle:'argentina', products_count:49 }] })
  assert.deepEqual(report.sourceCollectionAudit, [{ sourceId:'1', handle:'argentina', title:'Argentina', products:49, kind:'CUSTOMER_INTENT' }])
})

test('new catalogue landing routes use structured intent fields', () => {
  const item = normalizeCommaProduct(sourceProduct({ tags:['Spain', 'World Cup', 'Legends', 'Iniesta'] })).listing
  assert.equal(productMatchesCatalogCategory(item, catalogCategoryByHandle('world-cup-jerseys')), true)
  assert.equal(productMatchesCatalogCategory(item, catalogCategoryByHandle('national-team-jerseys')), true)
  assert.equal(productMatchesCatalogCategory(item, catalogCategoryByHandle('football-legends')), true)
  assert.equal(productMatchesCatalogCategory({ ...item, taxonomy:{ ...item.taxonomy, competition:'' } }, catalogCategoryByHandle('world-cup-jerseys')), false)
  assert.deepEqual(catalogCategoryIntentFilter(catalogCategoryByHandle('world-cup-jerseys')), { operator:'eq', field:'taxonomy->>competition', value:'world-cup' })
  assert.deepEqual(catalogCategoryIntentFilter(catalogCategoryByHandle('national-team-jerseys')), { operator:'presentAny', fields:['taxonomy->>nationalTeam','taxonomy->>national_team'] })
  assert.deepEqual(catalogCategoryIntentFilter(catalogCategoryByHandle('football-legends')), { operator:'eq', field:'taxonomy->>theme', value:'football-legends' })
})
