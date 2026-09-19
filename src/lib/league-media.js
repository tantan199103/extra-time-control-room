/**
 * League artwork used by taxonomy landing pages.
 *
 * These files live in a separate `fangear-reference` directory so their
 * provenance is visible. The source site currently marks its content as
 * all-rights-reserved; obtain a written licence (or replace these files with
 * owned artwork) before publishing them to a public storefront.
 */
export const LEAGUE_MEDIA = Object.freeze({
  nfl: Object.freeze({
    src: '/assets/leagues/fangear-reference/nfl.webp',
    alt: 'NFL league mark',
    label: 'NFL',
    sourceUrl: 'https://fangearsport.com/wp-content/themes/flatsome-child/assets/fgs/images/logos/national-football-league.webp'
  }),
  mlb: Object.freeze({
    src: '/assets/leagues/fangear-reference/mlb.webp',
    alt: 'MLB league mark',
    label: 'MLB',
    sourceUrl: 'https://fangearsport.com/wp-content/themes/flatsome-child/assets/fgs/images/logos/major-league-baseball.webp'
  }),
  nba: Object.freeze({
    src: '/assets/leagues/fangear-reference/nba.webp',
    alt: 'NBA league mark',
    label: 'NBA',
    sourceUrl: 'https://fangearsport.com/wp-content/themes/flatsome-child/assets/fgs/images/logos/national-basketball-association.webp'
  }),
  mls: Object.freeze({
    src: '/assets/leagues/fangear-reference/mls.webp',
    alt: 'MLS league mark',
    label: 'MLS',
    sourceUrl: 'https://fangearsport.com/wp-content/themes/flatsome-child/assets/fgs/images/logos/major-league-soccer.webp'
  })
})

export function leagueMedia(key) {
  return LEAGUE_MEDIA[String(key || '').toLowerCase()] || null
}
