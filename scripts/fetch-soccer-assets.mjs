import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const SOCCER_LEAGUE_MARKS = {
  soccer: 'https://a.espncdn.com/combiner/i?img=/redesign/assets/img/icons/ESPN-icon-soccer.png',
  epl: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
  laliga: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
  seriea: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
  bundesliga: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
  ligue1: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
  ucl: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png'
}

const SOCCER_TEAMS = {
  epl: [
    { slug: 'arsenal', name: 'Arsenal', id: 359 },
    { slug: 'aston-villa', name: 'Aston Villa', id: 362 },
    { slug: 'chelsea', name: 'Chelsea', id: 363 },
    { slug: 'everton', name: 'Everton', id: 368 },
    { slug: 'fulham', name: 'Fulham', id: 370 },
    { slug: 'liverpool', name: 'Liverpool', id: 364 },
    { slug: 'manchester-city', name: 'Manchester City', id: 382 },
    { slug: 'manchester-united', name: 'Manchester United', id: 360 },
    { slug: 'newcastle-united', name: 'Newcastle United', id: 361 },
    { slug: 'tottenham-hotspur', name: 'Tottenham Hotspur', id: 367 },
    { slug: 'west-ham-united', name: 'West Ham United', id: 371 },
    { slug: 'wolverhampton-wanderers', name: 'Wolverhampton Wanderers', id: 380 },
    { slug: 'brighton-and-hove-albion', name: 'Brighton & Hove Albion', id: 331 },
    { slug: 'crystal-palace', name: 'Crystal Palace', id: 384 },
    { slug: 'brentford', name: 'Brentford', id: 337 },
    { slug: 'nottingham-forest', name: 'Nottingham Forest', id: 393 }
  ],
  laliga: [
    { slug: 'real-madrid', name: 'Real Madrid', id: 86 },
    { slug: 'fc-barcelona', name: 'FC Barcelona', id: 83 },
    { slug: 'atletico-madrid', name: 'Atlético Madrid', id: 1068 },
    { slug: 'athletic-club', name: 'Athletic Club Bilbao', id: 93 },
    { slug: 'real-sociedad', name: 'Real Sociedad', id: 89 },
    { slug: 'real-betis', name: 'Real Betis', id: 244 },
    { slug: 'sevilla', name: 'Sevilla FC', id: 243 },
    { slug: 'valencia', name: 'Valencia CF', id: 94 },
    { slug: 'villarreal', name: 'Villarreal CF', id: 102 },
    { slug: 'girona', name: 'Girona FC', id: 9812 }
  ],
  seriea: [
    { slug: 'inter-milan', name: 'Inter Milan', id: 110 },
    { slug: 'juventus', name: 'Juventus', id: 111 },
    { slug: 'ac-milan', name: 'AC Milan', id: 103 },
    { slug: 'napoli', name: 'Napoli', id: 114 },
    { slug: 'as-roma', name: 'AS Roma', id: 104 },
    { slug: 'lazio', name: 'SS Lazio', id: 112 },
    { slug: 'atalanta', name: 'Atalanta', id: 125 },
    { slug: 'fiorentina', name: 'Fiorentina', id: 109 }
  ],
  bundesliga: [
    { slug: 'bayern-munich', name: 'Bayern Munich', id: 132 },
    { slug: 'borussia-dortmund', name: 'Borussia Dortmund', id: 124 },
    { slug: 'bayer-leverkusen', name: 'Bayer Leverkusen', id: 131 },
    { slug: 'rb-leipzig', name: 'RB Leipzig', id: 11420 },
    { slug: 'eintracht-frankfurt', name: 'Eintracht Frankfurt', id: 125 },
    { slug: 'vfb-stuttgart', name: 'VfB Stuttgart', id: 134 }
  ],
  ligue1: [
    { slug: 'paris-saint-germain', name: 'Paris Saint-Germain', id: 160 },
    { slug: 'olympique-marseille', name: 'Olympique de Marseille', id: 166 },
    { slug: 'as-monaco', name: 'AS Monaco', id: 174 },
    { slug: 'olympique-lyonnais', name: 'Olympique Lyonnais', id: 167 },
    { slug: 'lille', name: 'Lille OSC', id: 165 }
  ]
}

async function fetchImageBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function processAndSave(buffer, destPath, { width = 400, height = 400 } = {}) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  await sharp(buffer)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(destPath)
}

async function run() {
  console.log('1. Fetching Soccer League Marks...')
  const marksDir = path.join(rootDir, 'public', 'assets', 'leagues', 'marks')
  for (const [leagueKey, url] of Object.entries(SOCCER_LEAGUE_MARKS)) {
    try {
      const buf = await fetchImageBuffer(url)
      const dest = path.join(marksDir, `${leagueKey}.webp`)
      await processAndSave(buf, dest, { width: 400, height: 400 })
      console.log(`✓ Saved league mark: ${leagueKey}.webp`)
    } catch (err) {
      console.error(`✗ Error fetching league mark ${leagueKey}:`, err.message)
    }
  }

  console.log('\n2. Fetching Soccer Club Logos...')
  for (const [leagueKey, teams] of Object.entries(SOCCER_TEAMS)) {
    const leagueTeamDir = path.join(marksDir, 'teams', leagueKey)
    for (const team of teams) {
      try {
        const url = `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`
        const buf = await fetchImageBuffer(url)
        const dest = path.join(leagueTeamDir, `${team.slug}.webp`)
        await processAndSave(buf, dest, { width: 260, height: 260 })
        console.log(`✓ Saved club: ${leagueKey}/${team.slug} (${team.name})`)
      } catch (err) {
        console.error(`✗ Error fetching ${leagueKey}/${team.slug}:`, err.message)
      }
    }
  }

  console.log('\nFinished fetching soccer assets!')
}

run().catch(console.error)
