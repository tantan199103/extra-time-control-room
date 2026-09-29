import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TOPPERZ_DEFAULT_STOCK,
  inferTopperzTaxonomy,
  normalizeTopperzProduct,
  parseTopperzProductHtml,
  parseTopperzSitemap,
  parseTopperzSitemapIndex,
  publicTopperzListingHasSourceReferences
} from '../scripts/topperz-import-lib.mjs'

function productPage({ availability = 'https://schema.org/LimitedAvailability', price = 42.9 } = {}) {
  const schema = [{
    '@context': 'https://schema.org/',
    '@type': 'Product',
    '@id': 'NES-TEST-1',
    name: 'New Era New York Yankees Prime Edition 9Forty A Frame Snapback Hat',
    description: 'A classic adjustable cap with a curved visor.',
    sku: 'NES-TEST-1',
    mpn: 'MPN-TEST-1',
    gtin12: '123456789012',
    brand: { '@type': 'Brand', name: 'New Era' },
    image: ['https://www.topperzstore.com/media/demo/front.jpg', 'https://www.topperzstore.com/media/demo/back.jpg'],
    offers: { '@type': 'Offer', availability, priceCurrency: 'USD', price }
  }, {
    '@type': 'BreadcrumbList',
    itemListElement: [{ '@type': 'ListItem', position: 1, name: 'CAPS' }]
  }]
  return `<html><head><link rel="canonical" href="https://www.topperzstore.com/new-era-yankees-test"><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body>
    <div class="product-detail-properties"><span>Color:</span> Navy<br><span>League:</span> MLB<br><span>Team:</span> New York Yankees<br><span>Material:</span> 100% cotton<br></div>
    <fieldset class="product-detail-configurator-group"><legend><span>Select </span>Size</legend><input id="small" type="radio"><label for="small" title="OSFA">OSFA</label></fieldset>
    <input name="lineItems[abcdefabcdefabcdefabcdefabcdefab][id]" value="abcdefabcdefabcdefabcdefabcdefab">
    <span class="product-detail-ordernumber-label">Product number:</span><span class="product-detail-ordernumber">NES-TEST-1</span>
  </body></html>`
}

test('Topperz JSON-LD and Shopware properties map to controlled taxonomy', () => {
  const parsed = parseTopperzProductHtml(productPage())
  assert.equal(parsed.sku, 'NES-TEST-1')
  assert.equal(parsed.sourceId, 'abcdefabcdefabcdefabcdefabcdefab')
  assert.equal(parsed.properties.League, 'MLB')
  assert.deepEqual(parsed.options, [{ name: 'Size', values: ['OSFA'] }])
  assert.equal(parsed.inStock, true)
  const taxonomy = inferTopperzTaxonomy(parsed)
  assert.equal(taxonomy.productGroup, 'Caps')
  assert.equal(taxonomy.league, 'mlb')
  assert.equal(taxonomy.team, 'new-york-yankees')
})

test('normalization sets 1000 stock per variant and keeps source URLs private', () => {
  const parsed = parseTopperzProductHtml(productPage())
  const item = normalizeTopperzProduct(parsed)
  assert.equal(item.listing.status, 'DRAFT')
  assert.equal(item.listing.variants[0].inventory, TOPPERZ_DEFAULT_STOCK)
  assert.equal(item.listing.variants[0].status, 'ACTIVE')
  assert.equal(item.listing.taxonomy.accessoryType, 'Caps')
  assert.equal(publicTopperzListingHasSourceReferences(item.listing), false)
  assert.match(item.media[0].sourceUrl, /^https:\/\/www\.topperzstore\.com\//)
  assert.equal(publicTopperzListingHasSourceReferences({ image: 'https://www.topperzstore.com/media/demo.jpg' }), true)
  assert.equal(publicTopperzListingHasSourceReferences({ image: 'https://ofetusgarxcwloxxkhnr.supabase.co/storage/v1/object/public/product-media/demo.avif' }), false)
})

test('sold-out source pages still become auditable 1000-stock drafts when requested', () => {
  const parsed = parseTopperzProductHtml(productPage({ availability: 'https://schema.org/SoldOut' }))
  const item = normalizeTopperzProduct(parsed)
  assert.equal(parsed.inStock, false)
  assert.equal(item.listing.variants[0].inventory, 1000)
  assert.equal(item.listing.status, 'DRAFT')
})

test('sitemap index and product rows are deduplicated by the synchronizer', () => {
  const index = `<sitemapindex><sitemap><loc>https://www.topperzstore.com/product-1.xml.gz</loc></sitemap><sitemap><loc>https://www.topperzstore.com/product-1.xml.gz</loc></sitemap></sitemapindex>`
  assert.deepEqual(parseTopperzSitemapIndex(index), ['https://www.topperzstore.com/product-1.xml.gz'])
  const rows = parseTopperzSitemap(`<urlset><url><loc>https://www.topperzstore.com/a</loc></url><url><loc>https://www.topperzstore.com/a</loc></url><url><loc>https://other.example/a</loc></url></urlset>`)
  assert.equal(rows.length, 2)
})
