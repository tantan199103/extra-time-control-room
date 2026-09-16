import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProductPack, parseProductPackText, validateBridgeAssets, validateProductPack } from '../src/lib/pod-bridge-contract.js'
import { applyBridgeContentPatch, buildAssetDescriptor, createBridgeDraft, finalizeBridgeMetadata } from '../src/lib/pod-bridge-sync.js'

const pack = {
  schemaVersion: '1.0', externalKey: 'MIL-006', locale: 'en',
  content: { title: 'Family of Honor', subtitle: 'A family story', description: 'A personalized jersey.', seo: { title: 'Family', description: 'Honor the family.', keywords: ['military'] }, tags: ['Family Story'], taxonomy: { category: 'Military', audience: 'Unisex' }, customFields: [], contentBlocks: [] },
  assetSlots: [{ key: 'hero', label: 'Hero', kind: 'hero', required: true, order: 1 }]
}

test('Product Pack parses fenced JSON and sanitizes unsupported commercial fields', () => {
  const result = parseProductPackText(`before\n\`\`\`pod-product\n${JSON.stringify({ ...pack, price: 99, sku: 'BAD', status: 'PUBLISHED' })}\n\`\`\``)
  assert.equal(result.ok, true)
  assert.equal(result.value.content.title, 'Family of Honor')
  assert.equal('price' in result.value, false)
  assert.equal('sku' in result.value, false)
  assert.equal('status' in result.value, false)
})

test('invalid JSON and missing fenced blocks return explicit fallback errors', () => {
  assert.match(parseProductPackText('plain draft copy').errors[0], /No pod-product/)
  assert.match(parseProductPackText('```json\n{}\n```').errors[0], /No pod-product/)
  assert.match(parseProductPackText('```pod-product\n{bad}\n```').errors[0], /not valid JSON/)
})

test('slot keys are slugged, unique and limited', () => {
  const normalized = normalizeProductPack({ ...pack, assetSlots: [{ key: 'Female Model', label: 'One' }, { key: 'female-model', label: 'Duplicate' }, { key: 'x'.repeat(80), label: 'Long' }] })
  assert.deepEqual(normalized.assetSlots.map(slot => slot.key), ['female-model', 'x'.repeat(48)])
  assert.equal(validateProductPack(normalized).ok, true)
})

test('bridge drafts always use the safe empty personalized jersey preset', async () => {
  const { draft } = await createBridgeDraft(pack)
  assert.equal(draft.status, 'DRAFT')
  assert.equal(draft.type, 'PERSONALIZED')
  assert.equal(draft.price, 0)
  assert.deepEqual(draft.options, [{ name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] }])
  assert.equal(draft.variants.length, 5)
  assert.ok(draft.variants.every(variant => variant.status === 'DRAFT' && variant.inventory === 0 && variant.price === 0 && variant.compareAt === null))
  assert.equal(draft.aiMetadata.bridge.state, 'RECEIVING')
})

test('WebApp-wins skips fields edited after the previous sync', async () => {
  const { draft } = await createBridgeDraft(pack)
  draft.description = 'Changed directly in WebApp'
  const incoming = structuredClone(pack); incoming.content.description = 'Changed in ChatGPT'
  const { next, skipped } = await applyBridgeContentPatch(draft, incoming)
  assert.ok(skipped.includes('description'))
  assert.equal(next.description, 'Changed directly in WebApp')
  const cleared = structuredClone(draft); cleared.description = ''
  const result = await applyBridgeContentPatch(cleared, incoming)
  assert.ok(result.skipped.includes('description'))
  assert.equal(result.next.description, '')
})

test('recent bridge operations are bounded and deduplicated', async () => {
  const { draft } = await createBridgeDraft(pack)
  draft.aiMetadata.bridge.recentOperations = Array.from({ length: 20 }, (_, index) => `op-${index}`)
  draft.aiMetadata = await finalizeBridgeMetadata(draft, pack, { operationId: 'op-19' })
  assert.equal(draft.aiMetadata.bridge.recentOperations.length, 20)
  draft.aiMetadata = await finalizeBridgeMetadata(draft, pack, { operationId: 'op-20' })
  assert.equal(draft.aiMetadata.bridge.recentOperations.length, 20)
  assert.equal(draft.aiMetadata.bridge.recentOperations.at(-1), 'op-20')
})

test('asset descriptors reject invalid MIME and oversized images', async () => {
  await assert.rejects(buildAssetDescriptor(new Blob(['x'], { type: 'text/plain' })), /JPG/)
  const oversized = { type: 'image/png', size: 16 * 1024 * 1024, name: 'large.png', arrayBuffer: async () => new ArrayBuffer(0) }
  await assert.rejects(buildAssetDescriptor(oversized), /15 MB/)
  const file = new Blob(['image'], { type: 'image/png' }); Object.defineProperty(file, 'name', { value: 'hero.png' })
  const descriptor = await buildAssetDescriptor(file, { slotKey: 'Hero Image', kind: 'hero' })
  assert.equal(descriptor.slotKey, 'hero-image')
  assert.equal(descriptor.sha256.length, 64)
})

test('bridge asset envelopes enforce unique slots, chunk counts and session limits', () => {
  const valid = { assetId: 'a', slotKey: 'hero', mimeType: 'image/png', size: 4, chunkCount: 1, sha256: 'a'.repeat(64) }
  assert.equal(validateBridgeAssets([valid]).ok, true)
  const duplicate = validateBridgeAssets([valid, { ...valid, assetId: 'b' }])
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.errors.join(' '), /unique slug asset slot/)
  assert.equal(validateBridgeAssets([{ ...valid, chunkCount: 0 }]).ok, false)
})
