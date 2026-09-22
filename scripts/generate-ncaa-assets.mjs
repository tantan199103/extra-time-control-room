import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const NCAA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 69 69" width="400" height="400">
  <path d="M59.402 34.312h-7.339l-.878 3.073h1.13l-3.639 5.709-.502-8.782h-7.402l-.815 3.01h1.129l-4.83 7.34h-4.015c-.439 0-2.007-.377-2.007-2.384 0-2.007 1.882-4.893 3.826-4.893h.816c-.125.502-.44 1.506-.44 1.506h3.576l1.255-4.642H33.81c-3.388 0-6.148 2.446-7.026 4.956l1.443-4.956h-4.893l-.878 3.074h1.255l-1.255 4.453-3.2-7.527h-4.578l-.878 3.136h1.254l-2.823 10.288h3.639s1.38-5.081 1.756-6.398a1145.14 1145.14 0 002.634 6.398h4.078l1.882-6.524a8.099 8.099 0 000 3.01c.376 2.134 2.446 3.514 4.704 3.514h7.402l1.255-1.945h5.206l.125 1.882h4.642l1.192-1.882h5.332l.188 1.945h3.262l.69-1.443-.816-11.918z" fill="#fff"/>
  <path d="M56.203 47.672l-.188-1.944h-5.332l-1.191 1.882H44.85l-.126-1.882h-5.206l-1.255 1.944h-7.401c-2.259 0-4.391-1.38-4.705-3.512a8.099 8.099 0 010-3.011l-1.882 6.523h-4.077s-2.133-5.206-2.635-6.398c-.313 1.318-1.693 6.398-1.693 6.398h-3.638l2.822-10.287H13.8l.878-3.01h4.579l3.2 7.527 1.254-4.454h-1.255l.878-3.074h4.893l-1.443 4.956c.879-2.51 3.639-4.956 7.026-4.956h5.457l-1.255 4.642h-3.575s.314-1.003.44-1.505h-.816c-1.945 0-3.827 2.885-3.827 4.892 0 2.008 1.631 2.384 2.008 2.384h4.014l4.83-7.34h-1.129l.816-3.01h7.401l.502 8.782 3.638-5.708h-1.129l.878-3.074h7.34l.815 11.918c1.63-3.575 2.509-7.527 2.509-11.73 0-15.619-12.608-28.227-28.227-28.227-15.62 0-28.228 12.608-28.228 28.227 0 15.62 12.609 28.227 28.228 28.227a28.127 28.127 0 0024.965-15.054h-3.262v-.126zM41.65 42.59l2.886-4.328.125 4.265h-3.01v.063zm11.354-.063 2.823-4.265.125 4.265h-2.948z" fill="#009cde"/>
</svg>`

export const NCAA_TEAMS_DATA = [
  { slug: 'alabama-crimson-tide', name: 'Alabama Crimson Tide', bg: '#9E1B32', text: '#FFFFFF', accent: '#821025', letter: 'A', sub: 'BAMA' },
  { slug: 'georgia-bulldogs', name: 'Georgia Bulldogs', bg: '#BA0C2F', text: '#FFFFFF', accent: '#000000', letter: 'G', sub: 'UGA' },
  { slug: 'ohio-state-buckeyes', name: 'Ohio State Buckeyes', bg: '#BB0000', text: '#FFFFFF', accent: '#666666', letter: 'O', sub: 'OSU' },
  { slug: 'michigan-wolverines', name: 'Michigan Wolverines', bg: '#00274C', text: '#FFCB05', accent: '#FFCB05', letter: 'M', sub: 'MICH' },
  { slug: 'texas-longhorns', name: 'Texas Longhorns', bg: '#BF5700', text: '#FFFFFF', accent: '#FFFFFF', letter: 'TEXAS', sub: 'UT' },
  { slug: 'notre-dame-fighting-irish', name: 'Notre Dame Fighting Irish', bg: '#0C2340', text: '#C99700', accent: '#C99700', letter: 'ND', sub: 'IRISH' },
  { slug: 'lsu-tigers', name: 'LSU Tigers', bg: '#461D7C', text: '#FDD023', accent: '#FDD023', letter: 'LSU', sub: 'TIGERS' },
  { slug: 'oregon-ducks', name: 'Oregon Ducks', bg: '#154734', text: '#FEE123', accent: '#FEE123', letter: 'O', sub: 'DUCKS' },
  { slug: 'penn-state-nittany-lions', name: 'Penn State Nittany Lions', bg: '#041E42', text: '#FFFFFF', accent: '#FFFFFF', letter: 'PSU', sub: 'LIONS' },
  { slug: 'florida-gators', name: 'Florida Gators', bg: '#0021A5', text: '#FA4616', accent: '#FA4616', letter: 'UF', sub: 'GATORS' },
  { slug: 'usc-trojans', name: 'USC Trojans', bg: '#990000', text: '#FFC72C', accent: '#FFC72C', letter: 'SC', sub: 'TROJANS' },
  { slug: 'tennessee-volunteers', name: 'Tennessee Volunteers', bg: '#FF8200', text: '#FFFFFF', accent: '#58595B', letter: 'T', sub: 'VOLS' },
  { slug: 'oklahoma-sooners', name: 'Oklahoma Sooners', bg: '#841617', text: '#FDF9D8', accent: '#FDF9D8', letter: 'OU', sub: 'SOONERS' },
  { slug: 'clemson-tigers', name: 'Clemson Tigers', bg: '#F56600', text: '#522D80', accent: '#522D80', letter: 'CU', sub: 'CLEMSON' },
  { slug: 'florida-state-seminoles', name: 'Florida State Seminoles', bg: '#782F40', text: '#CEB888', accent: '#CEB888', letter: 'FSU', sub: 'NOLES' },
  { slug: 'north-carolina-tar-heels', name: 'North Carolina Tar Heels', bg: '#7BAFD4', text: '#FFFFFF', accent: '#13294B', letter: 'UNC', sub: 'TAR HEELS' },
  { slug: 'kentucky-wildcats', name: 'Kentucky Wildcats', bg: '#0033A0', text: '#FFFFFF', accent: '#FFFFFF', letter: 'UK', sub: 'CATS' },
  { slug: 'duke-blue-devils', name: 'Duke Blue Devils', bg: '#003087', text: '#FFFFFF', accent: '#FFFFFF', letter: 'DUKE', sub: 'DEVILS' },
  { slug: 'miami-hurricanes', name: 'Miami Hurricanes', bg: '#005030', text: '#F47321', accent: '#F47321', letter: 'U', sub: 'CANES' },
  { slug: 'colorado-buffaloes', name: 'Colorado Buffaloes', bg: '#000000', text: '#CFB87C', accent: '#CFB87C', letter: 'CU', sub: 'BUFFS' },
  { slug: 'auburn-tigers', name: 'Auburn Tigers', bg: '#0C2340', text: '#E87722', accent: '#E87722', letter: 'AU', sub: 'WAR EAGLE' },
  { slug: 'washington-huskies', name: 'Washington Huskies', bg: '#4B2E83', text: '#E8D3A2', accent: '#E8D3A2', letter: 'UW', sub: 'DAWGS' },
  { slug: 'wisconsin-badgers', name: 'Wisconsin Badgers', bg: '#C5050C', text: '#FFFFFF', accent: '#FFFFFF', letter: 'W', sub: 'BADGERS' },
  { slug: 'ucla-bruins', name: 'UCLA Bruins', bg: '#2D68C4', text: '#F2A900', accent: '#F2A900', letter: 'UCLA', sub: 'BRUINS' },
  { slug: 'texas-am-aggies', name: 'Texas A&M Aggies', bg: '#500000', text: '#FFFFFF', accent: '#FFFFFF', letter: 'ATM', sub: 'AGGIES' },
  { slug: 'nebraska-cornhuskers', name: 'Nebraska Cornhuskers', bg: '#E41C38', text: '#FDF2D9', accent: '#FDF2D9', letter: 'N', sub: 'HUSKERS' },
  { slug: 'iowa-hawkeyes', name: 'Iowa Hawkeyes', bg: '#000000', text: '#FFCD00', accent: '#FFCD00', letter: 'IOWA', sub: 'HAWKS' },
  { slug: 'michigan-state-spartans', name: 'Michigan State Spartans', bg: '#18453B', text: '#FFFFFF', accent: '#FFFFFF', letter: 'MSU', sub: 'SPARTANS' },
  { slug: 'kansas-jayhawks', name: 'Kansas Jayhawks', bg: '#0051BA', text: '#E8000D', accent: '#FFC82D', letter: 'KU', sub: 'JAYHAWKS' },
  { slug: 'indiana-hoosiers', name: 'Indiana Hoosiers', bg: '#990000', text: '#EEEDEB', accent: '#EEEDEB', letter: 'IU', sub: 'HOOSIERS' }
]

function makeTeamBadgeSvg(team) {
  const fontSize = team.letter.length > 3 ? 56 : team.letter.length > 1 ? 84 : 110
  const yOffset = team.letter.length > 3 ? 148 : team.letter.length > 1 ? 154 : 162
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260" width="260" height="260">
  <defs>
    <radialGradient id="grad-${team.slug}" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.28"/>
    </radialGradient>
    <filter id="shadow-${team.slug}" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.35"/>
    </filter>
  </defs>
  <!-- Outer Shield Badge -->
  <circle cx="130" cy="130" r="118" fill="${team.bg}" stroke="${team.accent}" stroke-width="6" filter="url(#shadow-${team.slug})"/>
  <circle cx="130" cy="130" r="118" fill="url(#grad-${team.slug})"/>
  <!-- Inner Stitched Ring -->
  <circle cx="130" cy="130" r="106" fill="none" stroke="${team.accent}" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.6"/>
  <!-- Team Monogram / Lettermark -->
  <text x="130" y="${yOffset}" font-family="system-ui, -apple-system, 'Arial Black', Impact, sans-serif" font-size="${fontSize}" font-weight="900" font-style="italic" fill="${team.text}" stroke="${team.accent === team.text ? '#00000033' : team.accent}" stroke-width="${team.letter.length > 3 ? 1.5 : 2.5}" text-anchor="middle" letter-spacing="2">${team.letter}</text>
  <!-- Subtitle Ribbon / Tag -->
  <rect x="45" y="194" width="170" height="24" rx="12" fill="${team.accent === team.bg ? '#000000aa' : team.accent}" opacity="0.9"/>
  <text x="130" y="210" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="${team.text === team.accent ? team.bg : team.text}" text-anchor="middle" letter-spacing="2.5">${team.sub}</text>
</svg>`
}

async function run() {
  // 1. Generate NCAA League Mark
  const marksDir = path.join(rootDir, 'public', 'assets', 'leagues', 'marks')
  fs.mkdirSync(marksDir, { recursive: true })
  const ncaaDest = path.join(marksDir, 'ncaa.webp')
  await sharp(Buffer.from(NCAA_SVG))
    .resize(400, 400)
    .webp({ quality: 90 })
    .toFile(ncaaDest)
  console.log('Created NCAA Mark:', ncaaDest)

  // 2. Generate NCAA Team Badges
  const teamsDir = path.join(marksDir, 'teams', 'ncaa')
  fs.mkdirSync(teamsDir, { recursive: true })

  for (const team of NCAA_TEAMS_DATA) {
    const svg = makeTeamBadgeSvg(team)
    const dest = path.join(teamsDir, `${team.slug}.webp`)
    await sharp(Buffer.from(svg))
      .resize(260, 260)
      .webp({ quality: 92 })
      .toFile(dest)
    console.log(`Created team badge: ${team.slug} (${dest})`)
  }
  console.log(`\nSuccessfully generated ${NCAA_TEAMS_DATA.length} team assets!`)
}

run().catch(console.error)
