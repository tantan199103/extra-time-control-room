import { catalogCategoryByHandle, catalogIconForProduct } from './catalog-taxonomy.js'
import { LEAGUE_TAXONOMY, normalizeTeamSlug, taxonomySlug } from './league-taxonomy.js'

const IMAGE_FIELDS = ['hero', 'hero_image', 'representativeImage', 'representative_image', 'cover', 'cover_image', 'image']

const textValue = value => String(value || '').trim()
const slugValue = value => taxonomySlug(value)

function firstImage(row = {}) {
  for (const field of IMAGE_FIELDS) {
    const value = textValue(row?.[field])
    if (value) return value
  }
  const media = Array.isArray(row?.media) ? row.media : []
  return textValue(media.find(item => String(item?.type || '').toUpperCase() === 'IMAGE' && item?.url)?.url)
}
function collectionProductRows(collection = {}, products = []) {
  const rows = Array.isArray(products) ? products : []
  if (!rows.length) return []
  const ids = new Set([
    ...(Array.isArray(collection?.products) ? collection.products : []),
    ...(Array.isArray(collection?.productLinks) ? collection.productLinks.map(link => link?.productId || link?.product_id) : [])
  ].map(value => textValue(value)).filter(Boolean))
  if (!ids.size) return rows
  return rows.filter(row => ids.has(textValue(row?.id)) || ids.has(textValue(row?.handle)))
}

function teamForValue(value, leagueHint = '') {
  const raw = slugValue(value)
  if (!raw) return null
  const leagues = leagueHint
    ? LEAGUE_TAXONOMY.filter(league => slugValue(league.key) === slugValue(leagueHint) || slugValue(league.name) === raw)
    : LEAGUE_TAXONOMY
  for (const league of leagues) {
    const normalized = normalizeTeamSlug(league.key, raw)
    const team = league.teams.find(item => item.slug === normalized || slugValue(item.name) === raw || item.slug === raw)
    if (team) return { ...team, leagueKey:league.key, leagueName:league.name }
  }
  return null
}

function leagueForValue(value) {
  const raw = slugValue(value)
  if (!raw) return null
  return LEAGUE_TAXONOMY.find(league => slugValue(league.key) === raw || slugValue(league.name) === raw) || null
}

function categoryForValue(value) {
  const raw = slugValue(value)
  if (!raw) return null
  const aliases = {
    'football-jersey':'football-jerseys',
    'basketball-jersey':'basketball-jerseys',
    'baseball-jersey':'baseball-jerseys',
    'hockey-jersey':'hockey-jerseys',
    'soccer-jersey':'soccer-jerseys',
    'headwear':'accessories'
  }
  return catalogCategoryByHandle(aliases[raw] || raw)
}

function inferredIcon(text, product = null) {
  if (product) return catalogIconForProduct(product)
  if (/collectible|memorabilia|trading[- ]?card|autograph/.test(text)) return 'collectibles'
  if (/jersey|kit|shirt/.test(text)) return 'jersey'
  if (/cap|hat|headwear/.test(text)) return 'cap'
  if (/bag|backpack|tote/.test(text)) return 'bag'
  if (/scarf|glove|cold[- ]?weather/.test(text)) return 'scarf'
  if (/drinkware|bottle|mug/.test(text)) return 'drinkware'
  if (/sock/.test(text)) return 'socks'
  return 'accessories'
}

/**
 * Resolve a collection's visual identity without copying an unrelated listing
 * image. Explicit editorial art wins; then a checked-in team/league mark;
 * then a controlled category icon; finally the first linked product image.
 * The result is usable by both the storefront and admin menu previews.
 */
export function resolveCollectionArtwork(collection = {}, products = [], { ignoreExplicit = false } = {}) {
  const name = textValue(collection?.name || collection?.title || collection?.handle || 'Collection')
  const handle = textValue(collection?.handle || collection?.id)
  const taxonomy = collection?.taxonomy && typeof collection.taxonomy === 'object' ? collection.taxonomy : {}
  const seo = collection?.seo && typeof collection.seo === 'object' ? collection.seo : {}
  const linkedRows = collectionProductRows(collection, products)
  const firstLinkedProduct = linkedRows.find(row => firstImage(row)) || linkedRows[0] || null
  const searchable = slugValue([handle, name, taxonomy.league, taxonomy.team, taxonomy.category].filter(Boolean).join(' '))
  const leagueHint = taxonomy.league || taxonomy.leagueKey || ''

  if (!ignoreExplicit) {
    const explicit = firstImage(collection)
    if (explicit) return { src:explicit, icon:'', alt:`${name} collection`, source:'COLLECTION_IMAGE' }
  }

  const team = teamForValue(taxonomy.team || '', leagueHint) || teamForValue(handle, leagueHint) || teamForValue(name, leagueHint)
  if (team?.media?.src) return { src:team.media.src, icon:'', alt:`${team.name} logo`, source:'TEAM_LOGO' }

  const league = leagueForValue(taxonomy.league || '') || leagueForValue(handle) || leagueForValue(name)
  if (league?.media?.src) return { src:league.media.src, icon:'', alt:`${league.name} league mark`, source:'LEAGUE_LOGO' }

  const category = categoryForValue(taxonomy.category || handle) || categoryForValue(name)
  if (category) return { src:'', icon:category.icon || 'all', alt:`${category.label} icon`, source:'CATEGORY_ICON' }

  const productImage = firstImage(firstLinkedProduct || {})
  if (productImage) return { src:productImage, icon:'', alt:`${name} collection`, source:'PRODUCT_IMAGE' }

  const icon = inferredIcon(searchable, firstLinkedProduct)
  return { src:'', icon, alt:seo.title ? textValue(seo.title) : `${name} collection`, source:'CATEGORY_ICON' }
}
