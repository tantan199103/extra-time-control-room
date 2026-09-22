import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Mapping of our NCAA teams to ESPN team IDs
const NCAA_TEAM_IDS = {
  'alabama-crimson-tide': 333,
  'georgia-bulldogs': 61,
  'ohio-state-buckeyes': 194,
  'michigan-wolverines': 130,
  'texas-longhorns': 251,
  'notre-dame-fighting-irish': 87,
  'lsu-tigers': 99,
  'oregon-ducks': 2483,
  'penn-state-nittany-lions': 213,
  'florida-gators': 57,
  'usc-trojans': 30,
  'tennessee-volunteers': 2633,
  'oklahoma-sooners': 201,
  'clemson-tigers': 228,
  'florida-state-seminoles': 52,
  'north-carolina-tar-heels': 153,
  'kentucky-wildcats': 96,
  'duke-blue-devils': 150,
  'miami-hurricanes': 2390,
  'colorado-buffaloes': 38,
  'auburn-tigers': 2,
  'washington-huskies': 264,
  'wisconsin-badgers': 275,
  'ucla-bruins': 26,
  'texas-am-aggies': 245,
  'nebraska-cornhuskers': 158,
  'iowa-hawkeyes': 2294,
  'michigan-state-spartans': 127,
  'kansas-jayhawks': 2305,
  'indiana-hoosiers': 84
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

async function processAndSave(buffer, destPath, { width = 300, height = 300 } = {}) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  await sharp(buffer)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toFile(destPath)
}

async function run() {
  console.log('Fetching official NCAA team logos...')
  const ncaaDir = path.join(rootDir, 'public', 'assets', 'leagues', 'marks', 'teams', 'ncaa')
  
  for (const [slug, id] of Object.entries(NCAA_TEAM_IDS)) {
    try {
      const url = `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
      const buf = await fetchImageBuffer(url)
      const dest = path.join(ncaaDir, `${slug}.webp`)
      await processAndSave(buf, dest, { width: 260, height: 260 })
      console.log(`✓ Saved NCAA: ${slug} (ESPN ID: ${id})`)
    } catch (err) {
      console.error(`✗ Error fetching NCAA ${slug}:`, err.message)
    }
  }
  console.log('All NCAA official logos processed.')
}

run().catch(console.error)
