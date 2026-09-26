import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePageLayoutWithDefaults, normalizePageLayout, pageIdForPath, resolvePageBlocks, resolvePageContent } from '../src/lib/theme-runtime.js'

test('page paths resolve to the same editable page contract used by Admin', () => {
  assert.equal(pageIdForPath('/'), 'home')
  assert.equal(pageIdForPath('/shop'), 'collection')
  assert.equal(pageIdForPath('/product/after-90'), 'product')
  assert.equal(pageIdForPath('/category/accessories'), 'collection')
  assert.equal(pageIdForPath('/custom'), 'custom')
})

test('published page layout owns order and visibility while legacy string layouts fall back safely', () => {
  const defaults = [{ id: 'hero', enabled: true }, { id: 'rail', enabled: true }, { id: 'faq', enabled: true }]
  const theme = { pages: [{ id: 'home', layout: [{ id: 'faq', order: 0 }, { id: 'hero', order: 1, enabled: false }] }], blocks: defaults }
  assert.deepEqual(resolvePageBlocks(theme, 'home', defaults).map(block => [block.id, block.enabled]), [['faq', true], ['hero', false]])
  const legacy = { pages: [{ id: 'home', layout: ['announcement', 'header', 'hero', 'manifesto'] }], blocks: [{ id: 'newsletter', enabled: true }] }
  assert.deepEqual(resolvePageBlocks(legacy, 'home', defaults).map(block => block.id), defaults.map(block => block.id))
})

test('page copy is scoped and legacy home copy remains readable', () => {
  const theme = { content: { headline: 'Legacy home', pages: { product: { headline: 'Product-specific' } } } }
  assert.equal(resolvePageContent(theme, 'home', { headline: 'Default' }).headline, 'Legacy home')
  assert.equal(resolvePageContent(theme, 'product', { headline: 'Default' }).headline, 'Product-specific')
})

test('Admin page layouts normalize old strings into safe editable entries', () => {
  assert.deepEqual(normalizePageLayout(['hero', 'rail']).map(block => block.id), ['hero', 'rail'])
  assert.deepEqual(mergePageLayoutWithDefaults({ layout: ['hero'] }, [], [{ id: 'hero' }, { id: 'faq' }]).map(block => block.id), ['hero', 'faq'])
})

test('legacy page rows use page-specific defaults instead of the homepage block list', () => {
  const global = [{ id: 'hero', type: 'Hero' }, { id: 'rail', type: 'Rail' }, { id: 'footer', type: 'Footer' }]
  const productDefaults = [{ id: 'product-gallery' }, { id: 'product-buybox' }, { id: 'product-story' }]
  const layout = mergePageLayoutWithDefaults({ id: 'product', layout: ['header', 'gallery', 'product-info', 'footer'] }, global, productDefaults)
  assert.deepEqual(layout.map(block => block.id), ['product-gallery', 'product-buybox', 'product-story'])
})
