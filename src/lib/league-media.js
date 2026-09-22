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
  }),
  soccer: Object.freeze({
    src: '/assets/leagues/marks/soccer.webp',
    alt: 'Soccer mark',
    label: 'Soccer'
  }),
  epl: Object.freeze({
    src: '/assets/leagues/marks/epl.webp',
    alt: 'Premier League mark',
    label: 'Premier League'
  }),
  laliga: Object.freeze({
    src: '/assets/leagues/marks/laliga.webp',
    alt: 'La Liga mark',
    label: 'La Liga'
  }),
  seriea: Object.freeze({
    src: '/assets/leagues/marks/seriea.webp',
    alt: 'Serie A mark',
    label: 'Serie A'
  }),
  bundesliga: Object.freeze({
    src: '/assets/leagues/marks/bundesliga.webp',
    alt: 'Bundesliga mark',
    label: 'Bundesliga'
  }),
  ligue1: Object.freeze({
    src: '/assets/leagues/marks/ligue1.webp',
    alt: 'Ligue 1 mark',
    label: 'Ligue 1'
  }),
  ucl: Object.freeze({
    src: '/assets/leagues/marks/ucl.webp',
    alt: 'UEFA Champions League mark',
    label: 'Champions League'
  })
})

export function leagueMedia(key) {
  return LEAGUE_MEDIA[String(key || '').toLowerCase()] || null
}
