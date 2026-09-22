/** League artwork used by taxonomy landing pages. */
export const LEAGUE_MEDIA = Object.freeze({
  nfl: Object.freeze({
    src: '/assets/leagues/marks/nfl.webp',
    alt: 'NFL league mark',
    label: 'NFL'
  }),
  mlb: Object.freeze({
    src: '/assets/leagues/marks/mlb.webp',
    alt: 'MLB league mark',
    label: 'MLB'
  }),
  nba: Object.freeze({
    src: '/assets/leagues/marks/nba.webp',
    alt: 'NBA league mark',
    label: 'NBA'
  }),
  mls: Object.freeze({
    src: '/assets/leagues/marks/mls.webp',
    alt: 'MLS league mark',
    label: 'MLS'
  }),
  ncaa: Object.freeze({
    src: '/assets/leagues/marks/ncaa.webp',
    alt: 'NCAA league mark',
    label: 'NCAA'
  })
})

export function leagueMedia(key) {
  return LEAGUE_MEDIA[String(key || '').toLowerCase()] || null
}
