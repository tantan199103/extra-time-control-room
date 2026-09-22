import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('homepage personalizer uses real league listing photos and PDP-like customization without 3D or SVGs', async () => {
  const [main, personalizer] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/HomeJerseyPersonalizer.jsx')
  ])
  const options = main.slice(main.indexOf('function CustomOptions'), main.indexOf('function QualityProof'))

  assert.match(options, /PERSONALIZE<br \/>\s*<em>YOUR JERSEY\.<\/em>/)
  assert.match(options, /<HomeJerseyPersonalizer/)
  assert.doesNotMatch(options, /home-custom-name|home-custom-num|RONALDO 7|MAHOMES 15/)
  assert.match(personalizer, /LEAGUE_LISTINGS/)
  assert.match(personalizer, /venom-mockup-back\.webp/)
  assert.match(personalizer, /jersey-black\.webp/)
  assert.match(personalizer, /MAX_NAME_LENGTH = 12/)
  assert.match(personalizer, /MAX_NUMBER_LENGTH = 2/)
  assert.match(personalizer, /ADD TO BAG/)
  assert.match(personalizer, /selectedSize/)
  assert.match(personalizer, /LIVE REAR VIEW/)
  // Requirement: no 3D (three.js, GLB) and no cartoon SVGs/GVs
  assert.doesNotMatch(personalizer, /import\('three'\)/)
  assert.doesNotMatch(personalizer, /jersey\.glb/)
  assert.doesNotMatch(personalizer, /<svg className="jersey-svg"/)
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
