#!/usr/bin/env node

// Read-only audit of the current production SEO gate. The report is local and
// never changes publication, stock, pricing, or Search Console state.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { seoReviewGate } from '../src/lib/catalog-model.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the SEO audit.')
const reportPath = resolve(process.env.SEO_GATE_AUDIT_REPORT || 'artifacts/seo-gate-audit.json')
const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})

async function allRows(table, columns, pageSize = 250, configure = query => query) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await configure(client.from(table).select(columns).order('id')).range(offset,offset + pageSize - 1)
    if (result.error) throw new Error(`${table} page ${offset}: ${result.error.message}`)
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < pageSize) return rows
  }
}

const summaries = await allRows('pod_products','id,handle,title,status,seo_status,seo_block_reasons,seo_quality_score',500)
const activeVariants = await allRows('pod_product_variants','id,product_id,status,price,inventory',500,query => query.eq('status','ACTIVE'))
const variantsByProduct = new Map()
for (const variant of activeVariants) {
  const rows = variantsByProduct.get(variant.product_id) || []
  rows.push(variant)
  variantsByProduct.set(variant.product_id,rows)
}
const published = await allRows('pod_products','id,handle,title,status,description,image,media,seo,seo_status,ai_metadata,tags',100,query => query.eq('status','PUBLISHED'))
const actualGateFailures = []
for (const row of published) {
  const gate = seoReviewGate({
    ...row,
    aiMetadata:row.ai_metadata,
    variants:variantsByProduct.get(row.id) || []
  })
  if (!gate.ready) actualGateFailures.push({id:row.id,handle:row.handle,title:row.title,storedStatus:row.seo_status,blockers:gate.blockers})
}
const byStatus = {}
const storedReasons = {}
const notIndexable = []
for (const row of summaries) {
  const state = `${row.status}/${row.seo_status}`
  byStatus[state] = (byStatus[state] || 0) + 1
  for (const reason of row.seo_block_reasons || []) storedReasons[reason] = (storedReasons[reason] || 0) + 1
  if (row.status !== 'PUBLISHED' || row.seo_status !== 'INDEXABLE') notIndexable.push({
    id:row.id,handle:row.handle,title:row.title,status:row.status,seoStatus:row.seo_status,
    blockers:row.seo_block_reasons || []
  })
}
const report = {
  generatedAt:new Date().toISOString(),project:new URL(url).hostname.split('.')[0],
  total:summaries.length,byStatus,storedReasons,
  publishedFailingSharedGate:actualGateFailures.length,
  actualGateFailures,
  notIndexable
}
await mkdir(resolve(reportPath,'..'),{recursive:true})
await writeFile(reportPath,JSON.stringify(report,null,2),'utf8')
console.log(JSON.stringify({
  generatedAt:report.generatedAt,project:report.project,total:report.total,
  byStatus,storedReasons,publishedFailingSharedGate:actualGateFailures.length,
  actualGateFailureSamples:actualGateFailures.slice(0,20),report:reportPath
},null,2))
