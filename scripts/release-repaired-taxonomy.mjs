#!/usr/bin/env node

// Re-open only the rows repaired by migrate-supplemental-taxonomy.mjs. The
// broad taxonomy audit intentionally blocks contradictions, but it cannot
// know which rows were corrected after that audit ran. This narrow release
// gate requires a valid taxonomy and no non-taxonomy SEO blockers.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { validateCatalogTaxonomy } from '../src/lib/taxonomy-validator.js'

const url = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, 'https://ofetusgarxcwloxxkhnr.supabase.co']
  .find(value => /^https?:\/\//.test(String(value || ''))) || 'https://ofetusgarxcwloxxkhnr.supabase.co'
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TARGET_SERVICE_KEY || '').trim()
const WRITE = process.argv.includes('--write')
const reportPath = resolve(process.env.TAXONOMY_RELEASE_REPORT || 'artifacts/repaired-taxonomy-release.json')
const taxonomyBlockers = new Set([
  'TAXONOMY_LEAGUE_TEXT_MISMATCH',
  'TAXONOMY_TEAM_LEAGUE_MISMATCH',
  'TAXONOMY_UNKNOWN_LEAGUE',
  'TAXONOMY_SPORT_MISMATCH',
  'TAXONOMY_PRODUCT_GROUP_MISMATCH'
])

if (WRITE && !/^(?:sb_secret_|eyJ)/.test(serviceKey)) throw new Error('Write mode requires SUPABASE_SERVICE_ROLE_KEY.')
const client = createClient(url, serviceKey || process.env.VITE_SUPABASE_ANON_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } })

async function allRows(pageSize = 500) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await client.from('pod_products')
      .select('id,title,status,seo_status,seo,seo_block_reasons,taxonomy,updated_at')
      .eq('status', 'PUBLISHED')
      .eq('seo_status', 'BLOCKED')
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (result.error) throw new Error(`pod_products page ${offset}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < pageSize) return rows
  }
}

function isRepairedEntity(row) {
  const league = String(row?.taxonomy?.league || '').toLowerCase()
  if (row?.id === 'listing-2356f78b7197af7685f5') return league === 'nba' && row?.taxonomy?.team === 'atlanta-hawks'
  if (league === 'aew') return /\bAEW\b|All Elite Wrestling/i.test(String(row.title || ''))
  if (league === 'formula1') return /Formula\s*(?:1|One)|Formel\s*1|F1/i.test(String(row.title || ''))
  return false
}

const products = await allRows()
const candidates = products.filter(row => {
  if (!isRepairedEntity(row)) return false
  const reasons = Array.isArray(row.seo_block_reasons) ? row.seo_block_reasons : []
  return reasons.length > 0 && reasons.every(reason => taxonomyBlockers.has(reason)) && validateCatalogTaxonomy(row).valid
})

const writes = []
const writeFailures = []
if (WRITE) {
  const now = new Date().toISOString()
  for (const row of candidates) {
    const currentSeo = row.seo && typeof row.seo === 'object' ? row.seo : {}
    const nextSeo = { ...currentSeo, status: 'INDEXABLE', block_reasons: [] }
    let query = client.from('pod_products').update({
      seo_status: 'INDEXABLE',
      seo_block_reasons: [],
      seo: nextSeo,
      seo_reviewed_at: now
    }).eq('id', row.id)
    if (row.updated_at) query = query.eq('updated_at', row.updated_at)
    const result = await query.select('id').maybeSingle()
    if (result.error) writeFailures.push({ id: row.id, error: result.error.message })
    else if (!result.data) writeFailures.push({ id: row.id, error: 'optimistic_guard_miss' })
    else writes.push({ id: row.id, title: row.title, league: row.taxonomy?.league })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  blockedPublishedRows: products.length,
  eligible: candidates.length,
  writes: writes.length,
  writeFailures,
  candidates: candidates.map(row => ({ id: row.id, title: row.title, league: row.taxonomy?.league, team: row.taxonomy?.team || '' })),
  report: reportPath
}
await mkdir(resolve(reportPath, '..'), { recursive: true })
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))

