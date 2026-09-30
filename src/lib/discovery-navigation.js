import { ACCESSORY_CATEGORY_PAGES, ACCESSORY_FAMILY_OPTIONS, ALL_CATALOG_CATEGORY_PAGES, productMatchesCatalogCategory } from './catalog-taxonomy.js'
import { ALL_LEAGUE_TAXONOMY, leaguePath, normalizeTeamSlug, teamPath } from './league-taxonomy.js'
import { resolveCollectionArtwork } from './collection-artwork.js'

export const PRIMARY_DISCOVERY_LABELS = Object.freeze(['Shop', 'Sports', 'Teams', 'Custom', 'Collections', 'New & trending'])

// A collection is eligible for public discovery only when it is published
// (or came from the already-published storefront endpoint) and has at least
// one public listing. Keep artwork resolution beside that gate so the
// directory and mega-menu cannot drift into showing empty editorial shells.
export function storefrontCollectionEntries(collections = [], products = []) {
  return (Array.isArray(collections) ? collections : [])
    .filter(row => row?.handle)
    .filter(row => !row.status || String(row.status).toUpperCase() === 'PUBLISHED')
    .filter(row => Number(row.publishedCount ?? row.count ?? row.products?.length ?? 0) > 0)
    .map(row => ({
      collection:row,
      count:Number(row.publishedCount ?? row.count ?? row.products?.length ?? 0),
      artwork:resolveCollectionArtwork(row,products)
    }))
    .sort((left,right) => String(left.collection.name || left.collection.handle).localeCompare(String(right.collection.name || right.collection.handle)))
}

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

const DISCOVERY_SYNONYM_GROUPS = Object.freeze([
  ['jersey','jerseys','kit','kits'],
  ['cap','caps','hat','hats','headwear','snapback','snapbacks','beanie','beanies'],
  ['tee','tees','tshirt','tshirts','shirt','shirts'],
  ['custom','personalized','personalised'],
  ['collectible','collectibles','memorabilia']
])

const DISCOVERY_SYNONYMS = new Map(DISCOVERY_SYNONYM_GROUPS.flatMap(group => group.map(term => [term,group])))
const DISCOVERY_VOCABULARY = [...new Set([
  ...DISCOVERY_SYNONYM_GROUPS.flat(),
  ...ALL_CATALOG_CATEGORY_PAGES.flatMap(category => [category.handle,...normalizeDiscoveryQuery(category.label).split(' ')]),
  ...ALL_LEAGUE_TAXONOMY.flatMap(league => [league.key,...normalizeDiscoveryQuery(`${league.name} ${league.sport}`).split(' '),...league.teams.flatMap(team => normalizeDiscoveryQuery(`${team.name} ${team.slug}`).split(' '))])
].filter(Boolean))]

function discoveryEditDistance(left, right) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let previous = Array.from({ length:right.length + 1 }, (_, index) => index)
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1]
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1)
      ))
    }
    previous = current
  }
  return previous[right.length]
}

function adjacentDiscoveryTransposition(left, right) {
  if (left.length !== right.length) return false
  const changed = []
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) changed.push(index)
  return changed.length === 2 && changed[1] === changed[0] + 1 && left[changed[0]] === right[changed[1]] && left[changed[1]] === right[changed[0]]
}

function correctedDiscoveryToken(token) {
  if (token.length < 4 || DISCOVERY_VOCABULARY.includes(token)) return token
  const threshold = token.length >= 8 ? 2 : 1
  let winner = token
  let distance = threshold + 1
  for (const candidate of DISCOVERY_VOCABULARY) {
    if (Math.abs(candidate.length - token.length) > threshold) continue
    const nextDistance = adjacentDiscoveryTransposition(token,candidate) ? 1 : discoveryEditDistance(token,candidate)
    if (nextDistance < distance || nextDistance === distance && candidate.length < winner.length) {
      winner = candidate
      distance = nextDistance
    }
  }
  return distance <= threshold ? winner : token
}

function discoveryTokenAlternatives(token) {
  const corrected = correctedDiscoveryToken(token)
  return [...new Set([token,corrected,...(DISCOVERY_SYNONYMS.get(token) || []),...(DISCOVERY_SYNONYMS.get(corrected) || [])])]
}

export function discoveryQueryVariants(value, limit = 4) {
  const normalized = normalizeDiscoveryQuery(value)
  if (!normalized) return []
  const tokens = normalized.split(' ')
  const corrected = tokens.map(correctedDiscoveryToken).join(' ')
  const variants = [normalized,corrected]
  tokens.forEach((token,index) => {
    for (const alternative of discoveryTokenAlternatives(token)) {
      if (alternative === token) continue
      variants.push(tokens.map((part,partIndex) => partIndex === index ? alternative : correctedDiscoveryToken(part)).join(' '))
    }
  })
  return [...new Set(variants)].slice(0,Math.max(1,limit))
}

function discoveryTokensMatch(value, query) {
  const words = normalizeDiscoveryQuery(value).split(' ').filter(Boolean)
  if (!words.length) return false
  return normalizeDiscoveryQuery(query).split(' ').filter(Boolean).every(token => discoveryTokenAlternatives(token).some(alternative => words.some(word => word.includes(alternative) || alternative.length >= 4 && (adjacentDiscoveryTransposition(alternative,word) || discoveryEditDistance(alternative,word) <= (alternative.length >= 8 ? 2 : 1)))))
}

export function discoveryTextScore(value, query) {
  const haystack = normalizeDiscoveryQuery(value)
  if (!haystack) return 0
  let score = 0
  for (const candidate of discoveryQueryVariants(query,8)) {
    if (haystack === candidate) score = Math.max(score,1000)
    else if (haystack.startsWith(candidate)) score = Math.max(score,800)
    else if (haystack.includes(candidate)) score = Math.max(score,650)
    else if (discoveryTokensMatch(haystack,candidate)) score = Math.max(score,300)
  }
  return score
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
    taxonomy.nationalTeam, taxonomy.country, taxonomy.player, taxonomy.playerName,
    taxonomy.competition, taxonomy.fit, taxonomy.theme, taxonomy.lifecycle, taxonomy.year,
    ...(Array.isArray(product.tags) ? product.tags : []), ...(Array.isArray(product.brands) ? product.brands : []),
    ...customFields
  ]
  return normalizeDiscoveryQuery(values.filter(Boolean).join(' '))
}

export function matchesDiscoveryQuery(product, query) {
  const needle = normalizeDiscoveryQuery(query)
  if (!needle) return true
  return discoveryTextScore(productSearchText(product),needle) > 0
}

export function discoverySearchScore(product, query) {
  if (!matchesDiscoveryQuery(product,query)) return 0
  const taxonomy = product.taxonomy || {}
  const weighted = (value,weight) => {
    const score = discoveryTextScore(value,query)
    return score ? score + weight : 0
  }
  return Math.max(
    weighted(product.title || product.name,500),
    weighted(taxonomy.team,400),
    weighted(taxonomy.league,350),
    weighted(product.productGroup,300),
    weighted(taxonomy.category,250),
    discoveryTextScore(productSearchText(product),query)
  )
}

// Imported/preview rows do not always carry the structured taxonomy columns
// yet.  They still expose a title, story or meta line such as “NFL · Dallas
// Cowboys”.  Recover the controlled league/team key at the discovery boundary
// so the Sports and Teams directories never collapse to an empty state while
// the full navigation index is being rebuilt.
function inferredDiscoveryTaxonomy(row = {}) {
  const explicit = row.taxonomy && typeof row.taxonomy === 'object' ? row.taxonomy : {}
  const text = normalizeDiscoveryQuery([
    row.name, row.title, row.handle, row.story, row.description, row.meta,
    row.productGroup, row.type, explicit.league, explicit.team
  ].filter(Boolean).join(' '))
  const leagueValue = String(row.league || row.leagueKey || explicit.league || explicit.leagueKey || '').trim()
  const explicitLeague = ALL_LEAGUE_TAXONOMY.find(item => {
    const value = normalizeDiscoveryQuery(leagueValue)
    return value && (normalizeDiscoveryQuery(item.key) === value || normalizeDiscoveryQuery(item.name) === value)
  })
  const league = explicitLeague?.key || ALL_LEAGUE_TAXONOMY.find(item => {
    const key = normalizeDiscoveryQuery(item.key)
    const name = normalizeDiscoveryQuery(item.name)
    return (key && text.includes(key)) || (name && text.includes(name))
  })?.key || ''
  const teamValue = String(row.team || row.teamSlug || explicit.team || explicit.teamSlug || '').trim()
  const leagueDefinition = ALL_LEAGUE_TAXONOMY.find(item => item.key === league)
  const team = teamValue || leagueDefinition?.teams.find(item => {
    const name = normalizeDiscoveryQuery(item.name)
    const slug = normalizeDiscoveryQuery(item.slug)
    return (name && text.includes(name)) || (slug && text.includes(slug))
  })?.slug || ''
  return { league, team }
}

export function discoveryIndex(rows = []) {
  const products = Array.isArray(rows) ? rows : []
  const leagueCounts = new Map()
  const teamCounts = new Map()
  let total = 0
  for (const row of products) {
    const { league:inferredLeague, team:inferredTeam } = inferredDiscoveryTaxonomy(row)
    const league = String(inferredLeague || '').toLowerCase()
    const weight = Math.max(1, Number(row.count) || 1)
    total += weight
    if (!league) continue
    leagueCounts.set(league, (leagueCounts.get(league) || 0) + weight)
    const team = normalizeTeamSlug(league, inferredTeam)
    if (team) teamCounts.set(`${league}/${team}`, (teamCounts.get(`${league}/${team}`) || 0) + weight)
  }
  const leagues = ALL_LEAGUE_TAXONOMY.filter(league => leagueCounts.get(league.key) > 0)
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
  const publicCollections = storefrontCollectionEntries(collections,products)
  const category = handle => categories.find(item => item.handle === handle)
  const browseCategory = handle => category(handle) || (index?.total ? ALL_CATALOG_CATEGORY_PAGES.find(item => item.handle === handle) : null)
  // Keep the first product branch at the same intent level as the URL: broad
  // hubs (jerseys, hats, accessories) first, then sport-specific landings in
  // their own bounded branch. This gives shoppers a short route while still
  // exposing deep SEO pages once they choose a sport.
  const categoryLinks = ['jerseys','hats','accessories','fan-apparel','custom-jerseys','collectibles']
    .map(browseCategory).filter(Boolean).map(item => ({ label:item.label, href:`/category/${item.handle}`, icon:item.icon }))
  const sportCategoryLinks = ['football-jerseys','baseball-jerseys','basketball-jerseys','hockey-jerseys','soccer-jerseys','world-cup-jerseys','national-team-jerseys','football-legends']
    .map(browseCategory).filter(Boolean).map(item => ({ label:item.label, href:`/category/${item.handle}`, icon:item.icon }))
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
      { label:'Shop by sport', links:sportCategoryLinks },
      { label:'Accessories', links:[...accessoryLinks, ...accessoryTypeLinks] },
      { label:'Explore', links:[{ label:'Find your team', href:'/teams' },{ label:'Browse sports', href:'/sports' },{ label:'World Cup jerseys', href:'/category/world-cup-jerseys' },{ label:'National team jerseys', href:'/category/national-team-jerseys' },{ label:'Football legends', href:'/category/football-legends' },{ label:'Personalized gear', href:'/shop?custom=1' }] }
    ] },
    { id:'sports', label:'Sports', href:'/sports', sections:groupedSports },
    { id:'teams', label:'Teams', href:'/teams', searchTeams:true, sections:[
      { label:'Popular teams', links:popularTeams.map(team => ({ label:team.name, href:team.href, image:team.media?.fallback ? '' : team.media?.src || '', monogram:team.media?.fallback ? team.name.split(/\s+/).map(word => word[0]).join('').slice(0,3) : '', detail:team.leagueName })) },
      { label:'Browse by league', links:leagues.map(league => ({ label:`${league.name} teams`, href:leaguePath(league), image:league.media?.src || '' })) }
    ] },
    { id:'custom', label:'Custom', href:'/category/custom-jerseys', sections:[
      { label:'Create yours', links:[{ label:'Custom jerseys', href:'/custom' },{ label:'3D custom kits', href:'/category/custom-jerseys' }] },
      { label:'By sport', links:leagues.slice(0,6).map(league => ({ label:league.name, href:`${leaguePath(league)}?custom=1` })) }
    ] },
    { id:'collections', label:'Collections', href:'/collections', sections:[
      { label:'Current collections', links:publicCollections.slice(0,8).map(({collection:row,artwork,count}) => ({ label:row.name || row.title || row.handle, href:`/collection/${encodeURIComponent(row.handle)}`, image:artwork.src, icon:artwork.icon, artworkSource:artwork.source, coverPending:!artwork.src, count })) },
      { label:'Explore', links:[{ label:'Browse all gear', href:'/shop' },{ label:'Personalized gear', href:'/shop?custom=1' }] }
    ] },
    { id:'new', label:'New & trending', href:'/shop?sort=NEWEST', sections:[
      { label:'Fresh finds', links:[{ label:'New arrivals', href:'/shop?sort=NEWEST' },{ label:'Fan favorites', href:'/shop' }] },
      { label:'Shop by interest', links:[{ label:'3D custom kits', href:'/category/custom-jerseys' },{ label:'Headwear', href:'/category/hats' },{ label:'Collectibles', href:'/category/collectibles' }] }
    ] }
  ]
}
