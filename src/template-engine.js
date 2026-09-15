export const cityPresets = [
  { id:'saigon-vn', city:'SAIGON', region:'VN', code:'028', lat:'10.8231° N', lng:'106.6297° E', primary:'#F4D447', secondary:'#D64232', icons:['river','star','skyline'], signature:'Raised in Saigon' },
  { id:'miami-fl', city:'MIAMI', region:'FL', code:'305', lat:'25.7617° N', lng:'80.1918° W', primary:'#FF6534', secondary:'#20D9D8', icons:['palm','ocean','heron'], signature:'Raised in Miami' },
  { id:'chicago-il', city:'CHICAGO', region:'IL', code:'312', lat:'41.8781° N', lng:'87.6298° W', primary:'#62A8E5', secondary:'#D22630', icons:['stars','rail','lake'], signature:'Built by Chicago' },
  { id:'new-york-ny', city:'NEW YORK', region:'NY', code:'212', lat:'40.7128° N', lng:'74.0060° W', primary:'#F58426', secondary:'#006BB6', icons:['grid','bridge','skyline'], signature:'Made in New York' },
  { id:'london-uk', city:'LONDON', region:'UK', code:'020', lat:'51.5072° N', lng:'0.1276° W', primary:'#D22730', secondary:'#E7E6DE', icons:['river','crown','underground'], signature:'From London with noise' }
]

const baseLayers = [
  { id:'base', label:'Garment base', type:'base', locked:true, order:10 },
  { id:'pattern', label:'Story pattern', type:'pattern', locked:true, order:20 },
  { id:'personalization', label:'Personalization', type:'slots', locked:false, order:30 },
  { id:'crest', label:'Fixed identity', type:'crest', locked:true, order:40 },
  { id:'print-texture', label:'Print texture', type:'texture', locked:true, order:50 },
  { id:'fabric-shadow', label:'Fabric shading', type:'shadow', locked:true, order:60 },
  { id:'highlight', label:'Garment highlight', type:'highlight', locked:true, order:70 }
]

const slots = {
  backName: { id:'C01', label:'Your name', key:'name', type:'text', view:'back', x:.5, y:.235, width:.54, height:.07, maxChars:14, minFont:46, maxFont:82, autoFit:true, required:true, group:'identity', placeholder:'TAN' },
  backNumber: { id:'C02', label:'Your number', key:'number', type:'number', view:'back', x:.5, y:.51, width:.48, height:.34, maxChars:2, min:0, max:99, required:true, group:'identity', placeholder:'23' },
  frontNumber: { id:'C03', label:'Front number', key:'number', type:'derived', view:'front', x:.5, y:.43, width:.2, height:.15, maxChars:2, group:'identity' },
  crest: { id:'C04', label:'Crest initials', key:'crest', type:'text', view:'front', x:.35, y:.27, width:.12, height:.07, maxChars:2, group:'identity', placeholder:'TT' },
  milestone1: { id:'C05', label:'Milestone one', key:'milestone1', type:'text', view:'front', x:.19, y:.58, width:.22, height:.045, maxChars:20, group:'journey', placeholder:'2021 CHAMPION' },
  milestone2: { id:'C06', label:'Milestone two', key:'milestone2', type:'text', view:'front', x:.19, y:.63, width:.22, height:.045, maxChars:20, group:'journey', placeholder:'2023 MVP' },
  milestone3: { id:'C07', label:'Milestone three', key:'milestone3', type:'text', view:'front', x:.19, y:.68, width:.22, height:.045, maxChars:20, group:'journey', placeholder:'2024 CAPTAIN' },
  motto: { id:'C08', label:'Your mindset', key:'motto', type:'select', view:'back', x:.5, y:.84, width:.42, height:.045, maxChars:18, group:'mindset', options:['RELENTLESS','NEVER FOLD','FEARLESS','NO EXCUSES','UNBROKEN','BUILT DIFFERENT'] },
  city: { id:'C09', label:'Your city', key:'cityId', type:'city', view:'back', x:.5, y:.765, width:.4, height:.055, group:'roots', required:true },
  cityCode: { id:'C10', label:'City code', key:'cityCode', type:'auto', view:'front', x:.65, y:.27, width:.12, height:.07, group:'roots' },
  coordinates: { id:'C11', label:'Coordinates', key:'coordinates', type:'auto', view:'back', x:.5, y:.805, width:.45, height:.03, group:'roots' },
  accent: { id:'C12', label:'Accent colour', key:'paletteId', type:'swatch', group:'colors' },
  secondary: { id:'C13', label:'Metal accent', key:'metal', type:'swatch', group:'colors' },
  year: { id:'C14', label:'Your year', key:'year', type:'year', view:'front', x:.5, y:.78, width:.18, height:.045, maxChars:4, group:'roots', placeholder:'1992' },
  neckIcon: { id:'C15', label:'Neck symbol', key:'neckIcon', type:'select', view:'back', x:.5, y:.15, width:.08, height:.05, group:'identity', options:['SNAKE','PALM','CROWN','STAR'] },
  championshipYears: { id:'C16', label:'Championship years', key:'championshipYears', type:'text', view:'front', x:.5, y:.68, width:.42, height:.045, maxChars:22, group:'journey', placeholder:'2018 / 2021 / 2024' },
  optionalPhoto: { id:'C17', label:'Optional photo', key:'photoUrl', type:'photo', view:'front', x:.73, y:.42, width:.12, height:.12, group:'identity' }
}

export const storyTemplates = [
  {
    id:'venom-v1', version:'1.2.0', name:'VENOM', strapline:'Pressure becomes identity.', status:'LIVE', artworkLock:74,
    base:'#101012', accent:'#8B5CF6', secondary:'#C2A46D', pattern:'venom', signature:'VENOM / STRIKE AFTER DARK',
    palettes:[
      { id:'purple', label:'Venom Purple', primary:'#8B5CF6', secondary:'#C2A46D' },
      { id:'red', label:'Signal Red', primary:'#D43C32', secondary:'#B7B0A3' },
      { id:'blue', label:'Electric Blue', primary:'#277DFF', secondary:'#D1D1CB' },
      { id:'toxic', label:'Toxic Green', primary:'#B6EE35', secondary:'#77776F' }
    ],
    fields:['backName','backNumber','motto','accent','secondary','optionalPhoto'],
    defaults:{ name:'TAN', number:'23', motto:'RELENTLESS', paletteId:'purple', metal:'gold', cityId:'saigon-vn', year:'2026', crest:'V', neckIcon:'SNAKE' },
    layers:baseLayers,
    slots:{ backName:slots.backName, backNumber:slots.backNumber, frontNumber:slots.frontNumber, motto:slots.motto, optionalPhoto:slots.optionalPhoto }
  },
  {
    id:'hometown-v1', version:'1.0.0', name:'HOMETOWN HERO', strapline:'Your city already knows the rest.', status:'LIVE', artworkLock:70,
    base:'#151515', accent:'#FF6534', secondary:'#20D9D8', pattern:'city', signature:'RAISED HERE / REMEMBERED EVERYWHERE',
    palettes:[], fields:['backName','backNumber','city','year','optionalPhoto'],
    defaults:{ name:'TAN', number:'23', cityId:'miami-fl', year:'1992', motto:'RAISED HERE', crest:'TT', neckIcon:'PALM' },
    layers:baseLayers,
    slots:{ backName:slots.backName, backNumber:slots.backNumber, frontNumber:slots.frontNumber, city:slots.city, cityCode:slots.cityCode, coordinates:slots.coordinates, year:slots.year, optionalPhoto:slots.optionalPhoto }
  },
  {
    id:'legacy-v1', version:'1.1.0', name:'MY LEGACY', strapline:'A career written into the garment.', status:'LIVE', artworkLock:68,
    base:'#EEECE2', accent:'#111111', secondary:'#B58A42', pattern:'legacy', signature:'THE YEARS MADE VISIBLE',
    palettes:[
      { id:'chalk', label:'Chalk / Gold', primary:'#111111', secondary:'#B58A42' },
      { id:'oxblood', label:'Oxblood / Chalk', primary:'#711E25', secondary:'#EEECE2' },
      { id:'night', label:'Night / Floodlight', primary:'#F8F04A', secondary:'#A8A8A1' }
    ],
    fields:['backName','backNumber','city','year','milestone1','milestone2','milestone3','motto','accent','optionalPhoto'],
    defaults:{ name:'TAN', number:'23', cityId:'saigon-vn', year:'1992', milestone1:'2021 CHAMPION', milestone2:'2023 MVP', milestone3:'2024 CAPTAIN', motto:'NEVER FOLD', paletteId:'chalk', crest:'TT', neckIcon:'STAR' },
    layers:baseLayers,
    slots:{ backName:slots.backName, backNumber:slots.backNumber, frontNumber:slots.frontNumber, city:slots.city, cityCode:slots.cityCode, coordinates:slots.coordinates, year:slots.year, milestone1:slots.milestone1, milestone2:slots.milestone2, milestone3:slots.milestone3, motto:slots.motto, optionalPhoto:slots.optionalPhoto }
  },
  {
    id:'underdog-v1', version:'1.0.0', name:'UNDERDOG', strapline:'Nothing given. Everything carried.', status:'DRAFT', artworkLock:76,
    base:'#252522', accent:'#F8F04A', secondary:'#E9E7DF', pattern:'stripes', signature:'BUILT WITHOUT PERMISSION',
    palettes:[{ id:'floodlight', label:'Floodlight', primary:'#F8F04A', secondary:'#E9E7DF' },{ id:'orange', label:'Training Orange', primary:'#F45B27', secondary:'#E9E7DF' }],
    fields:['backName','backNumber','year','motto','accent','optionalPhoto'],
    defaults:{ name:'TAN', number:'23', cityId:'saigon-vn', year:'2026', motto:'NO EXCUSES', paletteId:'floodlight', crest:'U', neckIcon:'STAR' },
    layers:baseLayers,
    slots:{ backName:slots.backName, backNumber:slots.backNumber, frontNumber:slots.frontNumber, year:slots.year, motto:slots.motto, optionalPhoto:slots.optionalPhoto }
  },
  {
    id:'king-v1', version:'1.0.0', name:'THE KING', strapline:'Earn the mark. Keep the years.', status:'DRAFT', artworkLock:72,
    base:'#15120D', accent:'#D7B65C', secondary:'#F1EADB', pattern:'crown', signature:'RULE THE EXTRA MINUTES',
    palettes:[{ id:'gold', label:'Antique Gold', primary:'#D7B65C', secondary:'#F1EADB' },{ id:'silver', label:'Silver', primary:'#BFC2C4', secondary:'#F1EADB' }],
    fields:['backName','backNumber','crest','championshipYears','accent','optionalPhoto'],
    defaults:{ name:'TAN', number:'10', crest:'TT', championshipYears:'2018 / 2021 / 2024', paletteId:'gold', cityId:'saigon-vn', year:'2026', motto:'THE KING', neckIcon:'CROWN' },
    layers:baseLayers,
    slots:{ backName:slots.backName, backNumber:slots.backNumber, frontNumber:slots.frontNumber, crest:slots.crest, championshipYears:slots.championshipYears, optionalPhoto:slots.optionalPhoto }
  }
]

export const fieldGroups = [
  { id:'identity', title:'Your identity', copy:'The marks people remember first.' },
  { id:'roots', title:'Your roots', copy:'Choose the source; the engine fills the known details.' },
  { id:'journey', title:'Your journey', copy:'Small milestones, held inside the fixed composition.' },
  { id:'mindset', title:'Your mindset', copy:'A short line, never a paragraph.' },
  { id:'colors', title:'Your colours', copy:'Curated combinations only.' }
]

const escapeXml = value => String(value ?? '').replace(/[<>&"']/g, character => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[character]))
const cleanText = (value, maxChars = 40) => String(value ?? '').toUpperCase().replace(/[^A-ZÀ-Ỹ0-9 &/.'-]/g, '').slice(0, maxChars)
const cleanNumber = value => String(value ?? '').replace(/\D/g, '').slice(0, 2)
const cleanPhoto = value => {
  const photo = String(value || '')
  if (photo.length > 2500000) return ''
  return /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(photo) ? photo : ''
}

export function getTemplate(templateId) {
  return storyTemplates.find(template => template.id === templateId) || storyTemplates[0]
}

export function getCity(cityId) {
  return cityPresets.find(city => city.id === cityId) || cityPresets[0]
}

export function resolveCustomization(templateInput, input = {}) {
  const template = typeof templateInput === 'string' ? getTemplate(templateInput) : templateInput
  const values = { ...template.defaults, ...input }
  const city = getCity(values.cityId)
  const palette = template.palettes.find(item => item.id === values.paletteId)
  const primary = template.id === 'hometown-v1' ? city.primary : palette?.primary || template.accent
  const secondary = template.id === 'hometown-v1' ? city.secondary : palette?.secondary || template.secondary
  const name = cleanText(values.name || 'YOUR NAME', slots.backName.maxChars)
  const number = cleanNumber(values.number || '00')
  return {
    ...values,
    name,
    number,
    photoUrl:cleanPhoto(values.photoUrl),
    crest:cleanText(values.crest || name.split(' ').map(part => part[0]).join('').slice(0,2), 2),
    year:String(values.year || '').replace(/\D/g,'').slice(0,4),
    motto:cleanText(values.motto, 18),
    milestone1:cleanText(values.milestone1, 20), milestone2:cleanText(values.milestone2, 20), milestone3:cleanText(values.milestone3, 20),
    championshipYears:cleanText(values.championshipYears, 22),
    city:city.city, cityCode:city.code, coordinates:`${city.lat} / ${city.lng}`, citySignature:city.signature, cityIcons:city.icons,
    primary, secondary
  }
}

export function validateCustomization(templateInput, values) {
  const template = typeof templateInput === 'string' ? getTemplate(templateInput) : templateInput
  const errors = {}
  for (const fieldId of template.fields) {
    const field = slots[fieldId]
    if (!field || ['swatch','select','city'].includes(field.type)) continue
    const value = values[field.key]
    if (field.required && !String(value || '').trim()) errors[field.key] = `${field.label} is required.`
    if (field.maxChars && String(value || '').length > field.maxChars) errors[field.key] = `Maximum ${field.maxChars} characters.`
  }
  if (values.number && (Number(values.number) < 0 || Number(values.number) > 99)) errors.number = 'Use a number from 00 to 99.'
  return errors
}

export function fitTextSize(value, slot, scale = 1) {
  const text = String(value || '')
  const weightedLength = [...text].reduce((sum, char) => sum + ('MW@%'.includes(char) ? 1.2 : 'I1 '.includes(char) ? .55 : .88), 0)
  const max = slot.maxFont || 74
  const min = slot.minFont || 32
  const target = (slot.width * 1000) / Math.max(weightedLength * .6, 1)
  return Math.max(min, Math.min(max, target)) * scale
}

const shirtPath = 'M355 120 220 178 62 328l112 151 86-54v626h480V425l86 54 112-151-158-150-135-58c-38 64-94 86-145 86s-107-22-145-86Z'

function patternMarkup(template, primary, secondary) {
  if (template.pattern === 'venom') return `<path d="M120 320C280 225 295 410 450 310S690 230 855 335M95 560c180-120 280 85 440-30s250-40 345 45M130 790c145-80 245 80 395-20s240-10 325 70" fill="none" stroke="${primary}" stroke-width="18" opacity=".18"/><path d="M210 235 790 970M165 400 700 1040" stroke="${secondary}" stroke-width="3" opacity=".2"/>`
  if (template.pattern === 'city') return `<path d="M150 870h700M190 810V590h70v220h46V500h82v310h44V650h65v160h52V540h96v270h45V620h74v190" fill="none" stroke="${secondary}" stroke-width="10" opacity=".22"/><path d="M160 355h680M160 395h680" stroke="${primary}" stroke-width="5" opacity=".3"/>`
  if (template.pattern === 'legacy') return `<path d="M150 335h700M150 455h700M150 575h700M150 695h700M150 815h700" stroke="${primary}" stroke-width="2" opacity=".18"/><circle cx="500" cy="590" r="280" fill="none" stroke="${secondary}" stroke-width="4" opacity=".2"/>`
  if (template.pattern === 'stripes') return `<path d="M130 1020 415 185M315 1040 585 180M505 1045 755 220" stroke="${primary}" stroke-width="44" opacity=".13"/>`
  return `<path d="m500 250 42 90 98 12-71 68 18 98-87-47-87 47 18-98-71-68 98-12Z" fill="none" stroke="${primary}" stroke-width="8" opacity=".18"/><path d="M180 790 500 280 820 790" fill="none" stroke="${secondary}" stroke-width="5" opacity=".16"/>`
}

function textAt(slot, value, options = {}) {
  if (!value) return ''
  const x = slot.x * 1000
  const y = slot.y * 1200
  const size = options.size || fitTextSize(value, slot, options.scale || 1)
  const fill = options.fill || '#F4F3EE'
  const stroke = options.stroke || 'none'
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="${fill}" stroke="${stroke}" stroke-width="${options.strokeWidth || 0}" paint-order="stroke" font-family="'Arial Narrow','Roboto Condensed',sans-serif" font-weight="${options.weight || 800}" font-size="${size}" letter-spacing="${options.spacing ?? 3}">${escapeXml(value)}</text>`
}

function guidesMarkup(template, view) {
  return Object.values(template.slots).filter(slot => slot.view === view).map(slot => `<g opacity=".75"><rect x="${(slot.x-slot.width/2)*1000}" y="${(slot.y-slot.height/2)*1200}" width="${slot.width*1000}" height="${slot.height*1200}" fill="none" stroke="#F8F04A" stroke-width="2" stroke-dasharray="10 8"/><text x="${(slot.x-slot.width/2)*1000+8}" y="${(slot.y-slot.height/2)*1200+18}" fill="#F8F04A" font-family="Arial" font-size="12">${slot.id}</text></g>`).join('')
}

export function renderTemplateSvg(templateInput, input = {}, view = 'back', options = {}) {
  const template = typeof templateInput === 'string' ? getTemplate(templateInput) : templateInput
  const data = resolveCustomization(template, input)
  const width = options.width || 1000
  const height = options.height || 1200
  const numberScale = data.number.length === 1 ? 1.08 : 1
  const photoMarkup = view === 'front' && data.photoUrl && template.slots.optionalPhoto
    ? `<g><image href="${escapeXml(data.photoUrl)}" x="660" y="420" width="120" height="120" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo-frame)"/><rect x="660" y="420" width="120" height="120" rx="10" fill="none" stroke="${data.primary}" stroke-width="5"/><path d="M660 460h120M700 420v120" stroke="#fff" stroke-width="2" opacity=".16"/></g>`
    : ''
  const custom = view === 'back'
    ? `${textAt(slots.backName,data.name,{fill:'#F4F3EE'})}${textAt(slots.backNumber,data.number,{size:330*numberScale,fill:'#F4F3EE',stroke:data.primary,strokeWidth:10,spacing:-12})}${template.slots.city ? textAt(slots.city,data.city,{size:46,fill:data.secondary,spacing:5}) : ''}${template.slots.coordinates ? textAt(slots.coordinates,data.coordinates,{size:19,fill:'#B7B6AF',spacing:2}) : ''}${template.slots.motto ? textAt(slots.motto,data.motto,{size:28,fill:data.primary,spacing:4}) : ''}`
    : `${photoMarkup}${textAt(slots.frontNumber,data.number,{size:130*numberScale,fill:'#F4F3EE',stroke:data.primary,strokeWidth:6,spacing:-4})}${textAt({x:.5,y:.22,width:.45,minFont:25,maxFont:34},template.name,{fill:data.primary,spacing:5})}${template.slots.crest ? `<g><path d="M300 275h105v105H300z" fill="none" stroke="${data.secondary}" stroke-width="5"/>${textAt(slots.crest,data.crest,{size:43,fill:data.secondary})}</g>` : ''}${template.slots.cityCode ? textAt(slots.cityCode,data.cityCode,{size:48,fill:data.secondary}) : ''}${template.slots.year ? textAt(slots.year,data.year,{size:34,fill:data.primary,spacing:5}) : ''}${template.slots.championshipYears ? textAt(slots.championshipYears,data.championshipYears,{size:25,fill:data.secondary,spacing:3}) : ''}${['milestone1','milestone2','milestone3'].filter(key => template.slots[key]).map(key => textAt(slots[key],data[key],{size:20,fill:'#F4F3EE',spacing:1})).join('')}`
  const surface = template.base === '#EEECE2' ? '#171715' : '#F4F3EE'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 1200" role="img" aria-label="${escapeXml(template.name)} ${view} jersey for ${escapeXml(data.name)} ${escapeXml(data.number)}">
  <defs><clipPath id="shirt"><path d="${shirtPath}"/></clipPath><clipPath id="photo-frame"><rect x="660" y="420" width="120" height="120" rx="10"/></clipPath><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient><pattern id="grain" width="13" height="13" patternUnits="userSpaceOnUse"><path d="M0 2h13M2 0v13" stroke="#fff" stroke-width=".7" opacity=".1"/></pattern></defs>
  <rect width="1000" height="1200" fill="#DCDAD2"/>
  <g clip-path="url(#shirt)"><rect width="1000" height="1200" fill="${template.base}"/><g>${patternMarkup(template,data.primary,data.secondary)}</g><g>${custom}</g><path d="M355 120c35 69 91 101 145 101s110-32 145-101" fill="none" stroke="${surface}" stroke-width="25"/><path d="M645 127c62 230 47 570 95 924" fill="none" stroke="${data.primary}" stroke-width="11"/><text x="500" y="1050" text-anchor="middle" fill="${data.secondary}" font-family="Arial" font-weight="700" font-size="17" letter-spacing="5">${escapeXml(template.signature)}</text><rect width="1000" height="1200" fill="url(#grain)"/><rect width="1000" height="1200" fill="url(#shade)"/></g>
  <path d="${shirtPath}" fill="none" stroke="${surface}" stroke-width="6"/><path d="M62 328l112 151m764-151L826 479M260 425v626m480-626v626" fill="none" stroke="${surface}" stroke-width="5" opacity=".72"/>
  <g transform="translate(788 310)"><circle r="49" fill="${surface}"/><text y="10" text-anchor="middle" fill="${template.base}" font-family="Arial" font-weight="800" font-size="34">90+</text></g>
  ${options.showGuides ? guidesMarkup(template,view) : ''}</svg>`
}

export function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function buildCustomizationPayload(templateInput, input) {
  const template = typeof templateInput === 'string' ? getTemplate(templateInput) : templateInput
  const resolved = resolveCustomization(template, input)
  return {
    schemaVersion:'1.0', templateId:template.id, templateVersion:template.version,
    values:Object.fromEntries(template.fields.map(fieldId => { const field = slots[fieldId]; return [field.key,resolved[field.key]] })),
    derived:{ city:resolved.city, cityCode:resolved.cityCode, coordinates:resolved.coordinates, primary:resolved.primary, secondary:resolved.secondary },
    render:{ views:['front','back'], width:3000, height:3600, format:'png' }
  }
}

export { slots as universalSlots }
