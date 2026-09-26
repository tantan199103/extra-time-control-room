import {
  LEAGUE_TAXONOMY,
  findLeague,
  findTeam,
  normalizeCatalogTaxonomy,
  normalizeTeamSlug,
  taxonomySlug
} from './league-taxonomy.js'

// This module is deliberately pure. It is used by the editor, SEO scripts and
// audits, so a taxonomy decision must not depend on Supabase or browser state.

const LEAGUE_ALIASES = Object.freeze({
  nfl: ['nfl', 'national football league'],
  mlb: ['mlb', 'major league baseball'],
  nba: ['nba', 'national basketball association'],
  nhl: ['nhl', 'national hockey league'],
  mls: ['mls', 'major league soccer'],
  ncaa: ['ncaa', 'college sports', 'college football', 'college basketball'],
  epl: ['epl', 'premier league', 'english premier league'],
  laliga: ['la liga', 'laliga'],
  seriea: ['serie a', 'serie-a'],
  bundesliga: ['bundesliga'],
  ligue1: ['ligue 1', 'ligue-1'],
  soccer: ['soccer', 'football association'],
  // Wrestling and motorsport are deliberately split into leaf entities where
  // the source gives us enough evidence. Their umbrella keys are retained for
  // generic listings that cannot be assigned to a single promotion/series.
  wwe: ['wwe', 'world wrestling entertainment'],
  aew: ['aew', 'all elite wrestling'],
  wrestling: ['wrestling', 'professional wrestling'],
  nascar: ['nascar', 'national association for stock car auto racing'],
  formula1: ['formula 1', 'formula one', 'formel 1', 'f1'],
  motorsports: ['motorsport', 'motorsports', 'motor racing', 'racing']
})

const SPORT_ALIASES = Object.freeze({
  football: ['football', 'gridiron'],
  baseball: ['baseball'],
  basketball: ['basketball'],
  hockey: ['hockey', 'ice hockey'],
  soccer: ['soccer', 'football association'],
  college: ['college', 'ncaa'],
  wrestling: ['wrestling', 'professional wrestling'],
  motorsports: ['motorsport', 'motorsports', 'motor racing', 'racing']
})

const LEAGUE_SPORT = Object.freeze({
  nfl: 'football', mlb: 'baseball', nba: 'basketball', nhl: 'hockey', mls: 'soccer',
  epl: 'soccer', laliga: 'soccer', seriea: 'soccer', bundesliga: 'soccer', ligue1: 'soccer',
  soccer: 'soccer', ncaa: 'college',
  wwe: 'wrestling', aew: 'wrestling', wrestling: 'wrestling',
  nascar: 'motorsports', formula1: 'motorsports', motorsports: 'motorsports'
})

const GROUP_SPORT = Object.freeze({
  'football jersey': ['football', 'college'],
  'baseball jersey': ['baseball', 'college'],
  'basketball jersey': ['basketball', 'college'],
  'hockey jersey': ['hockey'],
  'soccer jersey': ['soccer']
})

const NEUTRAL_GROUPS = new Set([
  'caps', 'cap', 'hats', 'hat', 'headwear', 'visors', 'knit hats', 'knit hat', 'beanies', 'beanie',
  'accessories', 'apparel', 'hoodies', 'shirts', 't-shirts', 'tshirt', 'jerseys', 'jersey'
])

const LEAGUE_KEYS = new Set([...LEAGUE_TAXONOMY.map(item => item.key), ...Object.keys(LEAGUE_SPORT)])
const LEAGUE_TERM_TO_KEY = new Map()
for (const [key, aliases] of Object.entries(LEAGUE_ALIASES)) {
  for (const alias of aliases) LEAGUE_TERM_TO_KEY.set(taxonomySlug(alias).replace(/-/g, ' '), key)
}

function text(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedToken(value) {
  return taxonomySlug(value).replace(/-/g, ' ').trim()
}

function canonicalLeague(value) {
  const token = normalizedToken(value)
  if (!token) return ''
  if (LEAGUE_KEYS.has(token.replace(/\s+/g, '-'))) return token.replace(/\s+/g, '-')
  return LEAGUE_TERM_TO_KEY.get(token) || ''
}

function canonicalSport(value) {
  const token = normalizedToken(value)
  if (!token) return ''
  for (const [key, aliases] of Object.entries(SPORT_ALIASES)) {
    if (aliases.some(alias => normalizedToken(alias) === token)) return key
  }
  return token.replace(/\s+/g, '-')
}

function groupKey(value) {
  return text(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function wordPattern(value) {
  // Use boundaries around the complete phrase. This is important for team
  // names such as Washington Capitals: "cap" must never become a league hit.
  const escaped = String(value).trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

function detectedTerms(haystack, dictionary) {
  const found = new Set()
  for (const [key, aliases] of Object.entries(dictionary)) {
    if (aliases.some(alias => wordPattern(alias).test(haystack))) found.add(key)
  }
  return [...found]
}

function taxonomySource(product) {
  const nested = product?.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  return {
    nested,
    league: product?.league || product?.leagueKey || nested.league || nested.leagueKey || '',
    team: product?.team || product?.teamSlug || nested.team || nested.teamSlug || '',
    sport: product?.sport || nested.sport || '',
    group: product?.productGroup || product?.product_group || nested.productGroup || nested.product_group || ''
  }
}

function productText(product, source) {
  return [
    product?.title, product?.name, product?.subtitle, product?.description, product?.story,
    product?.handle, source.league, source.team, source.group,
    ...(Array.isArray(product?.tags) ? product.tags : []),
    ...(Array.isArray(source.nested?.tags) ? source.nested.tags : [])
  ].map(text).filter(Boolean).join(' ')
}

function unique(values) { return [...new Set(values.filter(Boolean))] }

function compatibleLeagueText(declared, detected) {
  if (!declared || !detected) return true
  if (declared === detected) return true
  // "Soccer" is the umbrella landing taxonomy for its controlled leagues.
  if (declared === 'soccer' && ['mls', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'soccer'].includes(detected)) return true
  if (detected === 'soccer' && ['mls', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'soccer'].includes(declared)) return true
  const wrestlingLeaves = ['wwe', 'aew']
  if ((declared === 'wrestling' && (wrestlingLeaves.includes(detected) || detected === 'wrestling'))
    || (detected === 'wrestling' && (wrestlingLeaves.includes(declared) || declared === 'wrestling'))) return true
  const motorsportLeaves = ['nascar', 'formula1']
  if ((declared === 'motorsports' && (motorsportLeaves.includes(detected) || detected === 'motorsports'))
    || (detected === 'motorsports' && (motorsportLeaves.includes(declared) || declared === 'motorsports'))) return true
  return false
}

/**
 * Validate the semantic relationship between league, team, sport, copy and
 * product group. Missing taxonomy is reported as a warning because legacy
 * listings can still be searched; explicit contradictions are blockers for
 * indexing and publishing.
 */
export function validateCatalogTaxonomy(product = {}) {
  const source = taxonomySource(product)
  const normalized = normalizeCatalogTaxonomy(product)
  const declaredLeague = canonicalLeague(source.league || normalized.league)
  const rawLeague = text(source.league)
  const declaredTeam = source.team ? normalizeTeamSlug(declaredLeague || source.league, source.team) : ''
  const declaredSport = canonicalSport(source.sport || normalized.sport)
  const group = groupKey(source.group || normalized.productGroup)
  const haystack = productText(product, source)
  const leagueTerms = detectedTerms(haystack, LEAGUE_ALIASES)
  const sportTerms = detectedTerms(haystack, SPORT_ALIASES)
  const blockers = []
  const warnings = []

  if (rawLeague && !declaredLeague) blockers.push('TAXONOMY_UNKNOWN_LEAGUE')
  if (!rawLeague) warnings.push('TAXONOMY_LEAGUE_REQUIRED')

  const league = declaredLeague || ''
  const team = declaredTeam || ''
  // `LEAGUE_TAXONOMY` contains the curated team directories. Promotion and
  // racing entities are controlled as well, but intentionally have no team
  // directory yet; they must still be valid for PDP/feed classification.
  const controlledLeague = league ? (findLeague(league) || LEAGUE_SPORT[league]) : null
  if (league && !controlledLeague) blockers.push('TAXONOMY_UNKNOWN_LEAGUE')

  if (source.team && league) {
    const teamInLeague = findTeam(league, source.team)
    if (!teamInLeague) {
      const elsewhere = LEAGUE_TAXONOMY.find(item => findTeam(item.key, source.team))
      if (elsewhere) blockers.push('TAXONOMY_TEAM_LEAGUE_MISMATCH')
      else warnings.push('TAXONOMY_UNKNOWN_TEAM')
    }
  } else if (!source.team) {
    warnings.push('TAXONOMY_TEAM_RECOMMENDED')
  }

  const expectedSport = LEAGUE_SPORT[league] || ''
  if (declaredSport && expectedSport && declaredSport !== expectedSport && !(expectedSport === 'college' && ['football', 'baseball', 'basketball'].includes(declaredSport))) {
    blockers.push('TAXONOMY_SPORT_MISMATCH')
  }

  const incompatibleLeagueTerm = leagueTerms.find(term => !compatibleLeagueText(league, term))
  if (incompatibleLeagueTerm && league) blockers.push('TAXONOMY_LEAGUE_TEXT_MISMATCH')
  if (!league && leagueTerms.length > 1) warnings.push('TAXONOMY_LEAGUE_REQUIRED')

  const groupSports = GROUP_SPORT[group]
  if (groupSports && expectedSport && !groupSports.includes(expectedSport)) blockers.push('TAXONOMY_PRODUCT_GROUP_MISMATCH')
  if (groupSports && sportTerms.length && expectedSport && !sportTerms.includes(expectedSport) && !sportTerms.includes('college')) {
    blockers.push('TAXONOMY_SPORT_MISMATCH')
  }
  if (group && !groupSports && !NEUTRAL_GROUPS.has(group) && !/jersey|apparel|shirt|hoodie|cap|hat|accessor/i.test(group)) {
    warnings.push('TAXONOMY_PRODUCT_GROUP_REVIEW')
  }

  const cleanBlockers = unique(blockers)
  const cleanWarnings = unique(warnings.filter(reason => !cleanBlockers.includes(reason)))
  const canonicalTaxonomy = {
    ...normalized,
    ...(league ? { league } : {}),
    ...(team ? { team } : {}),
    ...(declaredSport ? { sport: declaredSport } : expectedSport ? { sport: expectedSport } : {})
  }
  return {
    valid: cleanBlockers.length === 0,
    blockers: cleanBlockers,
    warnings: cleanWarnings,
    normalized: canonicalTaxonomy,
    detected: { leagueTerms, sportTerms, league, team, sport: declaredSport || expectedSport, productGroup: group }
  }
}

export { canonicalLeague, canonicalSport, LEAGUE_SPORT, GROUP_SPORT }
