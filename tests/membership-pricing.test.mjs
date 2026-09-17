import test from 'node:test'
import assert from 'node:assert/strict'
import { matchingRule, quoteCart, quoteLine } from '../api/_membership.js'

const now=new Date('2026-09-17T00:00:00Z')
const program={currency:'USD',default_discount_percent:20,max_discount_percent:40,min_margin_percent:20,shipping_policy:{enabled:true,eligible_zones:['US','VN'],method:'STANDARD',minimum_subtotal:50,subsidy_cap:15,excluded_product_tags:['oversize-shipping']}}
const active={status:'ACTIVE',current_period_end:'2027-01-01T00:00:00Z'}
const expired={status:'ACTIVE',current_period_end:'2026-01-01T00:00:00Z'}
const line={lineKey:'one',productId:'product-a',variantId:'variant-a',sku:'A-S',qty:1,price:100,compareAt:null,cost:30,tags:['jersey'],collections:['drop-1']}

test('non-members and expired memberships receive the public price',()=>{
  assert.equal(quoteLine({line,membership:null,program,rules:[],now}).finalUnit,100)
  assert.equal(quoteLine({line,membership:expired,program,rules:[],now}).finalUnit,100)
})

test('active members receive a capped rule with exact variation precedence',()=>{
  const rules=[
    {id:'all',name:'All',scope_type:'ALL',scope_value:'',discount_percent:20,priority:999,active:true},
    {id:'product',name:'Product',scope_type:'PRODUCT',scope_value:'product-a',discount_percent:30,priority:2,active:true},
    {id:'variant',name:'Variation',scope_type:'VARIANT',scope_value:'variant-a',discount_percent:60,priority:1,active:true}
  ]
  assert.equal(matchingRule(rules,line,now).id,'variant')
  const quote=quoteLine({line,membership:active,program,rules,now})
  assert.equal(quote.rule.requestedPercent,40)
  assert.equal(quote.finalUnit,60)
  assert.equal(quote.discount,40)
})

test('best public sale wins unless stacking is explicitly enabled',()=>{
  const sale={...line,price:70,compareAt:100}
  const rule={id:'default',name:'Default',scope_type:'ALL',scope_value:'',discount_percent:20,priority:0,active:true,stack_with_sale:false}
  assert.equal(quoteLine({line:sale,membership:active,program,rules:[rule],now}).finalUnit,70)
  assert.equal(quoteLine({line:sale,membership:active,program,rules:[{...rule,stack_with_sale:true}],now}).finalUnit,56)
})

test('margin floor prevents an unsafe member price',()=>{
  const protectedLine={...line,cost:70}
  const rule={id:'deep',name:'Deep',scope_type:'VARIANT',scope_value:'variant-a',discount_percent:40,priority:1,active:true}
  const quote=quoteLine({line:protectedLine,membership:active,program,rules:[rule],now})
  assert.equal(quote.finalUnit,87.5)
  assert.equal(quote.marginLimited,true)
})

test('cart quote reports member savings and eligible shipping without trusting client totals',()=>{
  const result=quoteCart({lines:[{...line,qty:2}],membership:active,program,rules:[],shipping:{country:'VN'},now})
  assert.equal(result.member,true)
  assert.equal(result.publicSubtotal,200)
  assert.equal(result.subtotal,160)
  assert.equal(result.discount,40)
  assert.deepEqual(result.shipping,{eligible:true,method:'STANDARD',subsidyCap:15,reason:'90+ Club benefit'})
  const excluded=quoteCart({lines:[{...line,tags:['oversize-shipping']}],membership:active,program,rules:[],shipping:{country:'VN'},now})
  assert.equal(excluded.shipping.eligible,false)
})

