import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { compositeLogo, logoRegionPixels } from '../api/_logo-composite.js'
import { assertCustomerAsset } from '../api/_logo-request.js'
import { normalizeCustomFields, validateListing } from '../src/lib/catalog-model.js'
import { normalizeProductPack } from '../src/lib/pod-bridge-contract.js'
import { routeModules } from '../backend/src/server.mjs'

test('logo fields keep a designer-owned slot and optional AI treatment', () => {
  const [field] = normalizeCustomFields([{ key:'teamLogo', label:'Team logo', type:'logo', allowAiFinish:true, requiresConsent:true, previewRegion:{ x:30, y:20, width:20, height:15 } }])
  assert.equal(field.type, 'logo')
  assert.equal(field.allowAiFinish, true)
  assert.equal(field.requiresConsent, true)
  assert.deepEqual(field.previewRegion, { x:30, y:20, width:20, height:15 })
  const draft = { id:'draft', handle:'draft', title:'Draft', status:'DRAFT', price:20, customFields:normalizeCustomFields([{ key:'teamLogo', label:'Team logo', type:'logo' }]), media:[], contentBlocks:[], tags:[], options:[], variants:[] }
  assert.doesNotThrow(() => validateListing(draft), 'drafts may define the slot after the first save')
  const published = { ...draft, status:'PUBLISHED', image:'/logo.webp', description:'Story', seo:{ title:'Draft', description:'Description' }, type:'READY', tags:['custom'], customFields:draft.customFields, variants:[{ id:'v1', sku:'ET-1', values:{}, price:20, inventory:1, status:'ACTIVE' }] }
  assert.match(validateListing(published).join(' '), /designer-approved logo area/i)
})

test('exact logo compositor changes only the approved region', async () => {
  const reference = await sharp({ create:{ width:200, height:160, channels:4, background:{ r:20, g:30, b:40, alpha:1 } } }).png().toBuffer()
  const logo = await sharp({ create:{ width:40, height:40, channels:4, background:{ r:230, g:20, b:30, alpha:1 } } }).png().toBuffer()
  const region = { x:25, y:25, width:25, height:25 }
  const slot = logoRegionPixels(200,160,region)
  assert.deepEqual(slot, { left:50, top:40, right:100, bottom:80 })
  const result = await compositeLogo(reference, logo, region)
  const image = await sharp(result.bytes).raw().toBuffer({ resolveWithObject:true })
  const outside = (x,y) => {
    const offset=(y*image.info.width+x)*4
    return [image.data[offset],image.data[offset+1],image.data[offset+2]]
  }
  assert.deepEqual(outside(0,0), [20,30,40])
  assert.deepEqual(outside(199,159), [20,30,40])
  assert.equal(image.info.width,200)
  assert.equal(image.info.height,160)
})

test('logo routes are kept on the protected Node runtime', () => {
  assert.equal(routeModules.get('/api/logo-preview'), 'logo-preview.js')
  assert.equal(routeModules.get('/api/ai-logo-preview'), 'ai-logo-preview.js')
})

test('customer logo assets stay inside the normalized private session path', () => {
  const identity = 'a'.repeat(64)
  const valid = { bucket:'customer-references', path:`product/${identity.slice(0,16)}/asset.png` }
  assert.deepEqual(assertCustomerAsset('product', identity, valid, { kind:'logo' }), valid)
  assert.throws(() => assertCustomerAsset('product', identity, { ...valid, path:`product/${identity.slice(0,16)}/../other.png` }, { kind:'logo' }), /does not belong/i)
  assert.throws(() => assertCustomerAsset('product', identity, { ...valid, path:`product/${identity.slice(0,16)}/asset.webp` }, { kind:'logo' }), /normalized private PNG/i)
})

test('bridge product packs preserve the controlled logo field contract', () => {
  const pack = normalizeProductPack({ title:'Badge edition', description:'A controlled badge jersey.', customFields:[{
    key:'teamLogo', label:'Team logo', type:'logo', previewRegion:{ x:12, y:18, width:20, height:16 }, allowAiFinish:false, minWidth:1200
  }] })
  const [field] = pack.content.customFields
  assert.equal(field.type, 'logo')
  assert.equal(field.allowAiFinish, false)
  assert.equal(field.minWidth, 1200)
  assert.deepEqual(field.previewRegion, { x:12, y:18, width:20, height:16 })
})
