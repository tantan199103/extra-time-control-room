import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/**
 * Owayo's design masks use palette indices for the printed artwork.  These
 * indices are the vendor marks (front, back and sleeve logo variants), not
 * customer artwork.  Keep the list explicit so technical marks such as
 * ULTRADRY and the 3D design label are not silently removed.
 */
export const OWAYO_BRAND_COLOR_CODES = new Set([
  'OOF', 'OOFK', 'HF',
  'OOB', 'OOBK', 'HB',
  'OOL', 'OOLK', 'HLA',
  'OOR', 'OORK', 'HRA'
])

export function brandColorIndices(colorCodes = []) {
  return new Set(colorCodes
    .filter(item => OWAYO_BRAND_COLOR_CODES.has(String(item.colorCode || '').trim().toUpperCase()))
    .map(item => Number(item.ColorCodeNr))
    .filter(Number.isInteger))
}

function pixelValue(data, channels, index) {
  return data[index * channels]
}

function isWhite(value) {
  return value === 255
}

/**
 * Mark white pixels connected to the image edge as UV background.  A logo
 * near a cut edge must never be filled with that outside white when its
 * garment colour is available a few pixels farther away.
 */
function outsideWhiteMask(data, width, height, channels) {
  const size = width * height
  const outside = new Uint8Array(size)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  const enqueue = index => {
    if (outside[index] || !isWhite(pixelValue(data, channels, index))) return
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
 * Replace each vendor-mark pixel with the nearest real garment pixel.  A
 * multi-source BFS keeps stripes and colour boundaries intact: every pixel
 * in a logo inherits the closest colour from the surrounding artwork rather
 * than painting the whole logo rectangle with one guessed colour.
 */
export function stripBrandPixels(raw, { width, height, channels }, brandIndices) {
  const data = Buffer.from(raw)
  const size = width * height
  const brand = new Uint8Array(size)
  let brandedPixels = 0
  for (let index = 0; index < size; index += 1) {
    if (brandIndices.has(pixelValue(data, channels, index))) {
      brand[index] = 1
      brandedPixels += 1
    }
  }
  if (!brandedPixels) return { data, brandedPixels:0, changedPixels:0 }

  const outside = outsideWhiteMask(data, width, height, channels)
  const source = new Int32Array(size)
  source.fill(-1)
  const distance = new Uint32Array(size)
  distance.fill(0xFFFFFFFF)
  const queue = new Int32Array(size)
  let head = 0
  let tail = 0
  // Seed with all normal garment pixels.  Outside white is deliberately
  // excluded when a non-white garment pixel exists in the same texture.
  let normalSeedCount = 0
  for (let index = 0; index < size; index += 1) {
    if (brand[index]) continue
    const value = pixelValue(data, channels, index)
    if (outside[index] && isWhite(value)) continue
    source[index] = index
    distance[index] = 0
    queue[tail++] = index
    normalSeedCount += 1
  }
  // A pathological texture can be entirely white apart from the logo.  In
  // that case fall back to all non-brand pixels so the operation remains
  // deterministic rather than leaving the mark in place.
  if (!normalSeedCount) {
    for (let index = 0; index < size; index += 1) {
      if (brand[index]) continue
      source[index] = index
      distance[index] = 0
      queue[tail++] = index
    }
  }

  while (head < tail) {
    const index = queue[head++]
    const nextDistance = distance[index] + 1
    const x = index % width
    const y = Math.floor(index / width)
    const visit = next => {
      if (!brand[next] && distance[next] === 0) return
      if (nextDistance >= distance[next]) return
      distance[next] = nextDistance
      source[next] = source[index]
      queue[tail++] = next
    }
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (y > 0) visit(index - width)
    if (y + 1 < height) visit(index + width)
  }

  let changedPixels = 0
  for (let index = 0; index < size; index += 1) {
    if (!brand[index]) continue
    const replacement = source[index]
    if (replacement < 0) continue
    const from = pixelValue(data, channels, index)
    const to = pixelValue(data, channels, replacement)
    if (from === to) continue
    for (let channel = 0; channel < channels; channel += 1) {
      data[index * channels + channel] = data[replacement * channels + channel]
    }
    changedPixels += 1
  }
  return { data, brandedPixels, changedPixels }
}

export async function stripOwayoBranding(buffer, colorCodes, { optimize = false } = {}) {
  const indices = brandColorIndices(colorCodes)
  const decoded = await sharp(buffer).raw().toBuffer({ resolveWithObject:true })
  const result = stripBrandPixels(decoded.data, decoded.info, indices)
  if (!result.changedPixels && !optimize) return { buffer, ...result, indices }
  const output = await sharp(result.data, {
    raw:{ width:decoded.info.width, height:decoded.info.height, channels:decoded.info.channels }
  }).png({ compressionLevel:9, palette:true, colors:256, dither:0 }).toBuffer()
  return { buffer:output, ...result, indices }
}

async function cli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const manifestPath = resolve(root, 'public/designer/owayo/cycling-c3/manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const write = process.argv.includes('--write')
  const targets = Object.entries(manifest.checksums || {})
    .filter(([url]) => /\/designs\/[^/]+\/[^/]+\.png$/i.test(url))
  let changedAssets = 0
  let changedPixels = 0
  for (const [url] of targets) {
    const file = resolve(root, 'public', url.slice(1))
    const input = await readFile(file)
    const result = await stripOwayoBranding(input, manifest.product?.colorCodes, { optimize:true })
    if (!result.changedPixels) continue
    changedAssets += 1
    changedPixels += result.changedPixels
    if (write) {
      await writeFile(file, result.buffer)
      manifest.checksums[url] = {
        bytes:result.buffer.length,
        sha256:createHash('sha256').update(result.buffer).digest('hex')
      }
    }
    process.stdout.write(`${write ? 'Stripped' : 'Would strip'} ${url} (${result.changedPixels} pixels)\n`)
  }
  if (write) {
    manifest.branding = {
      removed:'Owayo vendor marks from synchronized mask textures',
      colorCodes:[...OWAYO_BRAND_COLOR_CODES],
      colorIndices:[...brandColorIndices(manifest.product?.colorCodes)]
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  process.stdout.write(`${write ? 'Updated' : 'Found'} ${changedAssets} assets, ${changedPixels} pixels.\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli()
