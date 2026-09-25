import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { LEAGUE_TAXONOMY } from '../src/lib/league-taxonomy.js'

/**
 * Fetches only the team marks that are missing from the curated taxonomy.
 *
 * The ESPN teams feed is used as a discovery/source index and its CDN image
 * is copied into the repository. Runtime pages never depend on the remote
 * host. The generated manifest records the source URL and a rights reminder;
 * team marks remain third-party trademarks and must be reviewed before any
 * commercial/licensed use.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const assetRoot = path.join(rootDir, 'public', 'assets', 'leagues', 'marks', 'teams')
const manifestPath = path.join(rootDir, 'public', 'assets', 'leagues', 'marks', 'team-sources.json')

const FEEDS = Object.freeze({
  nba: Object.freeze({
    sport: 'basketball',
    league: 'nba',
    apiUrl: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
  }),
  nhl: Object.freeze({
    sport: 'hockey',
    league: 'nhl',
    apiUrl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams'
  }),
  mls: Object.freeze({
    sport: 'soccer',
    league: 'usa.1',
    apiUrl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams'
  })
})

// Provider names have changed over time (LAFC, Red Bull New York, etc.). Keep
// the exceptions explicit instead of silently choosing a similarly named club.
const PROVIDER_NAME_ALIASES = Object.freeze({
  'mls/los-angeles-fc': 'LAFC',
  'mls/new-york-red-bulls': 'Red Bull New York',
  'mls/st-louis-city': 'St. Louis CITY SC',
  'mls/vancouver-whitecaps': 'Vancouver Whitecaps',
  'mls/cf-montreal': 'CF Montréal',
  'mls/dc-united': 'D.C. United',
  'mls/houston-dynamo': 'Houston Dynamo FC',
  'mls/atlanta-united': 'Atlanta United FC',
  'mls/chicago-fire': 'Chicago Fire FC',
  'mls/fc-cincinnati': 'FC Cincinnati',
  'mls/fc-dallas': 'FC Dallas',
  'mls/inter-miami': 'Inter Miami CF',
  'mls/minnesota-united': 'Minnesota United FC',
  'mls/nashville-sc': 'Nashville SC',
  'mls/new-york-city-fc': 'New York City FC',
  'mls/orlando-city': 'Orlando City SC',
  'mls/seattle-sounders': 'Seattle Sounders FC',
  'mls/sporting-kc': 'Sporting Kansas City',
  'mls/toronto-fc': 'Toronto FC',
  'mls/san-diego-fc': 'San Diego FC',
  'mls/san-jose-earthquakes': 'San Jose Earthquakes'
})

function comparable(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Jersevo team asset audit/1.0' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function fetchImage(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Jersevo team asset fetch/1.0' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const contentType = response.headers.get('content-type') || ''
  if (!/^image\//i.test(contentType)) throw new Error(`unexpected content type ${contentType || 'unknown'}`)
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType }
}

function providerTeamFor(leagueKey, team, providerTeams) {
  const key = `${leagueKey}/${team.slug}`
  const expected = PROVIDER_NAME_ALIASES[key] || team.name
  const expectedComparable = comparable(expected)
  const exact = providerTeams.find(item => comparable(item.displayName) === expectedComparable)
  if (exact) return exact

  // A conservative secondary match handles suffixes such as FC/SC without
  // allowing an arbitrary partial name to select a different club.
  const expectedWords = expectedComparable.replace(/fc|sc|cf|city/g, '')
  const suffixMatch = providerTeams.filter(item => {
    const candidate = comparable(item.displayName).replace(/fc|sc|cf|city/g, '')
    return candidate === expectedWords
  })
  if (suffixMatch.length === 1) return suffixMatch[0]
  return null
}

async function processAndSave(input, destination) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  await sharp(input)
    .rotate()
    .resize(320, 320, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, effort: 6 })
    .toFile(destination)
  return sharp(destination).metadata()
}

async function loadManifest() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function main() {
  const force = process.argv.includes('--force')
  const manifest = await loadManifest()
  const assets = { ...(manifest.assets || {}) }
  const fetchedAt = new Date().toISOString()
  const missing = []
  let saved = 0

  for (const league of LEAGUE_TAXONOMY) {
    const feed = FEEDS[league.key]
    if (!feed) continue
    const response = await fetchJson(feed.apiUrl)
    const providerTeams = (response.sports?.[0]?.leagues?.[0]?.teams || [])
      .map(entry => entry.team)
      .filter(team => team && team.displayName && team.logos?.[0]?.href)

    for (const team of league.teams) {
      const key = `${league.key}/${team.slug}`
      const destination = path.join(assetRoot, league.key, `${team.slug}.webp`)
      if (!force && fs.existsSync(destination)) continue

      const providerTeam = providerTeamFor(league.key, team, providerTeams)
      if (!providerTeam) {
        missing.push({ key, name: team.name, reason: 'No unambiguous provider match' })
        continue
      }

      try {
        const sourceUrl = providerTeam.logos[0].href
        const { buffer, contentType } = await fetchImage(sourceUrl)
        const metadata = await processAndSave(buffer, destination)
        const relativePath = `/${path.relative(path.join(rootDir, 'public'), destination).replaceAll(path.sep, '/')}`
        assets[key] = {
          team: team.name,
          league: league.key,
          path: relativePath,
          source: 'ESPN public teams feed / ESPN CDN',
          sourceApi: feed.apiUrl,
          sourceUrl,
          sourceMime: contentType,
          retrievedAt: fetchedAt,
          format: 'image/webp',
          width: metadata.width,
          height: metadata.height,
          bytes: (await fs.promises.stat(destination)).size,
          rights: 'Team mark/trademark. Verify commercial and league permissions before use.'
        }
        saved += 1
        console.log(`saved ${key} <- ${providerTeam.displayName}`)
      } catch (error) {
        missing.push({ key, name: team.name, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  const output = {
    schemaVersion: 1,
    generatedAt: fetchedAt,
    purpose: 'Local team marks for navigation and taxonomy pages; runtime does not fetch remote logos.',
    provider: 'ESPN public teams feed and ESPN CDN',
    rightsNotice: 'Team and league marks are trademarks. This manifest records provenance, not a commercial license or affiliation.',
    assets,
    unresolved: missing
  }
  await fs.promises.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(`\nSaved ${saved} logo(s). Unresolved: ${missing.length}.`)
  if (missing.length) {
    console.error(JSON.stringify(missing, null, 2))
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
