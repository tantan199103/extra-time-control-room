#!/usr/bin/env node

/*
 * Synchronize an exact Owayo garment family without pretending that a C3
 * model is interchangeable with another cut.  Large binaries go to the
 * public product-media bucket; only the small, cacheable manifest is checked
 * into the storefront.  The default is a read-only audit.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { catalogRequestHeaders } from './http-user-agent.mjs'
import { stripOwayoBranding, OWAYO_BRAND_COLOR_CODES, brandColorIndices } from './strip-owayo-branding.mjs'
import { OWAYO_CATALOG_V1, owayoFamilyById } from '../src/lib/owayo-catalog.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = resolve(root, 'public')
const sourceOrigin = 'https://www.owayo.com'
const assetOrigin = 'https://static.owayo-cdn.com'
const bucket = 'product-media'

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}
for (const file of ['.env.local', '.env', '.env.production']) loadEnvFile(resolve(root, file))

const has = value => process.argv.includes(value)
const valueOf = (name, fallback = '') => {
  const inline = process.argv.find(value => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const write = has('--write')
const ownerConfirmed = has('--owner-confirmed') || String(process.env.OWAYO_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const requestedId = valueOf('--product', '')
const all = has('--all')
if (write && !ownerConfirmed) throw new Error('Write mode requires --owner-confirmed or OWAYO_SOURCE_AUTHORIZED=true.')
if (!requestedId && !all) throw new Error('Pass --product <catalog id> or --all.')
if (has('--help') || has('-h')) {
  console.log('Usage: node scripts/sync-owayo-family-assets.mjs --product cycling-c5 [--write --owner-confirmed]\n       node scripts/sync-owayo-family-assets.mjs --all --write --owner-confirmed')
  process.exit(0)
}

const clean = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const slug = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

async function fetchBuffer(url, init = {}) {
  const response = await fetch(url, { ...init, headers:catalogRequestHeaders({ accept:'*/*', ...init.headers }) })
  if (!response.ok) throw new Error(`Owayo asset request failed (${response.status}) ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

async function fetchOptionalBuffer(url, init = {}) {
  try { return { buffer:await fetchBuffer(url, init), missing:false } }
  catch (error) {
    if (error instanceof Error && /\(404\)/.test(error.message)) return { buffer:null, missing:true, error }
    throw error
  }
}

function readBootstrap(html) {
  const match = html.match(/window\.infoFromGetParametersCached\s*=\s*JSON\.parse\('(.*?)'\);/s)
  if (!match) throw new Error('Owayo configurator bootstrap data was not found.')
  return JSON.parse(match[1].replace(/\\'/g, "'"))
}

function selectedFeatures(featureObjects = []) {
  return featureObjects.flatMap(featureObject => {
    const feature = featureObject.Features?.find(item => item.Feature === featureObject.StandardFeature) || featureObject.Features?.[0]
    if (!feature) return []
    return [{
      featuredObject:featureObject.FeaturedObject,
      feature:feature.Feature,
      name:feature.Name,
      abkuerzung:feature.Kuerzel,
      einzublendendeDreiDParts:feature.einzublendendeDreiDParts,
      imKonfiBeiDerProduktuebersichtAuswaehlbar:feature.imKonfiBeiDerProduktuebersichtAuswaehlbar,
      imKonfiVerstecktesAberFuerPreisberechnungRelevantesFeature:feature.imKonfiVerstecktesAberFuerPreisberechnungRelevantesFeature,
      isFeaturedObjectSichtbarLautDBAbfrage:featureObject.zeigeZugehoerigeFeatureBeiFeatureAuswahlAn,
      VorbelegungPreisanzeige:1
    }]
  })
}

async function productMetadata(family) {
  const sourcePage = `https://www.owayo.com/konfigurator_html/?color=RDY47588493&design=Etape&land=us&lang=en&product=${family.key}&sport=cycling`
  const bootstrap = readBootstrap((await fetchBuffer(sourcePage)).toString('utf8'))
  const product = bootstrap.productInfo
  const body = new URLSearchParams({
    schnitt:product.schnitt,
    sport:product.sport.auwi,
    websport:bootstrap.sportFuerProduktauswahl?.webNormalized || 'radsport',
    ordertype:product.ordertype,
    webProduct:product.product.webNormalized,
    iso:bootstrap.lang || 'en',
    produktAuwi:product.product.auwi,
    showUnpublishedDesigns:'',
    features:JSON.stringify(selectedFeatures(product.featureObjects))
  })
  const response = await fetch(`${sourceOrigin}/konfigurator_php/auswahlmodul/produkt.php`, {
    method:'POST',
    headers:catalogRequestHeaders({ accept:'application/json', 'content-type':'application/x-www-form-urlencoded;charset=UTF-8', origin:sourceOrigin, referer:sourcePage }),
    body
  })
  const text = await response.text()
  if (!response.ok || !/^\s*\{/.test(text)) throw new Error(`Product metadata failed for ${family.id}: ${text.slice(0, 120)}`)
  return { sourcePage, product:JSON.parse(text) }
}

function unzipEntries(buffer) {
  const entries = []
  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6)
    const method = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const uncompressedSize = buffer.readUInt32LE(offset + 22)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    if (flags & 0x08) throw new Error('ZIP data descriptors are not supported.')
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null
    if (!data || data.length !== uncompressedSize) throw new Error(`Unsupported/corrupt design archive entry ${name}`)
    entries.push({ name, data:Buffer.from(data) })
    offset = dataStart + compressedSize
  }
  if (!entries.length) throw new Error('No files were found in the design archive.')
  return entries
}

function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value)}\n`) }

async function renderPreview(mask, product) {
  const decoded = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  const defaults = product.ColorCodeFarbVorbelegungen || {}
  const featured = { A:0x111311, B:0xF3ED45, C:0x2876FF, D:0xEF3340, E:0xF8F8F4, K:0x111311 }
  const palette = new Map((product.colorCodes || []).map(color => {
    const value = featured[color.colorCode] ?? Number(defaults[color.colorCode] ?? 0xF8F8F4)
    return [Number(color.ColorCodeNr), [value >> 16 & 255, value >> 8 & 255, value & 255]]
  }))
  for (let offset = 0; offset < decoded.data.length; offset += decoded.info.channels) {
    const color = palette.get(decoded.data[offset])
    if (!color) continue
    decoded.data[offset] = color[0]; decoded.data[offset + 1] = color[1]; decoded.data[offset + 2] = color[2]
  }
  return sharp(decoded.data, { raw:decoded.info }).resize(480, 520, { fit:'cover', position:'north' }).webp({ quality:82, effort:5 }).toBuffer()
}

async function makeStorage(client, path, buffer, contentType) {
  if (!write) return { url:`https://storage.example.invalid/${bucket}/${path}`, bytes:buffer.length, sha256:sha256(buffer) }
  const { error } = await client.storage.from(bucket).upload(path, buffer, { contentType, cacheControl:'31536000', upsert:true })
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`)
  const { data } = client.storage.from(bucket).getPublicUrl(path)
  return { url:data.publicUrl, bytes:buffer.length, sha256:sha256(buffer) }
}

async function syncFamily(family, client, sharedPatterns) {
  const { sourcePage, product } = await productMetadata(family)
  const first = product.Designs?.[0]
  if (!first || !product.model) throw new Error(`No resolved model/designs for ${family.id}.`)
  const pathMatch = String(first.Pfad || '').match(/^\/modelle\/([^/]+)\//)
  const modelFolder = pathMatch?.[1] || product.Schnitt
  const modelRoot = `${assetOrigin}/modelle/${encodeURIComponent(modelFolder)}/${encodeURIComponent(product.model)}`
  const modelGzip = await fetchBuffer(`${modelRoot}/${encodeURIComponent(product.model)}.mirl`)
  const modelBinary = modelGzip[0] === 0x1f && modelGzip[1] === 0x8b ? gunzipSync(modelGzip) : modelGzip
  const modelInfo = await makeStorage(client, `designer/owayo/${family.id}/model/${product.model}.mirl.bin`, modelBinary, 'application/octet-stream')
  const support = {}
  for (const filename of ['parts.json','sperrbezirke.json','teilungslinien.json']) {
    const info = await makeStorage(client, `designer/owayo/${family.id}/model/${filename}`, await fetchBuffer(`${modelRoot}/${filename}`), 'application/json')
    support[filename] = info.url
  }
  const designs = []
  const missingDesigns = []
  for (const design of product.Designs) {
    const archiveResult = await fetchOptionalBuffer(`${modelRoot}/designs/${encodeURIComponent(design.Design)}.fish`)
    if (archiveResult.missing) {
      // A source catalogue can advertise a design whose archive is not
      // published for a particular cut (C7 currently has one such entry).
      // Keep the family manifest honest and continue syncing the other exact
      // designs instead of aborting the entire family.
      missingDesigns.push(design.Design)
      process.stdout.write(`${family.id}: skipped unavailable design ${design.Design}\n`)
      continue
    }
    const archive = unzipEntries(archiveResult.buffer).filter(entry => /\.png$/i.test(entry.name))
    if (!archive.length) {
      missingDesigns.push(design.Design)
      process.stdout.write(`${family.id}: skipped empty design ${design.Design}\n`)
      continue
    }
    const textures = {}
    let previewMask = null
    for (const entry of archive) {
      const filename = entry.name.split(/[\\/]/).at(-1)
      const cleaned = await stripOwayoBranding(entry.data, product.colorCodes, { optimize:true })
      if (/FrontRightPart\.png$/i.test(filename)) previewMask = cleaned.buffer
      const info = await makeStorage(client, `designer/owayo/${family.id}/designs/${slug(design.Design)}/${filename}`, cleaned.buffer, 'image/png')
      const base = filename.slice(0, -4).replace(new RegExp(`^${design.Design.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}_`, 'i'), '')
      textures[base] = info.url
    }
    const preview = await makeStorage(client, `designer/owayo/${family.id}/previews/${slug(design.Design)}.webp`, await renderPreview(previewMask || archive[0].data, product), 'image/webp')
    const snap = await fetchBuffer(`${sourceOrigin}/konfigurator_php/designmodul/getSnapLines.php?${new URLSearchParams({ cut:product.Schnitt, model:product.model, design:design.Design })}`, { headers:{ referer:sourcePage } })
    const snapInfo = await makeStorage(client, `designer/owayo/${family.id}/designs/${slug(design.Design)}/snap-lines.json`, snap, 'application/json')
    designs.push({ name:design.Design, slug:slug(design.Design), preview:preview.url, textures, snapLines:snapInfo.url, baseColors:design.baseColors || [], outlinedColors:String(design.ColorCodesWithOutline || '').split(',').filter(Boolean) })
    process.stdout.write(`${family.id}: ${design.Design}\n`)
  }
  const manifest = {
    schemaVersion:1,
    provider:'owayo',
    source:{ ownerConfirmedByOperator:true, configurator:sourcePage, productEndpoint:`${sourceOrigin}/konfigurator_php/auswahlmodul/produkt.php`, assetOrigin, syncedAt:new Date().toISOString() },
    product:{ name:product.Name, publicSlug:product.Urlname, normalizedSlug:product.webproduktNormalized, orderType:product.Ordertype, cut:product.Schnitt, model:product.model, baseModel:product.Basemodel, baseDesign:product.BasisDesign, sizes:product.Sizes || [], minimumOrder:Number(product.MindestBestellung || 1), maximumOrder:Number(product.MaximalBestellung || 250), droppableParts:product.namesOfDroppableParts || [], colorCodes:product.colorCodes || [], defaultColors:product.ColorCodeFarbVorbelegungen || {} },
    branding:{ removed:'Owayo vendor marks from synchronized mask textures', colorCodes:[...OWAYO_BRAND_COLOR_CODES], colorIndices:[...brandColorIndices(product.colorCodes)] },
    model:{ format:'mirl-v1.1-uncompressed', uri:modelInfo.url, parts:support['parts.json'], restrictedZones:support['sperrbezirke.json'], seamLines:support['teilungslinien.json'] },
    designs,
    syncStatus:missingDesigns.length ? 'PARTIAL' : 'READY',
    missingDesigns,
    availableDesigns:product.Designs.map(item => item.Design),
    // Pattern SVGs are product-independent masks; reuse the already verified
    // local catalogue until a family-specific pattern endpoint is needed.
    patterns:sharedPatterns?.patterns || [],
    patternCategories:sharedPatterns?.patternCategories || [],
    patternLibrary:sharedPatterns?.patternLibrary || null
  }
  const localPath = resolve(publicRoot, 'designer', 'owayo', family.id, 'manifest.json')
  if (write) {
    await mkdir(dirname(localPath), { recursive:true })
    await writeFile(localPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
  return { family, manifest, manifestPath:`/designer/owayo/${family.id}/manifest.json`, designCount:designs.length, missingDesigns, model:product.model }
}

const sharedPatterns = (() => {
  try { return JSON.parse(fs.readFileSync(resolve(publicRoot, 'designer/owayo/cycling-c3/manifest.json'), 'utf8')) } catch { return null }
})()
function hasCompleteLocalManifest(family) {
  if (has('--force')) return false
  try {
    const local = JSON.parse(fs.readFileSync(resolve(publicRoot, 'designer', 'owayo', family.id, 'manifest.json'), 'utf8'))
    return Array.isArray(local.designs)
      && local.designs.length > 0
      && local.syncStatus !== 'PARTIAL'
      && (!Array.isArray(local.missingDesigns) || local.missingDesigns.length === 0)
  } catch { return false }
}

const families = all
  ? OWAYO_CATALOG_V1.filter(row => !hasCompleteLocalManifest(row))
  : [owayoFamilyById(requestedId)]
if (families.some(row => !row)) throw new Error(`Unknown Owayo family: ${requestedId}`)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const client = write ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } }) : null
if (write && (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Write mode requires Supabase service credentials.')
const report = []
for (const family of families) report.push(await syncFamily(family, client, sharedPatterns))
await mkdir(resolve(root, 'artifacts'), { recursive:true })
await writeFile(resolve(root, 'artifacts/owayo-family-sync.json'), `${JSON.stringify({ generatedAt:new Date().toISOString(), mode:write ? 'WRITE' : 'DRY_RUN', report }, null, 2)}\n`)
console.log(JSON.stringify(report.map(item => ({ id:item.family.id, designCount:item.designCount, missingDesigns:item.missingDesigns, model:item.model, manifest:item.manifestPath })), null, 2))
