#!/usr/bin/env node

// Synchronize the public Topperzstore catalogue into Jersevo.
//
// The command is read-only by default. A write run requires an explicit
// TOPPERZ_SOURCE_AUTHORIZED=true guard, keeps imported listings in DRAFT, and
// stores 1000 units on every active variant. Media is downloaded, privacy
// metadata is cleaned, optimized, and uploaded to the Jersevo bucket; source
// URLs never enter the public product JSON.

import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { buildListingInput } from '../src/lib/catalog-model.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import { catalogRequestHeaders } from './http-user-agent.mjs'
import { hasProtectedImageProvenance } from './taass-media-lib.mjs'
import { downloadCleanImage } from './fanatics-import-lib.mjs'
import {
  TOPPERZ_DEFAULT_STOCK,
  TOPPERZ_IMPORT_VERSION,
  TOPPERZ_SITEMAP_URL,
  TOPPERZ_SOURCE_HOST,
  normalizeTopperzProduct,
  parseTopperzProductHtml,
  parseTopperzSitemap,
  parseTopperzSitemapIndex,
  publicTopperzListingHasSourceReferences,
  topperzImportReport
} from './topperz-import-lib.mjs'
import { stableHash, stableId, slugify } from './fangear-import-lib.mjs'

// A catalogue run can process tens of thousands of source images. Sharp's
// default process-wide cache is sized for interactive image servers and can
// retain several gigabytes during a long importer run, so keep it bounded and
// let the checkpoint/resume loop own durability instead of native cache.
sharp.cache({ memory: 64, files: 0, items: 128 })
sharp.concurrency(2)

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const name = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[name]) process.env[name] = value
  }
}

const SOURCE_BASE = String(process.env.TOPPERZ_SOURCE_BASE_URL || 'https://www.topperzstore.com').replace(/\/+$/, '')
const sourceAuthorized = String(process.env.TOPPERZ_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const dryRun = !process.argv.includes('--write')
const includeMedia = process.argv.includes('--media')
const mediaLimitInput = argValue('--media-limit', process.env.TOPPERZ_MEDIA_LIMIT_PER_PRODUCT || '2')
const mediaLimitParsed = Number(mediaLimitInput)
const mediaLimit = Number.isFinite(mediaLimitParsed) ? Math.min(20, Math.max(0, Math.trunc(mediaLimitParsed))) : 2
const offset = Math.max(0, Number(argValue('--offset', process.env.TOPPERZ_PRODUCT_OFFSET || 0)) || 0)
const limit = Math.max(0, Number(argValue('--limit', process.env.TOPPERZ_PRODUCT_LIMIT || 0)) || 0)
const pageConcurrency = Math.min(24, Math.max(1, Number(argValue('--concurrency', process.env.TOPPERZ_CONCURRENCY || 12)) || 12))
const mediaConcurrency = Math.min(24, Math.max(1, Number(argValue('--media-concurrency', process.env.TOPPERZ_MEDIA_CONCURRENCY || 8)) || 8))
const saveConcurrency = Math.min(20, Math.max(1, Number(argValue('--save-concurrency', process.env.TOPPERZ_SAVE_CONCURRENCY || 12)) || 12))
const batchSize = Math.min(250, Math.max(10, Number(argValue('--batch-size', process.env.TOPPERZ_BATCH_SIZE || 100)) || 100))
const defaultStock = Math.min(1_000_000, Math.max(1, Number(argValue('--stock', process.env.TOPPERZ_DEFAULT_STOCK || TOPPERZ_DEFAULT_STOCK)) || TOPPERZ_DEFAULT_STOCK))
const requestTimeoutMs = Math.max(3_000, Number(process.env.TOPPERZ_REQUEST_TIMEOUT_MS || 45_000))
const requestRetries = Math.min(5, Math.max(0, Number(process.env.TOPPERZ_REQUEST_RETRIES || 3)))
const requestIntervalMs = Math.max(50, Number(process.env.TOPPERZ_REQUEST_INTERVAL_MS || 90))
const reportPath = resolve(process.env.TOPPERZ_IMPORT_REPORT || 'artifacts/topperz-import-report.json')
const checkpointPath = resolve(process.env.TOPPERZ_IMPORT_CHECKPOINT || 'artifacts/topperz-import-checkpoint.json')
const refreshExisting = process.argv.includes('--refresh-existing')
const includeAllMedia = mediaLimit === 0
const supabaseTimeoutMs = Math.max(5_000, Number(process.env.TOPPERZ_SUPABASE_TIMEOUT_MS || 30_000))
const reportItemLimit = Math.max(0, Number(process.env.TOPPERZ_REPORT_ITEM_LIMIT || 500))

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function usage() {
  console.log(`Topperzstore catalogue synchronizer\n\n` +
    `  node scripts/sync-topperz-catalog.mjs [--limit N] [--offset N] [--concurrency N]\n` +
    `       [--write] [--media] [--media-limit N|0] [--stock 1000]\n` +
    `       [--batch-size N] [--refresh-existing]\n\n` +
    `Default is a read-only dry run. --write requires TOPPERZ_SOURCE_AUTHORIZED=true,\n` +
    `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Imported rows remain DRAFT until\n` +
    `rights and merchandising review is complete. Stock is 1000 per active variant.\n` +
    `--media-limit 0 imports every discovered image; the default is the first two.`)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage()
  process.exit(0)
}

function assertWriteConfig() {
  if (!sourceAuthorized) throw new Error('Set TOPPERZ_SOURCE_AUTHORIZED=true after confirming permission to import and reuse this catalogue.')
  if (!/^https?:\/\//i.test(supabaseUrl) || serviceRoleKey.length < 24) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  if (new URL(supabaseUrl).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('Import is restricted to the active Jersevo Supabase project.')
}

function sleep(ms) { return new Promise(resolvePromise => setTimeout(resolvePromise, Math.max(0, ms))) }

function supabaseFetch(input, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), supabaseTimeoutMs)
  const signals = [init.signal, controller.signal].filter(Boolean)
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals)
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer))
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

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(60_000, retryAfter * 1000)
  return Math.min(30_000, 700 * (2 ** attempt) + Math.round(Math.random() * 300))
}

async function request(url, { binary = false, accept = 'text/html,application/xhtml+xml' } = {}) {
  let lastError
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    await requestSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: catalogRequestHeaders({ accept, 'accept-language': 'en-US,en;q=0.9,de;q=0.5' })
      })
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : await response.text()
      const body = binary ? '' : (await response.text()).slice(0, 240)
      lastError = new Error(`Topperzstore request ${response.status} for ${new URL(url).pathname}: ${body}`)
      if (!(response.status === 429 || response.status >= 500) || attempt === requestRetries) throw lastError
      await sleep(retryDelay(response, attempt))
    } catch (error) {
      lastError = error
      if (attempt === requestRetries || !/abort|fetch|network|429|5\d\d|timeout/i.test(String(error?.message || error))) throw error
      await sleep(retryDelay(null, attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError || new Error(`Topperzstore request failed: ${url}`)
}

function decodeSitemap(bytes) {
  const input = Buffer.from(bytes)
  return input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input).toString('utf8') : input.toString('utf8')
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
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, run))
  return output
}

export async function discoverTopperzProducts() {
  const root = await request(`${SOURCE_BASE}/sitemap.xml`, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' })
  const childMaps = parseTopperzSitemapIndex(root)
  const documents = childMaps.length
    ? await mapConcurrent(childMaps, Math.min(3, pageConcurrency), async url => decodeSitemap(await request(url, { binary: true, accept: 'application/gzip,application/xml,text/xml;q=0.9' })))
    : [root]
  const rows = documents.flatMap(parseTopperzSitemap)
  const unique = new Map()
  for (const row of rows) if (!unique.has(row.url)) unique.set(row.url, row)
  return { rows: [...unique.values()], sitemapCount: childMaps.length || 1 }
}

async function fetchParsedProduct(row) {
  const html = await request(row.url)
  const parsed = parseTopperzProductHtml(html, row.url)
  parsed.lastmod = row.lastmod || ''
  return parsed
}

function extensionForMime(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[mime] || 'avif'
}

async function prepareImage(sourceUrl) {
  const { blob, mime } = await downloadCleanImage(sourceUrl, { timeoutMs: requestTimeoutMs })
  const original = Buffer.from(await blob.arrayBuffer())
  if (hasProtectedImageProvenance(original, mime)) return { blob, mime, bytes: original.length }
  const optimized = await sharp(original)
    .rotate()
    .resize({ width: 1200, height: 1400, fit: 'inside', withoutEnlargement: true })
    .avif({ quality: 56, effort: 2 })
    .toBuffer()
  return { blob: new Blob([optimized], { type: 'image/avif' }), mime: 'image/avif', bytes: optimized.length }
}

async function hydrateMedia(client, item, errors, budget) {
  if (!includeMedia || !item.media.length) return item
  const selected = includeAllMedia ? item.media : item.media.slice(0, mediaLimit)
  const uploaded = []
  const worker = async sourceMedia => {
    const storagePrefix = `${item.listing.id}/import/topperz/${sourceMedia.id}`
    try {
      const prepared = await prepareImage(sourceMedia.sourceUrl)
      if (Number.isFinite(budget.limit) && budget.used + prepared.bytes > budget.limit) {
        const error = new Error(`Topperz media budget exceeded at ${Math.round(budget.used / 1_048_576)} MB.`)
        error.code = 'TOPPERZ_MEDIA_BUDGET_EXCEEDED'
        throw error
      }
      const path = `${storagePrefix}.${extensionForMime(prepared.mime)}`
      const { error: uploadError } = await client.storage.from('product-media').upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: '31536000', upsert: false })
      if (uploadError && !/already exists|duplicate|conflict|409/i.test(uploadError.message || '')) throw new Error(uploadError.message)
      const { data } = client.storage.from('product-media').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('Storage did not return a public URL')
      budget.used += prepared.bytes
      return { ...sourceMedia, url: data.publicUrl, sourceUrl: undefined, filename: `${sourceMedia.filename.replace(/\.[^.]+$/, '')}.${extensionForMime(prepared.mime)}`, createdAt: new Date().toISOString() }
    } catch (error) {
      errors.push({ kind: 'media', sourceId: item.sourceId, url: sourceMedia.sourceUrl, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }
  for (let index = 0; index < selected.length; index += mediaConcurrency) {
    const result = await Promise.all(selected.slice(index, index + mediaConcurrency).map(worker))
    uploaded.push(...result.filter(Boolean))
  }
  return { ...item, media: uploaded, listing: { ...item.listing, media: uploaded, image: uploaded[0]?.url || '' } }
}

async function fetchExisting(client, ids) {
  const rows = new Map()
  for (let offsetIndex = 0; offsetIndex < ids.length; offsetIndex += 75) {
    const { data, error } = await client.from('pod_products')
      .select('id,updated_at,status,image,media,ai_metadata')
      .in('id', ids.slice(offsetIndex, offsetIndex + 75))
    if (error) throw new Error(`Existing Topperz listing query failed: ${error.message}`)
    for (const row of data || []) rows.set(row.id, row)
  }
  return rows
}

function mergedListing(item, previous) {
  if (!previous) return item.listing
  const previousMedia = Array.isArray(previous.media) ? previous.media : []
  const nextMedia = [...previousMedia, ...(item.listing.media || [])]
    .filter((row, index, rows) => row?.id && rows.findIndex(candidate => candidate.id === row.id) === index)
  if (previous.status === 'PUBLISHED' && !refreshExisting) return null
  return {
    ...item.listing,
    status: previous.status || item.listing.status,
    image: previous.image || item.listing.image || nextMedia[0]?.url || '',
    media: nextMedia,
    aiMetadata: { ...(previous.ai_metadata || {}), ...(item.listing.aiMetadata || {}) }
  }
}

async function saveListings(client, items, existing, errors) {
  const candidates = []
  let skippedPublished = 0
  for (const item of items) {
    const previous = existing.get(item.listing.id)
    const listing = mergedListing(item, previous)
    if (!listing) {
      skippedPublished += 1
      continue
    }
    if (publicTopperzListingHasSourceReferences(listing)) {
      errors.push({ kind: 'privacy', sourceId: item.sourceId, error: 'Public listing contains a Topperzstore/source URL.' })
      continue
    }
    candidates.push({ item, listing, previous })
  }
  let saved = 0
  const savedItems = []
  for (let offsetIndex = 0; offsetIndex < candidates.length; offsetIndex += saveConcurrency) {
    const batch = candidates.slice(offsetIndex, offsetIndex + saveConcurrency)
    const results = await Promise.allSettled(batch.map(async candidate => {
      const { error } = await client.rpc('pod_save_listing', {
        listing: buildListingInput(candidate.listing),
        expected_updated_at: candidate.previous?.updated_at || null
      })
      if (error) throw new Error(error.message)
      return candidate
    }))
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') { saved += 1; savedItems.push(result.value) }
      else errors.push({ kind: 'listing', sourceId: batch[index].item.sourceId, id: batch[index].item.listing.id, error: result.reason?.message || 'Save failed' })
    })
    console.log(`Saved listings ${Math.min(offsetIndex + batch.length, candidates.length)}/${candidates.length} · successful ${saved} · errors ${errors.length}`)
  }
  return { saved, items: savedItems, skippedPublished }
}

const COLLECTION_DEFINITIONS = Object.freeze({
  Caps: { handle: 'accessories', name: 'Accessories', description: 'Sports accessories and matchday details.' },
  'Knit Hats': { handle: 'accessories', name: 'Accessories', description: 'Sports accessories and matchday details.' },
  'Fan Apparel': { handle: 'apparel', name: 'Apparel', description: 'Everyday sports apparel and fan layers.' },
  Accessories: { handle: 'accessories', name: 'Accessories', description: 'Sports accessories and matchday details.' },
  'Socks & Small Apparel': { handle: 'accessories', name: 'Accessories', description: 'Sports accessories and matchday details.' }
})

const LEAGUE_COLLECTIONS = Object.freeze({
  nfl: ['NFL', 'NFL fan gear'], nba: ['NBA', 'NBA fan gear'], mlb: ['MLB', 'MLB fan gear'], nhl: ['NHL', 'NHL fan gear'],
  mls: ['MLS', 'MLS fan gear'], ncaa: ['NCAA', 'College fan gear'], epl: ['Premier League', 'Premier League fan gear'],
  laliga: ['La Liga', 'La Liga fan gear'], bundesliga: ['Bundesliga', 'Bundesliga fan gear'], ligue1: ['Ligue 1', 'Ligue 1 fan gear'], seriea: ['Serie A', 'Serie A fan gear']
})

async function loadCollections(client) {
  const map = new Map()
  for (let offsetIndex = 0; ; offsetIndex += 500) {
    const { data, error } = await client.from('pod_collections').select('id,handle,name,status').order('handle').range(offsetIndex, offsetIndex + 499)
    if (error) throw new Error(`Cannot read collections: ${error.message}`)
    for (const row of data || []) map.set(row.handle, row)
    if ((data || []).length < 500) break
  }
  return map
}

function plansFor(item, collectionMap) {
  const taxonomy = item.listing.taxonomy || {}
  const handles = []
  const category = COLLECTION_DEFINITIONS[item.listing.productGroup]
  if (category) handles.push(category.handle)
  const league = String(taxonomy.league || '').toLowerCase()
  if (league && LEAGUE_COLLECTIONS[league]) handles.push(slugify(league))
  const team = String(taxonomy.team || '').trim()
  if (team && collectionMap.has(team)) handles.push(team)
  return [...new Set(handles)]
}

async function routeCatalog(client, savedItems, collectionMap) {
  const plans = savedItems.map(candidate => ({ productId: candidate.listing.id, handles: plansFor(candidate, collectionMap) })).filter(plan => plan.handles.length)
  const required = new Set(plans.flatMap(plan => plan.handles))
  const missing = [...required].filter(handle => !collectionMap.has(handle))
  const rows = []
  for (const handle of missing) {
    const category = Object.values(COLLECTION_DEFINITIONS).find(item => item.handle === handle)
    const league = Object.entries(LEAGUE_COLLECTIONS).find(([key]) => slugify(key) === handle)
    if (!category && !league) continue
    const name = category?.name || league?.[1]?.[0] || handle
    const description = category?.description || league?.[1]?.[1] || `${name} products and fan gear.`
    rows.push({ id: stableId('collection', `topperz-route:${handle}`), handle, name, description, status: 'DRAFT', hero_image: null, sort_mode: 'NEWEST', seo: { title: name, description } })
  }
  if (rows.length) {
    const { error } = await client.from('pod_collections').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`Cannot create category collections: ${error.message}`)
    rows.forEach(row => collectionMap.set(row.handle, row))
  }
  const links = plans.flatMap(plan => plan.handles.map(handle => ({ collection_id: collectionMap.get(handle)?.id, product_id: plan.productId, sort_order: 100_000 + Number.parseInt(stableHash(plan.productId, 7), 16), featured: false })).filter(row => row.collection_id))
  for (let offsetIndex = 0; offsetIndex < links.length; offsetIndex += 250) {
    const { error } = await client.from('pod_collection_products').upsert(links.slice(offsetIndex, offsetIndex + 250), { onConflict: 'collection_id,product_id', ignoreDuplicates: true })
    if (error) throw new Error(`Cannot assign catalogue membership: ${error.message}`)
  }
  return { created: rows.length, links: links.length, collections: collectionMap }
}

async function saveAudit(client, items) {
  const rows = items.map(candidate => ({ source: TOPPERZ_SOURCE_HOST, source_entity_id: String(candidate.item.sourceId), entity_type: 'PRODUCT', entity_id: candidate.listing.id, source_sku: candidate.item.sourceSku || '', source_categories: candidate.item.sourceCategories || [] }))
  for (let offsetIndex = 0; offsetIndex < rows.length; offsetIndex += 250) {
    const { error } = await client.from('pod_catalog_imports').upsert(rows.slice(offsetIndex, offsetIndex + 250), { onConflict: 'source,source_entity_id,entity_type' })
    if (error) throw new Error(`Topperz import audit failed: ${error.message}`)
  }
}

async function loadCheckpoint(identity) {
  if (process.argv.includes('--fresh')) return null
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
    if (checkpoint.identity !== identity) return null
    return checkpoint
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function persistCheckpoint(identity, completed, report) {
  await mkdir(resolve(checkpointPath, '..'), { recursive: true })
  await writeFile(checkpointPath, JSON.stringify({ identity, completed: [...completed], report, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
}

export async function run() {
  if (!dryRun) assertWriteConfig()
  console.log(`${dryRun ? 'Dry run' : 'Write run'} · ${SOURCE_BASE} · offset ${offset} · limit ${limit || 'all'} · media ${includeMedia ? (includeAllMedia ? 'all' : `first ${mediaLimit}`) : 'off'} · stock ${defaultStock}/variant · listings stay DRAFT`)
  const discovery = await discoverTopperzProducts()
  const selected = discovery.rows.slice(offset, limit ? offset + limit : undefined)
  if (!selected.length) throw new Error('No Topperzstore product URLs were selected.')
  console.log(`Discovered ${discovery.rows.length} product URLs across ${discovery.sitemapCount} sitemap documents; selected ${selected.length}.`)
  const identity = `${TOPPERZ_IMPORT_VERSION}:${offset}:${limit || 0}:${defaultStock}:${includeMedia}:${mediaLimit}`
  const previous = dryRun ? null : await loadCheckpoint(identity)
  const completed = new Set(previous?.completed || [])
  const report = previous?.report || topperzImportReport({ sitemap: { url: TOPPERZ_SITEMAP_URL, documents: discovery.sitemapCount, productUrls: discovery.rows.length, selected: selected.length, offset, limit: limit || null } })
  report.mode = dryRun ? 'DRY_RUN' : 'WRITE'
  report.inventoryPerVariant = defaultStock
  report.mediaImported = includeMedia
  report.mediaLimit = includeAllMedia ? 'all' : mediaLimit
  report.importedListings ||= 0
  report.updatedListings ||= 0
  report.skippedPublished ||= 0
  report.importedImages ||= 0
  report.mediaBytesUploaded ||= 0
  report.collectionLinks ||= 0
  report.collectionsCreated ||= 0
  report.errors ||= []
  // Keep the checkpoint/report bounded. Counts and the audit table are the
  // source of truth; retaining every parsed row grows into gigabytes on a
  // 18k-product catalogue and can crash Node before the final batches.
  report.items = reportItemLimit > 0 && Array.isArray(report.items) ? report.items.slice(-reportItemLimit) : []
  const pending = selected.filter(row => !completed.has(row.url))
  const usedHandles = new Set()
  const usedSkus = new Set()
  const client = dryRun ? null : createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch }
  })
  const mediaBudget = { used: Number(report.mediaBytesUploaded || 0), limit: Number(process.env.TOPPERZ_MEDIA_BUDGET_BYTES || 1_500 * 1024 * 1024) }
  let collectionMap = dryRun ? new Map() : await loadCollections(client)
  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize)
    const parsedRows = await mapConcurrent(batch, pageConcurrency, async row => ({ row, parsed: await fetchParsedProduct(row) }))
    // `mapConcurrent` preserves the input order, so retain the row attached
    // to each failed result. Using the filtered array index here can associate
    // a 404/timeout with a different product URL and makes retries opaque.
    const errors = parsedRows
      .map((value, index) => ({ value, row: batch[index] }))
      .filter(({ value }) => value?.error)
      .map(({ value, row }) => ({ kind: 'page', url: row.url, error: value.error }))
    const items = []
    for (const result of parsedRows) {
      if (result?.error) continue
      try { items.push(normalizeTopperzProduct(result.parsed, { usedHandles, usedSkus, defaultStock })) }
      catch (error) { errors.push({ kind: 'normalize', url: result.row.url, error: error instanceof Error ? error.message : String(error) }) }
    }
    let savedItems = []
    if (!dryRun && items.length) {
      const existing = await fetchExisting(client, items.map(item => item.listing.id))
      const prepared = []
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += mediaConcurrency) {
        const mediaBatch = items.slice(itemIndex, itemIndex + mediaConcurrency)
        const result = await Promise.all(mediaBatch.map(item => hydrateMedia(client, item, errors, mediaBudget)))
        prepared.push(...result)
      }
      const saved = await saveListings(client, prepared, existing, errors)
      savedItems = saved.items
      await saveAudit(client, savedItems)
      const routing = await routeCatalog(client, savedItems, collectionMap)
      collectionMap = routing.collections
      report.collectionLinks += routing.links
      report.collectionsCreated += routing.created
      report.importedImages += savedItems.reduce((sum, candidate) => sum + (candidate.listing.media?.length || 0), 0)
      report.mediaBytesUploaded = mediaBudget.used
      report.importedListings += savedItems.filter(candidate => !existing.has(candidate.listing.id)).length
      report.updatedListings += savedItems.filter(candidate => existing.has(candidate.listing.id)).length
      report.skippedPublished += saved.skippedPublished
    } else {
      savedItems = items.map(item => ({ item, listing: item.listing }))
    }
    const batchReport = topperzImportReport({ items: items, errors, sitemap: {} })
    report.products += batchReport.products
    report.variants += batchReport.variants
    report.sourceImages += batchReport.sourceImages
    if (reportItemLimit > 0 && report.items.length < reportItemLimit) {
      report.items.push(...batchReport.items.slice(0, reportItemLimit - report.items.length))
    }
    for (const [key, value] of Object.entries(batchReport.statusCounts)) report.statusCounts[key] = (report.statusCounts[key] || 0) + value
    for (const [key, value] of Object.entries(batchReport.groups)) report.groups[key] = (report.groups[key] || 0) + value
    for (const [key, value] of Object.entries(batchReport.leagues)) report.leagues[key] = (report.leagues[key] || 0) + value
    // A resumed run must retry failed pages, media and saves. Clear stale
    // errors for the rows being retried, retain the errors that still occur,
    // and checkpoint only rows that completed without an item-level error.
    const batchUrls = new Set(batch.map(row => row.url))
    const batchSourceIds = new Set(items.map(item => String(item.sourceId || '')).filter(Boolean))
    report.errors = report.errors.filter(error => !batchUrls.has(error.url) && !batchSourceIds.has(String(error.sourceId || '')))
    report.errors.push(...errors)
    const failedUrls = new Set(errors.map(error => error.url).filter(Boolean))
    const failedSourceIds = new Set(errors.map(error => String(error.sourceId || '')).filter(Boolean))
    const itemBySourceUrl = new Map(items.map(item => [item.sourceUrl, item]))
    for (const row of batch) {
      const item = itemBySourceUrl.get(row.url)
      if (item && !failedUrls.has(row.url) && !failedSourceIds.has(String(item.sourceId || ''))) completed.add(row.url)
    }
    if (!dryRun) await persistCheckpoint(identity, completed, report)
    if (typeof global.gc === 'function') global.gc()
    console.log(`Products ${Math.min(start + batch.length, pending.length)}/${pending.length} · saved ${report.importedListings + report.updatedListings} · media ${Math.round(report.mediaBytesUploaded / 1_048_576)} MB · errors ${report.errors.length}`)
  }
  await mkdir(resolve(reportPath, '..'), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  if (!dryRun) await persistCheckpoint(identity, completed, report)
  console.log(JSON.stringify({ mode: report.mode, discovered: discovery.rows.length, selected: selected.length, products: report.products, variants: report.variants, importedListings: report.importedListings, updatedListings: report.updatedListings, inventoryPerVariant: defaultStock, importedImages: report.importedImages, mediaBytesUploaded: report.mediaBytesUploaded, collectionLinks: report.collectionLinks, collectionsCreated: report.collectionsCreated, skippedPublished: report.skippedPublished, errors: report.errors.length, report: reportPath, checkpoint: dryRun ? null : checkpointPath }, null, 2))
  if (!dryRun && report.errors.length) process.exitCode = 2
  return report
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/sync-topperz-catalog.mjs')
if (isMain) run().catch(error => { console.error(`Topperzstore sync failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
