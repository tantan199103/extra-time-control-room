const concat = parts => {
  const size = parts.reduce((total, part) => total + part.byteLength, 0)
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.byteLength }
  return result
}

const ascii = (bytes, offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length))
const uint32be = (bytes, offset) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
const uint32le = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
const writeUint32le = (bytes, offset, value) => { bytes[offset] = value & 255; bytes[offset + 1] = value >>> 8 & 255; bytes[offset + 2] = value >>> 16 & 255; bytes[offset + 3] = value >>> 24 & 255 }

function sanitizeJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG image.')
  const parts = [bytes.slice(0, 2)]
  let offset = 2
  while (offset < bytes.length) {
    const start = offset
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG segment table.')
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === 0xd9) { parts.push(bytes.slice(start, offset)); break }
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { parts.push(bytes.slice(start, offset)); continue }
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG segment.')
    const length = bytes[offset] << 8 | bytes[offset + 1]
    const end = offset + length
    if (length < 2 || end > bytes.length) throw new Error('Invalid JPEG segment length.')
    if (marker === 0xda) { parts.push(bytes.slice(start)); break }
    // APP1 (EXIF/XMP), APP13 (IPTC) and COM commonly carry author,
    // location, device or editing metadata. APP11/JUMBF is deliberately kept
    // so Content Credentials/C2PA provenance is not targeted or removed.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(bytes.slice(start, end))
    offset = end
  }
  return concat(parts)
}

function sanitizePng(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('Invalid PNG image.')
  const parts = [bytes.slice(0, 8)]
  const privateChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])
  let offset = 8
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk.')
    const length = uint32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error('Invalid PNG chunk length.')
    // caBX and other C2PA/JUMBF chunks are not in this privacy-only denylist.
    if (!privateChunks.has(type)) parts.push(bytes.slice(offset, end))
    offset = end
    if (type === 'IEND') break
  }
  return concat(parts)
}

function sanitizeWebp(bytes) {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw new Error('Invalid WebP image.')
  if (uint32le(bytes, 4) + 8 > bytes.length) throw new Error('Truncated WebP image.')
  const chunks = []
  let offset = 12
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('Truncated WebP chunk.')
    const type = ascii(bytes, offset, 4)
    const length = uint32le(bytes, offset + 4)
    const end = offset + 8 + length + (length % 2)
    if (end > bytes.length) throw new Error('Invalid WebP chunk length.')
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = bytes.slice(offset, end)
      if (type === 'VP8X' && length >= 1) chunk[8] &= 0xf3 // clear EXIF/XMP flags only
      chunks.push(chunk)
    }
    // A C2PA chunk, when present, passes through unchanged.
    offset = end
  }
  const result = concat([bytes.slice(0, 12), ...chunks])
  writeUint32le(result, 4, result.byteLength - 8)
  return result
}

const includesAscii = (bytes, value, insensitive = false) => {
  const needle = [...value].map(character => character.charCodeAt(0))
  for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    let matches = true
    for (let index = 0; index < needle.length; index += 1) {
      const actual = bytes[offset + index]
      const expected = needle[index]
      if (insensitive ? (actual | 32) !== (expected | 32) : actual !== expected) { matches = false; break }
    }
    if (matches) return true
  }
  return false
}

function avifHasPrivateMetadata(bytes) {
  return includesAscii(bytes, 'Exif\0')
    || includesAscii(bytes, '<x:xmpmeta', true)
    || includesAscii(bytes, 'application/rdf+xml', true)
    || includesAscii(bytes, 'ns.adobe.com/xap', true)
}

export async function sanitizeImagePrivacyMetadata(input) {
  if (!(input instanceof Blob)) throw new Error('An image Blob is required.')
  const bytes = new Uint8Array(await input.arrayBuffer())
  let clean
  if (input.type === 'image/jpeg') clean = sanitizeJpeg(bytes)
  else if (input.type === 'image/png') clean = sanitizePng(bytes)
  else if (input.type === 'image/webp') clean = sanitizeWebp(bytes)
  else if (input.type === 'image/avif') {
    // AVIF item metadata cannot be safely rewritten here without also risking
    // removal of provenance boxes. Fail closed instead of re-encoding pixels.
    if (bytes.length < 12 || ascii(bytes, 4, 4) !== 'ftyp' || !['avif', 'avis', 'mif1', 'msf1'].some(brand => includesAscii(bytes.slice(8, Math.min(bytes.length, 64)), brand))) throw new Error('Invalid AVIF image.')
    if (avifHasPrivateMetadata(bytes)) throw new Error('This AVIF contains EXIF/XMP metadata. Convert it to PNG, JPEG or WebP before importing.')
    clean = bytes
  } else throw new Error('Use JPG, PNG, WebP or AVIF images.')
  return new Blob([clean], { type: input.type })
}
