import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAGUE_TAXONOMY, findLeague, findTeam, leaguePath, productMatchesTaxonomy, teamPath } from '../src/lib/league-taxonomy.js'

test('league taxonomy exposes stable league and team URLs', () => {
  const nfl = findLeague('NFL')
  const packers = findTeam('nfl', 'green-bay-packers')
  assert.equal(nfl.key, 'nfl')
  assert.equal(packers.name, 'Green Bay Packers')
  assert.equal(leaguePath(nfl), '/league/nfl')
  assert.equal(teamPath(nfl.key, packers), '/team/nfl/green-bay-packers')
  assert.ok(LEAGUE_TAXONOMY.every(league => league.teams.length > 0))
  assert.deepEqual(LEAGUE_TAXONOMY.map(league => league.media?.src), [
    '/assets/leagues/fangear-reference/nfl.webp',
    '/assets/leagues/fangear-reference/mlb.webp',
    '/assets/leagues/fangear-reference/nba.webp',
    '/assets/leagues/fangear-reference/mls.webp'
  ])
})

test('taxonomy matching accepts nested catalog fields and stays selective', () => {
  const product = { name:'Green Bay custom jersey', taxonomy:{ league:'nfl', team:'green-bay-packers', tags:['custom'] } }
  assert.equal(productMatchesTaxonomy(product, { league:'nfl' }), true)
  assert.equal(productMatchesTaxonomy(product, { league:'nfl', team:'green-bay-packers' }), true)
  assert.equal(productMatchesTaxonomy(product, { league:'mlb', team:'green-bay-packers' }), false)
})
