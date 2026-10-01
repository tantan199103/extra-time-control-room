import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  MOCKUP_PRINT_AREAS,
  MOCKUP_SCENE_PRESETS,
  normalizeMockupCatalog,
  normalizeMockupCatalogEntry,
  normalizeMockupAsset,
  validateMockupAsset
} from '../src/lib/mockup-workflow.js'

test('mockup catalog adapter keeps metadata-only provenance and deduplicates entries', () => {
  const catalog = normalizeMockupCatalog({ entries:[
    { id:'Football Jersey', title:'Football Jersey', category:'Jerseys', printAreas:['front-center','bad-area'], adapter:{ provider:'boombah', productId:'FOOTBALL3D' } },
    { id:'football-jersey', title:'Duplicate' }
  ] })
  assert.equal(catalog.entries.length, 1)
  assert.equal(catalog.entries[0].category, 'jerseys')
  assert.deepEqual(catalog.entries[0].printAreas, ['front-center'])
  assert.equal(catalog.source.licenseStatus, 'metadata-only')
  assert.equal(catalog.entries[0].adapter.provider, 'boombah')
})

test('mockup asset validation bounds type and size without accepting bytes in the contract', () => {
  const valid = validateMockupAsset({ name:'badge.png', mime:'image/png', bytes:1024, width:1200, height:800 }, { kind:'artwork' })
  assert.equal(valid.ok, true)
  assert.equal(valid.asset.placement, 'front-center')
  assert.equal(validateMockupAsset({ name:'bad.pdf', mime:'application/pdf', bytes:10 }, { kind:'artwork' }).ok, false)
  assert.match(validateMockupAsset({ name:'huge.png', mime:'image/png', bytes:9 * 1024 * 1024 }, { kind:'artwork' }).error, /8 MB/)
})

test('workflow print areas and scene presets are deterministic', () => {
  assert.equal(MOCKUP_PRINT_AREAS.length, 9)
  assert.equal(MOCKUP_SCENE_PRESETS.find(item => item.id === 'transparent').background, 'transparent')
  assert.equal(normalizeMockupCatalogEntry({ title:'Hoodie', printAreas:['back-center','back-center'] }).printAreas.length, 1)
  assert.equal(normalizeMockupAsset({ kind:'artwork', mimeType:'IMAGE/PNG', size:42 }).mime, 'image/png')
})

test('3DMockups snapshot covers the public catalog without republishing source previews', async () => {
  const snapshot = JSON.parse(await readFile(resolve('public/designer/3dmockups/catalog.json'), 'utf8'))
  assert.equal(snapshot.entries.length, 18)
  assert.equal(snapshot.entries.filter(entry => entry.adapter?.status === 'mapped').length, 7)
  assert.equal(snapshot.entries.filter(entry => !entry.adapter).length, 11)
  assert.ok(snapshot.entries.every(entry => !/3dmockups\.app/i.test(entry.preview || '')))
  assert.ok(snapshot.entries.find(entry => entry.id === 'hoodie' && !entry.adapter))
  assert.ok(snapshot.entries.find(entry => entry.id === 'baseball-jersey' && entry.adapter?.provider === 'boombah'))
  assert.equal(snapshot.source.licenseStatus, 'metadata-only')
})
