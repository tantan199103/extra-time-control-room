import test from 'node:test'
import assert from 'node:assert/strict'
import { BOOMBAH_FILL_PATTERNS, DESIGNER_COLOR_PALETTE, DESIGNER_COLOR_PRESETS, US_SPORTS_LEAGUES, US_SPORTS_PATTERN_FAMILIES, US_SPORTS_TEAM_FAMILIES, findBoombahPattern, findUsSportsTeamFamily, teamFamilyPreview } from '../src/lib/designer-options.js'
import { normalizeDesignerSpec } from '../api/customization-order.js'

test('designer owns a broad teamwear palette and quick combinations', () => {
  assert.ok(DESIGNER_COLOR_PALETTE.length >= 50)
  assert.equal(new Set(DESIGNER_COLOR_PALETTE.map(item => item.hex)).size, DESIGNER_COLOR_PALETTE.length)
  assert.ok(DESIGNER_COLOR_PRESETS.length >= 6)
  assert.ok(DESIGNER_COLOR_PRESETS.every(preset => preset.colors.length >= 4))
})

test('Boombah fill patterns stay in the local procedural library', () => {
  assert.ok(BOOMBAH_FILL_PATTERNS.length >= 8)
  assert.equal(findBoombahPattern('carbon-fiber')?.category, 'Performance')
  assert.equal(findBoombahPattern('https://supplier.example/pattern.svg'), null)
  assert.ok(BOOMBAH_FILL_PATTERNS.every(pattern => pattern.preview && pattern.description))
})

test('US team-inspired families cover four leagues with bounded local recipes', () => {
  assert.equal(US_SPORTS_TEAM_FAMILIES.length, 40)
  assert.deepEqual(new Set(US_SPORTS_TEAM_FAMILIES.map(item => item.league)), new Set(US_SPORTS_LEAGUES))
  for (const league of US_SPORTS_LEAGUES) {
    assert.equal(US_SPORTS_TEAM_FAMILIES.filter(item => item.league === league).length, 10)
  }
  assert.equal(new Set(US_SPORTS_TEAM_FAMILIES.map(item => item.id)).size, 40)
  for (const family of US_SPORTS_TEAM_FAMILIES) {
    assert.match(family.id, /^[a-z0-9-]+$/)
    assert.ok(family.colors.length >= 2 && family.colors.length <= 4)
    assert.ok(family.colors.every(color => /^#[0-9A-F]{6}$/i.test(color)))
    assert.ok(US_SPORTS_PATTERN_FAMILIES[family.patternFamily])
    assert.match(teamFamilyPreview(family), /^linear-gradient|^repeating-linear-gradient/)
    assert.equal(family.inspired, true)
  }
  assert.equal(findUsSportsTeamFamily('dallas-cowboys')?.league, 'NFL')
  assert.equal(findUsSportsTeamFamily('https://evil.example/team'), null)
})

test('designer handoff keeps pattern slot colors bounded and provider-scoped', () => {
  const base = {
    source:'JERSEVO_3D_DESIGNER',
    provider:'owayo',
    manifest:'/designer/owayo/cycling-c3/manifest.json',
    designSlug:'etape',
    roster:[{ name:'Rider', number:'90', size:'M' }],
    pattern:{ id:'1813', slug:'honeycomb-2-1813', colorCode:'A', zoneCode:'', versionId:'custom', scale:1.4, opacity:.8, colors:{ '1':'#111311', '2':'#F3ED45', '3':'#2876FF', ignored:'bad' } }
  }
  const spec = normalizeDesignerSpec(base)
  assert.deepEqual(spec.pattern.colors, { '1':'#111311', '2':'#F3ED45', '3':'#2876FF' })
  assert.equal(spec.pattern.zoneCode, '')
  assert.equal(normalizeDesignerSpec({ ...base, provider:'boombah', manifest:'/designer/boombah/products/fastpitch3d.json', pattern:{ slug:'carbon-fiber', zoneCode:'C1', colors:{ accent:'#00E5FF' } } }).pattern.slug, 'carbon-fiber')
  assert.equal(normalizeDesignerSpec({ ...base, pattern:{ slug:'<svg onload=alert(1)>' } }).pattern, null)
  assert.equal(normalizeDesignerSpec({ ...base, pattern:{ slug:'honeycomb-2-1813', familyId:'new-york-yankees' } }).pattern.familyId, 'new-york-yankees')
  assert.equal(normalizeDesignerSpec({ ...base, pattern:{ slug:'honeycomb-2-1813', familyId:'https://evil.example/team' } }).pattern.familyId, '')
  assert.equal(normalizeDesignerSpec({ ...base, colorFamilyId:'dallas-cowboys' }).colorFamilyId, 'dallas-cowboys')
  assert.equal(normalizeDesignerSpec({ ...base, colorFamilyId:'https://evil.example/team' }).colorFamilyId, '')
})
