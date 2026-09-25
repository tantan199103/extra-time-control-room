import test from 'node:test'
import assert from 'node:assert/strict'
import { buildListingInput } from '../src/lib/catalog-model.js'
import {
  TAASS_DEFAULT_INVENTORY,
  groupTaassSitemapRows,
  mergeTaassProductPages,
  normalizeTaassProduct,
  parseTaassProductHtml,
  parseTaassSitemap,
  publicTaassListingHasSourceReferences,
  sanitizeTaassPublicText,
  stripTaassBrandFromTitle,
  taassImportReport
} from '../scripts/taass-import-lib.mjs'

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`
}

function productPage({
  canonical = 'https://www.taass.com/en/demo/806454-medium',
  id = 'variant-medium',
  sku = 'TA-806454-M',
  size = 'M',
  price = '79.95',
  description = '<p>A game-day fan shirt.</p>'
} = {}) {
  return `
    <html><head>
      <link rel="canonical" href="${canonical}">
      <link rel="alternate" hreflang="en" href="${canonical}">
      ${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        productGroupID: 'group-806454',
        name: 'Kansas City Chiefs Fan Shirt',
        description,
        brand: { '@type': 'Brand', name: 'Demo Brand' },
        image: ['https://www.taass.com/media/aa/product-front.jpg'],
        hasVariant: [{
          '@type': 'Product',
          productID: id,
          sku,
          mpn: `MPN-${size}`,
          gtin13: `40000000000${size === 'M' ? '1' : '2'}`,
          weight: { '@type': 'QuantitativeValue', value: 0.25, unitCode: 'KGM' },
          offers: {
            '@type': 'Offer',
            price,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock'
          }
        }]
      })}
    </head><body>
      <table>
        <tr class="properties-row"><th class="properties-label">Sport:</th><td class="properties-value">NFL</td></tr>
        <tr class="properties-row"><th class="properties-label">Team:</th><td class="properties-value">Kansas City Chiefs</td></tr>
        <tr class="properties-row"><th class="properties-label">Product category:</th><td class="properties-value">T-Shirts</td></tr>
      </table>
      <fieldset class="product-detail-configurator-group">
        <legend>Select Size</legend>
        <input id="size-${size}" type="radio" checked="checked">
        <label for="size-${size}"><span>${size}</span><span>In Stock</span></label>
      </fieldset>
    </body></html>`
}

test('ProductGroup JSON-LD and selected size are parsed from a TAASS page', () => {
  const parsed = parseTaassProductHtml(productPage())
  assert.equal(parsed.groupId, 'group-806454')
  assert.equal(parsed.productId, 'variant-medium')
  assert.equal(parsed.familyCode, '806454')
  assert.equal(parsed.sku, 'TA-806454-M')
  assert.deepEqual(parsed.selectedOptions, { Size: 'M' })
  assert.equal(parsed.properties.Team, 'Kansas City Chiefs')
  assert.equal(parsed.weightGrams, 250)
  assert.equal(parsed.inStock, true)
})

test('a simple Product JSON-LD page is supported', () => {
  const html = `
    <link rel="canonical" href="https://www.taass.com/en/single/123456">
    ${jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      productID: 'simple-1',
      sku: 'SIMPLE-1',
      name: 'Single fan cap',
      description: 'A simple cap.',
      image: 'https://www.taass.com/media/bb/cap.jpg',
      offers: { '@type': 'Offer', price: 24.5, priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' }
    })}`
  const parsed = parseTaassProductHtml(html)
  assert.equal(parsed.groupId, '')
  assert.equal(parsed.productId, 'simple-1')
  assert.equal(parsed.familyCode, '123456')
  assert.equal(parsed.price, 24.5)
  assert.equal(parsed.inStock, false)
})

test('sitemap rows are grouped into one product family with multiple variants', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.taass.com/en/demo/806454-small</loc><lastmod>2026-09-20</lastmod></url>
    <url><loc>https://www.taass.com/en/demo/806454-medium</loc><lastmod>2026-09-20</lastmod></url>
    <url><loc>https://www.taass.com/en/cap/123456</loc></url>
  </urlset>`
  const rows = parseTaassSitemap(xml)
  const groups = groupTaassSitemapRows(rows)
  assert.equal(rows.length, 3)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.find(group => group.familyCode === '806454')?.urls, [
    'https://www.taass.com/en/demo/806454-small',
    'https://www.taass.com/en/demo/806454-medium'
  ])
})

test('normalization creates one draft listing with active sizes and inventory 1000 each', () => {
  const small = parseTaassProductHtml(productPage({
    canonical: 'https://www.taass.com/en/demo/806454-small',
    id: 'variant-small',
    sku: 'TA-806454-S',
    size: 'S',
    price: '74.95'
  }))
  const medium = parseTaassProductHtml(productPage())
  const group = mergeTaassProductPages([small, medium], '806454')
  const item = normalizeTaassProduct(group)

  assert.equal(item.listing.status, 'DRAFT')
  assert.equal(item.listing.variants.length, 2)
  assert.deepEqual(item.listing.options, [{ name: 'Size', values: ['S', 'M'] }])
  assert.ok(item.listing.variants.every(variant => variant.status === 'ACTIVE'))
  assert.ok(item.listing.variants.every(variant => variant.inventory === TAASS_DEFAULT_INVENTORY))
  assert.equal(item.listing.inventory, 2 * TAASS_DEFAULT_INVENTORY)
  assert.equal(buildListingInput(item.listing).inventory, 2 * TAASS_DEFAULT_INVENTORY)
  assert.equal(item.listing.price, 74.95)

  const reportItem = taassImportReport({ items: [item] }).items[0]
  assert.deepEqual(reportItem.options, [{ name: 'Size', values: ['S', 'M'] }])
  assert.equal(reportItem.inventoryTotal, 2000)
  assert.ok(reportItem.variantPreview.every(variant => variant.inventory === 1000))
})

test('IDs and SKUs are stable across reruns', () => {
  const group = mergeTaassProductPages([
    parseTaassProductHtml(productPage({ canonical: 'https://www.taass.com/en/demo/806454-small', id: 'variant-small', sku: 'TA-806454-S', size: 'S' })),
    parseTaassProductHtml(productPage())
  ])
  const first = normalizeTaassProduct(group)
  const second = normalizeTaassProduct(group)
  assert.equal(first.listing.id, second.listing.id)
  assert.equal(first.listing.sku, second.listing.sku)
  assert.deepEqual(first.listing.variants.map(variant => [variant.id, variant.sku]), second.listing.variants.map(variant => [variant.id, variant.sku]))
})

test('manufacturer names leave the title while team names and existing handle shape stay intact', () => {
  const group = mergeTaassProductPages([parseTaassProductHtml(productPage())], '806454')
  group.name = 'Brooklyn Nets New Era 59FIFTY Fitted NBA Cap'
  group.brand = 'New Era'
  const item = normalizeTaassProduct(group)
  assert.equal(item.listing.title, 'Brooklyn Nets 59FIFTY Fitted NBA Cap')
  assert.equal(item.listing.seo.title, 'Brooklyn Nets 59FIFTY Fitted NBA Cap')
  assert.match(item.listing.handle, /brooklyn-nets-new-era-59fifty-fitted-nba-cap/)
  assert.equal(item.listing.taxonomy.brand, 'New Era')
  assert.equal(stripTaassBrandFromTitle('2019 Panini Prizm Basketball Hobby Box', 'Panini'), '2019 Prizm Basketball Hobby Box')
  assert.equal(stripTaassBrandFromTitle('St. Louis Blues FOCO Santa Hat', 'Forever Collectibles'), 'St. Louis Blues Santa Hat')
  assert.equal(stripTaassBrandFromTitle('Michael Jordan Jordan Swingman Jersey', 'Jordan'), 'Michael Jordan Swingman Jersey')
  assert.equal(stripTaassBrandFromTitle('Russell Wilson Wilson NFL Football', 'Wilson'), 'Russell Wilson NFL Football')
  assert.equal(stripTaassBrandFromTitle('New York Jets NFL Cap', 'NFL'), 'New York Jets NFL Cap')
})

test('EUR numbers become USD numbers 1:1 and source media stays private', () => {
  const parsed = parseTaassProductHtml(productPage({
    price: '80',
    description: '<p>See https://www.taass.com/private-source for details.</p>'
  }))
  const item = normalizeTaassProduct(mergeTaassProductPages([parsed]))
  assert.equal(item.listing.price, 80)
  assert.equal(item.listing.variants[0].price, 80)
  assert.equal(item.listing.aiMetadata.priceMultiplier, 1)
  assert.equal(item.listing.aiMetadata.sourcePricing[0].currency, 'EUR')
  assert.equal(publicTaassListingHasSourceReferences(item.listing), false)
  assert.match(item.media[0].sourceUrl, /^https:\/\/www\.taass\.com\//)
  assert.equal(publicTaassListingHasSourceReferences({ image: 'https://sample.supabase.co/storage/v1/object/public/product-media/demo.jpg' }), false)
  assert.equal(publicTaassListingHasSourceReferences({ image: 'https://www.taass.com/media/aa/demo.jpg' }), true)
})

test('source store name is removed from bare-brand titles and descriptions', () => {
  assert.equal(sanitizeTaassPublicText('TAASS.com Performance Socks'), 'Performance Socks')
  assert.equal(sanitizeTaassPublicText('TAASS Fan Gear'), 'Fan Gear')
})

test('inventory can be overridden while defaulting to POD stock of 1000', () => {
  const group = mergeTaassProductPages([parseTaassProductHtml(productPage())])
  assert.equal(normalizeTaassProduct(group).listing.variants[0].inventory, 1000)
  assert.equal(normalizeTaassProduct(group, { defaultInventory: 2500 }).listing.variants[0].inventory, 2500)
})

test('all distinct source images are retained and report separates discovered from uploaded images', () => {
  const group = mergeTaassProductPages([parseTaassProductHtml(productPage())])
  group.images = Array.from({ length: 25 }, (_, index) => `https://www.taass.com/media/aa/view-${index}.jpg`)
  const item = normalizeTaassProduct(group)
  const report = taassImportReport({ items: [item] })
  assert.equal(item.media.length, 25)
  assert.equal(report.sourceImages, 25)
  assert.equal(report.importedImages, 0)
  assert.equal(report.items[0].sourceMedia, 25)
  assert.equal(report.items[0].importedMedia, 0)
})
