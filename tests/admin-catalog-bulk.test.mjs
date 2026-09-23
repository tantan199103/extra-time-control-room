import test from 'node:test'
import assert from 'node:assert/strict'
import { runAdminCatalogBulk } from '../src/lib/admin-catalog-bulk.js'
import { prepareDraftVariantActivation } from '../src/lib/catalog-model.js'

const summary = { id:'listing-a', name:'Matchday', _catalogSummary:true, variants:[], media:[] }
const full = {
  id:'listing-a', name:'Matchday', status:'DRAFT', price:59,
  media:[{ id:'hero', url:'/hero.webp' }], contentBlocks:[{ id:'story', content:'Original story' }],
  options:[{ name:'Size', values:['S','M','L'] }], tags:['football'],
  variants:[
    { id:'s', sku:'MATCH-S', values:{Size:'S'}, price:59, inventory:0, status:'DRAFT' },
    { id:'m', sku:'MATCH-M', values:{Size:'M'}, price:59, inventory:7, status:'ACTIVE' },
    { id:'l', sku:'MATCH-L', values:{Size:'L'}, price:0, inventory:0, status:'DRAFT' },
    { id:'old', sku:'MATCH-OLD', values:{Size:'XL'}, price:59, inventory:2, status:'ARCHIVED' }
  ]
}

test('bulk activation hydrates listings, preserves content and activates only priced Draft variants', async () => {
  const saved = []
  const progress = []
  const result = await runAdminCatalogBulk([summary], 'ACTIVATE_DRAFT_VARIANTS', 1000, {
    fetchProduct:async id => ({ data:structuredClone(full), error:null }),
    saveProduct:async product => { saved.push(product); return { data:product, error:null } },
    onProgress:item => progress.push(item)
  })
  assert.equal(result.updated, 1)
  assert.equal(result.activated, 1)
  assert.equal(result.ineligibleVariants, 1)
  assert.deepEqual(saved[0].media, full.media)
  assert.deepEqual(saved[0].contentBlocks, full.contentBlocks)
  assert.deepEqual(saved[0].options, full.options)
  assert.equal(saved[0].status, 'DRAFT')
  assert.deepEqual(saved[0].variants.map(item => [item.status,item.inventory]), [
    ['ACTIVE',1000],['ACTIVE',7],['DRAFT',0],['ARCHIVED',2]
  ])
  assert.equal(progress.at(-1).processed, 1)
})

test('bulk updates never save a summary when full listing hydration fails', async () => {
  let saves = 0
  const result = await runAdminCatalogBulk([summary], 'ADD_TAG', 'new-drop', {
    fetchProduct:async () => ({ data:null, error:'Listing query failed' }),
    saveProduct:async () => { saves++; return { data:null } }
  })
  assert.equal(saves, 0)
  assert.equal(result.updated, 0)
  assert.equal(result.failures.length, 1)
  assert.match(result.failures[0].error, /Listing query failed/)
})

test('bulk tag changes retain complete variants and media', async () => {
  let saved
  await runAdminCatalogBulk([summary], 'ADD_TAG', 'new-drop', {
    fetchProduct:async () => ({ data:structuredClone(full), error:null }),
    saveProduct:async product => { saved=product; return { data:product, error:null } }
  })
  assert.deepEqual(saved.tags, ['football','new-drop'])
  assert.deepEqual(saved.variants, full.variants)
  assert.deepEqual(saved.media, full.media)
})

test('activation rejects invalid stock and never touches a saved listing', async () => {
  assert.throws(() => prepareDraftVariantActivation(full, 0), /Stock per variation/)
  let reads = 0
  const result = await runAdminCatalogBulk([summary], 'ACTIVATE_DRAFT_VARIANTS', 0, {
    fetchProduct:async () => { reads++; return { data:full } },
    saveProduct:async product => ({ data:product })
  })
  assert.equal(reads, 0)
  assert.match(result.error, /Stock per variation/)
})
