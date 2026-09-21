import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanFanaticsTitle,
  inferFanaticsLeague,
  inferFanaticsCustomFields,
  normalizeFanaticsSize,
  cleanFanaticsMediaUrl,
  parseFanaticsJsonLd,
  normalizeFanaticsProduct,
  downloadCleanImage,
  uploadImageToSupabase,
  hydrateListingMedia
} from '../scripts/fanatics-import-lib.mjs'
import {
  publicListingHasSourceReferences,
  sanitizePublicText,
  stripSourceUrls,
  cleanTag,
  stableId
} from '../scripts/fangear-import-lib.mjs'

test('cleans Fanatics brand keywords and prefixes from titles and text', () => {
  const raw = "Men's Fanatics Branded Patrick Mahomes Red Kansas City Chiefs Player Game Jersey"
  const cleaned = cleanFanaticsTitle(raw)
  assert.equal(cleaned.includes('Fanatics'), false)
  assert.equal(cleaned.includes("Men's"), false)
  assert.match(cleaned, /Patrick Mahomes Red Kansas City Chiefs/)

  const rawText = "Official Fanatics Shop! Officially licensed by the NFL. Visit https://www.fanatics.com/nfl for details."
  const sanitized = sanitizePublicText(rawText)
  assert.equal(sanitized.includes('Fanatics'), false)
  assert.equal(sanitized.includes('fanatics.com'), false)
  assert.equal(sanitized.includes('Officially licensed'), false)
})

test('strips Fanatics source and CDN URLs', () => {
  const url1 = 'https://fanatics.frgimages.com/kansas-city-chiefs/jersey_full.jpg?_hv=2&w=900'
  const url2 = 'https://images.footballfanatics.com/nfl/chiefs/mahomes.jpg'
  assert.equal(stripSourceUrls(`Check image at ${url1} or ${url2}`).trim(), 'Check image at  or')
})

test('cleanTag filters out Fanatics tags', () => {
  assert.equal(cleanTag('fanatics-branded'), '')
  assert.equal(cleanTag('fansedge-exclusive'), '')
  assert.equal(cleanTag('chiefs-football'), 'chiefs-football')
})

test('infers league and custom fields from product context', () => {
  const league = inferFanaticsLeague('Kansas City Chiefs NFL Football Jersey')
  assert.equal(league?.key, 'nfl')
  assert.equal(league?.sport, 'Football')

  const customJersey = {
    title: 'Los Angeles Lakers Custom Jersey',
    description: 'Personalized jersey where you can add your name and number.'
  }
  const customFields = inferFanaticsCustomFields(customJersey)
  assert.equal(customFields.length, 3)
  assert.deepEqual(customFields.map(f => f.key), ['name', 'number', 'teamCity'])

  const standardJersey = {
    title: 'Patrick Mahomes Red Jersey',
    description: 'Game day standard edition.'
  }
  assert.equal(inferFanaticsCustomFields(standardJersey).length, 0)
})

test('normalizes size terms accurately', () => {
  assert.equal(normalizeFanaticsSize("Men's Small"), 'S')
  assert.equal(normalizeFanaticsSize('MD'), 'M')
  assert.equal(normalizeFanaticsSize('Medium'), 'M')
  assert.equal(normalizeFanaticsSize('2XL'), '2XL')
  assert.equal(normalizeFanaticsSize('XXL'), '2XL')
  assert.equal(normalizeFanaticsSize('3XL'), '3XL')
})

test('cleanFanaticsMediaUrl forces high-res zoom parameters', () => {
  const thumbnail = 'https://fanatics.frgimages.com/chiefs/jersey.jpg?w=340&q=80'
  const highRes = cleanFanaticsMediaUrl(thumbnail)
  assert.match(highRes, /w=1200/)
  assert.match(highRes, /q=92/)
})

test('normalizes Fanatics Schema.org JSON-LD into an anonymized draft listing', () => {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: "Men's Fanatics Branded Kansas City Chiefs Custom Game Jersey - Red",
    image: [
      'https://fanatics.frgimages.com/kansas-city-chiefs/mens-custom-red-jersey_full.jpg?w=600',
      'https://fanatics.frgimages.com/kansas-city-chiefs/mens-custom-red-jersey_back.jpg?w=600'
    ],
    description: '<p>Personalized game jersey. Add your custom name and number for game day. Officially licensed by the NFL.</p>',
    sku: '5291829',
    offers: {
      '@type': 'Offer',
      price: '149.99',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    },
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  }

  const normalized = normalizeFanaticsProduct(jsonLd)
  const { listing, media } = normalized

  // Verify core attributes
  assert.equal(listing.status, 'DRAFT')
  assert.equal(listing.artworkLock, 70)
  assert.equal(listing.price, 149.99)
  assert.equal(listing.type, 'PERSONALIZED')
  assert.deepEqual(listing.customFields.map(f => f.key), ['name', 'number', 'teamCity'])
  assert.equal(listing.options[0].name, 'Size')
  assert.deepEqual(listing.options[0].values, ['S', 'M', 'L', 'XL', '2XL'])
  assert.equal(listing.variants.length, 5)
  assert.match(listing.sku, /^ET-FAN-/)

  // Verify media descriptors are created but not yet embedded as source URLs in public listing
  assert.equal(media.length, 2)
  assert.match(media[0].sourceUrl, /w=1200/)
  assert.equal(listing.media.length, 0)
  assert.equal(listing.image, '')

  // Confirm NO source references exist in public listing payload
  assert.equal(publicListingHasSourceReferences(listing), false)
  assert.equal(JSON.stringify(listing).includes('fanatics'), false)
  assert.equal(JSON.stringify(listing).includes('frgimages'), false)
})

test('image pipeline strips privacy metadata and hydrates Supabase product-media', async () => {
  // Construct a minimal valid JPEG with an EXIF (APP1, 0xFFE1) segment
  // JPEG SOI (FF D8) + APP1 (FF E1 00 08 45 78 69 66) + SOF0 (FF C0 ...) + EOI (FF D9)
  const mockJpegBytes = new Uint8Array([
    0xff, 0xd8,                         // SOI
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // APP1 EXIF
    0xff, 0xda, 0x00, 0x03, 0x01,       // SOS (Start of scan)
    0xff, 0xd9                          // EOI
  ])

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: async () => mockJpegBytes.buffer
  })

  const uploadedFiles = new Map()
  const mockSupabase = {
    storage: {
      from: (bucket) => ({
        upload: async (path, blob, options) => {
          assert.equal(bucket, 'product-media')
          uploadedFiles.set(path, { blob, options })
          return { error: null }
        },
        getPublicUrl: (path) => ({
          data: {
            publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`
          }
        })
      })
    }
  }

  const sampleItem = {
    sourceId: '12345',
    listing: {
      id: stableId('listing', 'demo:12345'),
      image: '',
      media: []
    },
    media: [
      {
        id: 'media-front',
        sourceUrl: 'https://fanatics.frgimages.com/demo-front.jpg?w=1200',
        filename: 'demo-front.webp',
        alt: 'Demo Front'
      }
    ]
  }

  const hydrated = await hydrateListingMedia(mockSupabase, sampleItem, {
    fetchFn: mockFetch
  })

  // Verify upload was performed to correct path in product-media bucket
  const expectedPath = `${sampleItem.listing.id}/import/media-front.jpg`
  assert.ok(uploadedFiles.has(expectedPath))
  assert.equal(uploadedFiles.get(expectedPath).options.contentType, 'image/jpeg')

  // Verify hydrated URLs point to Supabase Storage, NOT Fanatics CDN
  assert.equal(hydrated.listing.image, `https://mock.supabase.co/storage/v1/object/public/product-media/${expectedPath}`)
  assert.equal(hydrated.listing.media[0].url, `https://mock.supabase.co/storage/v1/object/public/product-media/${expectedPath}`)
  assert.equal(publicListingHasSourceReferences(hydrated.listing), false)
  assert.equal(JSON.stringify(hydrated.listing).includes('fanatics.frgimages.com'), false)
})
