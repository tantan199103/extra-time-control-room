import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('homepage personalizer keeps the supplied model locked to name and number', async () => {
  const [main, personalizer] = await Promise.all([
    read('../src/main.jsx'),
    read('../src/HomeJerseyPersonalizer.jsx')
  ])
  const options = main.slice(main.indexOf('function CustomOptions'), main.indexOf('function QualityProof'))

  assert.match(options, /PERSONALIZE<br \/>\s*<em>YOUR JERSEY\.<\/em>/)
  assert.match(options, /<HomeJerseyPersonalizer \/>/)
  assert.doesNotMatch(options, /home-custom-name|home-custom-num|RONALDO 7|MAHOMES 15/)
  assert.match(personalizer, /MODEL_URL = '\/assets\/models\/jersey\.glb'/)
  assert.match(personalizer, /LIVE REAR VIEW · MADE ON DEMAND/)
  assert.match(personalizer, /MAX_NAME_LENGTH = 12/)
  assert.match(personalizer, /MAX_NUMBER_LENGTH = 2/)
  assert.match(personalizer, /import\('three'\)/)
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

