import test from 'node:test'
import assert from 'node:assert/strict'
import {
  availableFinderSizes,
  canonicalSize,
  recommendCatalogSize,
  sizeFinderAudiences
} from '../src/lib/size-guide.js'
import { addBusinessDays, buildDeliveryEstimate, businessDayRange } from '../src/lib/product-commerce.js'

test('size guide normalizes extended sizes and keeps only sellable catalog sizes', () => {
  assert.equal(canonicalSize('XXL'), '2XL')
  assert.equal(canonicalSize('XXXXXXX L'), '7XL')
  const product = {
    options: [{ name: 'Fit Type', values: ['Adult', 'Kids', 'Youth'] }, { name: 'Size', values: ['S', 'M', 'L', 'XXL', '3XL'] }],
    variants: [
      { status: 'ACTIVE', inventory: 2, values: { 'Fit Type': 'Adult', Size: 'S' } },
      { status: 'ACTIVE', inventory: 1, values: { 'Fit Type': 'Adult', Size: 'XXL' } },
      { status: 'ACTIVE', inventory: 0, values: { 'Fit Type': 'Adult', Size: 'M' } },
      { status: 'ACTIVE', inventory: 4, values: { 'Fit Type': 'Kids', Size: 'S' } },
      { status: 'ARCHIVED', inventory: 9, values: { 'Fit Type': 'Adult', Size: '3XL' } }
    ]
  }
  assert.deepEqual(sizeFinderAudiences(product).map(item => item.label), ['Adult', 'Kids', 'Youth'])
  assert.deepEqual(availableFinderSizes(product, {
    sizeOptionName: 'Size',
    audienceOptionName: 'Fit Type',
    audienceValue: 'Adult'
  }), ['S', 'XXL'])
  assert.equal(recommendCatalogSize({ audience: 'Adult', heightCm: 175, weightKg: 72, fit: 'RELAXED', availableSizes: ['S', 'XXL'] }), 'XXL')
})

test('size guide does not invent sizes when a variation has no in-stock match', () => {
  const product = {
    options: [{ name: 'Size', values: ['S', 'M'] }],
    variants: [{ status: 'ACTIVE', inventory: 0, values: { Size: 'S' } }]
  }
  assert.deepEqual(availableFinderSizes(product, { sizeOptionName: 'Size' }), [])
  assert.equal(recommendCatalogSize({ availableSizes: [] }), null)
})

test('delivery estimate turns production and transit windows into business-day dates', () => {
  assert.deepEqual(businessDayRange('3–5 business days'), [3, 5])
  const friday = new Date(2026, 8, 18, 12)
  const monday = addBusinessDays(friday, 1)
  assert.equal(monday.getDay(), 1)
  const estimate = buildDeliveryEstimate({ production: '3–5 business days', transit: '5–8 business days' }, new Date(2026, 8, 21, 12))
  assert.equal(estimate.ordered, 'Today · Sep 21')
  assert.equal(estimate.orderCutoff, 'Order by 11:59 PM CT')
  assert.equal(estimate.production, 'Sep 24–28')
  assert.equal(estimate.delivered, 'Oct 1–8')
  assert.equal(estimate.productionDays, '3–5 business days')
})
