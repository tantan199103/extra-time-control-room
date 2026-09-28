#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { isBoombahBrandingName, stripBoombahBrandingText } from '../src/lib/boombah-branding.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_ROOT = resolve(ROOT, 'public', 'designer', 'boombah')
const REPORT_PATH = resolve(ROOT, 'artifacts', 'boombah-designer-sync-report.json')
const BUCKET = 'product-media'
const STORAGE_ROOT = 'designer/boombah'
const SOURCE_ORIGIN = 'https://www.boombah.com'
const MODEL_ORIGIN = 'https://res.cloudinary.com/boombld/image/upload/models'
const ASSET_ORIGIN = 'https://res.cloudinary.com/boombld/image/upload'
const PREVIEW_ORIGIN = 'https://media.boombah.com/image/upload/t_builderThumb'
const CATALOG_ENDPOINT = 'https://460511.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=902&deploy=1&compid=460511&ns-at=AAEJ7tMQw9G2yX07_bS1K30lpsfUvOFQFZhxv973u5Y3TZ8Ck8A'
const PRODUCTS = [
  'FASTPITCH3D', 'BASEBALL3D', 'SLOWPITCH3D',
  'BASKETBALL3D', 'BASKETBALLREV3D',
  'WOMENSBASKETBALL3D', 'WOMENSBASKETBALLREV3D',
  'FOOTBALL3D', 'FOOTBALLREV3D',
  'VOLLEYBALL3D', 'MENSVOLLEYBALL3D', 'HOCKEY3D',
  'MENSAPPAREL3D', 'WOMENSAPPAREL3D',
  'ACCESSORIES3D', 'SHOES3D', 'WOMENSSHOES3D'
]

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const inline = process.argv.find(value => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const WRITE = hasArg('--write')
const MODELS_ONLY = hasArg('--models-only')
const OWNER_CONFIRMED = hasArg('--owner-confirmed') || String(process.env.BOOMBAH_SOURCE_AUTHORIZED || '').toLowerCase() === 'true'
const CONCURRENCY = Math.max(1, Math.min(12, Number(argValue('--concurrency', process.env.BOOMBAH_SYNC_CONCURRENCY || 5)) || 5))
const PRODUCT_FILTER = new Set(String(argValue('--products', '')).split(',').map(value => value.trim().toUpperCase()).filter(Boolean))
const selectedProducts = PRODUCT_FILTER.size ? PRODUCTS.filter(product => PRODUCT_FILTER.has(product)) : PRODUCTS

function usage() {
  console.log(`Boombah designer asset sync\n\n` +
    `  node scripts/sync-boombah-designer-assets.mjs [--write] [--owner-confirmed]\n` +
    `       [--products=FASTPITCH3D,FOOTBALL3D] [--concurrency=5] [--models-only]\n\n` +
    `Without --write the script only audits the live catalog and writes a local plan.\n` +
    `Write mode mirrors GLB, cleaned SVG and preview assets into Supabase Storage,\n` +
    `then creates a lightweight local catalog plus one manifest per product.\n`)
}

if (hasArg('--help') || hasArg('-h')) { usage(); process.exit(0) }
if (WRITE && !OWNER_CONFIRMED) throw new Error('Write mode requires --owner-confirmed or BOOMBAH_SOURCE_AUTHORIZED=true.')

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex') }
function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function immutablePath(path, digest) {
  const extension = extname(path)
  return `${path.slice(0, -extension.length)}-${digest.slice(0, 12)}${extension}`
}

function jsonBuffer(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`) }

async function fetchBuffer(url, { optional = false, attempts = 4 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept:'*/*', 'user-agent':'JersevoAssetSync/2.0' },
        signal:AbortSignal.timeout(60_000)
      })
      if (optional && response.status === 404) return null
      if (!response.ok) throw new Error(`Asset request failed (${response.status}) ${url}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise(resolveWait => setTimeout(resolveWait, attempt * 500))
    }
  }
  throw lastError
}

async function fetchCatalog(product) {
  const url = `${CATALOG_ENDPOINT}&product=${encodeURIComponent(product)}&qs=t&jsonp=cb`
  const text = (await fetchBuffer(url)).toString('utf8').trim()
  const match = text.match(/^[^(]+\((.*)\);?$/s)
  if (!match) throw new Error(`Unexpected JSONP response for ${product}.`)
  return JSON.parse(match[1])
}

function baseNameForStyle(catalog, style) {
  if (style.baseName) return String(style.baseName).trim()
  const item = Object.values(catalog.nsItems || {}).find(value => String(value?.parent || '') === String(style.nsId || ''))
  return String(item?.name || '').split(' : ')[0].trim().split(/\s+/)[0]
}

function isBrandZone(zone) {
  return isBoombahBrandingName(zone?.name) || /(?:vendor|manufacturer|brand)\s*color/i.test(String(zone?.name || ''))
}

function sourceSvgUrl(catalog, section, garment) {
  const styleDirectory = String(garment).split('-').at(-2)?.toLowerCase() || ''
  const prefix = String(section.svgPath || '')
  if (/^https?:\/\//i.test(prefix)) {
    return catalog.svgPathAbsolute
      ? `${prefix}${styleDirectory}/${garment}.svg`
      : `${prefix}${String(catalog.name || '').toLowerCase()}/${styleDirectory}/${garment}.svg`
  }
  const path = catalog.svgPathAbsolute
    ? `${prefix}${styleDirectory}/${garment}.svg`
    : `${prefix}${String(catalog.name || '').toLowerCase()}/${styleDirectory}/${garment}.svg`
  return `${ASSET_ORIGIN}/${path.replace(/^\/+/, '')}`
}

function normalizeSizes(...groups) {
  const seen = new Set()
  return groups.flat().filter(Boolean).map(size => typeof size === 'string' ? { name:size, code:size } : {
    name:String(size?.name || size?.size || size?.code || '').trim(),
    code:String(size?.code || size?.size || size?.name || '').trim()
  }).filter(size => size.name && !seen.has(size.code) && seen.add(size.code))
}

function normalizeProduct(productId, catalog) {
  const palettes = Object.fromEntries(Object.entries(catalog.pallets || {}).map(([key, value]) => [key,
    (Array.isArray(value) ? value : []).map(color => ({
      code:String(color.code || ''),
      name:String(color.colorName || color.name || color.code || ''),
      value:`#${String(color.colorValue || '').replace('#', '').padStart(6, '0').slice(0, 6).toUpperCase()}`
    })).filter(color => /^#[0-9A-F]{6}$/.test(color.value))
  ]))
  const designs = []
  const styles = []
  const sections = []
  const sourceModels = new Set()
  for (const [sectionName, section] of [['top', catalog.top], ['bottom', catalog.bottom]]) {
    if (!section?.styles?.length) continue
    sections.push({ id:sectionName, name:sectionName === 'top' ? 'Tops' : 'Bottoms' })
    for (const style of section.styles) {
      const baseName = baseNameForStyle(catalog, style)
      if (!baseName) continue
      const designIds = []
      for (const [styleNo, rawDesign] of Object.entries(style.styles || {})) {
        if (rawDesign.mid) sourceModels.add(String(rawDesign.mid))
        const hidden = Boolean(rawDesign.hide || (style.hide || []).map(String).includes(String(styleNo)))
        if (hidden || !rawDesign.mid) continue
        const garment = String(rawDesign.baseName || `${baseName}-${styleNo}`).trim()
        const colorZones = Object.entries(rawDesign.cb || {}).map(([code, zone]) => ({
          code,
          name:cleanText(zone?.name || `Color ${code}`),
          palette:String(zone?.pallet || ''),
          gradients:Boolean(zone?.options?.gradients),
          patterns:Boolean(zone?.options?.patterns),
          mesh:String(zone?.id || ''),
          editable:!isBrandZone(zone),
          removed:isBrandZone(zone)
        }))
        const id = slug(`${productId}-${sectionName}-${garment}`)
        const design = {
          id,
          slug:id,
          name:cleanText(rawDesign.thumbName || `Design ${styleNo}`),
          section:sectionName,
          styleCode:String(style.code || ''),
          styleName:cleanText(style.name || style.code),
          styleNo:String(styleNo),
          garment,
          modelId:String(rawDesign.mid),
          description:cleanText(rawDesign.desc || style.desc),
          sizes:normalizeSizes(rawDesign.sizes || [], style.sizes || [], section.sizes || []),
          colorZones,
          defaultColors:{},
          source:{
            model:`${MODEL_ORIGIN}/${encodeURIComponent(rawDesign.mid)}.glb`,
            template:sourceSvgUrl(catalog, section, garment),
            preview:`${PREVIEW_ORIGIN}/${encodeURIComponent(garment)}-3D`
          }
        }
        designs.push(design)
        designIds.push(id)
      }
      if (designIds.length) styles.push({
        id:slug(`${productId}-${sectionName}-${style.code}`),
        section:sectionName,
        code:String(style.code || ''),
        name:cleanText(style.name || style.code),
        description:cleanText(style.desc),
        designIds
      })
    }
  }
  return {
    id:productId,
    name:cleanText(catalog.top?.overview || catalog.bottom?.overview || catalog.name || productId),
    sport:cleanText(catalog.top?.sport || catalog.bottom?.sport || catalog.name || productId),
    description:cleanText(catalog.description || catalog.top?.desc || catalog.bottom?.desc),
    leadTime:cleanText(catalog.top?.leadTime || catalog.bottom?.leadTime),
    type:String(catalog.top?.type || catalog.bottom?.type || ''),
    minOrder:Number(catalog.minOrder?.qty || 1),
    sections,
    styles,
    palettes,
    colors:(catalog.boombahColors || []).map(color => ({
      code:String(color.code || ''),
      name:String(color.colorName || color.code || ''),
      value:`#${String(color.colorValue || '').replace('#', '').padStart(6, '0').slice(0, 6).toUpperCase()}`
    })).filter(color => /^#[0-9A-F]{6}$/.test(color.value)),
    designs,
    sourceModels:[...sourceModels].sort()
  }
}

export function stripBoombahBranding(buffer, colorZones = []) {
  const svg = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '')
  return Buffer.from(stripBoombahBrandingText(svg, colorZones), 'utf8')
}

async function mapConcurrent(items, limit, handler) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await handler(items[index], index)
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length || 1) }, worker))
  return results
}

function publicUrl(client, path) {
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

function duplicateUpload(error) {
  return Number(error?.statusCode || error?.status) === 409 || /already exists|duplicate/i.test(String(error?.message || ''))
}

async function sync() {
  const syncedAt = new Date().toISOString()
  console.log(`Reading ${selectedProducts.length} live designer catalogs...`)
  const products = []
  for (const productId of selectedProducts) {
    const normalized = normalizeProduct(productId, await fetchCatalog(productId))
    products.push(normalized)
    console.log(`  ${productId}: ${normalized.styles.length} style groups, ${normalized.designs.length} active templates`)
  }

  const modelIds = [...new Set(products.flatMap(product => product.sourceModels))].sort()
  const plan = {
    schemaVersion:2,
    write:WRITE,
    ownerConfirmedByOperator:OWNER_CONFIRMED,
    generatedAt:syncedAt,
    products:products.map(product => ({ id:product.id, name:product.name, styles:product.styles.length, designs:product.designs.length })),
    totals:{ products:products.length, models:modelIds.length, templates:products.reduce((sum, product) => sum + product.designs.length, 0) }
  }
  await mkdir(dirname(REPORT_PATH), { recursive:true })

  if (!WRITE) {
    await writeFile(REPORT_PATH, jsonBuffer(plan))
    console.log(`Dry-run report: ${REPORT_PATH}`)
    console.log(plan.totals)
    return
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!/^https:\/\//i.test(supabaseUrl) || !/^(?:sb_secret_|eyJ)/.test(serviceRoleKey)) {
    throw new Error('Write mode requires SUPABASE_URL and a server-only SUPABASE_SERVICE_ROLE_KEY.')
  }
  const client = createClient(supabaseUrl, serviceRoleKey, { auth:{ persistSession:false, autoRefreshToken:false } })
  const { data:bucket, error:bucketError } = await client.storage.getBucket(BUCKET)
  if (bucketError || !bucket?.public) throw new Error(`Public ${BUCKET} bucket is unavailable: ${bucketError?.message || 'not public'}`)

  let uploadedBytes = 0
  let uploadedFiles = 0
  let reusedFiles = 0
  const mirror = async (sourceBuffer, desiredPath, contentType) => {
    const digest = sha256(sourceBuffer)
    const path = immutablePath(desiredPath, digest)
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const fileName = path.slice(path.lastIndexOf('/') + 1)
    const { data:existing, error:listError } = await client.storage.from(BUCKET).list(folder, { search:fileName, limit:2 })
    if (listError) throw new Error(`Storage lookup failed for ${path}: ${listError.message}`)
    if ((existing || []).some(item => item.name === fileName)) {
      reusedFiles += 1
      return { uri:publicUrl(client, path), path, sha256:digest, bytes:sourceBuffer.byteLength }
    }
    const { error } = await client.storage.from(BUCKET).upload(path, sourceBuffer, {
      contentType,
      cacheControl:'31536000, immutable',
      upsert:false
    })
    if (error && !duplicateUpload(error)) throw new Error(`Storage upload failed for ${path}: ${error.message}`)
    if (error) reusedFiles += 1
    else { uploadedFiles += 1; uploadedBytes += sourceBuffer.byteLength }
    return { uri:publicUrl(client, path), path, sha256:digest, bytes:sourceBuffer.byteLength }
  }

  console.log(`Mirroring ${modelIds.length} unique GLB models with concurrency ${CONCURRENCY}...`)
  let modelProgress = 0
  const modelResults = await mapConcurrent(modelIds, CONCURRENCY, async modelId => {
    const source = `${MODEL_ORIGIN}/${encodeURIComponent(modelId)}.glb`
    const buffer = await fetchBuffer(source, { optional:true })
    modelProgress += 1
    if (!buffer) {
      console.warn(`  Missing model ${modelId}`)
      return [modelId, null]
    }
    const asset = await mirror(buffer, `${STORAGE_ROOT}/models/${slug(modelId)}.glb`, 'model/gltf-binary')
    if (modelProgress % 20 === 0 || modelProgress === modelIds.length) console.log(`  Models ${modelProgress}/${modelIds.length}`)
    return [modelId, { ...asset, format:'glb-draco' }]
  })
  const modelMap = new Map(modelResults)

  const modelInventory = {
    schemaVersion:2,
    provider:'boombah',
    source:{ ownerConfirmedByOperator:true, site:SOURCE_ORIGIN, syncedAt },
    storage:{ bucket:BUCKET, root:`${STORAGE_ROOT}/models`, mirrored:true, hotlinked:false },
    models:modelIds.map(id => ({ id, ...(modelMap.get(id) || { unavailable:true }) })),
    stats:{ discovered:modelIds.length, available:[...modelMap.values()].filter(Boolean).length, unavailable:[...modelMap.values()].filter(value => !value).length }
  }
  await mkdir(OUTPUT_ROOT, { recursive:true })
  await writeFile(resolve(OUTPUT_ROOT, 'models.json'), jsonBuffer(modelInventory))

  if (MODELS_ONLY) {
    const catalogPath = resolve(OUTPUT_ROOT, 'catalog.json')
    const existing = JSON.parse(await readFile(catalogPath, 'utf8'))
    existing.source = { ...existing.source, syncedAt }
    existing.modelsManifest = '/designer/boombah/models.json'
    existing.stats = { ...existing.stats, models:modelInventory.stats.available, unavailableModels:modelInventory.stats.unavailable, uploadedFiles, reusedFiles, uploadedBytes }
    await writeFile(catalogPath, jsonBuffer(existing))
    await writeFile(REPORT_PATH, jsonBuffer({ ...plan, completedAt:new Date().toISOString(), models:modelInventory.stats, uploadedFiles, reusedFiles, uploadedBytes }))
    console.log('Model inventory: /designer/boombah/models.json')
    console.log(`Uploaded ${(uploadedBytes / 1024 / 1024).toFixed(2)} MiB in ${uploadedFiles} files; reused ${reusedFiles}.`)
    return
  }

  const allDesigns = products.flatMap(product => product.designs.map(design => ({ product, design })))
  console.log(`Mirroring ${allDesigns.length} cleaned SVG templates and previews...`)
  let templateProgress = 0
  await mapConcurrent(allDesigns, CONCURRENCY, async ({ product, design }) => {
    const model = modelMap.get(design.modelId)
    if (!model) { design.unavailableReason = 'MODEL_MISSING'; return }
    const svgBuffer = await fetchBuffer(design.source.template, { optional:true })
    if (!svgBuffer) { design.unavailableReason = 'TEMPLATE_MISSING'; return }
    const cleanedSvg = stripBoombahBranding(svgBuffer, design.colorZones)
    const productSlug = slug(product.id)
    const template = await mirror(cleanedSvg, `${STORAGE_ROOT}/templates/${productSlug}/${design.section}/${slug(design.garment)}.svg`, 'image/svg+xml')
    const previewBuffer = await fetchBuffer(design.source.preview, { optional:true })
    const preview = previewBuffer
      ? await mirror(previewBuffer, `${STORAGE_ROOT}/previews/${productSlug}/${design.section}/${slug(design.garment)}.jpg`, 'image/jpeg')
      : null
    design.model = model
    design.template = template
    design.preview = preview
    design.defaultColors = Object.fromEntries(design.colorZones.filter(zone => zone.editable).map((zone, index) => [zone.code, ['#111311','#F3ED45','#2876FF','#F8F8F4','#EF3340'][index % 5]]))
    delete design.source
    templateProgress += 1
    if (templateProgress % 50 === 0 || templateProgress === allDesigns.length) console.log(`  Templates ${templateProgress}/${allDesigns.length}`)
  })

  const productManifests = []
  await mkdir(resolve(OUTPUT_ROOT, 'products'), { recursive:true })
  for (const product of products) {
    const availableDesigns = product.designs.filter(design => design.model && design.template)
    const styleIds = new Set(availableDesigns.map(design => `${design.section}:${design.styleCode}`))
    const activeStyles = product.styles
      .filter(style => styleIds.has(`${style.section}:${style.code}`))
      .map(style => ({ ...style, designIds:style.designIds.filter(id => availableDesigns.some(design => design.id === id)) }))
    const first = availableDesigns[0]
    const manifest = {
      schemaVersion:2,
      provider:'boombah',
      source:{
        ownerConfirmedByOperator:true,
        site:SOURCE_ORIGIN,
        builder:`${SOURCE_ORIGIN}/builders/builder3d.html?product=${encodeURIComponent(product.id)}&qs=t`,
        assetOrigins:[MODEL_ORIGIN, ASSET_ORIGIN, PREVIEW_ORIGIN],
        syncedAt
      },
      storage:{ bucket:BUCKET, root:STORAGE_ROOT, mirrored:true, hotlinked:false },
      branding:{ removed:'Boombah vendor marks, production colors, cut guides and artwork targets from synchronized templates' },
      catalog:'/designer/boombah/catalog.json',
      product:{
        id:product.id,
        name:product.name,
        sport:product.sport,
        description:product.description,
        leadTime:product.leadTime,
        type:product.type,
        minOrder:product.minOrder,
        sections:product.sections,
        styles:activeStyles,
        sizes:first?.sizes || [],
        colorCodes:first?.colorZones || [],
        defaultColors:first?.defaultColors || {},
        colors:product.colors
      },
      designs:availableDesigns,
      stats:{ styles:activeStyles.length, designs:availableDesigns.length, models:new Set(availableDesigns.map(design => design.modelId)).size }
    }
    const manifestPath = `/designer/boombah/products/${slug(product.id)}.json`
    await writeFile(resolve(ROOT, 'public', manifestPath.slice(1)), jsonBuffer(manifest))
    productManifests.push({
      id:product.id,
      name:product.name,
      sport:product.sport,
      description:product.description,
      manifest:manifestPath,
      styles:activeStyles.length,
      designs:availableDesigns.length,
      defaultDesignId:first?.id || ''
    })
  }

  const catalog = {
    schemaVersion:2,
    provider:'boombah',
    source:{ ownerConfirmedByOperator:true, site:SOURCE_ORIGIN, syncedAt },
    storage:{ bucket:BUCKET, root:STORAGE_ROOT, mirrored:true, hotlinked:false },
    modelsManifest:'/designer/boombah/models.json',
    defaultProductId:productManifests.find(product => product.id === 'FASTPITCH3D')?.id || productManifests[0]?.id || '',
    products:productManifests,
    stats:{
      products:productManifests.length,
      models:modelInventory.stats.available,
      unavailableModels:modelInventory.stats.unavailable,
      templates:productManifests.reduce((sum, product) => sum + product.designs, 0),
      uploadedFiles,
      reusedFiles,
      uploadedBytes
    }
  }
  await mkdir(OUTPUT_ROOT, { recursive:true })
  await writeFile(resolve(OUTPUT_ROOT, 'catalog.json'), jsonBuffer(catalog))
  const finalReport = { ...plan, completedAt:new Date().toISOString(), catalog:catalog.stats }
  await writeFile(REPORT_PATH, jsonBuffer(finalReport))
  console.log(`Catalog: /designer/boombah/catalog.json`)
  console.log(`Uploaded ${(uploadedBytes / 1024 / 1024).toFixed(2)} MiB in ${uploadedFiles} files; reused ${reusedFiles}.`)
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await sync()
