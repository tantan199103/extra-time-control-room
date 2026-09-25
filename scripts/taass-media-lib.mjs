import sharp from 'sharp'
import { downloadCleanImage } from './fanatics-import-lib.mjs'

function ascii(bytes, offset, length) {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('ascii')
}

export function hasProtectedImageProvenance(bytes, mime) {
  const data = Buffer.from(bytes)
  if (mime === 'image/avif') {
    // C2PA in ISO BMFF/AVIF uses UUID/JUMBF boxes. Preserve any file carrying
    // these markers; ordinary AVIF images can be re-encoded for the Free quota.
    return ['uuid', 'jumb', 'c2pa'].some(marker => data.includes(Buffer.from(marker)))
  }
  if (mime === 'image/jpeg') {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return true
    let offset = 2
    while (offset + 3 < data.length) {
      if (data[offset] !== 0xff) return true
      while (data[offset] === 0xff) offset += 1
      const marker = data[offset++]
      if (marker === 0xda || marker === 0xd9) return false
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
      if (offset + 2 > data.length) return true
      const length = data.readUInt16BE(offset)
      if (length < 2 || offset + length > data.length) return true
      if (marker === 0xeb) return true // JPEG APP11/JUMBF can hold C2PA.
      offset += length
    }
    return true
  }
  if (mime === 'image/png') {
    if (ascii(data, 1, 3) !== 'PNG') return true
    let offset = 8
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset)
      const type = ascii(data, offset + 4, 4)
      if (type === 'caBX') return true
      if (offset + 12 + length > data.length) return true
      offset += 12 + length
      if (type === 'IEND') return false
    }
    return true
  }
  if (mime === 'image/webp') {
    if (ascii(data, 0, 4) !== 'RIFF' || ascii(data, 8, 4) !== 'WEBP') return true
    let offset = 12
    while (offset + 8 <= data.length) {
      const type = ascii(data, offset, 4)
      const length = data.readUInt32LE(offset + 4)
      if (type === 'C2PA') return true
      if (offset + 8 + length > data.length) return true
      offset += 8 + length + length % 2
    }
    return offset !== data.length
  }
  return true
}

export async function prepareTaassImage(sourceUrl, { timeoutMs = 30_000, fetchFn = fetch, targetBytes = 18 * 1024, preferThumbnail = false } = {}) {
  if (/\.gif(?:[?#]|$)/i.test(sourceUrl)) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchFn(sourceUrl, { signal: controller.signal, headers: { accept: 'image/gif' } })
      if (!response.ok) throw new Error(`Failed to fetch GIF image: status ${response.status}`)
      const original = Buffer.from(await response.arrayBuffer())
      const metadata = await sharp(original, { animated: true }).metadata()
      if (metadata.format !== 'gif') throw new Error('The source URL did not return a valid GIF image.')
      if (Number(metadata.pages || 1) !== 1) throw new Error('Animated GIF requires review before importing.')
      const converted = await sharp(original, { page: 0 })
        .resize({ width: targetBytes >= 40 * 1024 ? 960 : 600, withoutEnlargement: true })
        .avif({ quality: targetBytes >= 40 * 1024 ? 62 : 45, effort: 2 })
        .toBuffer()
      return { blob: new Blob([converted], { type: 'image/avif' }), mime: 'image/avif', bytes: converted.length, optimized: true }
    } finally {
      clearTimeout(timer)
    }
  }
  let source = sourceUrl
  let downloaded
  if (preferThumbnail) {
    const thumbnail = taassThumbnailUrl(sourceUrl, 800)
    if (thumbnail !== sourceUrl) {
      try {
        downloaded = await downloadCleanImage(thumbnail, { timeoutMs, fetchFn })
        source = thumbnail
      } catch (error) {
        if (!/status 404\b/i.test(String(error?.message || error))) throw error
      }
    }
  }
  const { blob, mime } = downloaded || await downloadCleanImage(sourceUrl, { timeoutMs, fetchFn })
  const original = Buffer.from(await blob.arrayBuffer())
  if (original.length <= targetBytes || hasProtectedImageProvenance(original, mime)) {
    return { blob, mime, bytes: original.length, optimized: false }
  }
  const configurations = targetBytes >= 40 * 1024
    ? [[960, 62], [900, 60], [840, 58], [780, 55], [720, 52], [660, 48], [600, 45]]
    : [[600, 45], [560, 42], [520, 40], [480, 37], [440, 34], [400, 32], [360, 30], [320, 28]]
  let best = original
  for (const [width, quality] of configurations) {
    const candidate = await sharp(original).resize({ width, withoutEnlargement: true }).avif({ quality, effort: 2 }).toBuffer()
    if (candidate.length < best.length) best = candidate
    if (candidate.length <= targetBytes) break
  }
  return {
    blob: new Blob([best], { type: 'image/avif' }),
    mime: 'image/avif',
    bytes: best.length,
    optimized: true
  }
}

export function taassThumbnailUrl(sourceUrl, width = 800) {
  try {
    const parsed = new URL(sourceUrl)
    if (!/^(?:www\.)?taass\.com$/i.test(parsed.hostname) || !parsed.pathname.includes('/media/')) return sourceUrl
    parsed.pathname = parsed.pathname.replace('/media/', '/thumbnail/').replace(/(\.[^.\/]+)$/i, `_${width}x${width}$1`)
    parsed.search = ''
    return parsed.toString()
  } catch {
    return sourceUrl
  }
}

export async function uploadPreparedTaassImage(client, prepared, storagePrefix) {
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[prepared.mime]
  if (!extension) throw new Error(`Unsupported TAASS image type: ${prepared.mime}`)
  const storagePath = `${storagePrefix}.${extension}`
  const { error } = await client.storage.from('product-media').upload(storagePath, prepared.blob, {
    contentType: prepared.mime,
    cacheControl: '31536000',
    upsert: false
  })
  if (error && !/already exists|duplicate|conflict|409/i.test(error.message || '')) {
    throw new Error(`Supabase storage upload error: ${error.message}`)
  }
  const { data } = client.storage.from('product-media').getPublicUrl(storagePath)
  if (!data?.publicUrl) throw new Error('Supabase storage did not return a public URL')
  return { url: data.publicUrl, bytes: prepared.bytes, mime: prepared.mime, optimized: prepared.optimized }
}
