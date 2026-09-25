#!/usr/bin/env node

import fs from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TAASS_SOURCE_HOST, stripTaassBrandFromTitle } from './taass-import-lib.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const writeMode = process.argv.includes('--write')
const reportPath = resolve(process.env.TAASS_TITLE_REPORT || `artifacts/taass-brand-title-${writeMode ? 'write' : 'preview'}.json`)
const checkpointPath = resolve(process.env.TAASS_TITLE_CHECKPOINT || 'artifacts/taass-brand-title-checkpoint.json')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || key.length < 24) throw new Error('Brand-title cleanup needs server-side Supabase credentials.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const sleep = ms => new Promise(done => setTimeout(done, ms))
async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8')
  await rename(temp, path)
}

async function importedIds() {
  const ids = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('pod_catalog_imports').select('entity_id')
      .eq('source', TAASS_SOURCE_HOST).eq('entity_type', 'PRODUCT')
      .order('source_sku').range(offset, offset + 499)
    if (error) throw new Error(`Cannot read TAASS audit: ${error.message}`)
    ids.push(...(data || []).map(row => row.entity_id))
    if ((data || []).length < 500) break
  }
  return [...new Set(ids)]
}

export function planTaassBrandTitle(row) {
  const brand = String(row.taxonomy?.brand || row.seo?.gmc?.brand || '').trim()
  const before = String(row.title || '')
  const after = stripTaassBrandFromTitle(before, brand)
  const seoBefore = String(row.seo?.title || '')
  let seoAfter = seoBefore ? stripTaassBrandFromTitle(seoBefore, brand) : seoBefore
  if (seoAfter !== seoBefore && row.status === 'PUBLISHED' && row.seo_status === 'INDEXABLE') {
    if (seoAfter.length < 30) {
      const group = String(row.product_group || 'Sports Fan Gear').trim()
      seoAfter = `${after} ${group} | Jersevo`.replace(/\s+/g, ' ').trim()
      if (seoAfter.length < 30) seoAfter = `${after} Sports Fan Gear | Jersevo`.replace(/\s+/g, ' ').trim()
    }
    if (seoAfter.length > 60) seoAfter = seoAfter.slice(0, 61).replace(/\s+\S*$/, '').trim()
  }
  return {
    id: row.id, brand, before, after, seoBefore, seoAfter,
    titleChanged: after !== before, seoTitleChanged: seoAfter !== seoBefore,
    status: row.status, updatedAt: row.updated_at
  }
}

async function readProducts(ids) {
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client.from('pod_products')
      .select('id,title,seo,seo_status,status,product_group,taxonomy,updated_at')
      .in('id', ids)
    if (!error) return data || []
    lastError = error
    if (!/timeout|429|5\d\d|fetch|network/i.test(error.message || '')) break
    await sleep((attempt + 1) * 1200)
  }
  throw new Error(`Cannot read TAASS listings: ${lastError?.message}`)
}

async function updateTitle(row, plan) {
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const changes = {}
    if (plan.titleChanged) changes.title = plan.after
    if (plan.seoTitleChanged) changes.seo = { ...(row.seo || {}), title: plan.seoAfter }
    const { data, error } = await client.from('pod_products').update(changes)
      .eq('id', row.id).eq('updated_at', row.updated_at).select('id')
    if (!error && (data || []).length === 1) return null
    lastError = error || new Error('Listing changed during title cleanup; preserving the newer edit.')
    if (!error || !/timeout|429|5\d\d|fetch|network/i.test(error.message || '')) break
    await sleep((attempt + 1) * 1400)
  }
  return lastError?.message || String(lastError)
}

async function run() {
  const ids = await importedIds()
  let checkpoint = null
  if (writeMode) {
    try { checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) }
    catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
  if (checkpoint && checkpoint.source !== TAASS_SOURCE_HOST) throw new Error('Checkpoint source mismatch.')
  const processed = new Set(checkpoint?.processedIds || [])
  const report = checkpoint?.report || {
    generatedAt: '', mode: writeMode ? 'WRITE' : 'DRY_RUN', source: TAASS_SOURCE_HOST,
    importedProducts: ids.length, scanned: 0, titleChanged: 0, seoTitleChanged: 0,
    unchanged: 0, errors: [], examples: []
  }
  report.importedProducts = ids.length
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100).filter(id => !processed.has(id))
    if (!batch.length) continue
    const rows = await readProducts(batch)
    const found = new Set(rows.map(row => row.id))
    for (const id of batch) if (!found.has(id)) report.errors.push({ id, error: 'TAASS audit row has no listing.' })
    const candidates = rows.map(row => ({ row, plan: planTaassBrandTitle(row) }))
    for (const { plan } of candidates) {
      if (report.examples.length < 80 && (plan.titleChanged || plan.seoTitleChanged)) report.examples.push(plan)
    }
    if (!writeMode) {
      report.scanned += rows.length
      report.titleChanged += candidates.filter(item => item.plan.titleChanged).length
      report.seoTitleChanged += candidates.filter(item => item.plan.seoTitleChanged).length
      report.unchanged += candidates.filter(item => !item.plan.titleChanged && !item.plan.seoTitleChanged).length
    } else {
      for (let index = 0; index < candidates.length; index += 5) {
        const chunk = candidates.slice(index, index + 5)
        const outcomes = await Promise.all(chunk.map(async ({ row, plan }) => {
          if (!plan.titleChanged && !plan.seoTitleChanged) return { id: row.id, plan, error: null }
          return { id: row.id, plan, error: await updateTitle(row, plan) }
        }))
        for (const outcome of outcomes) {
          if (outcome.error) {
            report.errors.push({ id: outcome.id, error: outcome.error })
            continue
          }
          processed.add(outcome.id)
          report.errors = report.errors.filter(item => item.id !== outcome.id)
          report.scanned += 1
          report.titleChanged += Number(outcome.plan.titleChanged)
          report.seoTitleChanged += Number(outcome.plan.seoTitleChanged)
          report.unchanged += Number(!outcome.plan.titleChanged && !outcome.plan.seoTitleChanged)
        }
      }
    }
    report.generatedAt = new Date().toISOString()
    report.processedProducts = writeMode ? processed.size : report.scanned
    report.complete = writeMode ? processed.size === ids.length && report.errors.length === 0 : true
    if (writeMode) await saveJson(checkpointPath, { source: TAASS_SOURCE_HOST, processedIds: [...processed], report })
    await saveJson(reportPath, report)
    console.log(`TAASS brand titles ${report.processedProducts}/${ids.length} · changed ${report.titleChanged} · errors ${report.errors.length}`)
  }
  console.log(JSON.stringify({ mode: report.mode, products: ids.length, changedTitles: report.titleChanged, changedSeoTitles: report.seoTitleChanged, unchanged: report.unchanged, errors: report.errors.length, complete: report.complete, report: reportPath }, null, 2))
  if (report.errors.length || writeMode && !report.complete) process.exitCode = 2
}

if (process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/clean-taass-brand-titles.mjs')) {
  run().catch(error => { console.error(`TAASS brand-title cleanup failed: ${error.message}`); process.exitCode = 1 })
}
