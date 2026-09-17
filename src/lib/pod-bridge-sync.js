import { createProductDraft, generateVariantMatrix, normalizeCustomFields, slugify } from './catalog-model.js'
import { EMPTY_PERSONALIZED_JERSEY_PRESET, hashValue, normalizeProductPack, POD_BRIDGE_LIMITS, sha256Hex } from './pod-bridge-contract.js'

const uniqueHandle = (title, products = [], currentId = '') => {
  const taken = new Set(products.filter(product => product.id !== currentId).map(product => product.handle))
  const base = slugify(title || 'untitled-listing')
  let handle = base
  let suffix = 2
  while (taken.has(handle)) handle = `${base}-${suffix++}`
  return handle
}

const normalizedTags = tags => [...new Set((Array.isArray(tags) ? tags : []).map(value => String(value || '').trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))]

export async function bridgeFieldHashes(product) {
  const fields = {
    title: product.title || '',
    subtitle: product.subtitle || '',
    description: product.description || '',
    seo: product.seo || {},
    tags: product.tags || [],
    taxonomy: product.taxonomy || {},
    customFields: product.customFields || [],
    contentBlocks: product.contentBlocks || []
  }
  const entries = await Promise.all(Object.entries(fields).map(async ([key, value]) => [key, await hashValue(value)]))
  return Object.fromEntries(entries)
}

export async function createBridgeDraft(packInput, products = []) {
  const pack = normalizeProductPack(packInput)
  const draft = createProductDraft()
  const title = pack.content.title || 'Untitled listing'
  const externalKey = pack.externalKey || `bridge-${draft.id}`
  draft.title = title
  draft.name = title
  draft.handle = uniqueHandle(title, products)
  draft.subtitle = pack.content.subtitle
  draft.story = pack.content.subtitle
  draft.description = pack.content.description
  draft.seo = pack.content.seo
  draft.tags = normalizedTags(pack.content.tags)
  draft.taxonomy = { ...pack.content.taxonomy, collectionHint: pack.content.taxonomy.collectionHint || '' }
  draft.customFields = normalizeCustomFields(pack.content.customFields)
  draft.personalization = draft.customFields.map(field => field.label)
  draft.contentBlocks = pack.content.contentBlocks
  draft.status = 'DRAFT'
  draft.type = 'PERSONALIZED'
  draft.price = EMPTY_PERSONALIZED_JERSEY_PRESET.price
  draft.compareAt = EMPTY_PERSONALIZED_JERSEY_PRESET.compareAt
  draft.options = EMPTY_PERSONALIZED_JERSEY_PRESET.options.map(option => ({ ...option, values: [...option.values] }))
  draft.variants = generateVariantMatrix({ ...draft, options: draft.options, variants: [], price: 0 }).map(variant => ({
    ...variant,
    price: 0,
    compareAt: null,
    inventory: 0,
    status: 'DRAFT'
  }))
  draft.image = ''
  draft.media = []
  const fieldHashes = await bridgeFieldHashes(draft)
  draft.aiMetadata = {
    ...(draft.aiMetadata || {}),
    bridge: {
      schemaVersion: '1.0',
      presetId: EMPTY_PERSONALIZED_JERSEY_PRESET.id,
      externalKey,
      state: 'RECEIVING',
      fieldHashes,
      assetHashes: {},
      recentOperations: [],
      lastSyncedAt: null
    }
  }
  return { draft, pack }
}

export function bridgeMediaItem({ asset, publicUrl, path }) {
  const id = asset.id || `bridge-media-${slugify(asset.slotKey || 'asset')}-${asset.sha256.slice(0, 16)}`
  return {
    id,
    type: 'IMAGE',
    url: publicUrl,
    path,
    filename: asset.filename || `${asset.slotKey || 'asset'}.webp`,
    alt: asset.alt || asset.label || asset.slotKey || '',
    createdAt: new Date().toISOString(),
    bridge: {
      slotKey: asset.slotKey || '',
      kind: asset.kind || 'other',
      sourceHash: asset.sha256
    }
  }
}

export function managedBridgeFields(product) {
  return {
    title: product.title || '',
    subtitle: product.subtitle || '',
    description: product.description || '',
    seo: product.seo || {},
    tags: product.tags || [],
    taxonomy: product.taxonomy || {},
    customFields: product.customFields || [],
    contentBlocks: product.contentBlocks || []
  }
}

export async function applyBridgeContentPatch(existing, packInput, { webAppWins = true } = {}) {
  const pack = normalizeProductPack(packInput)
  const bridge = existing.aiMetadata?.bridge || {}
  const currentHashes = await bridgeFieldHashes(existing)
  const lastHashes = bridge.fieldHashes || {}
  const next = { ...existing }
  const skipped = []
  const patch = {
    title: pack.content.title,
    subtitle: pack.content.subtitle,
    description: pack.content.description,
    seo: pack.content.seo,
    tags: normalizedTags(pack.content.tags),
    taxonomy: { ...pack.content.taxonomy },
    customFields: normalizeCustomFields(pack.content.customFields),
    contentBlocks: pack.content.contentBlocks
  }
  for (const [key, value] of Object.entries(patch)) {
    const incomingHash = await hashValue(value)
    const hasUserEdit = webAppWins && typeof lastHashes[key] === 'string' && currentHashes[key] !== lastHashes[key] && incomingHash !== currentHashes[key]
    if (hasUserEdit) skipped.push(key)
    else next[key] = value
  }
  next.name = next.title
  next.story = next.subtitle
  next.personalization = (next.customFields || []).map(field => field.label)
  return { next, skipped, pack }
}

export async function finalizeBridgeMetadata(product, pack, { operationId, assetHashes = {}, state = 'SYNCED' } = {}) {
  const fieldHashes = await bridgeFieldHashes(product)
  const previous = product.aiMetadata?.bridge || {}
  const { source: _legacySource, ...previousWithoutSource } = previous
  const operations = [...new Set([...(previous.recentOperations || []), operationId].filter(Boolean))].slice(-POD_BRIDGE_LIMITS.maxRecentOperations)
  return {
    ...(product.aiMetadata || {}),
    bridge: {
      ...previousWithoutSource,
      schemaVersion: '1.0',
      externalKey: pack.externalKey || previous.externalKey || '',
      state,
      fieldHashes,
      assetHashes,
      recentOperations: operations,
      lastSyncedAt: new Date().toISOString()
    }
  }
}

export async function buildAssetDescriptor(file, { slotKey = '', kind = 'other', label = '', sourceMessageKey = '' } = {}) {
  if (!file) throw new Error('An image is required.')
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Use JPG, PNG, WebP or AVIF images.')
  if (file.size > POD_BRIDGE_LIMITS.maxImageBytes) throw new Error('Each bridge image must be smaller than 15 MB.')
  return {
    id: `asset-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
    slotKey: slugify(slotKey || label || 'asset'),
    kind: slugify(kind || 'other'),
    label: String(label || slotKey || 'Asset').slice(0, 120),
    sourceMessageKey,
    filename: file.name || 'bridge-image',
    mimeType: file.type,
    size: file.size,
    sha256: await sha256Hex(file)
  }
}
