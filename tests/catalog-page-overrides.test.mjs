import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogPageOverrideFor, catalogPageRouteCanDeleteProducts, normalizeCatalogPageOverrides, upsertCatalogPageOverride } from '../src/lib/catalog-page-overrides.js'

test('catalog page override storage stays keyed by canonical route', () => {
  const rows = upsertCatalogPageOverride({}, '/league/nfl/', { title:'NFL stories', seo:{ title:'NFL gear' } })
  assert.equal(rows['/league/nfl'].title, 'NFL stories')
  assert.equal(rows['/league/nfl'].seoTitle, 'NFL gear')
  assert.equal(catalogPageOverrideFor(rows, '/league/nfl?page=2').title, 'NFL stories')
  assert.deepEqual(Object.keys(normalizeCatalogPageOverrides(rows)), ['/league/nfl'])
})

test('catalog page destructive routes reject system groups', () => {
  assert.equal(catalogPageRouteCanDeleteProducts('/league/nfl'), true)
  assert.equal(catalogPageRouteCanDeleteProducts('/team/nfl/dallas-cowboys'), true)
  assert.equal(catalogPageRouteCanDeleteProducts('/team/nfl/dallas-cowboys/jerseys'), true)
  assert.equal(catalogPageRouteCanDeleteProducts('/category/caps'), true)
  assert.equal(catalogPageRouteCanDeleteProducts('/shop'), false)
  assert.equal(catalogPageRouteCanDeleteProducts('/sports'), false)
})
