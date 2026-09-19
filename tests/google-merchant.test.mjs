import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGoogleMerchantCatalogue,
  googleMerchantReadiness,
  normalizeGoogleMerchantItem,
  renderGoogleMerchantTsv,
  renderGoogleMerchantXml
} from '../src/lib/google-merchant.js'

const product = {
  id: 'listing-green-bay',
  handle: 'green-bay-custom-jersey',
  title: 'Green Bay Custom Men’s Jersey',
  subtitle: 'A designer-led football memory piece.',
  description: 'A Green Bay football jersey with a fixed graphic and optional name and number personalization.',
  status: 'PUBLISHED',
  seo_status: 'INDEXABLE',
  seo: { status: 'INDEXABLE', gmc: { brand: 'Extra Time', color: 'Green / gold' } },
  image: 'https://cdn.example.test/green-front.webp',
  media: [
    { type: 'IMAGE', url: 'https://cdn.example.test/green-front.webp' },
    { type: 'IMAGE', url: 'https://cdn.example.test/green-back.webp' }
  ],
  product_group: 'Football Jersey',
  taxonomy: { league: 'nfl', team: 'green-bay-packers' },
  custom_fields: [{ key: 'name', label: 'Name' }],
  variants: [
    { id: 'variant-green-s', sku: 'ET-GREEN-S', status: 'ACTIVE', inventory: 4, price: 59.99, compare_at: 69.99, values: { Size: 'S' } },
    { id: 'variant-green-m', sku: 'ET-GREEN-M', status: 'ACTIVE', inventory: 0, price: 59.99, values: { Size: 'M' } },
    { id: 'variant-green-draft', sku: 'ET-GREEN-D', status: 'DRAFT', inventory: 99, price: 59.99, values: { Size: 'L' } }
  ]
}

test('normalizes one Merchant Center row per active variant', () => {
  const result = buildGoogleMerchantCatalogue([product])
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.items.map(item => item.id), ['variant-green-s', 'variant-green-m'])
  assert.equal(result.items[0].item_group_id, result.items[1].item_group_id)
  assert.equal(result.items[0].availability, 'in stock')
  assert.equal(result.items[1].availability, 'out of stock')
  assert.equal(result.items[0].price, '69.99 USD')
  assert.equal(result.items[0].sale_price, '59.99 USD')
  assert.equal(result.items[0].size, 'S')
  assert.equal(result.items[0].color, 'Green / gold')
  assert.equal(result.items[0].is_bundle, 'yes')
  assert.ok(result.items.every(item => item.title.length <= 70))
  assert.match(result.items[0].link, /variant=variant-green-s/)
  assert.deepEqual(result.items[0].additional_image_link, ['https://cdn.example.test/green-back.webp'])
})

test('custom products use a store brand and stable SKU MPN without inventing a GTIN', () => {
  const result = normalizeGoogleMerchantItem(product, product.variants[0])
  assert.equal(result.item.brand, 'Extra Time')
  assert.equal(result.item.mpn, 'ET-GREEN-S')
  assert.equal(result.item.identifier_exists, 'yes')
  assert.equal('gtin' in result.item, false)
})

test('valid GTIN is preserved and invalid GTIN is omitted with a warning', () => {
  const valid = normalizeGoogleMerchantItem(product, { ...product.variants[0], barcode: '012345678905' })
  assert.equal(valid.item.gtin, '012345678905')
  const invalid = normalizeGoogleMerchantItem(product, { ...product.variants[0], barcode: '123456789013' })
  assert.equal('gtin' in invalid.item, false)
  assert.ok(invalid.warnings.includes('INVALID_GTIN_OMITTED'))
})

test('draft, archived and non-indexable products never enter the feed', () => {
  const result = buildGoogleMerchantCatalogue([
    product,
    { ...product, id: 'draft', status: 'DRAFT' },
    { ...product, id: 'blocked', seo_status: 'BLOCKED', seo: { status: 'BLOCKED' } }
  ])
  assert.equal(result.items.length, 2)
  assert.equal(result.report.rejectedItems, 2)
  assert.equal(result.report.reasonCounts.PRODUCT_NOT_PUBLISHED, 1)
  assert.equal(result.report.reasonCounts.SEO_NOT_INDEXABLE, 1)
})

test('readiness reports missing active variants instead of silently creating a product', () => {
  const result = googleMerchantReadiness({ ...product, variants: [] })
  assert.equal(result.ready, false)
  assert.equal(result.activeVariants, 0)
})

test('an entirely sold-out listing is rejected while mixed-stock groups remain complete', () => {
  const result = buildGoogleMerchantCatalogue([{ ...product, id: 'sold-out', variants: product.variants.slice(1, 2) }])
  assert.equal(result.items.length, 0)
  assert.equal(result.report.reasonCounts.NO_IN_STOCK_VARIANTS, 1)
})

test('XML and TSV renderers escape content and emit Merchant attributes', () => {
  const catalogue = buildGoogleMerchantCatalogue([product])
  const xml = renderGoogleMerchantXml(catalogue, { origin: 'https://www.jersevo.com' })
  assert.match(xml, /xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/)
  assert.match(xml, /<g:item_group_id>listing-green-bay<\/g:item_group_id>/)
  assert.match(xml, /<g:additional_image_link>https:\/\/cdn\.example\.test\/green-back\.webp<\/g:additional_image_link>/)
  assert.doesNotMatch(xml, /fangearsport|openai|gpt-image|apikey\.fan/i)
  const tsv = renderGoogleMerchantTsv(catalogue)
  assert.match(tsv, /^id\ttitle\tdescription\tlink/m)
  assert.match(tsv, /variant-green-s\t/)
  assert.match(tsv, /69\.99 USD/)
})

test('source metadata and unverified affiliation claims block a row', () => {
  const result = normalizeGoogleMerchantItem({
    ...product,
    title: 'Official NFL jersey from fangearsport',
    description: 'OpenAI prompt source: officially licensed.',
  }, product.variants[0])
  assert.equal(result.eligible, false)
  assert.ok(result.blockReasons.includes('SOURCE_METADATA_PRESENT'))
  assert.ok(result.blockReasons.includes('UNVERIFIED_AFFILIATION_CLAIM'))
})
