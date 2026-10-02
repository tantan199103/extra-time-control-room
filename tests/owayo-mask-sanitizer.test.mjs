import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OWAYO_MASK_BRAND_CODES,
  owayoMaskBrandIndices,
  sanitizeOwayoMaskPixels,
  sanitizeOwayoMaskImageData
} from '../src/lib/owayo-mask-sanitizer.js'

test('Owayo runtime sanitizer resolves vendor and technical palette indices', () => {
  assert.ok(OWAYO_MASK_BRAND_CODES.includes('TEC'))
  assert.ok(OWAYO_MASK_BRAND_CODES.includes('3D_DSGN'))
  const indices = owayoMaskBrandIndices([
    { colorCode: 'Tec', ColorCodeNr: 240 },
    { colorCode: '3d_dsgn', ColorCodeNr: 195 },
    { colorCode: 'A', ColorCodeNr: 2 }
  ], [241, 300, -1])
  assert.deepEqual([...indices].sort((a, b) => a - b), [195, 240, 241])
})

test('runtime sanitizer removes a mark and preserves the nearest garment colour', () => {
  // 5 × 3 RGBA mask: blue garment on the left, a 240 mark in the centre,
  // red garment on the right. The mark must never survive into the shader.
  const width = 5
  const height = 3
  const raw = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      raw[index] = x < 2 ? 12 : x > 2 ? 32 : 240
      raw[index + 1] = 255
      raw[index + 2] = 0
      raw[index + 3] = 255
    }
  }
  const result = sanitizeOwayoMaskPixels(raw, { width, height, channels: 4 }, new Set([240]))
  assert.equal(result.brandedPixels, 3)
  assert.equal(result.changedPixels, 3)
  for (const x of [2]) for (let y = 0; y < height; y += 1) assert.notEqual(result.data[(y * width + x) * 4], 240)
  assert.equal(result.data[2 * 4], 12)
  assert.equal(result.data[(2 * 4) + 4], 32)
})

test('image-data adapter updates a canvas buffer without touching unrelated pixels', () => {
  const imageData = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([
      7, 0, 0, 255,
      195, 0, 0, 255,
      9, 0, 0, 255
    ])
  }
  const result = sanitizeOwayoMaskImageData(imageData, [{ colorCode: '3D_DSGN', ColorCodeNr: 195 }])
  assert.equal(result.brandedPixels, 1)
  assert.equal(result.changedPixels, 1)
  assert.notEqual(imageData.data[4], 195)
  assert.deepEqual([...imageData.data.slice(0, 4)], [7, 0, 0, 255])
  assert.deepEqual([...imageData.data.slice(8, 12)], [9, 0, 0, 255])
})

test('nearest replacement ignores edge white background', () => {
  const raw = new Uint8Array([
    255, 0, 0, 255,
    255, 0, 0, 255,
    12, 0, 0, 255,
    240, 0, 0, 255,
    32, 0, 0, 255,
    255, 0, 0, 255,
    255, 0, 0, 255
  ])
  const result = sanitizeOwayoMaskPixels(raw, { width: 7, height: 1, channels: 4 }, new Set([240]))
  assert.equal(result.fallbackApplied, false)
  assert.equal(result.data[12], 12, 'mark should inherit the left garment colour rather than edge white')
})

test('all-mark texture fails closed to a neutral palette index', () => {
  const raw = new Uint8Array([
    194, 0, 0, 255,
    195, 0, 0, 255,
    240, 0, 0, 255,
    194, 0, 0, 255
  ])
  const result = sanitizeOwayoMaskPixels(raw, { width: 4, height: 1, channels: 4, fallbackIndex: 1 }, new Set([194, 195, 240]))
  assert.equal(result.fallbackApplied, true)
  assert.equal(result.changedPixels, 4)
  assert.deepEqual([...result.data.filter((_, index) => index % 4 === 0)], [1, 1, 1, 1])
  assert.deepEqual([...result.data.filter((_, index) => index % 4 === 3)], [255, 255, 255, 255])
})

test('sanitizer validates dimensions and short buffers', () => {
  assert.throws(() => sanitizeOwayoMaskPixels(new Uint8Array(3), { width: 2, height: 2, channels: 1 }, new Set([1])), /shorter/)
  assert.throws(() => sanitizeOwayoMaskPixels(new Uint8Array(4), { width: 0, height: 2, channels: 1 }, new Set([1])), /positive integers/)
  assert.throws(() => sanitizeOwayoMaskPixels(new Uint8Array(4), { width: 2, height: 2, channels: 1, maxPixels: 3 }, new Set([1])), /too large/)
})
