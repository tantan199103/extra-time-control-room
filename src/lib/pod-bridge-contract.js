import { normalizePreviewRegion } from './customization-ai.js'

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g

export const POD_BRIDGE_PROTOCOL_VERSION = '1.0'

export const POD_BRIDGE_CHANNELS = Object.freeze({
  EXTENSION: 'pod-bridge',
  PAGE: 'pod-bridge-response'
})

export const POD_BRIDGE_ACTIONS = Object.freeze({
  HELLO: 'HELLO',
  BEGIN_IMPORT: 'BEGIN_IMPORT',
  ASSET_CHUNK: 'ASSET_CHUNK',
  COMMIT_IMPORT: 'COMMIT_IMPORT',
  PATCH_DRAFT: 'PATCH_DRAFT',
  ACK: 'ACK',
  ERROR: 'ERROR'
})

export const POD_BRIDGE_LIMITS = Object.freeze({
  maxImages: 20,
  maxSlots: 30,
  maxImageBytes: 15 * 1024 * 1024,
  maxSessionBytes: 150 * 1024 * 1024,
  chunkBytes: 1024 * 1024,
  maxTextLength: 12000,
  maxDescriptionLength: 5000,
  maxBlocks: 30,
  maxRecentOperations: 20
})

export const POD_BRIDGE_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const text = (value, max = POD_BRIDGE_LIMITS.maxTextLength) => String(value ?? '').normalize('NFC').replace(CONTROL_CHARS, '').trim().slice(0, max)
const list = (value, max, itemMax = 240) => Array.isArray(value) ? value.map(item => text(item, itemMax)).filter(Boolean).slice(0, max) : []

export function slugifyBridge(value, fallback = 'asset') {
  const slug = text(value, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || fallback
}

function normalizeCustomField(field, index) {
  const input = field && typeof field === 'object' ? field : { label: field }
  const key = slugifyBridge(input.key || input.label || `field-${index + 1}`, `field-${index + 1}`).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  const type = ['text', 'number', 'textarea', 'select', 'photo', 'logo'].includes(input.type) ? input.type : 'text'
  const previewRegion = type === 'logo' ? normalizePreviewRegion(input.previewRegion) : null
  return {
    id: text(input.id, 120) || `bridge-field-${index + 1}`,
    key,
    label: text(input.label || key, 120),
    type,
    required: Boolean(input.required),
    placeholder: text(input.placeholder, 180),
    maxLength: input.maxLength === '' || input.maxLength == null ? null : Math.max(1, Math.min(2000, Number(input.maxLength) || 1)),
    help: text(input.help, 400),
    options: list(input.options, 30, 120),
    allowAiFinish: type === 'logo' ? input.allowAiFinish !== false : false,
    requiresConsent: type === 'logo' ? input.requiresConsent !== false : false,
    logoTreatment: type === 'logo' ? text(input.logoTreatment, 24).toUpperCase() || 'EXACT' : null,
    minWidth: type === 'logo' ? Math.max(256, Math.min(4000, Number(input.minWidth) || 800)) : null,
    previewRegion
  }
}

function normalizeAssetSlot(slot, index) {
  const input = slot && typeof slot === 'object' ? slot : { label: slot }
  return {
    key: slugifyBridge(input.key || input.label || `asset-${index + 1}`, `asset-${index + 1}`).slice(0, 48),
    label: text(input.label || input.key || `Asset ${index + 1}`, 120),
    kind: slugifyBridge(input.kind || 'other', 'other').slice(0, 40),
    required: Boolean(input.required),
    order: Number.isFinite(Number(input.order)) ? Math.max(0, Math.min(999, Number(input.order))) : index + 1
  }
}

function normalizeContent(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const seo = source.seo && typeof source.seo === 'object' ? source.seo : {}
  const taxonomy = source.taxonomy && typeof source.taxonomy === 'object' ? source.taxonomy : {}
  const blocks = Array.isArray(source.contentBlocks) ? source.contentBlocks : []
  return {
    title: text(source.title, 120),
    subtitle: text(source.subtitle, 180),
    description: text(source.description, POD_BRIDGE_LIMITS.maxDescriptionLength),
    seo: {
      title: text(seo.title, 70),
      description: text(seo.description, 170),
      keywords: list(seo.keywords, 20, 80)
    },
    tags: list(source.tags, 30, 80).map(item => item.toLowerCase().replace(/\s+/g, '-')),
    taxonomy: {
      category: text(taxonomy.category, 120),
      season: text(taxonomy.season, 120),
      audience: text(taxonomy.audience, 120),
      colorFamily: text(taxonomy.colorFamily, 120),
      collectionHint: text(taxonomy.collectionHint || taxonomy.collection, 120)
    },
    customFields: Array.isArray(source.customFields) ? source.customFields.slice(0, 30).map(normalizeCustomField) : [],
    contentBlocks: blocks.slice(0, POD_BRIDGE_LIMITS.maxBlocks).map((block, index) => ({
      id: text(block?.id, 120) || `bridge-block-${index + 1}`,
      type: ['heading', 'paragraph', 'quote'].includes(block?.type) ? block.type : 'paragraph',
      content: text(block?.content, 1200),
      mediaId: text(block?.mediaId, 120)
    })).filter(block => block.content)
  }
}

export function normalizeProductPack(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const rawSlots = Array.isArray(source.assetSlots) ? source.assetSlots : []
  const seenSlots = new Set()
  const assetSlots = rawSlots.slice(0, POD_BRIDGE_LIMITS.maxSlots).map(normalizeAssetSlot).filter(slot => {
    if (!slot.key || seenSlots.has(slot.key)) return false
    seenSlots.add(slot.key)
    return true
  }).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
  return {
    schemaVersion: text(source.schemaVersion, 20) || '1.0',
    externalKey: text(source.externalKey || source.id, 120),
    locale: text(source.locale, 20) || 'en',
    content: normalizeContent(source.content || source),
    assetSlots,
    source: {
      provider: text(source.source?.provider, 60) || 'chatgpt-web',
      messageKey: text(source.source?.messageKey, 160),
      capturedAt: text(source.source?.capturedAt, 60) || new Date().toISOString()
    }
  }
}

export function validateProductPack(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('Product Pack must be an object.')
  const pack = normalizeProductPack(input)
  if (pack.schemaVersion !== '1.0') errors.push('Only Product Pack schemaVersion 1.0 is supported.')
  if (!pack.content.title) errors.push('Product title is required.')
  if (!pack.content.description && !pack.content.subtitle) errors.push('Add a description or subtitle before syncing.')
  if (!pack.externalKey) errors.push('Product externalKey is required.')
  if (pack.content.customFields.some(field => !field.key || !field.label)) errors.push('Custom fields need keys and labels.')
  if (pack.content.customFields.some(field => field.type === 'select' && !field.options.length)) errors.push('Select custom fields need options.')
  if (Array.isArray(input?.assetSlots) && input.assetSlots.length > POD_BRIDGE_LIMITS.maxSlots) errors.push(`Use at most ${POD_BRIDGE_LIMITS.maxSlots} asset slots.`)
  return { ok: errors.length === 0, errors: [...new Set(errors)], value: pack }
}

export function validateBridgeAssets(input) {
  const assets = Array.isArray(input) ? input : []
  const errors = []
  const assetIds = new Set()
  const slots = new Set()
  if (!Array.isArray(input)) errors.push('Bridge assets must be a list.')
  if (assets.length > POD_BRIDGE_LIMITS.maxImages) errors.push(`A session can contain at most ${POD_BRIDGE_LIMITS.maxImages} images.`)
  let totalBytes = 0
  for (const asset of assets) {
    const assetId = text(asset?.assetId, 160)
    const slotKey = text(asset?.slotKey, 48)
    const size = Number(asset?.size)
    const chunkCount = Number(asset?.chunkCount)
    if (!assetId || assetIds.has(assetId)) errors.push('Every bridge image needs a unique asset ID.')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slotKey) || slots.has(slotKey)) errors.push('Every bridge image needs a unique slug asset slot.')
    if (!POD_BRIDGE_ALLOWED_IMAGE_TYPES.has(asset?.mimeType)) errors.push(`Unsupported image type for ${slotKey || assetId || 'asset'}.`)
    if (!Number.isInteger(size) || size <= 0 || size > POD_BRIDGE_LIMITS.maxImageBytes) errors.push(`Invalid image size for ${slotKey || assetId || 'asset'}.`)
    if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > Math.ceil(POD_BRIDGE_LIMITS.maxImageBytes / POD_BRIDGE_LIMITS.chunkBytes)) errors.push(`Invalid chunk count for ${slotKey || assetId || 'asset'}.`)
    if (!/^[a-f0-9]{64}$/i.test(String(asset?.sha256 || ''))) errors.push(`Invalid SHA-256 for ${slotKey || assetId || 'asset'}.`)
    if (assetId) assetIds.add(assetId)
    if (slotKey) slots.add(slotKey)
    if (Number.isFinite(size) && size > 0) totalBytes += size
  }
  if (totalBytes > POD_BRIDGE_LIMITS.maxSessionBytes) errors.push('The bridge session is larger than 150 MB.')
  return { ok: errors.length === 0, errors: [...new Set(errors)], value: assets }
}

export function parseProductPackText(rawText) {
  const source = String(rawText || '')
  const fenced = source.match(/```pod-product\s*([\s\S]*?)```/i)
  const marker = source.match(/<POD_PRODUCT>\s*([\s\S]*?)\s*<\/POD_PRODUCT>/i)
  const candidate = fenced?.[1] || marker?.[1]
  if (!candidate) return { ok: false, errors: ['No pod-product JSON block found.'], value: null }
  try {
    const parsed = JSON.parse(candidate.trim())
    return validateProductPack(parsed)
  } catch {
    return { ok: false, errors: ['The pod-product block is not valid JSON.'], value: null }
  }
}

export function createBridgeEnvelope(action, payload = {}, { requestId = globalThis.crypto?.randomUUID?.() || `request-${Date.now()}`, sessionId = '', nonce = '', channel = POD_BRIDGE_CHANNELS.EXTENSION } = {}) {
  return { channel, protocolVersion: POD_BRIDGE_PROTOCOL_VERSION, action, requestId, sessionId, nonce, payload }
}

export function isBridgeEnvelope(value, channel = POD_BRIDGE_CHANNELS.EXTENSION) {
  return Boolean(value && value.channel === channel && value.protocolVersion === POD_BRIDGE_PROTOCOL_VERSION && typeof value.action === 'string' && typeof value.requestId === 'string')
}

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  return JSON.stringify(value ?? null)
}

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashValue(value) {
  return sha256Hex(stableSerialize(value))
}

export const EMPTY_PERSONALIZED_JERSEY_PRESET = Object.freeze({
  id: 'empty-personalized-jersey-v1',
  type: 'PERSONALIZED',
  price: 0,
  compareAt: null,
  options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] }]
})

export function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new Error('Invalid image data.')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}
