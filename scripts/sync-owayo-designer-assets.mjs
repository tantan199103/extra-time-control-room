import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { OWAYO_BRAND_COLOR_CODES, brandColorIndices, stripOwayoBranding } from './strip-owayo-branding.mjs'
import { catalogRequestHeaders } from './http-user-agent.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(root, 'public', 'designer', 'owayo', 'cycling-c3')
const sourcePage = 'https://www.owayo.com/konfigurator_html/?color=RDY47588493&design=Etape&land=us&lang=en&product=bikejerseys&sport=cycling'
const sourceOrigin = 'https://www.owayo.com'
const assetOrigin = 'https://static.owayo-cdn.com'
function selectedDesignNames() {
  const flag = process.argv.find(value => value.startsWith('--designs='))
  if (!flag) return null
  return flag.slice('--designs='.length).split(',').map(value => value.trim()).filter(Boolean)
}

function publicPath(path) {
  return `/${relative(resolve(root, 'public'), path).split(sep).join('/')}`
}

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function fetchBuffer(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: catalogRequestHeaders({ accept: '*/*', ...init.headers })
  })
  if (!response.ok) throw new Error(`Asset request failed (${response.status}) ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

async function fetchJson(url, init = {}) {
  const buffer = await fetchBuffer(url, init)
  return JSON.parse(buffer.toString('utf8'))
}

async function writeAsset(path, buffer, checksums) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
  checksums[publicPath(path)] = { bytes: buffer.byteLength, sha256: sha256(buffer) }
  return publicPath(path)
}

function normalizeJsonAsset(buffer) {
  try {
    return Buffer.from(`${JSON.stringify(JSON.parse(buffer.toString('utf8')))}\n`)
  } catch {
    return buffer
  }
}

function readBootstrap(html) {
  const match = html.match(/window\.infoFromGetParametersCached\s*=\s*JSON\.parse\('([\s\S]*?)'\);/)
  if (!match) throw new Error('Owayo configurator bootstrap data was not found.')
  return JSON.parse(match[1].replace(/\\'/g, "'"))
}

function selectedFeatures(featureObjects = []) {
  return featureObjects.flatMap(featureObject => {
    const feature = featureObject.Features?.find(item => item.Feature === featureObject.StandardFeature)
      || featureObject.Features?.[0]
    if (!feature) return []
    return [{
      featuredObject: featureObject.FeaturedObject,
      feature: feature.Feature,
      name: feature.Name,
      abkuerzung: feature.Kuerzel,
      einzublendendeDreiDParts: feature.einzublendendeDreiDParts,
      imKonfiBeiDerProduktuebersichtAuswaehlbar: feature.imKonfiBeiDerProduktuebersichtAuswaehlbar,
      imKonfiVerstecktesAberFuerPreisberechnungRelevantesFeature: feature.imKonfiVerstecktesAberFuerPreisberechnungRelevantesFeature,
      isFeaturedObjectSichtbarLautDBAbfrage: featureObject.zeigeZugehoerigeFeatureBeiFeatureAuswahlAn,
      VorbelegungPreisanzeige: 1
    }]
  })
}

async function productMetadata(bootstrap) {
  const product = bootstrap.productInfo
  const body = new URLSearchParams({
    schnitt: product.schnitt,
    sport: product.sport.auwi,
    websport: bootstrap.sportFuerProduktauswahl?.webNormalized || 'radsport',
    ordertype: product.ordertype,
    webProduct: product.product.webNormalized,
    iso: bootstrap.lang || 'en',
    produktAuwi: product.product.auwi,
    showUnpublishedDesigns: '',
    features: JSON.stringify(selectedFeatures(product.featureObjects))
  })
  return fetchJson(`${sourceOrigin}/konfigurator_php/auswahlmodul/produkt.php`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      origin: sourceOrigin,
      referer: sourcePage
    },
    body
  })
}

// Owayo's .fish files are ordinary ZIP containers. Keeping this small parser
// in the sync job avoids shipping a ZIP dependency to every storefront visit.
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
    if (flags & 0x08) throw new Error('ZIP data descriptors are not supported by this bounded asset sync.')
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null
    if (!data) throw new Error(`Unsupported ZIP compression method ${method} in ${name}`)
    if (data.length !== uncompressedSize) throw new Error(`Unexpected uncompressed size for ${name}`)
    entries.push({ name, data: Buffer.from(data) })
    offset = dataStart + compressedSize
  }
  if (!entries.length) throw new Error('No files were found in the design archive.')
  return entries
}

function normalizedPartName(filename, designName) {
  const base = filename.slice(0, -extname(filename).length)
  return base.replace(new RegExp(`^${designName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_`, 'i'), '')
}

async function renderDesignPreview(mask, product) {
  const { data, info } = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  const defaults = product.ColorCodeFarbVorbelegungen || {}
  const featured = { A:0x111311, B:0xF3ED45, C:0x2876FF, D:0xEF3340, E:0xF8F8F4, K:0x111311 }
  const palette = new Map((product.colorCodes || []).map(color => {
    const value = featured[color.colorCode] ?? Number(defaults[color.colorCode] ?? 0xF8F8F4)
    return [Number(color.ColorCodeNr), [value >> 16 & 255, value >> 8 & 255, value & 255]]
  }))
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = palette.get(data[offset])
    if (!color) continue
    data[offset] = color[0]
    data[offset + 1] = color[1]
    data[offset + 2] = color[2]
  }
  return sharp(data, { raw:info })
    .resize(360, 240, { fit:'contain', background:{ r:244, g:245, b:242, alpha:1 } })
    .webp({ quality:82, effort:5 })
    .toBuffer()
}

async function sync() {
  const checksums = {}
  const bootstrapHtml = (await fetchBuffer(sourcePage)).toString('utf8')
  const bootstrap = readBootstrap(bootstrapHtml)
  const product = await productMetadata(bootstrap)
  const cut = product.Schnitt
  const model = product.model
  if (!cut || !model) throw new Error('The product endpoint did not return a cut/model pair.')

  const modelRootUrl = `${assetOrigin}/modelle/${encodeURIComponent(cut)}/${encodeURIComponent(model)}`
  const modelGzip = await fetchBuffer(`${modelRootUrl}/${encodeURIComponent(model)}.mirl`)
  const modelBinary = gunzipSync(modelGzip)
  const modelPath = await writeAsset(join(outputRoot, 'model', `${model}.mirl.bin`), modelBinary, checksums)

  const supportFiles = {}
  for (const filename of ['parts.json', 'sperrbezirke.json', 'teilungslinien.json']) {
    const buffer = normalizeJsonAsset(await fetchBuffer(`${modelRootUrl}/${filename}`))
    supportFiles[filename] = await writeAsset(join(outputRoot, 'model', filename), buffer, checksums)
  }

  const selectedNames = selectedDesignNames()
  const requested = selectedNames ? new Set(selectedNames.map(value => value.toLowerCase())) : null
  const availableDesigns = Array.isArray(product.Designs) ? product.Designs : []
  const chosenDesigns = availableDesigns.filter(item => !requested || requested.has(String(item.Design || '').toLowerCase()))
  if (!chosenDesigns.length) throw new Error('None of the requested designs exists for this product.')

  const designs = []
  for (const design of chosenDesigns) {
    const name = design.Design
    const designSlug = slug(name)
    const archiveUrl = `${modelRootUrl}/designs/${encodeURIComponent(name)}.fish`
    const archive = await fetchBuffer(archiveUrl)
    const entries = unzipEntries(archive).filter(entry => entry.name.toLowerCase().endsWith('.png'))
    const textures = {}
    for (const entry of entries) {
      const safeName = entry.name.split(/[\\/]/).at(-1)
      // Remove only the vendor's printed marks from the indexed mask.  Keep
      // technical artwork such as ULTRADRY and the 3D design label intact.
      const cleaned = await stripOwayoBranding(entry.data, product.colorCodes, { optimize:true })
      entry.data = cleaned.buffer
      const path = await writeAsset(join(outputRoot, 'designs', designSlug, safeName), cleaned.buffer, checksums)
      textures[normalizedPartName(safeName, name)] = path
    }
    // The legacy preview path currently redirects between case variants on
    // the CDN and finishes as a 404. Derive a compact local swatch from the
    // encoded front texture; the live Three.js stage remains authoritative.
    const previewMask = entries.find(entry => /FrontRightPart\.png$/i.test(entry.name))?.data || entries[0].data
    const preview = await writeAsset(join(outputRoot, 'previews', `${designSlug}.webp`), await renderDesignPreview(previewMask, product), checksums)
    const snapLinesUrl = `${sourceOrigin}/konfigurator_php/designmodul/getSnapLines.php?${new URLSearchParams({ cut, model, design: name })}`
    const snapLines = await writeAsset(join(outputRoot, 'designs', designSlug, 'snap-lines.json'), await fetchBuffer(snapLinesUrl, { headers: { referer: sourcePage } }), checksums)
    designs.push({
      name,
      slug: designSlug,
      preview,
      textures,
      snapLines,
      baseColors: design.baseColors || [],
      outlinedColors: String(design.ColorCodesWithOutline || '').split(',').filter(Boolean)
    })
    process.stdout.write(`Synced ${name} (${entries.length} textures)\n`)
  }

  const metadata = {
    schemaVersion: 1,
    source: {
      ownerConfirmedByOperator: true,
      configurator: sourcePage,
      productEndpoint: `${sourceOrigin}/konfigurator_php/auswahlmodul/produkt.php`,
      assetOrigin,
      syncedAt: new Date().toISOString()
    },
    product: {
      name: product.Name,
      publicSlug: product.Urlname,
      normalizedSlug: product.webproduktNormalized,
      orderType: product.Ordertype,
      cut,
      model,
      baseModel: product.Basemodel,
      baseDesign: product.BasisDesign,
      sizes: product.Sizes || [],
      minimumOrder: Number(product.MindestBestellung || 1),
      maximumOrder: Number(product.MaximalBestellung || 250),
      droppableParts: product.namesOfDroppableParts || [],
      colorCodes: product.colorCodes || [],
      defaultColors: product.ColorCodeFarbVorbelegungen || []
    },
    branding: {
      removed: 'Owayo vendor marks and technical source labels from synchronized mask textures',
      colorCodes: [...OWAYO_BRAND_COLOR_CODES],
      colorIndices: [...brandColorIndices(product.colorCodes)]
    },
    model: {
      format: 'mirl-v1.1-uncompressed',
      uri: modelPath,
      parts: supportFiles['parts.json'],
      restrictedZones: supportFiles['sperrbezirke.json'],
      seamLines: supportFiles['teilungslinien.json']
    },
    designs,
    availableDesigns: availableDesigns.map(item => item.Design),
    checksums
  }
  const manifestBuffer = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`)
  await writeFile(join(outputRoot, 'manifest.json'), manifestBuffer)
  process.stdout.write(`Manifest: ${publicPath(join(outputRoot, 'manifest.json'))}\n`)
  process.stdout.write(`Assets: ${Object.keys(checksums).length}, ${(Object.values(checksums).reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(2)} MiB\n`)
}

await sync()
