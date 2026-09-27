#!/usr/bin/env node

// Reconcile the promotion/series taxonomy introduced after the first import.
// Dry-run is the default. --write changes only taxonomy and search tags; it
// never changes product status, SEO status, price, media or inventory.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const url = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, 'https://ofetusgarxcwloxxkhnr.supabase.co']
  .find(value => /^https?:\/\//.test(String(value || ''))) || 'https://ofetusgarxcwloxxkhnr.supabase.co'
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TARGET_SERVICE_KEY || '').trim()
const WRITE = process.argv.includes('--write')
const reportPath = resolve(process.env.TAXONOMY_MIGRATION_REPORT || 'artifacts/supplemental-taxonomy-migration.json')

if (!/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL must be an HTTP(S) URL.')
if (WRITE && !/^(?:sb_secret_|eyJ)/.test(serviceKey)) {
  throw new Error('Write mode requires SUPABASE_SERVICE_ROLE_KEY (server-only).')
}

const client = createClient(url, serviceKey || process.env.VITE_SUPABASE_ANON_KEY || '', {
  auth: { persistSession: false, autoRefreshToken: false }
})

async function allRows(pageSize = 500) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await client.from('pod_products')
      .select('id,title,handle,subtitle,description,seo,status,seo_status,product_group,taxonomy,tags,updated_at')
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (result.error) throw new Error(`pod_products page ${offset}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < pageSize) return rows
  }
}

const asText = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const slugTag = value => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const currentLeague = row => slugTag(row?.taxonomy?.league || '')
const searchableText = row => [
  row?.title, row?.handle, row?.subtitle, row?.description,
  row?.taxonomy?.league, row?.taxonomy?.sport, row?.taxonomy?.category,
  ...(Array.isArray(row?.tags) ? row.tags : [])
].map(asText).filter(Boolean).join(' ')

// Order matters: AEW must be classified before generic wrestling/WWE and
// Formula 1 before generic racing/NASCAR. This prevents inherited source tags
// from winning over the explicit entity in the title/handle.
function explicitEntity(row) {
  const haystack = searchableText(row)
  if (/\b(?:aew|all\s+elite\s+wrestling)\b/i.test(haystack)) return { league: 'aew', sport: 'wrestling', evidence: 'AEW' }
  if (/\b(?:formula[-\s]*(?:1|one)|formel[-\s]*1|f1)\b/i.test(haystack)) return { league: 'formula1', sport: 'motorsports', evidence: 'FORMULA1' }
  if (/\bwwe\b|world\s+wrestling\s+entertainment/i.test(haystack)) return { league: 'wwe', sport: 'wrestling', evidence: 'WWE' }
  if (/\bnascar\b|national\s+association\s+for\s+stock\s+car/i.test(haystack)) return { league: 'nascar', sport: 'motorsports', evidence: 'NASCAR' }
  return null
}

const movedTagAliases = Object.freeze({
  aew: new Set(['wwe', 'wwe-wrestling']),
  formula1: new Set(['nascar', 'nascar-racing'])
})

function nextTags(row, entity) {
  const source = Array.isArray(row.tags) ? row.tags.map(asText).filter(Boolean) : []
  const remove = movedTagAliases[entity.league] || new Set()
  const tags = source.filter(tag => !remove.has(slugTag(tag)))
  const additions = [entity.league, entity.sport]
  if (entity.league === 'aew') additions.push('aew-wrestling')
  if (entity.league === 'formula1') additions.push('formula1-motorsports')
  return [...new Set([...tags, ...additions])]
}

function knownAnomalyRepair(row) {
  // This is the only legacy `league: listing` row with unambiguous entity and
  // product-type evidence in the current catalogue. Keep the guard narrow so
  // a future malformed row is reported for review instead of guessed.
  if (row?.id !== 'listing-2356f78b7197af7685f5') return null
  if (!/atlanta\s+hawks/i.test(searchableText(row)) || !/\bjersey\b/i.test(searchableText(row))) return null
  return {
    league: 'nba',
    sport: 'basketball',
    team: 'atlanta-hawks',
    category: 'Basketball Jerseys',
    productGroup: 'Basketball Jersey',
    evidence: 'KNOWN_NBA_TEAM_REPAIR'
  }
}

function legacyCopyRepair(row, league) {
  const replacement = league === 'aew' ? 'AEW' : league === 'formula1' ? 'Formula 1' : ''
  const legacy = league === 'aew' ? /\bwwe\b/gi : league === 'formula1' ? /\bnascar\b/gi : null
  if (!legacy) return null
  const replace = value => String(value || '').replace(legacy, replacement)
  const description = replace(row.description)
  const sourceSeo = row.seo && typeof row.seo === 'object' ? row.seo : null
  const seo = sourceSeo ? { ...sourceSeo, ...(sourceSeo.title ? { title: replace(sourceSeo.title) } : {}), ...(sourceSeo.description ? { description: replace(sourceSeo.description) } : {}) } : null
  const changed = description !== String(row.description || '') || JSON.stringify(seo) !== JSON.stringify(sourceSeo)
  return changed ? { description, seo } : null
}

function planFor(row) {
  const existing = row?.taxonomy && typeof row.taxonomy === 'object' ? row.taxonomy : {}
  const from = currentLeague(row)
  const anomaly = knownAnomalyRepair(row)
  if (anomaly) {
    const taxonomy = { ...existing, league: anomaly.league, sport: anomaly.sport, team: anomaly.team, category: anomaly.category, productGroup: anomaly.productGroup }
    const tags = ['jersey', anomaly.league, anomaly.team, 'basketball-jersey']
    const alreadyCanonical = existing.league === anomaly.league
      && existing.sport === anomaly.sport
      && existing.team === anomaly.team
      && existing.category === anomaly.category
      && existing.productGroup === anomaly.productGroup
      && row.product_group === anomaly.productGroup
      && JSON.stringify(Array.isArray(row.tags) ? row.tags : []) === JSON.stringify(tags)
    if (alreadyCanonical) return { action: 'KEEP', row, from, entity: anomaly, reason: 'ALREADY_CANONICAL' }
    return {
      action: 'UPDATE', row, from, to: anomaly.league, evidence: anomaly.evidence,
      taxonomy, tags, productGroup: anomaly.productGroup,
      changes: { league: from || null, sport: existing.sport || null, team: existing.team || null, productGroup: row.product_group || null, tags: true }
    }
  }
  const entity = explicitEntity(row)
  // Only rows with explicit evidence are eligible. A generic legacy row such
  // as `league: wwe` without a promotion token is intentionally left alone.
  if (!entity) return { action: 'KEEP', row, from, reason: 'NO_EXPLICIT_ENTITY' }
  const needsEntityMove = (entity.league === 'aew' && from !== 'aew')
    || (entity.league === 'formula1' && from !== 'formula1')
    || (entity.league === 'wwe' && from !== 'wwe' && from !== 'aew')
    || (entity.league === 'nascar' && from !== 'nascar' && from !== 'formula1')
  const needsSport = String(existing.sport || '').toLowerCase() !== entity.sport
  const tags = nextTags(row, entity)
  const tagsChanged = JSON.stringify(tags) !== JSON.stringify(Array.isArray(row.tags) ? row.tags : [])
  const copy = legacyCopyRepair(row, entity.league)
  if (!needsEntityMove && !needsSport && !tagsChanged && !copy) return { action: 'KEEP', row, from, entity, reason: 'ALREADY_CANONICAL' }
  const taxonomy = { ...existing, league: entity.league, sport: entity.sport }
  return {
    action: 'UPDATE',
    row,
    from,
    to: entity.league,
    evidence: entity.evidence,
    taxonomy,
    tags,
    productGroup: null,
    ...(copy ? { description: copy.description, seo: copy.seo, copyRepair: true } : {}),
    changes: {
      league: from || null,
      sport: existing.sport || null,
      tags: tagsChanged
    }
  }
}

const products = await allRows()
const plans = products.map(planFor)
const updates = plans.filter(item => item.action === 'UPDATE')
const unresolvedListing = products.filter(row => currentLeague(row) === 'listing' && !knownAnomalyRepair(row)).map(row => ({
  id: row.id, title: row.title, handle: row.handle, status: row.status, seoStatus: row.seo_status
}))
const counts = values => values.reduce((result, item) => {
  const key = item.to || item.from || item.reason || 'unknown'
  result[key] = (result[key] || 0) + 1
  return result
}, {})

const writes = []
const writeFailures = []
if (WRITE) {
  for (const item of updates) {
    const changes = { taxonomy: item.taxonomy, tags: item.tags }
    if (item.copyRepair) {
      changes.description = item.description
      if (item.seo) changes.seo = item.seo
    }
    if (item.productGroup) changes.product_group = item.productGroup
    let query = client.from('pod_products').update(changes).eq('id', item.row.id)
    if (item.row.updated_at) query = query.eq('updated_at', item.row.updated_at)
    const result = await query.select('id').maybeSingle()
    if (result.error) writeFailures.push({ id: item.row.id, error: result.error.message })
    else if (!result.data) writeFailures.push({ id: item.row.id, error: 'optimistic_guard_miss' })
    else writes.push({ id: item.row.id, from: item.from || null, to: item.to, evidence: item.evidence })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'WRITE' : 'DRY_RUN',
  scanned: products.length,
  plannedUpdates: updates.length,
  writes: writes.length,
  writeFailures,
  byTarget: counts(updates),
  unresolvedListingCount: unresolvedListing.length,
  unresolvedListing,
  samples: updates.slice(0, 100).map(item => ({ id: item.row.id, title: item.row.title, from: item.from, to: item.to, evidence: item.evidence, changes: item.changes })),
  report: reportPath
}

await mkdir(resolve(reportPath, '..'), { recursive: true })
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
