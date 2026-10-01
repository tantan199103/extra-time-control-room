import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCaptionSrt, buildVideoCampaign, campaignManifest, productTitleFromUrl } from '../src/lib/video-factory.js'

test('derives a readable product title from a product URL', () => {
  assert.equal(
    productTitleFromUrl('https://www.jersevo.com/product/new-era-new-york-yankees-performance-navy-edition-9seventy-stretch-snapback-hat-tz-adc37c'),
    'New Era New York Yankees Performance Navy Edition 9seventy Stretch Snapback Hat Tz Adc37c'
  )
})

test('builds a six-scene Omni campaign with a 60 second total', () => {
  const campaign = buildVideoCampaign({
    productUrl: 'https://www.jersevo.com/product/new-era-new-york-yankees-performance-navy-edition-9seventy-stretch-snapback-hat-tz-adc37c'
  })
  assert.equal(campaign.scenes.length, 6)
  assert.equal(campaign.totals.duration, 60)
  assert.equal(campaign.settings.model, 'Omni 1.1 Flash')
  assert.ok(campaign.scenes.every(scene => scene.prompt.includes('no generated text')))
  assert.equal(campaign.scenes[0].caption, 'THE CAP THAT SETS THE TONE')
})

test('exports production captions and a compact manifest', () => {
  const campaign = buildVideoCampaign({ productTitle: 'Navy Yankees 9Seventy' })
  const srt = buildCaptionSrt(campaign)
  const manifest = campaignManifest(campaign)
  assert.match(srt, /00:00:00,000 --> 00:00:10,000/)
  assert.match(srt, /AVAILABLE NOW AT JERSEVO/)
  assert.equal(manifest.scenes.length, 6)
  assert.equal(manifest.totals.duration, 60)
  assert.equal(manifest.scenes[5].status, 'ready')
})

test('keeps the scene timeline aligned when a 30 second cut is selected', () => {
  const campaign = buildVideoCampaign({ productTitle: 'Navy Yankees 9Seventy', duration: 30 })
  assert.equal(campaign.scenes[0].time, '00–05s')
  assert.equal(campaign.scenes[5].time, '25–30s')
  assert.equal(campaign.totals.duration, 30)
  assert.match(buildCaptionSrt(campaign), /00:00:25,000 --> 00:00:30,000/)
})
