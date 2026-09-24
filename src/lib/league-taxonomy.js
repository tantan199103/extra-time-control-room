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
    key: 'nhl',
    name: 'NHL',
    sport: 'Hockey',
    description: 'Explore NHL hockey fan gear by team, including jerseys, caps and game-day layers.',
    media: leagueMedia('nhl'),
    teams: [
      ['boston-bruins', 'Boston Bruins'], ['new-york-rangers', 'New York Rangers'],
      ['chicago-blackhawks', 'Chicago Blackhawks'], ['vegas-golden-knights', 'Vegas Golden Knights'],
      ['new-york-islanders', 'New York Islanders'], ['los-angeles-kings', 'Los Angeles Kings'],
      ['pittsburgh-penguins', 'Pittsburgh Penguins'], ['toronto-maple-leafs', 'Toronto Maple Leafs'],
      ['philadelphia-flyers', 'Philadelphia Flyers'], ['colorado-avalanche', 'Colorado Avalanche'],
      ['vancouver-canucks', 'Vancouver Canucks'], ['san-jose-sharks', 'San Jose Sharks'],
      ['seattle-kraken', 'Seattle Kraken'], ['anaheim-ducks', 'Anaheim Ducks'],
      ['new-jersey-devils', 'New Jersey Devils'], ['detroit-red-wings', 'Detroit Red Wings'],
      ['washington-capitals', 'Washington Capitals'], ['buffalo-sabres', 'Buffalo Sabres'],
      ['edmonton-oilers', 'Edmonton Oilers'], ['st-louis-blues', 'St. Louis Blues']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('nhl', slug, name) }))
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
      ['vancouver-whitecaps', 'Vancouver Whitecaps FC'], ['cf-montreal', 'CF Montréal'],
      ['colorado-rapids', 'Colorado Rapids'], ['columbus-crew', 'Columbus Crew'],
      ['dc-united', 'D.C. United'], ['houston-dynamo', 'Houston Dynamo FC'],
      ['new-england-revolution', 'New England Revolution'], ['real-salt-lake', 'Real Salt Lake'],
      ['san-diego-fc', 'San Diego FC'], ['san-jose-earthquakes', 'San Jose Earthquakes']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('mls', slug, name) }))
  },
  {
    key: 'ncaa',
    name: 'NCAA',
    sport: 'College',
    description: 'Custom college jerseys and game-day fanwear for top NCAA teams.',
    media: leagueMedia('ncaa'),
    teams: [
      ['alabama-crimson-tide', 'Alabama Crimson Tide'],
      ['georgia-bulldogs', 'Georgia Bulldogs'],
      ['ohio-state-buckeyes', 'Ohio State Buckeyes'],
      ['michigan-wolverines', 'Michigan Wolverines'],
      ['texas-longhorns', 'Texas Longhorns'],
      ['notre-dame-fighting-irish', 'Notre Dame Fighting Irish'],
      ['lsu-tigers', 'LSU Tigers'],
      ['oregon-ducks', 'Oregon Ducks'],
      ['penn-state-nittany-lions', 'Penn State Nittany Lions'],
      ['florida-gators', 'Florida Gators'],
      ['usc-trojans', 'USC Trojans'],
      ['tennessee-volunteers', 'Tennessee Volunteers'],
      ['oklahoma-sooners', 'Oklahoma Sooners'],
      ['clemson-tigers', 'Clemson Tigers'],
      ['florida-state-seminoles', 'Florida State Seminoles'],
      ['north-carolina-tar-heels', 'North Carolina Tar Heels'],
      ['kentucky-wildcats', 'Kentucky Wildcats'],
      ['duke-blue-devils', 'Duke Blue Devils'],
      ['miami-hurricanes', 'Miami Hurricanes'],
      ['colorado-buffaloes', 'Colorado Buffaloes'],
      ['auburn-tigers', 'Auburn Tigers'],
      ['washington-huskies', 'Washington Huskies'],
      ['wisconsin-badgers', 'Wisconsin Badgers'],
      ['ucla-bruins', 'UCLA Bruins'],
      ['texas-am-aggies', 'Texas A&M Aggies'],
      ['nebraska-cornhuskers', 'Nebraska Cornhuskers'],
      ['iowa-hawkeyes', 'Iowa Hawkeyes'],
      ['michigan-state-spartans', 'Michigan State Spartans'],
      ['kansas-jayhawks', 'Kansas Jayhawks'],
      ['indiana-hoosiers', 'Indiana Hoosiers']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('ncaa', slug, name) }))
  },
  {
    key: 'epl',
    name: 'Premier League',
    sport: 'Soccer',
    description: 'Personalized Premier League jerseys and official English soccer fan gear.',
    media: leagueMedia('epl'),
    teams: [
      ['arsenal', 'Arsenal'],
      ['aston-villa', 'Aston Villa'],
      ['chelsea', 'Chelsea'],
      ['everton', 'Everton'],
      ['fulham', 'Fulham'],
      ['liverpool', 'Liverpool'],
      ['manchester-city', 'Manchester City'],
      ['manchester-united', 'Manchester United'],
      ['newcastle-united', 'Newcastle United'],
      ['tottenham-hotspur', 'Tottenham Hotspur'],
      ['west-ham-united', 'West Ham United'],
      ['wolverhampton-wanderers', 'Wolverhampton Wanderers'],
      ['brighton-and-hove-albion', 'Brighton & Hove Albion'],
      ['crystal-palace', 'Crystal Palace'],
      ['brentford', 'Brentford'],
      ['nottingham-forest', 'Nottingham Forest']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('epl', slug, name) }))
  },
  {
    key: 'laliga',
    name: 'La Liga',
    sport: 'Soccer',
    description: 'Custom Spanish La Liga soccer jerseys and official club kits.',
    media: leagueMedia('laliga'),
    teams: [
      ['real-madrid', 'Real Madrid'],
      ['fc-barcelona', 'FC Barcelona'],
      ['atletico-madrid', 'Atlético Madrid'],
      ['athletic-club', 'Athletic Club Bilbao'],
      ['real-sociedad', 'Real Sociedad'],
      ['real-betis', 'Real Betis'],
      ['sevilla', 'Sevilla FC'],
      ['valencia', 'Valencia CF'],
      ['villarreal', 'Villarreal CF'],
      ['girona', 'Girona FC']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('laliga', slug, name) }))
  },
  {
    key: 'seriea',
    name: 'Serie A',
    sport: 'Soccer',
    description: 'Italian Serie A custom football shirts and fanwear for iconic Calcio clubs.',
    media: leagueMedia('seriea'),
    teams: [
      ['inter-milan', 'Inter Milan'],
      ['juventus', 'Juventus'],
      ['ac-milan', 'AC Milan'],
      ['napoli', 'Napoli'],
      ['as-roma', 'AS Roma'],
      ['lazio', 'SS Lazio'],
      ['atalanta', 'Atalanta'],
      ['fiorentina', 'Fiorentina']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('seriea', slug, name) }))
  },
  {
    key: 'bundesliga',
    name: 'Bundesliga',
    sport: 'Soccer',
    description: 'Custom German Bundesliga jerseys and match-day kits.',
    media: leagueMedia('bundesliga'),
    teams: [
      ['bayern-munich', 'Bayern Munich'],
      ['borussia-dortmund', 'Borussia Dortmund'],
      ['bayer-leverkusen', 'Bayer Leverkusen'],
      ['rb-leipzig', 'RB Leipzig'],
      ['eintracht-frankfurt', 'Eintracht Frankfurt'],
      ['vfb-stuttgart', 'VfB Stuttgart']
    ].map(([slug, name]) => ({ slug, name, media: teamMedia('bundesliga', slug, name) }))
  }
]

export const TAXONOMY_LEAGUE_BY_KEY = new Map(LEAGUE_TAXONOMY.map(league => [league.key, league]))
export const TAXONOMY_TEAM_BY_SLUG = new Map(LEAGUE_TAXONOMY.flatMap(league => league.teams.map(team => [`${league.key}/${team.slug}`, { ...team, leagueKey: league.key, leagueName: league.name }])))

// Source catalogues frequently append the legal/team suffix to a slug. Keep
// those aliases at the taxonomy boundary so imported products, menu links and
// SEO pages all resolve to one canonical URL.
export const TEAM_SLUG_ALIASES = Object.freeze({
  mls: Object.freeze({
    'atlanta-united-fc': 'atlanta-united',
    'chicago-fire-fc': 'chicago-fire',
    'inter-miami-cf': 'inter-miami',
    'minnesota-united-fc': 'minnesota-united',
    'orlando-city-sc': 'orlando-city',
    'seattle-sounders-fc': 'seattle-sounders',
    'sporting-kansas-city': 'sporting-kc',
    'st-louis-city-sc': 'st-louis-city',
    'vancouver-whitecaps-fc': 'vancouver-whitecaps'
  }),
  ncaa: Object.freeze({
    'alabama': 'alabama-crimson-tide',
    'georgia': 'georgia-bulldogs',
    'ohio-state': 'ohio-state-buckeyes',
    'michigan': 'michigan-wolverines',
    'texas': 'texas-longhorns',
    'notre-dame': 'notre-dame-fighting-irish',
    'lsu': 'lsu-tigers',
    'oregon': 'oregon-ducks',
    'penn-state': 'penn-state-nittany-lions',
    'florida': 'florida-gators',
    'usc': 'usc-trojans',
    'tennessee': 'tennessee-volunteers',
    'oklahoma': 'oklahoma-sooners',
    'clemson': 'clemson-tigers',
    'florida-state': 'florida-state-seminoles',
    'north-carolina': 'north-carolina-tar-heels',
    'unc': 'north-carolina-tar-heels',
    'kentucky': 'kentucky-wildcats',
    'duke': 'duke-blue-devils',
    'miami': 'miami-hurricanes',
    'colorado': 'colorado-buffaloes',
    'auburn': 'auburn-tigers',
    'washington': 'washington-huskies',
    'wisconsin': 'wisconsin-badgers',
    'ucla': 'ucla-bruins',
    'texas-am': 'texas-am-aggies',
    'nebraska': 'nebraska-cornhuskers',
    'iowa': 'iowa-hawkeyes',
    'michigan-state': 'michigan-state-spartans',
    'kansas': 'kansas-jayhawks',
    'indiana': 'indiana-hoosiers'
  }),
  epl: Object.freeze({
    'man-city': 'manchester-city',
    'manchester-city-fc': 'manchester-city',
    'man-united': 'manchester-united',
    'man-utd': 'manchester-united',
    'manchester-united-fc': 'manchester-united',
    'spurs': 'tottenham-hotspur',
    'tottenham': 'tottenham-hotspur',
    'wolves': 'wolverhampton-wanderers',
    'brighton': 'brighton-and-hove-albion',
    'newcastle': 'newcastle-united',
    'west-ham': 'west-ham-united'
  }),
  laliga: Object.freeze({
    'barca': 'fc-barcelona',
    'barcelona': 'fc-barcelona',
    'real': 'real-madrid',
    'atletico': 'atletico-madrid',
    'atletico-de-madrid': 'atletico-madrid',
    'bilbao': 'athletic-club',
    'sociedad': 'real-sociedad',
    'betis': 'real-betis'
  }),
  seriea: Object.freeze({
    'inter': 'inter-milan',
    'internazionale': 'inter-milan',
    'milan': 'ac-milan',
    'roma': 'as-roma',
    'juve': 'juventus'
  }),
  bundesliga: Object.freeze({
    'bayern': 'bayern-munich',
    'fc-bayern': 'bayern-munich',
    'dortmund': 'borussia-dortmund',
    'bvb': 'borussia-dortmund',
    'leverkusen': 'bayer-leverkusen',
    'frankfurt': 'eintracht-frankfurt',
    'stuttgart': 'vfb-stuttgart'
  }),
  // These clubs are present in the imported catalogue but were absent from
  // the first curated navigation pass. They are still normalized here so a
  // future curated page can be added without another data migration.
  mls_additional: Object.freeze({
    'cf-montreal': 'cf-montreal',
    'colorado-rapids': 'colorado-rapids',
    'columbus-crew': 'columbus-crew',
    'd-c-united': 'dc-united',
    'houston-dynamo-fc': 'houston-dynamo',
    'new-england-revolution': 'new-england-revolution',
    'real-salt-lake': 'real-salt-lake',
    'san-diego-fc': 'san-diego-fc',
    'san-jose-earthquakes': 'san-jose-earthquakes'
  })
})

export function taxonomySlug(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function normalizeTeamSlug(leagueKey, value) {
  const league = taxonomySlug(leagueKey)
  const slug = taxonomySlug(value)
  return TEAM_SLUG_ALIASES[league]?.[slug] || TEAM_SLUG_ALIASES.mls_additional?.[slug] || slug
}

export function leaguePath(league) { return `/league/${taxonomySlug(league.key || league.slug || league.name)}` }
export function teamPath(leagueKey, team) { return `/team/${taxonomySlug(leagueKey)}/${taxonomySlug(team.slug || team.name)}` }

export function findLeague(value) {
  const slug = taxonomySlug(value)
  if (slug === 'soccer') {
    const soccerLeagues = LEAGUE_TAXONOMY.filter(l => l.sport === 'Soccer')
    return {
      key: 'soccer',
      name: 'Soccer',
      sport: 'Soccer',
      description: 'World soccer jerseys and kits from the Premier League, La Liga, Serie A, Bundesliga and MLS.',
      media: leagueMedia('soccer'),
      teams: soccerLeagues.flatMap(l => l.teams)
    }
  }
  return LEAGUE_TAXONOMY.find(league => league.key === slug || taxonomySlug(league.name) === slug) || null
}

export function findTeam(leagueKey, value) {
  const league = findLeague(leagueKey)
  if (!league) return null
  const slug = normalizeTeamSlug(league.key, value)
  const team = league.teams.find(item => item.slug === slug || taxonomySlug(item.name) === slug)
  return team ? { ...team, leagueKey: league.key, leagueName: league.name } : null
}

export function productTaxonomyValues(product = {}) {
  const nested = product.taxonomy || {}
  const league = product.league || product.leagueKey || nested.league || nested.leagueKey || ''
  const team = normalizeTeamSlug(league, product.team || product.teamSlug || nested.team || nested.teamSlug || '')
  const tags = Array.isArray(product.tags) ? product.tags : Array.isArray(nested.tags) ? nested.tags : []
  const haystack = [product.name, product.title, product.description, product.story, product.productGroup, league, team, ...tags].filter(Boolean).join(' ').toLowerCase()
  return { league: String(league), team: String(team), tags, haystack }
}

const CONTROLLED_PRODUCT_GROUPS = new Map([
  ['caps','Caps'], ['cap','Caps'], ['hats','Caps'], ['hat','Caps'], ['headwear','Caps'], ['visors','Caps'],
  ['knit hats','Knit Hats'], ['knit hat','Knit Hats'], ['beanies','Knit Hats'], ['beanie','Knit Hats'],
  ['football jersey','Football Jersey'], ['football jerseys','Football Jersey'],
  ['baseball jersey','Baseball Jersey'], ['baseball jerseys','Baseball Jersey'],
  ['basketball jersey','Basketball Jersey'], ['basketball jerseys','Basketball Jersey'],
  ['hockey jersey','Hockey Jersey'], ['hockey jerseys','Hockey Jersey'],
  ['soccer jersey','Soccer Jersey'], ['soccer jerseys','Soccer Jersey']
])

function inferTeamFromText(league, text) {
  const value = ` ${taxonomySlug(text).replace(/-/g, ' ')} `
  const teams = findLeague(league)?.teams || []
  return teams
    .filter(team => value.includes(` ${taxonomySlug(team.name).replace(/-/g, ' ')} `))
    .sort((a,b) => b.name.length - a.name.length)[0]?.slug || ''
}

export function normalizeCatalogTaxonomy(product = {}) {
  const nested = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const league = taxonomySlug(product.league || product.leagueKey || nested.league || nested.leagueKey || '')
  const text = [product.title,product.name,product.handle,product.productGroup,product.product_group,product.sku].filter(Boolean).join(' ')
  const team = normalizeTeamSlug(league, product.team || product.teamSlug || nested.team || nested.teamSlug || '') || inferTeamFromText(league,text)
  const rawGroup = String(product.productGroup || product.product_group || nested.productGroup || '').trim()
  const groupKey = rawGroup.toLowerCase().replace(/\s+/g,' ')
  let productGroup = CONTROLLED_PRODUCT_GROUPS.get(groupKey) || rawGroup
  if (!CONTROLLED_PRODUCT_GROUPS.has(groupKey) && team && !/jersey|apparel|hoodie|shirt/i.test(rawGroup) && !/jersey/i.test(text)) productGroup = 'Accessories'
  const category = nested.category || (productGroup === 'Accessories' || productGroup === 'Caps' || productGroup === 'Knit Hats' ? 'Accessories' : productGroup)
  return { ...nested, ...(league ? { league } : {}), ...(team ? { team } : {}), ...(category ? { category } : {}), ...(productGroup ? { productGroup } : {}) }
}

export function productMatchesTaxonomy(product, { league = '', team = '' } = {}) {
  const values = productTaxonomyValues(product)
  const leagueNeedle = taxonomySlug(league)
  const teamNeedle = normalizeTeamSlug(league, team)
  const structuredLeague = taxonomySlug(values.league)
  const structuredTeam = taxonomySlug(values.team)
  const isSoccerMatch = leagueNeedle === 'soccer' && (structuredLeague
    ? ['mls', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'soccer'].includes(structuredLeague)
    : values.haystack.includes('soccer'))
  const leagueMatch = !leagueNeedle || isSoccerMatch || (structuredLeague
    ? structuredLeague === leagueNeedle
    : values.haystack.includes(leagueNeedle.replace(/-/g, ' ')))
  const teamMatch = !teamNeedle || (structuredTeam
    ? structuredTeam === teamNeedle
    : values.haystack.includes(teamNeedle.replace(/-/g, ' ')))
  return leagueMatch && teamMatch
}

export function taxonomyProductQuery({ league = '', team = '' } = {}) {
  const params = new URLSearchParams()
  if (league) params.set('league', taxonomySlug(league))
  if (team) params.set('team', taxonomySlug(team))
  return params.toString()
}

export function teamMascot(fullName = '') {
  const special = {
    'Boston Red Sox': 'Red Sox',
    'Chicago White Sox': 'White Sox',
    'Toronto Blue Jays': 'Blue Jays',
    'Portland Trail Blazers': 'Trail Blazers',
    'Minnesota Timberwolves': 'Timberwolves',
    'Columbus Crew': 'Crew',
    'DC United': 'DC United',
    'Inter Miami CF': 'Miami',
    'Sporting Kansas City': 'Sporting KC',
    'New York City FC': 'NYCFC',
    'New York Red Bulls': 'Red Bulls',
    'Alabama Crimson Tide': 'Crimson Tide',
    'Notre Dame Fighting Irish': 'Fighting Irish',
    'North Carolina Tar Heels': 'Tar Heels',
    'Duke Blue Devils': 'Blue Devils',
    'Penn State Nittany Lions': 'Nittany Lions',
    'Manchester City': 'Man City',
    'Manchester United': 'Man United',
    'Tottenham Hotspur': 'Spurs',
    'Real Madrid': 'Real Madrid',
    'FC Barcelona': 'Barcelona',
    'Atletico Madrid': 'Atlético',
    'Inter Milan': 'Inter',
    'AC Milan': 'Milan',
    'Bayern Munich': 'Bayern',
    'Borussia Dortmund': 'Dortmund',
    'Bayer Leverkusen': 'Leverkusen',
    'Paris Saint-Germain': 'PSG'
  }
  if (special[fullName]) return special[fullName]
  const parts = String(fullName || '').trim().split(/\s+/)
  if (!parts.length || !parts[0]) return ''
  if (parts.length === 1) return parts[0]
  return parts[parts.length - 1]
}

