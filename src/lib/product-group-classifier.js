const JERSEY_BY_LEAGUE = Object.freeze({
  nfl:'Football Jersey', mlb:'Baseball Jersey', nba:'Basketball Jersey',
  nhl:'Hockey Jersey', mls:'Soccer Jersey', epl:'Soccer Jersey',
  laliga:'Soccer Jersey', seriea:'Soccer Jersey', bundesliga:'Soccer Jersey',
  ligue1:'Soccer Jersey', soccer:'Soccer Jersey'
})

const apparelGroups = new Set([
  't-shirts','t-shirt','shirts','shirt','hoodies','hoodie','pullovers','pullover',
  'jackets','jacket','shorts','pants','pajamas','bodys','fan apparel'
])
const collectibleGroups = new Set([
  'trading cards','figures','figure','coins','coin','frames','frame',
  'collectibles','signs','sign','pennant','posters','poster'
])
const accessoryGroups = new Set([
  'accessories','balls','pucks','mugs','drinkware','glassware','bottle openers',
  'cutlery','knives','plates','coasters','towels','beach towels','blankets',
  'socks','gloves','shoes','backpacks','bags','sports bags','banners','flags',
  'decals','magnets','helmets','supplies','wastebaskets','clocks','bedding',
  'mats','carpets','bbq','cars & bikes','umbrellas','key chains'
])

export function classifyProductGroup(row = {}) {
  const taxonomy = row.taxonomy && typeof row.taxonomy === 'object' ? row.taxonomy : {}
  const source = String(taxonomy.productGroup || row.sourceGroup || row.product_group || '').trim()
  const lower = source.toLowerCase()
  const title = String(row.title || '').toLowerCase()
  const league = String(taxonomy.league || '').toLowerCase()

  // Original catalogue type wins over incidental words in team or product
  // names (Capitals is not a cap; a framed jersey photo is not a jersey).
  if (lower === 'caps' || lower === 'cap' || lower === 'hats') return 'Caps'
  if (lower === 'knit hats' || lower === 'knit hat' || lower === 'beanies') return 'Knit Hats'
  if (apparelGroups.has(lower)) return 'Fan Apparel'
  if (collectibleGroups.has(lower)) return 'Collectibles'
  if (accessoryGroups.has(lower)) return 'Accessories'
  if (/^(?:football|baseball|basketball|hockey|soccer) jerseys?$/.test(lower)) return JERSEY_BY_LEAGUE[league] || source.replace(/s$/,'')
  if (lower === 'jerseys' || lower === 'jersey') return JERSEY_BY_LEAGUE[league] || 'Fan Apparel'

  // Ambiguous importer groups, including team names, need an explicit item
  // noun. Key chains take priority over the word "cap" in miniature charms.
  if (/key\s?(?:chain|ring)|mini cap|\b(?:pin|charm|magnet|sticker)\b|bottle opener/.test(title)) return 'Accessories'
  if (/\b(?:knit hat|beanie|skully)\b/.test(title)) return 'Knit Hats'
  if (/\b(?:cap|caps|snapback|visor)\b|\b(?:9fifty|9forty|59fifty|39thirty)\b/.test(title)) return 'Caps'
  if (/\b(?:jersey|trikot|kit|uniform)\b/.test(title)) return JERSEY_BY_LEAGUE[league] || 'Fan Apparel'
  if (/\b(?:hoodie|t-shirt|shirt|pullover|jacket|shorts|pants)\b/.test(title)) return 'Fan Apparel'
  if (/\b(?:trading card|figure|coin|framed|memorabilia|poster)\b/.test(title)) return 'Collectibles'
  if (lower === 'apparel') return 'Fan Apparel'
  return 'Accessories'
}

export function categoryForGroup(group) {
  if (group === 'Caps' || group === 'Knit Hats' || group === 'Accessories') return 'Accessories'
  if (group === 'Collectibles') return 'Collectibles'
  if (group === 'Fan Apparel') return 'Fan Apparel'
  return `${String(group || '').replace(/ Jersey$/,'')} Jerseys`
}
