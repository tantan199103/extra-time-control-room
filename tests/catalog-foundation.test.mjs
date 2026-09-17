import test from 'node:test'
import assert from 'node:assert/strict'
import { isAdminUser, createProductDraft, normalizeProduct, normalizeTemplate, validateListing, buildListingInput, generateVariantMatrix, normalizeCustomFields, duplicateProductDraft, deriveAutomaticTags, productCompleteness, slugify } from '../src/lib/catalog-model.js'

test('new listings have distinct IDs and SKUs', () => {
  const drafts = Array.from({length:30}, createProductDraft)
  assert.equal(new Set(drafts.map(row=>row.id)).size,30)
  assert.equal(new Set(drafts.map(row=>row.sku)).size,30)
  assert.ok(drafts.every(row=>!row._persisted && row.status==='DRAFT'))
})
test('customer-editable metadata cannot grant admin access', () => {
  assert.equal(isAdminUser({id:'x',user_metadata:{role:'admin'}}),false)
  assert.equal(isAdminUser({id:'x',app_metadata:{role:'admin'}}),false)
  assert.equal(isAdminUser({id:'x',app_metadata:{role:'ADMIN'}}),false)
  assert.equal(isAdminUser({id:'x',user_metadata:{extra_time_role:'admin'}}),false)
  assert.equal(isAdminUser({id:'x',app_metadata:{role:'ADMIN',extra_time_role:'admin'}}),true)
  assert.equal(isAdminUser({id:'x',app_metadata:{extra_time_role:'editor'}}),false)
  assert.equal(isAdminUser(null),false)
})
test('database product mapping preserves IDs, versions, zero and explicit empty variants', () => {
  const product=normalizeProduct({id:'a',title:'A',template_id:'venom-v1',template_version:'1.2',compare_at:0,pod_product_options:[],pod_product_variants:[]})
  assert.equal(product.templateId,'venom-v1'); assert.equal(product.templateVersion,'1.2')
  assert.equal(product.compareAt,0); assert.deepEqual(product.variants,[])
  assert.equal(product._persisted,true)
})
test('legacy personalization labels remain usable until structured fields are migrated', () => {
  const product=normalizeProduct({id:'legacy',title:'Legacy',type:'PERSONALIZED',custom_fields:[],personalization:['NAME + NUMBER','TEAM / CITY','YEAR','COLOUR']})
  assert.deepEqual(product.customFields.map(field=>field.key),['name','number','teamCity','year','color','photo'])
})
test('database template mapping keeps the full definition and cover', () => {
  const template=normalizeTemplate({definition:{zones:['back']},cover_image:'/cover.webp',editable_slots:[]})
  assert.deepEqual(template.templateDefinition,{zones:['back']})
  assert.equal(template.cover,'/cover.webp'); assert.deepEqual(template.editable,[])
})
test('invalid combinations, duplicate SKUs and invalid numbers are rejected', () => {
  const product=createProductDraft(); product.options=[{name:'Size',values:['M']}]
  product.variants=[{id:'a',sku:'TEST',values:{Size:'L'},price:-1,inventory:-2,status:'ACTIVE'}, {id:'b',sku:'test',values:{Size:'L'},price:1,inventory:1,status:'ACTIVE'}]
  const errors=validateListing(product).join(' ')
  assert.match(errors,/SKUs/); assert.match(errors,/price/); assert.match(errors,/stock/); assert.match(errors,/combination/)
})
test('drafts can be incomplete, publishing needs a complete sellable listing', () => {
  const product=createProductDraft(); assert.deepEqual(validateListing(product),[])
  product.status='PUBLISHED'
  const errors=validateListing(product).join(' ')
  assert.match(errors,/primary listing image/)
  assert.match(errors,/description/)
  assert.match(errors,/SEO/)
  assert.match(errors,/catalogue tag/)
  assert.match(errors,/priced, in-stock active variant/)
})
test('save contract makes listings own content and clears legacy template links', () => {
  const product=createProductDraft(); product.templateId='custom-template'; product.templateVersion='v2'
  product.media=[{id:'media-1',type:'IMAGE',url:'https://cdn.test/a.webp',alt:'Black football shirt'}]
  product.contentBlocks=[{id:'block-1',type:'paragraph',content:'The story.'}]
  product.tags=['Night Match','limited']; product.productGroup='Memory Jerseys'
  product.customFields=normalizeCustomFields(['Name','Number'])
  product.seo={title:'A title',description:'A description'}
  const result=buildListingInput(product)
  assert.equal(result.template_id,null); assert.equal(result.template_version,null)
  assert.equal(result.sku,product.sku); assert.deepEqual(result.options,[])
  assert.deepEqual(result.media,product.media); assert.deepEqual(result.content_blocks,product.contentBlocks)
  assert.deepEqual(result.tags,['night-match','limited']); assert.equal(result.product_group,'Memory Jerseys')
  assert.deepEqual(result.custom_fields.map(field=>field.key),['name','number'])
})

test('structured customer fields, catalogue signals and completeness are deterministic', () => {
  const product=createProductDraft()
  product.customFields=normalizeCustomFields(['Name','Number','Photo'])
  product.type='PERSONALIZED'; product.productGroup='Memory Jerseys'; product.tags=['night']
  product.media=[{id:'v',type:'VIDEO',url:'https://cdn.test/a.mp4'}]
  product.price=80; product.compareAt=100
  product.variants=[{id:'v1',sku:'ONE',values:{},price:80,compareAt:100,inventory:4,status:'ACTIVE'}]
  assert.deepEqual(product.customFields.map(field=>field.type),['text','number','photo'])
  assert.deepEqual(deriveAutomaticTags(product),['draft','personalized','memory-jerseys','customizable','has-video','sale','low-stock'])
  assert.equal(productCompleteness(product).percent,40)
  assert.equal(slugify('Áo Kỷ Niệm / 90+'),'ao-ky-niem-90')
})

test('duplicating a listing creates independent IDs, SKUs and a unique draft handle', () => {
  const product=createProductDraft(); product.handle='after-90'; product.title='After 90'; product.status='PUBLISHED'
  product.media=[{id:'old-media',type:'IMAGE',url:'https://cdn.test/a.webp'}]
  product.contentBlocks=[{id:'old-block',type:'paragraph',content:'Story'}]
  product.customFields=normalizeCustomFields(['Name'])
  product.variants=[{id:'old-var',sku:'OLD-SKU',values:{},price:90,inventory:2,status:'ACTIVE'}]
  const copy=duplicateProductDraft(product,[product,{handle:'after-90-copy'}])
  assert.notEqual(copy.id,product.id); assert.equal(copy.handle,'after-90-copy-2'); assert.equal(copy.status,'DRAFT')
  assert.notEqual(copy.media[0].id,product.media[0].id); assert.equal(copy.media[0].url,product.media[0].url)
  assert.notEqual(copy.contentBlocks[0].id,product.contentBlocks[0].id)
  assert.notEqual(copy.variants[0].id,product.variants[0].id); assert.notEqual(copy.variants[0].sku,product.variants[0].sku); assert.equal(copy.variants[0].status,'DRAFT')
})

test('variant matrix creates only missing combinations and preserves edited values', () => {
  const product=createProductDraft(); product.options=[{name:'Size',values:['S','M']},{name:'Color',values:['Black','White']}]
  product.variants=[{id:'existing',sku:'KEEP-ME',values:{Size:'S',Color:'Black'},price:125,inventory:9,status:'ACTIVE'}]
  const rows=generateVariantMatrix(product)
  assert.equal(rows.length,4); assert.equal(rows[0].sku,'KEEP-ME'); assert.equal(rows[0].price,125)
  assert.equal(rows.filter(row=>row.status==='DRAFT').length,3)
  assert.deepEqual(generateVariantMatrix({...product,variants:rows}),rows)
})
test('changing option combinations archives affected variants without deleting history', () => {
  const product=createProductDraft(); product.options=[{name:'Size',values:['M']}]
  product.variants=[{id:'old',sku:'OLD-S',values:{Size:'S'},price:89,inventory:3,status:'ACTIVE'}]
  const rows=generateVariantMatrix(product)
  assert.equal(rows.find(row=>row.id==='old').status,'ARCHIVED')
  assert.equal(rows.filter(row=>row.status==='DRAFT').length,1)
})
test('variant generation rejects duplicate options and excessive matrices', () => {
  const product=createProductDraft()
  assert.throws(()=>generateVariantMatrix({...product,options:[{name:'Size',values:['M','m']}]}),/unique/)
  assert.throws(()=>generateVariantMatrix({...product,options:[{name:'Size',values:Array.from({length:251},(_,i)=>`${i}`)}]}),/250/)
})
