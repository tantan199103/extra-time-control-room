#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildListingInput } from '../src/lib/catalog-model.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import {
  SOURCE_HOST,
  IMPORT_STATUS,
  normalizeSourceProduct,
  buildCollectionPlan,
  importReport,
  publicListingHasSourceReferences,
  stableHash,
  sanitizePublicText
} from './fangear-import-lib.mjs'

const API_BASE = String(process.env.FANGEAR_SOURCE_BASE_URL || `https://${SOURCE_HOST}`).replace(/\/+$/, '') + '/wp-json/wc/store/v1'
const sourceAuthorized = String(process.env.FANGEAR_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const maxProducts = Math.max(0, Number(process.env.FANGEAR_PRODUCT_LIMIT || 0))
const mediaPerProduct = Math.max(0, Number(process.env.FANGEAR_MEDIA_LIMIT_PER_PRODUCT || 12))
const mediaConcurrency = Math.max(1, Number(process.env.FANGEAR_MEDIA_CONCURRENCY || 4))
const variationConcurrency = Math.max(1, Number(process.env.FANGEAR_VARIATION_CONCURRENCY || 8))
const includeVariationDetails = String(process.env.FANGEAR_FETCH_VARIATION_DETAILS || 'true').toLowerCase() !== 'false'
const requestTimeoutMs = Math.max(2_000, Number(process.env.FANGEAR_REQUEST_TIMEOUT_MS || 30_000))
const outputPath = process.env.FANGEAR_IMPORT_REPORT || resolve('artifacts', 'fangear-import-report.json')

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const dryRun = !hasArg('--write')
const includeMedia = hasArg('--media') || (hasArg('--write') && String(process.env.FANGEAR_IMPORT_MEDIA || 'true').toLowerCase() !== 'false')
const limit = Math.max(0, Number(argValue('--limit', maxProducts)) || 0)
const sourceId = Math.max(0, Number(argValue('--source-id', 0)) || 0)

function usage() {
  console.log(`Fangear catalog importer\n\n` +
    `  node scripts/import-fangear-catalog.mjs [--dry-run] [--limit N] [--source-id ID] [--write] [--media]\n\n` +
    `Defaults to a read-only dry run. --write requires FANGEAR_SOURCE_AUTHORIZED=true,\n` +
    `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Imported products stay DRAFT.\n` +
    `--source-id safely retries one product without rewriting collection membership.`)
}

if (hasArg('--help') || hasArg('-h')) { usage(); process.exit(0) }

function assertSourcePermission() {
  if (!sourceAuthorized) throw new Error('Set FANGEAR_SOURCE_AUTHORIZED=true after confirming permission to import this catalog.')
}

async function fetchJson(path, query = {}) {
  const url = new URL(`${API_BASE}/${String(path).replace(/^\/+/, '')}`)
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)) })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'Extra-Time-catalog-import/1.0' } })
    const text = await response.text()
    if (!response.ok) throw new Error(`Source request ${response.status} for ${url.pathname}: ${text.slice(0, 240)}`)
    return { data: JSON.parse(text), headers: response.headers }
  } finally { clearTimeout(timeout) }
}

async function fetchAll(path, { perPage = 100, limitRows = 0 } = {}) {
  const rows = []
  let page = 1
  let totalPages = Infinity
  while (page <= totalPages && (!limitRows || rows.length < limitRows)) {
    const { data, headers } = await fetchJson(path, { per_page: perPage, page })
    const batch = Array.isArray(data) ? data : []
    rows.push(...batch.slice(0, limitRows ? Math.max(0, limitRows - rows.length) : batch.length))
    totalPages = Number(headers.get('x-wp-totalpages') || (batch.length < perPage ? page : page + 1))
    if (!batch.length) break
    page += 1
  }
  return rows
}

async function mapConcurrent(items, concurrency, worker) {
  const output = new Array(items.length)
  let cursor = 0
  async function run() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try { output[index] = await worker(items[index], index) }
      catch (error) { output[index] = { error: error instanceof Error ? error.message : String(error) } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return output
}

async function fetchVariationDetails(products) {
  const variationRows = products.flatMap(product => (product.variations || []).map(variation => ({ productId: product.id, variationId: variation.id })))
  const details = new Map()
  const results = await mapConcurrent(variationRows, variationConcurrency, async row => {
    const result = await fetchJson(`products/${row.variationId}`)
    return { ...row, variation: result.data }
  })
  for (const result of results) if (result?.variation?.id) details.set(Number(result.variation.id), result.variation)
  return { details, attempted: variationRows.length, failed: results.filter(result => result?.error).map(result => result.error) }
}

function mediaTypeFrom(response, sourceUrl) {
  const supplied = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  if (/^image\/(?:jpeg|png|webp|avif)$/.test(supplied)) return supplied
  const extension = String(new URL(sourceUrl).pathname.split('.').pop() || '').toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' })[extension] || ''
}

function extensionForMime(mime) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[mime] || 'bin' }

async function downloadCleanImage(sourceUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, headers: { accept: 'image/avif,image/webp,image/png,image/jpeg', 'user-agent': 'Extra-Time-catalog-import/1.0' } })
    if (!response.ok) throw new Error(`Image request ${response.status}`)
    const mime = mediaTypeFrom(response, sourceUrl)
    if (!mime) throw new Error('Unsupported image type')
    const input = new Blob([await response.arrayBuffer()], { type: mime })
    return { blob: await sanitizeImagePrivacyMetadata(input), mime }
  } finally { clearTimeout(timeout) }
}

async function uploadImage(client, sourceUrl, storagePath) {
  const { blob, mime } = await downloadCleanImage(sourceUrl)
  const { error } = await client.storage.from('product-media').upload(storagePath, blob, { contentType: mime, cacheControl: '31536000', upsert: false })
  if (error && !/already exists|duplicate|conflict|409/i.test(error.message || '')) throw new Error(error.message)
  const { data } = client.storage.from('product-media').getPublicUrl(storagePath)
  if (!data?.publicUrl) throw new Error('Storage did not return a public URL')
  return { url: data.publicUrl, mime }
}

async function hydrateProductMedia(client, item, errors) {
  if (!includeMedia || !item.media.length) return item
  const media = []
  for (const sourceMedia of item.media.slice(0, mediaPerProduct)) {
    try {
      const ext = extensionForMime(String(sourceMedia.sourceUrl).toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp')
      const path = `${item.listing.id}/import/${sourceMedia.id}.${ext}`
      const uploaded = await uploadImage(client, sourceMedia.sourceUrl, path)
      media.push({ id: sourceMedia.id, type: 'IMAGE', url: uploaded.url, filename: sourceMedia.filename, alt: sourceMedia.alt, createdAt: new Date().toISOString() })
    } catch (error) {
      errors.push({ kind: 'media', sourceId: item.sourceId, url: sourceMedia.sourceUrl, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { ...item, media, listing: { ...item.listing, media, image: media[0]?.url || '' } }
}

async function hydrateCollectionMedia(client, collection, errors) {
  if (!includeMedia || !collection.heroImageSourceUrl) return collection
  try {
    const ext = extensionForMime(collection.heroImageSourceUrl.toLowerCase().endsWith('.png') ? 'image/png' : 'image/webp')
    const path = `${collection.id}/import/hero-${stableHash(collection.heroImageSourceUrl, 16)}.${ext}`
    const uploaded = await uploadImage(client, collection.heroImageSourceUrl, path)
    return { ...collection, hero: uploaded.url }
  } catch (error) {
    errors.push({ kind: 'collection-media', sourceId: collection.sourceId, url: collection.heroImageSourceUrl, error: error instanceof Error ? error.message : String(error) })
    return { ...collection, hero: '' }
  }
}

async function saveListings(client, items, errors) {
  let imported = 0
  const importedIds = new Set()
  const existingRevisions = new Map()
  for (let offset = 0; offset < items.length; offset += 100) {
    const ids = items.slice(offset, offset + 100).map(item => item.listing.id)
    const { data, error } = await client.from('pod_products').select('id,updated_at').in('id', ids)
    if (error) {
      errors.push({ kind: 'listing-resume', error: error.message })
      break
    }
    for (const row of data || []) existingRevisions.set(row.id, row.updated_at)
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (publicListingHasSourceReferences(item.listing)) {
      errors.push({ kind: 'privacy', sourceId: item.sourceId, error: 'Public listing still contains a source/backlink or AI reference.' })
      continue
    }
    const { error } = await client.rpc('pod_save_listing', { listing: buildListingInput(item.listing), expected_updated_at: existingRevisions.get(item.listing.id) || null })
    if (error) errors.push({ kind: 'listing', sourceId: item.sourceId, id: item.listing.id, error: error.message })
    else { imported += 1; importedIds.add(item.listing.id) }
    if ((index + 1) % 50 === 0 || index + 1 === items.length) console.log(`Saved listings ${index + 1}/${items.length} · successful ${imported} · errors ${errors.length}`)
  }
  return { count: imported, importedIds }
}

async function saveCollections(client, collections, errors, importedIds = null) {
  const payload = collections.map(collection => ({
    id: collection.id,
    handle: collection.handle,
    name: collection.name,
    description: collection.description,
    status: 'DRAFT',
    hero: collection.hero || '',
    sort: collection.sortMode || 'MANUAL',
    seo: collection.seo || {},
    products: (collection.products || []).filter(productId => !importedIds || importedIds.has(productId))
  }))
  if (!payload.length) return 0
  const { error } = await client.rpc('pod_save_collections', { collection_payload: payload })
  if (error) { errors.push({ kind: 'collection', error: error.message }); return 0 }
  return payload.length
}

async function saveImportAudit(client, items, collections, errors, importedIds = null) {
  const rows = [
    ...items.filter(item => !importedIds || importedIds.has(item.listing.id)).map(item => ({
      source: SOURCE_HOST,
      source_entity_id: String(item.sourceId),
      entity_type: 'PRODUCT',
      entity_id: item.listing.id,
      source_sku: item.sourceSku || '',
      source_categories: (item.category?.categoryTags || []).map(value => sanitizePublicText(value))
    })),
    ...collections.map(collection => ({
      source: SOURCE_HOST,
      source_entity_id: String(collection.sourceId),
      entity_type: 'COLLECTION',
      entity_id: collection.id,
      source_sku: '',
      source_categories: [sanitizePublicText(collection.name)]
    }))
  ]
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await client.from('pod_catalog_imports').upsert(rows.slice(offset, offset + 250), { onConflict: 'source,source_entity_id,entity_type' })
    if (error) errors.push({ kind: 'audit', error: error.message })
  }
}

export async function run() {
  assertSourcePermission()
  const productScope = sourceId ? `source ID ${sourceId}` : (limit || 'all')
  console.log(`${dryRun ? 'Dry run' : 'Write run'} · source ${API_BASE} · products ${productScope} · media ${includeMedia ? 'on' : 'off'} · variation details ${includeVariationDetails ? 'on' : 'off'}`)
  const categories = await fetchAll('products/categories')
  const sourceProducts = sourceId
    ? [(await fetchJson(`products/${sourceId}`)).data]
    : await fetchAll('products', { limitRows: limit })
  console.log(`Fetched ${categories.length} categories and ${sourceProducts.length} products.`)
  const variationResult = includeVariationDetails
    ? await fetchVariationDetails(sourceProducts)
    : { details: new Map(), attempted: sourceProducts.reduce((count, product) => count + (product.variations || []).length, 0), failed: [] }
  const usedHandles = new Set()
  const usedSkus = new Set()
  const errors = [...variationResult.failed.map(error => ({ kind: 'variation', error }))]
  let items = sourceProducts.map(product => normalizeSourceProduct(product, { categories, variationDetails: variationResult.details, usedHandles, usedSkus }))
  const collections = sourceId ? [] : buildCollectionPlan(categories, sourceProducts)
  let client = null
  if (!dryRun) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Keep the service key server-side; never place it in VITE_* variables.')
    client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const normalizedItems = items
    let mediaCompleted = 0
    const hydrationResults = await mapConcurrent(normalizedItems, mediaConcurrency, async item => {
      const hydrated = await hydrateProductMedia(client, item, errors)
      mediaCompleted += 1
      if (mediaCompleted % 50 === 0 || mediaCompleted === normalizedItems.length) console.log(`Prepared media ${mediaCompleted}/${normalizedItems.length} products · errors ${errors.length}`)
      return { item: hydrated }
    })
    items = hydrationResults.map((result, index) => {
      if (!result?.error) return result.item
      errors.push({ kind: 'media-product', sourceId: normalizedItems[index].sourceId, error: result.error })
      return normalizedItems[index]
    })
    for (let index = 0; index < collections.length; index += 1) collections[index] = await hydrateCollectionMedia(client, collections[index], errors)
  }
  const report = importReport({ products: items, collections, errors, variationDetailsFetched: variationResult.details.size })
  report.mode = dryRun ? 'DRY_RUN' : 'WRITE'
  report.mediaImported = includeMedia && !dryRun
  report.importedListings = 0
  report.importedCollections = 0
  if (!dryRun) {
    const listingResult = await saveListings(client, items, errors)
    report.importedListings = listingResult.count
    report.importedCollections = await saveCollections(client, collections, errors, listingResult.importedIds)
    await saveImportAudit(client, items, collections, errors, listingResult.importedIds)
  }
  report.errors = errors
  await mkdir(resolve(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ mode: report.mode, products: report.products, collections: report.collections, importedListings: report.importedListings, importedCollections: report.importedCollections, errors: report.errors.length, report: outputPath }, null, 2))
  if (report.errors.length && !dryRun) process.exitCode = 2
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/import-fangear-catalog.mjs')
if (isMain) {
  run().catch(error => { console.error(`Importer failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
}
