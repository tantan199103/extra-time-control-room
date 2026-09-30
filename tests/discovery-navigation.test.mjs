import test from 'node:test'
import assert from 'node:assert/strict'
import { discoveryIndex, discoveryMenu, discoveryQueryVariants, discoverySearchScore, discoveryTextScore, matchesDiscoveryQuery, normalizeDiscoveryQuery, PRIMARY_DISCOVERY_LABELS, storefrontCollectionEntries } from '../src/lib/discovery-navigation.js'

const rows = [
  { taxonomy:{league:'nfl',team:'dallas-cowboys',category:'Football Jerseys'}, productGroup:'Football Jersey', customFields:[{key:'name'}] },
  { taxonomy:{league:'nfl',team:'green-bay-packers',category:'Accessories'}, productGroup:'Caps', customFields:[] },
  { taxonomy:{league:'nba',team:'los-angeles-lakers',category:'Accessories'}, productGroup:'Caps', customFields:[] }
]

test('primary navigation is bounded and separates sports, teams and products', () => {
  const index = discoveryIndex(rows)
  const menu = discoveryMenu(index)
  assert.deepEqual(menu.map(item => item.label), PRIMARY_DISCOVERY_LABELS)
  assert.deepEqual(index.leagues.map(item => item.key), ['nfl','nba'])
  assert.equal(index.teams.length,3)
  const shop = menu.find(item => item.id === 'shop')
  assert.ok(shop.sections.some(section => section.links.some(link => link.href === '/category/caps')))
  assert.ok(shop.sections[0].links.some(link => link.href === '/category/jerseys'))
  assert.ok(shop.sections[0].links.some(link => link.href === '/category/hats'))
  assert.ok(shop.sections.some(section => section.label === 'Shop by sport'))
  assert.ok(menu.find(item => item.id === 'sports').sections.some(section => section.label === 'Football'))
  assert.ok(menu.find(item => item.id === 'teams').sections[0].links.length <= 8)
  assert.ok(menu.every(item => item.sections.every(section => section.links.length <= 10)))
  assert.equal(menu.some(item => /nike|adidas|new era/i.test(item.label)),false)
})

test('collections menu exposes only actual published collection data', () => {
  const index = discoveryIndex(rows)
  const empty = discoveryMenu(index).find(item => item.id === 'collections')
  assert.deepEqual(empty.sections[0].links,[])
  const source = [
    {handle:'winter-gear',name:'Winter Gear',status:'PUBLISHED',publishedCount:2},
    {handle:'empty',name:'Empty',status:'PUBLISHED',publishedCount:0},
    {handle:'draft',name:'Draft',status:'DRAFT',publishedCount:4}
  ]
  assert.deepEqual(storefrontCollectionEntries(source).map(item => item.collection.handle),['winter-gear'])
  const live = discoveryMenu(index,source).find(item => item.id === 'collections')
  assert.deepEqual(live.sections[0].links.map(item => item.href),['/collection/winter-gear'])
  assert.equal(live.sections[0].links[0].coverPending,true)
  assert.equal(live.sections[0].links[0].count,2)
  const illustrated = discoveryMenu(index,[{handle:'winter-gear',name:'Winter Gear',hero:'/covers/winter.webp',status:'PUBLISHED',publishedCount:2}]).find(item => item.id === 'collections')
  assert.equal(illustrated.sections[0].links[0].coverPending,false)
})

test('commerce search matches visible product and taxonomy fields', () => {
  const listing = {
    title:'Auston Matthews Toronto Maple Leafs Framed Photo',
    handle:'auston-matthews-maple-leafs-photo',
    sku:'NHL-0034',
    productGroup:'Collectibles',
    taxonomy:{ league:'nhl', team:'toronto-maple-leafs', category:'Accessories' },
    tags:['player gift']
  }
  assert.equal(normalizeDiscoveryQuery('Toronto-Maple Leafs'), 'toronto maple leafs')
  assert.equal(matchesDiscoveryQuery(listing,'Auston Matthews'),true)
  assert.equal(matchesDiscoveryQuery(listing,'Toronto Maple Leafs'),true)
  assert.equal(matchesDiscoveryQuery(listing,'Maple photo'),true)
  assert.equal(matchesDiscoveryQuery(listing,'Collectibles'),true)
  assert.equal(matchesDiscoveryQuery(listing,'NHL-0034'),true)
  assert.equal(matchesDiscoveryQuery(listing,'Dallas Cowboys'),false)
})

test('commerce search corrects light typos, expands product synonyms and ranks exact intent first', () => {
  const exact = {
    id:'exact', title:'Dallas Cowboys Home Jersey', productGroup:'Football Jersey',
    taxonomy:{ league:'nfl', team:'dallas-cowboys', category:'Football Jerseys' }
  }
  const sameTeam = {
    id:'team', title:'Vintage Stadium Pennant', productGroup:'Collectibles',
    taxonomy:{ league:'nfl', team:'dallas-cowboys', category:'Accessories' }
  }
  const cap = {
    id:'cap', title:'New York Yankees Fitted Cap', productGroup:'Caps',
    taxonomy:{ league:'mlb', team:'new-york-yankees', category:'Accessories' }
  }
  assert.ok(discoveryQueryVariants('Dalas Cowobys').includes('dallas cowboys'))
  assert.equal(matchesDiscoveryQuery(exact,'Dalas Cowobys jersy'),true)
  assert.equal(matchesDiscoveryQuery(cap,'Yankees hat'),true)
  assert.ok(discoveryTextScore('Dallas Cowboys','Dalas Cowobys') > 0)
  assert.ok(discoverySearchScore(exact,'Dallas Cowboys Home Jersey') > discoverySearchScore(sameTeam,'Dallas Cowboys Home Jersey'))
})
