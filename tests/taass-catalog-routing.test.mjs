import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG_CATEGORY_OPTIONS } from '../src/lib/catalog-taxonomy.js'
import {
  classifyTaassListing,
  taassCollectionHandles,
  withTaassCatalogCategory
} from '../scripts/taass-catalog-routing.mjs'

test('NFL jerseys join football, league and an existing team collection', () => {
  const listing = withTaassCatalogCategory({
    title: 'Houston Texans Rivalries Jersey',
    productGroup: 'Jerseys',
    taxonomy: { league: 'nfl', sport: 'football', team: 'houston-texans' }
  })
  assert.equal(listing.taxonomy.category, 'Football Jerseys')
  assert.deepEqual(taassCollectionHandles(listing, new Set(['houston-texans'])), ['football-jersey', 'nfl', 'houston-texans'])
  assert.deepEqual(taassCollectionHandles(listing), ['football-jersey', 'nfl'])
})

test('NBA, NHL and soccer merchandise use distinct catalogue routes', () => {
  assert.equal(classifyTaassListing({ title: 'Celtics Jersey', productGroup: 'Jerseys', taxonomy: { league: 'nba' } }), 'Basketball Jerseys')
  assert.deepEqual(taassCollectionHandles({ title: 'Celtics Jersey', productGroup: 'Jerseys', taxonomy: { league: 'nba' } }), ['basketball-jersey', 'nba'])
  assert.deepEqual(taassCollectionHandles({ title: 'Blue Jackets Knit Hat', productGroup: 'Knit Hats', taxonomy: { league: 'nhl' } }), ['accessories', 'nhl'])
  assert.deepEqual(taassCollectionHandles({ title: 'Atlanta United Soccer Jersey', productGroup: 'Jerseys', taxonomy: { league: 'mls', sport: 'soccer' } }, new Set(['atlanta-united-fc'])), ['soccer-jersey', 'mls', 'soccer'])
})

test('apparel, collectibles and unknown gear are not forced into jersey collections', () => {
  assert.equal(classifyTaassListing({ title: 'Game socks', productGroup: 'Socks', taxonomy: { league: 'nfl' } }), 'Fan Apparel')
  assert.equal(classifyTaassListing({ title: 'Signed trading card', productGroup: 'Cards' }), 'Collectibles')
  assert.equal(classifyTaassListing({ title: 'Replica game ball', productGroup: 'Balls' }), 'Fan Gear')
  const manual = withTaassCatalogCategory({ title: 'Sample hat', taxonomy: { category: 'Accessories', season: 'Archive' } })
  assert.equal(manual.taxonomy.category, 'Accessories')
  assert.equal(manual.taxonomy.season, 'Archive')
  for (const category of ['Hockey Jerseys', 'Soccer Jerseys', 'Collectibles', 'Fan Gear']) {
    assert.ok(CATALOG_CATEGORY_OPTIONS.some(option => option.value === category))
  }
})
