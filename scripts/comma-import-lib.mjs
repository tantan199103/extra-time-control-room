import { createHash } from 'node:crypto'
import { seoDescription } from '../src/lib/seo-text.js'
import { stableHash, stableId, slugify } from './fangear-import-lib.mjs'

export const COMMA_SOURCE_HOST = 'commafootball.com'
export const COMMA_SOURCE_CURRENCY = 'AUD'
export const COMMA_IMPORT_STATUS = 'DRAFT'
export const COMMA_VARIANT_STATUS = 'DRAFT'
export const COMMA_PUBLIC_BRAND = 'Jersevo'

const COUNTRY_NAMES = Object.freeze([
  'Argentina', 'Australia', 'Belgium', 'Brazil', 'Colombia', 'Croatia', 'Egypt',
  'England', 'France', 'Germany', 'Ghana', 'Italy', 'Japan', 'Korea', 'Mexico',
  'Morocco', 'Netherlands', 'Nigeria', 'Norway', 'Portugal', 'Scotland',
  'Senegal', 'Spain', 'Switzerland', 'Uruguay'
])

const COUNTRY_BY_KEY = new Map(COUNTRY_NAMES.map(name => [name.toLowerCase(), { name, slug: slugify(name) }]))

const CLUB_RULES = Object.freeze([
  { league:'epl', team:'arsenal', patterns:[/^arsenal$/i, /^afc$/i, /^gunners$/i, /^gooners$/i] },
  { league:'epl', team:'chelsea', patterns:[/^chelsea$/i] },
  { league:'epl', team:'liverpool', patterns:[/^liverpool$/i, /^lfc$/i, /^the reds$/i] },
  { league:'epl', team:'manchester-city', patterns:[/^manchester city$/i] },
  { league:'epl', team:'manchester-united', patterns:[/^manchester united$/i] },
  { league:'epl', team:'tottenham-hotspur', patterns:[/^tottenham$/i, /^spurs$/i] },
  { league:'laliga', team:'fc-barcelona', patterns:[/^(?:fc )?barcelona$/i, /^team-barcelona$/i] },
  { league:'laliga', team:'real-madrid', patterns:[/^real madrid$/i, /^madrid$/i, /^team-madrid$/i] },
  { league:'bundesliga', team:'bayern-munich', patterns:[/^bayern$/i, /^bayern munich$/i] },
  { league:'bundesliga', team:'borussia-dortmund', patterns:[/^dortmund$/i, /^borussia dortmund$/i] },
  { league:'ligue1', team:'paris-saint-germain', patterns:[/^psg$/i, /^paris$/i, /^the parisians$/i] },
  { league:'seriea', team:'inter-milan', patterns:[/^inter$/i, /^inter milan$/i] },
  { league:'seriea', team:'ac-milan', patterns:[/^milan$/i, /^ac milan$/i] }
])

const PLAYER_RULES = Object.freeze([
  { name:'Lionel Messi', slug:'lionel-messi', patterns:[/\blionel\b/i, /\bmessi\b/i, /\bla pulga\b/i] },
  { name:'Cristiano Ronaldo', slug:'cristiano-ronaldo', patterns:[/\bcristiano\b/i, /\bthe siu\b/i] },
  { name:'Ronaldo Nazario', slug:'ronaldo-nazario', patterns:[/\br9\b/i] },
  { name:'Diego Maradona', slug:'diego-maradona', patterns:[/\bdiego\b/i, /\bmaradona\b/i, /\bel pibe de oro\b/i] },
  { name:'Neymar Jr', slug:'neymar-jr', patterns:[/\bneymar(?: jr)?\b/i, /\bthe prince\b/i] },
  { name:'Kylian Mbappe', slug:'kylian-mbappe', patterns:[/\bkylian\b/i, /\bmbappe\b/i] },
  { name:'Mohamed Salah', slug:'mohamed-salah', patterns:[/\bmohamed salah\b/i, /\bmo salah\b/i, /\bsalah\b/i] },
  { name:'Lamine Yamal', slug:'lamine-yamal', patterns:[/\blamine\b/i, /\byamal\b/i] },
  { name:'Luka Modric', slug:'luka-modric', patterns:[/\bmodric\b/i] },
  { name:'Son Heung-min', slug:'son-heung-min', patterns:[/\bson heung-min\b/i, /\bsonny\b/i, /^son$/i] },
  { name:'David Beckham', slug:'david-beckham', patterns:[/\bbeckham\b/i] },
  { name:'Andres Iniesta', slug:'andres-iniesta', patterns:[/\biniesta\b/i] },
  { name:'Cafu', slug:'cafu', patterns:[/\bcafu\b/i] },
  { name:'Paolo Maldini', slug:'paolo-maldini', patterns:[/\bmaldini\b/i] },
  { name:'Thierry Henry', slug:'thierry-henry', patterns:[/\bhenry\b/i] },
  { name:'Erling Haaland', slug:'erling-haaland', patterns:[/\bhaaland\b/i] },
  { name:'Ronaldinho', slug:'ronaldinho', patterns:[/\bronaldinho\b/i] },
  { name:'Zinedine Zidane', slug:'zinedine-zidane', patterns:[/\bzidane\b/i] },
  { name:'Kevin De Bruyne', slug:'kevin-de-bruyne', patterns:[/\bkdb\b/i, /\bde bruyne\b/i] },
  { name:'Eden Hazard', slug:'eden-hazard', patterns:[/\bhazard\b/i] },
  { name:'Karim Benzema', slug:'karim-benzema', patterns:[/\bking karim\b/i, /\bbenzema\b/i] },
  { name:'Pele', slug:'pele', patterns:[/\bpele\b/i, /\bo rei\b/i] }
])

const OPERATIONAL_TAG = /(?:track inventory|end of season|restock|\bdelay\b|sellout risk|\bpriority\b|bfcm|\bbau\b|mto tees|^size\s*-|^\d+$|^may\s+\d+|^\d{2}-\d{2}-\d{4})/i
const SOURCE_REFERENCE = /(?:https?:\/\/)?(?:www\.)?commafootball\.com\b|cdn\.shopify\.com\/s\/files\/1\/0697\/0461\/4204\b/i

function decodeEntity(entity, code, radix) {
  const point = Number.parseInt(code, radix)
  return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
}

export function decodeCommaHtml(value) {
  return String(value || '')
    .replace(/&nbsp;|&#x20;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeEntity(entity, code, 16))
    .replace(/&#([0-9]+);/g, (entity, code) => decodeEntity(entity, code, 10))
}

function stripSourceLanguage(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/\bMaradona®?\s*x\s*Comma\b/gi, 'Maradona collection')
    .replace(/\bComma(?:\s+Football|\s+XI)?\b/gi, ' ')
    .replace(/\bofficially?\s+licensed(?:\s+product|\s+collection)?\b/gi, ' ')
}

export function sanitizeCommaPublicText(value) {
  return decodeCommaHtml(stripSourceLanguage(value))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<meta\b[^>]*>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function commaHtmlToBlocks(value, productName = '') {
  const html = decodeCommaHtml(stripSourceLanguage(value))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  const blocks = []
  const matcher = /<(h[2-4]|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let match
  while ((match = matcher.exec(html))) {
    const content = sanitizeCommaPublicText(match[2]).replace(/^[-*•]+\s*/, '')
    if (!content || blocks.at(-1)?.content === content) continue
    const element = match[1].toLowerCase()
    const type = element.startsWith('h') ? 'heading' : element === 'blockquote' ? 'quote' : 'paragraph'
    blocks.push({
      id: stableId('block', `comma:${productName}:${blocks.length}:${content}`, 16),
      type,
      content: element === 'li' ? `• ${content}` : content,
      mediaId: ''
    })
  }
  if (!blocks.length) {
    const text = sanitizeCommaPublicText(value)
    text.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean).slice(0, 40).forEach((content, index) => {
      blocks.push({ id:stableId('block', `comma:${productName}:${index}:${content}`, 16), type:'paragraph', content, mediaId:'' })
    })
  }
  return blocks.slice(0, 100)
}

function sourceTags(product = {}) {
  return Array.isArray(product.tags) ? product.tags.map(value => String(value || '').trim()).filter(Boolean) : []
}

function searchableParts(product = {}) {
  const tags = sourceTags(product)
  return {
    title:String(product.title || ''),
    tags,
    values:[String(product.title || ''), ...tags]
  }
}

function firstMatchingCountry(product) {
  const { title, tags } = searchableParts(product)
  const titleLower = title.toLowerCase()
  const titleMatch = [...COUNTRY_BY_KEY.entries()].find(([key]) => new RegExp(`\\b${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(titleLower))
  if (titleMatch) return titleMatch[1]
  for (const tag of tags) {
    const country = COUNTRY_BY_KEY.get(tag.toLowerCase())
    if (country) return country
  }
  return null
}

function firstMatchingClub(product) {
  const { title, tags } = searchableParts(product)
  const ordered = [title, ...tags]
  return CLUB_RULES.find(rule => ordered.some(value => rule.patterns.some(pattern => pattern.test(value)))) || null
}

function firstMatchingPlayer(product) {
  const { title, tags } = searchableParts(product)
  const ordered = [title, ...tags]
  // Resolve the two Ronaldos before the broader source tag "Ronaldo".
  const hasCristiano = /\bcristiano\b|\bthe siu\b/i.test(ordered.join(' '))
  const hasR9 = /\br9\b/i.test(ordered.join(' '))
  if (hasCristiano) return PLAYER_RULES.find(player => player.slug === 'cristiano-ronaldo')
  if (hasR9) return PLAYER_RULES.find(player => player.slug === 'ronaldo-nazario')
  if (/\bronaldo\b/i.test(ordered.join(' '))) {
    const country = firstMatchingCountry(product)?.slug
    if (country === 'portugal') return PLAYER_RULES.find(player => player.slug === 'cristiano-ronaldo')
    if (country === 'brazil') return PLAYER_RULES.find(player => player.slug === 'ronaldo-nazario')
  }
  return PLAYER_RULES.find(player => ordered.some(value => player.patterns.some(pattern => pattern.test(value)))) || null
}

function competitionFor(product) {
  const text = searchableParts(product).values.join(' ')
  if (/\b(?:2026\s*)?world cup\b|\b2026wc\b/i.test(text)) return 'world-cup'
  if (/\b(?:ucl|champions league)\b/i.test(text)) return 'uefa-champions-league'
  if (/\bpremier league\b|\bepl\b/i.test(text)) return 'premier-league'
  if (/\bla liga\b/i.test(text)) return 'la-liga'
  if (/\bbundesliga\b/i.test(text)) return 'bundesliga'
  if (/\bligue 1\b/i.test(text)) return 'ligue-1'
  return ''
}

function fitFor(product) {
  const tag = sourceTags(product).find(value => /^size\s*-\s*/i.test(value)) || ''
  const value = tag.replace(/^size\s*-\s*/i, '').trim()
  if (/athletic fit/i.test(value)) return 'athletic'
  if (/regular fit/i.test(value)) return 'regular'
  if (/baggy fit/i.test(value)) return 'baggy'
  if (/oversized fit/i.test(value)) return 'oversized'
  if (/longsleeve polo/i.test(value)) return 'long-sleeve-polo'
  if (/t-shirt/i.test(value)) return 't-shirt'
  return value ? slugify(value, '') : ''
}

function isPreOrder(product) {
  return sourceTags(product).some(tag => /pre[- ]?order/i.test(tag))
    || /\bpre[- ]?order\b/i.test(sanitizeCommaPublicText(product.body_html || ''))
}

function yearFor(product) {
  return searchableParts(product).values.join(' ').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || ''
}

export function inferCommaTaxonomy(product = {}) {
  const productType = String(product.product_type || '').trim().toLowerCase()
  const productGroup = productType === 'jersey' ? 'Soccer Jersey' : 'Fan Apparel'
  const category = productType === 'jersey' ? 'Soccer Jerseys' : 'Fan Apparel'
  const nationalTeam = firstMatchingCountry(product)
  const club = firstMatchingClub(product)
  const player = firstMatchingPlayer(product)
  const competition = competitionFor(product)
  const fit = fitFor(product)
  const tags = sourceTags(product)
  const theme = tags.some(tag => /\blegends?\b/i.test(tag)) ? 'football-legends' : ''
  const lifecycle = isPreOrder(product) ? 'pre-order' : 'ready-to-ship'
  const fallbackLeague = competition === 'premier-league' ? 'epl'
    : competition === 'la-liga' ? 'laliga'
      : competition === 'bundesliga' ? 'bundesliga'
        : competition === 'ligue-1' ? 'ligue1'
          : ''
  return {
    productGroup,
    taxonomy: {
      category,
      productGroup,
      sport:'soccer',
      ...(club?.league || fallbackLeague ? { league:club?.league || fallbackLeague } : {}),
      ...(club?.team ? { team:club.team } : {}),
      ...(nationalTeam ? { nationalTeam:nationalTeam.slug, country:nationalTeam.name } : {}),
      ...(player ? { player:player.slug, playerName:player.name } : {}),
      ...(competition ? { competition } : {}),
      ...(fit ? { fit } : {}),
      ...(theme ? { theme } : {}),
      ...(yearFor(product) ? { year:yearFor(product) } : {}),
      lifecycle
    }
  }
}

function cleanPublicTag(value) {
  const original = String(value || '').trim()
  if (!original || OPERATIONAL_TAG.test(original)) return ''
  const cleaned = sanitizeCommaPublicText(original)
  const tag = slugify(cleaned, '')
  if (!tag || /(?:comma-football|comma-xi|track-inventory|sellout-risk)/.test(tag)) return ''
  return tag
}

function normalizeOptionName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

export function normalizeCommaSize(value) {
  const size = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  const aliases = new Map([
    ['XXS', '2XS'], ['2X-SMALL', '2XS'], ['X-SMALL', 'XS'], ['SMALL', 'S'],
    ['MEDIUM', 'M'], ['LARGE', 'L'], ['X-LARGE', 'XL'], ['XXL', '2XL'],
    ['XXXL', '3XL'], ['2X-LARGE', '2XL'], ['3X-LARGE', '3XL']
  ])
  return aliases.get(size) || size
}

function normalizeOptionValue(optionName, value) {
  return /^size$/i.test(optionName) ? normalizeCommaSize(value) : sanitizeCommaPublicText(value)
}

function stableSku(seed, usedSkus) {
  const base = `ET-${stableHash(seed, 12).toUpperCase()}`
  let sku = base
  let suffix = 2
  while (usedSkus.has(sku)) sku = `${base}-${suffix++}`
  usedSkus.add(sku)
  return sku
}

export function parseAudMoney(value) {
  if (value === '' || value == null) return null
  const numeric = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : null
}

export function convertCommaPrice(value, { mode = 'ZERO', usdRate = 0 } = {}) {
  const aud = parseAudMoney(value)
  if (aud == null) return 0
  const normalizedMode = String(mode || 'ZERO').toUpperCase()
  if (normalizedMode === 'AUD_AS_USD') return aud
  if (normalizedMode === 'AUD_TO_USD') {
    const rate = Number(usdRate)
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('AUD_TO_USD pricing requires a positive USD rate.')
    return Number((aud * rate).toFixed(2))
  }
  return 0
}

function mediaRole(sourceUrl, index) {
  let filename = ''
  try { filename = decodeURIComponent(new URL(sourceUrl).pathname.split('/').at(-1) || '') } catch { filename = String(sourceUrl || '') }
  const value = filename.replace(/[_-]+/g, ' ')
  if (/full\s*front|front\s*full|\bfront\b/i.test(value)) return 'front'
  if (/full\s*back|back\s*full|\brear\b|\bback\b/i.test(value)) return 'back'
  if (/right\s*sleeve/i.test(value)) return 'right-sleeve'
  if (/left\s*sleeve/i.test(value)) return 'left-sleeve'
  if (/logo|crest|badge/i.test(value)) return 'crest-detail'
  if (/signature|tag/i.test(value)) return 'detail'
  return index === 0 ? 'front' : index === 1 ? 'back' : 'detail'
}

function mediaAlt(title, role, index) {
  const labels = {
    front:'front view', back:'back view', 'right-sleeve':'right sleeve detail',
    'left-sleeve':'left sleeve detail', 'crest-detail':'crest detail', detail:`detail view ${index + 1}`
  }
  return `${title} ${labels[role] || `view ${index + 1}`}`
}

function publicCommaTitle(sourceTitle) {
  const clean = sanitizeCommaPublicText(sourceTitle) || 'Football Jersey'
  return `${COMMA_PUBLIC_BRAND} Custom Personalized ${clean}`.replace(/\s+/g, ' ').trim()
}

function commaSeoTitle(title, classification) {
  const keyword = classification.productGroup === 'Soccer Jersey' ? 'Soccer Jersey' : 'Fan Apparel'
  const preferred = `${COMMA_PUBLIC_BRAND} Custom Personalized ${keyword}`
  const candidate = `${preferred} | ${title.replace(/^Jersevo\s+Custom\s+Personalized\s+/i, '')}`
  if (candidate.length <= 60) return candidate
  return `${preferred} | Jersevo`.slice(0, 60).replace(/[|\s]+$/g, '')
}

function commaSeoDescription(title, description, classification) {
  const category = classification.productGroup === 'Soccer Jersey' ? 'football jersey' : 'fan apparel'
  const sourceStory = sanitizeCommaPublicText(description)
  const candidate = `${title} is a Jersevo custom personalized ${category} design with clear size options for football fans. Add a name, number or short message when the selected product supports it. ${sourceStory}`
  const enriched = candidate.length < 120 ? `${candidate} Shop with clear size and product details.` : candidate
  return seoDescription(
    enriched,
    `Shop Jersevo custom personalized ${category} with clear product details, size options and a story-led design for football fans.`,
    160
  )
}

function commaDescription(title, sourceStory, classification) {
  const category = classification.productGroup === 'Soccer Jersey' ? 'football jersey' : 'fan apparel piece'
  const story = sanitizeCommaPublicText(sourceStory)
  return sanitizeCommaPublicText(
    `${title} is a Jersevo custom personalized ${category} for fans who want a design with their own name, number or message. ${story} Choose the available size and add personalization details at checkout when offered. Review the product preview, delivery estimate and care information before ordering.`
  )
}

function commaCustomFields(productId, productGroup) {
  if (productGroup === 'Soccer Jersey') return [
    {
      id:`${productId}-field-name`, key:'name', label:'Name', type:'text', required:false,
      placeholder:'YOUR NAME', maxLength:14, help:'Name printed on the garment.'
    },
    {
      id:`${productId}-field-number`, key:'number', label:'Number', type:'number', required:false,
      placeholder:'24', maxLength:2, help:'Player number from 00 to 99.'
    }
  ]
  return [{
    id:`${productId}-field-print-text`, key:'printText', label:'Printed message', type:'text', required:false,
    placeholder:'YOUR MESSAGE', maxLength:28, help:'Short copy printed on the piece.'
  }]
}

export function normalizeCommaProduct(product = {}, {
  usedHandles = new Set(),
  usedSkus = new Set(),
  priceMode = 'ZERO',
  usdRate = 0
} = {}) {
  const sourceId = String(product.id || '').trim()
  if (!sourceId) throw new Error('Comma product ID is required.')
  const productId = stableId('listing', `comma-product:${sourceId}`)
  const sourceTitle = sanitizeCommaPublicText(product.title) || 'Imported football product'
  const title = publicCommaTitle(sourceTitle)
  const handleBase = `${slugify(product.handle || title).slice(0, 92)}-cf-${stableHash(sourceId, 6)}`
  let handle = handleBase
  let suffix = 2
  while (usedHandles.has(handle)) handle = `${handleBase}-${suffix++}`
  usedHandles.add(handle)
  const blocks = commaHtmlToBlocks(product.body_html, sourceTitle)
  const classification = inferCommaTaxonomy(product)
  const sourceStory = blocks.map(block => block.content).filter(Boolean).join(' ')
  const description = commaDescription(title, sourceStory, classification)
  const sourceOptions = (Array.isArray(product.options) ? product.options : [])
    .map((option, index) => ({
      sourcePosition:Number(option.position || index + 1),
      name:normalizeOptionName(option.name),
      values:[...new Set((option.values || []).map(value => normalizeOptionValue(option.name, value)).filter(Boolean))]
    }))
    .filter(option => option.name && option.values.length)
    .slice(0, 3)
  const variants = (Array.isArray(product.variants) ? product.variants : []).map((variant, index) => {
    const externalVariantId = String(variant.id || `${sourceId}:${index}`)
    const values = Object.fromEntries(sourceOptions.map(option => {
      const raw = variant[`option${option.sourcePosition}`] ?? (sourceOptions.length === 1 ? variant.title : '')
      return [option.name, normalizeOptionValue(option.name, raw)]
    }))
    const price = convertCommaPrice(variant.price, { mode:priceMode, usdRate })
    const sourceCompareAt = parseAudMoney(variant.compare_at_price)
    const compareAtConverted = sourceCompareAt == null ? null : convertCommaPrice(sourceCompareAt, { mode:priceMode, usdRate })
    const compareAt = compareAtConverted != null && compareAtConverted > price ? compareAtConverted : null
    return {
      id:stableId('variant', `comma-variant:${externalVariantId}`),
      sku:stableSku(`comma-variant-sku:${externalVariantId}`, usedSkus),
      values,
      price,
      compareAt,
      cost:null,
      inventory:0,
      weightGrams:Number(variant.grams) > 0 ? Math.trunc(Number(variant.grams)) : null,
      barcode:'',
      status:COMMA_VARIANT_STATUS,
      image:null
    }
  }).filter(variant => sourceOptions.every(option => option.values.includes(variant.values[option.name])))
  const options = sourceOptions.map(({ name, values }) => ({ name, values }))
  const media = (Array.isArray(product.images) ? product.images : []).map((image, index) => {
    const sourceUrl = String(image.src || image.url || '')
    const role = mediaRole(sourceUrl, index)
    return {
      id:stableId('media', `comma-media:${sourceId}:${image.id || sourceUrl || index}`, 20),
      type:'IMAGE',
      sourceUrl,
      filename:`${slugify(title).slice(0, 48)}-${role}-${index + 1}.avif`,
      alt:sanitizeCommaPublicText(image.alt) || mediaAlt(title, role, index),
      role,
      width:Number(image.width) || null,
      height:Number(image.height) || null,
      createdAt:null
    }
  }).filter(item => /^https:\/\//i.test(item.sourceUrl)).slice(0, 20)
  const sourceTagValues = sourceTags(product)
  const publicTags = sourceTagValues.map(cleanPublicTag).filter(Boolean)
  const taxonomyTags = [
    classification.taxonomy.league, classification.taxonomy.team,
    classification.taxonomy.nationalTeam, classification.taxonomy.player,
    classification.taxonomy.competition, classification.taxonomy.theme,
    classification.taxonomy.fit, classification.taxonomy.lifecycle,
    slugify(classification.productGroup, '')
  ].filter(Boolean)
  const tags = [...new Set([...publicTags, ...taxonomyTags])]
  for (const tag of ['jersevo', 'custom', 'personalized', 'customizable']) if (!tags.includes(tag)) tags.push(tag)
  tags.splice(50)
  const sourceVariants = (product.variants || []).map(variant => ({
    id:String(variant.id || ''),
    sku:String(variant.sku || ''),
    price:parseAudMoney(variant.price),
    compareAt:parseAudMoney(variant.compare_at_price),
    available:Boolean(variant.available)
  }))
  const fingerprint = createHash('sha256').update(JSON.stringify({
    id:sourceId, title:product.title, body:product.body_html, tags:sourceTagValues,
    variants:sourceVariants, images:media.map(item => item.sourceUrl)
  })).digest('hex')
  const prices = variants.map(variant => variant.price).filter(Number.isFinite)
  const comparePrices = variants.map(variant => variant.compareAt).filter(value => Number.isFinite(value) && value > 0)
  const pricingMode = String(priceMode || 'ZERO').toUpperCase()
  const listing = {
    id:productId,
    handle,
    title,
    subtitle:`${COMMA_PUBLIC_BRAND} custom personalized ${classification.productGroup.toLowerCase()} · choose your details`.slice(0, 180),
    description,
    price:prices.length ? Math.min(...prices) : 0,
    compareAt:comparePrices.length ? Math.min(...comparePrices) : null,
    status:COMMA_IMPORT_STATUS,
    badge:classification.taxonomy.lifecycle === 'pre-order' ? 'PRE-ORDER' : null,
    type:'PERSONALIZED',
    image:'',
    color:'',
    sku:stableSku(`comma-parent-sku:${sourceId}`, usedSkus),
    artworkLock:100,
    personalization:[],
    media:[],
    contentBlocks:blocks,
    tags,
    productGroup:classification.productGroup,
    taxonomy:classification.taxonomy,
    customFields:commaCustomFields(productId, classification.productGroup),
    seo:{
      title:commaSeoTitle(title, classification),
      description:commaSeoDescription(title, sourceStory, classification),
      primaryKeyword:[COMMA_PUBLIC_BRAND, 'custom', 'personalized', classification.taxonomy.playerName, classification.taxonomy.country, classification.productGroup].filter(Boolean).join(' ').slice(0, 100)
    },
    seoStatus:'BLOCKED',
    seoQualityScore:0,
    seoBlockReasons:['DRAFT_REVIEW_REQUIRED', 'SOURCE_RIGHTS_REVIEW_REQUIRED', ...(pricingMode === 'ZERO' ? ['USD_PRICE_REQUIRED'] : [])],
    aiMetadata:{
      importedFrom:'CATALOG_SANITIZED',
      importFingerprint:fingerprint,
      catalogImport:{ sourceKey:'comma', sourceId },
      sourcePricing:{ currency:COMMA_SOURCE_CURRENCY, variants:sourceVariants.map(({ price, compareAt }) => ({ price, compareAt })) },
      pricingMode,
      ...(pricingMode === 'AUD_TO_USD' ? { usdRate:Number(usdRate) } : {}),
      sourceState:{ preOrder:classification.taxonomy.lifecycle === 'pre-order', availableVariants:sourceVariants.filter(row => row.available).length },
      sourceTitle,
      catalogReview:{ status:'PENDING', note:'Verify resale, trademark, player likeness, copy and image rights before publication.' }
    },
    inventory:0,
    options,
    variants
  }
  return {
    sourceId,
    sourceSku:String(product.variants?.[0]?.sku || ''),
    sourceUrl:`https://${COMMA_SOURCE_HOST}/products/${encodeURIComponent(String(product.handle || ''))}`,
    sourceCategories:[...new Set(sourceTagValues.map(sanitizeCommaPublicText).filter(Boolean))],
    listing,
    media,
    sourceVariants
  }
}

export function publicCommaListingHasSourceReferences(listing) {
  const publicShape = { ...listing, aiMetadata:undefined, ai_metadata:undefined }
  return SOURCE_REFERENCE.test(JSON.stringify(publicShape || {}))
}

export const COMMA_CANONICAL_COLLECTIONS = Object.freeze([
  {
    key:'world-cup', handle:'world-cup-jerseys', name:'World Cup Jerseys',
    description:'World Cup-inspired football jerseys organized by national team, player and tournament story.',
    matches:item => item?.listing?.taxonomy?.competition === 'world-cup'
  },
  {
    key:'national-teams', handle:'national-team-jerseys', name:'National Team Jerseys',
    description:'National team football jerseys from international tournaments and memorable eras.',
    matches:item => Boolean(item?.listing?.taxonomy?.nationalTeam)
  },
  {
    key:'football-legends', handle:'football-legends', name:'Football Legends',
    description:'Story-led football jerseys celebrating defining players, moments and historic eras.',
    matches:item => item?.listing?.taxonomy?.theme === 'football-legends'
  }
])

export function buildCommaCollectionPlan(items = []) {
  return COMMA_CANONICAL_COLLECTIONS.map(descriptor => {
    const products = items.filter(descriptor.matches).map(item => item.listing.id)
    return {
      sourceId:descriptor.key,
      id:stableId('collection', `comma-curated:${descriptor.key}`),
      handle:descriptor.handle,
      name:descriptor.name,
      description:descriptor.description,
      status:'DRAFT',
      hero:'',
      sortMode:'MANUAL',
      seo:{
        title:`${descriptor.name} | Jersevo`.slice(0, 60),
        description:seoDescription(descriptor.description, '', 160),
        intent:descriptor.key
      },
      products
    }
  }).filter(collection => collection.products.length)
}

export function classifyCommaSourceCollection(collection = {}) {
  const text = `${collection.handle || ''} ${collection.title || ''}`.toLowerCase()
  if (!Number(collection.products_count || 0)) return 'EMPTY'
  if (/(?:sale|black friday|bfcm|price drop|pre[- ]?order|ready to ship|restock|last chance|bundle|end of season|christmas)/i.test(text)) return 'OPERATIONAL'
  if (/(?:jerseys?|shirts?|world cup|international|legends?|premier league|la liga|bundesliga|ligue 1|argentina|brazil|portugal|spain|france|england|germany|belgium|croatia|netherlands|norway|scotland|switzerland|arsenal|chelsea|liverpool|barcelona|madrid|bayern|dortmund|psg|messi|ronaldo|maradona|neymar|salah)/i.test(text)) return 'CUSTOMER_INTENT'
  return 'EDITORIAL_CAMPAIGN'
}

export function commaImportReport({ items = [], collections = [], sourceCollections = [], errors = [], priceMode = 'ZERO', usdRate = 0 } = {}) {
  const sourceCollectionKinds = sourceCollections.reduce((counts, collection) => {
    const kind = classifyCommaSourceCollection(collection)
    counts[kind] = (counts[kind] || 0) + 1
    return counts
  }, {})
  const taxonomyCounts = key => items.reduce((counts, item) => {
    const value = String(item.listing?.taxonomy?.[key] || '')
    if (value) counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
  return {
    generatedAt:new Date().toISOString(),
    source:COMMA_SOURCE_HOST,
    sourceCurrency:COMMA_SOURCE_CURRENCY,
    pricing:{ mode:String(priceMode || 'ZERO').toUpperCase(), ...(String(priceMode).toUpperCase() === 'AUD_TO_USD' ? { usdRate:Number(usdRate) } : {}) },
    products:items.length,
    variants:items.reduce((sum, item) => sum + (item.listing?.variants?.length || 0), 0),
    sourceImages:items.reduce((sum, item) => sum + (item.media?.length || 0), 0),
    importedImages:items.reduce((sum, item) => sum + (item.listing?.media?.length || 0), 0),
    statusCounts:items.reduce((counts, item) => ({ ...counts, [item.listing?.status || 'INVALID']:(counts[item.listing?.status || 'INVALID'] || 0) + 1 }), {}),
    productGroups:taxonomyCounts('productGroup'),
    leagues:taxonomyCounts('league'),
    nationalTeams:taxonomyCounts('nationalTeam'),
    competitions:taxonomyCounts('competition'),
    lifecycle:taxonomyCounts('lifecycle'),
    fits:taxonomyCounts('fit'),
    sourceCollections:sourceCollections.length,
    sourceCollectionKinds,
    sourceCollectionAudit:sourceCollections.map(collection => ({
      sourceId:String(collection.id || ''),
      handle:String(collection.handle || ''),
      title:String(collection.title || collection.handle || ''),
      products:Number(collection.products_count || 0),
      kind:classifyCommaSourceCollection(collection)
    })).sort((a, b) => b.products - a.products || a.title.localeCompare(b.title)),
    canonicalCollections:collections.map(collection => ({ id:collection.id, handle:collection.handle, name:collection.name, products:collection.products.length, status:collection.status })),
    errors,
    items:items.map(item => ({
      sourceId:item.sourceId,
      id:item.listing?.id,
      handle:item.listing?.handle,
      title:item.listing?.title,
      status:item.listing?.status,
      productGroup:item.listing?.productGroup,
      taxonomy:item.listing?.taxonomy,
      variants:item.listing?.variants?.length || 0,
      sourceImages:item.media?.length || 0,
      importedImages:item.listing?.media?.length || 0,
      price:item.listing?.price
    }))
  }
}
