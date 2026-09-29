#!/usr/bin/env node

// Compare the owner-authorized Shopify snapshot with the imported Supabase
// rows. This is intentionally read-only and is used after a large/resumable
// import to identify missing listings, media and non-1000 SKU stock.
import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { stableId } from './fangear-import-lib.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const name = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[name]) process.env[name] = value
  }
}

const base = String(process.env.LIDSHD_SOURCE_BASE_URL || 'https://www.lidshd.com').replace(/\/+$/, '')
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const reportPath = resolve(process.env.LIDSHD_AUDIT_REPORT || 'artifacts/lidshd-sync-audit.json')
const chunkSize = 50

async function fetchProducts() {
  const rows = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(`${base}/products.json?limit=250&page=${page}&currency=USD`, { headers: { accept: 'application/json', 'user-agent': 'Jersevo-authorized-catalog-audit/1.0' } })
    if (!response.ok) throw new Error(`Source request ${response.status}`)
    const batch = (await response.json())?.products || []
    rows.push(...batch)
    if (!batch.length || batch.length < 250) return rows
  }
}

async function fetchImports(client) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('pod_catalog_imports').select('source_entity_id,entity_id').eq('source', 'lidshd.com').eq('entity_type', 'PRODUCT').order('source_entity_id', { ascending: true }).range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) return rows
  }
}

async function run() {
  if (!/^https?:\/\//i.test(supabaseUrl) || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  const client = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const source = await fetchProducts()
  const imports = await fetchImports(client)
  const importBySource = new Map()
  for (const row of imports) importBySource.set(String(row.source_entity_id), row.entity_id)
  const ids = [...new Set(source.map(product => stableId('listing', `lidshd-product:${product.id}`)))]
  const products = new Map()
  const variants = []
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const batch = ids.slice(offset, offset + chunkSize)
    const p = await client.from('pod_products').select('id,status,image,media,inventory').in('id', batch)
    if (p.error) throw p.error
    for (const row of p.data || []) products.set(row.id, row)
    const v = await client.from('pod_product_variants').select('id,product_id,status,inventory,price').in('product_id', batch)
    if (v.error) throw v.error
    variants.push(...(v.data || []))
  }
  const missingListings = []
  const missingMedia = []
  for (const product of source) {
    const id = stableId('listing', `lidshd-product:${product.id}`)
    const row = products.get(id)
    if (!row) { missingListings.push({ sourceId: String(product.id), id, title: product.title }); continue }
    const stored = new Set((Array.isArray(row.media) ? row.media : []).map(item => String(item?.id || '')))
    const expected = (product.images || []).map((image, index) => stableId('media', `lidshd-media:${product.id}:${image.id || image.src || index}`, 20))
    const missing = expected.filter(mediaId => !stored.has(mediaId))
    if (missing.length) missingMedia.push({ sourceId: String(product.id), id, title: product.title, expected: expected.length, stored: stored.size, missing: missing.length })
  }
  const report = {
    generatedAt: new Date().toISOString(), sourceProducts: source.length, importedProducts: products.size,
    publishedProducts: [...products.values()].filter(row => row.status === 'PUBLISHED').length,
    missingListings, missingMedia,
    sourceImages: source.reduce((sum, product) => sum + (product.images || []).length, 0),
    storedMedia: [...products.values()].reduce((sum, row) => sum + (Array.isArray(row.media) ? row.media.length : 0), 0),
    variants: variants.length,
    activeVariants: variants.filter(row => row.status === 'ACTIVE').length,
    stock1000: variants.filter(row => Number(row.inventory) === 1000).length,
    stockMismatches: variants.filter(row => Number(row.inventory) !== 1000).length,
    inactiveVariants: variants.filter(row => row.status !== 'ACTIVE').length,
    zeroPriceVariants: variants.filter(row => Number(row.price) <= 0).length,
    sourceImportRows: imports.length,
    sourceIdsWithoutAudit: source.filter(product => !importBySource.has(String(product.id))).map(product => String(product.id))
  }
  await mkdir(resolve(reportPath, '..'), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2))
  if (missingListings.length || missingMedia.length || report.stockMismatches || report.inactiveVariants) process.exitCode = 2
}

run().catch(error => { console.error(`Lids HD sync audit failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 })
