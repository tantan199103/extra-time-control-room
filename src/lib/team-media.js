/**
 * Team asset slugs do not always match the storefront taxonomy slug (mostly
 * MLS suffixes). Keep those translation rules in one place so menu links and
 * team landing pages never need to know the storage path shape.
 *
 * Every team currently exposed by LEAGUE_TAXONOMY has a checked-in WebP mark.
 * Keeping this resolver local means a menu render never waits on a remote
 * provider and never silently replaces a real team mark with a league mark.
 */
export function teamMedia(leagueKey, teamSlug, teamName = teamSlug) {
  const league = String(leagueKey || '').toLowerCase()
  const slug = String(teamSlug || '').toLowerCase()
  const name = String(teamName || slug)

  if (!['mlb', 'nfl', 'nba', 'nhl', 'mls', 'ncaa', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'soccer'].includes(league) || !slug) return null
  return {
    src: `/assets/leagues/marks/teams/${league}/${slug}.webp`,
    alt: `${name} logo`,
    label: name,
    fallback: false
  }
}
