#!/usr/bin/env node

/* Create one Jersevo product record per synchronized garment family. */
import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildListingInput, normalizeCustomFields, seoReviewGate, slugify, validateListing } from '../src/lib/catalog-model.js'
import { OWAYO_CATALOG_V1, owayoFamilyById } from '../src/lib/owayo-catalog.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const has = value => process.argv.includes(value)
const valueOf = (name, fallback = '') => {
  const inline = process.argv.find(value => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
for (const file of ['.env.local', '.env', '.env.production']) loadEnvFile(resolve(root, file))

const write = has('--write')
const publish = has('--publish')
const ownerConfirmed = has('--owner-confirmed') || String(process.env.OWAYO_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const requestedId = valueOf('--family', '')
const requestedGroup = valueOf('--group', '')
const stock = Math.max(1, Math.min(1_000_000, Math.trunc(Number(valueOf('--stock', '1000')) || 1000)))
if (write && !ownerConfirmed) throw new Error('Write mode requires --owner-confirmed or OWAYO_SOURCE_AUTHORIZED=true.')
if (has('--help') || has('-h')) {
  console.log('Usage: node scripts/create-owayo-family-listings.mjs --family basketball-b6 [--write --publish --owner-confirmed]\n       node scripts/create-owayo-family-listings.mjs --group basketball --write --publish --owner-confirmed\n       node scripts/create-owayo-family-listings.mjs --all --write --publish --owner-confirmed')
  process.exit(0)
}

const families = has('--all')
  ? OWAYO_CATALOG_V1
  : requestedGroup
    ? OWAYO_CATALOG_V1.filter(row => row.group === requestedGroup)
    : [owayoFamilyById(requestedId)]
if (families.some(row => !row)) throw new Error(`Unknown Owayo family: ${requestedId}`)
if (!families.length) throw new Error(`No Owayo families matched ${requestedGroup || requestedId || 'the requested scope'}.`)
const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')) }
function sizesFor(manifest) {
  const seen = new Set()
  return (manifest.product?.sizes || []).flatMap(item => {
    const code = String(item?.size || item?.code || '').trim()
    const label = clean(item?.name || item?.size || item?.code)
    if (!code || !label || /choose/i.test(label) || seen.has(code)) return []
    seen.add(code)
    return [{ code, label }]
  })
}
function customFields(id) {
  return normalizeCustomFields([
    { id:`${id}-field-name`, key:'name', label:'Player name', type:'text', required:false, placeholder:'YOUR NAME', maxLength:18, help:'Optional name printed on the jersey.' },
    { id:`${id}-field-number`, key:'number', label:'Player number', type:'number', required:false, placeholder:'90', maxLength:3, help:'Optional number from 0 to 999.' },
    { id:`${id}-field-team`, key:'teamCity', label:'Team / city', type:'text', required:false, placeholder:'YOUR TEAM', maxLength:24, help:'Optional team or city text.' },
    { id:`${id}-field-logo`, key:'teamLogo', label:'Team logo', type:'logo', required:false, help:'Upload a logo you own or have permission to use.', previewRegion:{ x:28, y:18, width:44, height:48 }, minWidth:800, requiresConsent:true, logoTreatment:'EXACT' }
  ])
}
function variants(id, sizes, price) {
  return sizes.map((size, index) => ({ id:`${id}-variant-${slugify(size.code, String(index + 1))}`, sku:`JERSEVO-${id.replace(/^listing-jersevo-custom-/, '').toUpperCase()}-${String(size.code).toUpperCase()}`.slice(0, 120), values:{ Size:`${size.code} (${size.label.match(/\(([^)]+)\)/)?.[1] || size.label})` }, price, compareAt:null, cost:null, inventory:stock, weightGrams:null, barcode:'', status:'ACTIVE', image:null }))
}

export function buildOwayoFamilyListing(family, manifest) {
  const id = `listing-jersevo-custom-${family.id}`
  const handle = slugify(family.title, family.id)
  const sizes = sizesFor(manifest)
  if (!sizes.length) throw new Error(`${family.id} has no selectable sizes.`)
  const fields = customFields(id)
  const designs = (manifest.designs || []).map(item => clean(item.name || item.slug)).filter(Boolean)
  const patterns = (manifest.patterns || []).map(item => clean(item.name || item.slug)).filter(Boolean)
  const title = family.title
  const sportLabel = clean(family.sportLabel || family.groupLabel || family.group || 'Sportswear')
  const productGroup = family.group === 'tshirts' ? 'Custom T-Shirt' : `${sportLabel} Jersey`
  const category = family.group === 'tshirts' ? 'Custom T-Shirts' : `${sportLabel} Jerseys`
  const sportTag = slugify(family.group || family.sport || 'sportswear', 'sportswear')
  const description = `${title} is a made-to-order ${sportLabel.toLowerCase()} garment for players, clubs and teams. Choose a production-ready design, tune the color story, add a pattern where supported, then place names, numbers and an approved logo in the matching 3D studio. The roster keeps each player's size and personalization together for artwork review. This ${family.sleeve} ${family.fit} cut is prepared from the exact synchronized garment model, with pricing from $${Number(family.priceUsd).toFixed(2)} before quantity savings. ${designs.length} design templates${patterns.length ? ` and ${patterns.length} pattern options` : ''} are available in the editor.`
  const garmentRenderUrl = `/designer/owayo/${family.id}/previews/garment-render.webp`
  const hasGarmentRender = fs.existsSync(resolve(root, 'public', garmentRenderUrl.slice(1)))
  const designMedia = (manifest.designs || []).slice(0, hasGarmentRender ? 3 : 4).map((design, index) => ({ id:`media-${id}-${slugify(design.slug || design.name, String(index))}`, type:'IMAGE', url:design.preview, alt:`${title} custom design preview ${index + 1}`, role:hasGarmentRender ? 'design-preview' : index === 0 ? 'front' : 'design-preview', filename:`${slugify(design.slug || design.name, `design-${index}`)}.webp`, source:'JERSEVO_DESIGNER_PREVIEW', createdAt:manifest.source?.syncedAt || null }))
  const media = hasGarmentRender
    ? [{ id:`media-${id}-garment-render`, type:'IMAGE', url:garmentRenderUrl, alt:`${title} 3D garment preview`, role:'front', filename:'garment-render.webp', source:'JERSEVO_3D_CAPTURE', createdAt:manifest.source?.syncedAt || null }, ...designMedia]
    : designMedia
  const status = publish ? 'PUBLISHED' : 'DRAFT'
  const seoStatus = publish ? 'INDEXABLE' : 'BLOCKED'
  const taxonomy = { category, productGroup, sport:family.sport, audience:family.audience, fit:family.fit, sleeve:family.sleeve, personalization:'custom' }
  return {
    id, handle, title,
    subtitle:`${family.sleeve} ${family.fit} ${productGroup.toLowerCase()} · 3D design studio · made to order`,
    description, price:Number(family.priceUsd), compareAt:null, status, badge:'3D CUSTOM', type:'PERSONALIZED', image:media[0]?.url || '', color:'', sku:`JERSEVO-${family.id.toUpperCase()}`, artworkLock:100, personalization:fields.map(field => field.label), media,
    contentBlocks:[
      { id:`${id}-intro`, type:'heading', content:'Build a kit that belongs to your team.' },
      { id:`${id}-studio`, type:'paragraph', content:`The matching 3D studio carries ${designs.length} ready designs${patterns.length ? ` and ${patterns.length} patterns` : ''}. Change colors, add names and numbers, upload an approved team logo, then submit one player or a complete roster.` },
      { id:`${id}-fit`, type:'heading', content:'Fit and production' },
      { id:`${id}-fit-body`, type:'paragraph', content:`${family.fit} ${family.sleeve} construction. Select the garment code shown in the size guide; the studio carries the selected size into the production request.` }
    ],
    tags:[sportTag, slugify(productGroup, 'custom-sportswear'), `custom-${sportTag}-${family.group === 'tshirts' ? 'tshirt' : 'jersey'}`, 'personalized','teamwear','3d-designer','designer-provider-owayo','made-to-order',`designer-product-${family.id}`], productGroup, taxonomy, customFields:fields,
    seo:{ title:`${family.title} | 3D Kit Designer`.slice(0, 60), description:`Design a personalized ${family.title.replace(/^Custom\s+/i, '').toLowerCase()} online. Choose colors, add names, numbers and logos, then review the exact garment in 3D before ordering.`, primaryKeyword:`custom ${sportLabel.toLowerCase()} ${family.group === 'tshirts' ? 't-shirt' : 'jersey'}`, status:seoStatus, quality_score:publish ? 88 : 0, block_reasons:publish ? [] : ['DRAFT_LISTING'] }, seoStatus, seoQualityScore:publish ? 88 : 0, seoBlockReasons:publish ? [] : ['DRAFT_LISTING'],
    aiMetadata:{ importedFrom:'OWNER_AUTHORIZED_DESIGNER_MIRROR', source:{ provider:'owayo', productName:family.sourceName, sourcePage:family.sourceUrl, rights:'Operator-authorized local mirror; do not claim official affiliation without a separate commercial agreement.', syncedAt:manifest.source?.syncedAt || null, syncStatus:manifest.syncStatus || 'READY', missingDesigns:manifest.missingDesigns || [] }, designer:{ provider:'owayo', manifest:`/designer/owayo/${family.id}/manifest.json`, productId:family.id, model:manifest.product?.model || family.model, defaultDesignId:manifest.designs?.[0]?.slug || '', allowedDesignIds:(manifest.designs || []).map(item => item.slug).filter(Boolean), patternCount:patterns.length, designCount:designs.length, sizeMap:sizes }, sourcePricing:{ currency:'USD', basePrice:Number(family.priceUsd) } },
    options:[{ name:'Size', values:sizes.map(size => `${size.code} (${size.label.match(/\(([^)]+)\)/)?.[1] || size.label})`) }], variants:variants(id, sizes, Number(family.priceUsd))
  }
}

async function save(client, listing) {
  const { data:existing, error:readError } = await client.from('pod_products').select('id,updated_at').eq('id', listing.id).maybeSingle()
  if (readError) throw readError
  const { data, error } = await client.rpc('pod_save_listing', { listing:buildListingInput(listing), expected_updated_at:existing?.updated_at || null })
  if (error) throw error
  return { id:data?.id || listing.id, existed:Boolean(existing), updatedAt:data?.updated_at || null }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const client = write ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } }) : null
if (write && (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Write mode requires Supabase service credentials.')
const report = []
for (const family of families) {
  const manifestPath = resolve(root, 'public', 'designer', 'owayo', family.id, 'manifest.json')
  if (!fs.existsSync(manifestPath)) { report.push({ id:family.id, status:'PENDING_ASSET_SYNC' }); continue }
  const manifest = await readJson(manifestPath)
  if (publish && manifest.syncStatus === 'PARTIAL') {
    report.push({ id:family.id, status:'PENDING_MISSING_SOURCE_DESIGNS', missingDesigns:manifest.missingDesigns || [] })
    continue
  }
  const listing = buildOwayoFamilyListing(family, manifest)
  const validation = validateListing(listing)
  const seo = seoReviewGate(listing)
  if (validation.length) throw new Error(`${family.id} validation failed: ${validation.join('; ')}`)
  if (publish && !seo.ready) throw new Error(`${family.id} SEO gate failed: ${seo.blockers.join(', ')}`)
  const saved = write ? await save(client, listing) : null
  report.push({ id:family.id, listingId:listing.id, handle:listing.handle, status:listing.status, variants:listing.variants.length, media:listing.media.length, saved, seo:{ ready:seo.ready, blockers:seo.blockers } })
}
await mkdir(resolve(root, 'artifacts'), { recursive:true })
await writeFile(resolve(root, 'artifacts/owayo-family-listing-report.json'), `${JSON.stringify({ generatedAt:new Date().toISOString(), mode:write ? 'WRITE' : 'DRY_RUN', report }, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
