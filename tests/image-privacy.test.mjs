import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'

const ascii = value => Uint8Array.from([...value].map(character => character.charCodeAt(0)))
const concat = (...parts) => {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
const contains = (bytes, value) => {
  const needle = ascii(value)
  return bytes.some((_, offset) => offset <= bytes.length - needle.length && needle.every((byte, index) => bytes[offset + index] === byte))
}
const cleanedBytes = async (bytes, type) => new Uint8Array(await (await sanitizeImagePrivacyMetadata(new Blob([bytes], { type }))).arrayBuffer())

const jpegSegment = (marker, payload) => Uint8Array.from([0xff, marker, (payload.length + 2) >>> 8, (payload.length + 2) & 255, ...payload])

test('JPEG cleaning drops EXIF, IPTC and comments but preserves APP11 provenance', async () => {
  const jpeg = concat(
    Uint8Array.from([0xff, 0xd8]),
    jpegSegment(0xe1, ascii('Exif\0\0private')),
    jpegSegment(0xeb, ascii('C2PA-jumbf')),
    jpegSegment(0xed, ascii('IPTC-private')),
    jpegSegment(0xfe, ascii('author-note')),
    Uint8Array.from([0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9])
  )
  const clean = await cleanedBytes(jpeg, 'image/jpeg')
  assert.equal(contains(clean, 'Exif'), false)
  assert.equal(contains(clean, 'IPTC'), false)
  assert.equal(contains(clean, 'author-note'), false)
  assert.equal(contains(clean, 'C2PA-jumbf'), true)
})

const pngChunk = (type, payload = new Uint8Array()) => {
  const chunk = new Uint8Array(12 + payload.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, payload.length)
  chunk.set(ascii(type), 4)
  chunk.set(payload, 8)
  return chunk
}

test('PNG cleaning drops text and EXIF chunks but preserves caBX provenance', async () => {
  const png = concat(
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('tEXt', ascii('Software\0private-editor')),
    pngChunk('eXIf', ascii('private-exif')),
    pngChunk('caBX', ascii('C2PA-jumbf')),
    pngChunk('IEND')
  )
  const clean = await cleanedBytes(png, 'image/png')
  assert.equal(contains(clean, 'tEXt'), false)
  assert.equal(contains(clean, 'eXIf'), false)
  assert.equal(contains(clean, 'caBX'), true)
  assert.equal(contains(clean, 'C2PA-jumbf'), true)
})

const webpChunk = (type, payload) => {
  const chunk = new Uint8Array(8 + payload.length + payload.length % 2)
  const view = new DataView(chunk.buffer)
  chunk.set(ascii(type), 0)
  view.setUint32(4, payload.length, true)
  chunk.set(payload, 8)
  return chunk
}

test('WebP cleaning drops EXIF/XMP, fixes flags and preserves C2PA chunks', async () => {
  const vp8x = new Uint8Array(10); vp8x[0] = 0x0c
  const chunks = concat(webpChunk('VP8X', vp8x), webpChunk('EXIF', ascii('private-exif')), webpChunk('XMP ', ascii('private-xmp')), webpChunk('C2PA', ascii('jumbf')))
  const header = concat(ascii('RIFF'), new Uint8Array(4), ascii('WEBP'))
  new DataView(header.buffer).setUint32(4, chunks.length + 4, true)
  const clean = await cleanedBytes(concat(header, chunks), 'image/webp')
  assert.equal(contains(clean, 'EXIF'), false)
  assert.equal(contains(clean, 'XMP '), false)
  assert.equal(contains(clean, 'C2PA'), true)
  assert.equal(clean[20] & 0x0c, 0)
  assert.equal(new DataView(clean.buffer).getUint32(4, true), clean.length - 8)
})

test('AVIF with EXIF/XMP fails closed instead of removing provenance boxes', async () => {
  const ftyp = concat(Uint8Array.from([0, 0, 0, 20]), ascii('ftyp'), ascii('avif'), new Uint8Array(4), ascii('avif'))
  await assert.rejects(sanitizeImagePrivacyMetadata(new Blob([concat(ftyp, ascii('Exif\0private'))], { type: 'image/avif' })), /Convert it to PNG/)
  const clean = await sanitizeImagePrivacyMetadata(new Blob([ftyp], { type: 'image/avif' }))
  assert.equal(clean.size, ftyp.length)
})
