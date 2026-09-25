import test from 'node:test'
import assert from 'node:assert/strict'
import { ACCESSORY_FAMILY_OPTIONS, ACCESSORY_TYPE_OPTIONS, ALL_CATALOG_CATEGORY_PAGES, CATALOG_CATEGORY_PAGES, accessoryTaxonomyForProduct, catalogCategoryByHandle, catalogIconForProduct, productMatchesCatalogCategory } from '../src/lib/catalog-taxonomy.js'
import { CATALOG_PAGE_SIZE, catalogPagePath, pageCount, parseCatalogPagePath } from '../src/lib/catalog-pagination.js'
import { findLeague, findTeam, leaguePath, teamPath } from '../src/lib/league-taxonomy.js'
import { applyCollectionMembership, collectionMembershipDiff } from '../src/lib/collection-assignment.js'
import { buildCollectionTree, collectionDescendantIds, collectionParentId, flattenCollectionTree } from '../src/lib/collection-tree.js'

test('category landing pages match the controlled catalogue taxonomy', () => {
  const football = catalogCategoryByHandle('football-jerseys')
  assert.equal(football.value, 'Football Jerseys')
  assert.equal(productMatchesCatalogCategory({ taxonomy:{ category:'Football Jerseys' }, productGroup:'Jerseys' }, football), true)
  assert.equal(productMatchesCatalogCategory({ taxonomy:{ category:'Basketball Jerseys' }, productGroup:'Jerseys' }, football), false)
  const custom = catalogCategoryByHandle('custom-jerseys')
  assert.equal(productMatchesCatalogCategory({ productGroup:'Jerseys', customFields:[{ key:'name' }] }, custom), true)
  assert.equal(productMatchesCatalogCategory({ productGroup:'Caps', customFields:[{ key:'name' }] }, custom), false)
  assert.equal(productMatchesCatalogCategory({ customFields:[] }, custom), false)
  assert.equal(new Set(CATALOG_CATEGORY_PAGES.map(item => item.handle)).size, CATALOG_CATEGORY_PAGES.length)
  assert.equal(catalogCategoryByHandle('caps').icon,'cap')
  assert.equal(catalogCategoryByHandle('knit-hats').icon,'beanie')
  assert.equal(productMatchesCatalogCategory({productGroup:'Caps'},catalogCategoryByHandle('caps')),true)
  assert.equal(productMatchesCatalogCategory({productGroup:'Knit Hats'},catalogCategoryByHandle('knit-hats')),true)
  assert.equal(productMatchesCatalogCategory({productGroup:'Caps'},catalogCategoryByHandle('knit-hats')),false)
  assert.equal(catalogIconForProduct({productGroup:'Caps'}),'cap')
  assert.equal(catalogIconForProduct({productGroup:'Knit Hats'}),'beanie')
  assert.equal(catalogIconForProduct({productGroup:'Football Jersey',customFields:[{key:'name'}]}),'custom')
})

test('Accessories has family and type routes while legacy groups remain discoverable', () => {
  const backpack = { title:'Dallas Cowboys backpack', productGroup:'Backpacks', taxonomy:{ category:'Accessories' } }
  const scarf = { title:'Winter supporters scarf', productGroup:'Accessories', taxonomy:{ category:'Accessories' } }
  const cap = { title:'Boston Celtics snapback cap', productGroup:'Apparel', taxonomy:{ category:'Accessories' } }
  assert.deepEqual(accessoryTaxonomyForProduct(backpack), { isAccessory:true, family:'Bags', type:'Bags' })
  assert.deepEqual(accessoryTaxonomyForProduct(scarf), { isAccessory:true, family:'Scarves & cold weather', type:'Scarves' })
  assert.deepEqual(accessoryTaxonomyForProduct(cap), { isAccessory:true, family:'Headwear', type:'Caps' })
  assert.equal(productMatchesCatalogCategory(backpack, catalogCategoryByHandle('bags')), true)
  assert.equal(productMatchesCatalogCategory(backpack, catalogCategoryByHandle('headwear')), false)
  assert.equal(productMatchesCatalogCategory(scarf, catalogCategoryByHandle('scarves-cold-weather')), true)
  assert.equal(productMatchesCatalogCategory(cap, catalogCategoryByHandle('caps')), true)
  assert.ok(ACCESSORY_FAMILY_OPTIONS.length >= 7)
  assert.ok(ACCESSORY_TYPE_OPTIONS.some(option => option.value === 'Flags & banners'))
  assert.equal(new Set(ALL_CATALOG_CATEGORY_PAGES.map(item => item.handle)).size, ALL_CATALOG_CATEGORY_PAGES.length)
})

test('merchandise icons appear in menu, landing pages and product cards without replacing labels', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/main.jsx',import.meta.url),'utf8')
  const icon = await (await import('node:fs/promises')).readFile(new URL('../src/CategoryIcon.jsx',import.meta.url),'utf8')
  assert.match(source,/mega-menu__category-icon.*<CategoryIcon/)
  assert.match(source,/mobile-menu__category-icon.*<CategoryIcon/)
  assert.match(source,/home-category-index__icon.*<CategoryIcon/)
  assert.match(source,/product-card__meta.*<ProductTaxonomyMarks/)
  assert.match(source,/function ProductTaxonomyMarks[\s\S]*?<CategoryIcon/)
  assert.match(source,/catalog-compact-bar__avatar--icon[\s\S]*?<CategoryIcon kind=\{category\?\.icon/)
  assert.match(source,/category-intro__browse/)
  assert.match(source,/Browse by department/)
  assert.match(icon,/aria-hidden/)
})

test('catalog pages get stable crawlable paths with one canonical per page', () => {
  assert.equal(CATALOG_PAGE_SIZE, 36)
  assert.equal(pageCount(73), 3)
  assert.equal(catalogPagePath('/category/football-jerseys', 1), '/category/football-jerseys')
  assert.equal(catalogPagePath('/category/football-jerseys', 2), '/category/football-jerseys/page/2')
  assert.deepEqual(parseCatalogPagePath('/team/nhl/boston-bruins/page/3'), {
    basePath:'/team/nhl/boston-bruins', page:3, paginated:true
  })
  assert.equal(parseCatalogPagePath('/product/example/page/2').basePath, '/product/example/page/2')
})

test('NHL catalogue links resolve from league through team', () => {
  const league = findLeague('nhl')
  const team = findTeam('nhl','boston-bruins')
  assert.equal(leaguePath(league), '/league/nhl')
  assert.equal(teamPath(league.key,team), '/team/nhl/boston-bruins')
  assert.equal(league.media.src, '/assets/leagues/marks/nhl.webp')
})

test('collection membership actions add, remove and move listings without changing product state', () => {
  const rows = [
    { id:'a', name:'Drop A', products:['p1','p2'], count:2 },
    { id:'b', name:'Drop B', products:['p3'], count:1 }
  ]
  const added = applyCollectionMembership(rows,['p3'],'ADD_TO_COLLECTION','a')
  assert.deepEqual(added.collections.find(row => row.id === 'a').products,['p1','p2','p3'])
  const removed = applyCollectionMembership(added.collections,['p2'],'REMOVE_FROM_COLLECTION','a')
  assert.deepEqual(removed.collections.find(row => row.id === 'a').products,['p1','p3'])
  const moved = applyCollectionMembership(removed.collections,['p1'],'MOVE_COLLECTION','b')
  assert.deepEqual(moved.collections.find(row => row.id === 'a').products,['p3'])
  assert.deepEqual(moved.collections.find(row => row.id === 'b').products,['p3','p1'])
  const diff = collectionMembershipDiff(moved.collections,rows)
  assert.deepEqual(diff.additions.map(item => `${item.collection_id}/${item.product_id}`),['a/p3','b/p1'])
  assert.deepEqual(diff.removals.map(item => `${item.collectionId}/${item.productId}`),['a/p1','a/p2'])
})

test('collection admin tree preserves parent child order and rejects cycles', () => {
  const rows = [
    { id:'root', name:'Accessories', sortOrder:1 },
    { id:'bags', name:'Bags', parentId:'root', sortOrder:2 },
    { id:'caps', name:'Caps', parentId:'root', sortOrder:1 },
    { id:'orphan', name:'Orphan', parentId:'missing' },
    { id:'cycle', name:'Cycle', parentId:'cycle' }
  ]
  const tree = buildCollectionTree(rows)
  assert.deepEqual(tree.map(row => row.id), ['Accessories', 'Cycle', 'Orphan'].map(name => rows.find(row => row.name === name).id))
  assert.deepEqual(tree[0].children.map(row => row.id), ['caps','bags'])
  assert.deepEqual(flattenCollectionTree(tree).map(row => row.id), ['root','caps','bags','cycle','orphan'])
  assert.equal(collectionParentId({ id:'bags', seo:{ parentId:'root' } }), 'root')
  assert.deepEqual([...collectionDescendantIds(rows,'root')].sort(), ['bags','caps'])
})
