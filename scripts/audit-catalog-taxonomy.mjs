#!/usr/bin/env node

// Read-only by default. This audit identifies semantic taxonomy conflicts
// before SEO copy, sitemaps or merchant feeds expose the wrong entity. Use
// --write only after reviewing the generated report; write mode changes SEO
// status/reasons, never the commerce status, price, stock or taxonomy itself.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { validateCatalogTaxonomy } from '../src/lib/taxonomy-validator.js'

const url = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, 'https://ofetusgarxcwloxxkhnr.supabase.co']
  .find(value => /^https?:\/\//.test(String(value || ''))) || 'https://ofetusgarxcwloxxkhnr.supabase.co'
const key = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.TARGET_SERVICE_KEY]
  .find(value => /^(?:sb_secret_|eyJ)/.test(String(value || ''))) || ''
const anonKey = [process.env.VITE_SUPABASE_ANON_KEY, process.env.SUPABASE_ANON_KEY]
  .find(value => /^(?:sb_publishable_|eyJ)/.test(String(value || ''))) || ''
const WRITE = process.argv.includes('--write')
const ALL = process.argv.includes('--all')
const reportPath = resolve(process.env.TAXONOMY_AUDIT_REPORT || 'artifacts/catalog-taxonomy-audit.json')

if (!/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL must be an HTTP(S) URL.')
if (WRITE && !/^sb_secret_|^eyJ/.test(key)) throw new Error('Write mode requires SUPABASE_SERVICE_ROLE_KEY (server-only).')

const client = createClient(url, key || anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function allRows(table, columns, pageSize = 500) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select(columns).order('id').range(offset, offset + pageSize - 1)
    if (!ALL && table === 'pod_products') query = query.eq('status', 'PUBLISHED')
    const result = await query
    if (result.error) throw new Error(`${table} page ${offset}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < pageSize) return rows
  }
}

function reasonCounts(items, field) {
  const counts = {}
  for (const item of items) for (const reason of item[field] || []) counts[reason] = (counts[reason] || 0) + 1
  return counts
}

const products = await allRows('pod_products', 'id,handle,title,status,seo_status,seo_block_reasons,seo_quality_score,seo,description,subtitle,product_group,taxonomy,tags,updated_at')
const findings = products.map(row => {
  const validation = validateCatalogTaxonomy(row)
  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    status: row.status,
    seoStatus: row.seo_status,
    updatedAt: row.updated_at || null,
    blockers: validation.blockers,
    warnings: validation.warnings,
    detected: validation.detected,
    normalized: validation.normalized
  }
}).filter(item => item.blockers.length || item.warnings.length)

const blocking = findings.filter(item => item.blockers.length)
const warningOnly = findings.filter(item => !item.blockers.length && item.warnings.length)
const writes = []
const writeFailures = []

if (WRITE) {
  const now = new Date().toISOString()
  for (const item of blocking) {
    // Only block rows that can currently reach public surfaces. Drafts retain
    // their editorial state and simply remain visible in this audit.
    if (item.status !== 'PUBLISHED' && item.seoStatus !== 'INDEXABLE') continue
    const source = products.find(row => row.id === item.id)
    const existing = Array.isArray(source?.seo_block_reasons) ? source.seo_block_reasons : []
    const reasons = [...new Set([...existing, ...item.blockers])]
    const currentSeo = source?.seo && typeof source.seo === 'object' ? source.seo : {}
    let query = client.from('pod_products').update({
      seo_status: 'BLOCKED',
      seo_quality_score: Math.max(0, Number(source?.seo_quality_score || 0) - 12 * item.blockers.length),
      seo_block_reasons: reasons,
      seo: { ...currentSeo, status: 'BLOCKED', block_reasons: reasons },
      seo_reviewed_at: now
    }).eq('id', item.id)
    // updated_at is used as an optimistic guard when the schema exposes it.
    if (source?.updated_at) query = query.eq('updated_at', source.updated_at)
    const result = await query
    if (result.error) writeFailures.push({ id: item.id, handle: item.handle, error: result.error.message })
    else writes.push({ id: item.id, handle: item.handle, reasons: item.blockers })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  scope: ALL ? 'ALL_PRODUCTS' : 'PUBLISHED_PRODUCTS',
  scanned: products.length,
  findings: findings.length,
  blocking: blocking.length,
  warningOnly: warningOnly.length,
  blockerCounts: reasonCounts(findings, 'blockers'),
  warningCounts: reasonCounts(findings, 'warnings'),
  writes,
  writeFailures,
  samples: findings.slice(0, 100),
  report: reportPath
}

await mkdir(resolve(reportPath, '..'), { recursive: true })
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
