#!/usr/bin/env node

// Correct merchandise groups after a bulk publish without touching offers,
// inventory, customization fields, status, or SEO approval. Dry-run by default.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { categoryForGroup, classifyProductGroup } from '../src/lib/product-group-classifier.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const WRITE = process.argv.includes('--write')
const reportPath = resolve(process.env.GROUP_RECONCILIATION_REPORT || 'artifacts/group-reconciliation-report.json')
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
if (new URL(url).hostname !== 'ofetusgarxcwloxxkhnr.supabase.co') throw new Error('Group reconciliation is restricted to the active Jersevo project.')
const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})

const rows = []
for (let offset = 0; ; offset += 500) {
  const result = await client.from('pod_products').select('id,title,status,product_group,taxonomy,updated_at').eq('status','PUBLISHED').order('id').range(offset,offset + 499)
  if (result.error) throw new Error(`Catalog page ${offset}: ${result.error.message}`)
  rows.push(...(result.data || []))
  if (!result.data || result.data.length < 500) break
}
const changes = rows.map(row => {
  const nextGroup = classifyProductGroup(row)
  return {row,nextGroup,nextCategory:categoryForGroup(nextGroup)}
}).filter(item => item.row.product_group !== item.nextGroup)
const samples = changes.slice(0,35).map(({row,nextGroup,nextCategory}) => ({
  id:row.id,title:row.title,sourceGroup:row.taxonomy?.productGroup || '',current:row.product_group,nextGroup,nextCategory
}))
const byChange = {}
for (const {row,nextGroup} of changes) {
  const key = `${row.product_group || '(empty)'} -> ${nextGroup}`
  byChange[key] = (byChange[key] || 0) + 1
}
const report = {generatedAt:new Date().toISOString(),mode:WRITE?'WRITE':'DRY_RUN',scanned:rows.length,changed:changes.length,byChange,samples,updated:0,conflicts:[],failures:[]}
if (WRITE) {
  const concurrency = Math.max(1,Math.min(16,Number(process.env.GROUP_RECONCILIATION_CONCURRENCY || 8)))
  for (let offset = 0; offset < changes.length; offset += concurrency) {
    const batch = changes.slice(offset,offset + concurrency)
    const results = await Promise.allSettled(batch.map(async ({row,nextGroup,nextCategory}) => {
      const taxonomy = {...(row.taxonomy || {}),productGroup:nextGroup,category:nextCategory}
      const result = await client.from('pod_products').update({product_group:nextGroup,taxonomy})
        .eq('id',row.id).eq('status','PUBLISHED').eq('product_group',row.product_group)
        .eq('updated_at',row.updated_at).select('id')
      if (result.error) throw new Error(result.error.message)
      return result.data?.length === 1
    }))
    results.forEach((result,index) => {
      if (result.status === 'rejected') report.failures.push({id:batch[index].row.id,error:result.reason?.message || 'Update failed'})
      else if (result.value) report.updated += 1
      else report.conflicts.push(batch[index].row.id)
    })
    if ((offset + batch.length) % 160 === 0 || offset + batch.length === changes.length) console.log(`Reconciled ${offset + batch.length}/${changes.length}`)
  }
}
await mkdir(resolve(reportPath,'..'),{recursive:true})
await writeFile(reportPath,JSON.stringify(report,null,2),'utf8')
console.log(JSON.stringify({...report,report:reportPath},null,2))
if (report.failures.length) process.exitCode = 2
