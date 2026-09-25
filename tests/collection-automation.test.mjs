import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectionAutomationHasConditions,
  filterProductsByCollectionAutomation,
  normalizeCollectionAutomation,
  parseCollectionKeywords,
  productMatchesCollectionAutomation
} from '../src/lib/collection-rules.js'

const cap = {
  id:'cap-1', title:'Toronto Blue Jays Fitted Cap', handle:'toronto-blue-jays-cap', sku:'CAP-001',
  status:'PUBLISHED', type:'READY TO SHIP', productGroup:'Caps',
  tags:['mlb', 'blue-jays', 'headwear'], taxonomy:{ league:'MLB', team:'Toronto Blue Jays' },
  customFields:[{ key:'name' }], description:'Personalized game-day headwear.'
}

test('collection automation normalizes safe, bounded rule input', () => {
  assert.deepEqual(parseCollectionKeywords('  MLB, cap\nMLB  '), ['MLB', 'cap'])
  assert.deepEqual(normalizeCollectionAutomation({
    enabled:1, keywordMode:'all', searchFields:['title', 'bad-field', 'title'], status:'published', customizable:'yes'
  }), {
    enabled:true, keywordMode:'ALL', includeKeywords:[], excludeKeywords:[], searchFields:['title'],
    status:'PUBLISHED', productGroup:'', productType:'', league:'', team:'', customizable:'YES'
  })
})

test('keyword and structured collection rules match deterministic product fields', () => {
  const rule = {
    includeKeywords:['blue jays', 'cap'], keywordMode:'ALL', searchFields:['title', 'tags'],
    excludeKeywords:['kids'], status:'PUBLISHED', productGroup:'Caps', league:'MLB', customizable:'YES'
  }
  assert.equal(collectionAutomationHasConditions(rule), true)
  assert.equal(productMatchesCollectionAutomation(cap, rule), true)
  assert.equal(productMatchesCollectionAutomation({ ...cap, tags:[...cap.tags, 'kids'] }, rule), false)
  assert.equal(productMatchesCollectionAutomation({ ...cap, productGroup:'Jerseys' }, rule), false)
  assert.equal(productMatchesCollectionAutomation({ ...cap, customFields:[], personalization:[] }, rule), false)
})

test('empty automation never becomes an accidental match-all bulk action', () => {
  assert.equal(collectionAutomationHasConditions({}), false)
  assert.deepEqual(filterProductsByCollectionAutomation([cap], {}), [])
  assert.equal(productMatchesCollectionAutomation(cap, { includeKeywords:['missing'], keywordMode:'ANY' }), false)
})
