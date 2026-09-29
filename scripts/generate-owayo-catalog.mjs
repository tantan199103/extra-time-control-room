#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OWAYO_CATALOG_V1, owayoCatalogSummary } from '../src/lib/owayo-catalog.js'

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
      && manifest.syncStatus !== 'PARTIAL'
      && missingDesigns.length === 0
    return {
      ...product,
      // A partial source archive is kept for audit/retry, but it must not be
      // presented as a fully live family in the picker.
      assetsReady,
      manifest:assetsReady ? publicManifest : '',
      designCount:synchronizedDesigns || product.designCount,
      sizeCount:manifest.product?.sizes?.filter(item => !/choose/i.test(String(item?.name || ''))).length || product.sizeCount,
      model:manifest.product?.model || product.model,
      syncStatus:manifest.syncStatus || 'READY',
      missingDesigns
    }
  } catch { return product }
}))
const summary = owayoCatalogSummary(products)
const payload = {
  schemaVersion:1,
  provider:'owayo',
  generatedAt:new Date().toISOString(),
  generatedFrom:'verified-product-family-contract',
  source:'https://www.owayo.com/cycling/products-us.htm',
  publicBrand:'Jersevo',
  summary,
  products:OWAYO_CATALOG_V1
}
payload.products = products

await mkdir(dirname(output), { recursive:true })
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ output, ...payload.summary }, null, 2))
