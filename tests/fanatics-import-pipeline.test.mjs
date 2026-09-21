import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadSourcePayloads,
  saveListingsToDatabase,
  saveAuditRecords,
  run
} from '../scripts/import-fanatics-catalog.mjs'
import {
  normalizeFanaticsProduct,
  hydrateListingMedia
} from '../scripts/fanatics-import-lib.mjs'
import { publicListingHasSourceReferences } from '../scripts/fangear-import-lib.mjs'

test('loadSourcePayloads parses array and object payloads accurately', async () => {
  const single = await loadSourcePayloads({ jsonArg: JSON.stringify({ name: 'Jersey 1' }) })
  assert.equal(single.length, 1)
  assert.equal(single[0].name, 'Jersey 1')

  const array = await loadSourcePayloads({ jsonArg: JSON.stringify([{ name: 'Jersey 1' }, { name: 'Jersey 2' }]) })
  assert.equal(array.length, 2)
})

test('full import pipeline normalizes, sanitizes, and prepares draft listings', async () => {
  const mockPayload = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: "Men's Fanatics Branded Philadelphia Eagles Jalen Hurts Midnight Green Game Jersey",
    description: 'Officially licensed NFL jersey. 100% Polyester. Screen printed player name and numbers.',
    sku: '5192837',
    offers: {
      '@type': 'Offer',
      price: '129.99',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    },
    sizes: ['Small', 'Medium', 'Large', 'XL', '2XL'],
    images: [
      'https://fanatics.frgimages.com/philadelphia-eagles/mens-jalen-hurts-jersey_full.jpg?w=600'
    ]
  }

  // 1. Normalize
  const normalized = normalizeFanaticsProduct(mockPayload)
  assert.equal(normalized.listing.status, 'DRAFT')
  assert.equal(normalized.listing.artworkLock, 70)
  assert.equal(normalized.listing.title, 'Philadelphia Eagles Jalen Hurts Midnight Green Game Jersey')
  assert.equal(normalized.listing.price, 129.99)
  assert.equal(normalized.listing.options[0].name, 'Size')
  assert.deepEqual(normalized.listing.options[0].values, ['S', 'M', 'L', 'XL', '2XL'])
  assert.equal(normalized.listing.variants.length, 5)

  // 2. Mock Supabase Client
  const uploadedFiles = new Map()
  const savedRpcCalls = []
  const auditUpserts = []

  const mockClient = {
    storage: {
      from: (bucket) => ({
        upload: async (path, blob, options) => {
          uploadedFiles.set(path, { bucket, blob, options })
          return { error: null }
        },
        getPublicUrl: (path) => ({
          data: {
            publicUrl: `https://test.supabase.co/storage/v1/object/public/${bucket}/${path}`
          }
        })
      })
    },
    from: (table) => ({
      select: () => ({
        in: async () => ({ data: [], error: null })
      }),
      upsert: async (rows) => {
        auditUpserts.push(...(Array.isArray(rows) ? rows : [rows]))
        return { error: null }
      }
    }),
    rpc: async (functionName, params) => {
      savedRpcCalls.push({ functionName, params })
      return { error: null }
    }
  }

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0xff, 0xd9]).buffer
  })

  // 3. Hydrate Media with simulated fetch
  const hydrated = await hydrateListingMedia(mockClient, normalized, {
    fetchFn: mockFetch
  })

  assert.ok(hydrated.listing.image.startsWith('https://test.supabase.co/storage/v1/object/public/product-media/'))
  assert.equal(publicListingHasSourceReferences(hydrated.listing), false)

  // 4. Save to Database
  const errors = []
  const saveResult = await saveListingsToDatabase(mockClient, [hydrated], errors)
  assert.equal(errors.length, 0)
  assert.equal(saveResult.count, 1)
  assert.equal(savedRpcCalls.length, 1)
  assert.equal(savedRpcCalls[0].functionName, 'pod_save_listing')
  assert.equal(savedRpcCalls[0].params.listing.status, 'DRAFT')
  assert.equal(savedRpcCalls[0].params.listing.title, 'Philadelphia Eagles Jalen Hurts Midnight Green Game Jersey')

  // 5. Audit logs
  await saveAuditRecords(mockClient, [hydrated], saveResult.importedIds)
  assert.equal(auditUpserts.length, 1)
  assert.equal(auditUpserts[0].source, 'fanatics.com')
  assert.equal(auditUpserts[0].source_entity_id, '5192837')
})
