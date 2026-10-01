import { createClient } from '@supabase/supabase-js'
import { adminProducts } from '../admin-data'
import { adminCollections, adminMenus, adminProductOptions, adminTheme, themeBlocks } from '../admin-builder-data'
import { buildListingInput, normalizeProduct, validateListing } from './catalog-model'
import { buildMenuTree, prepareStorefrontProduct, resolveMenuImages } from './storefront-model'
import { custom3DDesignerConfig, isCustom3DOnlyProduct } from './custom-3d.js'
import { DEFAULT_PAYMENT_SETTINGS, normalizePaymentSettings, validatePaymentSettings } from './payment-config'
import { apiFetch } from './api-client'
import { collectionMembershipDiff } from './collection-assignment'
import { collectionAutomationHasConditions, normalizeCollectionAutomation } from './collection-rules'
import { ALL_LEAGUE_TAXONOMY } from './league-taxonomy'
import { accessoryGroupsForCategory, catalogCategoryByHandle, catalogCategoryIntentFilter } from './catalog-taxonomy'
import { teamProductTypeByHandle } from './team-product-pages'
import { catalogPageRouteCanDeleteProducts } from './catalog-page-overrides'
import { DESIGNER_LISTING_IDS } from './designer-listing-ids'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

export const membershipPreview = {
  program:{ id:'90-club',slug:'90-plus-club',name:'90+ Club',tagline:'More time. Better access.',description:'A season pass for people who wear the story beyond the final whistle.',status:'PUBLISHED',currency:'USD',default_discount_percent:20,max_discount_percent:40,min_margin_percent:20,benefits:[
    {id:'member-price',title:'20–40% member pricing',copy:'The best eligible price is applied automatically.'},
    {id:'shipping',title:'Eligible standard shipping included',copy:'Destination, method and subsidy limits are checked at quote time.'},
    {id:'early-access',title:'Early access to new drops',copy:'Enter selected releases before the public window opens.'},
    {id:'studio',title:'Studio priority',copy:'Custom, artwork and production fees stay transparent.'}
  ],shipping_policy:{enabled:true,eligible_zones:['ALL'],method:'STANDARD',minimum_subtotal:0,subsidy_cap:15,excluded_product_tags:['oversize-shipping'],copy:'Standard shipping is covered up to $15 for eligible destinations.'}},
  prices:[
    {id:'90000000-0000-4000-8000-000000000001',program_id:'90-club',billing_interval:'MONTH',interval_months:1,label:'Monthly',amount:19,currency:'USD',status:'ACTIVE',sort_order:1},
    {id:'90000000-0000-4000-8000-000000000003',program_id:'90-club',billing_interval:'QUARTER',interval_months:3,label:'Quarterly',amount:49,currency:'USD',status:'ACTIVE',sort_order:2},
    {id:'90000000-0000-4000-8000-000000000012',program_id:'90-club',billing_interval:'YEAR',interval_months:12,label:'Annual',amount:169,currency:'USD',status:'ACTIVE',sort_order:3}
  ],
  policy:{id:'92000000-0000-4000-8000-000000000001',program_id:'90-club',version:'v1',title:'90+ Club membership policy',summary:'Benefits are subject to eligibility, price protection and the published shipping policy.',content:'Member pricing is calculated at quote time and does not normally stack with a public sale; the better eligible price applies. Standard shipping is limited by destination, method and subsidy cap. Customization, AI artwork and production upgrades are excluded unless a published benefit says otherwise. An enrollment request alone is not an active membership.',status:'PUBLISHED'}
}

const previewResult = (data, error = null) => ({ data, source: 'preview', error })

// A theme saved before a new homepage section was introduced can still have a
// non-empty block list.  The storefront deliberately honours an admin's
// ordering, but it must not silently lose sections that are part of the
// current system.  Keep persisted blocks first (including custom blocks), then
// append any newly introduced defaults.  Cloning also prevents an inspector
// edit from mutating the module-level fallback objects.
export function mergeThemeBlocks(persisted = [], defaults = themeBlocks) {
  const source = Array.isArray(persisted) ? persisted.filter(Boolean) : []
  const fallback = Array.isArray(defaults) ? defaults.filter(Boolean) : []
  const defaultById = new Map(fallback.map(block => [block.id, block]))
  const legacyIds = new Set(['custom-cta', 'story', 'vault', 'manifesto'])
  const modernIds = new Set(fallback.filter(block => !legacyIds.has(block.id)).map(block => block.id))
  const hasModernBlock = source.some(block => modernIds.has(block.id))
  const seen = new Set()
  const merged = []
  source.forEach(block => {
    if (!block.id || seen.has(block.id)) return
    const baseline = defaultById.get(block.id)
    // Older published definitions used these editorial blocks as the primary
    // homepage. Once any current-system block is present, keep the old entry
    // in its saved position for admin visibility but disable it so the public
    // route cannot mix the two information architectures.
    const normalized = hasModernBlock && legacyIds.has(block.id) ? { ...block, enabled: false } : block
    merged.push({ ...(baseline || {}), ...normalized })
    seen.add(block.id)
  })
  fallback.forEach(block => {
    if (!block.id || seen.has(block.id)) return
    merged.push({ ...block })
    seen.add(block.id)
  })
  return merged
}

const normalizeThemePages = (pages = []) => (Array.isArray(pages) ? pages : []).map(page => {
  const fallback = adminTheme.pages?.find(item => item.id === page?.id || item.path === page?.path) || {}
  return {
    ...fallback,
    ...page,
    representativeImage: page.representative_image || page.representativeImage || fallback.representativeImage || '',
    representativeAlt: page.representative_alt || page.representativeAlt || fallback.representativeAlt || ''
  }
})

export function getCustomerSessionId() {
  const key = 'extra-time-customer-session'
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const created = `session_${globalThis.crypto.randomUUID().replace(/-/g,'')}`
    window.localStorage.setItem(key, created)
    return created
  } catch {
    return `session_${globalThis.crypto.randomUUID().replace(/-/g,'')}`
  }
}

export async function uploadCustomerReference(file, productId, fieldKey, kind = 'photo') {
  const logo = kind === 'logo'
  const accepted = logo ? /^image\/(?:png|jpe?g|webp|svg\+xml)$/i : /^image\/(?:png|jpe?g|webp)$/i
  const limit = logo ? 8 * 1024 * 1024 : 2 * 1024 * 1024
  if (!file || !accepted.test(file.type) || file.size > limit) throw new Error(`Use a ${logo ? 'PNG, SVG, JPG or WebP logo' : 'JPG, PNG or WebP image'} smaller than ${limit / 1024 / 1024} MB.`)
  const dataUrl = await new Promise((resolve,reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })
  const response = await apiFetch('/api/customer-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sessionId:getCustomerSessionId(), productId, fieldKey, kind:logo ? 'logo' : 'photo', dataUrl }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The reference image could not be uploaded.')
  return result
}

async function requestLogoPreview(path, { productId, fieldKey, assetRef, treatment = 'EXACT' }) {
  const response = await apiFetch(path, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ sessionId:getCustomerSessionId(), productId, fieldKey, assetRef, treatment })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || (path.includes('ai-logo') ? 'AI logo finish failed.' : 'Logo preview failed.'))
  return result
}

export const createExactLogoPreview = input => requestLogoPreview('/api/logo-preview', input)
export const createAiLogoPreview = input => requestLogoPreview('/api/ai-logo-preview', input)

export async function fetchStorefrontProduct(handle, { includeRelated = true } = {}) {
  if (!supabase) return { data:[],source:'unavailable',error:'Live catalogue is not configured.' }
  const fields = '*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))'
  const { data:row,error } = await supabase.from('pod_products').select(fields).eq('status','PUBLISHED').eq('handle',handle).maybeSingle()
  if (error) return {data:[],source:'unavailable',error:error.message}
  if (!row) return {data:[],source:'supabase',error:null}
  const product = prepareStorefrontProduct(row)
  let related = []
  const league = product.taxonomy?.league
  if (league && includeRelated) {
    let relatedQuery = supabase.from('pod_products').select(fields).eq('status','PUBLISHED').eq('taxonomy->>league',league).neq('id',product.id)
    if (!isCustom3DOnlyProduct(product)) relatedQuery = relatedQuery.not('tags','cs','{"3d-designer"}')
    const result = await relatedQuery.order('id').limit(12)
    if (!result.error) related = (result.data || []).map(item=>prepareStorefrontProduct(item))
  }
  return {data:[product,...related],source:'supabase',error:null}
}

export async function fetchStorefrontDesignerProduct(provider, productId) {
  if (!supabase) return { data:[],source:'unavailable',error:'Live catalogue is not configured.' }
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const normalizedProductId = String(productId || '').trim()
  if (!['owayo','boombah'].includes(normalizedProvider) || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(normalizedProductId)) {
    return { data:[],source:'supabase',error:'Invalid 3D garment identity.' }
  }
  const productTag = `designer-product-${normalizedProductId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const fields = '*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))'
  const expectedProduct = normalizedProductId.toLowerCase()
  const lookup = () => supabase
    .from('pod_products')
    // Resolve the tiny identity row first. Joining variants while scanning a
    // JSON/array predicate can push an otherwise valid public query over the
    // database statement timeout on a 30k+ catalogue.
    .select('id,ai_metadata,tags')
    .eq('status','PUBLISHED')
    .contains('tags',[productTag])
    .limit(4)
  let identity = await lookup()
  if (String(identity.error?.code || '') === '57014') identity = await lookup()
  if (identity.error) return { data:[],source:'unavailable',error:identity.error.message }
  const exactIdentity = (identity.data || []).find(row => {
      const config = custom3DDesignerConfig(row)
      return config?.provider === normalizedProvider && String(config.productId || '').toLowerCase() === expectedProduct
    })
  if (!exactIdentity?.id) return { data:[],source:'supabase',error:null }
  const detail = await supabase
    .from('pod_products')
    .select(fields)
    .eq('status','PUBLISHED')
    .eq('id',exactIdentity.id)
    .maybeSingle()
  if (detail.error) return { data:[],source:'unavailable',error:detail.error.message }
  const product = detail.data ? prepareStorefrontProduct(detail.data) : null
  const config = custom3DDesignerConfig(product)
  const exact = config?.provider === normalizedProvider && String(config.productId || '').toLowerCase() === expectedProduct
  return { data:exact ? [product] : [],source:'supabase',error:null }
}

// Cards do not need long descriptions, full galleries or SEO JSON. Those are
// hydrated by fetchStorefrontProduct when a shopper opens a product page.
const STOREFRONT_CARD_FIELDS = 'id,handle,title,subtitle,description,price,compare_at,image,inventory,sku,tags,taxonomy,product_group,type,color,custom_fields,status,seo_status,updated_at,badge,pod_product_options(name,sort_order,pod_product_option_values(label,sort_order)),pod_product_variants(id,price,compare_at,inventory,reserved_inventory,status,sku,option_values,image)'
const STOREFRONT_SEARCH_FIELDS = Object.freeze([
  'title','subtitle','handle','sku','product_group','type','color',
  'taxonomy->>league','taxonomy->>team','taxonomy->>category','taxonomy->>brand',
  'taxonomy->>nationalTeam','taxonomy->>national_team','taxonomy->>country',
  'taxonomy->>player','taxonomy->>playerName','taxonomy->>player_name',
  'taxonomy->>competition','taxonomy->>fit','taxonomy->>theme',
  'taxonomy->>lifecycle','taxonomy->>year',
  'taxonomy->>accessoryCategory','taxonomy->>accessoryType'
])
const DESIGNER_TAG_FILTER = '{"3d-designer"}'
const DESIGNER_ID_FILTER = Object.freeze(DESIGNER_LISTING_IDS)
// Only the private Custom Lab is allowed to hydrate designer source rows.
// `/category/custom-jerseys` is still a public storefront category and must
// follow the same exclusion rule as Shop, leagues, teams and collections.
const isCustom3DRoute = basePath => /^\/custom(?:\/|$)/i.test(String(basePath || ''))
const transientCatalogueError = (error, status) => String(error?.code || '') === '57014' || [0,408,429,500,502,503,504].includes(Number(status)) || /timeout|temporarily unavailable|fetch failed/i.test(String(error?.message || ''))
const storefrontPageCache = new Map()
const STOREFRONT_PAGE_CACHE_TTL = 10 * 60 * 1000
const STOREFRONT_STALE_CACHE_TTL = 6 * 60 * 60 * 1000

function storefrontSessionCacheKey(cacheKey) {
  // v3 invalidates pages cached before the Custom Lab switched from the
  // broad custom_fields predicate to the explicit 3D designer contract.
  return `jersevo:catalog:v3:${encodeURIComponent(cacheKey)}`
}

function readStorefrontPageCache(cacheKey, { allowStale = false } = {}) {
  const maxAge = allowStale ? STOREFRONT_STALE_CACHE_TTL : STOREFRONT_PAGE_CACHE_TTL
  const memory = storefrontPageCache.get(cacheKey)
  if (memory && Date.now() - memory.at < maxAge) return memory
  try {
    const saved = JSON.parse(globalThis.sessionStorage?.getItem(storefrontSessionCacheKey(cacheKey)) || 'null')
    if (saved?.value && Date.now() - Number(saved.at || 0) < maxAge) {
      storefrontPageCache.set(cacheKey,saved)
      return saved
    }
  } catch {}
  return null
}

function writeStorefrontPageCache(cacheKey, value) {
  const entry = { at:Date.now(), value }
  storefrontPageCache.set(cacheKey,entry)
  try { globalThis.sessionStorage?.setItem(storefrontSessionCacheKey(cacheKey),JSON.stringify(entry)) } catch {}
}

export function applyStorefrontRouteFilters(query, { basePath = '', search = '' } = {}) {
  const params = new URLSearchParams(search)
  const parts = String(basePath || '').split('/').filter(Boolean)
  // Synchronized 3D garment families belong to the Custom Lab only. Apply
  // this before pagination so Shop, league, team and category totals do not
  // reserve slots for cards that must not be rendered there.
  // The GIN-less tags containment query and a JSON provider predicate both
  // cross the statement timeout once the public catalogue grows past ~30k
  // rows. Deterministic designer IDs keep this request index-friendly while
  // the tag remains the exclusion marker used by ordinary storefront routes.
  if (isCustom3DRoute(basePath)) {
    // Designer source IDs are deterministic and indexed.  Filtering by the
    // JSON provider/visibility path looks elegant but scans the full catalogue
    // and can exceed Supabase's statement timeout once the feed grows past
    // 30k rows.  Retail PDPs intentionally use different IDs and never enter
    // this private source catalogue.
    query = query.in('id',DESIGNER_ID_FILTER)
  }
  else query = query.not('tags','cs',DESIGNER_TAG_FILTER)
  if (parts[0] === 'league' && parts[1]) query = query.eq('taxonomy->>league',parts[1])
  if (parts[0] === 'team' && parts[1] && parts[2]) {
    query = query.eq('taxonomy->>league',parts[1]).eq('taxonomy->>team',parts[2])
    const teamType = teamProductTypeByHandle(parts[3])
    if (teamType) query = query.in('product_group',teamType.groups)
  }
  if (parts[0] === 'category' && parts[1]) {
    const routeCategory = catalogCategoryByHandle(parts[1])
    const intentFilter = catalogCategoryIntentFilter(routeCategory)
    const accessoryGroups = routeCategory?.accessoryFamily ? accessoryGroupsForCategory(routeCategory) : []
    const categoryMap = {
      jerseys:['Football Jersey','Baseball Jersey','Basketball Jersey','Hockey Jersey','Soccer Jersey','Jerseys'],
      hats:['Caps','Knit Hats','Hats','Headwear'],
      accessories:['Caps','Knit Hats','Accessories','Bags','Backpacks','Sports Bags','Scarves','Gloves','Flags','Banners','Pins','Patches','Key Chains','Keychains','Decals','Magnets','Stickers','Bottles','Mugs','Drinkware','Glassware','Coasters','Socks','Leg Sleeves','Gift Sets','Gift Bundles','Bundles'],
      caps:['Caps'],
      'knit-hats':['Knit Hats'],
      'football-jerseys':['Football Jersey'],
      'baseball-jerseys':['Baseball Jersey'],
      'basketball-jerseys':['Basketball Jersey'],
      'hockey-jerseys':['Hockey Jersey'],
      'soccer-jerseys':['Soccer Jersey'],
      'fan-apparel':['Fan Apparel'],
      collectibles:['Collectibles'],
      'fan-gear':['Fan Gear']
    }
    const groups = accessoryGroups.length ? accessoryGroups : categoryMap[parts[1]]
    if (intentFilter?.operator === 'eq') {
      query = query.eq(intentFilter.field,intentFilter.value)
    } else if (intentFilter?.operator === 'in') {
      query = query.in(intentFilter.field,intentFilter.values || [])
    } else if (intentFilter?.operator === 'presentAny') {
      query = query.or(intentFilter.fields.map(field => `${field}.not.is.null`).join(','))
    } else if (routeCategory?.accessoryFamily && groups?.length) {
      const groupFilter = `product_group.in.(${groups.map(value => `"${String(value).replaceAll('"','\\"')}"`).join(',')})`
      const taxonomyFilters = [`taxonomy->>accessoryCategory.eq.${routeCategory.accessoryFamily}`]
      if (routeCategory.accessoryType) taxonomyFilters.push(`taxonomy->>accessoryType.eq.${routeCategory.accessoryType}`)
      query = query.or([groupFilter,...taxonomyFilters].join(','))
    } else if (parts[1] === 'accessories') {
      const groupFilter = `product_group.in.(${categoryMap.accessories.map(value => `"${String(value).replaceAll('"','\\"')}"`).join(',')})`
      query = query.or(`taxonomy->>category.eq.Accessories,${groupFilter}`)
    }
    else if (groups?.length === 1) query = query.eq('product_group',groups[0])
    else if (groups?.length) query = query.in('product_group',groups)
    // The Custom Lab is a 3D designer catalogue, not a broad
    // personalization catalogue. Comma and other 2D listings may still have
    // custom_fields, but only the public 3D marker can enter this route.
    if (parts[1] === 'custom-jerseys') query = query.contains('tags',['3d-designer'])
  }
  const group = params.get('group')
  const sport = params.get('sport')
  const league = params.get('league')
  const brand = params.get('brand')
  const team = params.get('team')
  const type = params.get('type')
  const color = params.get('color')
  const price = params.get('price')
  const custom = params.get('custom')
  // `search` is intentionally a commerce query.  It covers the fields a
  // shopper sees or uses to identify a listing, plus the controlled taxonomy
  // fields used by team/league/product intent.  Keeping it on the page query
  // means a direct Shop URL is shareable and does not depend on the overlay.
  const searchTerm = String(params.get('search') || params.get('q') || '').trim().slice(0, 80)
  if (group && group !== 'ALL') query = query.eq('product_group',group)
  if (league) query = query.eq('taxonomy->>league',league.toLowerCase())
  else if (sport) {
    const leagues = ALL_LEAGUE_TAXONOMY.filter(item => item.sport.toLowerCase() === sport.toLowerCase()).map(item => item.key)
    if (leagues.length) query = query.in('taxonomy->>league',leagues)
  }
  if (brand) query = query.eq('taxonomy->>brand',brand)
  if (team && team !== 'ALL') query = query.eq('taxonomy->>team',team)
  if (type && type !== 'ALL') query = query.ilike('type',`%${type}%`)
  if (color && color !== 'ALL') query = query.ilike('color',color)
  if (custom === '1') query = query.not('custom_fields','eq','[]')
  if (price === 'UNDER_90') query = query.lt('price',90)
  if (price === '90_100') query = query.gte('price',90).lte('price',100)
  if (price === 'OVER_100') query = query.gt('price',100)
  if (searchTerm.length >= 2) {
    const safe = searchTerm.replace(/[(),"']/g, ' ').replace(/\s+/g, ' ').trim()
    for (const token of safe.split(' ').filter(Boolean).slice(0, 6)) {
      const pattern = `*${token}*`
      query = query.or(STOREFRONT_SEARCH_FIELDS.map(field => `${field}.ilike.${pattern}`).join(','))
    }
  }
  return query
}

export async function fetchStorefrontCatalogPage({ page = 1, pageSize = 24, basePath = '/shop', search = '', includeCount = false } = {}) {
  if (!supabase) return { data:[], total:0, page, pageSize, source:'unavailable', error:'Live catalogue is not configured.' }
  const safePage = Math.max(1,Math.trunc(Number(page) || 1))
  const safeSize = Math.min(60,Math.max(12,Math.trunc(Number(pageSize) || 24)))
  // The explicit route filter below is cheap and deterministic for both the
  // ordinary catalogue and the Custom Lab. Do not short-circuit the custom
  // route from the navigation index: that index intentionally omits designer
  // rows so they cannot leak into Shop/league cards.
  // A home-page request intentionally skips the count so it can paint its
  // twelve featured cards immediately.  Keep counted and uncounted pages in
  // separate caches; otherwise a later Shop request could reuse the home
  // snapshot and incorrectly report only the first page (for example 26/36)
  // as the size of the catalogue.
  const cacheKey = `${safePage}|${safeSize}|${basePath}|${search}|${includeCount ? 'count' : 'page'}`
  const cached = readStorefrontPageCache(cacheKey)
  if (cached) return cached.value
  const sort = new URLSearchParams(search).get('sort') || 'FEATURED'
  const from = (safePage - 1) * safeSize
  const countPromise = includeCount && safePage === 1
    ? (async () => {
      const controller = new AbortController()
      const timer = globalThis.setTimeout(() => controller.abort(), 4500)
      try {
        let countQuery = supabase.from('pod_products').select('id', { count:'exact', head:true }).eq('status','PUBLISHED')
        countQuery = applyStorefrontRouteFilters(countQuery,{basePath,search})
        if (typeof countQuery.abortSignal === 'function') countQuery = countQuery.abortSignal(controller.signal)
        const result = await countQuery
        return result.error ? null : Number.isFinite(Number(result.count)) ? Number(result.count) : null
      } catch {
        return null
      } finally {
        globalThis.clearTimeout(timer)
      }
    })()
    : Promise.resolve(null)
  const fetchPage = async () => {
    // Counting the full catalogue is deliberately kept out of the card query.
    // Even a planned count can badly underestimate JSON taxonomy filters (for
    // example returning 1 for a team that has several pages), which used to
    // stop infinite loading after the first batch. Exact totals come from the
    // compact build-time navigation index instead.
    let query = supabase.from('pod_products').select(STOREFRONT_CARD_FIELDS).eq('status','PUBLISHED')
    query = applyStorefrontRouteFilters(query,{basePath,search})
    if (sort === 'PRICE LOW') query = query.order('price',{ascending:true})
    else if (sort === 'PRICE HIGH') query = query.order('price',{ascending:false})
    else query = query.order('updated_at',{ascending:false})
    return query.order('id',{ascending:true}).range(from,from + safeSize - 1)
  }
  let lastResult
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { lastResult = await fetchPage() }
    catch (error) { lastResult = { error, status:0, data:null, count:null } }
    if (!lastResult.error) break
    if (!transientCatalogueError(lastResult.error,lastResult.status)) break
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)))
  }
  const { data,error } = lastResult || {}
  if (error) {
    const stale = readStorefrontPageCache(cacheKey,{allowStale:true})
    if (stale) return { ...stale.value, source:'cache', stale:true, error:error.message || 'The live catalogue could not be refreshed.' }
    return { data:[],total:null,page:safePage,pageSize:safeSize,source:'unavailable',error:error.message || 'Published catalogue could not be loaded.' }
  }
  const total = await countPromise
  const value = { data:(data || [])
    .filter(row => isCustom3DRoute(basePath) || !isCustom3DOnlyProduct(row))
    .map(row => prepareStorefrontProduct(row)), total, page:safePage, pageSize:safeSize, source:'supabase', error:null }
  writeStorefrontPageCache(cacheKey,value)
  return value
}

export async function fetchStorefrontCollectionPage(handle, { page = 1, pageSize = 24 } = {}) {
  if (!supabase) return { data:[],total:0,page,pageSize,source:'unavailable',error:'Live catalogue is not configured.' }
  const collection = await supabase.from('pod_collections').select('id,handle,name,description,hero_image,seo,updated_at,status,sort_mode').eq('status','PUBLISHED').eq('handle',handle).maybeSingle()
  if (collection.error) return { data:[],total:0,page,pageSize,source:'unavailable',error:collection.error.message }
  if (!collection.data) return { data:[],total:0,page,pageSize,source:'supabase',error:null }
  const safePage = Math.max(1,Math.trunc(Number(page) || 1))
  const safeSize = Math.min(60,Math.max(12,Math.trunc(Number(pageSize) || 24)))
  const from = (safePage - 1) * safeSize
  // Filter through the related product table before applying the range. This
  // keeps `total` and page boundaries aligned with what the storefront can
  // actually sell; a membership pointing at a draft/archived listing must not
  // consume a public page slot.
  let links = await supabase
    .from('pod_collection_products')
    .select('product_id,sort_order,pod_products!inner(id,status)',{count:'exact'})
    .eq('collection_id',collection.data.id)
    .eq('pod_products.status','PUBLISHED')
    .order('sort_order',{ascending:true})
    .range(from,from + safeSize - 1)
  if (links.error) {
    // Older projects may not have the relationship projection available. Keep
    // the legacy query as a compatibility path, but still discard non-public
    // rows after fetching the page.
    links = await supabase.from('pod_collection_products').select('product_id,sort_order',{count:'exact'}).eq('collection_id',collection.data.id).order('sort_order',{ascending:true}).range(from,from + safeSize - 1)
  }
  if (links.error) return { data:[],total:0,page:safePage,pageSize:safeSize,source:'unavailable',error:links.error.message }
  const ids = (links.data || []).map(row => row.product_id)
  const collectionMeta = {
    ...collection.data,
    hero:collection.data.hero_image || '',
    sort:collection.data.sort_mode || 'MANUAL',
    products:ids,
    productLinks:(links.data || []).map(item => ({ productId:item.product_id, sortOrder:item.sort_order, featured:Boolean(item.featured) })),
    pageScoped:true,
    count:Number(links.count || 0),
    publishedCount:Number(links.count || 0)
  }
  if (!ids.length) return { data:[],total:Number(links.count || 0),page:safePage,pageSize:safeSize,source:'supabase',error:null,collection:collectionMeta }
  const products = await supabase.from('pod_products').select(STOREFRONT_CARD_FIELDS).eq('status','PUBLISHED').in('id',ids)
  if (products.error) return { data:[],total:0,page:safePage,pageSize:safeSize,source:'unavailable',error:products.error.message,collection:collectionMeta }
  const byId = new Map((products.data || []).map(row => [row.id,row]))
  const visible = ids.map(id => byId.get(id)).filter(Boolean).filter(row => !isCustom3DOnlyProduct(row))
  return { data:visible.map(row => prepareStorefrontProduct(row)),total:Number(links.count || 0),page:safePage,pageSize:safeSize,source:'supabase',error:null,collection:collectionMeta }
}

export async function fetchStorefrontSearch(term, limit = 12) {
  if (!supabase) return { data:[],source:'unavailable',error:'Live catalogue is not configured.' }
  const value = String(term || '').trim().slice(0,80)
  if (value.length < 2) return { data:[],source:'supabase',error:null }
  const safeLimit = Math.min(24,Math.max(1,Number(limit) || 12))
  const safe = value.replace(/[(),"']/g,' ').replace(/\s+/g,' ').trim()
  let query = supabase.from('pod_products').select(STOREFRONT_CARD_FIELDS).eq('status','PUBLISHED').not('tags','cs',DESIGNER_TAG_FILTER)
  for (const token of safe.split(' ').filter(Boolean).slice(0, 6)) {
    const pattern = `*${token}*`
    query = query.or(STOREFRONT_SEARCH_FIELDS.map(field => `${field}.ilike.${pattern}`).join(','))
  }
  const { data,error } = await query.order('updated_at',{ascending:false}).limit(safeLimit)
  if (error) return { data:[],source:'unavailable',error:error.message }
  return { data:(data || []).filter(row => !isCustom3DOnlyProduct(row)).map(row => prepareStorefrontProduct(row)),source:'supabase',error:null }
}

export async function fetchStorefrontNavigationIndex() {
  try {
    // This compact index is rebuilt on each deploy. Revalidate the stable URL
    // so a returning browser does not keep old team and facet counts forever.
    // The index is a deploy-time artifact and is served with a short public
    // TTL.  Let the browser/CDN reuse it instead of downloading hundreds of
    // KB again on every hard refresh; a new deployment naturally changes the
    // URL's representation and revalidates after the TTL.
    const response = await fetch('/catalog-navigation.json?v=3d-custom-v1',{cache:'default'})
    if (!response.ok) throw new Error(`Navigation index returned ${response.status}`)
    const rows = await response.json()
    return Array.isArray(rows) ? rows : []
  } catch { return [] }
}

export async function fetchStorefrontCatalog(fallback = []) {
  if (!supabase) return import.meta.env.DEV ? previewResult(fallback) : { data:[], source:'unavailable', error:'Live catalogue is not configured.' }
  const rows = []
  const pageSize = 250
  for (let from = 0; ; from += pageSize) {
    let data, error
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from('pod_products')
        .select('*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))')
        .eq('status', 'PUBLISHED')
        .not('tags','cs',DESIGNER_TAG_FILTER)
        .order('updated_at', { ascending:false })
        .order('id', { ascending:true })
        .range(from, from + pageSize - 1)
      data = result.data
      error = result.error
      if (!error || ![0, 408, 429, 500, 502, 503, 504].includes(Number(result.status))) break
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
    if (error) return import.meta.env.DEV ? previewResult(fallback, error.message) : { data:[], source:'unavailable', error:error.message }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  const products = rows.map(row => prepareStorefrontProduct(row))
  return { data:products, source:'supabase', error:null }
}

export async function fetchStorefrontMenus(fallback = [], context = {}) {
  if (!supabase) return previewResult(resolveMenuImages(fallback, context))
  const { data, error } = await supabase.from('pod_menus').select('*, pod_menu_items(*)').eq('status','PUBLISHED').order('updated_at',{ascending:false})
  if (error) return previewResult(resolveMenuImages(fallback, context), error.message)
  const menus = (data || []).map(menu => {
    const all = (menu.pod_menu_items || []).filter(item => item.visible !== false)
    return { ...menu, items:buildMenuTree(all) }
  })
  const resolved = resolveMenuImages(menus.length ? menus : fallback, context)
  return { data:resolved, source:menus.length ? 'supabase' : 'preview', error:null }
}

export async function fetchStorefrontCollections(fallback = [], requestedHandle = '') {
  if (!supabase) return previewResult(fallback)
  // The directory only needs a count, not 29k membership rows. Ask PostgREST
  // for a relation count there; the public RLS policy limits that count to
  // published products. Hydrate full membership only for a requested page.
  const select = requestedHandle
    ? 'id,handle,name,description,hero_image,seo,updated_at,status,sort_mode,pod_collection_products(product_id,sort_order,featured,pod_products!inner(id,status))'
    : 'id,handle,name,description,hero_image,seo,updated_at,status,sort_mode,pod_collection_products(count)'
  let query = supabase.from('pod_collections').select(select).eq('status','PUBLISHED').order('updated_at',{ascending:false})
  if (requestedHandle) query = query.eq('handle',requestedHandle).limit(1)
  const { data, error } = await query
  if (error) return previewResult(fallback, error.message)
  const collections = (data || []).map(row => {
    const membership = requestedHandle ? (row.pod_collection_products || []) : []
    const links = membership
      .filter(item => !item.pod_products || item.pod_products.status === 'PUBLISHED')
      .sort((a,b) => a.sort_order - b.sort_order || String(a.product_id).localeCompare(String(b.product_id)))
    const publicCount = requestedHandle
      ? links.length
      : Number(row.pod_collection_products?.[0]?.count || 0)
    return {
      ...row,
      hero:row.hero_image,
      sort:row.sort_mode,
      products:links.map(item => item.product_id),
      productLinks:links.map(item => ({ productId:item.product_id, sortOrder:item.sort_order, featured:Boolean(item.featured) })),
      // `count` is deliberately the public count. Keep `publishedCount` as an
      // explicit field so cards and metadata cannot accidentally use a raw
      // membership count later.
      count:publicCount,
      publishedCount:publicCount
    }
  })
  const visible = requestedHandle ? collections : collections.filter(row => Number(row.publishedCount || 0) > 0)
  return { data:visible.length ? visible : (requestedHandle ? fallback : []), source:visible.length ? 'supabase' : requestedHandle ? 'preview' : 'supabase', error:null }
}

export async function fetchStorefrontTheme(fallback = null) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase.from('pod_themes').select('*, pod_pages(*)').eq('status','PUBLISHED').order('updated_at',{ascending:false}).limit(1).maybeSingle()
  if (error || !data) return previewResult(fallback, error?.message || 'No published theme was returned.')
  const definition = data.definition && typeof data.definition === 'object' ? data.definition : {}
  const pageRows = data.pod_pages?.length
    ? data.pod_pages
    : definition.pages?.length
      ? definition.pages
      : fallback?.pages || adminTheme.pages
  const persistedBlocks = definition.blocks || data.blocks || fallback?.blocks || []
  return {
    data: {
      ...(fallback || {}),
      ...data,
      ...definition,
      tokens: { ...(adminTheme.tokens || {}), ...(fallback?.tokens || {}), ...(data.tokens || {}) },
      blocks: mergeThemeBlocks(persistedBlocks),
      content: { ...(fallback?.content || {}), ...(definition.content || {}), ...(data.content || {}) },
      pageSettings: { ...(fallback?.pageSettings || {}), ...(definition.pageSettings || {}), ...(data.pageSettings || {}) },
      pages: normalizeThemePages(pageRows)
    },
    source: 'supabase',
    error: null
  }
}

// Keep the catalogue projection deliberately small.  The editor hydrates one
// listing with the complete JSON/media/options payload when it is opened; the
// catalogue only needs the fields used by filters, rows and overview cards.
// Fetching `seo`, `media`, `custom_fields` and every variant here made a large
// imported catalogue hit PostgREST's statement/response timeout before the
// Admin shell could render.
const ADMIN_PRODUCT_SUMMARY_FIELDS = [
  'id', 'handle', 'title', 'subtitle', 'description', 'price', 'compare_at',
  'status', 'badge', 'type', 'template_id', 'template_version', 'image',
  'color', 'artwork_lock', 'personalization', 'inventory', 'sku', 'tags',
  'product_group', 'taxonomy', 'seo_status', 'seo_quality_score', 'seo_block_reasons',
  'seo_reviewed_at', 'seo_published_at', 'created_at', 'updated_at'
].join(',')

const ADMIN_PRODUCT_LEGACY_FIELDS = [
  'id', 'handle', 'title', 'subtitle', 'description', 'price', 'compare_at',
  'status', 'badge', 'type', 'template_id', 'image', 'color', 'artwork_lock',
  'personalization', 'inventory', 'seo', 'created_at', 'updated_at'
].join(',')

const ADMIN_PRODUCT_PAGE_SIZE = 1000
// Keep the progressive Admin catalogue bounded, but do not stop below the
// current live catalogue (31k+ listings).  The previous 100-page cap silently
// truncated every catalogue over 20,000 rows and made the control room report
// a transport/timeout error even when Supabase was healthy.
const ADMIN_PRODUCT_MAX_PAGES = 200

async function fetchAdminProductPages(fields, includeVariantCount = false, { onPage, onError, progressive = false } = {}) {
  const select = includeVariantCount
    ? `${fields},active_variants:pod_product_variants(count),draft_variants:pod_product_variants(count)`
    : fields
  // Offset pagination becomes progressively slower on the imported catalogue
  // and starts hitting PostgREST's statement timeout around row 20k. Use a
  // stable keyset cursor instead: each page starts after the last
  // `updated_at,id` pair that was returned by the previous page.
  const readPage = async (page, cursor = null, { withVariantCounts = includeVariantCount } = {}) => {
    const projection = withVariantCounts
      ? select
      : fields
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let query = supabase.from('pod_products').select(projection, page === 0 ? { count: 'exact' } : undefined)
      if (withVariantCounts) query = query.eq('active_variants.status', 'ACTIVE').eq('draft_variants.status', 'DRAFT')
      if (cursor?.updatedAt && cursor?.id) {
        const updatedAt = String(cursor.updatedAt).replace(/[(),]/g, '')
        const id = String(cursor.id).replace(/[(),]/g, '')
        query = query.or(`updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.gt.${id})`)
      }
      const { data, error, count } = await query
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(0, ADMIN_PRODUCT_PAGE_SIZE - 1)
      if (!error) {
        const rows = Array.isArray(data) ? data : []
        const last = rows[rows.length - 1]
        return {
          rows,
          total: Number.isInteger(count) ? count : null,
          cursor: last?.updated_at && last?.id ? { updatedAt:last.updated_at, id:last.id } : null
        }
      }
      if (attempt === 2) throw new Error(`Catalogue page ${page + 1}: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }

  const normalizeSummaryPage = (rows, withVariantCounts = includeVariantCount) => rows.map(row => {
    const countOf = key => withVariantCounts && Array.isArray(row[key]) && row[key][0]?.count != null ? Number(row[key][0].count) : null
    const normalized = normalizeProduct({
      ...row,
      pod_product_variants: [],
      _variantCount: countOf('active_variants'),
      _draftVariantCount: countOf('draft_variants'),
      _catalogSummary: true
    })
    return normalized
  })

  // Read in small windows. A single `select('*', deep joins)` over a large
  // imported catalogue routinely exceeds PostgREST's statement/response
  // budget. The cursor keeps each request bounded while the 1,000-row page
  // keeps the full 30k+ catalogue load to a few dozen requests.
  const first = await readPage(0)
  const firstPage = normalizeSummaryPage(first.rows, includeVariantCount)
  const total = first.total
  const firstDone = firstPage.length < ADMIN_PRODUCT_PAGE_SIZE || total != null && firstPage.length >= total
  onPage?.(firstPage, { page: 0, loaded: firstPage.length, total, done: firstDone })
  if (firstDone) return firstPage

  const loadRemaining = async () => {
    const rows = []
    let page = 1
    let cursor = first.cursor
    let withVariantCounts = includeVariantCount
    while (page < ADMIN_PRODUCT_MAX_PAGES && cursor) {
      let result
      try {
        result = await readPage(page, cursor, { withVariantCounts })
      } catch (error) {
        // Variant relation counts are useful for the first catalogue page but
        // become too expensive deep in a large imported catalogue. Retry the
        // same cursor with the lean listing projection and keep the rest of
        // the stream in that mode instead of turning one slow page into a
        // global Admin timeout/banner.
        if (!withVariantCounts) throw error
        withVariantCounts = false
        result = await readPage(page, cursor, { withVariantCounts:false })
      }
      const chunk = normalizeSummaryPage(result.rows, withVariantCounts)
      rows.push(...chunk)
      const loaded = firstPage.length + rows.length
      const reachedEnd = chunk.length < ADMIN_PRODUCT_PAGE_SIZE || total != null && loaded >= total
      onPage?.(chunk, { page, loaded, total, done:reachedEnd })
      if (reachedEnd) return rows
      if (!result.cursor || result.cursor.id === cursor.id && result.cursor.updatedAt === cursor.updatedAt) {
        throw new Error(`Catalogue cursor did not advance after page ${page + 1}.`)
      }
      cursor = result.cursor
      page += 1
    }
    if (total != null && firstPage.length + rows.length < total) throw new Error(`Catalogue stopped at ${firstPage.length + rows.length} of ${total} products.`)
    if (page >= ADMIN_PRODUCT_MAX_PAGES) throw new Error(`Catalogue exceeded ${ADMIN_PRODUCT_MAX_PAGES * ADMIN_PRODUCT_PAGE_SIZE} products.`)
    return rows
  }

  // Once the first 1,000 rows are available, continue in bounded windows. In
  // progressive mode the caller receives the first page now and the rest is
  // intentionally detached from the initial Admin render.
  if (progressive) {
    loadRemaining().catch(error => {
      onError?.(error)
    })
    return { firstPage, total }
  }
  return [...firstPage, ...(await loadRemaining())]
}

export async function fetchAdminProduct(productId) {
  if (!supabase) return { data: null, source: 'error', error: 'Supabase is not configured.' }
  try {
    let result = await supabase
      .from('pod_products')
      .select('*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))')
      .eq('id', productId)
      .maybeSingle()
    if (result.error) {
      result = await supabase
        .from('pod_products')
        .select('*, pod_product_variants(*)')
        .eq('id', productId)
        .maybeSingle()
    }
    if (result.error || !result.data) return { data: null, source: 'preview', error: result.error?.message || 'Listing was not found.' }
    return { data: normalizeProduct(result.data), source: 'supabase', error: null }
  } catch (err) {
    return { data: null, source: 'preview', error: err instanceof Error ? err.message : 'Product query failed.' }
  }
}

export async function fetchAdminProducts({ onPage, onError } = {}) {
  if (!supabase) return { data: adminProducts, source: 'error', error: 'Supabase is not configured.' }
  try {
    // `onPage` opts into progressive loading.  The first page is returned as
    // soon as it is available; subsequent pages are emitted by the same
    // bounded loader and can be merged into the Admin table without blocking
    // the control-room shell.
    const result = await fetchAdminProductPages(ADMIN_PRODUCT_SUMMARY_FIELDS, true, { onPage, onError, progressive: Boolean(onPage) })
    const data = Array.isArray(result) ? result : result.firstPage
    return { data, total: Array.isArray(result) ? data.length : result.total, source: 'supabase', error: null }
  } catch (err) {
    // Keep older projects usable when the additive listing migration has not
    // been applied yet. This legacy projection is still paginated and avoids
    // the expensive nested `*` query that caused the timeout.
    console.warn('Optimized admin product query failed, trying legacy projection:', err instanceof Error ? err.message : err)
    try {
      const result = await fetchAdminProductPages(ADMIN_PRODUCT_LEGACY_FIELDS, false, { onPage, onError, progressive: Boolean(onPage) })
      const data = Array.isArray(result) ? result : result.firstPage
      return { data, total: Array.isArray(result) ? data.length : result.total, source: 'supabase', error: null }
    } catch (legacyError) {
      onError?.(legacyError)
      return { data: [], source: 'error', error: legacyError instanceof Error ? legacyError.message : 'Product query failed.' }
    }
  }
}

export async function saveAdminProduct(product) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured. Nothing was saved.' }
  const errors = validateListing(product)
  if (errors.length) return { data:null, source:'error', error:errors.join(' ') }
  const { data, error } = await supabase.rpc('pod_save_listing', {
    listing: buildListingInput(product), expected_updated_at: product._persisted ? product.updatedAt : null
  })
  if (error) return { data:null, source:'error', error:error.code === 'PGRST202' ? 'Listing migration is not installed. Apply 202609160001_listing_workspace.sql before saving. Nothing was saved.' : error.message }
  return { data:normalizeProduct(data), source:'supabase', error:null }
}

export async function deleteAdminProduct(productId) {
  if (!productId) return { error: 'Listing ID is required.', source: 'error' }
  if (!supabase) return { error: null, source: 'preview' }

  const { error: rpcError } = await supabase.rpc('pod_delete_listing', { target_id: productId })
  if (!rpcError) return { error: null, source: 'supabase' }

  try {
    await Promise.allSettled([
      supabase.from('pod_collection_products').delete().eq('product_id', productId),
      supabase.from('pod_product_revisions').delete().eq('product_id', productId),
      supabase.from('pod_product_variants').delete().eq('product_id', productId)
    ])
    await supabase.from('pod_product_options').delete().eq('product_id', productId)
    const { data, error } = await supabase.from('pod_products').delete().eq('id', productId).select('id')
    if (error) return { error: error.message, source: 'supabase' }
    if (!data?.length) return { error:'The listing was not deleted. Your admin session may have expired or the listing no longer exists.', source:'supabase' }
    return { error: null, source: 'supabase' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Delete failed.', source: 'supabase' }
  }
}

const mediaTypes = new Map([
  ['image/jpeg','IMAGE'], ['image/png','IMAGE'], ['image/webp','IMAGE'], ['image/avif','IMAGE'],
  ['video/mp4','VIDEO'], ['video/webm','VIDEO']
])

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  return `data:${file.type};base64,${btoa(binary)}`
}

export async function uploadProductMedia(file, productId) {
  if (!supabase) throw new Error('Supabase is not configured. Media was not uploaded.')
  const type = mediaTypes.get(file?.type)
  if (!type) throw new Error('Use JPG, PNG, WebP, AVIF, MP4 or WebM files.')
  const sizeLimit = type === 'VIDEO' ? 80 * 1024 * 1024 : 15 * 1024 * 1024
  if (!file.size || file.size > sizeLimit) throw new Error(`${type === 'VIDEO' ? 'Video' : 'Image'} must be smaller than ${sizeLimit / 1024 / 1024} MB.`)
  if (type === 'IMAGE') {
    const { data:{ session }, error:sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) throw new Error('Your admin session expired. Sign in again before uploading media.')
    const response = await apiFetch('/api/admin-product-upload', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify({ productId, filename:file.name, dataUrl:await fileToDataUrl(file) })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'The optimized image upload failed.')
    return result.media
  }
  const extension = (file.name.split('.').pop() || (type === 'VIDEO' ? 'mp4' : 'webp')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeName = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'media'
  const id = globalThis.crypto.randomUUID()
  const path = `${String(productId).replace(/[^a-zA-Z0-9-]/g, '-')}/${id}-${safeName}.${extension}`
  const { error } = await supabase.storage.from('product-media').upload(path, file, { contentType:file.type, cacheControl:'31536000', upsert:false })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('product-media').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('The upload finished but no public media URL was returned.')
  return { id:`media-${id}`, type, url:data.publicUrl, path, filename:file.name, alt:'', createdAt:new Date().toISOString() }
}

// Bridge uploads deliberately use a content-addressed path.  A retry after a
// tab reload therefore reuses the same Storage object instead of creating a
// second randomly-named file.
export async function uploadBridgeMedia(file, productId, sha256, { alt = '', filename = '' } = {}) {
  if (!supabase) throw new Error('Supabase is not configured. Media was not uploaded.')
  const type = mediaTypes.get(file?.type)
  if (type !== 'IMAGE') throw new Error('POD Bridge accepts JPG, PNG, WebP or AVIF images only.')
  if (!file?.size || file.size > 15 * 1024 * 1024) throw new Error('Each bridge image must be smaller than 15 MB.')
  if (!/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) throw new Error('A valid SHA-256 is required for bridge media.')
  const extension = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/avif':'avif' })[file.type] || 'img'
  const safeProductId = String(productId).replace(/[^a-zA-Z0-9-]/g, '-')
  const path = `${safeProductId}/bridge/${String(sha256).toLowerCase()}`
  const { error } = await supabase.storage.from('product-media').upload(path, file, {
    contentType: file.type, cacheControl: '31536000', upsert: false
  })
  // Storage returns a conflict when a previous attempt already uploaded this
  // hash.  The public URL is deterministic, so that conflict is safe to reuse.
  if (error && String(error.statusCode || error.status || '') !== '409' && !/already exists|duplicate|conflict|409/i.test(error.message || '')) throw new Error(error.message)
  const { data } = supabase.storage.from('product-media').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('The bridge upload finished but no public media URL was returned.')
  return {
    id: `bridge-media-${String(sha256).slice(0, 16)}`,
    type: 'IMAGE', url: data.publicUrl, path,
    filename: filename || file.name || `bridge.${extension}`, alt,
    createdAt: new Date().toISOString()
  }
}

export async function requestAiListingCopy(product, brief = {}) {
  if (!supabase) throw new Error('Supabase is not configured. AI copy needs an authenticated admin session.')
  const { data:{ session }, error:sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error('Your admin session expired. Sign in again before using AI.')
  const response = await apiFetch('/api/ai-listing-copy', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify({
      product:{
        title:product.title, subtitle:product.subtitle, description:product.description, type:product.type,
        productGroup:product.productGroup, taxonomy:product.taxonomy || {}, tags:product.tags, image:product.image,
        seo:{
          title:product.seo?.title || '', description:product.seo?.description || '',
          primaryKeyword:product.seo?.primaryKeyword || '',
          secondaryKeywords:Array.isArray(product.seo?.secondaryKeywords) ? product.seo.secondaryKeywords : [],
          valueProps:Array.isArray(product.seo?.valueProps) ? product.seo.valueProps : [],
          differentiators:Array.isArray(product.seo?.differentiators) ? product.seo.differentiators : []
        },
        media:(product.media || []).slice(0,12).map(item => ({ type:item.type, url:item.url, alt:item.alt, role:item.role || item.mediaRole })),
        contentBlocks:(product.contentBlocks || []).slice(0,12).map(block => ({ type:block.type, content:block.content, mediaRole:block.mediaRole })),
        customFields:(product.customFields || []).map(field => field.label)
      },
      brief
    })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    // If the provider timed out on image download, silently retry once in ultra-fast text-only mode
    if ((response.status === 504 || /too long|timeout|timed out/i.test(result.error || '')) && !brief.skipVision) {
      return requestAiListingCopy(product, { ...brief, skipVision: true })
    }
    throw new Error(result.error || 'AI copy could not be generated.')
  }
  return result
}

// Full review uses the same authenticated, server-only AI writer but asks it
// to inspect every text block and every public listing image. Keeping this as
// a named operation makes the admin intent explicit and leaves the ordinary
// copy draft flow lightweight.
export async function requestAiListingReview(product, brief = {}) {
  return requestAiListingCopy(product, { ...brief, reviewMode:'FULL_AUDIT' })
}

export async function requestAiListingMedia(product, slot, direction = '') {
  if (!supabase) throw new Error('Supabase is not configured. Editorial image generation needs an authenticated admin session.')
  const { data:{ session }, error:sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error('Your admin session expired. Sign in again before generating media.')
  const response = await apiFetch('/api/ai-listing-media', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify({ productId:product.id, slot, direction:String(direction || '').slice(0,500) })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Editorial image generation failed.')
  if (!result.media?.url) throw new Error('The generated image did not return a usable URL.')
  return result
}

export async function fetchProductVariants(productId) {
  const fallback = adminProductOptions[productId] || { options: [], variants: [] }
  if (!supabase) return previewResult(fallback)
  const [{ data: options, error: optionError }, { data: variants, error: variantError }] = await Promise.all([
    supabase.from('pod_product_options').select('*, pod_product_option_values(*)').eq('product_id', productId).order('sort_order'),
    supabase.from('pod_product_variants').select('*').eq('product_id', productId).order('created_at')
  ])
  if (optionError || variantError || (!options?.length && !variants?.length)) return previewResult(fallback, optionError?.message || variantError?.message || null)
  return {
    data: {
      options: (options || []).map(option => ({ name: option.name, values: (option.pod_product_option_values || []).sort((a, b) => a.sort_order - b.sort_order).map(value => value.label) })),
      variants: (variants || []).map(variant => ({ ...variant, values: variant.option_values || {}, compareAt: variant.compare_at, weightGrams:variant.weight_grams }))
    },
    source: 'supabase', error: null
  }
}

export async function fetchAdminTheme() {
  if (!supabase) return previewResult(adminTheme)
  try {
    const [{ data: theme, error: themeError }, { data: pages, error: pagesError }] = await Promise.all([
      supabase.from('pod_themes').select('*').eq('id', adminTheme.id).maybeSingle(),
      supabase.from('pod_pages').select('*').eq('theme_id', adminTheme.id).order('updated_at', { ascending: false })
    ])
    if (themeError || !theme) return previewResult(adminTheme, themeError?.message || null)
    const definition = theme.definition && typeof theme.definition === 'object' ? theme.definition : {}
    return {
      data: {
        ...adminTheme,
        ...theme,
        updatedAt: theme.updated_at,
        tokens: { ...adminTheme.tokens, ...(theme.tokens || {}) },
        blocks:mergeThemeBlocks(definition.blocks || theme.blocks || []),
        content:definition.content || theme.content || {},
        pageSettings:definition.pageSettings || theme.pageSettings || {},
        pages: pagesError || !pages?.length ? normalizeThemePages(definition.pages || adminTheme.pages) : normalizeThemePages(pages.map(page => ({ ...page, sections: Array.isArray(page.layout) ? page.layout.length : Number(page.sections || 0), updatedAt: page.updated_at, layout:page.layout })))
      },
      source: 'supabase', error: pagesError?.message || null
    }
  } catch (err) {
    console.warn('fetchAdminTheme error, using fallback:', err.message)
    return previewResult(adminTheme, err.message)
  }
}

export async function saveAdminTheme(theme) {
  if (!supabase) return previewResult(theme)
  const payload = { ...theme, status:theme.status || 'DRAFT', version:theme.version || 'v1.0', tokens:theme.tokens || {}, blocks:theme.blocks || [], content:theme.content || {}, pageSettings:theme.pageSettings || {}, pages:theme.pages || [] }
  const { data, error } = await supabase.rpc('pod_save_theme', { theme_payload:payload })
  if (error) return { data:theme, source:'error', error:error.code === 'PGRST202' ? 'Storefront runtime migration is not installed. Nothing was saved.' : error.message }
  return { data, source: 'supabase', error: null }
}

export async function fetchAdminMenus() {
  if (!supabase) return previewResult(adminMenus)
  try {
    const { data, error } = await supabase.from('pod_menus').select('*, pod_menu_items(*)').order('updated_at', { ascending: false })
    if (error || !data?.length) return previewResult(adminMenus, error?.message || null)
    const rows = data.map(menu => {
      const all = (menu.pod_menu_items || []).sort((a, b) => a.sort_order - b.sort_order)
      return { ...menu, location: menu.location, updatedAt: menu.updated_at, items: buildMenuTree(all) }
    })
    return { data: rows, source: 'supabase', error: null }
  } catch (err) {
    console.warn('fetchAdminMenus error, using fallback:', err.message)
    return previewResult(adminMenus, err.message)
  }
}

export async function saveAdminMenus(menus) {
  if (!supabase) return previewResult(menus)
  // The legacy menu RPC silently drops media fields. Probe the additive
  // column first so the Admin never reports a successful save that cannot
  // round-trip representative-image overrides.
  const { error: capabilityError } = await supabase.from('pod_menu_items').select('image_mode').limit(1)
  if (capabilityError) return { data:menus, source:'error', error:'Menu media migration is not installed. Apply 20260920_menu_navigation_media.sql before saving navigation.' }
  const normalize = (items = [], parentId = null) => items.map((item, index) => ({
    ...item,
    parentId,
    sortOrder:index,
    imageMode:item.imageMode || item.image_mode || 'AUTO',
    imageUrl:item.imageUrl || item.image_url || '',
    imageAlt:item.imageAlt || item.image_alt || '',
    children:normalize(item.children || [], item.id)
  }))
  const payload = menus.map(menu => ({ ...menu, location:menu.location, items:normalize(menu.items || []) }))
  const { data, error } = await supabase.rpc('pod_save_menus', { menu_payload:payload })
  if (error) return { data:menus, source:'error', error:error.code === 'PGRST202' ? 'Storefront runtime migration is not installed. Nothing was saved.' : error.message }
  return { data, source:'supabase', error:null }
}

function catalogDeletePath(path) {
  const route = String(path || '').trim().split(/[?#]/)[0].replace(/\/+$/, '')
  if (!catalogPageRouteCanDeleteProducts(route)) throw new Error('Only a league, team, team-product or category catalog page can delete matching listings.')
  return route
}

export async function inspectAdminCatalogPageDeletion(path) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured.' }
  let route
  try { route = catalogDeletePath(path) }
  catch (error) { return { data:null, source:'error', error:error.message } }
  try {
    let request = supabase.from('pod_products').select('id', { count:'exact', head:true })
    request = applyStorefrontRouteFilters(request, { basePath:route })
    const { count, error } = await request
    if (error) return { data:null, source:'supabase', error:error.message }
    return { data:{ path:route, count:Number(count || 0) }, source:'supabase', error:null }
  } catch (error) {
    return { data:null, source:'supabase', error:error instanceof Error ? error.message : 'Could not inspect this catalog page.' }
  }
}

async function catalogPageProductIds(path) {
  const ids = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    let request = supabase.from('pod_products').select('id').order('id', { ascending:true })
    request = applyStorefrontRouteFilters(request, { basePath:path })
    const { data, error } = await request.range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    ids.push(...(data || []).map(row => row.id).filter(Boolean))
    if (!data || data.length < pageSize) return ids
  }
}

export async function deleteAdminCatalogPageProducts(path, expectedCount, { onProgress } = {}) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured. Nothing was deleted.' }
  let route
  try { route = catalogDeletePath(path) }
  catch (error) { return { data:null, source:'error', error:error.message } }
  try {
    const ids = await catalogPageProductIds(route)
    const expected = Number(expectedCount)
    if (!Number.isInteger(expected) || expected < 0 || ids.length !== expected) {
      return { data:{ path:route, count:ids.length, deletedIds:[] }, source:'supabase', error:`Safety check failed: ${ids.length} matching listings were found, but ${Number.isFinite(expected) ? expected : 'no valid count'} were confirmed. Review the page and try again.` }
    }
    const deletedIds = []
    const failures = []
    const concurrency = 6
    for (let offset = 0; offset < ids.length; offset += concurrency) {
      const chunk = ids.slice(offset, offset + concurrency)
      const results = await Promise.all(chunk.map(async id => ({ id, result:await deleteAdminProduct(id) })))
      results.forEach(({ id, result }) => result.error ? failures.push({ id, error:result.error }) : deletedIds.push(id))
      onProgress?.({ processed:Math.min(ids.length, offset + chunk.length), total:ids.length, deleted:deletedIds.length, failed:failures.length })
      if (failures.length) break
    }
    if (failures.length) return { data:{ path:route, count:ids.length, deletedIds, failures }, source:'supabase', error:`Deletion stopped after ${deletedIds.length} listings because ${failures[0].id} failed: ${failures[0].error}` }
    return { data:{ path:route, count:ids.length, deletedIds, failures:[] }, source:'supabase', error:null }
  } catch (error) {
    return { data:null, source:'supabase', error:error instanceof Error ? error.message : 'Catalog page deletion failed.' }
  }
}

const ADMIN_COLLECTION_CATALOG_FIELDS = [
  'id', 'handle', 'title', 'subtitle', 'status', 'type', 'image', 'sku', 'tags',
  'product_group', 'taxonomy', 'custom_fields', 'personalization', 'seo_status', 'updated_at'
].join(',')

function safeCollectionSearch(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}\s._\/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

export async function fetchAdminCollectionCatalog({ page = 1, pageSize = 50, search = '', status = 'ALL', seoStatus = 'ALL', productGroup = 'ALL', productType = 'ALL', category = 'ALL', accessoryFamily = 'ALL', accessoryType = 'ALL', basePath = '', collectionId = '' } = {}) {
  if (!supabase) return { data:[], total:0, page:1, pageSize, source:'error', error:'Supabase is not configured.' }
  const safePageSize = Math.max(20, Math.min(100, Number(pageSize) || 50))
  const safePage = Math.max(1, Number(page) || 1)
  const from = (safePage - 1) * safePageSize
  const term = safeCollectionSearch(search)
  try {
    // Collection assignment reads run through a server endpoint first.  The
    // browser's anon/RLS join can scan the whole membership relation and hit
    // statement_timeout even when the requested page is only 50 products.
    // The endpoint uses the service role strictly on the server and returns
    // the same lean card projection; keep the direct query below as a safe
    // compatibility fallback for local/preview environments.
    if (collectionId) {
      try {
        const params = new URLSearchParams({
          mode:'catalog',
          collectionId:String(collectionId),
          page:String(safePage),
          pageSize:String(safePageSize),
          search:String(search || ''),
          status:String(status || 'ALL'),
          seoStatus:String(seoStatus || 'ALL'),
          productGroup:String(productGroup || 'ALL'),
          productType:String(productType || 'ALL'),
          category:String(category || 'ALL'),
          accessoryFamily:String(accessoryFamily || 'ALL'),
          accessoryType:String(accessoryType || 'ALL')
        })
        const result = await adminApi(`/api/admin-collections?${params.toString()}`)
        if (Array.isArray(result?.products)) {
          return {
            data:result.products.map(row => normalizeProduct({ ...row, pod_product_variants:[], _catalogSummary:true })),
            total:Number.isInteger(result.total) ? result.total : result.products.length,
            page:Number(result.page) || safePage,
            pageSize:Number(result.pageSize) || safePageSize,
            source:'supabase', error:null
          }
        }
      } catch (serverError) {
        console.warn('Admin collection catalogue server route unavailable; using client fallback:', serverError.message)
      }
    }
    const assignedCollectionId = String(collectionId || '').trim()
    const projection = assignedCollectionId
      ? `${ADMIN_COLLECTION_CATALOG_FIELDS},collection_membership:pod_collection_products!inner(collection_id)`
      : ADMIN_COLLECTION_CATALOG_FIELDS
    let request = supabase.from('pod_products').select(projection, { count:'exact' })
    if (basePath) request = applyStorefrontRouteFilters(request, { basePath })
    if (assignedCollectionId) request = request.eq('collection_membership.collection_id', assignedCollectionId)
    if (term) request = request.or(`title.ilike.*${term}*,handle.ilike.*${term}*,sku.ilike.*${term}*,type.ilike.*${term}*,product_group.ilike.*${term}*`)
    if (String(status).toUpperCase() !== 'ALL') request = request.eq('status', String(status).toUpperCase())
    if (String(seoStatus).toUpperCase() !== 'ALL') request = request.eq('seo_status', String(seoStatus).toUpperCase())
    if (productGroup && productGroup !== 'ALL') request = request.eq('product_group', productGroup)
    if (productType && productType !== 'ALL') request = request.eq('type', productType)
    if (category && category !== 'ALL') request = request.eq('taxonomy->>category', category)
    if (accessoryFamily && accessoryFamily !== 'ALL') request = request.eq('taxonomy->>accessoryCategory', accessoryFamily)
    if (accessoryType && accessoryType !== 'ALL') request = request.eq('taxonomy->>accessoryType', accessoryType)
    // Sorting a 30k+ row relation by the unindexed title column makes
    // PostgREST scan and sort the entire catalogue before it can return the
    // first page (and routinely hits statement_timeout on /sports). The
    // listing table is indexed for updated_at/id, which keeps every Admin
    // catalogue page bounded. Search/filter semantics are unchanged.
    const { data, count, error } = await request
      .order('updated_at', { ascending:false })
      .order('id', { ascending:true })
      .range(from, from + safePageSize - 1)
    if (error) return { data:[], total:0, page:safePage, pageSize:safePageSize, source:'error', error:error.message }
    return {
      data:(data || []).map(row => normalizeProduct({ ...row, pod_product_variants:[], _catalogSummary:true })),
      total:Number.isInteger(count) ? count : (data || []).length,
      page:safePage, pageSize:safePageSize, source:'supabase', error:null
    }
  } catch (error) {
    return { data:[], total:0, page:safePage, pageSize:safePageSize, source:'error', error:error instanceof Error ? error.message : 'Collection catalogue query failed.' }
  }
}

export async function previewAdminCollectionAutomation(collectionId, rules, sampleLimit = 40) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured.' }
  const automation = normalizeCollectionAutomation(rules)
  if (!collectionAutomationHasConditions(automation)) return { data:null, source:'error', error:'Add at least one automatic condition before previewing.' }
  const { data, error } = await supabase.rpc('pod_preview_collection_automation', {
    target_collection_id:collectionId,
    requested_rules:automation,
    requested_sample_limit:Math.max(1, Math.min(100, Number(sampleLimit) || 40))
  })
  if (error) return { data:null, source:'error', error:error.code === 'PGRST202' ? 'Collection automation migration is not installed.' : error.message }
  return { data, source:'supabase', error:null }
}

export async function applyAdminCollectionAutomation(collectionId, rules) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured.' }
  const automation = normalizeCollectionAutomation(rules)
  if (!collectionAutomationHasConditions(automation)) return { data:null, source:'error', error:'Add at least one automatic condition before applying.' }
  const { data, error } = await supabase.rpc('pod_apply_collection_automation', {
    target_collection_id:collectionId,
    requested_rules:automation
  })
  if (error) return { data:null, source:'error', error:error.code === 'PGRST202' ? 'Collection automation migration is not installed.' : error.message }
  return { data, source:'supabase', error:null }
}

const ADMIN_COLLECTION_FIELDS = 'id,handle,name,description,status,hero_image,sort_mode,seo,automation,created_at,updated_at'
const ADMIN_COLLECTION_LINK_FIELDS = 'collection_id,product_id,sort_order,featured,pod_products(status)'
const ADMIN_COLLECTION_LINK_FIELDS_LEGACY = 'collection_id,product_id,sort_order,featured'
// Do not request a nested relation count from the browser on the initial
// Collections load.  The public/anon RLS policy has to evaluate every row in
// pod_collection_products for that relation and Supabase can cancel the
// statement before the Admin shell deadline.  Metadata is enough to render
// the tree; membership (and the exact count) is hydrated when a collection is
// opened or a bulk operation explicitly needs it.
const ADMIN_COLLECTION_METADATA_FIELDS = ADMIN_COLLECTION_FIELDS
// Kept as a named projection for callers/tests that still need an explicit
// count query in a trusted/server context.  It is intentionally not used by
// the default browser load above.
const ADMIN_COLLECTION_COUNT_FIELDS = `${ADMIN_COLLECTION_FIELDS},pod_collection_products(count)`

function collectionStatusFromLink(row) {
  const relation = Array.isArray(row?.pod_products) ? row.pod_products[0] : row?.pod_products
  return String(relation?.status || row?.product_status || '').toUpperCase()
}

async function fetchCollectionLinks(fields, collectionIds = []) {
  const pageSize = 1000
  const ids = [...new Set(collectionIds.map(value => String(value || '').trim()).filter(Boolean))]
  if (!ids.length) return { links:[], total:0 }

  // The membership table is large and an unscoped offset query starts timing
  // out after roughly 20k rows. Load each collection independently with a
  // product-id cursor, then merge the bounded result sets. Eight workers keep
  // the Admin load fast without opening an unbounded number of requests.
  const loadCollection = async collectionId => {
    const rows = []
    let cursor = ''
    let page = 0
    for (;;) {
      // Do not request an exact count for every collection. Sixty-five count
      // plans add enough database work to push the otherwise bounded loader
      // beyond Admin's UI deadline. A short final page is the cursor's natural
      // completion signal and also works for collections over 1,000 members.
      let request = supabase.from('pod_collection_products').select(fields).eq('collection_id', collectionId)
      if (cursor) request = request.gt('product_id', cursor)
      const result = await request.order('product_id').range(0, pageSize - 1)
      if (result.error) throw result.error
      const chunk = Array.isArray(result.data) ? result.data : []
      rows.push(...chunk)
      if (!chunk.length || chunk.length < pageSize) break
      const next = String(chunk[chunk.length - 1]?.product_id || '').trim()
      if (!next || next === cursor) throw new Error(`Collection ${collectionId} membership cursor did not advance.`)
      cursor = next
      page += 1
    }
    return rows
  }

  const links = []
  let nextIndex = 0
  const worker = async () => {
    for (;;) {
      const index = nextIndex++
      if (index >= ids.length) return
      links.push(...await loadCollection(ids[index]))
    }
  }
  await Promise.all(Array.from({ length:Math.min(8, ids.length) }, () => worker()))
  links.sort((a,b) => String(a.collection_id).localeCompare(String(b.collection_id)) || String(a.product_id).localeCompare(String(b.product_id)))
  return { links, total:links.length }
}

function normalizeAdminCollection(collection, members = [], { membershipLoaded = false, hasProductStatus = false, count = null } = {}) {
  const links = Array.isArray(members) ? members : []
  const byStatus = hasProductStatus ? links.filter(item => collectionStatusFromLink(item) === 'PUBLISHED').length : null
  const seo = collection.seo && typeof collection.seo === 'object' ? collection.seo : {}
  const parentId = String(seo.parentId || seo.parent_id || '').trim()
  const memberCount = membershipLoaded
    ? links.length
    : count == null
      ? null
      : Number.isFinite(Number(count)) ? Number(count) : null
  return {
    ...collection,
    seo,
    parentId:parentId && parentId !== collection.id ? parentId : '',
    hero:collection.hero_image,
    sort:collection.sort_mode,
    automation:normalizeCollectionAutomation(collection.automation),
    products:membershipLoaded ? links.map(item => item.product_id) : null,
    productLinks:membershipLoaded ? links.map(item => ({productId:item.product_id,sortOrder:Number(item.sort_order || 0),featured:Boolean(item.featured)})) : [],
    count:memberCount,
    publishedCount:membershipLoaded ? (hasProductStatus ? byStatus : memberCount) : null,
    membershipLoaded,
    updatedAt:collection.updated_at
  }
}

export async function fetchAdminCollectionMembership(collectionId) {
  const id = String(collectionId || '').trim()
  if (!id) return { data:null, source:'error', error:'Collection ID is required.' }
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured.' }
  try {
    // Hydrate one collection at a time through the authenticated server route.
    // This avoids the public RLS policy's nested product join and gives the
    // editor a deterministic completion signal even for large collections.
    try {
      const result = await adminApi(`/api/admin-collections?mode=membership&collectionId=${encodeURIComponent(id)}`)
      if (Array.isArray(result?.links)) {
        const links = result.links.slice().sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.product_id).localeCompare(String(b.product_id)))
        return {
          data:{ products:links.map(item => item.product_id), productLinks:links.map(item => ({productId:item.product_id,sortOrder:Number(item.sort_order || 0),featured:Boolean(item.featured)})), count:links.length, publishedCount:links.length, membershipLoaded:true },
          source:'supabase', error:null
        }
      }
    } catch (serverError) {
      console.warn('Admin collection membership server route unavailable; using client fallback:', serverError.message)
    }
    // Assignment editing only needs the link table.  Asking PostgREST to
    // join every linked product just to derive a live count is slow under the
    // public RLS policy and can leave the editor spinner running. Hydrate the
    // lean link projection first; the joined status projection remains a
    // compatibility fallback for projects that require it.
    let linkResult = await fetchCollectionLinks(ADMIN_COLLECTION_LINK_FIELDS_LEGACY, [id])
    let hasProductStatus = false
    if (linkResult.error) {
      linkResult = await fetchCollectionLinks(ADMIN_COLLECTION_LINK_FIELDS, [id])
      hasProductStatus = !linkResult.error && (linkResult.links || []).some(link => collectionStatusFromLink(link) !== '')
    }
    if (linkResult.error) return { data:null, source:'error', error:linkResult.error.message }
    const links = (linkResult.links || []).sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.product_id).localeCompare(String(b.product_id)))
    return { data:{ products:links.map(item => item.product_id), productLinks:links.map(item => ({productId:item.product_id,sortOrder:Number(item.sort_order || 0),featured:Boolean(item.featured)})), count:links.length, publishedCount:hasProductStatus ? links.filter(item => collectionStatusFromLink(item) === 'PUBLISHED').length : links.length, membershipLoaded:true }, source:'supabase', error:null }
  } catch (err) {
    return { data:null, source:'error', error:err instanceof Error ? err.message : 'Collection membership query failed.' }
  }
}

export async function fetchAdminCollections({ includeMembership = false } = {}) {
  if (!supabase) return previewResult(adminCollections)
  try {
    if (!includeMembership) {
      try {
        const result = await adminApi('/api/admin-collections?mode=metadata')
        if (Array.isArray(result?.collections)) {
          return {
            data:result.collections.map(collection => {
              const rawCount = Array.isArray(collection?.pod_collection_products)
                ? collection.pod_collection_products[0]?.count
                : collection?.pod_collection_products?.count
              const count = rawCount == null ? null : Number(rawCount)
              return normalizeAdminCollection(collection, [], { count:Number.isFinite(count) ? count : null })
            }),
            source:'supabase', error:null
          }
        }
      } catch (serverError) {
        console.warn('Admin collections server route unavailable; using client fallback:', serverError.message)
      }
    }
    // Keep this request small. The previous select('*') plus a second full
    // catalogue scan made Collections exceed the Admin 12 second deadline.
    // Relation counts are computed by PostgREST in one indexed request. Full
    // membership rows are intentionally opt-in; loading every link for every
    // collection blocks the control room even though the tree only needs
    // metadata until a collection is opened.
    // The relation-count projection is expensive under the public RLS policy
    // and is the source of the recurring "Collections timed out" banner.  A
    // metadata-only request is fast and deterministic; exact membership is
    // loaded per collection by fetchAdminCollectionMembership().
    const fields = includeMembership ? ADMIN_COLLECTION_FIELDS : ADMIN_COLLECTION_METADATA_FIELDS
    const { data, error } = await supabase.from('pod_collections').select(fields).order('updated_at', { ascending: false })
    if (error) return { data:[], source:'error', error:error.message }

    if (!includeMembership) {
      return {
        data:(data || []).map(collection => normalizeAdminCollection(collection, [], { count:null })),
        source:'supabase', error:null
      }
    }

    // Read product status through the existing foreign key in the membership
    // pages. This path is retained for explicit refreshes and bulk operations.
    const collectionIds = (data || []).map(collection => collection.id)
    let linkResult = await fetchCollectionLinks(ADMIN_COLLECTION_LINK_FIELDS_LEGACY, collectionIds)
    let hasProductStatus = false
    if (linkResult.error) {
      // Older projects may not expose the relationship in PostgREST yet. The
      // membership editor still works with the lean legacy projection.
      linkResult = await fetchCollectionLinks(ADMIN_COLLECTION_LINK_FIELDS, collectionIds)
      hasProductStatus = !linkResult.error && (linkResult.links || []).some(link => collectionStatusFromLink(link) !== '')
    }
    if (linkResult.error) return { data:[], source:'error', error:linkResult.error.message }

    const byCollection = new Map()
    ;(linkResult.links || []).forEach(link => byCollection.set(link.collection_id,[...(byCollection.get(link.collection_id) || []),link]))
    return {
      data: (data || []).map(collection => normalizeAdminCollection(collection, byCollection.get(collection.id) || [], { membershipLoaded:true, hasProductStatus })),
      source: 'supabase', error: null
    }
  } catch (err) {
    console.warn('fetchAdminCollections error:', err.message)
    return { data:[], source:'error', error:err.message }
  }
}

export async function saveAdminCollections(collections, originalCollections = []) {
  if (!supabase) return { data:collections, source:'error', error:'Live Supabase is not configured. Nothing was saved.' }
  let additions, removals
  try { ({additions,removals} = collectionMembershipDiff(collections,originalCollections)) }
  catch (error) { return { data:collections, source:'error', error:error.message } }
  const invalidAutomation = collections.find(row => normalizeCollectionAutomation(row.automation).enabled && !collectionAutomationHasConditions(row.automation))
  if (invalidAutomation) return { data:collections, source:'error', error:`${invalidAutomation.name}: add at least one condition before enabling automatic assignment.` }
  // Create/update metadata first, then attach destinations before detaching
  // sources. A failed move can leave a recoverable duplicate, never a lost link.
  for (const row of collections) {
    const parentId = String(row.parentId || row.parent_id || '').trim()
    const seo = { ...(row.seo && typeof row.seo === 'object' ? row.seo : {}) }
    if (parentId && parentId !== row.id) seo.parentId = parentId
    else delete seo.parentId
    const payload = {id:row.id,handle:row.handle,name:row.name,description:row.description || '',status:row.status || 'DRAFT',hero_image:row.hero || null,sort_mode:String(row.sort || 'MANUAL').toUpperCase().replace(/\s+/g,'_'),seo,automation:normalizeCollectionAutomation(row.automation),updated_at:new Date().toISOString()}
    const { error } = await supabase.from('pod_collections').upsert(payload,{onConflict:'id'})
    if (error) return { data:collections, source:'error', error:`${row.name}: ${error.message}` }
  }
  for (let index = 0; index < additions.length; index += 200) {
    const { error } = await supabase.from('pod_collection_products').upsert(additions.slice(index,index + 200),{onConflict:'collection_id,product_id'})
    if (error) return { data:collections, source:'error', error:`Adding listings failed: ${error.message}` }
  }
  for (const item of removals) {
    const { error } = await supabase.from('pod_collection_products').delete().eq('collection_id',item.collectionId).eq('product_id',item.productId)
    if (error) return { data:collections, source:'error', error:`Removing ${item.productId} failed: ${error.message}` }
  }
  if (collections.length) {
    const { data:{ user } = {} } = await supabase.auth.getUser().catch(() => ({ data:{} }))
    const auditRows = collections.map(row => ({ actor_id:user?.id || null, entity_type:'collection', entity_id:row.id, action:'SAVE_MEMBERSHIP', snapshot:{ collectionId:row.id, productCount:(row.products || []).length, additions:additions.filter(item => item.collection_id === row.id).map(item => item.product_id), removals:removals.filter(item => item.collectionId === row.id).map(item => item.productId) } }))
    const { error } = await supabase.from('pod_audit_logs').insert(auditRows)
    if (error) return { data:collections, source:'error', error:`Collection audit failed: ${error.message}` }
  }
  return { data:collections, source:'supabase', error:null }
}

export async function deleteAdminCollection(collectionId) {
  if (!collectionId) return { error:'Collection ID is required.', source:'error' }
  if (!supabase) return { error:'Live Supabase is not configured. Nothing was deleted.', source:'error' }
  try {
    const { data, error } = await supabase.from('pod_collections').delete().eq('id',collectionId).select('id')
    if (error) return { error:error.message, source:'supabase' }
    if (!data?.length) return { error:'Collection was not deleted. Your admin session may not have collection-delete permission, or it no longer exists.', source:'supabase' }
    return { data:data[0], error:null, source:'supabase' }
  } catch (error) {
    return { error:error instanceof Error ? error.message : 'Collection delete failed.', source:'supabase' }
  }
}

export async function uploadCollectionImage(file, collectionId) {
  if (!supabase) throw new Error('Supabase is not configured. The collection image was not uploaded.')
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP collection image.')
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Collection image must be smaller than 8 MB.')
  const { data:{ session }, error:sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) throw new Error('Your admin session expired. Sign in again before uploading an image.')
  const extension = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' })[file.type]
  const safeCollection = String(collectionId || 'collection').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,72) || 'collection'
  const safeName = String(file.name || 'cover').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,48) || 'cover'
  const path = `_collections/${safeCollection}/${globalThis.crypto.randomUUID()}-${safeName}.${extension}`
  const { error:uploadError } = await supabase.storage.from('product-media').upload(path, file, {
    contentType:file.type, cacheControl:'31536000', upsert:false
  })
  if (uploadError) throw new Error(uploadError.message)
  const { data } = supabase.storage.from('product-media').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('The upload finished but did not return a usable image URL.')
  return { image:{ url:data.publicUrl, path, byteSize:file.size } }
}

export async function fetchAdminPaymentSettings() {
  if (!supabase) return { data: DEFAULT_PAYMENT_SETTINGS, readiness: { ready: false, missing: ['Supabase is not configured.'] }, source: 'error', error: 'Supabase is not configured.' }
  try {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
    if (session?.access_token) {
      const response = await apiFetch('/api/admin-payment-settings', { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
      if (response && response.ok) {
        const result = await response.json().catch(() => ({}))
        if (result?.settings) {
          return { data: normalizePaymentSettings(result.settings), readiness: result.readiness || { ready: false, missing: [] }, source: 'server', error: null }
        }
      }
    }
    // Direct Supabase fallback
    const { data, error } = await supabase.from('pod_store_settings').select('value').eq('key', 'payment').maybeSingle()
    if (!error && data?.value) {
      return { data: normalizePaymentSettings(data.value), readiness: { ready: false, missing: [] }, source: 'supabase', error: null }
    }
  } catch (err) {
    console.warn('fetchAdminPaymentSettings fallback:', err.message)
  }
  return { data: DEFAULT_PAYMENT_SETTINGS, readiness: { ready: false, missing: [] }, source: 'preview', error: null }
}

export async function saveAdminPaymentSettings(settings) {
  const validation = validatePaymentSettings(settings)
  if (!validation.ok) return { data: validation.settings, source: 'error', error: validation.errors.join(' ') }
  if (!supabase) return { data: validation.settings, source: 'error', error: 'Supabase is not configured. Nothing was saved.' }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.access_token) return { data: validation.settings, source: 'error', error: 'Admin sign-in is required.' }
  const response = await apiFetch('/api/admin-payment-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ settings: validation.settings }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) return { data: validation.settings, source: 'error', error: result.error || 'Payment settings could not be saved.' }
  return { data: normalizePaymentSettings(result.settings), readiness: result.readiness || { ready: false, missing: [] }, source: 'server', error: null }
}

export async function createCustomizationOrder(order) {
  // Compatibility contract: the legacy fetch('/api/customization-order'
  // route is now resolved by apiFetch so the same handler can move to Node.
  const response = await apiFetch('/api/customization-order', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(order)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The custom request could not be saved.')
  return { data:result.order, source:'server', error:null }
}

async function adminApi(path,options={}) {
  if(!supabase)throw new Error('Supabase is not configured.')
  const {data:{session},error}=await supabase.auth.getSession()
  if(error||!session?.access_token)throw new Error('Your admin session expired. Sign in again.')
  const response=await apiFetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,...(options.headers||{})}})
  const result=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(result.error||'The admin request failed.')
  return result
}

export async function fetchAdminCustomizations(status='') {
  const query=status?`?status=${encodeURIComponent(status)}`:''
  try {
    const result = await adminApi(`/api/admin-customizations${query}`)
    if (result && Array.isArray(result.orders)) return result
  } catch (error) {
    console.warn('adminApi /api/admin-customizations unavailable, falling back to Supabase client:', error.message)
  }
  if (supabase) {
    try {
      let q = supabase.from('pod_customization_orders').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error: sbError } = await q
      if (!sbError && Array.isArray(data)) {
        return { orders: data, source: 'supabase', error: null }
      }
    } catch (err) {
      console.warn('Supabase customization fallback failed:', err.message)
    }
  }
  return { orders: [], source: 'preview', error: null }
}

export async function updateAdminCustomization(id,status,reviewNote='') {
  return adminApi('/api/admin-customizations',{method:'PATCH',body:JSON.stringify({id,status,reviewNote})})
}

export async function fetchMembershipOffer() {
  if (!supabase) return previewResult(membershipPreview)
  const [{ data:program,error:programError },{ data:prices,error:pricesError },{ data:policies,error:policyError }] = await Promise.all([
    supabase.from('pod_membership_programs').select('*').eq('slug','90-plus-club').eq('status','PUBLISHED').maybeSingle(),
    supabase.from('pod_membership_prices').select('*').eq('program_id','90-club').eq('status','ACTIVE').order('sort_order'),
    supabase.from('pod_membership_policy_versions').select('*').eq('program_id','90-club').eq('status','PUBLISHED').order('published_at',{ascending:false}).limit(1)
  ])
  if (programError || pricesError || policyError || !program) return previewResult(membershipPreview,programError?.message || pricesError?.message || policyError?.message || 'Membership offer is not published.')
  return {data:{program,prices:prices || [],policy:policies?.[0] || membershipPreview.policy},source:'supabase',error:null}
}

export async function customerAuthSnapshot() {
  if (!supabase) return {user:null,membership:null,requests:[],error:'Supabase is not configured.'}
  const {data:{session},error}=await supabase.auth.getSession()
  if (error || !session?.user) return {user:null,membership:null,requests:[],error:error?.message || null}
  const [{data:memberships,error:membershipError},{data:requests,error:requestError}] = await Promise.all([
    supabase.from('pod_memberships').select('*, pod_membership_prices(label,billing_interval,amount,currency)').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(1),
    supabase.from('pod_membership_enrollment_requests').select('id,status,requested_at,price_id').eq('user_id',session.user.id).order('requested_at',{ascending:false}).limit(5)
  ])
  return {user:session.user,membership:memberships?.[0] || null,requests:requests || [],token:session.access_token,error:membershipError?.message || requestError?.message || null}
}

export async function sendCustomerMagicLink(email) {
  if (!supabase) throw new Error('Customer sign-in needs Supabase configuration.')
  const redirectTo=new URL('/membership',window.location.origin).toString()
  const {error}=await supabase.auth.signInWithOtp({email:String(email||'').trim(),options:{emailRedirectTo:redirectTo,shouldCreateUser:true}})
  if(error) throw error
  return true
}

export async function signOutCustomer() {
  if (!supabase) return
  const {error}=await supabase.auth.signOut({scope:'local'})
  if(error) throw error
}

export async function requestMembershipEnrollment({priceId,policyVersionId,note='',accepted}) {
  if (!supabase) throw new Error('Membership enrollment needs Supabase configuration.')
  const {data:{session}}=await supabase.auth.getSession()
  if(!session?.access_token) throw new Error('Sign in before requesting membership.')
  const response=await apiFetch('/api/membership-enroll',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({priceId,policyVersionId,note,accepted})})
  const result=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(result.error || 'Membership request could not be saved.')
  return result
}

export async function requestMemberQuote(cart,{country=''}={}) {
  if(!supabase || !cart.length) return null
  const {data:{session}}=await supabase.auth.getSession()
  if(!session?.access_token) return null
  const lines=cart.map(item=>({lineKey:item.key || `${item.product.id}:${item.variantId}`,productId:item.product.id,variantId:item.variantId,qty:item.qty}))
  const response=await apiFetch('/api/member-quote',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({lines,shipping:{country}})})
  const result=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(result.error || 'Member price could not be checked.')
  return result
}

export async function requestCartValidation(cart) {
  if(!supabase || !cart.length) return { lines:[] }
  const response=await apiFetch('/api/cart-validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:getCustomerSessionId(),lines:cart.map(item=>({lineKey:item.key || `${item.product.id}:${item.variantId}`,productId:item.product.id,variantId:item.variantId,qty:item.qty}))})})
  const result=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(result.error||'Cart could not be validated.')
  return result
}

function checkoutLines(cart = []) {
  return cart.map(item => ({
    lineKey: item.key || `${item.product.id}:${item.variantId}`,
    productId: item.product.id,
    variantId: item.variantId,
    qty: item.qty,
    customization: item.customization ? {
      requestId: item.customization.requestId || null,
      fields: item.customization.fields || {},
      note: item.customization.note || '',
      aiPreviewUrl: item.customization.aiPreviewUrl || null,
      hasLogo: Boolean(item.customization.hasLogo),
      logoConsent: Boolean(item.customization.logoConsent)
    } : null
  }))
}

async function customerHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  return headers
}

export async function requestCheckoutQuote(cart, shipping = {}) {
  if (!cart?.length) throw new Error('Your bag is empty.')
  const response = await apiFetch('/api/checkout-quote', { method: 'POST', headers: await customerHeaders(), body: JSON.stringify({ sessionId: getCustomerSessionId(), lines: checkoutLines(cart), shipping }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Checkout quote could not be calculated.')
  return result.quote
}

export async function createCheckout({ cart, shipping, customer, quoteToken, idempotencyKey, trackingToken }) {
  if (!cart?.length) throw new Error('Your bag is empty.')
  const response = await apiFetch('/api/checkout-create', { method: 'POST', headers: await customerHeaders(), body: JSON.stringify({ sessionId: getCustomerSessionId(), lines: checkoutLines(cart), shipping, customer, quoteToken, idempotencyKey, trackingToken }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'Checkout could not be started.')
    error.status = response.status
    error.code = result.code
    throw error
  }
  return result
}

export async function confirmPayment({ publicId, token, providerOrderId }) {
  const response = await apiFetch('/api/payment-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId, token, providerOrderId }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'Payment could not be confirmed.')
    error.status = response.status
    error.reviewRequired = Boolean(result.reviewRequired)
    throw error
  }
  return result
}

// Backwards-compatible name used by older checkout integrations. The server
// now confirms PayPal and Stripe sessions through the same authoritative route.
export async function capturePayPalPayment(args) {
  return confirmPayment(args)
}

export async function cancelPendingPayment({ publicId, token, providerOrderId = '' }) {
  const response = await apiFetch('/api/payment-cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId, token, providerOrderId }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'Payment cancellation could not be recorded.')
    error.status = response.status
    throw error
  }
  return result
}

export async function trackOrder(publicId, token) {
  const response = await apiFetch('/api/order-track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId, token }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Order tracking is unavailable.')
  return result.order
}

export async function fetchAdminOrders(status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  try {
    const result = await adminApi(`/api/admin-orders${query}`)
    if (result && Array.isArray(result.orders)) return result
  } catch (err) {
    console.warn('fetchAdminOrders api error, falling back to direct query:', err.message)
  }
  if (supabase) {
    try {
      let q = supabase.from('pod_orders').select('*, pod_order_items(*)').order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error: sbError } = await q
      if (!sbError && Array.isArray(data)) {
        return { orders: data, source: 'supabase', error: null }
      }
    } catch (directErr) {
      console.warn('Direct pod_orders query error:', directErr.message)
    }
  }
  return { orders: [], source: 'preview', error: null }
}

export async function fetchAdminOrder(id) {
  if (!id) throw new Error('Order id is required.')
  try {
    const result = await adminApi(`/api/admin-orders?id=${encodeURIComponent(id)}`)
    if (result && result.order) return result
  } catch (err) {
    console.warn('fetchAdminOrder api error:', err.message)
  }
  if (supabase) {
    try {
      const { data, error: sbError } = await supabase.from('pod_orders').select('*, pod_order_items(*)').eq('id', id).maybeSingle()
      if (!sbError && data) {
        return { order: data, source: 'supabase', error: null }
      }
    } catch (directErr) {
      console.warn('Direct pod_orders query error:', directErr.message)
    }
  }
  return { order: null, source: 'preview', error: 'Order not found or unavailable' }
}

export async function updateAdminOrder(payload) {
  return adminApi('/api/admin-orders', { method: 'PATCH', body: JSON.stringify(payload) })
}

export async function fetchAdminMembership() {
  if(!supabase) return previewResult({...membershipPreview,rules:[],members:[],requests:[]})
  try {
    const safeQuery = async p => {
      try {
        const res = await p
        return res || { data: null, error: null }
      } catch (err) {
        return { data: null, error: err }
      }
    }
    const [
      { data: program, error: programError },
      { data: prices, error: pricesError },
      { data: rules, error: rulesError },
      { data: policies, error: policiesError },
      { data: members, error: membersError },
      { data: requests, error: requestsError }
    ] = await Promise.all([
      safeQuery(supabase.from('pod_membership_programs').select('*').eq('id', '90-club').maybeSingle()),
      safeQuery(supabase.from('pod_membership_prices').select('*').eq('program_id', '90-club').order('sort_order')),
      safeQuery(supabase.from('pod_membership_discount_rules').select('*').eq('program_id', '90-club').order('priority', { ascending: false })),
      safeQuery(supabase.from('pod_membership_policy_versions').select('*').eq('program_id', '90-club').order('created_at', { ascending: false })),
      safeQuery(supabase.from('pod_memberships').select('*, pod_membership_prices(label,billing_interval,amount,currency)').eq('program_id', '90-club').order('created_at', { ascending: false })),
      safeQuery(supabase.from('pod_membership_enrollment_requests').select('*, pod_membership_prices(label,billing_interval,amount,currency)').eq('program_id', '90-club').order('requested_at', { ascending: false }))
    ])
    const userIds = [...new Set([...(members || []), ...(requests || [])].map(item => item.user_id).filter(Boolean))]
    let profileResult = { data: [], error: null }
    if (userIds.length) {
      profileResult = await safeQuery(supabase.from('pod_customer_profiles').select('user_id,email,display_name').in('user_id', userIds))
    }
    const profiles = new Map((profileResult.data || []).map(profile => [profile.user_id, profile]))
    const error = programError || pricesError || rulesError || policiesError || membersError || requestsError || profileResult.error

    return {
      data: {
        program: program || membershipPreview.program,
        prices: (prices && prices.length) ? prices : membershipPreview.prices,
        rules: rules || [],
        policies: policies || (membershipPreview.policy ? [membershipPreview.policy] : []),
        policy: policies?.find(item => item.status === 'PUBLISHED') || policies?.[0] || membershipPreview.policy,
        members: (members || []).map(item => ({ ...item, pod_customer_profiles: profiles.get(item.user_id) || null })),
        requests: (requests || []).map(item => ({ ...item, pod_customer_profiles: profiles.get(item.user_id) || null }))
      },
      source: error ? 'preview' : 'supabase',
      error: error?.message || null
    }
  } catch (fatal) {
    console.warn('fetchAdminMembership error, using fallback:', fatal)
    return {
      data: { ...membershipPreview, rules: [], policies: [membershipPreview.policy], members: [], requests: [] },
      source: 'preview',
      error: fatal.message
    }
  }
}

export async function saveAdminMembership(config) {
  if(!supabase) return {data:null,source:'error',error:'Supabase is not configured. Nothing was saved.'}
  const {data,error}=await supabase.rpc('pod_save_membership_program',{payload:{program:config.program,prices:config.prices,rules:config.rules,policy:config.policy}})
  if(error) return {data:null,source:'error',error:error.code==='PGRST202'?'Membership migration is not installed. Nothing was saved.':error.message}
  return {data,source:'supabase',error:null}
}

export async function approveMembershipRequest(requestId) {
  if(!supabase) return {data:null,error:'Supabase is not configured.'}
  const {data,error}=await supabase.rpc('pod_admin_approve_membership_request',{request_id:requestId,period_end:null})
  return {data,error:error?.message || null}
}

export async function setAdminMembership(payload) {
  if(!supabase) return {data:null,error:'Supabase is not configured.'}
  const {data,error}=await supabase.rpc('pod_admin_set_membership',{payload})
  return {data,error:error?.message || null}
}
