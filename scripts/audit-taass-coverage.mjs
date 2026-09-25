#!/usr/bin/env node

import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { discoverTaassProducts, filterTaassGroups } from './import-taass-catalog.mjs'
import { TAASS_SOURCE_HOST } from './taass-import-lib.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

export function planTaassCoverage(groups, importedCodes) {
  const imported = new Set(importedCodes.map(String))
  const headwear = new Set(filterTaassGroups(groups, { headwearOnly: true }).map(group => group.familyCode))
  const jersey = new Set(filterTaassGroups(groups, { jerseyOnly: true }).map(group => group.familyCode))
  const missing = groups.filter(group => !imported.has(group.familyCode))
  return {
    sitemapFamilies: groups.length,
    importedFamilies: groups.length - missing.length,
    missingFamilies: missing.length,
    missing: missing.map(group => ({
      familyCode: group.familyCode,
      candidateScopes: [headwear.has(group.familyCode) ? 'HEADWEAR' : '', jersey.has(group.familyCode) ? 'JERSEY' : ''].filter(Boolean),
      variantUrls: group.urls.length,
      exampleUrl: group.urls[0]
    }))
  }
}

export async function run() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key.length < 24) throw new Error('Coverage audit requires Supabase URL and service-role key in the server environment.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const discovery = await discoverTaassProducts()
  const imported = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('pod_catalog_imports')
      .select('source_sku,entity_id')
      .eq('source', TAASS_SOURCE_HOST)
      .eq('entity_type', 'PRODUCT')
      .order('source_sku')
      .range(offset, offset + 499)
    if (error) throw new Error(`Cannot read TAASS import audit: ${error.message}`)
    imported.push(...(data || []))
    if ((data || []).length < 500) break
  }
  const plan = planTaassCoverage(discovery.groups, imported.map(row => row.source_sku))
  const result = {
    generatedAt: new Date().toISOString(),
    source: TAASS_SOURCE_HOST,
    auditRows: imported.length,
    ...plan,
    missingByScope: plan.missing.reduce((counts, item) => {
      const key = item.candidateScopes.length ? item.candidateScopes.join('+') : 'REMAINING'
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
  }
  const path = process.env.TAASS_COVERAGE_REPORT || resolve('artifacts', 'taass-coverage-report.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify({ auditRows: result.auditRows, sitemapFamilies: result.sitemapFamilies, importedFamilies: result.importedFamilies, missingFamilies: result.missingFamilies, missingByScope: result.missingByScope, report: path }, null, 2))
  return result
}

if (process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/audit-taass-coverage.mjs')) {
  run().catch(error => {
    console.error(`TAASS coverage audit failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
