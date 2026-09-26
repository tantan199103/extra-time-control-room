import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCatalogTaxonomy } from '../src/lib/taxonomy-validator.js'
import { seoReviewGate } from '../src/lib/catalog-model.js'

test('taxonomy validator blocks cross-league copy without treating cap as hockey', () => {
  const mismatch = validateCatalogTaxonomy({
    title: 'Dallas Cowboys NHL Cap',
    taxonomy: { league: 'NFL', team: 'dallas-cowboys' },
    productGroup: 'Caps'
  })
  assert.equal(mismatch.valid, false)
  assert.ok(mismatch.blockers.includes('TAXONOMY_LEAGUE_TEXT_MISMATCH'))

  const capitals = validateCatalogTaxonomy({
    title: 'Washington Capitals supporter cap',
    taxonomy: { league: 'NHL', team: 'washington-capitals' },
    productGroup: 'Caps'
  })
  assert.equal(capitals.valid, true)
  assert.deepEqual(capitals.blockers, [])
})

test('taxonomy validator checks team ownership and jersey sport', () => {
  const wrongTeam = validateCatalogTaxonomy({
    title: 'Toronto Blue Jays cap',
    taxonomy: { league: 'NFL', team: 'Toronto Blue Jays' },
    productGroup: 'Caps'
  })
  assert.ok(wrongTeam.blockers.includes('TAXONOMY_TEAM_LEAGUE_MISMATCH'))

  const wrongGroup = validateCatalogTaxonomy({
    title: 'Boston Celtics hockey jersey',
    taxonomy: { league: 'NBA', team: 'Boston Celtics' },
    productGroup: 'Hockey Jersey'
  })
  assert.ok(wrongGroup.blockers.includes('TAXONOMY_PRODUCT_GROUP_MISMATCH'))
  assert.ok(wrongGroup.blockers.includes('TAXONOMY_SPORT_MISMATCH'))

  const soccer = validateCatalogTaxonomy({
    title: 'Arsenal personalized soccer jersey',
    taxonomy: { league: 'Premier League', team: 'Arsenal', sport: 'soccer' },
    productGroup: 'Soccer Jersey'
  })
  assert.equal(soccer.valid, true)
  assert.equal(soccer.normalized.league, 'epl')
})

test('taxonomy validator separates wrestling promotions and racing series', () => {
  const wwe = validateCatalogTaxonomy({
    title: 'WWE Legends trading card box',
    taxonomy: { league: 'wwe', sport: 'wrestling' },
    productGroup: 'Collectibles'
  })
  assert.equal(wwe.valid, true)

  const aew = validateCatalogTaxonomy({
    title: 'AEW All Elite Wrestling hobby box',
    taxonomy: { league: 'aew', sport: 'wrestling' },
    productGroup: 'Collectibles'
  })
  assert.equal(aew.valid, true)

  const f1 = validateCatalogTaxonomy({
    title: 'Formula 1 Chrome Racing hobby box',
    taxonomy: { league: 'formula1', sport: 'motorsports' },
    productGroup: 'Collectibles'
  })
  assert.equal(f1.valid, true)

  const mislabelledAew = validateCatalogTaxonomy({
    title: 'AEW All Elite Wrestling hobby box',
    taxonomy: { league: 'wwe', sport: 'wrestling' },
    productGroup: 'Collectibles'
  })
  assert.equal(mislabelledAew.valid, false)
  assert.ok(mislabelledAew.blockers.includes('TAXONOMY_LEAGUE_TEXT_MISMATCH'))

  const mislabelledF1 = validateCatalogTaxonomy({
    title: 'Formula 1 Chrome Racing hobby box',
    taxonomy: { league: 'nascar', sport: 'motorsports' },
    productGroup: 'Collectibles'
  })
  assert.equal(mislabelledF1.valid, false)
  assert.ok(mislabelledF1.blockers.includes('TAXONOMY_LEAGUE_TEXT_MISMATCH'))
})

test('taxonomy blockers are shared by the SEO gate', () => {
  const product = {
    status: 'PUBLISHED', title: 'Dallas Cowboys NHL Cap', image: '/cap.webp',
    description: 'A '.repeat(100), media: [{ type: 'IMAGE', url: '/cap.webp', alt: 'Dallas Cowboys cap' }],
    seo: { title: 'Dallas Cowboys cap for supporters | Jersevo', description: 'A '.repeat(70) },
    tags: ['nfl'], type: 'READY TO SHIP', taxonomy: { league: 'NFL', team: 'dallas-cowboys' },
    productGroup: 'Caps', customFields: [], options: [], variants: [{ id: 'v1', sku: 'CAP-1', values: {}, price: 30, inventory: 2, status: 'ACTIVE' }]
  }
  const gate = seoReviewGate(product)
  assert.equal(gate.ready, false)
  assert.ok(gate.blockers.includes('TAXONOMY_LEAGUE_TEXT_MISMATCH'))
  assert.equal(gate.taxonomy.valid, false)
})
