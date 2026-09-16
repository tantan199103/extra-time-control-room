import test from 'node:test'
import assert from 'node:assert/strict'
import { isAdminUser, createProductDraft, normalizeProduct, normalizeTemplate, validateListing, buildListingInput, generateVariantMatrix } from '../src/lib/catalog-model.js'

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
test('drafts can be incomplete, publishing needs primary image and active variant', () => {
  const product=createProductDraft(); assert.deepEqual(validateListing(product),[])
  product.status='PUBLISHED'; assert.equal(validateListing(product).length,2)
})
test('save contract uses selected template IDs, not inferred names or fixed defaults', () => {
  const product=createProductDraft(); product.templateId='custom-template'; product.templateVersion='v2'
  const result=buildListingInput(product)
  assert.equal(result.template_id,'custom-template'); assert.equal(result.template_version,'v2')
  assert.equal(result.sku,product.sku); assert.deepEqual(result.options,[])
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
