import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
const member=await readFile(new URL('../src/MembershipPage.jsx',import.meta.url),'utf8')
const admin=await readFile(new URL('../src/AdminMembership.jsx',import.meta.url),'utf8')
const adapter=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8')
const enrollment=await readFile(new URL('../api/membership-enroll.js',import.meta.url),'utf8')
const quote=await readFile(new URL('../api/member-quote.js',import.meta.url),'utf8')
const worker=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')

test('membership is reachable from storefront, product, account and app navigation',()=>{
  assert.match(main,/path === '\/membership'/)
  assert.match(main,/90\+ CLUB/)
  assert.match(main,/pdp__club/)
  assert.match(main,/id: 'leagues'/)
  assert.match(main,/membership#account/)
})

test('enrollment language never implies payment or immediate activation',()=>{
  assert.match(member,/No payment has been taken/)
  assert.match(member,/does not charge you or claim that membership is active/)
  assert.match(enrollment,/status:'PENDING'/)
  assert.doesNotMatch(enrollment,/status:'ACTIVE'/)
  assert.match(enrollment,/An enrollment request alone|membership is not active yet/i)
})

test('member quote accepts only line identity and resolves authoritative prices server-side',()=>{
  assert.match(adapter,/productId:item\.product\.id,variantId:item\.variantId,qty:item\.qty/)
  assert.doesNotMatch(adapter,/lines=cart\.map\([^\n]+unitPrice/)
  assert.match(quote,/pod_product_variants/)
  assert.match(quote,/select\('id,product_id,sku,price,compare_at,cost,inventory,status'\)/)
  assert.match(quote,/variant\.inventory/)
  assert.match(quote,/pod_memberships/)
})

test('admin membership controls expose plans, rules, queue, policy and guarded manual activation',()=>{
  for(const label of ['Plans & billing','Benefit rules','Members','Policies']) assert.match(admin,new RegExp(label.replace('&','&')))
  assert.match(admin,/window\.confirm\('Activate this membership manually/)
  assert.match(admin,/saveAdminMembership/)
  assert.match(admin,/approveMembershipRequest/)
  assert.match(admin,/Maximum discount %/)
})

test('sensitive account paths and every API route stay outside service-worker caching',()=>{
  assert.match(worker,/url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(worker,/url\.pathname\.startsWith\('\/account'\)/)
})
