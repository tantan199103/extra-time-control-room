#!/usr/bin/env node

import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { TAASS_SOURCE_HOST } from './taass-import-lib.mjs'
import {
  classifyTaassListing,
  loadTaassCollectionMap,
  routeTaassListings,
  taassCollectionHandles,
  withTaassCatalogCategory
} from './taass-catalog-routing.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const writeMode = process.argv.includes('--write')
const limitIndex = process.argv.indexOf('--limit')
const limit = limitIndex >= 0 ? Math.max(0, Number(process.argv[limitIndex + 1]) || 0) : 0
const reportPath = process.env.TAASS_ROUTING_REPORT || resolve('artifacts', 'taass-routing-report.json')
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function auditProductIds(client) {
  const ids = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('pod_catalog_imports')
      .select('entity_id')
      .eq('source', TAASS_SOURCE_HOST)
      .eq('entity_type', 'PRODUCT')
      .order('source_entity_id')
      .range(offset, offset + 499)
    if (error) throw new Error(`Cannot read TAASS import audit: ${error.message}`)
    ids.push(...(data || []).map(row => row.entity_id))
    if ((data || []).length < 500) break
  }
  return [...new Set(ids)]
}

async function readProducts(client, ids) {
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await client.from('pod_products')
      .select('id,title,product_group,taxonomy,updated_at')
      .in('id', ids.slice(offset, offset + 100))
    if (error) throw new Error(`Cannot read imported TAASS listings: ${error.message}`)
    rows.push(...(data || []))
  }
  if (rows.length !== ids.length) throw new Error(`TAASS audit has ${ids.length} products but only ${rows.length} listing rows were found.`)
  return rows
}

async function saveCategory(client, row, category) {
  if (row.taxonomy?.category) return false
  const taxonomy = { ...(row.taxonomy || {}), category }
  const { data, error } = await client.from('pod_products')
    .update({ taxonomy })
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select('id')
  if (error) throw new Error(`Cannot set category for ${row.id}: ${error.message}`)
  if ((data || []).length !== 1) throw new Error(`Listing ${row.id} changed during category routing; retry after the other update completes.`)
  return true
}

export async function run() {
  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.length < 24) throw new Error('TAASS routing needs SUPABASE_URL and a real SUPABASE_SERVICE_ROLE_KEY.')
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const allIds = await auditProductIds(client)
  const selectedIds = limit ? allIds.slice(0, limit) : allIds
  const rows = await readProducts(client, selectedIds)
  let collectionMap = await loadTaassCollectionMap(client)
  const categoryCounts = {}
  const handleCounts = {}
  let categoriesUpdated = 0
  let linksAssigned = 0
  let collectionsCreated = 0
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100)
    const items = batch.map(row => ({ listing: withTaassCatalogCategory({
      id: row.id,
      title: row.title,
      productGroup: row.product_group,
      taxonomy: row.taxonomy || {}
    }) }))
    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index]
      const listing = items[index].listing
      const category = listing.taxonomy.category || classifyTaassListing(listing)
      categoryCounts[category] = (categoryCounts[category] || 0) + 1
      for (const handle of taassCollectionHandles(listing, new Set(collectionMap.keys()))) {
        handleCounts[handle] = (handleCounts[handle] || 0) + 1
      }
      if (writeMode && await saveCategory(client, row, category)) categoriesUpdated += 1
    }
    if (writeMode && items.length) {
      const routing = await routeTaassListings(client, items, collectionMap)
      collectionMap = routing.collections
      linksAssigned += routing.links
      collectionsCreated += routing.created
    }
    console.log(`Routed ${Math.min(offset + batch.length, rows.length)}/${rows.length} TAASS listings · category updates ${categoriesUpdated} · links ${linksAssigned}`)
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: writeMode ? 'WRITE' : 'DRY_RUN',
    source: TAASS_SOURCE_HOST,
    importedAuditProducts: allIds.length,
    selectedProducts: rows.length,
    categoriesUpdated,
    collectionsCreated,
    linksAssigned,
    categoryCounts,
    collectionHandleCounts: handleCounts
  }
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ mode: report.mode, products: report.selectedProducts, categoriesUpdated, collectionsCreated, linksAssigned, report: reportPath }, null, 2))
  return report
}

if (process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/route-taass-catalog.mjs')) {
  run().catch(error => {
    console.error(`TAASS collection routing failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
