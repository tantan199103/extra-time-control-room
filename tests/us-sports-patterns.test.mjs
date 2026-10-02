import test from 'node:test'
import assert from 'node:assert/strict'
import { createUsSportsPatternSvg } from '../src/lib/us-sports-patterns.js'

const RECIPES = [
  'classic-pinstripe',
  'triple-rail',
  'vertical-contrast',
  'split-field',
  'monochrome-stripe',
  'hockey-horizontal'
]

const COLORS = ['#AA0000', '#FFFFFF', '#003087', '#FCB514']

test('US sports recipes render bounded self-contained SVG primitives', () => {
  for (const recipe of RECIPES) {
    const svg = createUsSportsPatternSvg(recipe, COLORS)
    assert.match(svg, /^<svg\b/)
    assert.match(svg, /width="128" height="128" viewBox="0 0 128 128"/)
    assert.match(svg, /<rect\b/)
    assert.match(svg, /opacity="0\.08"/)
    assert.ok(svg.includes('#AA0000'))
    assert.ok(svg.includes('#FFFFFF'))
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bhref\s*=|\burl\s*\(/i)
  }
})

test('unknown recipes fail closed and colors are strict hex with safe defaults', () => {
  assert.equal(createUsSportsPatternSvg('supplier-pattern', COLORS), '')
  const svg = createUsSportsPatternSvg('triple-rail', ['red', '#12ab34<script>', '#123', 'url(https://evil.example)'])
  assert.match(svg, /fill="#111311"/)
  assert.match(svg, /fill="#F8F8F4"/)
  assert.doesNotMatch(svg, /red|script|https|url\(/i)
  assert.equal(createUsSportsPatternSvg('classic-pinstripe'), createUsSportsPatternSvg('classic-pinstripe', []))
})

test('numeric color map keys are accepted in stable order without external references', () => {
  const svg = createUsSportsPatternSvg('hockey-horizontal', { 2:'#123456', 0:'#654321', 1:'#FEDCBA' })
  assert.ok(svg.includes('#654321'))
  assert.ok(svg.includes('#FEDCBA'))
  assert.ok(svg.includes('#123456'))
  assert.doesNotMatch(svg, /url\(|href=|foreignObject|script/i)
})
