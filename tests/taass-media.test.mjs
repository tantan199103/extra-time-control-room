import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  hasProtectedImageProvenance,
  prepareTaassImage,
  taassThumbnailUrl,
  uploadPreparedTaassImage
} from '../scripts/taass-media-lib.mjs'

test('TAASS media backfill can use a stable 800px thumbnail URL', () => {
  assert.equal(
    taassThumbnailUrl('https://www.taass.com/media/82/cd/73/1756390434/demo.jpeg?ts=1'),
    'https://www.taass.com/thumbnail/82/cd/73/1756390434/demo_800x800.jpeg'
  )
  assert.equal(taassThumbnailUrl('https://cdn.example.com/demo.jpeg'), 'https://cdn.example.com/demo.jpeg')
})

test('TAASS image optimizer makes a compact AVIF after privacy cleaning', async () => {
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#9b3636' } }).png().toBuffer()
  const image = await prepareTaassImage('https://www.taass.com/media/test.png', {
    targetBytes: 1000,
    fetchFn: async () => new Response(png, { headers: { 'content-type': 'image/png' } })
  })
  assert.equal(image.mime, 'image/avif')
  assert.equal(image.optimized, true)
  assert.ok(image.bytes < png.length)
  assert.equal((await sharp(Buffer.from(await image.blob.arrayBuffer())).metadata()).format, 'heif')
})

test('single-frame source GIF is converted to AVIF without misidentifying it as JPEG', async () => {
  const gif = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#17438a' } }).gif().toBuffer()
  const image = await prepareTaassImage('https://www.taass.com/media/demo.gif?ts=1', {
    fetchFn: async () => new Response(gif, { headers: { 'content-type': 'image/gif' } })
  })
  assert.equal(image.mime, 'image/avif')
  assert.equal(image.optimized, true)
  assert.equal((await sharp(Buffer.from(await image.blob.arrayBuffer())).metadata()).format, 'heif')
})

test('C2PA-capable containers are never re-encoded', () => {
  const jpegWithApp11 = Buffer.from([0xff, 0xd8, 0xff, 0xeb, 0x00, 0x04, 0x43, 0x32, 0xff, 0xd9])
  const pngWithCabx = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from([0, 0, 0, 0]), Buffer.from('caBX'), Buffer.alloc(4)])
  const webpWithC2pa = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('C2PA'), Buffer.alloc(4)])
  assert.equal(hasProtectedImageProvenance(jpegWithApp11, 'image/jpeg'), true)
  assert.equal(hasProtectedImageProvenance(pngWithCabx, 'image/png'), true)
  assert.equal(hasProtectedImageProvenance(webpWithC2pa, 'image/webp'), true)
  assert.equal(hasProtectedImageProvenance(Buffer.from('ftypavifuuid'), 'image/avif'), true)
  assert.equal(hasProtectedImageProvenance(Buffer.from('ftypavifmdat'), 'image/avif'), false)
})

test('optimized media uses a stable AVIF storage path', async () => {
  let uploaded
  const client = { storage: { from: () => ({
    upload: async (path, blob, options) => { uploaded = { path, blob, options }; return { error: null } },
    getPublicUrl: path => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/product-media/${path}` } })
  }) } }
  const prepared = { blob: new Blob([Buffer.from('test')], { type: 'image/avif' }), mime: 'image/avif', bytes: 4, optimized: true }
  const result = await uploadPreparedTaassImage(client, prepared, 'listing-1/import/media-1')
  assert.equal(uploaded.path, 'listing-1/import/media-1.avif')
  assert.equal(uploaded.options.contentType, 'image/avif')
  assert.match(result.url, /media-1\.avif$/)
})
