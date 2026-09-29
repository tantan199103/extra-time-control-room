#!/usr/bin/env node

/*
 * Create the commerce layer for the mirrored teamwear designer.
 *
 * The designer has thousands of templates, but commerce does not need a
 * separate listing for every artwork. This importer creates one stable listing
 * per mirrored product family, keeps the templates in the local manifest, and
 * stores the listing -> designer contract in private ai_metadata. It is safe
 * to run repeatedly: IDs, handles, SKUs, media IDs and variant IDs are stable.
 */

import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildListingInput, normalizeCustomFields, slugify } from '../src/lib/catalog-model.js'
import { catalogRequestHeaders } from './http-user-agent.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_PATH = resolve(ROOT, 'public', 'designer', 'boombah', 'catalog.json')
const PRODUCTS_ROOT = resolve(ROOT, 'public', 'designer', 'boombah', 'products')
const REPORT_PATH = resolve(ROOT, 'artifacts', 'boombah-listing-import-report.json')
const DEFAULT_STOCK = 1000
const DEFAULT_PRICE = 79.99
const SOURCE_CATALOG_ENDPOINT = 'https://460511.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=902&deploy=1&compid=460511&ns-at=AAEJ7tMQw9G2yX07_bS1K30lpsfUvOFQFZhxv973u5Y3TZ8Ck8A'

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
for (const file of ['.env.local', '.env', '.env.production']) loadEnvFile(resolve(ROOT, file))

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const inline = process.argv.find(value => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const WRITE = hasArg('--write')
const OWNER_CONFIRMED = hasArg('--owner-confirmed') || String(process.env.BOOMBAH_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const FORCE_DRAFT = hasArg('--draft')
const ALLOW_DEFAULT_PRICE = hasArg('--allow-default-price')
const requestedProducts = new Set(String(argValue('--products', '')).split(',').map(value => value.trim().toUpperCase()).filter(Boolean))
const limit = Math.max(0, Number(argValue('--limit', 0)) || 0)
const defaultPrice = Math.max(0, Number(argValue('--default-price', process.env.BOOMBAH_DEFAULT_PRICE || DEFAULT_PRICE)) || DEFAULT_PRICE)
const stock = Math.max(1, Math.min(1_000_000, Math.trunc(Number(argValue('--stock', process.env.BOOMBAH_LISTING_STOCK || DEFAULT_STOCK)) || DEFAULT_STOCK)))

if (hasArg('--help') || hasArg('-h')) {
  console.log(`Create mirrored teamwear listings\n\n` +
    `  node scripts/create-boombah-listings.mjs [--write --owner-confirmed]\n` +
    `       [--products=FASTPITCH3D,BASEBALL3D] [--draft]\n` +
    `       [--allow-default-price] [--default-price 79.99] [--stock 1000]\n\n` +
    `Default mode is read-only. Write mode uses only local mirrored assets and\n` +
    `the server-side Supabase service key. Listings are idempotent.`)
  process.exit(0)
}
if (WRITE && !OWNER_CONFIRMED) throw new Error('Write mode requires --owner-confirmed or BOOMBAH_SOURCE_AUTHORIZED=true.')

const safeText = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const publicText = value => safeText(value)
  .replace(/\bboombah\b/gi, 'teamwear')
  .replace(/\bboombah\s+ink\b/gi, 'full-dye')
  .replace(/\s{2,}/g, ' ')
  .trim()
const toSlug = value => slugify(value, 'teamwear').replace(/-?3d$/i, '')
const internalAsset = value => {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/product-media/')
  } catch { return false }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

function familyTitle(product) {
  const id = String(product.id || '').toUpperCase()
  const sport = publicText(product.sport || product.name || 'Teamwear')
  if (id.includes('WOMENSSHOES')) return "Custom Women's Team Shoes"
  if (id.includes('SHOES')) return "Custom Men's Team Shoes"
  if (id.includes('ACCESSORIES')) return 'Custom Team Accessories'
  if (id.includes('WOMENSAPPAREL')) return "Custom Women's Team Apparel"
  if (id.includes('MENSAPPAREL')) return "Custom Men's Team Apparel"
  if (id.includes('WOMENSBASKETBALLREV')) return "Custom Reversible Women's Basketball Teamwear"
  if (id.includes('WOMENSBASKETBALL')) return "Custom Women's Basketball Teamwear"
  if (id.includes('BASKETBALLREV')) return 'Custom Reversible Basketball Teamwear'
  if (id.includes('REV')) return `Custom Reversible ${sport} Teamwear`
  return `Custom ${sport} Teamwear`
}

function familyDescription(product, title, styleCount, designCount) {
  const source = publicText(product.description)
  const detail = source ? `${source} ` : ''
  return `${title} is a made-to-order teamwear listing with a local 3D design studio. ${detail}Choose a garment cut and artwork template, set your colors, then add player names, numbers and an approved team logo. The roster keeps sizes together for production review. This listing contains ${styleCount} garment cuts and ${designCount} mirrored artwork templates; the exact design state travels with your custom order.`.slice(0, 4000)
}

function optionSizes(manifest) {
  const seen = new Set()
  const sizes = []
  for (const design of manifest.designs || []) {
    for (const size of design.sizes || []) {
      const code = String(typeof size === 'string' ? size : size?.code || size?.name || '').trim()
      if (code && !seen.has(code)) { seen.add(code); sizes.push(code) }
    }
  }
  return sizes.length ? sizes.slice(0, 80) : ['YXS', 'YS', 'YM', 'YL', 'YXL', 'XS', 'S', 'M', 'L', 'XL', '2XL']
}

function designMedia(manifest, productId, title, defaultDesignId = '') {
  const byStyle = new Map()
  for (const design of manifest.designs || []) {
    const preview = design.preview?.uri || design.preview?.url || ''
    if (!internalAsset(preview)) continue
    const style = String(design.styleCode || design.styleName || 'design').trim() || 'design'
    if (!byStyle.has(style)) byStyle.set(style, design)
  }
  const defaultId = defaultDesignId || manifest.designs?.[0]?.id
  const ordered = [
    ...(defaultId ? manifest.designs.filter(design => design.id === defaultId) : []),
    ...byStyle.values()
  ]
  const seen = new Set()
  return ordered.map((design, index) => {
    const url = design.preview?.uri || design.preview?.url || ''
    const id = `media-teamwear-${toSlug(productId)}-${toSlug(design.id || String(index))}`
    if (!internalAsset(url) || seen.has(url)) return null
    seen.add(url)
    const style = publicText(design.styleName || design.styleCode || 'Teamwear design')
    return {
      id,
      type: 'IMAGE',
      url,
      alt: `${title} ${style} preview`.slice(0, 240),
      role: index === 0 ? 'front' : 'design-preview',
      filename: `${toSlug(productId)}-${toSlug(design.id || String(index))}.jpg`,
      createdAt: manifest.source?.syncedAt || null
    }
  }).filter(Boolean).slice(0, 100)
}

function customFields(listingId) {
  return normalizeCustomFields([
    { id:`${listingId}-field-name`, key:'name', label:'Player name', type:'text', required:false, placeholder:'YOUR NAME', maxLength:16, help:'Name printed on the teamwear.' },
    { id:`${listingId}-field-number`, key:'number', label:'Player number', type:'number', required:false, placeholder:'90', maxLength:3, help:'Number from 0 to 999.' },
    { id:`${listingId}-field-team-logo`, key:'teamLogo', label:'Team logo', type:'logo', required:false, help:'Upload a logo you own or have permission to use.', previewRegion:{ x:28, y:18, width:44, height:48 }, minWidth:800, requiresConsent:true, logoTreatment:'EXACT' }
  ])
}

function stableVariants(listingId, sizes, price, inventory) {
  const base = `TW-${toSlug(listingId).replace(/^listing-teamwear-/, '').toUpperCase()}`
  return sizes.map((size, index) => ({
    id:`${listingId}-variant-${toSlug(size) || index + 1}`,
    sku:`${base}-${toSlug(size).toUpperCase() || String(index + 1)}`.slice(0, 120),
    values:{ Size:size },
    price,
    compareAt:null,
    cost:null,
    inventory,
    weightGrams:null,
    barcode:'',
    status:'ACTIVE',
    image:null
  }))
}

function parseJsonp(text) {
  const match = String(text || '').trim().match(/^[^(]+\((.*)\);?$/s)
  if (!match) throw new Error('Unexpected source catalog response.')
  return JSON.parse(match[1])
}

async function sourcePrice(productId) {
  const url = `${SOURCE_CATALOG_ENDPOINT}&product=${encodeURIComponent(productId)}&qs=t&jsonp=cb`
  const response = await fetch(url, { headers:catalogRequestHeaders({ accept:'*/*' }), signal:AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`Source catalog returned ${response.status}.`)
  const catalog = parseJsonp(await response.text())
  const values = Object.values(catalog.nsItems || {})
    .map(item => Number(item?.price0))
    .filter(value => Number.isFinite(value) && value > 0)
  return { price:values.length ? Math.min(...values) : null, currency:'USD', itemCount:values.length }
}

async function buildListing(entry, manifest, priceInfo) {
  const listingId = `listing-teamwear-${toSlug(entry.id)}`
  const title = familyTitle(manifest.product || entry)
  const media = designMedia(manifest, entry.id, title, entry.defaultDesignId)
  const sizes = optionSizes(manifest)
  const sourcePrice = Number(priceInfo?.price || 0)
  const price = sourcePrice > 0 ? Math.round(sourcePrice * 100) / 100 : defaultPrice
  const priced = sourcePrice > 0 || ALLOW_DEFAULT_PRICE
  const status = !FORCE_DRAFT && priced && media.length && sizes.length ? 'PUBLISHED' : 'DRAFT'
  const styleCodes = [...new Set((manifest.product?.styles || []).map(style => String(style.code || '').trim()).filter(Boolean))]
  const designIds = (manifest.designs || []).map(design => String(design.id || '').trim()).filter(Boolean)
  const handle = `custom-${toSlug(entry.id)}-teamwear`
  const taxonomy = {
    category:'Teamwear',
    productGroup:'Custom Teamwear',
    sport:toSlug(manifest.product?.sport || entry.sport || 'teamwear'),
    designer:'3d-teamwear',
    productFamily:toSlug(entry.id)
  }
  const description = familyDescription(manifest.product || entry, title, styleCodes.length, designIds.length)
  const seoTitle = `${title} | 3D teamwear studio`.slice(0, 60)
  const seoDescription = `Build ${title.toLowerCase()} in a 3D studio. Choose a cut, colors and artwork, then add a roster with names, numbers and an approved logo.`.slice(0, 300)
  const fields = customFields(listingId)
  const defaultDesign = manifest.designs?.find(design => design.id === entry.defaultDesignId) || manifest.designs?.[0] || {}
  const listing = {
    id:listingId,
    handle,
    title,
    subtitle:`3D teamwear studio · ${styleCodes.length || 1} garment cuts · ${designIds.length} artwork templates`,
    description,
    price,
    compareAt:null,
    status,
    badge:'3D CUSTOM TEAMWEAR',
    type:'PERSONALIZED',
    image:media[0]?.url || '',
    color:'',
    sku:`TW-${toSlug(entry.id).toUpperCase()}`.slice(0, 120),
    artworkLock:100,
    personalization:fields.map(field => field.label),
    media,
    contentBlocks:[
      { id:`${listingId}-intro`, type:'heading', content:'Build the kit your team will remember.' },
      { id:`${listingId}-body`, type:'paragraph', content:`Choose from ${styleCodes.length || 1} garment cuts and ${designIds.length} artwork templates in the local 3D studio. Colors, player names, numbers and approved logos stay attached to the production handoff.` }
    ],
    tags:[
      'teamwear','customizable','personalized','3d-designer','made-to-order',
      `designer-product-${slugify(entry.id, 'teamwear-product')}`,
      `sport-${toSlug(manifest.product?.sport || entry.sport || 'teamwear')}`
    ],
    productGroup:'Custom Teamwear',
    taxonomy,
    customFields:fields,
    seo:{ title:seoTitle, description:seoDescription, status:status === 'PUBLISHED' ? 'READY' : 'BLOCKED', quality_score:status === 'PUBLISHED' ? 82 : 0, block_reasons:status === 'PUBLISHED' ? [] : ['PRICE_SOURCE_REQUIRED'] },
    seoStatus:status === 'PUBLISHED' ? 'READY' : 'BLOCKED',
    seoQualityScore:status === 'PUBLISHED' ? 82 : 0,
    seoBlockReasons:status === 'PUBLISHED' ? [] : ['PRICE_SOURCE_REQUIRED'],
    aiMetadata:{
      importedFrom:'MIRRORED_DESIGNER_CATALOG',
      catalogLaunch:{ source:'owner-authorized', provider:'boombah', syncedAt:manifest.source?.syncedAt || null, stockPerVariant:stock },
      designer:{ provider:'boombah', productId:entry.id, manifest:entry.manifest, defaultDesignId:entry.defaultDesignId || defaultDesign.id || '', defaultStyleCode:defaultDesign.styleCode || '', allowedStyleCodes:styleCodes, allowedDesignIds:designIds },
      sourcePricing:{ currency:priceInfo?.currency || 'USD', price:sourcePrice || null, itemCount:Number(priceInfo?.itemCount || 0), fallback:!sourcePrice }
    },
    options:[{ name:'Size', values:sizes }],
    variants:stableVariants(listingId, sizes, price, stock)
  }
  return { listing, sourcePrice, priceInfo, entry, manifest }
}

async function loadEntries() {
  const catalog = await readJson(CATALOG_PATH)
  let entries = (catalog.products || []).filter(entry => !requestedProducts.size || requestedProducts.has(String(entry.id).toUpperCase()))
  if (limit) entries = entries.slice(0, limit)
  return entries
}

async function saveListings(client, rows) {
  const ids = rows.map(row => row.listing.id)
  const existing = new Map()
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await client.from('pod_products').select('id,updated_at').in('id', ids.slice(index, index + 100))
    if (error) throw new Error(`Could not read existing teamwear listings: ${error.message}`)
    for (const row of data || []) existing.set(row.id, row)
  }
  const saved = []
  const errors = []
  for (const row of rows) {
    const previous = existing.get(row.listing.id)
    const { error } = await client.rpc('pod_save_listing', { listing:buildListingInput(row.listing), expected_updated_at:previous?.updated_at || null })
    if (error) errors.push({ id:row.listing.id, error:error.message })
    else saved.push(row.listing.id)
  }
  return { saved, errors }
}

async function run() {
  const catalog = await readJson(CATALOG_PATH)
  let entries = (catalog.products || []).filter(entry => !requestedProducts.size || requestedProducts.has(String(entry.id).toUpperCase()))
  if (limit) entries = entries.slice(0, limit)
  if (!entries.length) throw new Error('No mirrored Boombah product families matched the requested scope.')
  console.log(`${WRITE ? 'Write' : 'Dry'} run · ${entries.length} teamwear listing families · stock ${stock}`)
  const rows = []
  const errors = []
  for (const entry of entries) {
    try {
      const manifestPath = String(entry.manifest || '').replace(/^\//, '').replace(/\//g, '\\')
      const manifest = await readJson(resolve(ROOT, 'public', manifestPath))
      let priceInfo = null
      try { priceInfo = await sourcePrice(entry.id) } catch (error) { errors.push({ id:entry.id, kind:'price', error:error instanceof Error ? error.message : String(error) }) }
      if (!priceInfo?.price && !ALLOW_DEFAULT_PRICE) console.warn(`  ${entry.id}: source price unavailable → DRAFT (use --allow-default-price to use ${defaultPrice})`)
      const row = await buildListing(entry, manifest, priceInfo)
      rows.push(row)
      console.log(`  ${entry.id} → ${row.listing.status} · ${row.listing.variants.length} variants · ${row.listing.media.length} images · $${row.listing.price.toFixed(2)}`)
    } catch (error) {
      errors.push({ id:entry.id, kind:'manifest', error:error instanceof Error ? error.message : String(error) })
    }
  }
  let writeResult = { saved:[], errors:[] }
  if (WRITE && rows.length) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    const client = createClient(supabaseUrl, serviceRoleKey, { auth:{ persistSession:false, autoRefreshToken:false } })
    writeResult = await saveListings(client, rows)
    // Keep a private import audit separate from public listing copy.
    const auditRows = rows.filter(row => writeResult.saved.includes(row.listing.id)).map(row => ({
      source:'boombah.com', source_entity_id:row.entry.id, entity_type:'PRODUCT', entity_id:row.listing.id,
      source_sku:row.listing.sku, source_categories:[row.manifest.product?.sport || 'Teamwear']
    }))
    if (auditRows.length) {
      const { error } = await client.from('pod_catalog_imports').upsert(auditRows, { onConflict:'source,source_entity_id,entity_type' })
      if (error) errors.push({ kind:'audit', error:error.message })
    }
  }
  const report = {
    generatedAt:new Date().toISOString(), mode:WRITE ? 'WRITE' : 'DRY_RUN',
    listings:rows.map(row => ({ id:row.listing.id, handle:row.listing.handle, status:row.listing.status, price:row.listing.price, sourcePrice:row.sourcePrice, variants:row.listing.variants.length, media:row.listing.media.length, productId:row.entry.id })),
    saved:writeResult.saved, errors:[...errors,...writeResult.errors]
  }
  await mkdir(dirname(REPORT_PATH), { recursive:true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ mode:report.mode, listings:rows.length, saved:report.saved.length, errors:report.errors.length, report:REPORT_PATH }, null, 2))
  if (report.errors.length && WRITE) process.exitCode = 2
}

run().catch(error => { console.error(`Teamwear listing import failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
