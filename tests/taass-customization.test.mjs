import test from 'node:test'
import assert from 'node:assert/strict'
import { planTaassCustomization, TAASS_CUSTOM_COPY } from '../scripts/taass-customization-lib.mjs'
import { normalizeCustomFields, validateListing } from '../src/lib/catalog-model.js'
import { productPreviewReadiness } from '../src/lib/customization-ai.js'

test('TAASS custom request adds name, number and private studio-reviewed logo without changing status', () => {
  const row = {
    id:'listing-taass-1', title:'Toronto Blue Jays Cap', status:'PUBLISHED',
    description:'Authentic cap with multiple product photos.',
    custom_fields:[], content_blocks:[], tags:['mlb'], personalization:[]
  }
  const plan = planTaassCustomization(row)
  assert.deepEqual(plan.customFields.map(field => [field.key,field.type]), [
    ['name','text'], ['number','number'], ['teamLogo','logo']
  ])
  assert.ok(plan.customFields.every(field => field.studioReviewRequired))
  assert.equal(plan.customFields[2].previewRegion, null)
  assert.equal(plan.customFields[2].allowAiFinish, false)
  assert.equal(plan.customFields[2].requiresConsent, true)
  assert.equal(plan.type, 'PERSONALIZED')
  assert.equal(plan.typeChanged, true)
  assert.match(plan.description, /studio will review placement and feasibility/)
  assert.ok(plan.contentBlocks.some(block => block.content === TAASS_CUSTOM_COPY))
  assert.ok(plan.tags.includes('customizable'))
  assert.equal(productPreviewReadiness(plan.customFields).enabled, false)
  assert.equal(row.status, 'PUBLISHED')
})

test('TAASS customization planning is idempotent and preserves hand-approved fields', () => {
  const original = { id:'field-own', key:'name', label:'My Name', type:'text', required:true, previewRegion:{x:10,y:10,width:20,height:10} }
  const row = { id:'listing-2', description:'Product.', custom_fields:[original], content_blocks:[], tags:[], personalization:['My Name'] }
  const first = planTaassCustomization(row)
  assert.equal(first.customFields[0], original)
  assert.deepEqual(first.addedKeys, ['number','teamLogo'])
  const second = planTaassCustomization({ ...row, type:'PERSONALIZED', description:first.description, custom_fields:first.customFields, content_blocks:first.contentBlocks, tags:first.tags, personalization:first.personalization })
  assert.equal(second.changed, false)
})

test('studio review logo is valid for a published listing without inventing an edit rectangle', () => {
  const [logo] = normalizeCustomFields([{ id:'logo-1', key:'teamLogo', label:'Your logo', type:'logo', minWidth:800, studioReviewRequired:true, previewRegion:null }])
  const listing = {
    id:'listing-test', handle:'listing-test', title:'Test cap', price:29.95, status:'PUBLISHED',
    image:'https://example.com/cap.jpg', description:'A product available for custom requests.',
    seo:{title:'Test cap for sports fans at Jersevo',description:'Browse the test cap and request a name, number or logo. The studio reviews placement before production and confirms whether customization is possible.'},
    seoStatus:'READY', type:'READY TO SHIP', tags:['cap'], media:[], contentBlocks:[], customFields:[logo], options:[],
    variants:[{id:'v1',sku:'V1',values:{},price:29.95,inventory:1000,status:'ACTIVE'}]
  }
  assert.equal(validateListing(listing).some(error => /logo area/i.test(error)), false)
})
