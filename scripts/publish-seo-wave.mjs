#!/usr/bin/env node

// Controlled catalogue rollout.  This script intentionally separates the
// commerce transition (DRAFT -> PUBLISHED) from the SEO transition
// (BLOCKED/READY -> INDEXABLE).  It is deterministic, auditable and dry-run
// by default; --write is the only mode that changes Supabase.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { normalizeTeamSlug, taxonomySlug } from '../src/lib/league-taxonomy.js'

const TARGET_URL = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, 'https://ofetusgarxcwloxxkhnr.supabase.co'].find(value => /^https?:\/\//.test(String(value || ''))) || 'https://ofetusgarxcwloxxkhnr.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TARGET_SERVICE_KEY || ''
const WRITE = process.argv.includes('--write')
const REPORT_PATH = process.env.SEO_WAVE_REPORT || resolve('artifacts', 'seo-wave-report.json')
const PER_TEAM = Math.max(1, Number(process.env.SEO_WAVE_PER_TEAM || argValue('--per-team') || 10))
const LIMIT = Math.max(0, Number(argValue('--limit') || 0) || 0)
const TEAM_FILTER = String(process.env.SEO_WAVE_TEAMS || 'green-bay-packers,dallas-cowboys,denver-broncos')
  .split(',').map(item => taxonomySlug(item)).filter(Boolean)
const RISKY_TITLE = /\b(?:spider[- ]?man|marvel|disney|nike|adidas|official|authentic|licensed|replica|national football league|major league baseball|nba|mls)\b/i

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : ''
}

function clean(value) {
  return String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function mediaList(product) {
  const media = Array.isArray(product.media) ? product.media.filter(item => item && item.url) : []
  if (media.length) return media
  return product.image ? [{ id: `media-${product.id}`, type: 'IMAGE', url: product.image, alt: `${product.title || 'Product'} product image` }] : []
}

function taxonomyFor(product) {
  const source = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const league = taxonomySlug(source.league || product.league || '')
  const team = normalizeTeamSlug(league, source.team || product.team || '')
  return { ...source, league, team, ...(league ? { sport: source.sport || ({ nfl: 'football', mlb: 'baseball', nba: 'basketball', mls: 'soccer' }[league] || '') } : {}) }
}

function activeSellable(variants) {
  return variants.filter(row => row.status === 'ACTIVE' && Number(row.price) > 0 && Number(row.inventory) > 0)
}

function eligibleVariants(variants) {
  return variants.filter(row => row.status !== 'ARCHIVED' && Number(row.price) > 0 && Number(row.inventory) > 0)
}

function gateFor(product, taxonomy, variants, image) {
  const reasons = []
  const description = clean(product.description)
  const seo = product.seo && typeof product.seo === 'object' ? product.seo : {}
  if (!image) reasons.push('MISSING_PRIMARY_IMAGE')
  if (description.length < 160) reasons.push('DESCRIPTION_TOO_SHORT')
  if (!clean(seo.title) || clean(seo.title).length < 30 || clean(seo.title).length > 65) reasons.push('SEO_TITLE_LENGTH')
  if (!clean(seo.description) || clean(seo.description).length < 120 || clean(seo.description).length > 180) reasons.push('SEO_DESCRIPTION_LENGTH')
  if (!taxonomy.league && !taxonomy.team) reasons.push('TAXONOMY_REVIEW_REQUIRED')
  const sellable = activeSellable(variants)
  if (!sellable.length) reasons.push('NO_STOCKED_VARIANT')
  const score = Math.max(0, Math.min(100,
    (image ? 15 : 0) + (mediaList({ ...product, image }).length >= 2 ? 10 : image ? 6 : 0) +
    (description.length >= 220 ? 20 : description.length >= 160 ? 14 : 0) +
    (clean(seo.title).length >= 30 && clean(seo.title).length <= 60 ? 15 : 0) +
    (clean(seo.description).length >= 145 && clean(seo.description).length <= 175 ? 15 : 0) +
    (Array.isArray(product.content_blocks) && product.content_blocks.length >= 2 ? 6 : 0) +
    (sellable.length ? 15 : 0)
  ))
  return { reasons, score, status: reasons.length ? 'BLOCKED' : 'INDEXABLE' }
}

async function allRows(client, table, select, pageSize = 1000) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select(select).range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

async function main() {
  if (!/^https?:\/\//.test(TARGET_URL)) throw new Error('SUPABASE_URL must be an HTTP(S) URL.')
  if (WRITE && !/^sb_secret_|^eyJ/.test(SERVICE_KEY)) throw new Error('Write mode requires SUPABASE_SERVICE_ROLE_KEY (server-only).')
  const client = createClient(TARGET_URL, SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } })
  const products = await allRows(client, 'pod_products', 'id,handle,title,description,status,image,media,content_blocks,seo,seo_status,seo_quality_score,seo_block_reasons,taxonomy,product_group,updated_at')
  const variants = await allRows(client, 'pod_product_variants', 'id,product_id,status,price,inventory,sku,option_values')
  const variantsByProduct = new Map()
  for (const row of variants) variantsByProduct.set(row.product_id, [...(variantsByProduct.get(row.product_id) || []), row])

  const candidates = []
  const skipped = []
  for (const product of products) {
    const taxonomy = taxonomyFor(product)
    if (!TEAM_FILTER.includes(taxonomy.team)) continue
    if (product.status === 'ARCHIVED') { skipped.push({ id: product.id, reason: 'ARCHIVED' }); continue }
    if (RISKY_TITLE.test(product.title || '')) { skipped.push({ id: product.id, title: product.title, reason: 'IP_OR_AFFILIATION_REVIEW' }); continue }
    const rows = variantsByProduct.get(product.id) || []
    const eligible = eligibleVariants(rows)
    const image = product.image || mediaList(product).find(item => item.type !== 'VIDEO')?.url || ''
    const gate = gateFor(product, taxonomy, rows.map(row => ({ ...row, status: eligible.some(item => item.id === row.id) ? 'ACTIVE' : row.status })), image)
    if (!eligible.length) { skipped.push({ id: product.id, title: product.title, team: taxonomy.team, reason: 'NO_PRICED_STOCKED_VARIANT' }); continue }
    if (!image) { skipped.push({ id: product.id, title: product.title, team: taxonomy.team, reason: 'MISSING_PRIMARY_IMAGE' }); continue }
    candidates.push({ product, taxonomy, rows, eligible, image, gate })
  }

  // Stable ordering makes dry-run reports reproducible and avoids selecting a
  // new product merely because another row was edited in the meantime.
  candidates.sort((a, b) => `${a.taxonomy.team}/${a.product.title}/${a.product.id}`.localeCompare(`${b.taxonomy.team}/${b.product.title}/${b.product.id}`))
  const selected = []
  const counts = new Map()
  for (const candidate of candidates) {
    const count = counts.get(candidate.taxonomy.team) || 0
    if (count >= PER_TEAM) continue
    counts.set(candidate.taxonomy.team, count + 1)
    selected.push(candidate)
  }
  const limited = LIMIT ? selected.slice(0, LIMIT) : selected
  const selectedByTeam = new Map()
  for (const item of limited) selectedByTeam.set(item.taxonomy.team, (selectedByTeam.get(item.taxonomy.team) || 0) + 1)

  if (WRITE) {
    for (const candidate of limited) {
      const sellableIds = new Set(candidate.eligible.map(row => row.id))
      const { error: variantError } = await client.from('pod_product_variants').update({ status: 'ACTIVE' }).in('id', [...sellableIds]).eq('product_id', candidate.product.id)
      if (variantError) throw new Error(`${candidate.product.id} variants: ${variantError.message}`)
      const nextVariants = candidate.rows.map(row => sellableIds.has(row.id) ? { ...row, status: 'ACTIVE' } : row)
      const gate = gateFor(candidate.product, candidate.taxonomy, nextVariants, candidate.image)
      if (gate.status !== 'INDEXABLE') throw new Error(`${candidate.product.id} remains blocked: ${gate.reasons.join(', ')}`)
      const seo = { ...(candidate.product.seo || {}), status: gate.status, quality_score: gate.score, block_reasons: gate.reasons }
      const { error: productError } = await client.from('pod_products').update({
        status: 'PUBLISHED', image: candidate.image, inventory: nextVariants.filter(row => row.status === 'ACTIVE').reduce((sum, row) => sum + Number(row.inventory || 0), 0),
        seo, seo_status: gate.status, seo_quality_score: gate.score, seo_block_reasons: gate.reasons,
        seo_reviewed_at: new Date().toISOString(), seo_published_at: new Date().toISOString()
      }).eq('id', candidate.product.id)
      if (productError) throw new Error(`${candidate.product.id}: ${productError.message}`)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(), mode: WRITE ? 'WRITE' : 'DRY_RUN', targetProject: new URL(TARGET_URL).hostname.split('.')[0],
    teams: TEAM_FILTER, perTeam: PER_TEAM, scanned: products.length, selected: limited.length,
    selectedByTeam: Object.fromEntries([...selectedByTeam.entries()]), skipped: skipped.length,
    publishable: limited.filter(item => item.gate.status === 'INDEXABLE').length,
    items: limited.map(item => ({ id: item.product.id, title: item.product.title, team: item.taxonomy.team, league: item.taxonomy.league, variantCount: item.eligible.length, image: Boolean(item.image), score: item.gate.score, reasons: item.gate.reasons })),
    skippedSamples: skipped.slice(0, 80), report: REPORT_PATH
  }
  await mkdir(resolve(REPORT_PATH, '..'), { recursive: true })
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => {
  console.error(`SEO wave failed: ${error instanceof Error ? error.message : (error?.message || JSON.stringify(error))}`)
  process.exitCode = 1
})
