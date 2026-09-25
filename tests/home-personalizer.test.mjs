import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('homepage personalizer uses real catalogue league listings and AI name/number preview', async () => {
  const [main, personalizer] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/HomeJerseyPersonalizer.jsx')
  ])
  const options = main.slice(main.indexOf('function CustomOptions'), main.indexOf('function QualityProof'))

  assert.match(options, /PERSONALIZE<br \/>\s*<em>YOUR JERSEY\.<\/em>/)
  assert.match(options, /<HomeJerseyPersonalizer/)
  assert.doesNotMatch(options, /home-custom-name|home-custom-num|RONALDO 7|MAHOMES 15/)
  assert.doesNotMatch(options, /custom-options__pill/)
  assert.doesNotMatch(options, /custom-options__lede/)
  assert.doesNotMatch(options, /EXPLORE ALL LEAGUES/)

  // Real catalogue league listings
  assert.match(personalizer, /CATALOGUE_LEAGUE_LISTINGS/)
  assert.match(personalizer, /dallas-cowboys/)
  assert.match(personalizer, /green-bay-packers/)
  assert.match(personalizer, /denver-broncos/)
  assert.match(personalizer, /los-angeles-dodgers/)
  assert.match(personalizer, /teams\/nba\/los-angeles-lakers\.webp/)
  assert.match(personalizer, /teams\/nba\/atlanta-hawks\.webp/)

  // AI name and number generation
  assert.match(personalizer, /api\/ai-preview/)
  assert.match(personalizer, /handleGenerateWithAi/)
  assert.match(personalizer, /RENDER JERSEY|RENDERING JERSEY/i)

  // Clean labels without MAX 12 and 00-99
  assert.doesNotMatch(personalizer, /NAME\s*<span>MAX/i)
  assert.doesNotMatch(personalizer, /NUMBER\s*<span>00/i)

  // Constraints & actions
  assert.match(personalizer, /MAX_NAME_LENGTH = 12/)
  assert.match(personalizer, /MAX_NUMBER_LENGTH = 2/)
  assert.match(personalizer, /ADD TO BAG/)
  assert.match(personalizer, /selectedSize/)

  // Requirement: no 3D (three.js, GLB), no cartoon SVGs/GVs, and no duplicate CSS decal overlay
  assert.doesNotMatch(personalizer, /import\('three'\)/)
  assert.doesNotMatch(personalizer, /jersey\.glb/)
  assert.doesNotMatch(personalizer, /<svg className="jersey-svg"/)
  assert.doesNotMatch(personalizer, /home-personalizer__decal-overlay/)

  const hero = main.slice(main.indexOf('function Hero'), main.indexOf('function HomePath'))
  assert.doesNotMatch(hero, /<JerseySvg/)
  assert.match(hero, /hero__preview-image/)
})

test('home customizer links name and number to pdp target query and session storage', async () => {
  const [main, personalizer] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/HomeJerseyPersonalizer.jsx')
  ])
  assert.match(personalizer, /jersevo_home_custom/)
  assert.match(main, /jersevo_home_custom/)
  assert.match(main, /searchParams\.get\('name'\)/)
  assert.match(main, /searchParams\.get\('number'\)/)
})

test('mobile personalizer consolidates timeline and covers 4 major leagues with full size range and no popular chips', async () => {
  const [personalizer, styles] = await Promise.all([
    read('../src/HomeJerseyPersonalizer.jsx'),
    read('../src/styles.css')
  ])

  // 4 Simple steps timeline
  assert.match(personalizer, /TIMELINE_STEPS/)
  assert.match(personalizer, /home-personalizer__timeline/)

  // 4 Major leagues represented
  assert.match(personalizer, /league:\s*'NFL'/)
  assert.match(personalizer, /league:\s*'MLB'/)
  assert.match(personalizer, /league:\s*'NBA'/)
  assert.match(personalizer, /league:\s*'MLS'/)

  // Popular chips removed
  assert.doesNotMatch(personalizer, /home-personalizer__presets/)
  assert.doesNotMatch(personalizer, /Popular:/)

  // Full size range (XS to 7XL)
  assert.match(personalizer, /FULL_JERSEY_SIZES/)
  for (const size of ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL']) {
    assert.match(personalizer, new RegExp(`'${size}'`))
  }

  // Mobile home-path consolidated
  assert.match(styles, /\.home-path\s*\{\s*display:\s*none\s*!important;/)

  // Mobile edge-to-edge product details panel
  assert.match(styles, /\.home-personalizer__panel\s*\{[^}]*margin-left:\s*-16px;[^}]*margin-right:\s*-16px;[^}]*width:\s*calc\(100%\s*\+\s*32px\);/)
})

test('players section (MADE FOR MORE) harmonizes with customizer in color and connects seamlessly', async () => {
  const styles = await read('../src/styles.css')

  // Color harmony: #e8e7e1 on players-section
  assert.match(styles, /\.players-section\s*\{\s*background:\s*#e8e7e1;/)

  // Seamless connection: custom-options has 0 bottom padding, players-section has compact top padding
  assert.match(styles, /\.custom-options\s*\{[^}]*padding-bottom:\s*0;/)
  assert.match(styles, /\.players-section\s*\{[^}]*padding-top:\s*36px;/)
})

