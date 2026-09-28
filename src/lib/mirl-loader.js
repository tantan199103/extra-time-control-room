function asBytes(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  throw new TypeError('MIRL input must be an ArrayBuffer or Uint8Array.')
}

class MirlReader {
  constructor(input) {
    this.bytes = asBytes(input)
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength)
    this.offset = 0
  }

  get done() { return this.offset >= this.bytes.byteLength }

  ensure(length) {
    if (this.offset + length > this.bytes.byteLength) throw new Error('Unexpected end of MIRL data.')
  }

  byte() {
    this.ensure(1)
    return this.view.getUint8(this.offset++)
  }

  word() {
    this.ensure(2)
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  integer() {
    this.ensure(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  float() {
    this.ensure(4)
    const value = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return value
  }

  string() {
    const length = this.integer()
    this.ensure(length)
    const value = new TextDecoder('latin1').decode(this.bytes.subarray(this.offset, this.offset + length))
    this.offset += length
    return value
  }
}

function updateBounds(bounds, x, y, z) {
  bounds.min[0] = Math.min(bounds.min[0], x)
  bounds.min[1] = Math.min(bounds.min[1], y)
  bounds.min[2] = Math.min(bounds.min[2], z)
  bounds.max[0] = Math.max(bounds.max[0], x)
  bounds.max[1] = Math.max(bounds.max[1], y)
  bounds.max[2] = Math.max(bounds.max[2], z)
}

function faceIndex(reader, vertexCount) {
  if (vertexCount < 256) return reader.byte()
  if (vertexCount < 65_536) return reader.word()
  return reader.integer()
}

/**
 * Parse the uncompressed payload of Owayo's MIRL v1.1 mesh format.
 * Geometry is centered as one garment, matching the upstream viewer.
 */
export function parseMirl(input) {
  const reader = new MirlReader(input)
  const version = reader.string()
  if (!version.startsWith('v1.1')) throw new Error(`Unsupported MIRL version: ${version}`)
  const uvAsFloat = version.endsWith('_UVsAsFloat')
  const bounds = { min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] }
  const parts = []

  while (!reader.done) {
    const name = reader.string()
    const vertexCount = reader.integer()
    const faceCount = reader.integer()
    const factorX = reader.float()
    const factorY = reader.float()
    const factorZ = reader.float()
    if (!name || !vertexCount || !faceCount || !factorX || !factorY || !factorZ) {
      throw new Error(`Invalid MIRL object header near byte ${reader.offset}.`)
    }

    const sourcePositions = new Float32Array(vertexCount * 3)
    for (let index = 0; index < vertexCount; index += 1) {
      const x = reader.word() / factorX
      const z = -reader.word() / factorY
      const y = reader.word() / factorZ
      const target = index * 3
      sourcePositions[target] = x
      sourcePositions[target + 1] = y
      sourcePositions[target + 2] = z
      updateBounds(bounds, x, y, z)
    }

    const sourceIndices = new Uint32Array(faceCount * 3)
    for (let face = 0; face < faceCount; face += 1) {
      const target = face * 3
      sourceIndices[target] = faceIndex(reader, vertexCount)
      sourceIndices[target + 1] = faceIndex(reader, vertexCount)
      sourceIndices[target + 2] = faceIndex(reader, vertexCount)
    }

    // The source format stores one UV per face corner. Expanding indexed
    // geometry preserves seams instead of letting the final face overwrite a
    // shared vertex's earlier UV.
    const positions = new Float32Array(faceCount * 9)
    const uvs = new Float32Array(faceCount * 6)
    for (let face = 0; face < faceCount; face += 1) {
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceVertex = sourceIndices[face * 3 + corner] * 3
        const targetVertex = (face * 3 + corner) * 3
        positions[targetVertex] = sourcePositions[sourceVertex]
        positions[targetVertex + 1] = sourcePositions[sourceVertex + 1]
        positions[targetVertex + 2] = sourcePositions[sourceVertex + 2]
        const uvTarget = (face * 3 + corner) * 2
        uvs[uvTarget] = uvAsFloat ? reader.float() : reader.word() / 65_535
        uvs[uvTarget + 1] = uvAsFloat ? reader.float() : reader.word() / 65_535
      }
    }
    parts.push({ name, vertexCount:faceCount * 3, faceCount, positions, uvs })
  }

  const center = bounds.min.map((value, index) => (value + bounds.max[index]) / 2)
  for (const part of parts) {
    for (let index = 0; index < part.positions.length; index += 3) {
      part.positions[index] -= center[0]
      part.positions[index + 1] -= center[1]
      part.positions[index + 2] -= center[2]
    }
  }

  return {
    version,
    parts,
    bounds,
    center,
    dimensions:bounds.max.map((value, index) => value - bounds.min[index])
  }
}

export function matchMirlTexture(partName, textures = {}) {
  const compact = value => String(value || '').replace(/[^a-z0-9]/gi, '').replace(/\d+$/g, '').toLowerCase()
  const target = compact(partName)
  const match = Object.entries(textures).find(([name]) => compact(name) === target)
    || Object.entries(textures).find(([name]) => target.startsWith(compact(name)) || compact(name).startsWith(target))
  return match?.[1] || ''
}
