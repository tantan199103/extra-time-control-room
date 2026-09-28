#!/usr/bin/env node

// Refresh only the SEO title for already-imported Comma rows. This maintenance
// command never changes commerce status, variants, stock, media or pricing.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { commaSeoTitle, inferCommaTaxonomy } from './comma-import-lib.mjs'

for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const name = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[name]) process.env[name] = value
  }
}

const write = process.argv.includes('--write')
const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!/^https?:\/\//i.test(url) || !key) throw new Error('SEO refresh requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
if (new URL(url).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('SEO refresh is restricted to the active Jersevo project.')

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: audits, error: auditError } = await client.from('pod_catalog_imports')
  .select('entity_id').eq('source', 'commafootball.com').eq('entity_type', 'PRODUCT')
if (auditError) throw new Error(`Cannot read Comma audit: ${auditError.message}`)
const ids = [...new Set((audits || []).map(row => row.entity_id).filter(Boolean))]
const { data: products, error: productError } = await client.from('pod_products')
  .select('id,title,product_group,seo,ai_metadata').in('id', ids)
if (productError) throw new Error(`Cannot read Comma products: ${productError.message}`)

const items = (products || []).map(product => {
  const group = product.product_group === 'Soccer Jersey' ? 'Jersey' : 'T-Shirt'
  const classification = inferCommaTaxonomy({ product_type: group })
  const title = commaSeoTitle(product.title, classification, product.ai_metadata?.catalogImport?.sourceId || product.id)
  return { id: product.id, title: product.title, current: product.seo?.title || '', next: title, seo: { ...(product.seo || {}), title } }
})
const changed = items.filter(item => item.current !== item.next)
if (write) {
  for (const item of changed) {
    const { error } = await client.from('pod_products').update({ seo: item.seo }).eq('id', item.id)
    if (error) throw new Error(`${item.id}: ${error.message}`)
  }
}
const unique = new Set(items.map(item => item.next)).size
console.log(JSON.stringify({ mode: write ? 'WRITE' : 'DRY_RUN', scanned: items.length, changed: changed.length, uniqueSeoTitles: unique, samples: changed.slice(0, 10).map(({ id, current, next }) => ({ id, current, next })) }, null, 2))
