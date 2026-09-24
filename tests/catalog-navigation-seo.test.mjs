import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG_CATEGORY_PAGES, catalogCategoryByHandle, productMatchesCatalogCategory } from '../src/lib/catalog-taxonomy.js'
import { CATALOG_PAGE_SIZE, catalogPagePath, pageCount, parseCatalogPagePath } from '../src/lib/catalog-pagination.js'
import { findLeague, findTeam, leaguePath, teamPath } from '../src/lib/league-taxonomy.js'

test('category landing pages match the controlled catalogue taxonomy', () => {
  const football = catalogCategoryByHandle('football-jerseys')
  assert.equal(football.value, 'Football Jerseys')
  assert.equal(productMatchesCatalogCategory({ taxonomy:{ category:'Football Jerseys' }, productGroup:'Jerseys' }, football), true)
  assert.equal(productMatchesCatalogCategory({ taxonomy:{ category:'Basketball Jerseys' }, productGroup:'Jerseys' }, football), false)
  const custom = catalogCategoryByHandle('custom-jerseys')
  assert.equal(productMatchesCatalogCategory({ customFields:[{ key:'name' }] }, custom), true)
  assert.equal(productMatchesCatalogCategory({ customFields:[] }, custom), false)
  assert.equal(new Set(CATALOG_CATEGORY_PAGES.map(item => item.handle)).size, CATALOG_CATEGORY_PAGES.length)
})

test('catalog pages get stable crawlable paths with one canonical per page', () => {
  assert.equal(CATALOG_PAGE_SIZE, 36)
  assert.equal(pageCount(73), 3)
  assert.equal(catalogPagePath('/category/football-jerseys', 1), '/category/football-jerseys')
  assert.equal(catalogPagePath('/category/football-jerseys', 2), '/category/football-jerseys/page/2')
  assert.deepEqual(parseCatalogPagePath('/team/nhl/boston-bruins/page/3'), {
    basePath:'/team/nhl/boston-bruins', page:3, paginated:true
  })
  assert.equal(parseCatalogPagePath('/product/example/page/2').basePath, '/product/example/page/2')
})

test('NHL catalogue links resolve from league through team', () => {
  const league = findLeague('nhl')
  const team = findTeam('nhl','boston-bruins')
  assert.equal(leaguePath(league), '/league/nhl')
  assert.equal(teamPath(league.key,team), '/team/nhl/boston-bruins')
  assert.equal(league.media.src, '/assets/leagues/marks/nhl.svg')
})
