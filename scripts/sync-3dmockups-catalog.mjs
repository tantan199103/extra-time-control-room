#!/usr/bin/env node

/**
 * Import the public, non-asset catalogue shape used by 3DMockups.
 *
 * This deliberately does not download their GLB files, textures, templates,
 * scene files or brand artwork. A reference entry becomes selectable only
 * when it is mapped to a local, Jersevo-owned or separately licensed manifest.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeMockupCatalog, THREEDMOCKUPS_REFERENCE } from '../src/lib/mockup-workflow.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/designer/3dmockups/catalog.json')
const shouldWrite = process.argv.includes('--write')

const apparelSizes = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL']
const jerseySizes = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'Y2XL', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
const localManifest = (provider, productId, manifest, mappingNote, { preview = '', sizes = jerseySizes, exactModel = false } = {}) => ({
  provider, productId, manifest, status:'mapped', exactModel, mappingNote, preview, sizes
})
const referenceOnly = { status:'reference-only', mappingNote:'Reference metadata only. A licensed Jersevo model is required before this item can open in the editor.' }

async function manifestPreview(manifest) {
  if (!manifest || !manifest.startsWith('/designer/')) return ''
  try {
    const value = JSON.parse(await readFile(resolve(root, 'public', manifest.slice(1)), 'utf8'))
    const candidate = (Array.isArray(value.designs) ? value.designs : []).find(item => item?.preview)
    const preview = typeof candidate?.preview === 'string' ? candidate.preview : candidate?.preview?.uri
    return /^https:\/\/[^/]+\.supabase\.co\//i.test(String(preview || '')) ? String(preview) : ''
  } catch {
    return ''
  }
}
const entries = [
  {
    id:'oversized-tee', title:'Oversized Tee', category:'t-shirts', material:'Heavy cotton',
    description:'Drop-shoulder heavyweight tee with front, back and sleeve all-over print areas.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes,
    sourceUrl:'https://www.3dmockups.app/catalog/oversized-tshirt',
    adapter:localManifest('owayo','tshirts-basic','/designer/owayo/tshirts-basic/manifest.json','Jersevo T-Shirt Basic equivalent; source model is not copied.', { preview:'/designer/owayo/tshirts-basic/previews/garment-render.webp', sizes:apparelSizes })
  },
  {
    id:'bella-canvas-3001-tee', title:'Bella + Canvas 3001 Tee', category:'t-shirts', material:'Retail cotton',
    description:'Retail-fit tee with localized print areas.', printAreas:['front-center','back-center'], sizes:['S','M','L','XL','2XL'], sourceUrl:'https://www.3dmockups.app/catalog/bella-canvas-3001',
    adapter:localManifest('owayo','tshirts-basic','/designer/owayo/tshirts-basic/manifest.json','Jersevo T-Shirt Basic equivalent; manufacturer model is not copied.', { preview:'/designer/owayo/tshirts-basic/previews/garment-render.webp', sizes:['S','M','L','XL','2XL'] })
  },
  {
    id:'hoodie', title:'Hoodie', category:'hoodies', material:'Fleece',
    description:'Pullover hoodie with kangaroo pocket and fleece lining.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog/hoodie', adapter:referenceOnly
  },
  {
    id:'walking-tee', title:'Walking Tee', category:'t-shirts', material:'Performance fabric',
    description:'Lightweight tee base for all-over graphics.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'tee-on-hanger', title:'Tee on Hanger', category:'t-shirts', material:'Cotton',
    description:'Flat presentation tee for product artwork review.', printAreas:['front-center','back-center'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'button-shirt', title:'Button Shirt', category:'t-shirts', material:'Performance fabric',
    description:'Camp-collar short-sleeve shirt with a relaxed drape.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'baseball-jersey', title:'Baseball Jersey', category:'jerseys', material:'Performance knit',
    description:'Full-button baseball jersey with teamwear name, number and logo panels.', printAreas:['front-center','front-left-chest','front-right-chest','back-upper','back-center','left-sleeve','right-sleeve'], sizes:jerseySizes, sourceUrl:'https://www.3dmockups.app/catalog/baseball-jersey',
    adapter:localManifest('boombah','BASEBALL3D','/designer/boombah/products/baseball3d.json','Jersevo Boombah baseball equivalent; source model is not copied.')
  },
  {
    id:'football-jersey', title:'Football Jersey', category:'jerseys', material:'Performance knit',
    description:'Football jersey with editable colour zones, patterns and roster layers.', printAreas:['front-center','back-upper','back-center','left-sleeve','right-sleeve'], sizes:jerseySizes, sourceUrl:'https://www.3dmockups.app/catalog/football-jersey',
    adapter:localManifest('boombah','FOOTBALL3D','/designer/boombah/products/football3d.json','Jersevo Boombah football equivalent; source model is not copied.')
  },
  {
    id:'basketball-jersey', title:'Basketball Jersey', category:'jerseys', material:'Performance knit',
    description:'Sleeveless basketball jersey with team text, logo and roster panels.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:jerseySizes, sourceUrl:'https://www.3dmockups.app/catalog/basketball-jersey',
    adapter:localManifest('boombah','BASKETBALL3D','/designer/boombah/products/basketball3d.json','Jersevo Boombah basketball equivalent; source model is not copied.')
  },
  {
    id:'youth-crew-tee', title:'Youth Crew Tee', category:'t-shirts', material:'Soft cotton',
    description:'Youth crew-neck tee with a compact size run.', printAreas:['front-center','back-center'], sizes:['YXS','YS','YM','YL','YXL','Y2XL','Y3XL'], sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:localManifest('owayo','tshirts-basic','/designer/owayo/tshirts-basic/manifest.json','Jersevo T-Shirt Basic equivalent; youth source model is not copied.', { preview:'/designer/owayo/tshirts-basic/previews/garment-render.webp', sizes:['YXS','YS','YM','YL','YXL','Y2XL','Y3XL'] })
  },
  {
    id:'cotton-shorts', title:'Cotton Shorts', category:'bottoms', material:'Cotton',
    description:'Elastic-waist shorts with side pockets and all-over print.', printAreas:['front-center','back-center'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog/cotton-shorts', adapter:referenceOnly
  },
  {
    id:'wide-leg-pants', title:'Wide-Leg Pants', category:'bottoms', material:'Flowing woven fabric',
    description:'High-rise, full-length wide-leg pants.', printAreas:['front-center','back-center'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'wide-leg-unisex', title:'Wide-Leg Unisex', category:'bottoms', material:'Woven fabric',
    description:'Relaxed unisex wide-leg trouser base.', printAreas:['front-center','back-center'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'cotton-sweatshirt', title:'Cotton Sweatshirt', category:'hoodies', material:'Brushed fleece',
    description:'Crewneck sweatshirt with ribbed collar and cuffs.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'oversized-cotton-hoodie', title:'Oversized Cotton Hoodie', category:'hoodies', material:'Heavy cotton',
    description:'Oversized cotton hoodie for a relaxed streetwear fit.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes:apparelSizes, sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'crop-top', title:'Crop Top', category:'t-shirts', material:'Cotton',
    description:'Cropped fitted top with all-over print.', printAreas:['front-center','back-center'], sizes:['XS','S','M','L','XL'], sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  },
  {
    id:'custom-socks', title:'Custom Socks', category:'accessories', material:'Nylon and spandex',
    description:'Crew socks printed from toe to cuff.', printAreas:['front-center'], sizes:['Youth','Intermediate','Adult'], sourceUrl:'https://www.3dmockups.app/catalog/custom-socks',
    adapter:localManifest('boombah','SOCKS3D','/designer/boombah/products/socks3d.json','Jersevo Boombah team-sock equivalent; source model is not copied.', { sizes:['Y','I','A'] })
  },
  {
    id:'baseball-cap', title:'Baseball Cap', category:'accessories', material:'Structured cap',
    description:'Structured cap base for a future approved accessory model.', printAreas:['front-center'], sizes:[], sourceUrl:'https://www.3dmockups.app/catalog', adapter:referenceOnly
  }
]

// This is a manually verified metadata snapshot, not an asset scraper.  The
// source pages are retained for provenance while all previews/models remain
// Jersevo-owned or separately licensed assets.
const SOURCE_VERIFIED_AT = '2026-10-02'
const sourceMeta = {
  'walking-tee': { sourceUrl:'https://www.3dmockups.app/catalog/walking-tshirt', sourceSlug:'walking-tshirt' },
  'tee-on-hanger': { sourceUrl:'https://www.3dmockups.app/catalog/tshirt-on-hanger', sourceSlug:'tshirt-on-hanger' },
  'button-shirt': { sourceUrl:'https://www.3dmockups.app/catalog/button-shirt', sourceSlug:'button-shirt', sourcePrintAreas:['front','back','sleeves','collar'] },
  'hoodie': { sourcePrintAreas:['front','back','sleeves','hood','pocket'] },
  'youth-crew-tee': { sourceUrl:'https://www.3dmockups.app/catalog/youth-crew-tee', sourceSlug:'youth-crew-tee', sourcePrintAreas:['front','back','sleeves','collar'] },
  'baseball-jersey': { sourcePrintAreas:['front','back','left-sleeve','right-sleeve'] },
  'football-jersey': { sourcePrintAreas:['front','back','sleeves','yoke','shoulders'] },
  'basketball-jersey': { printAreas:['front-center','back-center'], sourcePrintAreas:['front','back','left-sleeve','right-sleeve','sides'] },
  'cotton-shorts': { sourcePrintAreas:['front','back','pocket'] },
  'wide-leg-pants': { sourceUrl:'https://www.3dmockups.app/catalog/wide-leg-pants', sourceSlug:'wide-leg-pants' },
  'wide-leg-unisex': { sourceUrl:'https://www.3dmockups.app/catalog/wide-leg-pants-unisex', sourceSlug:'wide-leg-pants-unisex' },
  'cotton-sweatshirt': { sourceUrl:'https://www.3dmockups.app/catalog/cotton-sweatshirt', sourceSlug:'cotton-sweatshirt' },
  'oversized-cotton-hoodie': { sourceUrl:'https://www.3dmockups.app/catalog/oversized-cotton-hoodie', sourceSlug:'oversized-cotton-hoodie' },
  'crop-top': { sourceUrl:'https://www.3dmockups.app/catalog/crop-top', sourceSlug:'crop-top' },
  'custom-socks': { sourcePrintAreas:['front','back'] },
  'baseball-cap': { sourceUrl:'https://www.3dmockups.app/catalog/baseball-cap', sourceSlug:'baseball-cap' }
}
for (const entry of entries) {
  Object.assign(entry, sourceMeta[entry.id] || {})
  entry.sourceSlug ||= entry.id
  entry.sourceVerifiedAt = SOURCE_VERIFIED_AT
  entry.sourceEvidence = 'Public 3DMockups catalog metadata manually verified; no third-party model, texture, template or preview copied.'
}

for (const entry of entries) {
  if (entry.adapter?.provider && !entry.adapter.preview) entry.adapter.preview = await manifestPreview(entry.adapter.manifest)
}

const catalog = normalizeMockupCatalog({
  generatedAt:new Date().toISOString(),
  entries:entries.map(entry => ({
    ...entry,
    preview:entry.adapter?.preview || '',
    adapter:entry.adapter?.provider ? entry.adapter : undefined,
    sourceProvider:THREEDMOCKUPS_REFERENCE.provider,
    licenseStatus:THREEDMOCKUPS_REFERENCE.licenseStatus,
    assetPolicy:THREEDMOCKUPS_REFERENCE.assetPolicy
  }))
})

// Make stale adapter mappings visible during development without touching any
// external asset. A missing local preview is a data warning, not a download.
for (const entry of catalog.entries) {
  if (!entry.preview?.startsWith('/')) continue
  try { await access(resolve(root, 'public', entry.preview.slice(1))) }
  catch { entry.preview = '' }
}

if (shouldWrite) {
  await mkdir(dirname(output), { recursive:true })
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
}

console.log(JSON.stringify({
  output,
  wrote:shouldWrite,
  entries:catalog.entries.length,
  mapped:catalog.entries.filter(entry => entry.adapter?.status === 'mapped').length,
  referenceOnly:catalog.entries.filter(entry => !entry.adapter || entry.adapter.status === 'reference-only').length,
  source:catalog.source
}, null, 2))
