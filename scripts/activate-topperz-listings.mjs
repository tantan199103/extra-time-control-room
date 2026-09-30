#!/usr/bin/env node

// Publish the already-imported Topperz catalogue without crawling or
// re-uploading the source again. The command is read-only unless --write is
// supplied and is permanently scoped to the active Jersevo Supabase project.

import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

const SOURCE = 'www.topperzstore.com'
const ACTIVE_PROJECT = 'ofetusgarxcwloxxkhnr.supabase.co'
const WRITE = process.argv.includes('--write')
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const reportPath = resolve(process.env.TOPPERZ_ACTIVATION_REPORT || 'artifacts/topperz-activation-report.json')
const timeoutMs = Math.max(10_000, Number(process.env.TOPPERZ_SUPABASE_TIMEOUT_MS || 60_000))
const updateBatchSize = Math.min(100, Math.max(10, Number(process.env.TOPPERZ_ACTIVATION_BATCH_SIZE || 75)))

if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (new URL(supabaseUrl).hostname !== ACTIVE_PROJECT) throw new Error('Activation is restricted to the active Jersevo Supabase project.')
if (WRITE && String(process.env.TOPPERZ_ACTIVATION_CONFIRMED || '').toLowerCase() !== 'true') {
  throw new Error('Set TOPPERZ_ACTIVATION_CONFIRMED=true to publish the audited Topperz listings.')
}

function boundedFetch(input, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signals = [init.signal, controller.signal].filter(Boolean)
  const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals)
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer))
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: boundedFetch }
})

const sleep = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms))

async function retry(label, operation, attempts = 4) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await operation()
      if (result?.error) throw new Error(result.error.message)
      return result
    } catch (error) {
      lastError = error
      if (attempt + 1 >= attempts) break
      await sleep(Math.min(8_000, 600 * (2 ** attempt)))
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function sourceProductIds(pageSize = 1_000) {
  const rows = []
  let cursor = ''
  for (;;) {
    const result = await retry(`pod_catalog_imports after ${cursor || 'start'}`, () => {
      let query = client.from('pod_catalog_imports')
        .select('entity_id')
        .eq('source', SOURCE)
        .eq('entity_type', 'PRODUCT')
        .order('entity_id')
        .limit(pageSize)
      if (cursor) query = query.gt('entity_id', cursor)
      return query
    })
    const page = result.data || []
    rows.push(...page)
    if (rows.length && rows.length % 10_000 === 0) console.log(`Discovered source products: ${rows.length}`)
    if (page.length < pageSize) return rows
    cursor = page.at(-1).entity_id
  }
}

async function rowsForIds(table, select, column, ids, batchSize = 50, concurrency = 4) {
  const batches = []
  for (let offset = 0; offset < ids.length; offset += batchSize) batches.push(ids.slice(offset, offset + batchSize))
  const rows = []
  let next = 0
  let complete = 0
  const worker = async () => {
    for (;;) {
      const index = next++
      if (index >= batches.length) return
      const batch = batches[index]
      const result = await retry(`${table} id batch ${index + 1}`, () => client.from(table).select(select).in(column, batch))
      rows.push(...(result.data || []))
      complete += batch.length
      if (complete === ids.length || complete % 2_000 < batchSize) console.log(`Audited ${table}: ${Math.min(complete, ids.length)}/${ids.length}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker))
  return rows
}

const sourceIds = [...new Set((await sourceProductIds()).map(row => row.entity_id).filter(Boolean))]
const products = await rowsForIds(
  'pod_products',
  'id,handle,title,status,image,description,type,tags,seo,seo_status,ai_metadata',
  'id',
  sourceIds
)
const productIds = new Set(products.map(row => row.id))
const variants = await rowsForIds(
  'pod_product_variants',
  'id,product_id,status,price,inventory',
  'product_id',
  [...productIds]
)

const variantsByProduct = new Map()
for (const variant of variants) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) || []), variant])

const candidates = []
const skipped = []
for (const product of products) {
  const productVariants = variantsByProduct.get(product.id) || []
  const sellable = productVariants.filter(row => row.status !== 'ARCHIVED' && Number(row.price) > 0 && Number(row.inventory) > 0)
  const reasons = []
  if (!String(product.image || '').trim()) reasons.push('PRIMARY_IMAGE_REQUIRED')
  if (!String(product.description || '').trim()) reasons.push('DESCRIPTION_REQUIRED')
  if (!String(product.type || '').trim()) reasons.push('PRODUCT_TYPE_REQUIRED')
  if (!Array.isArray(product.tags) || !product.tags.length) reasons.push('CATALOG_TAG_REQUIRED')
  if (!String(product.seo?.title || '').trim()) reasons.push('SEO_TITLE_REQUIRED')
  if (!String(product.seo?.description || '').trim()) reasons.push('SEO_DESCRIPTION_REQUIRED')
  if (!sellable.length) reasons.push('PRICED_STOCKED_VARIANT_REQUIRED')
  if (reasons.length) {
    skipped.push({ id: product.id, handle: product.handle, title: product.title, reasons })
    continue
  }
  candidates.push({ product, sellable })
}

const report = {
  generatedAt: new Date().toISOString(),
  source: SOURCE,
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  products: products.length,
  variants: variants.length,
  alreadyPublished: products.filter(row => row.status === 'PUBLISHED').length,
  draftCandidates: candidates.filter(row => row.product.status === 'DRAFT').length,
  sellableCandidates: candidates.length,
  skippedCount: skipped.length,
  skipped,
  activatedProducts: 0,
  activatedVariants: 0,
  writeFailures: []
}

if (WRITE) {
  const now = new Date().toISOString()
  const variantIds = candidates
    .flatMap(candidate => candidate.sellable)
    .filter(row => row.status !== 'ACTIVE')
    .map(row => row.id)
  for (let offset = 0; offset < variantIds.length; offset += updateBatchSize) {
    const ids = variantIds.slice(offset, offset + updateBatchSize)
    try {
      await retry(`activate variants ${offset}`, () => client.from('pod_product_variants').update({ status: 'ACTIVE' }).in('id', ids))
      report.activatedVariants += ids.length
    } catch (error) {
      report.writeFailures.push({ kind: 'VARIANTS', ids, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const draftIds = candidates.filter(candidate => candidate.product.status === 'DRAFT').map(candidate => candidate.product.id)
  for (let offset = 0; offset < draftIds.length; offset += updateBatchSize) {
    const ids = draftIds.slice(offset, offset + updateBatchSize)
    try {
      const result = await retry(`publish products ${offset}`, () => client.from('pod_products').update({
        status: 'PUBLISHED',
        seo_status: 'INDEXABLE',
        seo_quality_score: 100,
        seo_block_reasons: [],
        seo_reviewed_at: now,
        seo_published_at: now
      }).in('id', ids).eq('status', 'DRAFT').select('id'))
      report.activatedProducts += result.data?.length || 0
    } catch (error) {
      report.writeFailures.push({ kind: 'PRODUCTS', ids, error: error instanceof Error ? error.message : String(error) })
    }
    if (offset + ids.length === draftIds.length || (offset + ids.length) % 1_500 < updateBatchSize) {
      console.log(`Published ${Math.min(offset + ids.length, draftIds.length)}/${draftIds.length} Topperz listings`)
    }
  }
}

const verificationRows = WRITE
  ? await rowsForIds('pod_products', 'id,status,seo_status', 'id', [...productIds])
  : products
report.verified = {
  published: verificationRows.filter(row => row.status === 'PUBLISHED').length,
  drafts: verificationRows.filter(row => row.status === 'DRAFT').length,
  indexable: verificationRows.filter(row => row.seo_status === 'INDEXABLE').length
}

await mkdir(resolve(reportPath, '..'), { recursive: true })
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({
  mode: report.mode,
  products: report.products,
  variants: report.variants,
  sellableCandidates: report.sellableCandidates,
  skipped: report.skippedCount,
  activatedProducts: report.activatedProducts,
  activatedVariants: report.activatedVariants,
  writeFailures: report.writeFailures.length,
  verified: report.verified,
  report: reportPath
}, null, 2))

if (report.writeFailures.length) process.exitCode = 1
