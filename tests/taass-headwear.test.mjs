import test from 'node:test'
import assert from 'node:assert/strict'
import { isTaassHeadwearListing, isTaassHeadwearUrl, prepareTaassHeadwearPublication } from '../scripts/taass-headwear-lib.mjs'
import { isHeadwearProduct } from '../src/lib/storefront-model.js'
import { isTaassJerseyListing, withTaassCatalogCategory } from '../scripts/taass-catalog-routing.mjs'

test('headwear discovery covers German and English hat URLs without matching Capitals team names', () => {
  assert.equal(isTaassHeadwearUrl('https://www.taass.com/boston-bruins-nhl-pudelmuetze/121628-g51'), true)
  assert.equal(isTaassHeadwearUrl('https://www.taass.com/new-era-59fifty-snapback-cap/720001-g51'), true)
  assert.equal(isTaassHeadwearUrl('https://www.taass.com/nhl-santa-weihnachtsmannmuetze/405114-g51'), true)
  assert.equal(isTaassHeadwearUrl('https://www.taass.com/washington-capitals-nhl-hoodie/120001-g51'), false)
})

test('skully headwear URLs are included in the cap import scope', () => {
  assert.equal(isTaassHeadwearUrl('https://www.taass.com/buffalo-bills-2026-nfl-training-camp-skully-schwarz/721480-g51'), true)
  assert.equal(isTaassHeadwearListing({ title:'Buffalo Bills 2026 NFL Training Camp Skully', productGroup:'Knit Hats' }), true)
  assert.equal(isTaassHeadwearListing({ title:'New Era 59FIFTY Sticker Cap Key Chain Gold', productGroup:'New Era' }), false)
})

test('headwear confirmation accepts caps and knit hats but not Capitals apparel', () => {
  assert.equal(isTaassHeadwearListing({ title: 'Washington Capitals Team Cap', productGroup: 'Caps' }), true)
  assert.equal(isTaassHeadwearListing({ title: 'Washington Capitals Hoodie', productGroup: 'Pullovers' }), false)
  assert.equal(isTaassHeadwearListing({ title: 'St. Louis Blues Knit Hat', productGroup: 'Knit Hats' }), true)
  assert.equal(isTaassHeadwearListing({ title: 'Hat Trick Team T-Shirt', productGroup: 'T-Shirts' }), false)
  assert.equal(isTaassJerseyListing(withTaassCatalogCategory({ title: 'Jersey Shore Snapback Cap', productGroup: 'Caps', taxonomy: { league: 'mlb' } })), false)
})

test('storefront recognizes headwear for product-specific PDP content', () => {
  assert.equal(isHeadwearProduct({ productGroup: 'Caps', title: 'Team cap' }), true)
  assert.equal(isHeadwearProduct({ productGroup: 'Jerseys', title: 'Washington Capitals jersey' }), false)
})

function hatListing(overrides = {}) {
  return {
    id: 'listing-hat-1', handle: 'penguins-fitted-cap', title: 'Pittsburgh Penguins American Needle Fitted NHL Cap',
    productGroup: 'Caps', taxonomy: { league: 'nhl', team: 'pittsburgh-penguins', brand: 'American Needle' },
    description: 'A fitted cap with the Pittsburgh Penguins mark.', status: 'DRAFT', type: 'READY TO SHIP',
    image: 'https://project.supabase.co/storage/v1/object/public/product-media/hat.avif',
    media: [{ id: 'media-1', type: 'IMAGE', url: 'https://project.supabase.co/storage/v1/object/public/product-media/hat.avif', alt: 'Pittsburgh Penguins cap front view' }],
    tags: ['nhl', 'pittsburgh-penguins', 'caps'], options: [], customFields: [], contentBlocks: [],
    price: 29.95, compareAt: null, seo: { title: 'Pittsburgh Penguins American Needle Fitted NHL Cap', description: 'Fitted cap.' },
    variants: [{ id: 'variant-hat-1', sku: 'ET-HAT-1', values: {}, price: 29.95, compareAt: null, cost: null, inventory: 1000, status: 'ACTIVE', weightGrams: null, barcode: '' }],
    ...overrides
  }
}

test('safe stocked hat with media gains published and indexable states', () => {
  const { item, publishable, blockers } = prepareTaassHeadwearPublication({ listing: hatListing() }, '2026-09-23T00:00:00.000Z')
  assert.equal(publishable, true, blockers.join(', '))
  assert.equal(item.listing.status, 'PUBLISHED')
  assert.equal(item.listing.seoStatus, 'INDEXABLE')
  assert.equal(item.listing.variants[0].status, 'ACTIVE')
  assert.ok(item.listing.description.length >= 160)
  assert.ok(item.listing.seo.description.length >= 120 && item.listing.seo.description.length <= 160)
})

test('major brand hat stays draft pending catalogue rights review', () => {
  const branded = hatListing({ title: 'adidas NHL Knit Hat', taxonomy: { league: 'nhl', brand: 'adidas' } })
  const { item, publishable, blockers } = prepareTaassHeadwearPublication({ listing: branded })
  assert.equal(publishable, false)
  assert.deepEqual(blockers, ['RIGHTS_REVIEW_REQUIRED'])
  assert.equal(item.listing.status, 'DRAFT')
})

test('operator-confirmed headwear rights are recorded before publishing a major brand hat', () => {
  const branded = hatListing({ title: 'adidas NHL Knit Hat', taxonomy: { league: 'nhl', brand: 'adidas' } })
  const { item, publishable, blockers } = prepareTaassHeadwearPublication({ listing: branded }, '2026-09-23T00:00:00.000Z', { approveRights: true })
  assert.equal(publishable, true, blockers.join(', '))
  assert.equal(item.listing.status, 'PUBLISHED')
  assert.equal(item.listing.seoStatus, 'INDEXABLE')
  assert.equal(item.listing.aiMetadata.catalogReview.status, 'APPROVED')
  assert.equal(item.listing.aiMetadata.catalogReview.reviewedAt, '2026-09-23T00:00:00.000Z')
})

test('headwear publication removes inferred custom fields from a ready-made cap', () => {
  const inferred = hatListing({
    type: 'PERSONALIZED',
    customFields: [{ id: 'field-name', key: 'name', label: 'Name', type: 'text', required: false }],
    personalization: ['Name']
  })
  const { item, publishable, blockers } = prepareTaassHeadwearPublication({ listing: inferred })
  assert.equal(publishable, true, blockers.join(', '))
  assert.equal(item.listing.type, 'READY TO SHIP')
  assert.deepEqual(item.listing.customFields, [])
  assert.deepEqual(item.listing.personalization, [])
})
