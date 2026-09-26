import test from 'node:test'
import assert from 'node:assert/strict'
import { routeIndexability } from '../src/lib/route-indexability.js'

test('legacy page query redirects to the crawlable path and keeps other filters', () => {
  assert.equal(routeIndexability({ pathname: '/shop', search: '?page=2' }).redirectPath, '/shop/page/2')
  assert.equal(routeIndexability({ pathname: '/team/nfl/dallas-cowboys', search: '?page=3&size=L' }).redirectPath, '/team/nfl/dallas-cowboys/page/3?size=L')
  assert.equal(routeIndexability({ pathname: '/shop/page/3', search: '?page=1' }).redirectPath, '/shop')
})

test('search and facets are noindex follow while tracking parameters stay indexable', () => {
  const search = routeIndexability({ pathname: '/shop', search: '?search=Dallas+Cowboys' })
  assert.equal(search.noindex, true)
  assert.equal(search.robots, 'noindex, follow')
  assert.equal(search.canonicalPath, '/shop')
  assert.ok(search.reasons.includes('CATALOG_SEARCH_QUERY'))

  const facet = routeIndexability({ pathname: '/league/nfl', search: '?size=L&sort=price' })
  assert.equal(facet.noindex, true)
  assert.ok(facet.reasons.includes('CATALOG_FACET_QUERY'))

  const campaign = routeIndexability({ pathname: '/shop', search: '?utm_source=email&utm_campaign=drop' })
  assert.equal(campaign.noindex, false)
  assert.equal(campaign.trackingOnly, true)
  assert.equal(campaign.canonicalPath, '/shop')
})

test('path pagination self-canonicalizes and product mode parameters consolidate cleanly', () => {
  const page = routeIndexability({ pathname: '/shop/page/2' })
  assert.equal(page.noindex, false)
  assert.equal(page.canonicalPath, '/shop/page/2')

  const product = routeIndexability({ pathname: '/product/example', search: '?custom=1&variant=v-2' })
  assert.equal(product.noindex, false)
  assert.equal(product.canonicalPath, '/product/example')

  const personalized = routeIndexability({ pathname: '/product/example', search: '?name=Alex&number=10' })
  assert.equal(personalized.noindex, true)
  assert.ok(personalized.reasons.includes('PRODUCT_PERSONALIZATION_QUERY'))
})

test('plural collection aliases redirect to the singular canonical route', () => {
  const alias = routeIndexability({ pathname: '/collections/ncaa' })
  assert.equal(alias.redirectPath, '/collection/ncaa')
  assert.equal(alias.canonicalPath, '/collection/ncaa')
  const page = routeIndexability({ pathname: '/collections/ncaa/page/2' })
  assert.equal(page.redirectPath, '/collection/ncaa/page/2')
})

test('team product-type landings share the catalog pagination and robots contract', () => {
  const route = routeIndexability({ pathname: '/team/nfl/dallas-cowboys/jerseys' })
  assert.equal(route.catalogRoute, true)
  assert.equal(route.noindex, false)
  assert.equal(route.canonicalPath, '/team/nfl/dallas-cowboys/jerseys')
  const page = routeIndexability({ pathname: '/team/nfl/dallas-cowboys/jerseys', search: '?page=2' })
  assert.equal(page.redirectPath, '/team/nfl/dallas-cowboys/jerseys/page/2')
})

test('routing middleware declares the catalog matchers and response-level robots contract', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../middleware.js', import.meta.url), 'utf8')
  assert.match(source, /from '@vercel\/functions'/)
  assert.match(source, /X-Robots-Tag/)
  assert.match(source, /status:\s*308/)
  assert.match(source, /'\/shop\/:path\*'/)
})
