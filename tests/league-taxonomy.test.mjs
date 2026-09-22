import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAGUE_TAXONOMY, findLeague, findTeam, leaguePath, productMatchesTaxonomy, teamMascot, teamPath } from '../src/lib/league-taxonomy.js'

test('league taxonomy exposes stable league and team URLs', () => {
  const nfl = findLeague('NFL')
  const packers = findTeam('nfl', 'green-bay-packers')
  assert.equal(nfl.key, 'nfl')
  assert.equal(packers.name, 'Green Bay Packers')
  assert.equal(leaguePath(nfl), '/league/nfl')
  assert.equal(teamPath(nfl.key, packers), '/team/nfl/green-bay-packers')
  assert.ok(LEAGUE_TAXONOMY.every(league => league.teams.length > 0))
  assert.deepEqual(LEAGUE_TAXONOMY.map(league => league.media?.src), [
    '/assets/leagues/marks/nfl.webp',
    '/assets/leagues/marks/mlb.webp',
    '/assets/leagues/marks/nba.webp',
    '/assets/leagues/marks/mls.webp',
    '/assets/leagues/marks/ncaa.webp',
    '/assets/leagues/marks/epl.webp',
    '/assets/leagues/marks/laliga.webp',
    '/assets/leagues/marks/seriea.webp',
    '/assets/leagues/marks/bundesliga.webp'
  ])
  assert.equal(findTeam('nfl', 'arizona-cardinals').media.src, '/assets/leagues/marks/teams/nfl/arizona-cardinals.webp')
  assert.equal(findTeam('mlb', 'new-york-yankees').media.src, '/assets/leagues/marks/teams/mlb/new-york-yankees.webp')
  assert.equal(findTeam('mls', 'sporting-kc').media.src, '/assets/leagues/marks/teams/mls/sporting-kc.webp')
  assert.equal(findTeam('nba', 'los-angeles-lakers').media.fallback, true)
  const ncaa = findLeague('NCAA')
  const bama = findTeam('ncaa', 'alabama-crimson-tide')
  assert.equal(ncaa.key, 'ncaa')
  assert.equal(bama.name, 'Alabama Crimson Tide')
  assert.equal(leaguePath(ncaa), '/league/ncaa')
  assert.equal(teamPath(ncaa.key, bama), '/team/ncaa/alabama-crimson-tide')
  assert.equal(findTeam('ncaa', 'alabama-crimson-tide').media.src, '/assets/leagues/marks/teams/ncaa/alabama-crimson-tide.webp')
  assert.equal(findTeam('ncaa', 'alabama').slug, 'alabama-crimson-tide')

  const soccer = findLeague('soccer')
  assert.equal(soccer.key, 'soccer')
  assert.equal(soccer.media.src, '/assets/leagues/marks/soccer.webp')
  assert.ok(soccer.teams.length > 30)

  const epl = findLeague('epl')
  assert.equal(epl.name, 'Premier League')
  assert.equal(findTeam('epl', 'arsenal').media.src, '/assets/leagues/marks/teams/epl/arsenal.webp')
  assert.equal(findTeam('epl', 'man-city').slug, 'manchester-city')
  assert.equal(findTeam('laliga', 'real-madrid').media.src, '/assets/leagues/marks/teams/laliga/real-madrid.webp')
  assert.equal(findTeam('seriea', 'inter-milan').media.src, '/assets/leagues/marks/teams/seriea/inter-milan.webp')
  assert.equal(findTeam('bundesliga', 'bayern-munich').media.src, '/assets/leagues/marks/teams/bundesliga/bayern-munich.webp')
})

test('taxonomy matching accepts nested catalog fields and stays selective', () => {
  const product = { name:'Green Bay custom jersey', taxonomy:{ league:'nfl', team:'green-bay-packers', tags:['custom'] } }
  assert.equal(productMatchesTaxonomy(product, { league:'nfl' }), true)
  assert.equal(productMatchesTaxonomy(product, { league:'nfl', team:'green-bay-packers' }), true)
  assert.equal(productMatchesTaxonomy(product, { league:'mlb', team:'green-bay-packers' }), false)
})

test('teamMascot extracts concise mascots for mobile team badges', () => {
  assert.equal(teamMascot('Kansas City Chiefs'), 'Chiefs')
  assert.equal(teamMascot('San Francisco 49ers'), '49ers')
  assert.equal(teamMascot('Tampa Bay Buccaneers'), 'Buccaneers')
  assert.equal(teamMascot('Boston Red Sox'), 'Red Sox')
  assert.equal(teamMascot('Chicago White Sox'), 'White Sox')
  assert.equal(teamMascot('Toronto Blue Jays'), 'Blue Jays')
  assert.equal(teamMascot('Portland Trail Blazers'), 'Trail Blazers')
  assert.equal(teamMascot('Inter Miami CF'), 'Miami')
  assert.equal(teamMascot('Sporting Kansas City'), 'Sporting KC')
  assert.equal(teamMascot('Alabama Crimson Tide'), 'Crimson Tide')
  assert.equal(teamMascot('Notre Dame Fighting Irish'), 'Fighting Irish')
  assert.equal(teamMascot('North Carolina Tar Heels'), 'Tar Heels')
  assert.equal(teamMascot('Michigan Wolverines'), 'Wolverines')
  assert.equal(teamMascot('Arsenal'), 'Arsenal')
  assert.equal(teamMascot('Manchester City'), 'Man City')
  assert.equal(teamMascot('FC Barcelona'), 'Barcelona')
  assert.equal(teamMascot('Bayern Munich'), 'Bayern')
  assert.equal(teamMascot(''), '')
})

