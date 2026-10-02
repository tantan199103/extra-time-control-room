import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  QUICK_DEFAULTS,
  normalizeAdjustments,
  normalizeArtworkAsset,
  normalizeArtworkJob,
  normalizeQuickDraft,
  normalizeTransform,
  readQuickDraft,
  saveQuickDraft,
  clearQuickDraft
} from '../src/lib/quick-artwork-schema.js'
import { artworkIdentity, findJob, mockArtworkVariants, validateAssetInput } from '../api/_artwork.js'

const validSession = 'customer-session-1234'

test('quick artwork transforms are bounded and keep mirror flags boolean', () => {
  assert.deepEqual(normalizeTransform({
    x: -10, y: 4, width: 0, height: 9, scale: 99,
    rotation: -999, opacity: 4, flipX: 'yes', flipY: 0
  }), {
    x: 0, y: 1, width: .05, height: 1, scale: 2.5,
    rotation: -180, opacity: 1, flipX: true, flipY: false
  })
  assert.deepEqual(normalizeTransform({}), {
    x: .5, y: .5, width: .72, height: .72, scale: 1,
    rotation: 0, opacity: 1, flipX: false, flipY: false
  })
})

test('image adjustments clamp values and do not trust malformed crops', () => {
  assert.deepEqual(normalizeAdjustments({
    brightness: -999, contrast: 999, saturation: 'bad',
    crop: { x: -1, y: 2, width: 0, height: 4 }
  }), {
    brightness: -100, contrast: 100, saturation: 0,
    crop: { x: 0, y: 1, width: .01, height: 1 }
  })
  assert.equal(normalizeAdjustments({ crop: null }).crop, null)
  assert.equal(normalizeAdjustments({ crop: 'data:image/png;base64,AAAA' }).crop, null)
})

test('asset and job normalizers fail closed to private, supported contracts', () => {
  const asset = normalizeArtworkAsset({ source: 'unknown', private: false, consent: 1, verified: 1 })
  assert.equal(asset.source, 'upload')
  assert.equal(asset.private, false, 'normalizer preserves server response; endpoint must enforce private storage')
  assert.equal(asset.consent, true)
  assert.equal(asset.verified, true)

  const job = normalizeArtworkJob({ type: 'not-a-job', status: 'not-a-status', sourceAssetIds: ['a', 2, null] })
  assert.equal(job.type, 'generate')
  assert.equal(job.status, 'queued')
  assert.deepEqual(job.sourceAssetIds, ['a', '2', 'null'])
  assert.equal(QUICK_DEFAULTS.style, 'retro-mascot')
})

test('draft persistence keeps the hand-off fields and can be cleared', () => {
  const memory = new Map()
  const previous = globalThis.localStorage
  globalThis.localStorage = {
    setItem(key, value) { memory.set(key, value) },
    getItem(key) { return memory.get(key) ?? null },
    removeItem(key) { memory.delete(key) }
  }
  try {
    const draft = saveQuickDraft({
      id: 'draft-1', productId: 'tee-1', variantId: 'tee-1-black-m', surfaceId: 'front',
      assetId: 'asset-1', assetUrl: 'https://signed.example/art.png', consent: true,
      transform: { x: 2, scale: 10 }, lineage: { jobId: 'job-1', prompt: 'pet mascot' }
    })
    assert.equal(draft.id, 'draft-1')
    assert.equal(draft.transform.x, 1)
    assert.equal(draft.transform.scale, 2.5)
    assert.equal(readQuickDraft().assetId, 'asset-1')
    assert.equal(readQuickDraft().lineage.jobId, 'job-1')
    clearQuickDraft()
    assert.equal(readQuickDraft(), null, 'clear must remove the device draft instead of returning an empty draft')
  } finally {
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})

test('asset validation rejects executable/oversized uploads and accepts the 15 MB boundary', () => {
  assert.deepEqual(validateAssetInput({ mime: 'image/png', size: 15 * 1024 * 1024 }), { mime: 'image/png', size: 15 * 1024 * 1024 })
  assert.throws(() => validateAssetInput({ mime: 'image/svg+xml', size: 10 }), /PNG, JPG or WebP/i)
  assert.throws(() => validateAssetInput({ mime: 'image/png', size: 15 * 1024 * 1024 + 1 }), /between 1 byte and 15 MB/i)
  assert.throws(() => validateAssetInput({ mime: 'image/png', size: 0 }), /between 1 byte and 15 MB/i)
})

test('artwork identity is session-bound and independent of client supplied asset IDs', () => {
  const first = artworkIdentity({ headers: { 'x-forwarded-for': '203.0.113.4' } }, { sessionId: validSession })
  const same = artworkIdentity({ headers: { 'x-forwarded-for': '203.0.113.4' } }, { sessionId: validSession })
  const otherIp = artworkIdentity({ headers: { 'x-forwarded-for': '203.0.113.5' } }, { sessionId: validSession })
  assert.equal(first.sessionId, validSession)
  assert.equal(first.identityHash, same.identityHash)
  assert.notEqual(first.identityHash, otherIp.identityHash)
  assert.throws(() => artworkIdentity({ headers: {} }, { sessionId: 'short' }), /valid customer session/i)
})

test('job lookup always scopes the row to the requesting session hash', async () => {
  const calls = []
  const chain = {
    select(value) { calls.push(['select', value]); return chain },
    eq(field, value) { calls.push(['eq', field, value]); return chain },
    maybeSingle: async () => ({ data: { id: 'job-1' }, error: null })
  }
  const row = await findJob({ from(table) { calls.push(['from', table]); return chain } }, 'job-1', 'session-hash')
  assert.equal(row.id, 'job-1')
  assert.deepEqual(calls, [
    ['from', 'pod_artwork_jobs'],
    ['select', '*'],
    ['eq', 'id', 'job-1'],
    ['eq', 'session_hash', 'session-hash']
  ])
})

test('mock variants are preview-only and never look orderable', () => {
  const variants = mockArtworkVariants('pet mascot', 'soft-chibi-pet', 4)
  assert.equal(variants.length, 4)
  assert.ok(variants.every(item => item.status === 'preview-only' && item.assetId === null))
})

test('server routes retain ownership and private-upload guardrails', () => {
  const complete = readFileSync(new URL('../api/artwork-assets-complete.js', import.meta.url), 'utf8')
  const jobs = readFileSync(new URL('../api/artwork-jobs.js', import.meta.url), 'utf8')
  const order = readFileSync(new URL('../api/quick-customization-order.js', import.meta.url), 'utf8')
  const customization = readFileSync(new URL('../api/customization-order.js', import.meta.url), 'utf8')
  const artwork = readFileSync(new URL('../api/_artwork.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/202610020001_quick_artwork.sql', import.meta.url), 'utf8')

  assert.match(complete, /storageKey\.startsWith\(`quick\/\$\{identityHash\.slice\(0, 24\)\}\/`\)/)
  assert.match(jobs, /\.eq\('session_hash', identityHash\)/)
  assert.match(jobs, /verified\)/)
  assert.match(order, /\.eq\('session_hash', identityHash\)/)
  assert.match(order, /asset\?\.verified/)
  assert.match(order, /printAreas/)
  assert.match(customization, /assertQuickArtworkAsset/)
  assert.match(customization, /artworkAssetId/)
  assert.match(artwork, /customer-artwork/)
  assert.match(migration, /file_size_limit,allowed_mime_types/)
  assert.match(migration, /public=false/)
})

test('prompt-only Quick AI does not require upload consent, while references still do', () => {
  const source = readFileSync(new URL('../src/QuickCustomPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /if \(sourceAsset && !consent\)/)
  assert.match(source, /if \(!consent \|\| !pendingUpload\)/)
  assert.doesNotMatch(source, /if \(!consent\) \{ setNotice\('Confirm you have permission to use the uploaded image\.'/)
})

test('replacing or clearing a 3D image removes the previous Quick AI asset reference', () => {
  const source = readFileSync(new URL('../src/CustomDesignerPage.jsx', import.meta.url), 'utf8')
  assert.ok((source.match(/dataUrl:String\(reader\.result\), assetId:''/g) || []).length >= 2)
  assert.ok((source.match(/dataUrl:'', assetId:'', name:''/g) || []).length >= 2)
})
