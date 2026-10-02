// Customer-facing options for the 3D designer. These are Jersevo-owned
// swatches and procedural pattern recipes inspired by the way Owayo groups
// palettes and the way Boombah exposes fill-pattern choices. No supplier
// raster, logo, or proprietary pattern artwork is copied into this library.

export const DESIGNER_COLOR_GROUPS = Object.freeze([
  {
    key:'neutrals',
    label:'Neutrals',
    colors:[
      ['Ink','#111311'], ['White','#F8F8F4'], ['Carbon','#20252A'], ['Graphite','#555B66'],
      ['Steel','#8F99A3'], ['Cool grey','#B7BAC2'], ['Warm grey','#D2CDC4'], ['Sand','#E8D7B4']
    ]
  },
  {
    key:'red',
    label:'Reds',
    colors:[
      ['Cardinal','#A6192E'], ['Scarlet','#EF3340'], ['Crimson','#C1121F'], ['Burgundy','#6E1423'],
      ['Berry','#A50F5E'], ['Magenta','#D946EF'], ['Coral','#FF6B6B'], ['Wine','#7F1D1D']
    ]
  },
  {
    key:'orange-yellow',
    label:'Orange + yellow',
    colors:[
      ['Safety orange','#F97316'], ['Texas orange','#D56A24'], ['Gold','#F3C623'], ['Vegas gold','#C7A24A'],
      ['Yellow','#F6D32D'], ['Acid yellow','#F3ED45'], ['Fluorescent yellow','#DDF20C'], ['Coral orange','#FF7A59']
    ]
  },
  {
    key:'blue',
    label:'Blues',
    colors:[
      ['Navy','#16324F'], ['Royal','#2876FF'], ['Columbia','#5EA6D7'], ['Ocean','#0E7490'],
      ['Cyan','#00A6A6'], ['Ice','#7DD3FC'], ['Bright blue','#00AEEF'], ['Midnight','#0B1F33']
    ]
  },
  {
    key:'green',
    label:'Greens',
    colors:[
      ['Kelly','#12B981'], ['Emerald','#047857'], ['Forest','#14532D'], ['Lime','#82C91E'],
      ['Olive','#697A21'], ['Jade','#0F766E'], ['Mint','#B9E7C5'], ['Bright green','#16E06F']
    ]
  },
  {
    key:'purple',
    label:'Purple + violet',
    colors:[
      ['Purple','#7C3AED'], ['Violet','#8B5CF6'], ['Plum','#4C1D95'], ['Lavender','#C4B5FD'],
      ['Deep violet','#312E81'], ['Electric purple','#A855F7'], ['Hot pink','#EC4899'], ['Orchid','#C026D3']
    ]
  },
  {
    key:'bright',
    label:'Bright accents',
    colors:[
      ['Bright red','#FF4B4B'], ['Bright pink','#FF4FA3'], ['Bright yellow','#FFF200'], ['Fluorescent orange','#FF6B00'],
      ['Fluorescent coral','#FF5A5F'], ['Fluorescent lime','#C6FF00'], ['Bright cyan','#00E5FF'], ['Bright violet','#B76CFF']
    ]
  }
])

export const DESIGNER_COLOR_PALETTE = Object.freeze(DESIGNER_COLOR_GROUPS.flatMap(group => group.colors.map(([name, hex]) => ({
  id:`${group.key}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  group:group.key,
  groupLabel:group.label,
  name,
  hex
}))))

export const DESIGNER_COLOR_PRESETS = Object.freeze([
  { id:'midnight-acid', label:'Midnight / acid', colors:['#16324F','#F3ED45','#F8F8F4','#111311'] },
  { id:'cardinal-cream', label:'Cardinal / cream', colors:['#A6192E','#F8F8F4','#111311','#C7A24A'] },
  { id:'ocean-coral', label:'Ocean / coral', colors:['#0E7490','#FF6B6B','#F8F8F4','#111311'] },
  { id:'forest-gold', label:'Forest / gold', colors:['#14532D','#C7A24A','#F8F8F4','#111311'] },
  { id:'royal-cyan', label:'Royal / cyan', colors:['#2876FF','#00E5FF','#111311','#F8F8F4'] },
  { id:'plum-lime', label:'Plum / lime', colors:['#4C1D95','#82C91E','#F8F8F4','#111311'] }
])

// Logo-free, Jersevo-owned recipes that echo the construction language of
// American teamwear: pinstripes, rail accents, split color blocks and hockey
// bands. The source artwork is only a color reference; no team marks or
// supplier artwork is embedded in the designer.
export const US_SPORTS_PATTERN_FAMILIES = Object.freeze({
  'classic-pinstripe': Object.freeze({
    id:'classic-pinstripe', label:'Classic pinstripe',
    description:'Fine vertical athletic lines',
    slug:'us-classic-pinstripe', owayoPattern:'vertical-lines-1809', boombahPattern:'pinstripe',
    preview:colors => `repeating-linear-gradient(90deg,${colors[0]} 0 13px,${colors[1] || '#F8F8F4'} 13px 15px,${colors[0]} 15px 21px)`
  }),
  'triple-rail': Object.freeze({
    id:'triple-rail', label:'Triple rail',
    description:'Hero field with twin trim rails',
    slug:'us-triple-rail', owayoPattern:'wide-stripes-681', boombahPattern:'pinstripe',
    preview:colors => `linear-gradient(90deg,${colors[0]} 0 43%,${colors[1] || '#F8F8F4'} 43% 47%,${colors[2] || '#111311'} 47% 53%,${colors[1] || '#F8F8F4'} 53% 57%,${colors[0]} 57%)`
  }),
  'vertical-contrast': Object.freeze({
    id:'vertical-contrast', label:'Vertical contrast',
    description:'Strong side block with a narrow keyline',
    slug:'us-vertical-contrast', owayoPattern:'tall-stripes-680', boombahPattern:'promesh',
    preview:colors => `linear-gradient(90deg,${colors[0]} 0 47%,${colors[1] || '#F8F8F4'} 47% 69%,${colors[2] || '#111311'} 69% 72%,${colors[0]} 72%)`
  }),
  'split-field': Object.freeze({
    id:'split-field', label:'Split field',
    description:'Two-color field with a centered seam',
    slug:'us-split-field', owayoPattern:'diagonal-stripes-682', boombahPattern:'hex',
    preview:colors => `linear-gradient(90deg,${colors[0]} 0 43%,${colors[1] || '#F8F8F4'} 43% 62%,${colors[2] || '#111311'} 62% 67%,${colors[0]} 67%)`
  }),
  'monochrome-stripe': Object.freeze({
    id:'monochrome-stripe', label:'Monochrome stripe',
    description:'Black, white and steel rhythm',
    slug:'us-monochrome-stripe', owayoPattern:'horizontal-lines-1810', boombahPattern:'carbon-fiber',
    preview:colors => `repeating-linear-gradient(90deg,${colors[0]} 0 12px,${colors[1] || '#F8F8F4'} 12px 16px,${colors[2] || '#8F99A3'} 16px 18px)`
  }),
  'hockey-horizontal': Object.freeze({
    id:'hockey-horizontal', label:'Hockey bands',
    description:'Horizontal rink-style bands',
    slug:'us-hockey-horizontal', owayoPattern:'horizontal-lines-1810', boombahPattern:'razorwire',
    preview:colors => `linear-gradient(180deg,${colors[0]} 0 33%,${colors[1] || '#F8F8F4'} 33% 41%,${colors[2] || '#111311'} 41% 48%,${colors[0]} 48% 100%)`
  })
})

export const US_SPORTS_PATTERNS = Object.freeze(Object.values(US_SPORTS_PATTERN_FAMILIES).map(recipe => Object.freeze({
  id:recipe.slug, slug:recipe.slug, recipeId:recipe.id, name:recipe.label,
  description:recipe.description, procedural:true,
  categoryKeys:['us-sports'], categoryNames:['US sports'],
  colors:[{ slot:1, color:'#111311' }, { slot:2, color:'#F8F8F4' }, { slot:3, color:'#8F99A3' }]
})))

export function findUsSportsPattern(slug) {
  return US_SPORTS_PATTERNS.find(pattern => pattern.slug === String(slug || '').toLowerCase()) || null
}

const teamFamily = (id, league, label, colors, patternFamily) => Object.freeze({
  id, league, label, colors:Object.freeze(colors), patternFamily,
  pattern:US_SPORTS_PATTERN_FAMILIES[patternFamily],
  inspired:true
})

// Team names are shown as inspiration labels only. The UI deliberately omits
// logos, wordmarks and official claims so the customer can create a look in
// the same color language without copying protected artwork.
export const US_SPORTS_TEAM_FAMILIES = Object.freeze([
  teamFamily('dallas-cowboys','NFL','Dallas Cowboys',['#041E42','#869397','#FFFFFF','#003594'],'vertical-contrast'),
  teamFamily('kansas-city-chiefs','NFL','Kansas City Chiefs',['#E31837','#FFB81C','#FFFFFF','#111311'],'triple-rail'),
  teamFamily('san-francisco-49ers','NFL','San Francisco 49ers',['#AA0000','#B3995D','#FFFFFF','#111311'],'triple-rail'),
  teamFamily('philadelphia-eagles','NFL','Philadelphia Eagles',['#004C54','#000000','#A5ACAF','#FFFFFF'],'vertical-contrast'),
  teamFamily('buffalo-bills','NFL','Buffalo Bills',['#00338D','#C60C30','#FFFFFF'],'split-field'),
  teamFamily('green-bay-packers','NFL','Green Bay Packers',['#203731','#FFB612','#FFFFFF'],'triple-rail'),
  teamFamily('chicago-bears','NFL','Chicago Bears',['#0B162A','#C83803','#FFFFFF'],'vertical-contrast'),
  teamFamily('new-england-patriots','NFL','New England Patriots',['#002244','#C60C30','#B0B7BC','#FFFFFF'],'triple-rail'),
  teamFamily('pittsburgh-steelers','NFL','Pittsburgh Steelers',['#101820','#FFB612','#FFFFFF'],'vertical-contrast'),
  teamFamily('las-vegas-raiders','NFL','Las Vegas Raiders',['#000000','#A5ACAF','#FFFFFF'],'monochrome-stripe'),
  teamFamily('los-angeles-lakers','NBA','Los Angeles Lakers',['#552583','#FDB927','#FFFFFF','#000000'],'split-field'),
  teamFamily('boston-celtics','NBA','Boston Celtics',['#007A33','#FFFFFF','#BA9653','#004F2D'],'triple-rail'),
  teamFamily('chicago-bulls','NBA','Chicago Bulls',['#CE1141','#000000','#FFFFFF'],'vertical-contrast'),
  teamFamily('golden-state-warriors','NBA','Golden State Warriors',['#1D428A','#FFC72C','#FFFFFF'],'triple-rail'),
  teamFamily('miami-heat','NBA','Miami Heat',['#000000','#98002E','#FFFFFF','#B2B2B2'],'split-field'),
  teamFamily('new-york-knicks','NBA','New York Knicks',['#006BB6','#F58426','#FFFFFF'],'triple-rail'),
  teamFamily('brooklyn-nets','NBA','Brooklyn Nets',['#000000','#FFFFFF','#7A7A7A'],'monochrome-stripe'),
  teamFamily('los-angeles-clippers','NBA','Los Angeles Clippers',['#1D428A','#C8102E','#FFFFFF'],'split-field'),
  teamFamily('phoenix-suns','NBA','Phoenix Suns',['#5F259F','#E56020','#000000','#FFFFFF'],'vertical-contrast'),
  teamFamily('denver-nuggets','NBA','Denver Nuggets',['#0E2240','#FEC524','#8BB8E8','#FFFFFF'],'triple-rail'),
  teamFamily('new-york-yankees','MLB','New York Yankees',['#003087','#FFFFFF','#8C8C8C'],'classic-pinstripe'),
  teamFamily('los-angeles-dodgers','MLB','Los Angeles Dodgers',['#005A9C','#FFFFFF','#EF3E42'],'vertical-contrast'),
  teamFamily('boston-red-sox','MLB','Boston Red Sox',['#0C2340','#BD3039','#FFFFFF'],'triple-rail'),
  teamFamily('chicago-cubs','MLB','Chicago Cubs',['#0E3386','#CC3433','#FFFFFF'],'classic-pinstripe'),
  teamFamily('st-louis-cardinals','MLB','St. Louis Cardinals',['#C41E3A','#0C2340','#FFFFFF'],'vertical-contrast'),
  teamFamily('san-francisco-giants','MLB','San Francisco Giants',['#000000','#FD5A1E','#FFFFFF','#F2E6D0'],'triple-rail'),
  teamFamily('houston-astros','MLB','Houston Astros',['#002D62','#F47638','#FFFFFF'],'vertical-contrast'),
  teamFamily('atlanta-braves','MLB','Atlanta Braves',['#13274F','#CE1141','#FFFFFF'],'triple-rail'),
  teamFamily('philadelphia-phillies','MLB','Philadelphia Phillies',['#E81828','#FFFFFF','#002D72'],'classic-pinstripe'),
  teamFamily('san-diego-padres','MLB','San Diego Padres',['#2F241D','#FFC72C','#FFFFFF','#D2B48C'],'split-field'),
  teamFamily('montreal-canadiens','NHL','Montreal Canadiens',['#AF1E2D','#192168','#FFFFFF'],'hockey-horizontal'),
  teamFamily('toronto-maple-leafs','NHL','Toronto Maple Leafs',['#00205B','#FFFFFF','#4A90C2'],'hockey-horizontal'),
  teamFamily('boston-bruins','NHL','Boston Bruins',['#000000','#FCB514','#FFFFFF'],'hockey-horizontal'),
  teamFamily('chicago-blackhawks','NHL','Chicago Blackhawks',['#CF0A2C','#000000','#FFFFFF'],'hockey-horizontal'),
  teamFamily('detroit-red-wings','NHL','Detroit Red Wings',['#CE1126','#FFFFFF'],'hockey-horizontal'),
  teamFamily('pittsburgh-penguins','NHL','Pittsburgh Penguins',['#000000','#FCB514','#FFFFFF'],'hockey-horizontal'),
  teamFamily('new-york-rangers','NHL','New York Rangers',['#0038A8','#CE1126','#FFFFFF'],'hockey-horizontal'),
  teamFamily('edmonton-oilers','NHL','Edmonton Oilers',['#041E42','#FF4C00','#FFFFFF'],'hockey-horizontal'),
  teamFamily('colorado-avalanche','NHL','Colorado Avalanche',['#6F263D','#236192','#A2AAAD','#FFFFFF'],'hockey-horizontal'),
  teamFamily('vegas-golden-knights','NHL','Vegas Golden Knights',['#000000','#B4975A','#B1B3B3','#FFFFFF'],'hockey-horizontal')
])

export const US_SPORTS_LEAGUES = Object.freeze(['NFL', 'NBA', 'MLB', 'NHL'])

export function findUsSportsTeamFamily(id) {
  const target = String(id || '').toLowerCase()
  return US_SPORTS_TEAM_FAMILIES.find(family => family.id === target) || null
}

export function teamFamilyPreview(family) {
  const item = typeof family === 'string' ? findUsSportsTeamFamily(family) : family
  return item?.pattern?.preview?.(item.colors) || 'linear-gradient(135deg,#111311,#F8F8F4)'
}

export const BOOMBAH_FILL_PATTERNS = Object.freeze([
  { id:'solid', slug:'solid', name:'Solid', category:'Core', description:'Clean color block', preview:'linear-gradient(135deg,#111311 0 48%,#f3ed45 48% 52%,#111311 52%)' },
  { id:'digital-camo', slug:'digital-camo', name:'Digital camo', category:'Tactical', description:'Pixel-block contrast', preview:'linear-gradient(135deg,#111311 0 26%,#697A21 26% 43%,#14532D 43% 61%,#D2CDC4 61% 72%,#111311 72%)' },
  { id:'pinstripe', slug:'pinstripe', name:'Pinstripe', category:'Classic', description:'Fine athletic stripes', preview:'repeating-linear-gradient(110deg,#111311 0 9px,#F8F8F4 9px 11px)' },
  { id:'promesh', slug:'promesh', name:'Pro mesh', category:'Performance', description:'Breathable technical grid', preview:'repeating-linear-gradient(45deg,#16324F 0 5px,#2876FF 5px 7px),repeating-linear-gradient(-45deg,transparent 0 5px,#F8F8F4 5px 7px)' },
  { id:'carbon-fiber', slug:'carbon-fiber', name:'Carbon fiber', category:'Performance', description:'Diagonal woven texture', preview:'repeating-linear-gradient(135deg,#20252A 0 7px,#555B66 7px 10px,#111311 10px 17px)' },
  { id:'hex', slug:'hex', name:'Hex', category:'Geometry', description:'Hexagonal tech cells', preview:'linear-gradient(30deg,#2876FF 12%,transparent 12.5%,transparent 87%,#2876FF 87.5%,#2876FF),linear-gradient(150deg,#2876FF 12%,transparent 12.5%,transparent 87%,#2876FF 87.5%,#2876FF),linear-gradient(30deg,#2876FF 12%,transparent 12.5%,transparent 87%,#2876FF 87.5%,#2876FF),linear-gradient(150deg,#2876FF 12%,transparent 12.5%,transparent 87%,#2876FF 87.5%,#2876FF)', backgroundSize:'18px 31px', backgroundPosition:'0 0,0 0,9px 16px,9px 16px' },
  { id:'razorwire', slug:'razorwire', name:'Razorwire', category:'Motion', description:'Fast diagonal energy', preview:'repeating-linear-gradient(155deg,#A6192E 0 5px,#F8F8F4 5px 8px,#111311 8px 13px)' },
  { id:'scales', slug:'scales', name:'Scales', category:'Texture', description:'Layered curved armor', preview:'radial-gradient(circle at 50% 0,#7DD3FC 0 28%,transparent 30%) 0 0/16px 14px,#16324F' }
])

export function findDesignerColor(hex) {
  const target = String(hex || '').toUpperCase()
  return DESIGNER_COLOR_PALETTE.find(color => color.hex.toUpperCase() === target) || null
}

export function findBoombahPattern(slug) {
  const target = String(slug || '').toLowerCase()
  return BOOMBAH_FILL_PATTERNS.find(pattern => pattern.slug === target || pattern.id === target) || null
}
