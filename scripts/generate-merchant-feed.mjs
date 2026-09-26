#!/usr/bin/env node

// Build a complete, static Merchant Center feed.  The request-time API used
// to ask PostgREST for one large page; Supabase caps that response at 1,000
// rows regardless of the requested limit.  This job uses keyset pagination,
// verifies an exact count, and only then publishes the XML/TSV files.

import fs from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import {
  buildGoogleMerchantCatalogue,
  renderGoogleMerchantTsv,
  renderGoogleMerchantXml
} from '../src/lib/google-merchant.js'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  try {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {}
}

const rawUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabaseUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, '') : ''
const apiKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || ''
).trim()
const outputDirectory = resolve(process.env.MERCHANT_FEED_OUTPUT_DIR || 'dist/feeds')
const pageSize = 500
const siteOrigin = new URL(process.env.SITE_URL || process.env.VITE_SITE_URL || 'https://www.jersevo.com').origin
const gzipAsync = promisify(gzip)
const PLAIN_STATIC_LIMIT = 90 * 1024 * 1024
const PLAIN_TSV_LIMIT = 20 * 1024 * 1024

const PRODUCT_SELECT = [
  'id', 'handle', 'title', 'subtitle', 'description', 'price', 'compare_at', 'status', 'image',
  'media', 'seo', 'seo_status', 'taxonomy', 'tags', 'product_group', 'sku', 'color', 'inventory',
  'custom_fields',
  'pod_product_variants(id,sku,option_values,price,compare_at,inventory,status,image,weight_grams,barcode)'
].join(',')

function isProductionBuild() {
  return Boolean(process.env.VERCEL || process.env.CI || process.env.MERCHANT_FEED_REQUIRED === 'true')
}

function restUrl(path, params = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  return url
}

function responseDetail(response) {
  return response.text().then(text => text.replace(/\s+/g, ' ').slice(0, 240))
}

async function fetchPage(url, attempt = 0) {
  try {
    const response = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(60000)
    })
    if (!response.ok) {
      const detail = await responseDetail(response)
      const error = new Error(`Supabase Merchant query failed (${response.status}): ${detail}`)
      if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(8000, 1000 * (attempt + 1))))
        return fetchPage(url, attempt + 1)
      }
      throw error
    }
    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('Supabase Merchant query did not return an array.')
    return { payload, response }
  } catch (error) {
    if (attempt < 3 && /abort|fetch|network|429|5\d\d/i.test(String(error?.message || error))) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(8000, 1000 * (attempt + 1))))
      return fetchPage(url, attempt + 1)
    }
    throw error
  }
}

async function expectedProductCount() {
  const url = restUrl('pod_products', {
    select: 'id',
    status: 'eq.PUBLISHED',
    seo_status: 'eq.INDEXABLE',
    limit: 1
  })
  const response = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
      Range: '0-0'
    },
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) throw new Error(`Supabase Merchant count failed (${response.status}): ${await responseDetail(response)}`)
  const range = response.headers.get('content-range') || ''
  const match = range.match(/\/(\d+|\*)$/)
  if (!match || match[1] === '*') throw new Error('Supabase did not return an exact Merchant product count.')
  return Number(match[1])
}

async function loadProducts(expected) {
  const rows = []
  let cursor = ''
  for (;;) {
    const params = {
      select: PRODUCT_SELECT,
      status: 'eq.PUBLISHED',
      seo_status: 'eq.INDEXABLE',
      order: 'id.asc',
      limit: pageSize
    }
    if (cursor) params.id = `gt.${cursor}`
    const { payload } = await fetchPage(restUrl('pod_products', params))
    rows.push(...payload)
    if (payload.length < pageSize) break
    const nextCursor = String(payload.at(-1)?.id || '')
    if (!nextCursor || nextCursor === cursor) throw new Error('Merchant keyset pagination did not advance.')
    cursor = nextCursor
  }

  const uniqueIds = new Set(rows.map(row => String(row?.id || '')).filter(Boolean))
  if (rows.length !== expected || uniqueIds.size !== expected) {
    throw new Error(`Merchant completeness check failed: expected ${expected} product rows, loaded ${rows.length} (${uniqueIds.size} unique).`)
  }
  return rows
}

async function atomicWrite(path, body) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, body)
  await rename(temporary, path)
}

async function removeIfPresent(path) {
  try { await unlink(path) } catch (error) { if (error?.code !== 'ENOENT') throw error }
}

function publicReport(catalogue, expected, rows) {
  const report = catalogue.report || {}
  return {
    generatedAt: report.generatedAt,
    expectedProductCount: expected,
    loadedProductCount: rows.length,
    completeness: {
      expectedProductCount: expected,
      loadedProductCount: rows.length,
      uniqueProductCount: new Set(rows.map(row => row.id)).size,
      complete: rows.length === expected && new Set(rows.map(row => row.id)).size === expected
    },
    candidateProducts: report.candidateProducts || 0,
    candidateVariants: report.candidateVariants || 0,
    acceptedItems: report.acceptedItems || 0,
    rejectedItems: report.rejectedItems || 0,
    reasonCounts: report.reasonCounts || {},
    warningCounts: report.warningCounts || {},
    files: {
      xml: '/feeds/google-merchant.xml.gz',
      tsv: '/feeds/google-merchant.tsv.gz'
    }
  }
}

async function main() {
  if (!supabaseUrl || !apiKey) {
    if (isProductionBuild()) throw new Error('Production Merchant feed build requires SUPABASE_URL and a Supabase API key.')
    console.warn('[merchant-feed] skipped: no Supabase environment is configured for this local build.')
    return { skipped: true }
  }

  const expected = await expectedProductCount()
  const products = await loadProducts(expected)
  const catalogue = buildGoogleMerchantCatalogue(products, {
    origin: siteOrigin,
    brand: process.env.GMC_BRAND || 'Extra Time'
  })
  const report = publicReport(catalogue, expected, products)
  if (!report.completeness.complete) throw new Error('Merchant completeness guard failed before writing files.')

  const xml = renderGoogleMerchantXml(catalogue, { origin: siteOrigin })
  const tsv = renderGoogleMerchantTsv(catalogue)
  // Keep a plain XML copy only when it is comfortably below Vercel Hobby's
  // 100 MB static-file limit. The canonical URLs are the compressed files,
  // which Google Merchant Center accepts for scheduled fetches.
  const plainXmlPath = resolve(outputDirectory, 'google-merchant.xml')
  const plainTsvPath = resolve(outputDirectory, 'google-merchant.tsv')
  if (Buffer.byteLength(xml) <= PLAIN_STATIC_LIMIT) await atomicWrite(plainXmlPath, xml)
  else await removeIfPresent(plainXmlPath)
  if (Buffer.byteLength(tsv) <= PLAIN_TSV_LIMIT) await atomicWrite(plainTsvPath, tsv)
  else await removeIfPresent(plainTsvPath)
  await atomicWrite(resolve(outputDirectory, 'google-merchant.xml.gz'), await gzipAsync(xml, { level: 9 }))
  await atomicWrite(resolve(outputDirectory, 'google-merchant.tsv.gz'), await gzipAsync(tsv, { level: 9 }))
  await atomicWrite(resolve(outputDirectory, 'google-merchant-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    outputDirectory,
    expectedProductCount: expected,
    loadedProductCount: products.length,
    candidateProducts: report.candidateProducts,
    candidateVariants: report.candidateVariants,
    acceptedItems: report.acceptedItems,
    rejectedItems: report.rejectedItems,
    reasonCounts: report.reasonCounts,
    warningCounts: report.warningCounts
  }, null, 2))
  return report
}

export { expectedProductCount, loadProducts, publicReport }

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) await main()
