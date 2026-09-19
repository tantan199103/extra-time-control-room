import { leagueMedia } from './league-media.js'

/**
 * Fangear's team asset slugs do not always match the storefront taxonomy
 * slug (mostly MLS suffixes). Keep those translation rules in one place so
 * menu links and team landing pages never need to know the source URL shape.
 */
const SOURCE_SLUG_OVERRIDES = Object.freeze({
  mls: Object.freeze({
    'atlanta-united': 'atlanta-united-fc',
    'chicago-fire': 'chicago-fire-fc',
    'inter-miami': 'inter-miami-cf',
    'minnesota-united': 'minnesota-united-fc',
    'orlando-city': 'orlando-city-sc',
    'seattle-sounders': 'seattle-sounders-fc',
    'sporting-kc': 'sporting-kansas-city',
    'st-louis-city': 'st-louis-city-sc',
    'vancouver-whitecaps': 'vancouver-whitecaps-fc'
  })
})

export function teamMedia(leagueKey, teamSlug, teamName = teamSlug) {
  const league = String(leagueKey || '').toLowerCase()
  const slug = String(teamSlug || '').toLowerCase()
  const name = String(teamName || slug)
  const parent = leagueMedia(league)

  // Fangear currently exposes no NBA team-logo assets; keep the parent mark as
  // a deliberate fallback instead of inventing a URL that would 404.
  if (league === 'nba') {
    return parent ? { ...parent, alt: `${name} / NBA league mark`, label: name, fallback: true } : null
  }
  if (!['mlb', 'nfl', 'mls'].includes(league) || !slug) return null

  const sourceSlug = SOURCE_SLUG_OVERRIDES[league]?.[slug] || slug
  return {
    src: `/assets/leagues/fangear-reference/teams/${league}/${slug}.webp`,
    alt: `${name} logo`,
    label: name,
    sourceUrl: `https://fangearsport.com/wp-content/themes/flatsome-child/assets/fgs/teams/${league}/${sourceSlug}-${league}-logo.webp`,
    fallback: false
  }
}
