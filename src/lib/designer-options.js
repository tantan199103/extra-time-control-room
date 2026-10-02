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
