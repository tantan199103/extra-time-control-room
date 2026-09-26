import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { availableOptionValue, buildFallbackCatalog, buildMenuTree, findStorefrontProduct, initialSelections, isSellableVariant, menuTargetProblem, prepareStorefrontProduct, reconcileCart, resolveMenuImages, resolveVariant, sortCollectionProducts } from '../src/lib/storefront-model.js'
import { resolveCollectionArtwork } from '../src/lib/collection-artwork.js'
import { normalizeCatalogTaxonomy } from '../src/lib/league-taxonomy.js'
import { products as fallback } from '../src/data.js'

test('fallback catalogue has published-looking variants while live Supabase is unavailable', () => {
  const catalog=buildFallbackCatalog(fallback)
  assert.equal(catalog.length,fallback.length)
  assert.ok(catalog.every(product=>product.options.length===2 && product.variants.length===6))
  assert.equal(findStorefrontProduct(catalog,'after-90').handle,'after-90')
})

test('storefront taxonomy separates normalized team from controlled product group', () => {
  const normalized = normalizeCatalogTaxonomy({ title:'New York Yankees MLB Mini Cap Key Chain', productGroup:'New York Yankees', taxonomy:{ league:'mlb', team:'new-york-yankees' } })
  assert.equal(normalized.league,'mlb')
  assert.equal(normalized.team,'new-york-yankees')
  assert.equal(normalized.productGroup,'Accessories')
  assert.equal(normalized.category,'Accessories')
})

test('variation resolution respects option combinations and availability', () => {
  const product={options:[{name:'Size',values:['S','M']},{name:'Colour',values:['Black','White']}],variants:[
    {id:'s-black',status:'ACTIVE',inventory:2,values:{Size:'S',Colour:'Black'}},
    {id:'m-black',status:'ACTIVE',inventory:0,values:{Size:'M',Colour:'Black'}},
    {id:'m-white',status:'ACTIVE',inventory:3,values:{Size:'M',Colour:'White'}}
  ]}
  assert.equal(resolveVariant(product,{Size:'M',Colour:'White'}).id,'m-white')
  assert.equal(availableOptionValue(product,'Size','M',{Colour:'Black'}),false)
  assert.equal(availableOptionValue(product,'Size','M',{Colour:'White'}),true)
  assert.deepEqual(initialSelections(product,{Size:'S',Colour:'Purple'}),{Size:'S'})
})

test('cart reconciliation removes unavailable variants and clamps live quantity', () => {
  const products=[{id:'p',handle:'p',name:'Piece',image:'/p.webp',variants:[{id:'v',sku:'P-S',status:'ACTIVE',inventory:2,price:90,values:{Size:'S'}}]}]
  const result=reconcileCart([{key:'p|v',product:{id:'p',name:'Piece'},variantId:'v',qty:4,unitPrice:1}],products)
  assert.equal(result.items[0].qty,2)
  assert.equal(result.items[0].unitPrice,90)
  assert.match(result.issues[0].message,/reduced/)
  assert.equal(isSellableVariant(products[0].variants[0]),true)
})

test('collection merchandising and menu validation follow published contracts', () => {
  const products=[{id:'a',updatedAt:'2026-01-01',inventory:8},{id:'b',updatedAt:'2026-02-01',inventory:1}]
  const collection={products:['a','b'],productLinks:[{productId:'a',sortOrder:0,featured:false},{productId:'b',sortOrder:1,featured:true}],sort:'FEATURED'}
  assert.deepEqual(sortCollectionProducts(products,collection).map(row=>row.id),['b','a'])
  assert.equal(menuTargetProblem('/unknown-page','PAGE').length>0,true)
  assert.equal(menuTargetProblem('/moments','PAGE'),'')
  assert.equal(menuTargetProblem('/product/a','PRODUCT'),'')
})

test('menu trees preserve nesting and resolve representative images from linked records', () => {
  const tree = buildMenuTree([
    { id:'root', label:'After 90', target:'/product/after-90', link_type:'PRODUCT', sort_order:0, parent_id:null, image_mode:'AUTO' },
    { id:'child', label:'Custom', target:'/custom', link_type:'PAGE', sort_order:0, parent_id:'root', image_mode:'CUSTOM', image_url:'/custom.webp' }
  ])
  assert.equal(tree[0].children[0].id,'child')
  const resolved = resolveMenuImages([{ id:'main', items:tree }], {
    products:[{ id:'after-90', handle:'after-90', title:'After 90', image:'/after.webp' }],
    pages:[{ id:'custom', path:'/custom', representativeImage:'/page.webp', representativeAlt:'Custom page' }]
  })
  assert.equal(resolved[0].items[0].representativeImage,'/after.webp')
  assert.equal(resolved[0].items[0].representativeSource,'PRODUCT')
  assert.equal(resolved[0].items[0].children[0].representativeImage,'/custom.webp')
  assert.equal(resolved[0].items[0].children[0].representativeSource,'CUSTOM')
})

test('collection menu links keep missing covers explicit instead of borrowing another image', () => {
  const resolved = resolveMenuImages([{ id:'main', items:[{ id:'collection', label:'NHL', target:'/collection/nhl', type:'COLLECTION', imageMode:'AUTO', children:[] }] }], {
    collections:[{ id:'nhl', handle:'nhl', name:'NHL', hero:'', products:['other'] }],
    products:[{ id:'other', image:'/other-collection-product.webp' }]
  })
  assert.equal(resolved[0].items[0].representativeImage,'/assets/leagues/marks/nhl.webp')
  assert.equal(resolved[0].items[0].representativeSource,'LEAGUE_LOGO')
  assert.notEqual(resolved[0].items[0].representativeImage,'/other-collection-product.webp')
})

test('collection artwork prefers a checked-in team or league logo and uses category icons without unrelated media', () => {
  const league = resolveCollectionArtwork({ handle:'nfl', name:'NFL' })
  assert.equal(league.src,'/assets/leagues/marks/nfl.webp')
  assert.equal(league.source,'LEAGUE_LOGO')

  const team = resolveCollectionArtwork({ handle:'dallas-cowboys', name:'Dallas Cowboys' })
  assert.equal(team.src,'/assets/leagues/marks/teams/nfl/dallas-cowboys.webp')
  assert.equal(team.source,'TEAM_LOGO')

  const accessories = resolveCollectionArtwork({ handle:'accessories', name:'Accessories' }, [{ id:'unrelated', image:'/unrelated.webp' }])
  assert.equal(accessories.src,'')
  assert.equal(accessories.icon,'accessories')
  assert.equal(accessories.source,'CATEGORY_ICON')
})

test('production config serves dynamic collection handles and redirects the plural alias', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'))
  assert.ok(config.rewrites.some(rule => rule.source === '/collection/:path*' && rule.destination === '/index.html'))
  assert.ok(config.redirects.some(rule => rule.source === '/collections/:handle' && rule.destination === '/collection/:handle'))
})

test('storefront products do not expose private bridge audit metadata', () => {
  const product = prepareStorefrontProduct({
    id: 'private-audit', handle: 'private-audit', title: 'Private audit', status: 'PUBLISHED', ai_metadata: { bridge: { source: { provider: 'chatgpt-web' } } },
    media: [{ id: 'hero', type: 'IMAGE', url: '/hero.webp', bridge: { slotKey: 'hero', sourceHash: 'a'.repeat(64) } }], variants: []
  })
  assert.equal('aiMetadata' in product, false)
  assert.equal('ai_metadata' in product, false)
  assert.equal('bridge' in product.media[0], false)
})

test('storefront uses the public catalogue and server-validated custom request routes', async () => {
  const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  const studio=await readFile(new URL('../src/AiStudio.jsx',import.meta.url),'utf8')
  const adapter=await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8')
  const ai=await readFile(new URL('../api/ai-preview.js',import.meta.url),'utf8')
  const order=await readFile(new URL('../api/customization-order.js',import.meta.url),'utf8')
  assert.match(main,/fetchStorefrontCatalog/)
  assert.match(main,/product\.customFields/)
  assert.match(main,/selectedVariant/)
  assert.match(adapter,/fetch\('\/api\/customization-order'/)
  assert.doesNotMatch(adapter,/from\('pod_customization_orders'\)\.insert/)
  assert.match(ai,/pod_consume_api_quota|consumeQuota/)
  assert.match(ai,/createSignedUrl/)
  assert.match(ai,/buildExactPreviewDirection/)
  assert.match(ai,/prepareExactImageEdit/)
  assert.match(ai,/validateExactImageEdit/)
  assert.match(ai,/input_fidelity/)
  assert.match(ai,/form\.append\('mask'/)
  assert.match(ai,/gpt-image-2\.5-sunburst/)
  assert.match(ai,/gpt-image-2\.5-flare/)
  assert.match(ai,/if \(model !== 'gpt-image-2'\)/)
  assert.match(ai,/sanitizeImagePrivacyMetadata/)
  assert.match(studio,/designer-approved edit areas/i)
  assert.match(studio,/body:JSON\.stringify\(\{ sessionId:getCustomerSessionId\(\), productId:product\.id, values \}\)/)
  assert.doesNotMatch(studio,/className="ai-studio-prompt"/)
  assert.doesNotMatch(studio,/ai-studio-kit__shirt/)
  assert.match(order,/field this listing does not allow/)
  assert.match(order,/idempotencyKey/)
  assert.match(order,/AI preview reference is missing its stored preview ID/)
  const adminQueue=await readFile(new URL('../api/admin-customizations.js',import.meta.url),'utf8')
  assert.match(adminQueue,/requireAdmin/)
  assert.match(adminQueue,/createSignedUrl/)
  assert.match(adminQueue,/review_note/)
  assert.match(adminQueue,/NOTE_UPDATE/)
  assert.match(order,/assetRefs/)
  assert.match(adapter,/Menu media migration is not installed/)
})

test('storefront catalog pages use bounded card payloads and remote search', async () => {
  const adapter = await readFile(new URL('../src/lib/supabase.js',import.meta.url),'utf8')
  const main = await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(adapter,/fetchStorefrontCatalogPage/)
  assert.match(adapter,/range\(from,from \+ safeSize - 1\)/)
  assert.match(adapter,/STOREFRONT_CARD_FIELDS/)
  assert.match(adapter,/select\(STOREFRONT_CARD_FIELDS\)\.eq\('status','PUBLISHED'\)/)
  assert.doesNotMatch(adapter,/count:\s*'planned'/)
  assert.match(adapter,/sessionStorage/)
  assert.match(adapter,/source:'cache'/)
  assert.match(adapter,/fetchStorefrontSearch/)
  assert.match(main,/catalogState\.scope !== 'page'/)
  assert.match(main,/fetchStorefrontSearch\(value,12\)/)
  assert.match(main,/Refresh products/)
})

test('service worker excludes sensitive routes from runtime caching', async () => {
  const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
  assert.match(source,/url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(source,/url\.pathname\.startsWith\('\/admin'\)/)
})
