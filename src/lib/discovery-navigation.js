import { ACCESSORY_CATEGORY_PAGES, ACCESSORY_FAMILY_OPTIONS, ALL_CATALOG_CATEGORY_PAGES, productMatchesCatalogCategory } from './catalog-taxonomy.js'
import { LEAGUE_TAXONOMY, leaguePath, normalizeTeamSlug, teamPath } from './league-taxonomy.js'
import { resolveCollectionArtwork } from './collection-artwork.js'

export const PRIMARY_DISCOVERY_LABELS = Object.freeze(['Shop', 'Sports', 'Teams', 'Custom', 'Collections', 'New & trending'])

// Search is a shopper-facing taxonomy, not an editorial full-text search.
// Keep the normalisation in one place so the overlay, the Shop route and the
// compact navigation index agree on what a query means (for example, "NY
// Yankees" and "new-york-yankees" should resolve to the same team).
export function normalizeDiscoveryQuery(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function productSearchText(product = {}) {
  const taxonomy = product.taxonomy || {}
  const customFields = Array.isArray(product.customFields)
    ? product.customFields.flatMap(field => [field?.key, field?.label, field?.name])
    : []
  const values = [
    product.name, product.title, product.subtitle, product.story, product.description,
    product.meta, product.handle, product.sku, product.type, product.productGroup,
    product.color, taxonomy.league, taxonomy.team, taxonomy.category, taxonomy.brand,
    ...(Array.isArray(product.tags) ? product.tags : []), ...(Array.isArray(product.brands) ? product.brands : []),
    ...customFields
  ]
  return normalizeDiscoveryQuery(values.filter(Boolean).join(' '))
}

export function matchesDiscoveryQuery(product, query) {
  const needle = normalizeDiscoveryQuery(query)
  if (!needle) return true
  const text = productSearchText(product)
  // Treat each word as a required intent token.  This keeps "cowboys
  // pennant" useful while still allowing a normal phrase such as "Dallas
  // Cowboys" to resolve naturally.
  return needle.split(' ').filter(Boolean).every(token => text.includes(token))
}

export function discoveryIndex(rows = []) {
  const products = Array.isArray(rows) ? rows : []
  const leagueCounts = new Map()
  const teamCounts = new Map()
  let total = 0
  for (const row of products) {
    const taxonomy = row.taxonomy || {}
    const league = String(taxonomy.league || '').toLowerCase()
    const weight = Math.max(1, Number(row.count) || 1)
    total += weight
    if (!league) continue
    leagueCounts.set(league, (leagueCounts.get(league) || 0) + weight)
    const team = normalizeTeamSlug(league, taxonomy.team || '')
    if (team) teamCounts.set(`${league}/${team}`, (teamCounts.get(`${league}/${team}`) || 0) + weight)
  }
  const leagues = LEAGUE_TAXONOMY.filter(league => leagueCounts.get(league.key) > 0)
  const teams = leagues.flatMap(league => league.teams
    .filter(team => teamCounts.get(`${league.key}/${team.slug}`) > 0)
    .map(team => ({ ...team, leagueKey:league.key, leagueName:league.name, count:teamCounts.get(`${league.key}/${team.slug}`), href:teamPath(league.key,team) })))
  const categories = ALL_CATALOG_CATEGORY_PAGES.filter(category => products.some(product => productMatchesCatalogCategory(product,category)))
  const brands = [...new Set(products.flatMap(product => {
    const values = Array.isArray(product.brands) ? product.brands : [product.taxonomy?.brand]
    return values.map(value => String(value || '').trim()).filter(Boolean)
  }))].sort((a,b) => a.localeCompare(b))
  const productGroups = [...new Set(products.map(product => String(product.productGroup || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b))
  return { total, leagues, teams, categories, brands, productGroups, leagueCounts, teamCounts }
}

export function discoveryMenu(index, collections = [], products = []) {
  const categories = index?.categories || []
  const leagues = index?.leagues || []
  const teams = index?.teams || []
  const category = handle => categories.find(item => item.handle === handle)
  const categoryLinks = ['football-jerseys','baseball-jerseys','basketball-jerseys','hockey-jerseys','soccer-jerseys','caps','knit-hats','fan-apparel','accessories','collectibles']
    .map(category).filter(Boolean).map(item => ({ label:item.label, href:`/category/${item.handle}`, icon:item.icon }))
  const accessoryLinks = ACCESSORY_FAMILY_OPTIONS
    .filter(item => categories.some(category => category.handle === item.handle) || index?.total)
    .map(item => ({ label:item.label, href:`/category/${item.handle}`, icon:item.icon }))
  const accessoryTypeLinks = ACCESSORY_CATEGORY_PAGES
    .filter(item => item.level === 'type' && item.accessoryFamily !== 'Other accessories')
    // Keep the mega-menu readable on mobile; the family landing pages expose
    // the complete type list (caps, bags, drinkware, pins and so on).
    .slice(0, 2)
    .map(item => ({ label:item.label, href:`/category/${item.handle}`, icon:item.icon }))
  const groupedSports = [...new Set(leagues.map(league => league.sport))].map(sport => ({
    label:sport, links:leagues.filter(league => league.sport === sport).map(league => ({ label:league.name, href:leaguePath(league), image:league.media?.src || '' }))
  }))
  const popularTeams = [...teams].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0,8)
  return [
    { id:'shop', label:'Shop', href:'/shop', sections:[
      { label:'Shop by product', links:[{ label:'Shop all', href:'/shop' },...categoryLinks] },
      { label:'Accessories', links:[...accessoryLinks, ...accessoryTypeLinks] },
      { label:'Explore', links:[{ label:'Find your team', href:'/teams' },{ label:'Browse sports', href:'/sports' },{ label:'Personalized gear', href:'/shop?custom=1' }] }
    ] },
    { id:'sports', label:'Sports', href:'/sports', sections:groupedSports },
    { id:'teams', label:'Teams', href:'/teams', searchTeams:true, sections:[
      { label:'Popular teams', links:popularTeams.map(team => ({ label:team.name, href:team.href, image:team.media?.fallback ? '' : team.media?.src || '', monogram:team.media?.fallback ? team.name.split(/\s+/).map(word => word[0]).join('').slice(0,3) : '', detail:team.leagueName })) },
      { label:'Browse by league', links:leagues.map(league => ({ label:`${league.name} teams`, href:leaguePath(league), image:league.media?.src || '' })) }
    ] },
    { id:'custom', label:'Custom', href:'/category/custom-jerseys', sections:[
      { label:'Create yours', links:[{ label:'Custom jerseys', href:'/custom' },{ label:'Personalized gear', href:'/category/custom-jerseys' }] },
      { label:'By sport', links:leagues.slice(0,6).map(league => ({ label:league.name, href:`${leaguePath(league)}?custom=1` })) }
    ] },
    { id:'collections', label:'Collections', href:'/collections', sections:[
      { label:'Current collections', links:(collections || []).filter(row => row?.handle).slice(0,8).map(row => { const artwork = resolveCollectionArtwork(row,products); return { label:row.name || row.title || row.handle, href:`/collection/${encodeURIComponent(row.handle)}`, image:artwork.src, icon:artwork.icon, artworkSource:artwork.source, coverPending:!artwork.src } }) },
      { label:'Explore', links:[{ label:'Browse all gear', href:'/shop' },{ label:'Personalized gear', href:'/shop?custom=1' }] }
    ] },
    { id:'new', label:'New & trending', href:'/shop?sort=NEWEST', sections:[
      { label:'Fresh finds', links:[{ label:'New arrivals', href:'/shop?sort=NEWEST' },{ label:'Fan favorites', href:'/shop' }] },
      { label:'Shop by interest', links:[{ label:'Custom jerseys', href:'/category/custom-jerseys' },{ label:'Headwear', href:'/category/caps' },{ label:'Collectibles', href:'/category/collectibles' }] }
    ] }
  ]
}
