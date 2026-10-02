import test from 'node:test'
import assert from 'node:assert/strict'
import { BOOMBAH_FILL_PATTERNS, DESIGNER_COLOR_PALETTE, DESIGNER_COLOR_PRESETS, findBoombahPattern } from '../src/lib/designer-options.js'
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
})
