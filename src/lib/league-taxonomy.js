import { leagueMedia } from './league-media.js'
import { teamMedia } from './team-media.js'

/**
 * Curated league/team taxonomy used by the storefront navigation and SEO
 * landing pages. Product rows may use either `league`/`team` or the nested
 * `taxonomy.league`/`taxonomy.team` shape coming from the catalog service.
 *
 * Keep this list intentionally small and curated: it is navigation, not an
 * attempt to mirror every team in a league. Admin can still publish products
 * outside this list; those products remain searchable through the catalog.
 */
export const LEAGUE_TAXONOMY = [
  {
    key: 'nfl',
    name: 'NFL',
    sport: 'Football',
    description: 'Custom football jerseys and game-day layers for NFL fans.',
    media: leagueMedia('nfl'),
    teams: [
      ['arizona-cardinals', 'Arizona Cardinals'], ['atlanta-falcons', 'Atlanta Falcons'],
      ['baltimore-ravens', 'Baltimore Ravens'], ['buffalo-bills', 'Buffalo Bills'],
      ['carolina-panthers', 'Carolina Panthers'], ['chicago-bears', 'Chicago Bears'],
      ['cincinnati-bengals', 'Cincinnati Bengals'], ['cleveland-browns', 'Cleveland Browns'],
      ['dallas-cowboys', 'Dallas Cowboys'], ['denver-broncos', 'Denver Broncos'],
      ['detroit-lions', 'Detroit Lions'], ['green-bay-packers', 'Green Bay Packers'],
      ['houston-texans', 'Houston Texans'], ['indianapolis-colts', 'Indianapolis Colts'],
      ['jacksonville-jaguars', 'Jacksonville Jaguars'], ['kansas-city-chiefs', 'Kansas City Chiefs'],
      ['las-vegas-raiders', 'Las Vegas Raiders'], ['los-angeles-chargers', 'Los Angeles Chargers'],
      ['los-angeles-rams', 'Los Angeles Rams'], ['miami-dolphins', 'Miami Dolphins'],
      ['minnesota-vikings', 'Minnesota Vikings'], ['new-england-patriots', 'New England Patriots'],
      ['new-orleans-saints', 'New Orleans Saints'], ['new-york-giants', 'New York Giants'],
      ['new-york-jets', 'New York Jets'], ['philadelphia-eagles', 'Philadelphia Eagles'],
      ['pittsburgh-steelers', 'Pittsburgh Steelers'], ['san-francisco-49ers', 'San Francisco 49ers'],
      ['seattle-seahawks', 'Seattle Seahawks'], ['tampa-bay-buccaneers', 'Tampa Bay Buccaneers'],
      ['tennessee-titans', 'Tennessee Titans'], ['washington-commanders', 'Washington Commanders']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('nfl', slug, name) }))
  },
  {
    key: 'mlb',
    name: 'MLB',
    sport: 'Baseball',
    description: 'Personalized baseball jerseys and fan gear for the season.',
    media: leagueMedia('mlb'),
    teams: [
      ['arizona-diamondbacks', 'Arizona Diamondbacks'], ['atlanta-braves', 'Atlanta Braves'],
      ['baltimore-orioles', 'Baltimore Orioles'], ['boston-red-sox', 'Boston Red Sox'],
      ['chicago-cubs', 'Chicago Cubs'], ['chicago-white-sox', 'Chicago White Sox'],
      ['cincinnati-reds', 'Cincinnati Reds'], ['cleveland-guardians', 'Cleveland Guardians'],
      ['colorado-rockies', 'Colorado Rockies'], ['detroit-tigers', 'Detroit Tigers'],
      ['houston-astros', 'Houston Astros'], ['kansas-city-royals', 'Kansas City Royals'],
      ['los-angeles-angels', 'Los Angeles Angels'], ['los-angeles-dodgers', 'Los Angeles Dodgers'],
      ['miami-marlins', 'Miami Marlins'], ['milwaukee-brewers', 'Milwaukee Brewers'],
      ['minnesota-twins', 'Minnesota Twins'], ['new-york-mets', 'New York Mets'],
      ['new-york-yankees', 'New York Yankees'], ['philadelphia-phillies', 'Philadelphia Phillies'],
      ['pittsburgh-pirates', 'Pittsburgh Pirates'], ['san-diego-padres', 'San Diego Padres'],
      ['san-francisco-giants', 'San Francisco Giants'], ['seattle-mariners', 'Seattle Mariners'],
      ['st-louis-cardinals', 'St. Louis Cardinals'], ['tampa-bay-rays', 'Tampa Bay Rays'],
      ['texas-rangers', 'Texas Rangers'], ['toronto-blue-jays', 'Toronto Blue Jays'],
      ['washington-nationals', 'Washington Nationals']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('mlb', slug, name) }))
  },
  {
    key: 'nba',
    name: 'NBA',
    sport: 'Basketball',
    description: 'Basketball-inspired custom jerseys and fanwear.',
    media: leagueMedia('nba'),
    teams: [
      ['atlanta-hawks', 'Atlanta Hawks'], ['boston-celtics', 'Boston Celtics'],
      ['brooklyn-nets', 'Brooklyn Nets'], ['charlotte-hornets', 'Charlotte Hornets'],
      ['chicago-bulls', 'Chicago Bulls'], ['cleveland-cavaliers', 'Cleveland Cavaliers'],
      ['dallas-mavericks', 'Dallas Mavericks'], ['denver-nuggets', 'Denver Nuggets'],
      ['detroit-pistons', 'Detroit Pistons'], ['golden-state-warriors', 'Golden State Warriors'],
      ['houston-rockets', 'Houston Rockets'], ['indiana-pacers', 'Indiana Pacers'],
      ['la-clippers', 'LA Clippers'], ['los-angeles-lakers', 'Los Angeles Lakers'],
      ['memphis-grizzlies', 'Memphis Grizzlies'], ['miami-heat', 'Miami Heat'],
      ['milwaukee-bucks', 'Milwaukee Bucks'], ['minnesota-timberwolves', 'Minnesota Timberwolves'],
      ['new-orleans-pelicans', 'New Orleans Pelicans'], ['new-york-knicks', 'New York Knicks'],
      ['oklahoma-city-thunder', 'Oklahoma City Thunder'], ['orlando-magic', 'Orlando Magic'],
      ['philadelphia-76ers', 'Philadelphia 76ers'], ['phoenix-suns', 'Phoenix Suns'],
      ['portland-trail-blazers', 'Portland Trail Blazers'], ['sacramento-kings', 'Sacramento Kings'],
      ['san-antonio-spurs', 'San Antonio Spurs'], ['toronto-raptors', 'Toronto Raptors'],
      ['utah-jazz', 'Utah Jazz'], ['washington-wizards', 'Washington Wizards']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('nba', slug, name) }))
  },
  {
    key: 'mls',
    name: 'MLS',
    sport: 'Soccer',
    description: 'Soccer fanwear with custom names, numbers and team colorways.',
    media: leagueMedia('mls'),
    teams: [
      ['atlanta-united', 'Atlanta United FC'], ['austin-fc', 'Austin FC'],
      ['charlotte-fc', 'Charlotte FC'], ['chicago-fire', 'Chicago Fire FC'],
      ['fc-cincinnati', 'FC Cincinnati'], ['fc-dallas', 'FC Dallas'],
      ['inter-miami', 'Inter Miami CF'], ['la-galaxy', 'LA Galaxy'],
      ['los-angeles-fc', 'Los Angeles FC'], ['minnesota-united', 'Minnesota United'],
      ['nashville-sc', 'Nashville SC'], ['new-york-city-fc', 'New York City FC'],
      ['new-york-red-bulls', 'New York Red Bulls'], ['orlando-city', 'Orlando City SC'],
      ['philadelphia-union', 'Philadelphia Union'], ['portland-timbers', 'Portland Timbers'],
      ['seattle-sounders', 'Seattle Sounders FC'], ['sporting-kc', 'Sporting Kansas City'],
      ['st-louis-city', 'St. Louis CITY SC'], ['toronto-fc', 'Toronto FC'],
      ['vancouver-whitecaps', 'Vancouver Whitecaps FC']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('mls', slug, name) }))
  }
]

export const TAXONOMY_LEAGUE_BY_KEY = new Map(LEAGUE_TAXONOMY.map(league => [league.key, league]))
export const TAXONOMY_TEAM_BY_SLUG = new Map(LEAGUE_TAXONOMY.flatMap(league => league.teams.map(team => [`${league.key}/${team.slug}`, { ...team, leagueKey: league.key, leagueName: league.name }])))

export function taxonomySlug(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function leaguePath(league) { return `/league/${taxonomySlug(league.key || league.slug || league.name)}` }
export function teamPath(leagueKey, team) { return `/team/${taxonomySlug(leagueKey)}/${taxonomySlug(team.slug || team.name)}` }

export function findLeague(value) {
  const slug = taxonomySlug(value)
  return LEAGUE_TAXONOMY.find(league => league.key === slug || taxonomySlug(league.name) === slug) || null
}

export function findTeam(leagueKey, value) {
  const league = findLeague(leagueKey)
  if (!league) return null
  const slug = taxonomySlug(value)
  const team = league.teams.find(item => item.slug === slug || taxonomySlug(item.name) === slug)
  return team ? { ...team, leagueKey: league.key, leagueName: league.name } : null
}

export function productTaxonomyValues(product = {}) {
  const nested = product.taxonomy || {}
  const league = product.league || product.leagueKey || nested.league || nested.leagueKey || ''
  const team = product.team || product.teamSlug || nested.team || nested.teamSlug || ''
  const tags = Array.isArray(product.tags) ? product.tags : Array.isArray(nested.tags) ? nested.tags : []
  const haystack = [product.name, product.title, product.description, product.story, product.productGroup, league, team, ...tags].filter(Boolean).join(' ').toLowerCase()
  return { league: String(league), team: String(team), tags, haystack }
}

export function productMatchesTaxonomy(product, { league = '', team = '' } = {}) {
  const values = productTaxonomyValues(product)
  const leagueNeedle = taxonomySlug(league)
  const teamNeedle = taxonomySlug(team)
  const leagueMatch = !leagueNeedle || taxonomySlug(values.league) === leagueNeedle || values.haystack.includes(leagueNeedle.replace(/-/g, ' '))
  const teamMatch = !teamNeedle || taxonomySlug(values.team) === teamNeedle || values.haystack.includes(teamNeedle.replace(/-/g, ' '))
  return leagueMatch && teamMatch
}

export function taxonomyProductQuery({ league = '', team = '' } = {}) {
  const params = new URLSearchParams()
  if (league) params.set('league', taxonomySlug(league))
  if (team) params.set('team', taxonomySlug(team))
  return params.toString()
}
