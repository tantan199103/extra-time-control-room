import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_RECENT_PRODUCTS, readRecentlyViewed, rememberRecentlyViewed } from '../src/lib/recent-products.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem:key => values.get(key) ?? null,
    setItem:(key,value) => values.set(key,String(value))
  }
}

test('recently viewed products are public snapshots, deduplicated and bounded', () => {
  const storage = memoryStorage()
  for (let index = 0; index < MAX_RECENT_PRODUCTS + 3; index += 1) {
    rememberRecentlyViewed({ id:`p-${index}`, handle:`product-${index}`, name:`Product ${index}`, image:`https://cdn.example/${index}.webp`, price:20 + index, taxonomy:{ team:'team-a' }, aiMetadata:{ secret:true } }, storage)
  }
  rememberRecentlyViewed({ id:'p-7', handle:'product-7', name:'Updated product', price:99 }, storage)
  const rows = readRecentlyViewed(storage)
  assert.equal(rows.length,MAX_RECENT_PRODUCTS)
  assert.equal(rows[0].id,'p-7')
  assert.equal(rows[0].name,'Updated product')
  assert.equal('aiMetadata' in rows[0],false)
  assert.equal(new Set(rows.map(row => row.id)).size,rows.length)
})

test('recently viewed products tolerate invalid browser storage', () => {
  const storage = { getItem:() => '{broken', setItem:() => { throw new Error('blocked') } }
  assert.deepEqual(readRecentlyViewed(storage),[])
  assert.equal(rememberRecentlyViewed({ id:'safe', title:'Safe' },storage)[0].id,'safe')
})
