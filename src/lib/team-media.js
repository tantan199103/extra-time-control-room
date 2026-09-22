import { leagueMedia } from './league-media.js'

/**
 * Team asset slugs do not always match the storefront taxonomy slug (mostly
 * MLS suffixes). Keep those translation rules in one place so menu links and
 * team landing pages never need to know the storage path shape.
 */
// These newly normalised MLS teams do not yet have a local logo asset. Use
// the league mark until an owned asset is supplied; never emit a broken URL.
const MISSING_LOCAL_ART = new Set([
  'mls/cf-montreal', 'mls/colorado-rapids', 'mls/columbus-crew',
  'mls/dc-united', 'mls/houston-dynamo', 'mls/new-england-revolution',
  'mls/real-salt-lake', 'mls/san-diego-fc', 'mls/san-jose-earthquakes'
])

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
  if (!['mlb', 'nfl', 'mls', 'ncaa', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'soccer'].includes(league) || !slug) return null
  if (MISSING_LOCAL_ART.has(`${league}/${slug}`)) {
    return parent ? { ...parent, alt: `${name} / ${league.toUpperCase()} league mark`, label: name, fallback: true } : null
  }
  return {
    src: `/assets/leagues/marks/teams/${league}/${slug}.webp`,
    alt: `${name} logo`,
    label: name,
    fallback: false
  }
}
