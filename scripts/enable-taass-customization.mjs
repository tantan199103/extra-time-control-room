#!/usr/bin/env node

import fs from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TAASS_SOURCE_HOST } from './taass-import-lib.mjs'
import { planTaassCustomization } from './taass-customization-lib.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const writeMode = process.argv.includes('--write')
const limitAt = process.argv.indexOf('--limit')
const limit = limitAt >= 0 ? Math.max(1, Number(process.argv[limitAt + 1]) || 1) : 0
const reportPath = resolve(process.env.TAASS_CUSTOM_REPORT || `artifacts/taass-custom-${writeMode ? 'write' : 'preview'}.json`)
const checkpointPath = resolve(process.env.TAASS_CUSTOM_CHECKPOINT || 'artifacts/taass-custom-checkpoint.json')
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || key.length < 24) throw new Error('TAASS custom activation needs server-side Supabase credentials.')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const pause = ms => new Promise(done => setTimeout(done, ms))

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
    if (error) throw new Error(`Cannot read TAASS import audit: ${error.message}`)
    ids.push(...(data || []).map(row => row.entity_id))
    if ((data || []).length < 500) break
  }
  return [...new Set(ids)].slice(0, limit || undefined)
}

async function readRows(ids) {
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client.from('pod_products')
      .select('id,title,description,content_blocks,custom_fields,tags,personalization,type,status,updated_at')
      .in('id', ids)
    if (!error) return data || []
    lastError = error
    if (!/timeout|429|5\d\d|fetch|network/i.test(error.message || '')) break
    await pause((attempt + 1) * 1200)
  }
  throw new Error(`Cannot read TAASS listings: ${lastError?.message}`)
}

async function writeRow(row, plan) {
  const changes = {
    custom_fields: plan.customFields,
    personalization: plan.personalization,
    type: plan.type,
    description: plan.description,
    content_blocks: plan.contentBlocks,
    tags: plan.tags
  }
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client.from('pod_products').update(changes)
      .eq('id', row.id).eq('updated_at', row.updated_at).select('id')
    if (!error && (data || []).length === 1) return null
    lastError = error || new Error('Listing changed during custom activation; preserving the newer edit.')
    if (!error || !/timeout|429|5\d\d|fetch|network/i.test(error.message || '')) break
    await pause((attempt + 1) * 1400)
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
    generatedAt:'', source:TAASS_SOURCE_HOST, mode:writeMode ? 'WRITE' : 'DRY_RUN',
    importedProducts:ids.length, processedProducts:0, changed:0, unchanged:0,
    addedName:0, addedNumber:0, addedLogo:0, errors:[], examples:[]
  }
  report.importedProducts = ids.length
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50).filter(id => !processed.has(id))
    if (!batch.length) continue
    const rows = await readRows(batch)
    const found = new Set(rows.map(row => row.id))
    for (const id of batch) if (!found.has(id)) report.errors.push({ id, error:'Audit row has no listing.' })
    const planned = rows.map(row => ({ row, plan:planTaassCustomization(row) }))
    for (const { row, plan } of planned) {
      if (report.examples.length < 50 && plan.changed) report.examples.push({ id:row.id, title:row.title, status:row.status, addedKeys:plan.addedKeys })
    }
    if (!writeMode) {
      report.processedProducts += rows.length
      report.changed += planned.filter(item => item.plan.changed).length
      report.unchanged += planned.filter(item => !item.plan.changed).length
      for (const { plan } of planned) {
        report.addedName += Number(plan.addedKeys.includes('name'))
        report.addedNumber += Number(plan.addedKeys.includes('number'))
        report.addedLogo += Number(plan.addedKeys.includes('teamLogo'))
      }
    } else {
      for (let index = 0; index < planned.length; index += 4) {
        const chunk = planned.slice(index, index + 4)
        const results = await Promise.all(chunk.map(async ({ row, plan }) => ({ row, plan, error:plan.changed ? await writeRow(row, plan) : null })))
        for (const { row, plan, error } of results) {
          if (error) { report.errors.push({ id:row.id, error }); continue }
          processed.add(row.id)
          report.errors = report.errors.filter(item => item.id !== row.id)
          report.processedProducts += 1
          report.changed += Number(plan.changed)
          report.unchanged += Number(!plan.changed)
          report.addedName += Number(plan.addedKeys.includes('name'))
          report.addedNumber += Number(plan.addedKeys.includes('number'))
          report.addedLogo += Number(plan.addedKeys.includes('teamLogo'))
        }
      }
    }
    report.generatedAt = new Date().toISOString()
    report.complete = (writeMode ? processed.size : report.processedProducts) === ids.length && report.errors.length === 0
    if (writeMode) await saveJson(checkpointPath, { source:TAASS_SOURCE_HOST, processedIds:[...processed], report })
    await saveJson(reportPath, report)
    console.log(`TAASS custom ${report.processedProducts}/${ids.length} · changed ${report.changed} · errors ${report.errors.length}`)
  }
  console.log(JSON.stringify({ mode:report.mode, products:ids.length, changed:report.changed, addedName:report.addedName, addedNumber:report.addedNumber, addedLogo:report.addedLogo, errors:report.errors.length, complete:report.complete, report:reportPath }, null, 2))
  if (report.errors.length || !report.complete) process.exitCode = 2
}

if (process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/enable-taass-customization.mjs')) {
  run().catch(error => { console.error(`TAASS custom activation failed: ${error.message}`); process.exitCode = 1 })
}
