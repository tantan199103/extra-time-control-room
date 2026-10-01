#!/usr/bin/env node

/**
 * Import the public, non-asset catalogue shape used by 3DMockups.
 *
 * This deliberately does not download their GLB files, textures, templates,
 * scene files or brand artwork.  Each entry is adapted to a Jersevo-owned
 * Owayo/Boombah manifest so the existing /custom/design editor remains the
 * only editing surface.
 */
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeMockupCatalog, THREEDMOCKUPS_REFERENCE } from '../src/lib/mockup-workflow.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/designer/3dmockups/catalog.json')
const shouldWrite = process.argv.includes('--write')

const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const entries = [
  {
    id:'t-shirt', title:'Custom T-Shirt', category:'t-shirts', material:'Heavy cotton',
    description:'A simple tee base for front, back and sleeve artwork.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/tshirts-basic/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'owayo', productId:'tshirts-basic', manifest:'/designer/owayo/tshirts-basic/manifest.json' }
  },
  {
    id:'hoodie', title:'Custom Hoodie', category:'hoodies', material:'Heavy cotton',
    description:'A hoodie base with a bounded front and back print workflow.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/tshirts-basic/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'owayo', productId:'tshirts-basic', manifest:'/designer/owayo/tshirts-basic/manifest.json' }
  },
  {
    id:'baseball-jersey', title:'Custom Baseball Jersey', category:'jerseys', material:'Performance knit',
    description:'Teamwear base with panel-aware logo and name/number placement.', printAreas:['front-center','front-left-chest','front-right-chest','back-upper','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/cycling-c3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog/baseball-jersey',
    adapter:{ provider:'boombah', productId:'BASEBALL3D', manifest:'/designer/boombah/products/baseball3d.json' }
  },
  {
    id:'football-jersey', title:'Custom Football Jersey', category:'jerseys', material:'Performance knit',
    description:'Teamwear base with editable colour zones, patterns and roster layers.', printAreas:['front-center','back-upper','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/cycling-c3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog/football-jersey',
    adapter:{ provider:'boombah', productId:'FOOTBALL3D', manifest:'/designer/boombah/products/football3d.json' }
  },
  {
    id:'basketball-jersey', title:'Custom Basketball Jersey', category:'jerseys', material:'Performance knit',
    description:'Reversible-ready basketball base with team text and logo panels.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/cycling-c3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'boombah', productId:'BASKETBALL3D', manifest:'/designer/boombah/products/basketball3d.json' }
  },
  {
    id:'hockey-jersey', title:'Custom Hockey Jersey', category:'jerseys', material:'Performance knit',
    description:'Hockey base with front crest, sleeve mark and back roster areas.', printAreas:['front-center','front-left-chest','front-right-chest','back-upper','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/hockey-h3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'owayo', productId:'hockey-h3', manifest:'/designer/owayo/hockey-h3/manifest.json' }
  },
  {
    id:'soccer-jersey', title:'Custom Soccer Jersey', category:'jerseys', material:'Performance knit',
    description:'Breathable football/soccer base for club colours and roster details.', printAreas:['front-center','front-left-chest','front-right-chest','back-upper','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/soccer-f3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'owayo', productId:'soccer-f3', manifest:'/designer/owayo/soccer-f3/manifest.json' }
  },
  {
    id:'shorts', title:'Custom Shorts', category:'bottoms', material:'Performance knit',
    description:'A lower-body base for coordinated team kits.', printAreas:['front-center','back-center','left-sleeve','right-sleeve'], sizes,
    preview:'/designer/owayo/yoga-pants-highwaist/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'boombah', productId:'MENSPANTS3D', manifest:'/designer/boombah/products/menspants3d.json' }
  },
  {
    id:'accessories', title:'Custom Accessories', category:'accessories', material:'Mixed',
    description:'Accessory bases are available only when their exact local model is ready.', printAreas:['front-center'], sizes:[],
    preview:'/designer/owayo/cycling-c3/previews/garment-render.webp', sourceUrl:'https://www.3dmockups.app/catalog',
    adapter:{ provider:'boombah', productId:'ACCESSORIES3D', manifest:'/designer/boombah/products/accessories3d.json' }
  }
]

const catalog = normalizeMockupCatalog({
  generatedAt:new Date().toISOString(),
  entries:entries.map(entry => ({
    ...entry,
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

console.log(JSON.stringify({ output, wrote:shouldWrite, entries:catalog.entries.length, source:catalog.source }, null, 2))

