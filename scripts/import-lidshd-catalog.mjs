#!/usr/bin/env node

// Import the owner's Shopify catalogue from Lids HD into the active Jersevo
// Supabase project. The importer is deliberately resumable and keeps source
// URLs out of public listing fields: source media is downloaded, privacy
// metadata is removed, and the optimized copy is stored in product-media.
//
// Default is a read-only audit. Use --write --media --activate only after the
// operator has confirmed ownership of the source catalogue.
import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { catalogRequestHeaders } from './http-user-agent.mjs'
import { buildListingInput, validateListing } from '../src/lib/catalog-model.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import { normalizeAccessoryTaxonomy } from '../src/lib/catalog-taxonomy.js'
import { findLeague, findTeam, normalizeTeamSlug, taxonomySlug, ALL_LEAGUE_TAXONOMY } from '../src/lib/league-taxonomy.js'
import { seoDescription } from '../src/lib/seo-text.js'
import { stableHash, stableId, slugify } from './fangear-import-lib.mjs'

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

const SOURCE_HOST = 'lidshd.com'
const SOURCE_BASE = String(process.env.LIDSHD_SOURCE_BASE_URL || 'https://www.lidshd.com').replace(/\/+$/, '')
const sourceAuthorized = String(process.env.LIDSHD_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const dryRun = !process.argv.includes('--write')
const includeMedia = process.argv.includes('--media')
const activate = process.argv.includes('--activate')
// In the full owner-authorized import every source SKU must be sellable with
// the requested stock quantity, even when Shopify currently reports it as
// unavailable. Keep this opt-in so ordinary audit/import runs preserve source
// availability semantics.
const forceStock = process.argv.includes('--force-stock')
// A forced-stock run is a corrective sync, so existing imported listings must
// be revisited as well; otherwise published rows would be skipped by design.
const refreshExisting = process.argv.includes('--refresh-existing') || forceStock
const start = Math.max(0, Number(argValue('--start', process.env.LIDSHD_PRODUCT_START || 0)) || 0)
const limit = Math.max(0, Number(argValue('--limit', process.env.LIDSHD_PRODUCT_LIMIT || 0)) || 0)
const sourceIds = new Set(String(argValue('--source-ids', process.env.LIDSHD_SOURCE_IDS || '')).split(',').map(value => value.trim()).filter(Boolean))
const mediaLimitInput = argValue('--media-limit', process.env.LIDSHD_MEDIA_LIMIT_PER_PRODUCT || '2')
const mediaLimitParsed = Number(mediaLimitInput)
// A limit of 0 explicitly means all source images for each product.
const mediaLimit = Number.isFinite(mediaLimitParsed) ? Math.min(10_000, Math.max(0, Math.trunc(mediaLimitParsed))) : 2
const mediaConcurrency = Math.min(48, Math.max(1, Number(argValue('--concurrency', process.env.LIDSHD_MEDIA_CONCURRENCY || 32)) || 32))
const saveConcurrency = Math.min(20, Math.max(1, Number(argValue('--save-concurrency', process.env.LIDSHD_SAVE_CONCURRENCY || 12)) || 12))
const batchSize = Math.min(500, Math.max(1, Number(argValue('--batch-size', process.env.LIDSHD_BATCH_SIZE || 100)) || 100))
const defaultStock = Math.min(1_000_000, Math.max(1, Number(argValue('--stock', process.env.LIDSHD_DEFAULT_STOCK || 1000)) || 1000))
// Full-media mode is intentionally uncapped. A finite budget remains useful
// for smaller audit runs and can still be configured through the environment.
const mediaBudgetBytes = mediaLimit === 0 ? Infinity : Math.max(0, Number(process.env.LIDSHD_MEDIA_BUDGET_BYTES || 850 * 1024 * 1024))
const requestTimeoutMs = Math.max(2_000, Number(process.env.LIDSHD_REQUEST_TIMEOUT_MS || 45_000))
const requestRetries = Math.min(5, Math.max(0, Number(process.env.LIDSHD_REQUEST_RETRIES || 3)))
const reportPath = resolve(process.env.LIDSHD_IMPORT_REPORT || 'artifacts/lidshd-import-report.json')

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function usage() {
  console.log(`Lids HD Shopify catalogue importer\n\n` +
    `  node scripts/import-lidshd-catalog.mjs [--limit N] [--write] [--media] [--activate]\n` +
    `       [--media-limit N] [--stock N] [--force-stock] [--batch-size N] [--start N] [--source-ids CSV] [--refresh-existing]\n\n` +
    `--media-limit 0 downloads every source image for each product. --force-stock\n` +
    `sets every imported SKU to ACTIVE with the requested stock quantity, even\n` +
    `when Shopify reports that variant as unavailable. --batch-size controls\n` +
    `the resumable write/media batch size (default 100).\n\n` +
    `Default is a read-only dry run. --write requires LIDSHD_SOURCE_AUTHORIZED=true,\n` +
    `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. New rows are published only when\n` +
    `--activate is supplied and at least one priced variant is sellable.`)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage()
  process.exit(0)
}

function assertWriteConfig() {
  if (!sourceAuthorized) throw new Error('Set LIDSHD_SOURCE_AUTHORIZED=true after confirming ownership of the source catalogue.')
  if (!/^https?:\/\//i.test(supabaseUrl) || !serviceRoleKey) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  if (new URL(supabaseUrl).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('Import is restricted to the active Jersevo Supabase project.')
}

function sleep(ms) { return new Promise(resolvePromise => setTimeout(resolvePromise, ms)) }

let nextRequestAt = 0
let requestQueue = Promise.resolve()
async function requestSlot() {
  let release
  const previous = requestQueue
  requestQueue = new Promise(resolvePromise => { release = resolvePromise })
  await previous
  const wait = Math.max(0, nextRequestAt - Date.now())
  if (wait) await sleep(wait)
  nextRequestAt = Date.now() + 100
  release()
}

async function fetchJson(path, query = {}) {
  const url = new URL(`${SOURCE_BASE}/${String(path).replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  let lastError
  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    await requestSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal, headers: catalogRequestHeaders({ accept: 'application/json' }) })
      const body = await response.text()
      if (response.ok) return JSON.parse(body)
      lastError = new Error(`Lids HD request ${response.status} ${url.pathname}: ${body.slice(0, 240)}`)
      if (!(response.status === 429 || response.status >= 500) || attempt === requestRetries) throw lastError
      await sleep(Math.min(20_000, 700 * (attempt + 1)))
    } catch (error) {
      lastError = error
      if (attempt === requestRetries || !/abort|fetch|network|429|5\d\d|timeout/i.test(String(error?.message || error))) throw error
      await sleep(Math.min(20_000, 700 * (attempt + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError || new Error(`Lids HD request failed: ${path}`)
}

async function fetchAllProducts() {
  const rows = []
  for (let page = 1; ; page += 1) {
    const batch = (await fetchJson('products.json', { limit: 250, page, currency: 'USD' }))?.products || []
    rows.push(...batch)
    console.log(`Fetched source page ${page} · ${rows.length} products`)
    if (!batch.length || batch.length < 250 || (!sourceIds.size && limit && rows.length >= start + limit)) break
  }
  if (sourceIds.size) return rows.filter(product => sourceIds.has(String(product.id)))
  const end = limit ? start + limit : undefined
  return rows.slice(start, end)
}

function decodeHtml(value) {
  return String(value || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
}

function stripSource(value) {
  return decodeHtml(value)
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/www\.lidshd\.com/gi, ' ')
    .replace(/\blidshd\.com\b/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function htmlBlocks(value, title) {
  const html = decodeHtml(value).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const blocks = []
  const matcher = /<(h[2-4]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = matcher.exec(html))) {
    const content = stripSource(match[2]).replace(/^[-*•]+\s*/, '')
    if (!content || blocks.at(-1)?.content === content) continue
    const element = match[1].toLowerCase()
    blocks.push({ id: stableId('block', `lidshd:${title}:${blocks.length}:${content}`, 16), type: element.startsWith('h') ? 'heading' : element === 'blockquote' ? 'quote' : 'paragraph', content: element === 'li' ? `• ${content}` : content, mediaId: '' })
  }
  if (!blocks.length) {
    const text = stripSource(value)
    text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 20).forEach((content, index) => blocks.push({ id: stableId('block', `lidshd:${title}:${index}:${content}`, 16), type: 'paragraph', content, mediaId: '' }))
  }
  return blocks.slice(0, 80)
}

function cleanTag(value) {
  const tag = slugify(value, '')
  if (!tag || /lidshd|lidshatdrop|shopify|exclude-inventory|exclude-rebuy|track-inventory|sold-out/.test(tag)) return ''
  return tag
}

const LEAGUE_HINTS = [
  ['nfl', /\bnfl\b|football/i], ['mlb', /\bmlb\b|baseball/i], ['nba', /\bnba\b|basketball/i],
  ['nhl', /\bnhl\b|hockey/i], ['ncaa', /\bncaa\b|college/i], ['milb', /\bmilb\b|minor league/i]
]
const ALL_TEAMS = ALL_LEAGUE_TAXONOMY.flatMap(league => league.teams.map(team => ({ ...team, leagueKey: league.key, leagueName: league.name })))

function inferLeagueTeam(product) {
  const text = [product.title, product.vendor, product.product_type, ...(product.tags || [])].filter(Boolean).join(' ')
  const leagueHint = LEAGUE_HINTS.find(([, pattern]) => pattern.test(text))?.[0] || ''
  const leagueCandidates = leagueHint ? ALL_LEAGUE_TAXONOMY.filter(item => item.key === leagueHint || (leagueHint === 'milb' && item.key === 'mlb')) : ALL_LEAGUE_TAXONOMY
  const haystack = ` ${taxonomySlug(text).replace(/-/g, ' ')} `
  const team = leagueCandidates.flatMap(league => league.teams.map(item => ({ ...item, leagueKey: league.key, leagueName: league.name })))
    .filter(item => haystack.includes(` ${taxonomySlug(item.name).replace(/-/g, ' ')} `))
    .sort((a, b) => b.name.length - a.name.length)[0]
  const league = team?.leagueKey || leagueHint || ''
  return { league, team: team ? normalizeTeamSlug(league, team.slug) : '', sport: league === 'nfl' ? 'football' : league === 'mlb' || league === 'milb' ? 'baseball' : league === 'nba' ? 'basketball' : league === 'nhl' ? 'hockey' : league === 'ncaa' ? 'college' : '' }
}

function inferProductGroup(product) {
  const type = String(product.product_type || '').toLowerCase()
  const text = `${product.title || ''} ${(product.tags || []).join(' ')}`.toLowerCase()
  if (/pin|patch|sticker|decal|magnet|keychain|collectible/.test(type + ' ' + text)) return 'Accessories'
  if (/hoodie|sweatshirt|shirt|short|apparel|t-shirt|tee/.test(type + ' ' + text)) return 'Fan Apparel'
  if (/knit|beanie|toque/.test(text)) return 'Knit Hats'
  if (/hat|cap|fitted|9forty|59fifty|snapback|a-frame/.test(type + ' ' + text)) return 'Caps'
  return 'Accessories'
}

function inferAccessory(product, group) {
  const text = `${product.title || ''} ${(product.tags || []).join(' ')}`.toLowerCase()
  const taxonomy = { category: /jersey|apparel|hoodie|shirt|short/.test(`${group} ${text}`) ? 'Fan Apparel' : 'Accessories', productGroup: group }
  if (group === 'Caps') { taxonomy.accessoryCategory = 'Headwear'; taxonomy.accessoryType = 'Caps' }
  else if (group === 'Knit Hats') { taxonomy.accessoryCategory = 'Headwear'; taxonomy.accessoryType = 'Knit Hats' }
  else if (group === 'Accessories') { taxonomy.accessoryCategory = /pin|patch|sticker|decal|magnet|keychain/.test(text) ? 'Matchday accessories' : 'Other accessories'; taxonomy.accessoryType = taxonomy.accessoryCategory === 'Matchday accessories' ? 'Pins & patches' : 'Other accessories' }
  return taxonomy
}

function money(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : 0
}

function uniqueValues(values) { return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))] }

function normalizeOptions(product) {
  const options = Array.isArray(product.options) ? product.options : []
  return options.map(option => ({ name: String(option.name || '').trim().replace(/^./, value => value.toUpperCase()), values: uniqueValues(option.values || []) })).filter(option => option.name && option.values.length).slice(0, 3)
}

function seoTitleFor(title, group, taxonomy, sourceId) {
  const team = taxonomy.team ? taxonomy.team.replace(/-/g, ' ') : taxonomy.league ? taxonomy.league.toUpperCase() : 'Sports'
  const base = `${team.replace(/\b\w/g, c => c.toUpperCase())} ${group} | Jersevo`
  if (base.length >= 30 && base.length <= 60) return base
  const clean = String(title || '').replace(/\s+/g, ' ').trim()
  const suffix = `-${stableHash(`${sourceId}:${clean}`, 4).toUpperCase()}`
  const prefix = `${clean}${suffix}`
  return prefix.slice(0, 60).replace(/\s+\S*$/, '').trim().slice(0, 60)
}

function mediaRole(index) { return index === 0 ? 'front' : index === 1 ? 'back' : 'detail' }

function normalizeProduct(product, usedHandles, usedSkus) {
  const sourceId = String(product.id || '').trim()
  if (!sourceId) throw new Error('Product ID is required.')
  const title = stripSource(product.title) || 'Sports fan accessory'
  const handleSlug = slugify(product.handle || title).slice(0, 88).replace(/-+$/, '')
  const baseHandle = `${handleSlug || 'listing'}-lh-${stableHash(sourceId, 6)}`
  let handle = baseHandle
  let suffix = 2
  while (usedHandles.has(handle)) handle = `${baseHandle}-${suffix++}`
  usedHandles.add(handle)
  const group = inferProductGroup(product)
  const inferred = inferLeagueTeam(product)
  const taxonomy = { ...inferAccessory(product, group), ...(inferred.league ? { league: inferred.league } : {}), ...(inferred.team ? { team: inferred.team } : {}), ...(inferred.sport ? { sport: inferred.sport } : {}) }
  const normalizedTaxonomy = normalizeAccessoryTaxonomy({ productGroup: group, taxonomy })
  const blocks = htmlBlocks(product.body_html, title)
  const sourceFacts = blocks.map(block => block.content).join(' ')
  const description = `${title} is a ${group.toLowerCase()} piece made for fans who want a clear team-led look on game day and beyond. ${sourceFacts || 'The listing includes the available fit, colourway and product specifications shown for this style.'} Choose the available option, review the product images and check the delivery estimate before ordering. This product story is prepared for the Jersevo catalogue.`.replace(/\s+/g, ' ').trim().slice(0, 2600)
  const options = normalizeOptions(product)
  const variants = (product.variants || []).map((variant, index) => {
    const values = {}
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) values[options[optionIndex].name] = String(variant[`option${optionIndex + 1}`] || variant.title || '').trim() || options[optionIndex].values[0]
    const external = String(variant.id || `${sourceId}:${index}`)
    const baseSku = String(variant.sku || '').trim() || `ET-LH-${stableHash(external, 10).toUpperCase()}`
    let sku = baseSku
    let skuSuffix = 2
    while (usedSkus.has(sku.toUpperCase())) sku = `${baseSku}-${skuSuffix++}`
    usedSkus.add(sku.toUpperCase())
    const sellable = forceStock || Boolean(variant.available)
    return { id: stableId('variant', `lidshd-variant:${external}`), sku, values, price: money(variant.price), compareAt: money(variant.compare_at_price) > money(variant.price) ? money(variant.compare_at_price) : null, cost: null, inventory: sellable ? defaultStock : 0, weightGrams: Number(variant.grams) > 0 ? Math.trunc(Number(variant.grams)) : null, barcode: '', status: sellable ? 'ACTIVE' : 'DRAFT', image: null }
  }).filter(variant => options.every(option => option.values.includes(variant.values[option.name])))
  const rawMedia = (product.images || []).map((image, index) => ({ id: stableId('media', `lidshd-media:${sourceId}:${image.id || image.src || index}`, 20), type: 'IMAGE', sourceUrl: String(image.src || image.url || ''), filename: `${slugify(title).slice(0, 48)}-${mediaRole(index)}-${index + 1}.avif`, alt: `${title} ${mediaRole(index)} view`, role: mediaRole(index), width: Number(image.width) || null, height: Number(image.height) || null, createdAt: null })).filter(item => /^https:\/\//i.test(item.sourceUrl))
  const sourceTags = uniqueValues(product.tags || []).map(cleanTag).filter(Boolean)
  const taxonomyTags = [normalizedTaxonomy.league, normalizedTaxonomy.team, normalizedTaxonomy.accessoryCategory, normalizedTaxonomy.accessoryType, group.toLowerCase().replace(/\s+/g, '-'), ...sourceTags].filter(Boolean)
  const tags = [...new Set([...taxonomyTags, 'lids-catalog', 'sports-fan-gear'])].slice(0, 50)
  const primaryPrice = variants.filter(row => row.price > 0).map(row => row.price)
  const price = primaryPrice.length ? Math.min(...primaryPrice) : 0
  const compare = variants.map(row => row.compareAt).filter(value => value != null && value > price)
  const hasAvailable = variants.some(row => row.status === 'ACTIVE' && row.price > 0)
  const seoTitle = seoTitleFor(title, group, normalizedTaxonomy, sourceId)
  const seoDesc = seoDescription(`${title} ${group.toLowerCase()} for ${normalizedTaxonomy.team ? normalizedTaxonomy.team.replace(/-/g, ' ') + ' fans' : 'sports fans'}. Shop clear product details, available options, team-led style and delivery information from Jersevo.`, '', 160)
  const listing = { id: stableId('listing', `lidshd-product:${sourceId}`), handle, title, subtitle: `${group} · ${normalizedTaxonomy.team ? normalizedTaxonomy.team.replace(/-/g, ' ') : 'team-led fan gear'}`.slice(0, 180), description, price, compareAt: compare.length ? Math.min(...compare) : null, status: hasAvailable && activate ? 'PUBLISHED' : 'DRAFT', badge: null, type: 'READY TO SHIP', image: '', color: '', sku: `ET-LH-${stableHash(`parent:${sourceId}`, 10).toUpperCase()}`, artworkLock: 100, personalization: [], media: [], contentBlocks: blocks, tags, productGroup: group, taxonomy: normalizedTaxonomy, customFields: [], seo: { title: seoTitle, description: seoDesc, primaryKeyword: `${normalizedTaxonomy.team || normalizedTaxonomy.league || 'sports'} ${group.toLowerCase()}`.slice(0, 100) }, seoStatus: hasAvailable && activate ? 'INDEXABLE' : 'BLOCKED', seoQualityScore: hasAvailable && activate ? 100 : 0, seoBlockReasons: hasAvailable && activate ? [] : ['SOURCE_IMPORT_REVIEW'], aiMetadata: { catalogImport: { source: 'owner-authorized', sourceKey: 'lidshd', sourceId }, sourceVendor: stripSource(product.vendor || '') }, inventory: variants.filter(row => row.status === 'ACTIVE').reduce((sum, row) => sum + row.inventory, 0), options, variants }
  return { sourceId, sourceSku: String(product.variants?.[0]?.sku || ''), sourceCategories: sourceTags, sourceUrl: `${SOURCE_BASE}/products/${encodeURIComponent(String(product.handle || ''))}`, listing, media: rawMedia, sourceAvailable: hasAvailable, sourceTitle: title }
}

async function mapConcurrent(items, concurrency, worker) {
  const output = new Array(items.length)
  let cursor = 0
  async function run() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try { output[index] = await worker(items[index], index) } catch (error) { output[index] = { error: error instanceof Error ? error.message : String(error) } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, run))
  return output
}

function extensionForMime(mime) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[mime] || 'avif' }

async function prepareImage(sourceUrl) {
  const url = new URL(sourceUrl)
  if (!url.searchParams.has('width')) url.searchParams.set('width', '1200')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
      const response = await fetch(url, { signal: controller.signal, headers: catalogRequestHeaders({ accept: 'image/avif,image/webp,image/jpeg,image/png' }) })
    if (!response.ok) throw new Error(`Image request ${response.status}`)
    const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase()
    const input = Buffer.from(await response.arrayBuffer())
    const cleaned = await sanitizeImagePrivacyMetadata(new Blob([input], { type: mime || 'image/jpeg' }))
    // Shopify already serves a resized WebP when `width=1200` is requested;
    // use a fast AVIF encode here so a full catalogue import remains practical
    // while still stripping source metadata and keeping storefront payloads
    // small.
    // Shopify's `width=1200` response is already a storefront-sized WebP.
    // Keep that cleaned WebP as-is; re-encoding every image to AVIF makes a
    // 5k-product import unnecessarily slow and can reduce visual fidelity.
    if (mime === 'image/webp') {
      const cleanedBytes = Buffer.from(await cleaned.arrayBuffer())
      return { blob: new Blob([cleanedBytes], { type: 'image/webp' }), mime: 'image/webp', bytes: cleanedBytes.length }
    }
    const optimized = await sharp(Buffer.from(await cleaned.arrayBuffer())).rotate().resize({ width: 1200, height: 1400, fit: 'inside', withoutEnlargement: true }).avif({ quality: 52, effort: 1 }).toBuffer()
    return { blob: new Blob([optimized], { type: 'image/avif' }), mime: 'image/avif', bytes: optimized.length }
  } finally {
    clearTimeout(timer)
  }
}

async function hydrateMedia(client, item, budget, errors) {
  if (!includeMedia || !item.media.length) return item
  const uploaded = []
  const mediaToUpload = mediaLimit === 0 ? item.media : item.media.slice(0, mediaLimit)
  const mediaFolder = `${item.listing.id}/import/lidshd`
  const { data: existingFiles } = await client.storage.from('product-media').list(mediaFolder, { limit: 1000 })
  const existingById = new Map((existingFiles || []).map(file => [String(file.name || '').replace(/\.(?:avif|webp|jpg|png)$/i, ''), file.name]))
  for (const sourceMedia of mediaToUpload) {
    try {
      const existingName = existingById.get(sourceMedia.id)
      if (existingName) {
        const existingPath = `${mediaFolder}/${existingName}`
        const { data } = client.storage.from('product-media').getPublicUrl(existingPath)
        uploaded.push({ ...sourceMedia, url: data.publicUrl, sourceUrl: undefined, filename: existingName, createdAt: new Date().toISOString() })
        continue
      }
      const prepared = await prepareImage(sourceMedia.sourceUrl)
      if (budget.used + prepared.bytes > budget.limit) throw new Error(`Media budget exceeded at ${Math.round(budget.used / 1_048_576)} MB.`)
      budget.used += prepared.bytes
      const path = `${mediaFolder}/${sourceMedia.id}.${extensionForMime(prepared.mime)}`
      const { error } = await client.storage.from('product-media').upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: '31536000', upsert: false })
      if (error && !/already exists|duplicate|conflict|409/i.test(error.message || '')) throw new Error(error.message)
      const { data } = client.storage.from('product-media').getPublicUrl(path)
      uploaded.push({ ...sourceMedia, url: data.publicUrl, sourceUrl: undefined, filename: sourceMedia.filename.replace(/\.[^.]+$/, `.${extensionForMime(prepared.mime)}`), createdAt: new Date().toISOString() })
    } catch (error) {
      errors.push({ kind: 'media', sourceId: item.sourceId, url: sourceMedia.sourceUrl, error: error instanceof Error ? error.message : String(error) })
    }
  }
  const sellableSource = item.sourceAvailable || forceStock
  return { ...item, media: uploaded, listing: { ...item.listing, media: uploaded, image: uploaded[0]?.url || '', status: uploaded[0] && sellableSource && activate ? 'PUBLISHED' : 'DRAFT', seoStatus: uploaded[0] && sellableSource && activate ? 'INDEXABLE' : 'BLOCKED', seoQualityScore: uploaded[0] && sellableSource && activate ? 100 : 0, seoBlockReasons: uploaded[0] && sellableSource && activate ? [] : ['PRIMARY_IMAGE_REQUIRED'] } }
}

async function fetchExisting(client, ids) {
  const rows = new Map()
  // Supabase's REST `.in()` filter is encoded in the request URL. Keep the
  // batches small enough for Cloudflare/proxy URL limits when importing
  // thousands of deterministic listing IDs.
  const queryBatchSize = 75
  for (let offset = 0; offset < ids.length; offset += queryBatchSize) {
    const { data, error } = await client.from('pod_products').select('id,status,updated_at,image,media').in('id', ids.slice(offset, offset + queryBatchSize))
    if (error) throw new Error(`Existing listing query failed: ${error.message}`)
    for (const row of data || []) rows.set(row.id, row)
  }
  return rows
}

function listingHasSourceReference(listing) {
  const publicShape = { ...listing, aiMetadata: undefined, ai_metadata: undefined }
  return /lidshd\.com|www\.|cdn\.shopify\.com|shopify\.com/i.test(JSON.stringify(publicShape))
}

async function saveListings(client, items, existing, errors) {
  const candidates = items.filter(item => !item.error && (!existing.has(item.listing.id) || refreshExisting || existing.get(item.listing.id).status === 'DRAFT'))
  let saved = 0
  const failures = []
  const writeOne = async item => {
    if (listingHasSourceReference(item.listing)) throw new Error('Public listing contains a source URL.')
    const previous = existing.get(item.listing.id)
    const listing = previous && refreshExisting ? { ...item.listing, media: [...(previous.media || []), ...(item.listing.media || [])].filter((row, index, rows) => rows.findIndex(candidate => candidate.id === row.id) === index), image: item.listing.image || previous.image } : item.listing
    const { error } = await client.rpc('pod_save_listing', { listing: buildListingInput(listing), expected_updated_at: previous?.updated_at || null })
    if (error) throw new Error(error.message)
    return item
  }
  for (let offset = 0; offset < candidates.length; offset += saveConcurrency) {
    const batch = candidates.slice(offset, offset + saveConcurrency)
    const results = await Promise.allSettled(batch.map(writeOne))
    results.forEach((result, index) => { if (result.status === 'fulfilled') saved += 1; else { const item = batch[index]; failures.push({ sourceId: item.sourceId, id: item.listing.id, error: result.reason?.message || 'Save failed' }); errors.push({ kind: 'listing', ...failures.at(-1) }) } })
    console.log(`Saved listings ${Math.min(offset + batch.length, candidates.length)}/${candidates.length} · successful ${saved} · errors ${errors.length}`)
  }
  return { saved, failures, ids: new Set(candidates.filter((_, index) => !failures.some(row => row.sourceId === candidates[index].sourceId)).map(item => item.listing.id)) }
}

async function writeAudit(client, items) {
  const rows = items.filter(item => !item.error).map(item => ({ source: SOURCE_HOST, source_entity_id: String(item.sourceId), entity_type: 'PRODUCT', entity_id: item.listing.id, source_sku: item.sourceSku, source_categories: item.sourceCategories }))
  for (let offset = 0; offset < rows.length; offset += 250) {
    const { error } = await client.from('pod_catalog_imports').upsert(rows.slice(offset, offset + 250), { onConflict: 'source,source_entity_id,entity_type' })
    if (error) throw new Error(`Audit write failed: ${error.message}`)
  }
}

async function activateRows(client, ids) {
  if (!activate || !ids.size) return { published: 0, variants: 0, skipped: 0, errors: [] }
  const errors = []
  let published = 0
  let variants = 0
  const allIds = [...ids]
  const queryBatchSize = 75
  for (let offset = 0; offset < allIds.length; offset += queryBatchSize) {
    const batchIds = allIds.slice(offset, offset + queryBatchSize)
    const { data: products, error: productError } = await client.from('pod_products').select('id,status,seo,media,image').in('id', batchIds)
    if (productError) throw new Error(`Activation product query failed: ${productError.message}`)
    const { data: rows, error: variantError } = await client.from('pod_product_variants').select('id,product_id,price,inventory,status').in('product_id', batchIds)
    if (variantError) throw new Error(`Activation variant query failed: ${variantError.message}`)
    const publishProducts = []
    const publishVariantIds = []
    for (const product of products || []) {
      const eligible = (rows || []).filter(row => row.product_id === product.id && row.status !== 'ARCHIVED' && Number(row.price) > 0 && Number(row.inventory) > 0)
      if (!eligible.length || !product.image) continue
      publishProducts.push(product.id)
      publishVariantIds.push(...eligible.map(row => row.id))
    }
    if (publishVariantIds.length) {
      const { error: vError } = await client.from('pod_product_variants').update({ status: 'ACTIVE' }).in('id', publishVariantIds)
      if (vError) errors.push({ kind: 'activation-variants', ids: publishVariantIds.length, error: vError.message })
    }
    if (publishProducts.length) {
      const now = new Date().toISOString()
      const { error: pError } = await client.from('pod_products').update({ status: 'PUBLISHED', seo_status: 'INDEXABLE', seo_quality_score: 100, seo_block_reasons: [], seo_reviewed_at: now, seo_published_at: now }).in('id', publishProducts)
      if (pError) errors.push({ kind: 'activation-products', ids: publishProducts.length, error: pError.message })
      else { published += publishProducts.length; variants += publishVariantIds.length }
    }
    console.log(`Activated ${Math.min(offset + batchIds.length, allIds.length)}/${allIds.length} candidate listings · published ${published}`)
  }
  return { published, variants, skipped: allIds.length - published, errors }
}

async function run() {
  if (!dryRun) assertWriteConfig()
  console.log(`${dryRun ? 'Dry run' : 'Write run'} · ${SOURCE_BASE} · media ${includeMedia ? (mediaLimit === 0 ? 'all' : `first ${mediaLimit}`) : 'off'} · activate ${activate ? 'on' : 'off'} · force stock ${forceStock ? defaultStock : 'off'} · ${sourceIds.size ? `source IDs ${sourceIds.size}` : `range ${start}-${limit ? start + limit - 1 : 'end'}`}`)
  const sourceProducts = await fetchAllProducts()
  const usedHandles = new Set()
  const usedSkus = new Set()
  const errors = []
  const normalized = []
  for (const product of sourceProducts) {
    try {
      const item = normalizeProduct(product, usedHandles, usedSkus)
      const validation = validateListing({ ...item.listing, status: 'DRAFT', seoStatus: 'BLOCKED' })
      if (validation.length) errors.push({ kind: 'validation', sourceId: item.sourceId, errors: validation })
      normalized.push(item)
    } catch (error) { errors.push({ kind: 'normalize', sourceId: String(product.id || ''), error: error instanceof Error ? error.message : String(error) }) }
  }
  const report = { generatedAt: new Date().toISOString(), mode: dryRun ? 'DRY_RUN' : 'WRITE', source: SOURCE_HOST, start, limit, sourceProducts: sourceProducts.length, normalized: normalized.length, variants: normalized.reduce((sum, item) => sum + item.listing.variants.length, 0), availableProducts: normalized.filter(item => item.sourceAvailable).length, noStockProducts: normalized.filter(item => !item.sourceAvailable).length, mediaRequested: includeMedia, mediaLimit, allMedia: includeMedia && mediaLimit === 0, forceStock, stockPerSku: forceStock ? defaultStock : null, importedListings: 0, published: 0, activatedVariants: 0, mediaBytesUploaded: 0, errors, groups: normalized.reduce((map, item) => { map[item.listing.productGroup] = (map[item.listing.productGroup] || 0) + 1; return map }, {}), leagues: normalized.reduce((map, item) => { const key = item.listing.taxonomy.league || 'unassigned'; map[key] = (map[key] || 0) + 1; return map }, {}) }
  if (!dryRun) {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const budget = { used: 0, limit: mediaBudgetBytes }
    // Process bounded batches instead of hydrating the entire catalogue before
    // the first database write. This keeps memory stable, exposes progress, and
    // makes an interrupted full import resumable: already-uploaded media and
    // existing listing rows are safely revisited on the next invocation.
    report.batches = Math.ceil(normalized.length / batchSize)
    report.batchSize = batchSize
    report.activationSkipped = 0
    for (let offset = 0; offset < normalized.length; offset += batchSize) {
      const batch = normalized.slice(offset, offset + batchSize)
      const existing = await fetchExisting(client, batch.map(item => item.listing.id))
      const prepared = includeMedia
        ? await mapConcurrent(batch, mediaConcurrency, async item => ({ ...item, ...(await hydrateMedia(client, item, budget, errors)) }))
        : batch
      const saved = await saveListings(client, prepared, existing, errors)
      report.importedListings += saved.saved
      await writeAudit(client, prepared)
      const activated = await activateRows(client, saved.ids)
      report.published += activated.published
      report.activatedVariants += activated.variants
      report.activationSkipped += activated.skipped
      report.errors.push(...activated.errors.map(error => ({ kind: 'activation', ...error })))
      report.mediaBytesUploaded = budget.used
      console.log(`Completed import batch ${Math.min(offset + batch.length, normalized.length)}/${normalized.length} · saved ${report.importedListings} · published ${report.published} · media ${Math.round(report.mediaBytesUploaded / 1_048_576)} MB`)
    }
  }
  await mkdir(resolve(reportPath, '..'), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2))
  if (report.errors.length && !dryRun) process.exitCode = 2
}

run().catch(error => { console.error(`Lids HD import failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
