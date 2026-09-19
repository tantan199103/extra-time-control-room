import test from 'node:test'
import assert from 'node:assert/strict'
import { CUSTOM_GUIDE_SLOT_ID, LISTING_MEDIA_SLOTS, MODEL_MEDIA_SLOT_IDS, listingMediaRole, listingMediaSlot } from '../src/lib/listing-media.js'

test('controlled listing media set has five model views and one custom guide', () => {
  assert.equal(MODEL_MEDIA_SLOT_IDS.length, 5)
  assert.equal(LISTING_MEDIA_SLOTS.length, 6)
  assert.equal(listingMediaSlot(CUSTOM_GUIDE_SLOT_ID)?.group, 'guide')
  assert.ok(LISTING_MEDIA_SLOTS.every(slot => slot.prompt && slot.alt && !/fangearsport|apikey|openai|gpt-image/i.test(slot.prompt)))
})

test('media roles remain stable when attaching generated assets', () => {
  assert.equal(listingMediaRole({ role:'model-detail' }), 'model-detail')
  assert.equal(listingMediaRole({ mediaRole:'custom-guide' }), 'custom-guide')
  assert.equal(listingMediaRole({}), '')
})
