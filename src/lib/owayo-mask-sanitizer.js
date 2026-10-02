/**
 * Browser-safe cleanup for Owayo MIRL palette masks.
 *
 * Owayo masks encode artwork as an 8-bit palette index in the red channel.
 * A handful of source-only indices are used for vendor marks (including the
 * Ultra Dry and 3D design labels).  Those indices must not reach the shader:
 * replacing the palette colour alone would leave the shape of the label in
 * the garment.  This module works on ImageData-like values and does not
 * import Node, sharp or Three.js, so the designer can use it at runtime for
 * remotely hosted masks as well as the offline sync script.
 */

export const OWAYO_MASK_BRAND_CODES = Object.freeze([
  'OOF', 'OOFK', 'HF',
  'OOB', 'OOBK', 'HB',
  'OOL', 'OOLK', 'HLA',
  'OOR', 'OORK', 'HRA',
  'TEC', 'TECO', '3D_3D', '3D_DSGN'
])

export function owayoMaskBrandIndices(colorCodes = [], explicitIndices = []) {
  const output = new Set()
  for (const value of explicitIndices || []) {
    const number = Number(value)
    if (Number.isInteger(number) && number >= 0 && number <= 255) output.add(number)
  }
  for (const item of colorCodes || []) {
    const code = String(item?.colorCode || '').trim().toUpperCase()
    const number = Number(item?.ColorCodeNr)
    if (OWAYO_MASK_BRAND_CODES.includes(code) && Number.isInteger(number) && number >= 0 && number <= 255) output.add(number)
  }
  return output
}

function pixelValue(data, channels, index) {
  return data[index * channels]
}

function outsideWhiteMask(data, width, height, channels) {
  const size = width * height
  const outside = new Uint8Array(size)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  const enqueue = index => {
    if (outside[index] || pixelValue(data, channels, index) !== 255) return
    outside[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) enqueue(index - 1)
    if (x + 1 < width) enqueue(index + 1)
    if (y > 0) enqueue(index - width)
    if (y + 1 < height) enqueue(index + width)
  }
  return outside
}

/**
 * Replace source-mark pixels with the closest non-mark garment pixel.
 *
 * `raw` may be Uint8Array, Uint8ClampedArray or another ArrayBuffer view.
 * It is copied before modification, allowing callers to safely retain the
 * decoded ImageData. The returned data uses Uint8ClampedArray when the input
 * did, otherwise Uint8Array.
 */
export function sanitizeOwayoMaskPixels(raw, { width, height, channels = 4 } = {}, brandIndices = new Set()) {
  const sourceData = raw instanceof Uint8ClampedArray ? raw : new Uint8Array(raw)
  const data = sourceData.slice()
  const safeWidth = Number(width)
  const safeHeight = Number(height)
  const safeChannels = Number(channels)
  if (!Number.isInteger(safeWidth) || safeWidth <= 0 || !Number.isInteger(safeHeight) || safeHeight <= 0 || !Number.isInteger(safeChannels) || safeChannels < 1) {
    throw new TypeError('Owayo mask dimensions and channel count must be positive integers.')
  }
  const size = safeWidth * safeHeight
  if (data.length < size * safeChannels) throw new RangeError('Owayo mask data is shorter than width × height × channels.')
  const marks = brandIndices instanceof Set ? brandIndices : new Set(brandIndices || [])
  const branded = new Uint8Array(size)
  let brandedPixels = 0
  for (let index = 0; index < size; index += 1) {
    if (marks.has(pixelValue(data, safeChannels, index))) {
      branded[index] = 1
      brandedPixels += 1
    }
  }
  if (!brandedPixels) return { data, brandedPixels: 0, changedPixels: 0 }

  // Do not bleed edge/background white into a mark when a real garment colour
  // is available nearby. If the texture contains no such source, fall back to
  // every non-mark pixel so cleanup is deterministic rather than leaving a
  // source label behind.
  const outside = outsideWhiteMask(data, safeWidth, safeHeight, safeChannels)
  const source = new Int32Array(size)
  source.fill(-1)
  const distance = new Uint32Array(size)
  distance.fill(0xFFFFFFFF)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  let normalSeedCount = 0
  for (let index = 0; index < size; index += 1) {
    if (branded[index]) continue
    if (outside[index] && pixelValue(data, safeChannels, index) === 255) continue
    source[index] = index
    distance[index] = 0
    queue[tail++] = index
    normalSeedCount += 1
  }
  if (!normalSeedCount) {
    for (let index = 0; index < size; index += 1) {
      if (branded[index]) continue
      source[index] = index
      distance[index] = 0
      queue[tail++] = index
    }
  }

  while (head < tail) {
    const index = queue[head++]
    const nextDistance = distance[index] + 1
    const x = index % safeWidth
    const y = Math.floor(index / safeWidth)
    const visit = next => {
      // Source pixels are already seeded (distance 0); mark pixels are the
      // only ones that may be claimed by a wavefront.
      if (!branded[next] && distance[next] === 0) return
      if (nextDistance >= distance[next]) return
      distance[next] = nextDistance
      source[next] = source[index]
      queue[tail++] = next
    }
    if (x > 0) visit(index - 1)
    if (x + 1 < safeWidth) visit(index + 1)
    if (y > 0) visit(index - safeWidth)
    if (y + 1 < safeHeight) visit(index + safeWidth)
  }

  let changedPixels = 0
  for (let index = 0; index < size; index += 1) {
    if (!branded[index]) continue
    const replacement = source[index]
    if (replacement < 0) continue
    const from = pixelValue(data, safeChannels, index)
    const to = pixelValue(data, safeChannels, replacement)
    if (from === to) continue
    for (let channel = 0; channel < safeChannels; channel += 1) data[index * safeChannels + channel] = data[replacement * safeChannels + channel]
    changedPixels += 1
  }
  return { data, brandedPixels, changedPixels }
}

/**
 * Sanitise an ImageData object in place and return the cleanup counters.
 * Keeping this tiny adapter separate makes integration with either a normal
 * canvas or OffscreenCanvas straightforward in the designer.
 */
export function sanitizeOwayoMaskImageData(imageData, colorCodes = [], options = {}) {
  if (!imageData || !imageData.data) throw new TypeError('An ImageData-like value is required.')
  const width = Number(imageData.width)
  const height = Number(imageData.height)
  const channels = Number(options.channels || 4)
  const result = sanitizeOwayoMaskPixels(imageData.data, { width, height, channels }, owayoMaskBrandIndices(colorCodes, options.explicitIndices))
  imageData.data.set(result.data)
  return result
}
