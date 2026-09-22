import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { catalogLegalReview, validateListing } from '../src/lib/catalog-model.js'
import { productPreviewReadiness } from '../src/lib/customization-ai.js'
import { looksTruncatedSeoText, seoDescription, truncateSeoText } from '../src/lib/seo-text.js'

test('SEO descriptions end at a sentence or word boundary', () => {
  const long = 'First complete sentence explains the design and why it matters to supporters everywhere. Second complete sentence contains extra detail that should not be cut in the middle of a word or thought.'
  const result = truncateSeoText(long, 120, 60)
  assert.equal(result, 'First complete sentence explains the design and why it matters to supporters everywhere.')
  assert.ok(result.length <= 120)
  assert.equal(looksTruncatedSeoText('The product page keeps the'), true)
  assert.match(seoDescription('The product page keeps the', long, 120), /\.$/)
})

test('visual preview readiness requires an explicit designer region', () => {
  const result = productPreviewReadiness([
    { key:'name', label:'Name', type:'text', previewRegion:null },
    { key:'number', label:'Number', type:'number', previewRegion:{x:20,y:30,width:20,height:10} },
    { key:'note', label:'Note', type:'textarea' }
  ])
  assert.equal(result.enabled, true)
  assert.equal(result.readyCount, 1)
  assert.deepEqual(result.missingFields.map(field => field.key), ['name'])
})

test('league and team listings save freely without review, while major brands require operator review', () => {
  const cleanFanJersey = {
    id:'p1', handle:'packers-piece', title:'Packers supporter jersey', price:80, compareAt:null,
    status:'PUBLISHED', image:'/piece.webp', description:'A sufficiently complete product description.',
    seo:{title:'Packers supporter jersey by Extra Time',description:'An independent supporter jersey with clear sizing, tracked delivery and considered personalization.'},
    seoStatus:'READY', media:[], contentBlocks:[], tags:['football', 'supporter'], type:'READY TO SHIP',
    taxonomy:{league:'nfl',team:'green-bay-packers'}, customFields:[], options:[],
    variants:[{id:'v1',sku:'ET-V1',values:{},price:80,inventory:2,status:'ACTIVE'}], aiMetadata:{}
  }
  // Clean league and team references do NOT require review
  assert.equal(catalogLegalReview(cleanFanJersey).required, false)
  assert.doesNotMatch(validateListing(cleanFanJersey).join(' '), /Rights and affiliation review required/)

  // Major brand references (e.g., Nike, Adidas) DO require operator review
  const brandedProduct = {
    ...cleanFanJersey,
    id:'p2',
    tags:['football', 'nike']
  }
  assert.equal(catalogLegalReview(brandedProduct).required, true)
  assert.match(validateListing(brandedProduct).join(' '), /Rights and affiliation review required/)

  // Once approved by operator, branded listing publishes cleanly
  brandedProduct.aiMetadata = { catalogReview: { status: 'APPROVED' } }
  assert.doesNotMatch(validateListing(brandedProduct).join(' '), /Rights and affiliation review required/)
})

test('newsletter endpoint is routed to the server and stores explicit consent only', async () => {
  const [route, server, migration, main] = await Promise.all([
    readFile(new URL('../api/newsletter-subscribe.js', import.meta.url),'utf8'),
    readFile(new URL('../backend/src/server.mjs', import.meta.url),'utf8'),
    readFile(new URL('../supabase/migrations/202609250001_newsletter_subscribers.sql', import.meta.url),'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url),'utf8')
  ])
  assert.match(route, /body\.consent !== true/)
  assert.match(route, /enforceSameOrigin/)
  assert.match(server, /newsletter-subscribe/)
  assert.match(migration, /enable row level security/)
  assert.match(main, /I agree to receive Extra Time product and early-access emails/)
})

test('machine-readable launch files are valid and linked', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/ai-catalog.json', import.meta.url),'utf8'))
  const llms = await readFile(new URL('../public/llms.txt', import.meta.url),'utf8')
  assert.equal(catalog.store.legalName,'Jersevo')
  assert.match(llms,/^# Extra Time by Jersevo/m)
  assert.match(llms,/\[XML sitemap\]\(https:\/\/www\.jersevo\.com\/sitemap\.xml\)/)
})
