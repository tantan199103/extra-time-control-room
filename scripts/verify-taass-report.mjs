#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const source = process.argv[2]
if (!source) throw new Error('Usage: node --env-file=.env.local scripts/verify-taass-report.mjs <report.json> [--headwear]')

const report = JSON.parse(await readFile(resolve(source), 'utf8'))
const headwear = process.argv.includes('--headwear')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase server credentials are required.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const expected = new Map((report.items || []).map(item => [item.id, item]))
const issues = []
const counts = {}
function flag(kind, item, detail = '') {
  counts[kind] = (counts[kind] || 0) + 1
  if (issues.length < 30) issues.push({ kind, sourceSku: item?.sourceSku, id: item?.id, detail })
}

let checked = 0
let images = 0
let variants = 0
const ids = [...expected.keys()]
for (let offset = 0; offset < ids.length; offset += 30) {
  const batch = ids.slice(offset, offset + 30)
  let data
  let error
  for (let attempt = 0; attempt < 4; attempt += 1) {
    ;({ data, error } = await client.from('pod_products')
      .select('id,status,seo_status,type,custom_fields,media,image,price,taxonomy,ai_metadata,pod_collection_products(collection_id),pod_product_variants(id,status,inventory,price)')
      .in('id', batch))
    if (!error) break
    if (attempt === 3 || !/timeout|429|5\d\d|fetch|network/i.test(error.message || '')) break
    await new Promise(done => setTimeout(done, (attempt + 1) * 1500))
  }
  if (error) throw new Error(`Could not verify database batch at ${offset}: ${error.message}`)
  const rows = new Map((data || []).map(row => [row.id, row]))
  for (const id of batch) {
    const item = expected.get(id)
    const row = rows.get(id)
    if (!row) { flag('MISSING_LISTING', item); continue }
    checked += 1
    if (row.status !== (headwear ? 'PUBLISHED' : 'DRAFT')) flag('STATUS', item, row.status)
    if (headwear) {
      if (row.seo_status !== 'INDEXABLE') flag('SEO_STATUS', item, row.seo_status)
      if (row.type !== 'READY TO SHIP') flag('TYPE', item, row.type)
      if (!Array.isArray(row.custom_fields) || row.custom_fields.length) flag('CUSTOM_FIELDS', item)
    }
    const media = Array.isArray(row.media) ? row.media : []
    images += media.length
    if (media.length < Number(item.sourceMedia || 0)) flag('MISSING_IMAGES', item, `${media.length}/${item.sourceMedia}`)
    if (new Set(media.map(image => image.id)).size !== media.length) flag('DUPLICATE_IMAGE', item)
    if (media.some(image => !String(image.url || '').startsWith(`${url}/storage/v1/object/public/product-media/`))) flag('IMAGE_URL', item)
    if (media.length && !String(row.image || '').startsWith(`${url}/storage/v1/object/public/product-media/`)) flag('COVER_IMAGE', item)
    const rowVariants = Array.isArray(row.pod_product_variants) ? row.pod_product_variants : []
    variants += rowVariants.length
    if (rowVariants.length !== Number(item.variants)) flag('VARIANT_COUNT', item, `${rowVariants.length}/${item.variants}`)
    if (rowVariants.some(variant => variant.status !== 'ACTIVE')) flag('VARIANT_STATUS', item)
    if (rowVariants.some(variant => Number(variant.inventory) !== 1000)) flag('VARIANT_STOCK', item)
    const actualPrices = rowVariants.map(variant => Number(variant.price).toFixed(2)).sort()
    const expectedPrices = (item.variantPreview || []).map(variant => Number(variant.price).toFixed(2)).sort()
    if (JSON.stringify(actualPrices) !== JSON.stringify(expectedPrices)) flag('VARIANT_PRICE', item)
    if (Math.abs(Number(row.price) - Number(item.price)) > 0.009) flag('LISTING_PRICE', item)
    if (String(row.taxonomy?.category || '') !== String(item.taxonomy?.category || '')) flag('CATEGORY', item, row.taxonomy?.category)
    if (!Array.isArray(row.pod_collection_products) || !row.pod_collection_products.length) flag('NO_COLLECTION', item)
    const sourcePrices = Array.isArray(row.ai_metadata?.sourcePricing) ? row.ai_metadata.sourcePricing : []
    if (Number(row.ai_metadata?.priceMultiplier) !== 1 || sourcePrices.some(price => price.currency !== 'EUR')) {
      flag('SOURCE_PRICING', item)
    } else {
      const numericSourcePrices = sourcePrices.map(price => Number(price.price).toFixed(2)).sort()
      if (JSON.stringify(numericSourcePrices) !== JSON.stringify(expectedPrices)) flag('SOURCE_PRICE_1_TO_1', item)
    }
  }
  if ((offset + batch.length) % 300 < 30) console.log(`Verified ${offset + batch.length}/${ids.length} listings`)
}

const result = {
  verifiedAt: new Date().toISOString(), report: source, headwear,
  expectedListings: ids.length, checkedListings: checked,
  expectedImages: report.sourceImages, databaseImages: images,
  expectedVariants: report.variants, databaseVariants: variants,
  issueCounts: counts, issueExamples: issues
}
const target = resolve('artifacts', `${basename(source, '.json')}-db-verification.json`)
await writeFile(target, JSON.stringify(result, null, 2), 'utf8')
console.log(JSON.stringify({ ...result, issueExamples: issues.slice(0, 5), output: target }, null, 2))
if (Object.keys(counts).length) process.exitCode = 2
