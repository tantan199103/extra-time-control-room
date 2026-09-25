import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { LEAGUE_TAXONOMY } from '../src/lib/league-taxonomy.js'

const root = path.resolve('public/assets/leagues/marks/teams')

test('every curated team resolves to a local non-fallback WebP mark', async () => {
  const checks = LEAGUE_TAXONOMY.flatMap(league => league.teams.map(async team => {
    assert.equal(team.media?.fallback, false, `${league.key}/${team.slug} must not use a fallback mark`)
    const file = path.join(root, league.key, `${team.slug}.webp`)
    assert.equal(fs.existsSync(file), true, `${league.key}/${team.slug} asset is missing`)
    const metadata = await sharp(file).metadata()
    assert.equal(metadata.format, 'webp', `${league.key}/${team.slug} must be WebP`)
    assert.ok(metadata.width > 0 && metadata.height > 0, `${league.key}/${team.slug} dimensions are invalid`)
  }))
  await Promise.all(checks)
})

test('newly fetched team marks keep provenance and an explicit rights notice', async () => {
  const manifest = JSON.parse(await fsPromises.readFile('public/assets/leagues/marks/team-sources.json', 'utf8'))
  assert.deepEqual(manifest.unresolved, [])
  for (const key of Object.keys(manifest.assets).filter(item => /^(nba|nhl|mls)\//.test(item))) {
    const asset = manifest.assets[key]
    assert.match(asset.sourceUrl, /^https:\/\/a\.espncdn\.com\//)
    assert.match(asset.rights, /trademark/i)
    assert.equal(asset.format, 'image/webp')
  }
})
