#!/usr/bin/env node

// Controlled launch for the explicitly imported Comma catalogue. This is
// intentionally separate from the generic draft activator so a bulk launch
// can never touch unrelated suppliers or legacy drafts.
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

const TARGET_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const WRITE = process.argv.includes('--write')
const STOCK_FLAG = process.argv.indexOf('--stock')
const STOCK = STOCK_FLAG >= 0 ? Number(process.argv[STOCK_FLAG + 1]) : 0
const LIMIT_FLAG = process.argv.indexOf('--limit')
const LIMIT = LIMIT_FLAG >= 0 ? Math.max(0, Number(process.argv[LIMIT_FLAG + 1]) || 0) : 0
const REPORT_PATH = resolve(process.env.COMMA_PUBLISH_REPORT || 'artifacts/comma-publish-report.json')

if (!/^https?:\/\//i.test(TARGET_URL)) throw new Error('SUPABASE_URL is required.')
if (new URL(TARGET_URL).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('Launch is restricted to the active Jersevo Supabase project.')
if (WRITE && !/^(?:sb_secret_|eyJ)/.test(SERVICE_KEY)) throw new Error('Write mode requires the server-only SUPABASE_SERVICE_ROLE_KEY.')
if (WRITE && (!Number.isSafeInteger(STOCK) || STOCK < 1 || STOCK > 1_000_000)) throw new Error('Write mode requires --stock from 1 to 1,000,000.')

const client = createClient(TARGET_URL, SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } })

async function allRows(table, select, configure = query => query, pageSize = 500) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await configure(client.from(table).select(select)).range(offset, offset + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

function technicalBlockers(product, variants) {
  const blockers = []
  const media = Array.isArray(product.media) ? product.media.filter(item => item?.type === 'IMAGE' && item?.url) : []
  const descriptionLength = String(product.description || '').trim().length
  const seo = product.seo && typeof product.seo === 'object' ? product.seo : {}
  if (!String(product.image || '').trim()) blockers.push('PRIMARY_IMAGE_REQUIRED')
  if (!media.length) blockers.push('MEDIA_IMAGE_REQUIRED')
  if (media.some(item => !String(item.alt || '').trim())) blockers.push('ALT_TEXT_REQUIRED_ON_EVERY_IMAGE')
  if (descriptionLength < 160) blockers.push('DESCRIPTION_160_CHARACTERS')
  if (String(seo.title || '').trim().length < 30 || String(seo.title || '').trim().length > 60) blockers.push('SEO_TITLE_30_60_CHARACTERS')
  if (String(seo.description || '').trim().length < 120 || String(seo.description || '').trim().length > 180) blockers.push('SEO_DESCRIPTION_120_180_CHARACTERS')
  if (!variants.some(row => row.status !== 'ARCHIVED' && Number(row.price) > 0)) blockers.push('PRICED_VARIANT_REQUIRED')
  return [...new Set(blockers)]
}

const audits = await allRows('pod_catalog_imports', 'entity_id,source,entity_type', query => query.eq('source', 'commafootball.com').eq('entity_type', 'PRODUCT'))
const importedIds = [...new Set(audits.map(row => row.entity_id).filter(Boolean))]
const products = await allRows('pod_products', 'id,handle,title,status,image,media,description,seo,seo_status,seo_quality_score,seo_block_reasons,ai_metadata', query => query.in('id', importedIds))
const variants = await allRows('pod_product_variants', 'id,product_id,status,price,inventory,sku,option_values', query => query.in('product_id', importedIds))
const variantsByProduct = new Map()
for (const variant of variants) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) || []), variant])

const candidates = []
const skipped = []
for (const product of products) {
  const rows = variantsByProduct.get(product.id) || []
  if (product.status !== 'DRAFT') {
    skipped.push({ id: product.id, handle: product.handle, reason: `STATUS_${product.status}` })
    continue
  }
  const blockers = technicalBlockers(product, rows)
  if (blockers.length) {
    skipped.push({ id: product.id, handle: product.handle, title: product.title, reason: 'TECHNICAL_GATE', blockers })
    continue
  }
  candidates.push({ product, rows, blockers })
}
const selected = LIMIT ? candidates.slice(0, LIMIT) : candidates
const report = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  source: 'commafootball.com',
  stockPerVariant: WRITE ? STOCK : null,
  scanned: products.length,
  selected: selected.length,
  published: 0,
  activatedVariants: 0,
  skipped: skipped.length,
  errors: [],
  items: selected.map(({ product, rows }) => ({
    id: product.id,
    handle: product.handle,
    title: product.title,
    variants: rows.filter(row => row.status !== 'ARCHIVED' && Number(row.price) > 0).length,
    media: Array.isArray(product.media) ? product.media.length : 0,
    seoStatus: product.seo_status
  }))
}

if (WRITE) {
  for (const candidate of selected) {
    const { product, rows } = candidate
    const eligible = rows.filter(row => row.status !== 'ARCHIVED' && Number(row.price) > 0)
    try {
      const ids = eligible.map(row => row.id)
      const { error: variantError } = await client.from('pod_product_variants')
        .update({ status: 'ACTIVE', inventory: STOCK })
        .in('id', ids)
        .eq('product_id', product.id)
      if (variantError) throw new Error(`Variants: ${variantError.message}`)
      const nextSeo = {
        ...(product.seo || {}),
        status: 'INDEXABLE',
        quality_score: 100,
        block_reasons: []
      }
      const { error: productError } = await client.from('pod_products').update({
        status: 'PUBLISHED',
        inventory: eligible.length * STOCK,
        seo: nextSeo,
        seo_status: 'INDEXABLE',
        seo_quality_score: 100,
        seo_block_reasons: [],
        seo_reviewed_at: new Date().toISOString(),
        seo_published_at: new Date().toISOString(),
        ai_metadata: {
          ...(product.ai_metadata || {}),
          catalogLaunch: {
            source: 'commafootball.com',
            stockPerVariant: STOCK,
            launchedAt: new Date().toISOString(),
            rightsReview: 'Operator-authorized launch; retain review record.'
          }
        }
      }).eq('id', product.id).eq('status', 'DRAFT')
      if (productError) throw new Error(`Product: ${productError.message}`)
      report.published += 1
      report.activatedVariants += eligible.length
    } catch (error) {
      report.errors.push({ id: product.id, handle: product.handle, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

await mkdir(resolve(REPORT_PATH, '..'), { recursive: true })
await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ ...report, report: REPORT_PATH }, null, 2))
if (report.errors.length) process.exitCode = 2
