import { normalizeTeamSlug, taxonomySlug } from './league-taxonomy.js'
import { validateCatalogTaxonomy } from './taxonomy-validator.js'

export const TEAM_PRODUCT_PAGE_MIN_PRODUCTS = 6

export const TEAM_PRODUCT_TYPES = Object.freeze([
  Object.freeze({ handle:'jerseys', label:'Jerseys', singular:'jersey', groups:['Football Jersey','Baseball Jersey','Basketball Jersey','Hockey Jersey','Soccer Jersey','Jerseys'], description:'Current team jerseys with available sizes, photos and personalization details.' }),
  Object.freeze({ handle:'caps', label:'Caps', singular:'cap', groups:['Caps'], description:'Current team caps, fitted styles and adjustable headwear.' }),
  Object.freeze({ handle:'knit-hats', label:'Knit hats', singular:'knit hat', groups:['Knit Hats'], description:'Current team knit hats and cold-weather headwear.' }),
  Object.freeze({ handle:'apparel', label:'Apparel', singular:'apparel piece', groups:['Fan Apparel','Apparel','Hoodies','Shirts','T-Shirts','Jackets'], description:'Current team apparel for match day and everyday wear.' }),
  Object.freeze({ handle:'accessories', label:'Accessories', singular:'accessory', groups:['Accessories','Bags','Backpacks','Sports Bags','Scarves','Gloves','Socks'], description:'Current team accessories, bags and supporter essentials.' }),
  Object.freeze({ handle:'collectibles', label:'Collectibles', singular:'collectible', groups:['Collectibles'], description:'Current team collectibles and display pieces.' })
])

const BY_HANDLE = new Map(TEAM_PRODUCT_TYPES.map(item => [item.handle,item]))
const GROUP_TO_TYPE = new Map(TEAM_PRODUCT_TYPES.flatMap(item => item.groups.map(group => [taxonomySlug(group),item])))

export function teamProductTypeByHandle(value) {
  return BY_HANDLE.get(taxonomySlug(value)) || null
}

export function teamProductTypeForProduct(product = {}) {
  const group = product.productGroup || product.product_group || product.taxonomy?.productGroup || ''
  return GROUP_TO_TYPE.get(taxonomySlug(group)) || null
}

export function productMatchesTeamProductType(product = {}, type) {
  const page = typeof type === 'string' ? teamProductTypeByHandle(type) : type
  return Boolean(page && teamProductTypeForProduct(product)?.handle === page.handle)
}

export function teamProductTypePath(league, team, type) {
  const leagueKey = taxonomySlug(league?.key || league)
  const teamSlug = normalizeTeamSlug(leagueKey, team?.slug || team?.name || team)
  const page = typeof type === 'string' ? teamProductTypeByHandle(type) : type
  return page && leagueKey && teamSlug ? `/team/${leagueKey}/${teamSlug}/${page.handle}` : ''
}

export function teamProductTypeCounts(products = [], { league = '', team = '', minProducts = TEAM_PRODUCT_PAGE_MIN_PRODUCTS } = {}) {
  const leagueKey = taxonomySlug(league?.key || league)
  const teamSlug = normalizeTeamSlug(leagueKey, team?.slug || team?.name || team)
  const counts = new Map(TEAM_PRODUCT_TYPES.map(type => [type.handle,0]))
  for (const product of products) {
    const validation = validateCatalogTaxonomy(product)
    const productLeague = taxonomySlug(product.league || product.taxonomy?.league)
    const productTeam = normalizeTeamSlug(productLeague, product.team || product.taxonomy?.team)
    if (!validation.valid || productLeague !== leagueKey || productTeam !== teamSlug) continue
    const type = teamProductTypeForProduct(product)
    // Runtime discovery uses a compact aggregate row (`count`), while the
    // static generator passes one row per product. Supporting both keeps the
    // six-product indexability threshold consistent across environments.
    if (type) counts.set(type.handle,(counts.get(type.handle) || 0) + Math.max(1, Number(product.count) || 1))
  }
  return TEAM_PRODUCT_TYPES
    .map(type => ({ ...type, count:counts.get(type.handle) || 0, path:teamProductTypePath(leagueKey,teamSlug,type) }))
    .filter(type => type.count >= minProducts)
}
