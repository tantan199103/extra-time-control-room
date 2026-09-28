#!/usr/bin/env node

import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { buildListingInput, validateListing } from '../src/lib/catalog-model.js'
import { downloadCleanImage } from './fanatics-import-lib.mjs'
import { hasProtectedImageProvenance } from './taass-media-lib.mjs'
import {
  COMMA_CANONICAL_COLLECTIONS,
  COMMA_IMPORT_STATUS,
  COMMA_SOURCE_HOST,
  buildCommaCollectionPlan,
  commaImportReport,
  inferCommaTaxonomy,
  normalizeCommaProduct,
  publicCommaListingHasSourceReferences
} from './comma-import-lib.mjs'

for (const envFile of ['.env.local', '.env', '.env.fangear.import']) {
  if (!fs.existsSync(envFile)) continue
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {
    // Environment files are optional; explicit process variables win.
  }
}

const SOURCE_BASE = String(process.env.COMMA_SOURCE_BASE_URL || `https://${COMMA_SOURCE_HOST}`).replace(/\/+$/, '')
const sourceAuthorized = String(process.env.COMMA_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const outputPath = process.env.COMMA_IMPORT_REPORT || resolve('artifacts', 'comma-import-report.json')
const requestTimeoutMs = Math.max(2_000, Number(process.env.COMMA_REQUEST_TIMEOUT_MS || 30_000))
const requestRetries = Math.min(5, Math.max(0, Number(process.env.COMMA_REQUEST_RETRIES || 3)))
const requestIntervalMs = Math.max(100, Number(process.env.COMMA_REQUEST_INTERVAL_MS || 350))

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
function validHttpUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(String(value || '')).protocol) } catch { return false }
}
function sleep(milliseconds) { return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds)) }

const dryRun = !hasArg('--write')
const includeMedia = hasArg('--media') || String(process.env.COMMA_IMPORT_MEDIA || '').toLowerCase() === 'true'
const refreshExisting = hasArg('--refresh-existing')
const sourceId = String(argValue('--source-id', '')).trim()
const limit = hasArg('--all') ? 0 : Math.max(0, Number(argValue('--limit', process.env.COMMA_PRODUCT_LIMIT || 0)) || 0)
const mediaLimit = Math.min(20, Math.max(0, Math.trunc(Number(argValue('--media-limit', process.env.COMMA_MEDIA_LIMIT_PER_PRODUCT || 12)) || 0)))
const mediaConcurrency = Math.min(4, Math.max(1, Number(argValue('--concurrency', process.env.COMMA_MEDIA_CONCURRENCY || 2)) || 2))
const mediaBudgetBytes = Math.max(0, Math.trunc(Number(process.env.COMMA_MEDIA_BUDGET_BYTES || 220 * 1024 * 1024)))
const batchSize = Math.min(100, Math.max(1, Number(argValue('--batch-size', process.env.COMMA_BATCH_SIZE || 25)) || 25))
const requestedRate = Number(argValue('--usd-rate', process.env.COMMA_USD_RATE || 0))
const priceModeArg = String(argValue('--price-mode', process.env.COMMA_PRICE_MODE || '')).toUpperCase()
const priceMode = hasArg('--aud-as-usd') ? 'AUD_AS_USD' : priceModeArg || (Number.isFinite(requestedRate) && requestedRate > 0 ? 'AUD_TO_USD' : 'ZERO')
const usdRate = priceMode === 'AUD_TO_USD' ? requestedRate : 0

function usage() {
  console.log(`Comma Football catalogue importer\n\n` +
    `  node scripts/import-comma-catalog.mjs [--dry-run] [--limit N|--all] [--source-id ID]\n` +
    `       [--price-mode ZERO|AUD_TO_USD|AUD_AS_USD] [--usd-rate N] [--aud-as-usd]\n` +
    `       [--write] [--media] [--media-limit N] [--refresh-existing]\n\n` +
    `Defaults to a read-only dry run. New listings stay DRAFT, variants stay DRAFT\n` +
    `with zero stock, and source currency is never silently treated as USD.\n` +
    `--write requires COMMA_SOURCE_AUTHORIZED=true, SUPABASE_URL and the server-only\n` +
    `SUPABASE_SERVICE_ROLE_KEY. --media requires explicit source/media permission.`)
}

if (hasArg('--help') || hasArg('-h')) {
  usage()
  process.exit(0)
}

function assertWriteConfig() {
  if (!sourceAuthorized) throw new Error('Set COMMA_SOURCE_AUTHORIZED=true only after confirming permission to import and reuse this catalogue.')
  if (!validHttpUrl(supabaseUrl) || !serviceRoleKey) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Keep the service key server-side.')
  if (priceMode === 'AUD_TO_USD' && (!Number.isFinite(usdRate) || usdRate <= 0)) throw new Error('AUD_TO_USD requires --usd-rate or COMMA_USD_RATE greater than zero.')
}

let nextRequestAt = 0
let requestQueue = Promise.resolve()
async function requestSlot() {
  let release
  const previous = requestQueue
  requestQueue = new Promise(resolvePromise => { release = resolvePromise })
  await previous
  const wait = Math.max(0, nextRequestAt - Date.now())
  if (wait) await sleep(wait)
  nextRequestAt = Date.now() + requestIntervalMs
  release()
}

async function fetchJson(path, query = {}) {
  const url = new URL(`${SOURCE_BASE}/${String(path).replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  let lastError
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    await requestSlot()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers:{ accept:'application/json', 'accept-language':'en-US,en;q=0.9', 'user-agent':'Jersevo-authorized-catalog-sync/1.0' }
      })
      const text = await response.text()
      if (response.ok) return JSON.parse(text)
      lastError = new Error(`Comma source request ${response.status} for ${url.pathname}: ${text.slice(0, 220)}`)
      if (!(response.status === 429 || response.status >= 500) || attempt === requestRetries) throw lastError
      await sleep(Math.min(30_000, 700 * (2 ** attempt)))
    } catch (error) {
      lastError = error
      if (attempt === requestRetries || !/abort|fetch|network|429|5\d\d|timeout/i.test(String(error?.message || error))) throw error
      await sleep(Math.min(30_000, 700 * (2 ** attempt)))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError || new Error(`Comma source request failed: ${path}`)
}

async function fetchAllProducts() {
  const rows = []
  let sinceId = 0
  while (true) {
    const batch = (await fetchJson('products.json', { limit:250, currency:'AUD', ...(sinceId ? { since_id:sinceId } : {}) }))?.products || []
    if (!batch.length) break
    rows.push(...batch)
    const next = Math.max(...batch.map(row => Number(row.id) || 0))
    if (!next || next <= sinceId || batch.length < 250) break
    sinceId = next
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
      catch (error) { output[index] = { error:error instanceof Error ? error.message : String(error) } }
    }
  }
  await Promise.all(Array.from({ length:Math.min(concurrency, Math.max(1, items.length)) }, run))
  return output
}

function extensionForMime(mime) {
  return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/avif':'avif' })[mime] || 'bin'
}

async function prepareCommaImage(sourceUrl) {
  const downloaded = await downloadCleanImage(sourceUrl, { timeoutMs:requestTimeoutMs })
  const input = Buffer.from(await downloaded.blob.arrayBuffer())
  if (hasProtectedImageProvenance(input, downloaded.mime)) {
    return { blob:downloaded.blob, mime:downloaded.mime, bytes:input.length, optimized:false }
  }
  const qualities = [[1400, 64], [1200, 60], [1000, 56], [840, 52]]
  let best = input
  for (const [width, quality] of qualities) {
    const candidate = await sharp(input)
      .rotate()
      .resize({ width, height:1750, fit:'inside', withoutEnlargement:true })
      .avif({ quality, effort:4 })
      .toBuffer()
    if (candidate.length < best.length) best = candidate
    if (candidate.length <= 140 * 1024) break
  }
  if (best === input) return { blob:downloaded.blob, mime:downloaded.mime, bytes:input.length, optimized:false }
  return { blob:new Blob([best], { type:'image/avif' }), mime:'image/avif', bytes:best.length, optimized:true }
}

async function uploadCommaImage(client, prepared, storagePrefix) {
  const path = `${storagePrefix}.${extensionForMime(prepared.mime)}`
  const { error } = await client.storage.from('product-media').upload(path, prepared.blob, {
    contentType:prepared.mime,
    cacheControl:'31536000',
    upsert:false
  })
  if (error && !/already exists|duplicate|conflict|409/i.test(error.message || '')) throw new Error(`Supabase media upload failed: ${error.message}`)
  const { data } = client.storage.from('product-media').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('Supabase storage did not return a public URL.')
  return { url:data.publicUrl, path, mime:prepared.mime, bytes:prepared.bytes, optimized:prepared.optimized }
}

async function hydrateMedia(client, item, errors, budget) {
  if (!includeMedia || !mediaLimit || !item.media?.length) return item
  const uploaded = []
  for (let offset = 0; offset < Math.min(mediaLimit, item.media.length); offset += 1) {
    const sourceMedia = item.media[offset]
    try {
      const prepared = await prepareCommaImage(sourceMedia.sourceUrl)
      if (budget.used + prepared.bytes > budget.limit) {
        const error = new Error(`Media budget reached at ${Math.round(budget.used / 1_048_576)} MB.`)
        error.code = 'COMMA_MEDIA_BUDGET_EXCEEDED'
        throw error
      }
      budget.used += prepared.bytes
      const uploadedMedia = await uploadCommaImage(client, prepared, `${item.listing.id}/import/comma/${sourceMedia.id}`)
      uploaded.push({
        id:sourceMedia.id,
        type:'IMAGE',
        url:uploadedMedia.url,
        filename:sourceMedia.filename.replace(/\.avif$/i, `.${extensionForMime(uploadedMedia.mime)}`),
        alt:sourceMedia.alt,
        role:sourceMedia.role,
        width:sourceMedia.width,
        height:sourceMedia.height,
        createdAt:new Date().toISOString()
      })
    } catch (error) {
      if (error?.code === 'COMMA_MEDIA_BUDGET_EXCEEDED') throw error
      errors.push({ kind:'media', sourceId:item.sourceId, url:sourceMedia.sourceUrl, error:error instanceof Error ? error.message : String(error) })
    }
  }
  return { ...item, listing:{ ...item.listing, media:uploaded, image:uploaded[0]?.url || '' } }
}

async function fetchExisting(client, ids) {
  const existing = new Map()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from('pod_products')
      .select('id,status,updated_at,image,media,ai_metadata')
      .in('id', ids.slice(offset, offset + 100))
    if (error) throw new Error(`Cannot read existing Comma listings: ${error.message}`)
    for (const row of data || []) existing.set(row.id, row)
  }
  return existing
}

async function fetchExistingCollections(client, ids) {
  if (!ids.length) return new Map()
  const { data, error } = await client.from('pod_collections').select('id,status,updated_at').in('id', ids)
  if (error) throw new Error(`Cannot read existing Comma collections: ${error.message}`)
  return new Map((data || []).map(row => [row.id, row]))
}

function mergeExistingMedia(existingMedia, generatedMedia) {
  const rows = Array.isArray(existingMedia) ? [...existingMedia] : []
  const known = new Set(rows.map(row => row?.id).filter(Boolean))
  for (const row of generatedMedia || []) if (!known.has(row.id)) rows.push(row)
  return rows
}

async function saveListings(client, items, existing, errors) {
  let saved = 0
  const availableIds = new Set(existing.keys())
  const savedItems = []
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize)
    const prepared = []
    for (const item of batch) {
      const previous = existing.get(item.listing.id)
      if (previous && !refreshExisting) {
        savedItems.push({ ...item, skippedExisting:true })
        continue
      }
      if (previous && previous.status !== 'DRAFT') {
        errors.push({ kind:'existing-skip', sourceId:item.sourceId, status:previous.status, message:'Existing non-draft listing was not overwritten.' })
        savedItems.push({ ...item, skippedExisting:true })
        continue
      }
      prepared.push({ item, previous })
    }
    const hydrated = includeMedia
      ? await mapConcurrent(prepared, mediaConcurrency, async row => ({ ...row, item:await hydrateMedia(client, row.item, errors, mediaBudget) }))
      : prepared
    for (let hydratedIndex = 0; hydratedIndex < hydrated.length; hydratedIndex += 1) {
      const row = hydrated[hydratedIndex]
      if (row?.error) {
        errors.push({ kind:'media-product', sourceId:prepared[hydratedIndex]?.item?.sourceId || '', error:row.error })
        continue
      }
      const item = row.item
      if (publicCommaListingHasSourceReferences(item.listing)) {
        errors.push({ kind:'privacy', sourceId:item.sourceId, error:'Public listing contains a source-hosted URL.' })
        continue
      }
      const previous = row.previous
      const previousMedia = previous?.media || []
      const listing = previous && refreshExisting
        ? { ...item.listing, media:mergeExistingMedia(previousMedia, item.listing.media), image:previous.image || item.listing.image }
        : item.listing
      const { error } = await client.rpc('pod_save_listing', {
        listing:buildListingInput(listing),
        expected_updated_at:previous?.updated_at || null
      })
      if (error) {
        errors.push({ kind:'listing', sourceId:item.sourceId, id:item.listing.id, error:error.message })
        continue
      }
      saved += 1
      availableIds.add(item.listing.id)
      savedItems.push({ ...item, listing })
    }
    console.log(`Saved Comma listings ${Math.min(offset + batch.length, items.length)}/${items.length} · successful ${saved} · errors ${errors.length}`)
  }
  return { count:saved, availableIds, items:savedItems }
}

async function saveCollections(client, collections, existing, availableIds, errors) {
  const payload = []
  for (const collection of collections) {
    const previous = existing.get(collection.id)
    if (previous && (!refreshExisting || previous.status !== 'DRAFT')) continue
    payload.push({
      id:collection.id,
      handle:collection.handle,
      name:collection.name,
      description:collection.description,
      status:'DRAFT',
      hero:'',
      sort:'MANUAL',
      seo:collection.seo,
      products:collection.products.filter(id => availableIds.has(id))
    })
  }
  if (!payload.length) return 0
  const { error } = await client.rpc('pod_save_collections', { collection_payload:payload })
  if (error) {
    errors.push({ kind:'collection', error:error.message })
    return 0
  }
  return payload.length
}

async function saveAudit(client, items, collections, errors) {
  const rows = [
    ...items.map(item => ({
      source:COMMA_SOURCE_HOST,
      source_entity_id:String(item.sourceId),
      entity_type:'PRODUCT',
      entity_id:item.listing.id,
      source_sku:String(item.sourceSku || ''),
      source_categories:item.sourceCategories || []
    })),
    ...collections.map(collection => ({
      source:COMMA_SOURCE_HOST,
      source_entity_id:String(collection.sourceId),
      entity_type:'COLLECTION',
      entity_id:collection.id,
      source_sku:'',
      source_categories:[collection.name]
    }))
  ]
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await client.from('pod_catalog_imports').upsert(rows.slice(offset, offset + 250), { onConflict:'source,source_entity_id,entity_type' })
    if (error) errors.push({ kind:'audit', error:error.message })
  }
}

export async function run() {
  if (!dryRun) assertWriteConfig()
  if (priceMode === 'AUD_TO_USD' && (!Number.isFinite(usdRate) || usdRate <= 0)) throw new Error('AUD_TO_USD requires --usd-rate or COMMA_USD_RATE greater than zero.')
  console.log(`${dryRun ? 'Dry run' : 'Write run'} · source ${SOURCE_BASE} · currency AUD · price mode ${priceMode}${priceMode === 'AUD_TO_USD' ? ` @ ${usdRate}` : ''} · media ${includeMedia ? 'on' : 'off'} · products ${limit || 'all'}`)

  let sourceProducts = await fetchAllProducts()
  const sourceCollections = (await fetchJson('collections.json', { limit:250 }))?.collections || []
  if (sourceId) sourceProducts = sourceProducts.filter(product => String(product.id) === sourceId)
  if (limit) sourceProducts = sourceProducts.slice(0, limit)
  console.log(`Fetched ${sourceProducts.length} products and ${sourceCollections.length} source collections.`)

  const usedHandles = new Set()
  const usedSkus = new Set()
  const errors = []
  const items = []
  for (const product of sourceProducts) {
    try {
      const item = normalizeCommaProduct(product, { usedHandles, usedSkus, priceMode, usdRate })
      const validationErrors = validateListing(item.listing)
      if (validationErrors.length) {
        errors.push({ kind:'validation', sourceId:String(product.id || ''), errors:validationErrors })
        continue
      }
      items.push(item)
    } catch (error) {
      errors.push({ kind:'normalize', sourceId:String(product.id || ''), error:error instanceof Error ? error.message : String(error) })
    }
  }
  const collections = buildCommaCollectionPlan(items)
  let report = commaImportReport({ items, collections, sourceCollections, errors, priceMode, usdRate })
  report.mode = dryRun ? 'DRY_RUN' : 'WRITE'
  report.mediaRequested = includeMedia
  report.importedListings = 0
  report.importedCollections = 0
  report.skippedExisting = 0
  report.mediaBytesUploaded = 0

  if (!dryRun) {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth:{ persistSession:false, autoRefreshToken:false } })
    const existing = await fetchExisting(client, items.map(item => item.listing.id))
    report.skippedExisting = items.filter(item => existing.has(item.listing.id) && !refreshExisting).length
    const saved = await saveListings(client, items, existing, errors)
    report.importedListings = saved.count
    report.mediaBytesUploaded = mediaBudget.used
    const collectionExisting = await fetchExistingCollections(client, collections.map(collection => collection.id))
    report.importedCollections = await saveCollections(client, collections, collectionExisting, saved.availableIds, errors)
    await saveAudit(client, items, collections, errors)
  }

  report.errors = errors
  await mkdir(dirname(outputPath), { recursive:true })
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ mode:report.mode, products:report.products, variants:report.variants, collections:report.canonicalCollections.length, importedListings:report.importedListings, importedCollections:report.importedCollections, skippedExisting:report.skippedExisting, errors:report.errors.length, report:outputPath }, null, 2))
  if (report.errors.length && !dryRun) process.exitCode = 2
}

const mediaBudget = { used:0, limit:mediaBudgetBytes }

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/import-comma-catalog.mjs')
if (isMain) run().catch(error => { console.error(`Comma importer failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
