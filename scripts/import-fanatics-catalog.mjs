#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildListingInput } from '../src/lib/catalog-model.js'
import {
  normalizeFanaticsProduct,
  hydrateListingMedia,
  PRIMARY_FANATICS_HOST
} from './fanatics-import-lib.mjs'
import {
  publicListingHasSourceReferences,
  sanitizePublicText
} from './fangear-import-lib.mjs'

import fs from 'node:fs'

for (const envFile of ['.env.local', '.env', '.env.fangear.import']) {
  if (fs.existsSync(envFile)) {
    try {
      const content = fs.readFileSync(envFile, 'utf8')
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2]
        }
      }
    } catch {}
  }
}

const rawSupabaseUrl = String(process.env.SUPABASE_URL || '').trim()
const supabaseUrl = /^https?:\/\//i.test(rawSupabaseUrl) ? rawSupabaseUrl : (process.env.VITE_SUPABASE_URL || 'https://ofetusgarxcwloxxkhnr.supabase.co')
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const outputPath = process.env.FANATICS_IMPORT_REPORT || resolve('artifacts', 'fanatics-import-report.json')

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const dryRun = !hasArg('--write')
const includeMedia = hasArg('--media') || (hasArg('--write') && String(process.env.FANATICS_IMPORT_MEDIA || 'true').toLowerCase() !== 'false')
const filePath = argValue('--file', '')
const jsonArg = argValue('--json', '')
const limit = Math.max(0, Number(argValue('--limit', 0)) || 0)

function usage() {
  console.log(`Fanatics Catalog Importer\n\n` +
    `  node scripts/import-fanatics-catalog.mjs [--dry-run] [--file <path>] [--json '<string>'] [--write] [--media] [--limit <n>]\n\n` +
    `Options:\n` +
    `  --file <path>   Path to JSON file containing a Fanatics product or array of products.\n` +
    `  --json '<data>' Raw JSON string containing product data.\n` +
    `  --write         Execute writes to Supabase (requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).\n` +
    `  --media         Download images, strip EXIF metadata, and upload to 'product-media' bucket.\n` +
    `  --limit <n>     Limit the number of products to process.\n` +
    `  --dry-run       Validate and normalize without modifying database or storage (default).\n`)
}

export async function loadSourcePayloads({ filePath = '', jsonArg = '' } = {}) {
  let rawData = null
  if (filePath) {
    const fullPath = resolve(process.cwd(), filePath)
    const content = await readFile(fullPath, 'utf8')
    rawData = JSON.parse(content)
  } else if (jsonArg) {
    rawData = JSON.parse(jsonArg)
  }

  if (!rawData) {
    throw new Error('No input data provided. Specify --file <path> or --json \'<string>\'.')
  }

  const items = Array.isArray(rawData) ? rawData : (Array.isArray(rawData.products) ? rawData.products : [rawData])
  return items.filter(Boolean)
}

export async function saveListingsToDatabase(client, items, errors) {
  let imported = 0
  const importedIds = new Set()
  const existingRevisions = new Map()

  for (let offset = 0; offset < items.length; offset += 100) {
    const ids = items.slice(offset, offset + 100).map(item => item.listing.id)
    const { data, error } = await client.from('pod_products').select('id,updated_at').in('id', ids)
    if (error) {
      errors.push({ kind: 'listing-resume', error: error.message })
      break
    }
    for (const row of data || []) existingRevisions.set(row.id, row.updated_at)
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (publicListingHasSourceReferences(item.listing)) {
      errors.push({ kind: 'privacy', sourceId: item.sourceId, error: 'Listing contains forbidden source backlinks or Fanatics brand traces.' })
      continue
    }

    const { error } = await client.rpc('pod_save_listing', {
      listing: buildListingInput(item.listing),
      expected_updated_at: existingRevisions.get(item.listing.id) || null
    })

    if (error) {
      errors.push({ kind: 'listing', sourceId: item.sourceId, id: item.listing.id, error: error.message })
    } else {
      imported += 1
      importedIds.add(item.listing.id)
    }
  }

  return { count: imported, importedIds }
}

export async function saveAuditRecords(client, items, importedIds = null) {
  const rows = items
    .filter(item => !importedIds || importedIds.has(item.listing.id))
    .map(item => ({
      source: PRIMARY_FANATICS_HOST,
      source_entity_id: String(item.sourceId),
      entity_type: 'PRODUCT',
      entity_id: item.listing.id,
      source_sku: item.sourceSku || '',
      source_categories: (item.listing.tags || []).map(v => sanitizePublicText(v))
    }))

  for (let offset = 0; offset < rows.length; offset += 250) {
    await client.from('pod_catalog_imports').upsert(rows.slice(offset, offset + 250), {
      onConflict: 'source,source_entity_id,entity_type'
    })
  }
}

export async function run({
  file = filePath,
  json = jsonArg,
  isDryRun = dryRun,
  withMedia = includeMedia,
  limitCount = limit,
  supabaseClient = null
} = {}) {
  const sourcePayloads = await loadSourcePayloads({ filePath: file, jsonArg: json })
  const targetedPayloads = limitCount > 0 ? sourcePayloads.slice(0, limitCount) : sourcePayloads

  console.log(`${isDryRun ? 'Dry run' : 'Write run'} · Processing ${targetedPayloads.length} Fanatics items · Media: ${withMedia ? 'ON' : 'OFF'}`)

  const usedHandles = new Set()
  const usedSkus = new Set()
  const errors = []

  let normalizedItems = targetedPayloads.map(payload => {
    try {
      return normalizeFanaticsProduct(payload, { usedHandles, usedSkus })
    } catch (err) {
      errors.push({ kind: 'normalization', error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }).filter(Boolean)

  let client = supabaseClient
  if (!isDryRun && !client) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    }
    client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  // Hydrate media if requested and client is present
  if (withMedia && client) {
    console.log('Hydrating media: downloading, stripping EXIF, and uploading to product-media bucket...')
    for (let index = 0; index < normalizedItems.length; index += 1) {
      normalizedItems[index] = await hydrateListingMedia(client, normalizedItems[index], { errors })
    }
  }

  let importedCount = 0
  if (!isDryRun && client) {
    const saveResult = await saveListingsToDatabase(client, normalizedItems, errors)
    importedCount = saveResult.count
    await saveAuditRecords(client, normalizedItems, saveResult.importedIds)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: PRIMARY_FANATICS_HOST,
    mode: isDryRun ? 'DRY_RUN' : 'WRITE',
    totalInput: targetedPayloads.length,
    normalizedCount: normalizedItems.length,
    importedListings: importedCount,
    mediaHydrated: withMedia && Boolean(client),
    errors,
    items: normalizedItems.map(item => ({
      sourceId: item.sourceId,
      id: item.listing.id,
      handle: item.listing.handle,
      title: item.listing.title,
      price: item.listing.price,
      sku: item.listing.sku,
      image: item.listing.image,
      isPersonalized: item.listing.customFields.length > 0,
      variantsCount: item.listing.variants.length
    }))
  }

  await mkdir(resolve(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(`Completed Fanatics import. Mode: ${report.mode} | Normalized: ${report.normalizedCount} | Imported: ${report.importedListings} | Errors: ${errors.length}`)
  console.log(`Report written to: ${outputPath}`)

  return report
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/import-fanatics-catalog.mjs')
if (isMain) {
  if (hasArg('--help') || hasArg('-h')) { usage(); process.exit(0) }
  run().catch(err => {
    console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
