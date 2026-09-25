import { stableHash, stableId, slugify } from './fangear-import-lib.mjs'

export const TAASS_COLLECTION_DEFINITIONS = Object.freeze({
  nfl: { name: 'NFL', description: 'NFL jerseys, apparel and fan gear.' },
  mlb: { name: 'MLB', description: 'MLB jerseys, apparel and fan gear.' },
  nba: { name: 'NBA', description: 'NBA jerseys, apparel and fan gear.' },
  nhl: { name: 'NHL', description: 'NHL jerseys, apparel and fan gear.' },
  mls: { name: 'MLS', description: 'MLS jerseys, apparel and fan gear.' },
  ncaa: { name: 'NCAA', description: 'College jerseys, apparel and fan gear.' },
  soccer: { name: 'Soccer', description: 'Soccer jerseys, apparel and fan gear.' },
  wwe: { name: 'WWE', description: 'Wrestling apparel and fan gear.' },
  nascar: { name: 'NASCAR', description: 'Motorsport apparel and fan gear.' },
  'football-jersey': { name: 'Football Jerseys', description: 'American football jerseys and fanwear.' },
  'baseball-jersey': { name: 'Baseball Jerseys', description: 'Baseball jerseys and fanwear.' },
  'basketball-jersey': { name: 'Basketball Jerseys', description: 'Basketball jerseys and fanwear.' },
  'hockey-jersey': { name: 'Hockey Jerseys', description: 'Hockey jerseys and fanwear.' },
  'soccer-jersey': { name: 'Soccer Jerseys', description: 'Soccer jerseys and fanwear.' },
  apparel: { name: 'Apparel', description: 'Sports apparel for game day and beyond.' },
  hoodies: { name: 'Hoodies', description: 'Sports hoodies and fan layers.' },
  accessories: { name: 'Accessories', description: 'Hats, scarves, decals and fan accessories.' },
  collectibles: { name: 'Collectibles', description: 'Sports cards, memorabilia and fan collectibles.' },
  'fan-gear': { name: 'Fan Gear', description: 'Sports gear and fan merchandise.' }
})

const CATEGORY_HANDLE = Object.freeze({
  'Football Jerseys': 'football-jersey',
  'Baseball Jerseys': 'baseball-jersey',
  'Basketball Jerseys': 'basketball-jersey',
  'Hockey Jerseys': 'hockey-jersey',
  'Soccer Jerseys': 'soccer-jersey',
  'Fan Apparel': 'apparel',
  Accessories: 'accessories',
  Collectibles: 'collectibles',
  'Fan Gear': 'fan-gear'
})

const JERSEY_CATEGORY = /^(?:Football|Baseball|Basketball|Hockey|Soccer) Jerseys$/i
const JERSEY_WORD = /(?:^|[-/])(?:jersey|jerseys|trikot|trikots)(?:[-/]|$)/i
const NON_GARMENT = /\b(?:trading cards?|card boxes?|break boxes?|mystery boxes?|jersey boxes?|patch cards?|signed photos?|caps?|hats?|beanies?|t-?shirts?|hoodies?)\b/i

export function isTaassJerseyUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/new-jersey-(?:devils|nets)/g, '')
    return JERSEY_WORD.test(path)
  } catch {
    return false
  }
}

export function isTaassJerseyListing(listing = {}) {
  const { title, group, taxonomy } = listingValues(listing)
  const category = String(taxonomy.category || classifyTaassListing(listing))
  if (JERSEY_CATEGORY.test(category)) return true
  return JERSEY_WORD.test(`/${group.toLowerCase().replace(/\s+/g, '-')}/`)
    && !NON_GARMENT.test(`${title} ${group}`)
}

function listingValues(listing = {}) {
  return {
    title: String(listing.title || listing.name || ''),
    group: String(listing.productGroup || listing.product_group || ''),
    taxonomy: listing.taxonomy && typeof listing.taxonomy === 'object' ? listing.taxonomy : {}
  }
}

export function classifyTaassListing(listing = {}) {
  const { title, group, taxonomy } = listingValues(listing)
  const league = String(taxonomy.league || '').toLowerCase()
  const sport = String(taxonomy.sport || '').toLowerCase()
  const jerseyPattern = /\bjerseys?\b|\btrikots?\b|\b(?:soccer|football) kits?\b/i
  const collectiblePattern = /\b(?:trading cards?|autographs?|memorabilia|bobbleheads?|figurines?|signed photos?|collectibles?)\b/i
  const apparelPattern = /\b(?:t-?shirts?|shirts?|sweatshirts?|sweaters?|pullovers?|jackets?|hoodies?|jerseys?|pants?|shorts?|socks?|gloves?|tracksuits?|polos?|vests?)\b/i
  const accessoryPattern = /\b(?:caps?|hats?|beanies?|scarves?|decals?|stickers?|keychains?|bags?|backpacks?|bottles?|mugs?|wallets?|pins?|patches?|flags?|banners?|gift sets?|gift bundles?)\b/i
  const isJersey = jerseyPattern.test(group) || (!collectiblePattern.test(group) && !accessoryPattern.test(group) && !apparelPattern.test(group) && jerseyPattern.test(title))
  if (isJersey) {
    if (league === 'nfl' || sport === 'football') return 'Football Jerseys'
    if (league === 'mlb' || sport === 'baseball') return 'Baseball Jerseys'
    if (league === 'nba' || sport === 'basketball') return 'Basketball Jerseys'
    if (league === 'nhl' || sport === 'hockey') return 'Hockey Jerseys'
    if (league === 'mls' || league === 'soccer' || sport === 'soccer') return 'Soccer Jerseys'
    return 'Fan Apparel'
  }
  if (collectiblePattern.test(group)) return 'Collectibles'
  if (accessoryPattern.test(group)) return 'Accessories'
  if (apparelPattern.test(group)) return 'Fan Apparel'
  if (collectiblePattern.test(title)) return 'Collectibles'
  if (accessoryPattern.test(title)) return 'Accessories'
  if (apparelPattern.test(title)) return 'Fan Apparel'
  return 'Fan Gear'
}

export function taassCollectionHandles(listing = {}, existingHandles = new Set()) {
  const { title, group, taxonomy } = listingValues(listing)
  const league = slugify(taxonomy.league || '', '')
  const category = String(taxonomy.category || classifyTaassListing(listing))
  const handles = [CATEGORY_HANDLE[category] || 'fan-gear']
  if (league && TAASS_COLLECTION_DEFINITIONS[league]) handles.push(league)
  if (league === 'mls' || league === 'soccer') handles.push('soccer')
  if (/\bhoodies?\b/i.test(`${group} ${title}`)) handles.push('hoodies')
  const team = slugify(taxonomy.team || '', '')
  if (team && existingHandles.has(team)) handles.push(team)
  return [...new Set(handles)]
}

export function withTaassCatalogCategory(listing = {}) {
  const taxonomy = listing.taxonomy && typeof listing.taxonomy === 'object' ? listing.taxonomy : {}
  return {
    ...listing,
    taxonomy: { ...taxonomy, category: taxonomy.category || classifyTaassListing(listing) }
  }
}

export async function loadTaassCollectionMap(client) {
  const map = new Map()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('pod_collections').select('id,handle,name,status').order('handle').range(offset, offset + 499)
    if (error) throw new Error(`Cannot read collections for TAASS routing: ${error.message}`)
    for (const row of data || []) map.set(row.handle, row)
    if ((data || []).length < 500) break
  }
  return map
}

export async function routeTaassListings(client, items = [], collectionMap = null) {
  const collections = collectionMap || await loadTaassCollectionMap(client)
  const existingHandles = new Set(collections.keys())
  const plans = items.map(item => ({
    productId: item.listing?.id || item.id,
    handles: taassCollectionHandles(item.listing || item, existingHandles)
  })).filter(plan => plan.productId)
  const required = new Set(plans.flatMap(plan => plan.handles))
  const missing = [...required].filter(handle => !collections.has(handle) && TAASS_COLLECTION_DEFINITIONS[handle])
  if (missing.length) {
    const rows = missing.map(handle => ({
      id: stableId('collection', `taass-route:${handle}`),
      handle,
      name: TAASS_COLLECTION_DEFINITIONS[handle].name,
      description: TAASS_COLLECTION_DEFINITIONS[handle].description,
      status: 'DRAFT',
      hero_image: null,
      sort_mode: 'NEWEST',
      seo: { title: TAASS_COLLECTION_DEFINITIONS[handle].name, description: TAASS_COLLECTION_DEFINITIONS[handle].description }
    }))
    const { error } = await client.from('pod_collections').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`Cannot create TAASS collections: ${error.message}`)
    for (const row of rows) collections.set(row.handle, row)
  }
  const links = plans.flatMap(plan => plan.handles.map(handle => ({
    collection_id: collections.get(handle)?.id,
    product_id: plan.productId,
    sort_order: 100_000 + Number.parseInt(stableHash(plan.productId, 7), 16),
    featured: false
  })).filter(link => link.collection_id))
  for (let offset = 0; offset < links.length; offset += 250) {
    const { error } = await client.from('pod_collection_products').upsert(links.slice(offset, offset + 250), {
      onConflict: 'collection_id,product_id',
      ignoreDuplicates: true
    })
    if (error) throw new Error(`Cannot assign TAASS listings to collections: ${error.message}`)
  }
  return { collections, created: missing.length, links: links.length, products: plans.length }
}
