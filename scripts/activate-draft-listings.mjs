#!/usr/bin/env node

// Controlled bulk activation. Dry-run by default; --write is required for
// production mutation. Products without a priced, stocked variant remain
// DRAFT so the storefront never exposes an impossible-to-buy listing.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { normalizeCatalogTaxonomy } from '../src/lib/league-taxonomy.js'
import { classifyProductGroup } from '../src/lib/product-group-classifier.js'
import { seoReviewGate } from '../src/lib/catalog-model.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const WRITE = process.argv.includes('--write')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Math.max(0,Number(process.argv[limitArg + 1]) || 0) : 0
const reportPath = resolve(process.env.DRAFT_ACTIVATION_REPORT || 'artifacts/draft-activation-report.json')
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (new URL(url).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('Activation is restricted to the active Jersevo project.')

const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const words = value => String(value || '').replace(/[-_]+/g,' ').replace(/\b\w/g,character => character.toUpperCase()).trim()
const trimTitle = value => {
  const text = String(value || '').replace(/\s+/g,' ').trim()
  if (text.length <= 60) return text
  return text.slice(0,61).replace(/\s+\S*$/,'').replace(/[|–—-]+$/,'').trim()
}

function seoTitleFor(product, taxonomy, group) {
  const current = String(product.seo?.title || '').trim()
  if (current.length >= 30 && current.length <= 60) return current
  const team = taxonomy.team && taxonomy.team !== taxonomy.league ? words(taxonomy.team) : words(taxonomy.league)
  const lead = team ? `${team} ${group}` : group
  const generated = `${lead} | Jersevo`
  const candidate = generated.length >= 30 ? generated : `${product.title || lead} ${group} | Jersevo`
  const trimmed = trimTitle(candidate)
  return trimmed.length >= 30 ? trimmed : trimTitle(`${product.title || lead} fan gear by Jersevo`)
}

async function allRows(table, select, configure = query => query, pageSize = 500) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await configure(client.from(table).select(select).order('id')).range(offset,offset + pageSize - 1)
    if (result.error) throw new Error(`${table}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < pageSize) return rows
  }
}

const products = await allRows('pod_products','id,handle,title,description,status,image,media,content_blocks,tags,type,product_group,custom_fields,taxonomy,seo,seo_status,seo_quality_score,seo_block_reasons')
const variants = await allRows('pod_product_variants','id,product_id,status,price,inventory,option_values,sku')
const byProduct = new Map()
for (const variant of variants) byProduct.set(variant.product_id,[...(byProduct.get(variant.product_id) || []),variant])
const drafts = products.filter(product => product.status === 'DRAFT')
const report = { generatedAt:new Date().toISOString(),mode:WRITE?'WRITE':'DRY_RUN',scanned:drafts.length,selected:0,activatedVariants:0,published:0,ready:0,blocked:0,groups:{},skipped:[],items:[] }
const writeFailures = []
const candidates = []
for (const product of drafts) {
  const taxonomy = normalizeCatalogTaxonomy(product)
  const nextGroup = classifyProductGroup(product)
  const rows = byProduct.get(product.id) || []
  const sellable = rows.filter(row => row.status !== 'ARCHIVED' && Number(row.price) > 0 && Number(row.inventory) > 0)
  const nextVariants = rows.map(row => sellable.some(item => item.id === row.id) ? {...row,status:'ACTIVE'} : row)
  const nextSeo = {...(product.seo || {}),title:seoTitleFor(product,taxonomy,nextGroup)}
  const nextProduct = {...product,status:'PUBLISHED',productGroup:nextGroup,taxonomy,variants:nextVariants,seoStatus:product.seo_status || 'READY',seo:nextSeo,media:product.media || [],customFields:product.custom_fields || []}
  const gate = seoReviewGate(nextProduct)
  const blocked = !sellable.length || !product.image || gate.blockers.some(reason => ['PRIMARY_IMAGE_REQUIRED','TITLE_REQUIRED','DESCRIPTION_160_CHARACTERS','SEO_TITLE_30_60_CHARACTERS','SEO_DESCRIPTION_120_CHARACTERS','MEDIA_IMAGE_REQUIRED','ALT_TEXT_REQUIRED_ON_EVERY_IMAGE','PRICED_IN_STOCK_VARIANT_REQUIRED'].includes(reason))
  const item = { id:product.id,handle:product.handle,title:product.title,fromGroup:product.product_group || '',toGroup:nextGroup,team:taxonomy.team || '',league:taxonomy.league || '',sellableVariants:sellable.length,gate:gate.ready?'READY':'BLOCKED',blockers:gate.blockers }
  if (blocked) { report.blocked += 1; report.skipped.push({...item,reason:sellable.length ? 'SEO_TECHNICAL_GATE' : 'NO_PRICED_STOCKED_VARIANT'}); continue }
  const nextStatus = gate.ready ? 'INDEXABLE' : 'READY'
  candidates.push({product,nextProduct,taxonomy,rows,sellable,gate,nextStatus,item})
}
const selected = LIMIT ? candidates.slice(0,LIMIT) : candidates
report.selected = selected.length
for (const candidate of selected) {
  const {item,nextProduct,rows,sellable,gate,nextStatus} = candidate
  report.published += 1
  report.activatedVariants += sellable.length
  if (nextStatus === 'INDEXABLE') report.ready += 1
  report.groups[item.toGroup] = (report.groups[item.toGroup] || 0) + 1
  report.items.push({...item,nextStatus,score:gate.quality})
}
if (WRITE) {
  const concurrency = Math.max(1,Math.min(20,Number(process.env.DRAFT_ACTIVATION_CONCURRENCY || 12)))
  const writeOne = async candidate => {
    const {item,nextProduct,sellable,gate,nextStatus} = candidate
    const variantIds = sellable.map(row => row.id)
    if (variantIds.length) {
      const variantUpdate = await client.from('pod_product_variants').update({status:'ACTIVE'}).in('id',variantIds).eq('product_id',item.id)
      if (variantUpdate.error) throw new Error(`${item.id} variants: ${variantUpdate.error.message}`)
    }
    const seo = {...(nextProduct.seo || {}),status:nextStatus,quality_score:gate.quality,block_reasons:gate.blockers}
    const productUpdate = await client.from('pod_products').update({
      status:'PUBLISHED', product_group:item.toGroup, taxonomy:item.taxonomy, inventory:sellable.reduce((sum,row)=>sum + Number(row.inventory || 0),0),
      seo,seo_status:nextStatus,seo_quality_score:gate.quality,seo_block_reasons:gate.blockers,
      seo_reviewed_at:new Date().toISOString(),seo_published_at:nextStatus === 'INDEXABLE' ? new Date().toISOString() : null
    }).eq('id',item.id)
    if (productUpdate.error) throw new Error(`${item.id}: ${productUpdate.error.message}`)
  }
  for (let offset = 0; offset < selected.length; offset += concurrency) {
    const batch = selected.slice(offset,offset + concurrency)
    const results = await Promise.allSettled(batch.map(writeOne))
    results.forEach((result,index) => { if (result.status === 'rejected') writeFailures.push({ ...batch[index].item, error:result.reason?.message || 'Activation failed.' }) })
    if ((offset + batch.length) % 240 === 0 || offset + batch.length === selected.length) console.log(`Activated ${offset + batch.length}/${selected.length}`)
  }
}
report.writeFailures = writeFailures
await mkdir(resolve(reportPath,'..'),{recursive:true})
await writeFile(reportPath,JSON.stringify(report,null,2),'utf8')
console.log(JSON.stringify({...report,report:reportPath},null,2))
