#!/usr/bin/env node

import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildListingInput } from '../src/lib/catalog-model.js'
import { prepareTaassImage, taassThumbnailUrl, uploadPreparedTaassImage } from './taass-media-lib.mjs'
import { isTaassJerseyListing, isTaassJerseyUrl, routeTaassListings, withTaassCatalogCategory } from './taass-catalog-routing.mjs'
import { isTaassHeadwearListing, isTaassHeadwearUrl, prepareTaassHeadwearPublication } from './taass-headwear-lib.mjs'
import {
  TAASS_DEFAULT_INVENTORY,
  TAASS_SOURCE_HOST,
  groupTaassSitemapRows,
  mergeTaassProductPages,
  normalizeTaassProduct,
  parseTaassProductHtml,
  parseTaassSitemap,
  prepareTaassJerseyListing,
  publicTaassListingHasSourceReferences,
  sanitizeTaassPublicText,
  taassImportReport
} from './taass-import-lib.mjs'

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

const SITEMAP_URL = String(process.env.TAASS_SITEMAP_URL || 'https://www.taass.com/sitemap.xml')
const sourceAuthorized = String(process.env.TAASS_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
function validHttpUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(String(value || '')).protocol) } catch { return false }
}
const supabaseUrl = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL].find(validHttpUrl)
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const outputPath = process.env.TAASS_IMPORT_REPORT || resolve('artifacts', 'taass-import-report.json')
const requestTimeoutMs = Math.max(2_000, Number(process.env.TAASS_REQUEST_TIMEOUT_MS || 30_000))
const requestIntervalMs = Math.max(200, Number(process.env.TAASS_REQUEST_INTERVAL_MS || 750))
const requestRetries = Math.min(6, Math.max(0, Number(process.env.TAASS_REQUEST_RETRIES || 3)))

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const dryRun = !hasArg('--write')
const includeMedia = hasArg('--media') || String(process.env.TAASS_IMPORT_MEDIA || '').toLowerCase() === 'true'
const includeLiveBreaks = hasArg('--include-live-breaks')
const locale = String(argValue('--language', process.env.TAASS_LANGUAGE || 'en')).toLowerCase()
const sourceCode = String(argValue('--source-code', '')).replace(/\D/g, '').slice(0, 6)
const familyCodes = [...new Set(String(argValue('--family-codes', '')).split(',').map(value => value.trim()).filter(Boolean))]
if (familyCodes.some(code => !/^\d{6}$/.test(code))) throw new Error('--family-codes accepts comma-separated six-digit family codes.')
const directUrl = String(argValue('--url', '')).trim()
const offset = Math.max(0, Number(argValue('--offset', process.env.TAASS_PRODUCT_OFFSET || 0)) || 0)
const defaultLimit = Math.max(0, Number(process.env.TAASS_PRODUCT_LIMIT || 25) || 25)
const limit = hasArg('--all') ? 0 : Math.max(0, Number(argValue('--limit', defaultLimit)) || 0)
const crawlConcurrency = Math.min(6, Math.max(1, Number(argValue('--concurrency', process.env.TAASS_CONCURRENCY || 2)) || 2))
const mediaLimitOption = String(argValue('--media-limit', process.env.TAASS_MEDIA_LIMIT_PER_PRODUCT || 'all')).toLowerCase()
const mediaLimit = mediaLimitOption === 'all' ? 100 : Math.min(100, Math.max(0, Math.trunc(Number(mediaLimitOption) || 0)))
const jerseyOnly = hasArg('--jersey-only')
const remainingOnly = hasArg('--remaining-only')
const mediaTargetBytes = Math.max(4 * 1024, Math.trunc(Number(process.env.TAASS_MEDIA_TARGET_BYTES || (jerseyOnly ? 48 * 1024 : 16 * 1024))))
const mediaBudgetBytes = Math.max(0, Math.trunc(Number(process.env.TAASS_MEDIA_BUDGET_BYTES || 700 * 1024 * 1024)))
const mediaBackfillOnly = hasArg('--media-backfill-only')
const headwearOnly = hasArg('--headwear-only')
const publishHeadwear = hasArg('--publish-headwear')
const approveHeadwearRights = hasArg('--approve-headwear-rights')
const defaultInventory = jerseyOnly ? TAASS_DEFAULT_INVENTORY : Math.min(1_000_000_000, Math.max(0, Math.trunc(Number(process.env.TAASS_DEFAULT_INVENTORY || TAASS_DEFAULT_INVENTORY))))
const batchSize = Math.min(100, Math.max(1, Number(argValue('--batch-size', process.env.TAASS_BATCH_SIZE || 25)) || 25))
const priceMultiplier = 1

function usage() {
  console.log(`TAASS catalogue importer\n\n` +
    `  node scripts/import-taass-catalog.mjs [--dry-run] [--limit N|--all] [--offset N]\n` +
    `       [--source-code 806454] [--url PRODUCT_URL] [--language en|de]\n` +
    `       [--family-codes 805069,853723] [--language en|de]\n` +
    `       [--write] [--media] [--media-limit N|all] [--batch-size N]\n` +
    `       [--include-live-breaks] [--media-backfill-only]\n` +
    `       [--headwear-only|--jersey-only|--remaining-only]\n` +
    `       [--publish-headwear] [--approve-headwear-rights] [--resume-any] [--fresh]\n\n` +
    `Defaults to a 25-product read-only dry run. Product pages are discovered from\n` +
    `the public sitemap and grouped by their six-digit family code. --write requires\n` +
    `TAASS_SOURCE_AUTHORIZED=true, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n` +
    `New listings stay DRAFT; every imported variant is ACTIVE with stock 1000.\n` +
    `EUR price numbers are stored as USD at 1:1. Write runs checkpoint each batch.`)
}

if (hasArg('--help') || hasArg('-h')) {
  usage()
  process.exit(0)
}

function assertSourcePermission() {
  if (!sourceAuthorized) {
    throw new Error('Set TAASS_SOURCE_AUTHORIZED=true after confirming permission to import and reuse this catalogue.')
  }
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, Math.max(0, milliseconds)))
}

function createRequestGate(intervalMs) {
  let nextStart = 0
  let queue = Promise.resolve()
  return async function waitForSlot() {
    let release
    const previous = queue
    queue = new Promise(resolvePromise => { release = resolvePromise })
    await previous
    const now = Date.now()
    const wait = Math.max(0, nextStart - now)
    if (wait) await sleep(wait)
    nextStart = Date.now() + intervalMs
    release()
  }
}

const requestGate = createRequestGate(requestIntervalMs)

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(60_000, retryAfter * 1000)
  return Math.min(30_000, 750 * (2 ** attempt) + Math.round(Math.random() * 350))
}

async function request(url, { accept = 'text/html,application/xhtml+xml', binary = false } = {}) {
  let lastError
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    await requestGate()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          accept,
          'accept-language': locale === 'de' ? 'de-DE,de;q=0.9,en;q=0.5' : 'en-GB,en;q=0.9,de;q=0.5',
          'user-agent': 'Jersevo-authorized-catalog-sync/1.0'
        }
      })
      if (response.ok) return binary ? new Uint8Array(await response.arrayBuffer()) : await response.text()
      const retryable = response.status === 429 || response.status >= 500
      const body = binary ? '' : (await response.text()).slice(0, 220)
      lastError = new Error(`TAASS request ${response.status} for ${new URL(url).pathname}: ${body}`)
      if (!retryable || attempt === requestRetries) throw lastError
      await sleep(retryDelay(response, attempt))
    } catch (error) {
      lastError = error
      if (attempt === requestRetries || (!/abort|fetch|network|429|5\d\d/i.test(String(error?.message || error)))) throw error
      await sleep(retryDelay(null, attempt))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError || new Error(`TAASS request failed: ${url}`)
}

function sitemapLocations(xml) {
  return [...String(xml || '').matchAll(/<sitemap>[^]*?<loc>([^]*?)<\/loc>[^]*?<\/sitemap>/gi)]
    .map(match => match[1].replace(/&amp;/gi, '&').trim())
    .filter(Boolean)
}

function decodeSitemap(bytes) {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  return (isGzip ? gunzipSync(bytes) : Buffer.from(bytes)).toString('utf8')
}

export async function discoverTaassProducts() {
  const root = await request(SITEMAP_URL, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' })
  const childMaps = sitemapLocations(root)
  const documents = childMaps.length
    ? await mapConcurrent(childMaps, Math.min(2, crawlConcurrency), async url => decodeSitemap(await request(url, { accept: 'application/gzip,application/xml,text/xml;q=0.9', binary: true })))
    : [root]
  const failure = documents.find(document => document?.error)
  if (failure) throw new Error(`TAASS sitemap discovery incomplete: ${failure.error}`)
  const rows = documents.flatMap(parseTaassSitemap)
  return { rows, groups: groupTaassSitemapRows(rows), sitemapCount: childMaps.length || 1 }
}

async function mapConcurrent(items, concurrency, worker) {
  const output = new Array(items.length)
  let cursor = 0
  async function runWorker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try {
        output[index] = await worker(items[index], index)
      } catch (error) {
        output[index] = { error: error instanceof Error ? error.message : String(error) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, runWorker))
  return output
}

async function fetchLocalizedPage(sourceUrl) {
  const sourceHtml = await request(sourceUrl)
  const sourcePage = parseTaassProductHtml(sourceHtml, sourceUrl)
  if (locale !== 'en' || !sourcePage.alternateEnUrl || sourcePage.alternateEnUrl === sourceUrl) return sourcePage
  const englishHtml = await request(sourcePage.alternateEnUrl)
  return parseTaassProductHtml(englishHtml, sourcePage.alternateEnUrl)
}

async function fetchProductGroup(group, errors) {
  const parsed = await mapConcurrent(group.urls, Math.min(2, crawlConcurrency), fetchLocalizedPage)
  const failed = parsed.map((result, index) => result?.error ? { kind: 'product-page', familyCode: group.familyCode, url: group.urls[index], error: result.error } : null).filter(Boolean)
  if (failed.length) {
    errors.push(...failed)
    throw new Error(`Incomplete family ${group.familyCode}: ${failed.length}/${group.urls.length} variant pages failed.`)
  }
  const pages = parsed.filter(result => result && !result.error)
  if (!pages.length) throw new Error(`No product page could be parsed for family ${group.familyCode}.`)
  return mergeTaassProductPages(pages, group.familyCode)
}

async function fetchMediaGroup(group, errors, expectedImages) {
  const firstPage = await fetchLocalizedPage(group.urls[0])
  if (Number.isFinite(expectedImages) && firstPage.images.length >= expectedImages) {
    return mergeTaassProductPages([firstPage], group.familyCode)
  }
  return fetchProductGroup(group, errors)
}

async function hydrateMedia(client, item, errors, existingMedia = [], mediaBudget = null) {
  if (!includeMedia || !mediaLimit || !item.media?.length) return item
  const uploaded = []
  const existingIds = new Set(existingMedia.map(media => media?.id))
  const missing = item.media.slice(0, mediaLimit).filter(media => !existingIds.has(media.id))
  const uploadOne = async media => {
    for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
      await requestGate()
      let reservedBytes = 0
      try {
        const prepared = await prepareTaassImage(media.sourceUrl, {
          timeoutMs: requestTimeoutMs,
          targetBytes: mediaTargetBytes,
          preferThumbnail: mediaBackfillOnly
        })
        if (mediaBudget) {
          if (mediaBudget.used + prepared.bytes > mediaBudget.limit) {
            const budgetError = new Error(`TAASS image budget reached: ${Math.round(mediaBudget.used / 1_048_576)} MB of ${Math.round(mediaBudget.limit / 1_048_576)} MB uploaded. Resume with a larger approved storage budget or another storage provider.`)
            budgetError.code = 'TAASS_MEDIA_BUDGET_EXCEEDED'
            throw budgetError
          }
          mediaBudget.used += prepared.bytes
          reservedBytes = prepared.bytes
        }
        const result = await uploadPreparedTaassImage(client, prepared, `${item.listing.id}/import/${media.id}`)
        return {
          id: media.id,
          type: 'IMAGE',
          url: result.url,
          filename: media.filename.replace(/\.webp$/i, result.mime === 'image/avif' ? '.avif' : `.${result.mime.split('/')[1]}`),
          alt: media.alt,
          createdAt: new Date().toISOString()
        }
      } catch (error) {
        if (mediaBudget && reservedBytes) mediaBudget.used -= reservedBytes
        if (error?.code === 'TAASS_MEDIA_BUDGET_EXCEEDED') throw error
        if (attempt === requestRetries || !/abort|fetch|network|429|5\d\d|timeout/i.test(String(error?.message || error))) throw error
        await sleep(retryDelay(null, attempt))
      }
    }
    return null
  }
  const concurrency = Math.min(4, crawlConcurrency)
  for (let offset = 0; offset < missing.length; offset += concurrency) {
    const chunk = missing.slice(offset, offset + concurrency)
    const results = await Promise.allSettled(chunk.map(uploadOne))
    for (let index = 0; index < results.length; index += 1) {
      const outcome = results[index]
      if (outcome.status === 'fulfilled') {
        if (outcome.value) uploaded.push(outcome.value)
        continue
      }
      const error = outcome.reason
      if (error?.code === 'TAASS_MEDIA_BUDGET_EXCEEDED') throw error
      errors.push({ kind: 'media', familyCode: item.sourceSku, sourceId: item.sourceId, url: chunk[index].sourceUrl, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return {
    ...item,
    listing: { ...item.listing, media: uploaded, image: uploaded[0]?.url || '' }
  }
}

async function existingListings(client, items) {
  const products = new Map()
  const ids = items.map(item => item.listing.id)
  for (let offsetIndex = 0; offsetIndex < ids.length; offsetIndex += 100) {
    const batch = ids.slice(offsetIndex, offsetIndex + 100)
    const { data: productRows, error: productError } = await client.from('pod_products')
      .select('id,updated_at,status,title,subtitle,description,image,media,content_blocks,tags,type,product_group,seo,seo_status,seo_quality_score,seo_block_reasons,seo_reviewed_at,seo_published_at,artwork_lock,custom_fields,personalization,ai_metadata,taxonomy')
      .in('id', batch)
    if (productError) throw new Error(`Cannot read existing TAASS listings: ${productError.message}`)
    for (const row of productRows || []) products.set(row.id, row)
  }
  return products
}

export function mergeExistingState(item, existing) {
  if (!existing) return item
  const generated = item.listing
  const published = existing.status === 'PUBLISHED'
  const existingMedia = Array.isArray(existing.media) ? existing.media : []
  const mergedMedia = [...existingMedia]
  const knownMedia = new Set(existingMedia.map(media => media?.id))
  for (const media of generated.media || []) {
    if (!knownMedia.has(media?.id)) mergedMedia.push(media)
  }
  const customFields = Array.isArray(existing.custom_fields) ? existing.custom_fields : generated.customFields
  return {
    ...item,
    listing: {
      ...generated,
      status: existing.status || generated.status,
      title: published ? existing.title || generated.title : generated.title,
      subtitle: published ? existing.subtitle || generated.subtitle : generated.subtitle,
      description: published ? existing.description || generated.description : generated.description,
      image: existing.image || generated.image || '',
      media: mergedMedia,
      contentBlocks: published && Array.isArray(existing.content_blocks) && existing.content_blocks.length ? existing.content_blocks : generated.contentBlocks,
      tags: published && Array.isArray(existing.tags) && existing.tags.length ? existing.tags : generated.tags,
      type: published ? existing.type || generated.type : generated.type,
      productGroup: published ? existing.product_group || generated.productGroup : generated.productGroup,
      seo: published ? existing.seo || generated.seo : generated.seo,
      seoStatus: published ? existing.seo_status || generated.seoStatus : generated.seoStatus,
      seoQualityScore: published ? existing.seo_quality_score ?? generated.seoQualityScore : generated.seoQualityScore,
      seoBlockReasons: published ? existing.seo_block_reasons || generated.seoBlockReasons : generated.seoBlockReasons,
      seoReviewedAt: published ? existing.seo_reviewed_at || generated.seoReviewedAt : generated.seoReviewedAt,
      seoPublishedAt: published ? existing.seo_published_at || generated.seoPublishedAt : generated.seoPublishedAt,
      artworkLock: Number.isFinite(Number(existing.artwork_lock)) ? Number(existing.artwork_lock) : generated.artworkLock,
      customFields,
      personalization: Array.isArray(existing.personalization) ? existing.personalization : customFields.map(field => field.label),
      taxonomy: { ...(generated.taxonomy || {}), ...(existing.taxonomy || {}), category: existing.taxonomy?.category || generated.taxonomy?.category || '' },
      aiMetadata: { ...(existing.ai_metadata || {}), ...(generated.aiMetadata || {}) }
    }
  }
}

async function saveListings(client, items, existing, errors, transform = item => item) {
  let imported = 0
  const saved = []
  for (let index = 0; index < items.length; index += 1) {
    const item = transform(mergeExistingState(items[index], existing.get(items[index].listing.id)))
    if (publicTaassListingHasSourceReferences(item.listing)) {
      errors.push({ kind: 'privacy', familyCode: item.sourceSku, sourceId: item.sourceId, error: 'Public listing contains a source-hosted URL.' })
      continue
    }
    const previous = existing.get(item.listing.id)
    const { error } = await client.rpc('pod_save_listing', {
      listing: buildListingInput(item.listing),
      expected_updated_at: previous?.updated_at || null
    })
    if (error) errors.push({ kind: 'listing', familyCode: item.sourceSku, sourceId: item.sourceId, id: item.listing.id, error: error.message })
    else {
      imported += 1
      saved.push(item)
    }
    if ((index + 1) % 25 === 0 || index + 1 === items.length) {
      console.log(`Saved listings ${index + 1}/${items.length} · successful ${imported} · errors ${errors.length}`)
    }
  }
  return { count: imported, items: saved }
}

async function saveAudit(client, items) {
  const rows = items.map(item => ({
    source: TAASS_SOURCE_HOST,
    source_entity_id: String(item.sourceId),
    entity_type: 'PRODUCT',
    entity_id: item.listing.id,
    source_sku: String(item.sourceSku || ''),
    source_categories: (item.sourceCategories || []).map(value => sanitizeTaassPublicText(value)).filter(Boolean)
  }))
  for (let index = 0; index < rows.length; index += 250) {
    const { error } = await client.from('pod_catalog_imports').upsert(rows.slice(index, index + 250), { onConflict: 'source,source_entity_id,entity_type' })
    if (error) throw new Error(`TAASS import audit failed: ${error.message}`)
  }
}

function directGroup(url) {
  const familyCode = String(url).match(/\/(\d{6})(?:-[a-z0-9]+)?\/?(?:[?#].*)?$/i)?.[1] || 'direct'
  return { familyCode, urls: [url], lastmod: '' }
}

export function filterTaassGroups(groups, { headwearOnly = false, jerseyOnly = false, remainingOnly = false } = {}) {
  if (headwearOnly) return groups.filter(group => group.urls.some(isTaassHeadwearUrl))
  if (jerseyOnly) return groups.filter(group => group.urls.some(isTaassJerseyUrl))
  if (remainingOnly) return groups.filter(group => !group.urls.some(isTaassHeadwearUrl) && !group.urls.some(isTaassJerseyUrl))
  return groups
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  await rename(temporaryPath, path)
}

function checkpointIdentity() {
  return createHash('sha256').update(JSON.stringify({
    sitemap: SITEMAP_URL,
    sourceCode,
    familyCodes,
    directUrl,
    offset,
    limit,
    locale,
    includeMedia,
    mediaLimit,
    mediaTargetBytes,
    mediaBudgetBytes,
    mediaBackfillOnly,
    headwearOnly,
    jerseyOnly,
    remainingOnly,
    publishHeadwear,
    approveHeadwearRights,
    includeLiveBreaks,
    defaultInventory,
    variantStatus: jerseyOnly ? 'ACTIVE' : 'ACTIVE',
    priceMultiplier,
    jerseyPricingMode: jerseyOnly ? 'EUR_TO_USD_1_TO_1_STOCK_1000' : ''
  })).digest('hex').slice(0, 16)
}

export function compatibleTaassCheckpoint(checkpoint, groups) {
  const report = checkpoint?.report || {}
  const scope = jerseyOnly ? 'JERSEYS' : headwearOnly ? 'HEADWEAR' : remainingOnly ? 'REMAINING_PRODUCTS' : 'ALL_PRODUCTS'
  const selected = new Set(groups.map(group => group.familyCode))
  const completed = Array.isArray(checkpoint?.completedFamilies) ? checkpoint.completedFamilies : []
  return report.mode === 'WRITE'
    && report.scope === scope
    && report.sitemap?.url === SITEMAP_URL
    && Number(report.sitemap?.offset || 0) === offset
    && Number(report.sitemap?.limit || 0) === limit
    && report.locale === locale
    && report.mediaImported === includeMedia
    && Number(report.priceMultiplier) === priceMultiplier
    && Number(report.defaultInventory) === defaultInventory
    && completed.every(code => selected.has(code))
}

async function loadCheckpoint(path, identity, groups) {
  if (hasArg('--fresh')) return null
  try {
    const checkpoint = JSON.parse(await readFile(path, 'utf8'))
    if (checkpoint.identity !== identity) {
      if (!hasArg('--resume-any')) throw new Error('TAASS checkpoint settings do not match this run; use --fresh to restart.')
      if (!compatibleTaassCheckpoint(checkpoint, groups)) throw new Error('TAASS checkpoint scope or completed family IDs do not match this run; refusing --resume-any.')
      console.log(`Resuming compatible TAASS checkpoint with migrated settings (${checkpoint.identity} → ${identity}).`)
    }
    return checkpoint.complete ? null : checkpoint
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function persistProgress(path, identity, report, completedFamilies, complete = false) {
  report.generatedAt = new Date().toISOString()
  report.processedFamilies = completedFamilies.size
  report.remainingFamilies = Math.max(0, report.sitemap.selectedFamilies - completedFamilies.size)
  report.complete = complete
  await writeJsonAtomically(path, {
    identity,
    complete,
    completedFamilies: [...completedFamilies],
    report
  })
  await writeJsonAtomically(outputPath, report)
}

export async function run() {
  assertSourcePermission()
  if (mediaBackfillOnly && (dryRun || !includeMedia)) throw new Error('--media-backfill-only requires --write and --media.')
  if ([headwearOnly, jerseyOnly, remainingOnly].filter(Boolean).length > 1) throw new Error('Choose only one of --headwear-only, --jersey-only or --remaining-only.')
  if (jerseyOnly && (publishHeadwear || approveHeadwearRights)) throw new Error('Jersey imports cannot use headwear publication flags.')
  if (publishHeadwear && !headwearOnly) throw new Error('--publish-headwear requires --headwear-only.')
  if (approveHeadwearRights && !publishHeadwear) throw new Error('--approve-headwear-rights requires --publish-headwear.')
  if (!dryRun && !supabaseUrl) throw new Error('Write mode requires a valid SUPABASE_URL or VITE_SUPABASE_URL.')
  if (!dryRun && validHttpUrl(process.env.VITE_SUPABASE_URL) && new URL(supabaseUrl).host !== new URL(process.env.VITE_SUPABASE_URL).host) {
    throw new Error('Server and browser Supabase URLs point to different projects; refusing to import.')
  }
  if (!dryRun && (serviceRoleKey.length < 24 || /^(?:placeholder|changeme|your[-_]?key)$/i.test(serviceRoleKey))) {
    throw new Error('Write mode requires a real SUPABASE_SERVICE_ROLE_KEY. Configure it in the server environment; do not share it in chat.')
  }
  console.log(`${dryRun ? 'Dry run' : 'Write run'} · TAASS ${jerseyOnly ? 'jerseys' : 'products'} ${directUrl ? 'direct URL' : sourceCode ? sourceCode : limit || 'all'} · locale ${locale} · ${jerseyOnly ? 'DRAFT / stock 1000 per variant / EUR→USD 1:1' : `inventory ${defaultInventory}/variant · variants ACTIVE · EUR→USD 1:1`} · media ${includeMedia ? `on (${mediaLimit}; target ${Math.round(mediaTargetBytes / 1024)} KB; budget ${Math.round(mediaBudgetBytes / 1_048_576)} MB)` : 'off'}`)
  let discovery = { rows: [], groups: [], sitemapCount: 0 }
  let groups
  if (directUrl) {
    const parsed = new URL(directUrl)
    if (!/^(?:www\.)?taass\.com$/i.test(parsed.hostname)) throw new Error('The direct product URL must be hosted on taass.com.')
    groups = [directGroup(parsed.toString())]
  } else {
    discovery = await discoverTaassProducts()
    groups = discovery.groups
    if (sourceCode) groups = groups.filter(group => group.familyCode === sourceCode)
    if (familyCodes.length) groups = groups.filter(group => familyCodes.includes(group.familyCode))
    groups = filterTaassGroups(groups, { jerseyOnly, headwearOnly, remainingOnly })
    groups = groups.slice(offset, limit ? offset + limit : undefined)
  }
  if (!groups.length) throw new Error(sourceCode ? `TAASS family ${sourceCode} was not found in the sitemap.` : 'No TAASS product groups were found.')
  console.log(`Discovered ${discovery.rows.length || groups.reduce((sum, group) => sum + group.urls.length, 0)} variant URLs in ${discovery.groups.length || groups.length} product families; selected ${groups.length}.`)
  const identity = checkpointIdentity()
  const checkpointPath = process.env.TAASS_IMPORT_CHECKPOINT || resolve('artifacts', `taass-import-checkpoint-${identity}.json`)
  const previous = dryRun ? null : await loadCheckpoint(checkpointPath, identity, groups)
  const completedFamilies = new Set(previous?.completedFamilies || [])
  const report = previous?.report || taassImportReport({ sitemap: {} })
  report.sitemap = {
    url: SITEMAP_URL,
    documents: discovery.sitemapCount,
    variantUrls: discovery.rows.length,
    productFamilies: discovery.groups.length,
    selectedFamilies: groups.length,
    offset,
    limit: limit || null
  }
  report.mode = dryRun ? 'DRY_RUN' : 'WRITE'
  report.scope = jerseyOnly ? 'JERSEYS' : headwearOnly ? 'HEADWEAR' : remainingOnly ? 'REMAINING_PRODUCTS' : 'ALL_PRODUCTS'
  report.locale = locale
  report.priceMultiplier = 1
  report.pricingMode = jerseyOnly ? 'EUR_TO_USD_1_TO_1' : 'SOURCE_NUMERIC_1_TO_1'
  report.inventoryPolicy = jerseyOnly ? '1000_PER_VARIANT' : `${defaultInventory}_PER_VARIANT`
  report.mediaImported = includeMedia && !dryRun
  report.importedListings ||= 0
  report.sourceImages ||= 0
  report.importedImages ||= 0
  report.mediaBytesUploaded ||= 0
  report.skippedLiveBreaks ||= 0
  report.skippedNonHeadwear ||= 0
  report.skippedNonJersey ||= 0
  report.skippedOtherScope ||= 0
  report.skippedExisting ||= 0
  report.updatedExisting ||= 0
  if (jerseyOnly) report.defaultInventory = defaultInventory
  report.publishedHeadwear ||= 0
  report.headwearNeedsReview ||= []
  report.collectionLinks ||= 0
  report.collectionsCreated ||= 0
  const usedHandles = new Set()
  const usedSkus = new Set()
  const client = dryRun ? null : createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const mediaBudget = { limit: mediaBudgetBytes, used: report.mediaBytesUploaded }
  let collectionMap = null
  let sourceMediaCounts = new Map()
  let pending = groups.filter(group => !completedFamilies.has(group.familyCode))
  if (mediaBackfillOnly) {
    if (!process.env.TAASS_MEDIA_BACKFILL_SKUS_FILE) throw new Error('--media-backfill-only requires TAASS_MEDIA_BACKFILL_SKUS_FILE pointing to the completed main-import checkpoint.')
    const sourceCheckpoint = JSON.parse(await readFile(process.env.TAASS_MEDIA_BACKFILL_SKUS_FILE, 'utf8'))
    const available = new Set(sourceCheckpoint.completedFamilies || [])
    sourceMediaCounts = new Map((sourceCheckpoint.report?.items || []).map(item => [String(item.sourceSku), Number(item.sourceMedia)]))
    if (jerseyOnly) {
      for (const group of groups) {
        if (available.has(group.familyCode) && !sourceMediaCounts.has(group.familyCode)) completedFamilies.add(group.familyCode)
      }
    }
    pending = pending.filter(group => available.has(group.familyCode))
    pending = pending.filter(group => !completedFamilies.has(group.familyCode))
    report.sitemap.selectedFamilies = pending.length + completedFamilies.size
    if (!pending.length && !completedFamilies.size) throw new Error('No completed source family is available for media backfill. Check TAASS_MEDIA_BACKFILL_SKUS_FILE.')
  } else if (!dryRun && includeMedia && process.env.TAASS_SKIP_COMPLETED_SKUS_FILE) {
    const sourceCheckpoint = JSON.parse(await readFile(process.env.TAASS_SKIP_COMPLETED_SKUS_FILE, 'utf8'))
    const alreadyImported = new Set(sourceCheckpoint.completedFamilies || [])
    for (const familyCode of alreadyImported) completedFamilies.add(familyCode)
    pending = groups.filter(group => !completedFamilies.has(group.familyCode))
    report.sitemap.selectedFamilies = groups.length
    if (!previous) console.log(`Skipped ${alreadyImported.size} listings already imported by a separate checkpoint; media backfill will hydrate them.`)
  }
  if (previous) console.log(`Resuming checkpoint · ${completedFamilies.size}/${groups.length} families complete · ${pending.length} remaining`)
  for (let batchStart = 0; batchStart < pending.length; batchStart += batchSize) {
    const batch = pending.slice(batchStart, batchStart + batchSize)
    const errors = []
    const skipped = []
    const rawGroups = await mapConcurrent(batch, crawlConcurrency, async group => ({
      product: await (mediaBackfillOnly && sourceMediaCounts.has(group.familyCode)
        ? fetchMediaGroup(group, errors, sourceMediaCounts.get(group.familyCode))
        : fetchProductGroup(group, errors))
    }))
    const items = []
    rawGroups.forEach((result, index) => {
      const familyCode = batch[index].familyCode
      if (result?.error) {
        errors.push({ kind: 'product-group', familyCode, error: result.error })
        return
      }
      if (!includeLiveBreaks && /(?:\(|^)\s*live\s+break\b/i.test(result.product.name)) {
        skipped.push(familyCode)
        report.skippedLiveBreaks += 1
        return
      }
      try {
        const item = normalizeTaassProduct(result.product, { usedHandles, usedSkus, defaultInventory })
        if (headwearOnly && !isTaassHeadwearListing(item.listing)) {
          skipped.push(familyCode)
          report.skippedNonHeadwear += 1
          return
        }
        const routed = { ...item, listing: withTaassCatalogCategory(item.listing) }
        if (remainingOnly && (isTaassHeadwearListing(routed.listing) || isTaassJerseyListing(routed.listing))) {
          skipped.push(familyCode)
          report.skippedOtherScope += 1
          return
        }
        if (jerseyOnly && !isTaassJerseyListing(routed.listing)) {
          skipped.push(familyCode)
          report.skippedNonJersey += 1
          return
        }
        items.push(jerseyOnly ? prepareTaassJerseyListing(routed) : routed)
      } catch (error) {
        errors.push({ kind: 'normalize', familyCode, error: error instanceof Error ? error.message : String(error) })
      }
    })
    let committed = items
    if (!dryRun && items.length) {
      const existing = await existingListings(client, items)
      if (mediaBackfillOnly) {
        for (const familyCode of skipped) completedFamilies.add(familyCode)
        const backfillOne = async item => {
          const previous = existing.get(item.listing.id)
          if (!previous) {
            errors.push({ kind: 'media-backfill', familyCode: item.sourceSku, error: 'Listing does not exist yet; let the main import save it first.' })
            return null
          }
          const existingMedia = Array.isArray(previous.media) ? previous.media : []
          const existingIds = new Set(existingMedia.map(media => media?.id))
          if (!item.media.slice(0, mediaLimit).some(media => !existingIds.has(media.id))) {
            return { familyCode: item.sourceSku, newImages: 0 }
          }
          const hydrated = await hydrateMedia(client, item, errors, existingMedia, mediaBudget)
          const failed = errors.some(error => error.kind === 'media' && error.familyCode === item.sourceSku)
          if (failed) return null
          const mergedMedia = [...existingMedia, ...(hydrated.listing.media || []).filter(media => !existingIds.has(media.id))]
          let { data, error } = await client.from('pod_products')
            .update({ media: mergedMedia, image: previous.image || mergedMedia[0]?.url || '' })
            .eq('id', item.listing.id)
            .eq('updated_at', previous.updated_at)
            .select('id')
          if (!error && (data || []).length !== 1) {
            // A metadata save may have advanced updated_at after the read. Re-read
            // only the current media field and merge by stable media id before retrying.
            const current = await client.from('pod_products').select('media,image').eq('id', item.listing.id).maybeSingle()
            if (current.error) error = current.error
            else {
              const currentMedia = Array.isArray(current.data?.media) ? current.data.media : []
              const currentIds = new Set(currentMedia.map(media => media?.id))
              const retriedMedia = [...currentMedia, ...mergedMedia.filter(media => !currentIds.has(media.id))]
              const retried = await client.from('pod_products')
                .update({ media: retriedMedia, image: current.data?.image || retriedMedia[0]?.url || '' })
                .eq('id', item.listing.id)
                .select('id')
              data = retried.data
              error = retried.error
            }
          }
          if (error || (data || []).length !== 1) {
            errors.push({ kind: 'media-backfill', familyCode: item.sourceSku, error: error?.message || 'Listing changed during media backfill.' })
            return null
          }
          return { familyCode: item.sourceSku, newImages: mergedMedia.length - existingMedia.length }
        }
        const backfillConcurrency = Math.min(6, crawlConcurrency)
        for (let offset = 0; offset < items.length; offset += backfillConcurrency) {
          const chunk = items.slice(offset, offset + backfillConcurrency)
          const outcomes = await Promise.allSettled(chunk.map(backfillOne))
          for (let index = 0; index < outcomes.length; index += 1) {
            const outcome = outcomes[index]
            if (outcome.status === 'fulfilled') {
              if (outcome.value) {
                completedFamilies.add(outcome.value.familyCode)
                report.importedImages += outcome.value.newImages
              }
              continue
            }
            if (outcome.reason?.code === 'TAASS_MEDIA_BUDGET_EXCEEDED') throw outcome.reason
            errors.push({ kind: 'media-backfill', familyCode: chunk[index].sourceSku, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) })
          }
        }
        report.mediaBytesUploaded = mediaBudget.used
        report.errors = report.errors.filter(error => !error.familyCode || !completedFamilies.has(error.familyCode))
        report.errors.push(...errors)
        await persistProgress(checkpointPath, identity, report, completedFamilies)
        console.log(`Media backfill ${Math.min(batchStart + batch.length, pending.length)}/${pending.length} this run · completed ${completedFamilies.size}/${groups.length} · uploaded ${Math.round(mediaBudget.used / 1_048_576)} MB · errors ${report.errors.length}`)
        continue
      }
      const writeItems = items
      const prepared = []
      for (const item of writeItems) {
        const existingMedia = Array.isArray(existing.get(item.listing.id)?.media) ? existing.get(item.listing.id).media : []
        const existingIds = new Set(existingMedia.map(media => media?.id))
        const needsMedia = item.media.slice(0, mediaLimit).some(media => !existingIds.has(media.id))
        prepared.push(includeMedia && needsMedia ? await hydrateMedia(client, item, errors, existingMedia, mediaBudget) : item)
      }
      const review = []
      const saved = await saveListings(client, prepared, existing, errors, item => {
        if (!publishHeadwear) return item
        const preparedHeadwear = prepareTaassHeadwearPublication(item, new Date().toISOString(), { approveRights: approveHeadwearRights })
        if (!preparedHeadwear.publishable) review.push({ familyCode: item.sourceSku, id: item.listing.id, title: item.listing.title, blockers: preparedHeadwear.blockers })
        return preparedHeadwear.item
      })
      await saveAudit(client, saved.items)
      const routing = await routeTaassListings(client, saved.items, collectionMap)
      collectionMap = routing.collections
      report.collectionLinks += routing.links
      report.collectionsCreated += routing.created
      const failedMedia = new Set(errors.filter(error => error.kind === 'media').map(error => error.familyCode))
      committed = saved.items.filter(item => !failedMedia.has(item.sourceSku))
      report.importedListings += committed.length
      if (jerseyOnly) report.updatedExisting += committed.filter(item => existing.has(item.listing.id)).length
      if (publishHeadwear) {
        report.publishedHeadwear += committed.filter(item => item.listing.status === 'PUBLISHED' && item.listing.seoStatus === 'INDEXABLE').length
        report.headwearNeedsReview = report.headwearNeedsReview.filter(row => !committed.some(item => item.sourceSku === row.familyCode))
        report.headwearNeedsReview.push(...review.filter(row => committed.some(item => item.sourceSku === row.familyCode)))
      }
    }
    const batchReport = taassImportReport({ items: committed })
    report.products += batchReport.products
    report.variants += batchReport.variants
    report.withSourceMedia += batchReport.withSourceMedia
    report.sourceImages += batchReport.sourceImages
    report.importedImages += batchReport.importedImages
    report.mediaBytesUploaded = mediaBudget.used
    report.items.push(...batchReport.items)
    for (const [status, count] of Object.entries(batchReport.statusCounts)) report.statusCounts[status] = (report.statusCounts[status] || 0) + count
    for (const familyCode of [...skipped, ...committed.map(item => item.sourceSku)]) completedFamilies.add(familyCode)
    report.errors = report.errors.filter(error => !error.familyCode || !completedFamilies.has(error.familyCode))
    report.errors.push(...errors)
    if (!dryRun) await persistProgress(checkpointPath, identity, report, completedFamilies)
    console.log(`Families ${Math.min(batchStart + batch.length, pending.length)}/${pending.length} this run · saved ${report.importedListings} · completed ${completedFamilies.size}/${groups.length} · errors ${report.errors.length}`)
  }
  if (dryRun) await writeJsonAtomically(outputPath, report)
  else await persistProgress(checkpointPath, identity, report, completedFamilies, completedFamilies.size === groups.length && report.errors.length === 0)
  console.log(JSON.stringify({
    mode: report.mode,
    products: report.products,
    variants: report.variants,
    importedImages: report.importedImages,
    publishedHeadwear: report.publishedHeadwear,
    headwearNeedsReview: report.headwearNeedsReview.length,
    inventoryPerVariant: report.defaultInventory,
    importedListings: report.importedListings,
    completedFamilies: completedFamilies.size,
    selectedFamilies: groups.length,
    errors: report.errors.length,
    report: outputPath
  }, null, 2))
  if (!dryRun && (report.errors.length || completedFamilies.size !== groups.length)) process.exitCode = 2
  return report
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/import-taass-catalog.mjs')
if (isMain) {
  run().catch(error => {
    console.error(`TAASS importer failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
