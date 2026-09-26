import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalogPageTree, catalogPageTreeStats, flattenCatalogPageTree, productMatchesCatalogPage } from '../src/lib/catalog-page-tree.js'

const rows = [
  { taxonomy:{ league:'nfl', team:'dallas-cowboys', category:'Football Jerseys' }, productGroup:'Football Jersey', count:8 },
  { taxonomy:{ league:'nfl', team:'dallas-cowboys', category:'Accessories', accessoryCategory:'Headwear', accessoryType:'Caps' }, productGroup:'Caps', count:5 },
  { taxonomy:{ league:'mlb', team:'new-york-yankees', category:'Accessories', accessoryCategory:'Headwear', accessoryType:'Caps' }, productGroup:'Caps', count:6 },
  { taxonomy:{ category:'Accessories', accessoryCategory:'Bags', accessoryType:'Bags' }, productGroup:'Bags', count:10 }
]

test('catalog page tree separates generated league, team, type and category routes', () => {
  const tree = buildCatalogPageTree(rows)
  const pages = flattenCatalogPageTree(tree, [])
  const dallas = pages.find(page => page.path === '/team/nfl/dallas-cowboys')
  const dallasJerseys = pages.find(page => page.path === '/team/nfl/dallas-cowboys/jerseys')
  const dallasCaps = pages.find(page => page.path === '/team/nfl/dallas-cowboys/caps')
  const bags = pages.find(page => page.path === '/category/bags')

  assert.equal(dallas.count,13)
  assert.equal(dallas.status,'INDEXABLE')
  assert.equal(dallasJerseys.count,8)
  assert.equal(dallasCaps,undefined,'a team product-type route is not generated below the six-product threshold')
  assert.equal(bags.count,10)
  assert.equal(pages.find(page => page.path === '/team/nfl/arizona-cardinals').status,'NOINDEX')

  const stats = catalogPageTreeStats(tree)
  assert.ok(stats.total > stats.teams)
  assert.equal(stats.groups,2)
  assert.equal(stats.indexable + stats.noindex, stats.total)
  assert.equal(stats.leagues,2)
  assert.ok(stats.productTypes >= 2)
  assert.ok(stats.categories >= 20)
})

test('catalog page product matcher follows generated route taxonomy', () => {
  const jersey = { taxonomy:{ league:'nfl', team:'dallas-cowboys', category:'Football Jerseys' }, productGroup:'Football Jersey' }
  const bag = { taxonomy:{ category:'Accessories', accessoryCategory:'Bags', accessoryType:'Bags' }, productGroup:'Bags' }
  assert.equal(productMatchesCatalogPage(jersey,'/league/nfl'),true)
  assert.equal(productMatchesCatalogPage(jersey,'/team/nfl/dallas-cowboys/jerseys'),true)
  assert.equal(productMatchesCatalogPage(jersey,'/team/nfl/dallas-cowboys/caps'),false)
  assert.equal(productMatchesCatalogPage(bag,'/category/bags'),true)
})
