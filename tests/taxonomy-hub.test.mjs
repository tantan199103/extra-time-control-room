import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { taxonomyHubCounts } from '../src/lib/taxonomy-hub.js'
import { discoveryIndex } from '../src/lib/discovery-navigation.js'

const rows = [
  { taxonomy:{league:'nfl',team:'dallas-cowboys'}, productGroup:'Caps', count:24 },
  { taxonomy:{league:'nfl',team:'dallas-cowboys'}, productGroup:'Football Jersey', count:11 },
  { taxonomy:{league:'nfl',team:'green-bay-packers'}, productGroup:'Caps', count:17 },
  { taxonomy:{league:'nba',team:'los-angeles-lakers'}, productGroup:'Caps', count:9 }
]

test('league hub counts all published products rather than deduplicated index rows', () => {
  const result = taxonomyHubCounts(rows,{ league:'nfl' })
  assert.equal(result.total,52)
  assert.equal(result.teams.get('dallas-cowboys'),35)
  assert.deepEqual(result.groups.map(group => [group.name,group.count]), [['Caps',41],['Football Jersey',11]])
  assert.equal(discoveryIndex(rows).total,61)
  assert.equal(discoveryIndex(rows).teamCounts.get('nfl/dallas-cowboys'),35)
})

test('team hub keeps other teams out of product-type facets', () => {
  const result = taxonomyHubCounts(rows,{ league:'nfl', team:'dallas-cowboys' })
  assert.equal(result.total,35)
  assert.deepEqual(result.groups.map(group => [group.name,group.count]), [['Caps',24],['Football Jersey',11]])
})

test('taxonomy routes keep the hub visible while their own product page loads', async () => {
  const source = await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(source,/taxonomyLoading = catalogState\.loading \|\| catalogState\.routeKey !== catalogRequestKey/)
  assert.match(source,/!taxonomyRoute && !path\.startsWith\('\/admin'\)/)
  assert.match(source,/loading=\{taxonomyLoading \|\| navigationLoading\}/)
  assert.match(source,/loading \? <div className="shop-grid-loading" role="status">/)
  assert.match(source,/const indexedCount = selectedGroup/)
  assert.match(source,/discoveryProducts\.length \? indexedCount : filtered\.length/)
})

test('team and league catalogue controls share one compact header frame', async () => {
  const source = await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  const css = await readFile(new URL('../src/taxonomy-hubs.css',import.meta.url),'utf8')
  assert.match(source, /taxonomy-hub-hero taxonomy-hub-hero--unified/)
  assert.match(source, /id="taxonomy-products-title"/)
  assert.match(source, /taxonomy-control-strip__bottom/)
  assert.doesNotMatch(source, /<StorefrontTrust compact \/>\s*<section className="taxonomy-products/)
  assert.match(css, /\.taxonomy-hub-hero--unified\s*\{[\s\S]*?border-bottom-color:\s*var\(--ink\)/)
  assert.match(source, /Fan gear for every team\./)
  assert.match(source, /taxonomy-hub-hero__visual/)
  assert.match(source, /taxonomy-hub-teams__sort/)
  assert.match(source, /Most gear/)
})
