import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { productSeoMetadata, productStructuredData, relatedProducts, usd, safeJson } from '../src/lib/product-seo.js'
import { renderProductContent, renderSitemap, renderSitemapIndex } from '../scripts/seo-render.mjs'

const product = {
  id:'listing-1', handle:'test-jersey',title:'Test Home Jersey',status:'PUBLISHED',seoStatus:'INDEXABLE',
  description:'A test jersey with a verified size selection.',price:59.99,image:'/jersey.webp',
  media:[{type:'IMAGE',url:'/jersey.webp',alt:'Home view'}],taxonomy:{league:'nfl',team:'green-bay-packers'},
  options:[{name:'Size',values:['S','M']}], variants:[
    {id:'v-s',sku:'S-1',status:'ACTIVE',price:59.99,inventory:2,values:{Size:'S'}},
    {id:'v-m',sku:'M-1',status:'ACTIVE',price:69.5,inventory:0,values:{Size:'M'}}
  ]
}

test('published PDP metadata and variant schema use the same canonical product URL and exact USD prices', () => {
  const meta = productSeoMetadata(product)
  const [schema,breadcrumbs] = productStructuredData(product)
  assert.equal(meta.canonical,'https://www.jersevo.com/product/test-jersey')
  assert.equal(meta.indexable,true)
  assert.equal(schema['@type'],'ProductGroup')
  assert.deepEqual(schema.variesBy,['https://schema.org/size'])
  assert.deepEqual(schema.hasVariant.map(v=>v.offers.price),['59.99','69.50'])
  assert.deepEqual(schema.hasVariant.map(v=>v.offers.availability),['https://schema.org/InStock','https://schema.org/OutOfStock'])
  assert.equal(usd(59.99),'$59.99')
  assert.equal(usd(69.5),'$69.50')
  assert.equal(breadcrumbs.itemListElement.at(-1).item,meta.canonical)
})

test('PDP breadcrumb links to a team product page only after that landing is qualified', () => {
  const withoutType = productStructuredData({ ...product, productGroup:'Football Jersey' })[1]
  assert.equal(withoutType.itemListElement.some(item => item.item.endsWith('/team/nfl/green-bay-packers/jerseys')),false)
  const withType = productStructuredData({ ...product, productGroup:'Football Jersey' },'https://www.jersevo.com',{includeTeamProductType:true})[1]
  assert.equal(withType.itemListElement.some(item => item.item.endsWith('/team/nfl/green-bay-packers/jerseys')),true)
})

test('PDP keeps a complete merchant-written meta description beyond 160 characters', () => {
  const description = 'Detailed product information about the pictured jersey, listed sizes and customization choices. '.repeat(3)
  const metadata = productSeoMetadata({ ...product, seo:{description} })
  assert.equal(metadata.description,description.trim())
  assert.ok(metadata.description.length > 160)
})

test('HTML fallback has product copy, variant prices and crawlable related product links', () => {
  const html = renderProductContent({...product,customFields:[{key:'name',label:'Name',help:'Up to 12 characters'}],bulkOffers:[{minQty:2,discountPercent:10}],delivery:{production:'3–5 business days',transit:'5–8 business days'}},[{id:'listing-2',handle:'related',title:'Related Jersey'}])
  assert.match(html,/<h1>Test Home Jersey<\/h1>/)
  assert.match(html,/\$59\.99/)
  assert.match(html,/href="\/product\/test-jersey\?variant=v-s"/)
  assert.match(html,/href="\/product\/related"/)
  assert.match(html,/href="\/team\/nfl\/green-bay-packers"/)
  assert.match(html,/Personalization options/)
  assert.match(html,/Order programs/)
  assert.match(html,/Production is usually/)
})

test('blocked product is not indexable and no fabricated review or return promise enters Product schema', () => {
  const blocked = productSeoMetadata({...product,seoStatus:'BLOCKED'})
  const [schema] = productStructuredData(product)
  assert.equal(blocked.indexable,false)
  assert.equal('aggregateRating' in schema,false)
  assert.equal(JSON.stringify(schema).includes('MerchantReturnPolicy'),false)
  assert.equal(safeJson({text:'</script>'}).includes('</script>'),false)
})

test('taxonomy-invalid published products cannot become indexable PDPs or schema', () => {
  const stale = { ...product, title:'Green Bay Packers NHL Jersey', productGroup:'Hockey Jersey' }
  const metadata = productSeoMetadata(stale)
  assert.equal(metadata.indexable,false)
  assert.ok(metadata.taxonomy.blockers.includes('TAXONOMY_LEAGUE_TEXT_MISMATCH'))
  assert.deepEqual(productStructuredData(stale),[])
})

test('sitemap contains supplied canonical pages with useful lastmod and product images', () => {
  const xml = renderSitemap([
    {path:'/product/test-jersey'},
    {path:'/product/test-jersey',lastmod:'2026-09-24T00:00:00Z',images:['/jersey.webp']},
    {path:'/shop'}
  ],'https://www.jersevo.com')
  assert.equal((xml.match(/<url>/g)||[]).length,2)
  assert.match(xml,/<image:loc>https:\/\/www\.jersevo\.com\/jersey\.webp<\/image:loc>/)
  assert.match(xml,/<lastmod>2026-09-24T00:00:00\.000Z<\/lastmod>/)
  const index = renderSitemapIndex([{path:'/sitemap-products-1.xml',lastmod:'2026-09-24T00:00:00Z'},{path:'/sitemap-pages.xml'}],'https://www.jersevo.com')
  assert.match(index,/<sitemapindex/)
  assert.match(index,/<loc>https:\/\/www\.jersevo\.com\/sitemap-products-1\.xml<\/loc>/)
})

test('server routing does not send arbitrary paths to the indexable homepage shell', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'))
  assert.equal(config.rewrites.some(row=>row.source==='/(.*)' && row.destination==='/index.html'),false)
  assert.equal(config.rewrites.some(row=>row.source==='/sitemap.xml'),false)
  assert.equal(config.headers.find(row=>row.source==='/admin').headers[0].value,'noindex, nofollow')
})

test('custom jersey links use a published catalog target, not the retired touchline handle', async () => {
  const generator = await readFile(new URL('../scripts/generate-seo-pages.mjs',import.meta.url),'utf8')
  const storefront = await readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(generator,/jersevo-custom-product/)
  assert.match(generator,/featuredCustomProduct\.handle/)
  assert.match(storefront,/customProductTarget\(customProduct\)/)
  assert.doesNotMatch(generator,/\/product\/touchline/)
  assert.doesNotMatch(storefront,/\|\| 'touchline'/)
})

test('related products prioritize same team and group', () => {
  const catalog=[
    {id:'a',handle:'same-league',status:'PUBLISHED',taxonomy:{league:'nfl',team:'other'},productGroup:'Jerseys'},
    {id:'b',handle:'same-team',status:'PUBLISHED',taxonomy:{league:'nfl',team:'green-bay-packers'},productGroup:'Jerseys'},
    {id:'c',handle:'other',status:'PUBLISHED',taxonomy:{league:'nba',team:'lakers'},productGroup:'Jerseys'}
  ]
  assert.deepEqual(relatedProducts({...product,productGroup:'Jerseys'},catalog).map(row=>row.id),['b','a','c'])
})
