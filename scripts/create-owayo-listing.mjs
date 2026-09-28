#!/usr/bin/env node

/*
 * Publish the commerce record that backs the local Owayo cycling designer.
 *
 * The designer has 52 templates and 101 patterns, but those are options of a
 * single product family rather than 153 separate SEO pages.  This importer
 * therefore creates one stable, canonical Jersevo listing and keeps the
 * provider/source details in private ai_metadata.  It is deliberately
 * idempotent: the product id, variant ids and storage paths never change.
 *
 * Default mode is a dry run.  --write requires --owner-confirmed (or
 * OWAYO_SOURCE_AUTHORIZED=true) and a server-only Supabase service key.
 */

import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { buildListingInput, normalizeCustomFields, seoReviewGate, slugify, validateListing } from '../src/lib/catalog-model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = resolve(ROOT, 'public/designer/owayo/cycling-c3/manifest.json')
const REPORT_PATH = resolve(ROOT, 'artifacts/owayo-listing-import-report.json')
const PRODUCT_ID = 'listing-jersevo-custom-cycling-jersey-c3'
const HANDLE = 'jersevo-custom-cycling-jersey-c3'
const DEFAULT_PRICE = 85
const DEFAULT_STOCK = 1000
const SOURCE_PAGE = 'https://www.owayo.com/cycling-bikejerseys-us.htm'
const MEDIA_SOURCES = [
  { file: 'public/assets/jersey-black.webp', slug: 'black-editorial', alt: 'Illustrative black custom cycling jersey preview' },
  { file: 'public/assets/jersey-white.webp', slug: 'white-editorial', alt: 'Illustrative white custom cycling jersey preview' },
  { file: 'public/assets/jersey-oxblood.webp', slug: 'oxblood-editorial', alt: 'Illustrative oxblood custom cycling jersey preview' },
  { file: 'public/assets/shop/custom-cover.webp', slug: 'custom-studio', alt: 'Illustrative custom jersey design studio preview' }
]

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
for (const file of ['.env.local', '.env', '.env.production']) loadEnvFile(resolve(ROOT, file))

const hasArg = name => process.argv.includes(name)
const argValue = (name, fallback = '') => {
  const inline = process.argv.find(value => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const WRITE = hasArg('--write')
const OWNER_CONFIRMED = hasArg('--owner-confirmed') || String(process.env.OWAYO_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const FORCE_DRAFT = hasArg('--draft')
const PRICE = Math.max(0, Number(argValue('--price', process.env.OWAYO_LISTING_PRICE || DEFAULT_PRICE)) || DEFAULT_PRICE)
const STOCK = Math.max(1, Math.min(1_000_000, Math.trunc(Number(argValue('--stock', process.env.OWAYO_LISTING_STOCK || DEFAULT_STOCK)) || DEFAULT_STOCK)))

if (hasArg('--help') || hasArg('-h')) {
  console.log(`Create the canonical Jersevo custom cycling jersey listing\n\n` +
    `  node scripts/create-owayo-listing.mjs [--write --owner-confirmed]\n` +
    `       [--price 85] [--stock 1000] [--draft]\n\n` +
    `The default is read-only. Public copy uses Jersevo branding; Owayo source\n` +
    `details remain private in ai_metadata. --write needs a service-role key.`)
  process.exit(0)
}
if (WRITE && !OWNER_CONFIRMED) throw new Error('Write mode requires --owner-confirmed or OWAYO_SOURCE_AUTHORIZED=true.')

const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')
const stableId = value => `media-owayo-c3-${slugify(value, 'asset')}`

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export function owayoSizeRows(manifest) {
  const rows = []
  const seen = new Set()
  for (const item of manifest.product?.sizes || []) {
    const code = String(item?.size || item?.code || '').trim()
    const label = String(item?.name || item?.size || item?.code || '').replace(/\s+/g, ' ').trim()
    if (!code || /choose/i.test(label) || seen.has(code)) continue
    seen.add(code)
    rows.push({ code, label: label || code })
  }
  return rows.length ? rows : ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].map(code => ({ code, label: code }))
}

function makeCustomFields(listingId) {
  return normalizeCustomFields([
    { id: `${listingId}-field-name`, key: 'name', label: 'Player name', type: 'text', required: false, placeholder: 'YOUR NAME', maxLength: 18, help: 'Optional name printed on the jersey.' },
    { id: `${listingId}-field-number`, key: 'number', label: 'Player number', type: 'number', required: false, placeholder: '90', maxLength: 3, help: 'Optional number from 0 to 999.' },
    { id: `${listingId}-field-team`, key: 'teamCity', label: 'Team / city', type: 'text', required: false, placeholder: 'JERSEVO', maxLength: 24, help: 'Optional team or city text.' },
    { id: `${listingId}-field-logo`, key: 'teamLogo', label: 'Team logo', type: 'logo', required: false, help: 'Upload a logo you own or have permission to use.', previewRegion: { x: 28, y: 18, width: 44, height: 48 }, minWidth: 800, requiresConsent: true, logoTreatment: 'EXACT' }
  ])
}

function makeVariants(listingId, sizes, price, inventory) {
  const base = 'JERSEVO-C3'
  return sizes.map((size, index) => ({
    id: `${listingId}-variant-${slugify(size.code, String(index + 1))}`,
    sku: `${base}-${String(size.code).toUpperCase()}`.slice(0, 120),
    values: { Size: `${size.code} (${size.label.match(/\(([^)]+)\)/)?.[1] || size.label})` },
    price,
    compareAt: null,
    cost: null,
    inventory,
    weightGrams: null,
    barcode: '',
    status: 'ACTIVE',
    image: null
  }))
}

export function buildOwayoListing(manifest) {
  const sizes = owayoSizeRows(manifest)
  const fields = makeCustomFields(PRODUCT_ID)
  const designs = (manifest.designs || []).map(item => String(item.name || item.slug || '').trim()).filter(Boolean)
  const patterns = (manifest.patterns || []).map(item => String(item.name || item.slug || '').trim()).filter(Boolean)
  const title = 'Jersevo Custom Cycling Jersey C3'
  const subtitle = 'Short-sleeve team jersey · 3D design studio · made to order'
  const description = `${title} is a made-to-order short-sleeve cycling jersey for individual riders, clubs and teams. Start with a ready design, adjust the palette, apply a pattern, then add player names, numbers and an approved team logo in the Jersevo 3D studio. The roster workflow keeps every player and size together for production review. The C3-inspired cut is unisex with a relaxed athletic fit, full zipper and breathable performance fabric. Pricing starts at $${PRICE.toFixed(2)} per jersey before quantity savings; production and shipping timing are confirmed after artwork review. ${designs.length} design templates and ${patterns.length} pattern options are available in the designer.`
  const seoTitle = 'Custom Cycling Jersey C3 | Jersevo Design Studio'
  const seoDescription = 'Design a custom cycling jersey online with Jersevo. Choose a C3 short-sleeve template, colors and patterns, then add team names, player numbers and an approved logo.'
  const media = MEDIA_SOURCES.map((item, index) => ({
    id: stableId(item.slug),
    type: 'IMAGE',
    url: '',
    alt: item.alt,
    role: index === 0 ? 'front' : index === 1 ? 'alternate' : 'design-preview',
    filename: `${item.slug}.avif`,
    source: 'JERSEVO_EDITORIAL_ASSET',
    createdAt: manifest.source?.syncedAt || null
  }))
  const status = FORCE_DRAFT ? 'DRAFT' : 'PUBLISHED'
  const seoStatus = FORCE_DRAFT ? 'BLOCKED' : 'INDEXABLE'
  const taxonomy = {
    category: 'Cycling Jerseys',
    productGroup: 'Cycling Jersey',
    sport: 'cycling',
    audience: 'unisex',
    fit: 'relaxed-athletic',
    personalization: 'custom'
  }
  const listing = {
    id: PRODUCT_ID,
    handle: HANDLE,
    title,
    subtitle,
    description,
    price: PRICE,
    compareAt: null,
    status,
    badge: '3D CUSTOM CYCLING',
    type: 'PERSONALIZED',
    image: '',
    color: '',
    sku: 'JERSEVO-C3-CUSTOM',
    artworkLock: 100,
    personalization: fields.map(field => field.label),
    media,
    contentBlocks: [
      { id: `${PRODUCT_ID}-intro`, type: 'heading', content: 'Build a kit that belongs to your ride.' },
      { id: `${PRODUCT_ID}-studio`, type: 'paragraph', content: `The 3D studio includes ${designs.length} ready design templates and ${patterns.length} selectable patterns. Change colors, add names and numbers, upload an approved team logo, then submit one player or a complete roster.` },
      { id: `${PRODUCT_ID}-fit`, type: 'heading', content: 'Fit and production' },
      { id: `${PRODUCT_ID}-fit-body`, type: 'paragraph', content: 'Unisex relaxed athletic fit with short sleeves and full-zip construction. Select the garment code shown in the size guide; the studio carries the selected size into the production request.' }
    ],
    tags: ['cycling', 'cycling-jersey', 'custom-cycling-jersey', 'personalized', 'teamwear', '3d-designer', 'designer-provider-owayo', 'designer-product-cycling-c3', 'made-to-order', 'owayo-c3-template'],
    productGroup: 'Cycling Jersey',
    taxonomy,
    customFields: fields,
    seo: {
      title: seoTitle,
      description: seoDescription,
      primaryKeyword: 'custom cycling jersey',
      status: seoStatus,
      quality_score: FORCE_DRAFT ? 0 : 88,
      block_reasons: FORCE_DRAFT ? ['DRAFT_LISTING'] : []
    },
    seoStatus,
    seoQualityScore: FORCE_DRAFT ? 0 : 88,
    seoBlockReasons: FORCE_DRAFT ? ['DRAFT_LISTING'] : [],
    aiMetadata: {
      importedFrom: 'OWNER_AUTHORIZED_DESIGNER_MIRROR',
      source: {
        provider: 'owayo',
        productName: manifest.product?.name || 'Cycling Jersey C3 Basic Short Sleeve',
        sourcePage: SOURCE_PAGE,
        configurator: manifest.source?.configurator || null,
        syncedAt: manifest.source?.syncedAt || null,
        rights: 'Operator-authorized local mirror; do not claim official affiliation without a separate commercial agreement.'
      },
      designer: {
        provider: 'owayo',
        manifest: '/designer/owayo/cycling-c3/manifest.json',
        productId: 'cycling-c3',
        model: manifest.product?.model || '253m_KA',
        defaultDesignId: manifest.designs?.[0]?.slug || 'etape',
        allowedDesignIds: (manifest.designs || []).map(item => item.slug).filter(Boolean),
        patternCount: patterns.length,
        designCount: designs.length,
        sizeMap: sizes
      },
      sourcePricing: {
        currency: 'USD',
        basePrice: PRICE,
        quantityTiers: [
          { quantity: 1, unitPrice: 85 }, { quantity: 2, unitPrice: 77 }, { quantity: 3, unitPrice: 74 },
          { quantity: 5, unitPrice: 71 }, { quantity: 10, unitPrice: 61 }, { quantity: 20, unitPrice: 55 },
          { quantity: 35, unitPrice: 50 }, { quantity: 50, unitPrice: 44 }, { quantity: 100, unitPrice: 38 }
        ]
      }
    },
    options: [{ name: 'Size', values: media.length ? sizes.map(size => `${size.code} (${size.label.match(/\(([^)]+)\)/)?.[1] || size.label})`) : [] }],
    variants: makeVariants(PRODUCT_ID, sizes, PRICE, STOCK)
  }
  // Use one source of truth for the primary URL after media hydration.
  listing.image = media[0].url
  return listing
}

async function prepareMedia(item) {
  const sourcePath = resolve(ROOT, item.file)
  const input = await readFile(sourcePath)
  const optimized = await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .avif({ quality: 72, effort: 5 })
    .toBuffer()
  return { ...item, buffer: optimized, bytes: optimized.length, hash: sha256(optimized), mime: 'image/avif' }
}

async function hydrateMedia(client, listing) {
  const hydrated = []
  for (const item of MEDIA_SOURCES) {
    const prepared = await prepareMedia(item)
    const path = `${PRODUCT_ID}/import/owayo/${item.slug}-${prepared.hash.slice(0, 12)}.avif`
    if (!WRITE) {
      hydrated.push({ id: stableId(item.slug), type: 'IMAGE', url: `https://storage.example.invalid/${path}`, alt: item.alt, role: item.slug === 'black-editorial' ? 'front' : 'design-preview', filename: `${item.slug}.avif`, bytes: prepared.bytes, sha256: prepared.hash })
      continue
    }
    const { error } = await client.storage.from('product-media').upload(path, prepared.buffer, {
      contentType: prepared.mime,
      cacheControl: '31536000',
      upsert: true
    })
    if (error) throw new Error(`Media upload failed for ${item.slug}: ${error.message}`)
    const { data } = client.storage.from('product-media').getPublicUrl(path)
    if (!data?.publicUrl) throw new Error(`No public URL returned for ${item.slug}.`)
    hydrated.push({ id: stableId(item.slug), type: 'IMAGE', url: data.publicUrl, alt: item.alt, role: item.slug === 'black-editorial' ? 'front' : item.slug === 'white-editorial' ? 'alternate' : 'design-preview', filename: `${item.slug}.avif`, bytes: prepared.bytes, sha256: prepared.hash, createdAt: new Date().toISOString() })
  }
  return hydrated
}

async function saveListing(client, listing) {
  const { data: existing, error: readError } = await client.from('pod_products').select('id,updated_at').eq('id', listing.id).maybeSingle()
  if (readError) throw new Error(`Could not inspect existing listing: ${readError.message}`)
  const { data, error } = await client.rpc('pod_save_listing', {
    listing: buildListingInput(listing),
    expected_updated_at: existing?.updated_at || null
  })
  if (error) throw new Error(`Listing save failed: ${error.message}`)
  return { id: data?.id || listing.id, updatedAt: data?.updated_at || null, existed: Boolean(existing) }
}

async function run() {
  const manifest = await readJson(MANIFEST_PATH)
  const listing = buildOwayoListing(manifest)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (WRITE && (!supabaseUrl || !serviceRoleKey)) throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  const client = WRITE ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  const media = await hydrateMedia(client, listing)
  listing.media = media
  listing.image = media[0]?.url || ''
  const validation = validateListing(listing)
  const seo = seoReviewGate(listing)
  if (validation.length) throw new Error(`Generated listing is invalid: ${validation.join('; ')}`)
  if (!FORCE_DRAFT && !seo.ready) throw new Error(`Generated listing failed SEO gate: ${seo.blockers.join(', ')}`)
  let saved = null
  if (WRITE) {
    saved = await saveListing(client, listing)
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'WRITE' : 'DRY_RUN',
    listing: { id: listing.id, handle: listing.handle, title: listing.title, status: listing.status, price: listing.price, variants: listing.variants.length, media: listing.media.length, designs: manifest.designs?.length || 0, patterns: manifest.patterns?.length || 0 },
    media: media.map(item => ({ id: item.id, filename: item.filename, bytes: item.bytes, sha256: item.sha256, url: item.url })),
    seo: { ready: seo.ready, quality: seo.quality, blockers: seo.blockers, warnings: seo.warnings },
    saved
  }
  await mkdir(dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`Owayo listing import failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
