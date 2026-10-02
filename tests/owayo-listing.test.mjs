import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildOwayoListing, owayoSizeRows } from '../scripts/create-owayo-listing.mjs'
import { seoReviewGate, validateListing } from '../src/lib/catalog-model.js'
import { findActiveVariant } from '../src/lib/variant-selection.js'
import { prepareStorefrontProduct } from '../src/lib/storefront-model.js'

const manifest = JSON.parse(await readFile(resolve('public/designer/studio/cycling-c3/manifest.json'), 'utf8'))

function hydratedListing() {
  const listing = buildOwayoListing(manifest)
  listing.media = listing.media.map((item, index) => ({ ...item, url: `https://cdn.example.test/c3-${index + 1}.avif` }))
  listing.image = listing.media[0].url
  return listing
}

test('Owayo commerce import creates one canonical customizable listing', () => {
  const listing = hydratedListing()
  assert.equal(listing.id, 'listing-jersevo-custom-cycling-jersey-c3')
  assert.equal(listing.status, 'PUBLISHED')
  assert.equal(listing.type, 'PERSONALIZED')
  assert.equal(listing.aiMetadata.designer.provider, 'owayo')
  assert.equal(listing.aiMetadata.designer.designCount, 52)
  assert.equal(listing.aiMetadata.designer.patternCount, 101)
  assert.deepEqual(listing.customFields.map(field => field.key), ['name', 'number', 'teamCity', 'teamLogo'])
  assert.equal(listing.variants.length, 12)
  assert.ok(listing.variants.every(variant => variant.status === 'ACTIVE' && variant.inventory === 1000 && variant.price === 85))
  assert.deepEqual(validateListing(listing), [])
  assert.equal(seoReviewGate(listing).ready, true)
})

test('Owayo source codes and public size labels resolve the same variant', () => {
  const listing = hydratedListing()
  const sizes = owayoSizeRows(manifest)
  assert.equal(sizes[0].code, '2')
  assert.equal(findActiveVariant(listing, '2')?.values.Size, '2 (XS)')
  assert.equal(findActiveVariant(listing, 'XS')?.values.Size, '2 (XS)')
  assert.equal(findActiveVariant(listing, '5')?.values.Size, '5 (M)')
  assert.equal(findActiveVariant(listing, 'M')?.values.Size, '5 (M)')
})

test('public listing copy stays Jersevo-branded while source provenance remains private', () => {
  const listing = hydratedListing()
  const publicCopy = [listing.title, listing.subtitle, listing.description, listing.seo.title, listing.seo.description].join(' ')
  assert.doesNotMatch(publicCopy, /\bowayo\b/i)
  assert.match(listing.media[0].alt, /^Illustrative /)
  assert.equal(listing.aiMetadata.source.provider, 'owayo')
  assert.match(listing.aiMetadata.source.sourcePage, /^https:\/\/www\.owayo\.com\//)
})

test('storefront receives only the validated designer contract', () => {
  const listing = hydratedListing()
  const storefront = prepareStorefrontProduct(listing)
  assert.equal(storefront.designerConfig.provider, 'studio')
  assert.equal(storefront.designerConfig.productId, 'cycling-c3')
  assert.equal(storefront.designerConfig.allowedDesignIds.length, 52)
  assert.equal('aiMetadata' in storefront, false)
  assert.equal('ai_metadata' in storefront, false)
})
