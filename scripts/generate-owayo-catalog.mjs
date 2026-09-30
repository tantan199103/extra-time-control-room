#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OWAYO_CATALOG_GROUPS, OWAYO_CATALOG_V1, owayoCatalogSummary } from '../src/lib/owayo-catalog.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/designer/owayo/catalog.json')

const products = await Promise.all(OWAYO_CATALOG_V1.map(async product => {
  // The discovery contract intentionally starts new families as pending. Once
  // a verified family manifest exists, derive its public route from the family
  // id instead of requiring a second hand-edited flag in the source catalogue.
  // This keeps asset sync and the storefront picker in one deterministic state.
  const publicManifest = `/designer/owayo/${product.id}/manifest.json`
  const manifestPath = resolve(root, 'public', publicManifest.slice(1))
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const missingDesigns = Array.isArray(manifest.missingDesigns) ? manifest.missingDesigns : []
    const synchronizedDesigns = Array.isArray(manifest.designs) ? manifest.designs.length : 0
    const assetsReady = synchronizedDesigns > 0
      && /^READY/.test(String(manifest.syncStatus || ''))
    const manifestPreview = manifest.designs?.find(item => item?.preview)?.preview || ''
    // Prefer a same-origin checked-in cover when available. Remote Supabase
    // previews are useful during syncing, but a local URL avoids browser
    // privacy/network blockers and keeps the picker reliable after a cache.
    const previewName = manifestPreview ? String(manifestPreview).split('/').pop() : ''
    // Product-family cards need a garment render, not the raw UV texture used
    // by the 3D material loader. Capture output is generated from the exact
    // synchronized model/design and is intentionally preferred when present.
    const renderPreviewName = 'garment-render.webp'
    const localRenderPath = resolve(root, 'public', `designer/owayo/${product.id}/previews/${renderPreviewName}`)
    const localPreviewPath = previewName ? resolve(root, 'public', `designer/owayo/${product.id}/previews/${previewName}`) : ''
    let preview = manifestPreview
    if (existsSync(localRenderPath)) {
      preview = `/designer/owayo/${product.id}/previews/${renderPreviewName}`
    } else if (localPreviewPath) {
      try {
        await access(localPreviewPath)
        preview = `/designer/owayo/${product.id}/previews/${previewName}`
      } catch {}
    }
    return {
      ...product,
      // A partial source archive is kept for audit/retry, but it must not be
      // presented as a fully live family in the picker.
      assetsReady,
      manifest:assetsReady ? publicManifest : '',
      designCount:synchronizedDesigns || product.designCount,
      sizeCount:manifest.product?.sizes?.filter(item => !/choose/i.test(String(item?.name || ''))).length || product.sizeCount,
      model:manifest.product?.model || product.model,
      // The first verified design preview is the family card cover. Keeping
      // this in the discovery manifest avoids guessing a filename (road
      // families use Etape while MTB families use Derny) and prevents every
      // card from falling back to the same generic jersey image.
      preview,
      previewDesign:manifest.designs?.find(item => item?.preview)?.slug || '',
      syncStatus:manifest.syncStatus || 'READY',
      missingDesigns
    }
  } catch { return product }
}))
const summary = owayoCatalogSummary(products)
const groups = OWAYO_CATALOG_GROUPS.map(group => {
  const groupedProducts = products.filter(product => product.group === group.id)
  return {
    ...group,
    products:groupedProducts.length,
    live:groupedProducts.filter(product => product.assetsReady).length
  }
}).filter(group => group.products > 0)
const payload = {
  schemaVersion:1,
  provider:'owayo',
  generatedAt:new Date().toISOString(),
  generatedFrom:'verified-product-family-contract',
  source:'https://www.owayo.com/',
  publicBrand:'Jersevo',
  summary,
  groups,
  products:OWAYO_CATALOG_V1
}
payload.products = products

await mkdir(dirname(output), { recursive:true })
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ output, ...payload.summary }, null, 2))
