#!/usr/bin/env node

import fs from 'node:fs'
import { resolve } from 'node:path'

const API_HOST = (process.argv[2] || process.env.DEPLOY_HOST || 'https://www.jersevo.com').replace(/\/$/, '')
const ENDPOINT = `${API_HOST}/api/admin-import-fanatics`
const SECRET = process.env.INTERNAL_IMPORT_KEY || 'jersevo_fanatics_import_2026'
const FILE_PATH = resolve(process.cwd(), 'artifacts', 'fanatics-raw-products.json')

async function run() {
  console.log(`\n========================================`)
  console.log(`Fanatics Draft Importer -> ${ENDPOINT}`)
  console.log(`========================================\n`)

  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(`Data file not found at ${FILE_PATH}`)
  }

  const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))
  const products = Array.isArray(raw) ? raw : (raw.products || [raw])
  console.log(`Loaded ${products.length} products from ${FILE_PATH}`)

  const BATCH_SIZE = 5
  let totalImported = 0
  const allResults = []

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    console.log(`\nProcessing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} products)...`)

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': SECRET
      },
      body: JSON.stringify(batch)
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.error(`Batch failed with non-JSON response (${res.status}):`, text.slice(0, 300))
      continue
    }

    if (!res.ok) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (${res.status}):`, data.error || data)
      continue
    }

    console.log(`✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} imported ${data.importedCount || 0} listings.`)
    if (data.listings) {
      data.listings.forEach(listing => {
        console.log(`  - [DRAFT] ${listing.title} ($${listing.price}) -> ID: ${listing.id}`)
        allResults.push(listing)
      })
    }
    if (data.errors?.length) {
      console.warn(`  Errors encountered in batch:`, data.errors)
    }
    totalImported += (data.importedCount || 0)
  }

  console.log(`\n========================================`)
  console.log(`Import finished. Total DRAFT products saved: ${totalImported}/${products.length}`)
  console.log(`========================================\n`)
}

run().catch(err => {
  console.error('Import error:', err)
  process.exit(1)
})
