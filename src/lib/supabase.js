import { createClient } from '@supabase/supabase-js'
import { adminProducts } from '../admin-data'
import { adminCollections, adminMenus, adminProductOptions, adminTheme, themeBlocks } from '../admin-builder-data'
import { buildListingInput, normalizeProduct, validateListing } from './catalog-model'
import { buildMenuTree, prepareStorefrontProduct, resolveMenuImages } from './storefront-model'
import { DEFAULT_PAYMENT_SETTINGS, normalizePaymentSettings, validatePaymentSettings } from './payment-config'
import { apiFetch } from './api-client'

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

const normalizeThemePages = (pages = []) => (Array.isArray(pages) ? pages : []).map(page => ({
  ...page,
  representativeImage: page.representative_image || page.representativeImage || '',
  representativeAlt: page.representative_alt || page.representativeAlt || ''
}))

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

export async function fetchStorefrontCatalog(fallback = []) {
  if (!supabase) return import.meta.env.DEV ? previewResult(fallback) : { data:[], source:'unavailable', error:'Live catalogue is not configured.' }
  const { data, error } = await supabase
    .from('pod_products')
    .select('*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))')
    .eq('status', 'PUBLISHED')
    .order('updated_at', { ascending:false })
  if (error) return import.meta.env.DEV ? previewResult(fallback, error.message) : { data:[], source:'unavailable', error:error.message }
  const products = (data || []).map(row => prepareStorefrontProduct(row))
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

export async function fetchStorefrontCollections(fallback = []) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase.from('pod_collections').select('*, pod_collection_products(product_id, sort_order, featured)').eq('status','PUBLISHED').order('updated_at',{ascending:false})
  if (error) return previewResult(fallback, error.message)
  const collections = (data || []).map(row => ({
    ...row,
    hero:row.hero_image,
    sort:row.sort_mode,
    products:(row.pod_collection_products || []).sort((a,b) => a.sort_order - b.sort_order).map(item => item.product_id),
    productLinks:(row.pod_collection_products || []).map(item => ({ productId:item.product_id, sortOrder:item.sort_order, featured:Boolean(item.featured) }))
  }))
  return { data:collections.length ? collections : fallback, source:collections.length ? 'supabase' : 'preview', error:null }
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
  'product_group', 'seo_status', 'seo_quality_score', 'seo_block_reasons',
  'seo_reviewed_at', 'seo_published_at', 'created_at', 'updated_at'
].join(',')

const ADMIN_PRODUCT_LEGACY_FIELDS = [
  'id', 'handle', 'title', 'subtitle', 'description', 'price', 'compare_at',
  'status', 'badge', 'type', 'template_id', 'image', 'color', 'artwork_lock',
  'personalization', 'inventory', 'seo', 'created_at', 'updated_at'
].join(',')

const ADMIN_PRODUCT_PAGE_SIZE = 200
const ADMIN_PRODUCT_MAX_PAGES = 25

async function fetchAdminProductPages(fields, includeVariantCount = false, { onPage, onError, progressive = false } = {}) {
  const select = includeVariantCount ? `${fields},pod_product_variants(count)` : fields
  const readPage = async page => {
    const from = page * ADMIN_PRODUCT_PAGE_SIZE
    const { data, error } = await supabase
      .from('pod_products')
      .select(select)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + ADMIN_PRODUCT_PAGE_SIZE - 1)
    if (error) throw error
    return Array.isArray(data) ? data : []
  }

  const normalizeSummaryPage = rows => rows.map(row => {
    const countRow = Array.isArray(row.pod_product_variants) ? row.pod_product_variants[0] : null
    const variantCount = countRow && Number.isFinite(Number(countRow.count)) ? Number(countRow.count) : null
    const normalized = normalizeProduct({
      ...row,
      // `pod_product_variants(count)` is only a catalogue hint.  Never let
      // the count object masquerade as a real editable variant.
      pod_product_variants: [],
      _variantCount: variantCount,
      _catalogSummary: true
    })
    return normalized
  })

  // Read in small windows. A single `select('*', deep joins)` over a large
  // imported catalogue routinely exceeds PostgREST's statement/response
  // budget. Four concurrent windows keep the first paint quick without
  // opening an unbounded number of database requests.
  const firstPage = await readPage(0)
  if (firstPage.length) onPage?.(normalizeSummaryPage(firstPage), { page: 0, done: firstPage.length < ADMIN_PRODUCT_PAGE_SIZE })
  if (firstPage.length < ADMIN_PRODUCT_PAGE_SIZE) return firstPage

  const loadRemaining = async () => {
    const rows = []
    let page = 1
    while (page < ADMIN_PRODUCT_MAX_PAGES) {
      const pageCount = Math.min(4, ADMIN_PRODUCT_MAX_PAGES - page)
      const pages = await Promise.all(
        Array.from({ length: pageCount }, (_, index) => page + index).map(readPage)
      )
      let reachedEnd = false
      pages.forEach((chunk, index) => {
        rows.push(...chunk)
        if (chunk.length < ADMIN_PRODUCT_PAGE_SIZE) reachedEnd = true
        if (chunk.length) onPage?.(normalizeSummaryPage(chunk), { page: page + index, done: chunk.length < ADMIN_PRODUCT_PAGE_SIZE })
      })
      if (reachedEnd) break
      page += pages.length
    }
    return rows
  }

  // Once the first 200 rows are available, continue in bounded windows.  In
  // progressive mode the caller receives the first page now and the rest is
  // intentionally detached from the initial Admin render.
  if (progressive) {
    const background = loadRemaining().catch(error => {
      onError?.(error)
      return []
    })
    return { firstPage, background }
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
    if (data.length) return { data: data.map(row => normalizeProduct({
      ...row,
      pod_product_variants: [],
      _variantCount: Array.isArray(row.pod_product_variants) && row.pod_product_variants[0]?.count != null ? Number(row.pod_product_variants[0].count) : null,
      _catalogSummary: true
    })), source: 'supabase', error: null }
    return { data: adminProducts, source: 'preview', error: 'No catalogue rows were returned for this admin session.' }
  } catch (err) {
    // Keep older projects usable when the additive listing migration has not
    // been applied yet. This legacy projection is still paginated and avoids
    // the expensive nested `*` query that caused the timeout.
    console.warn('Optimized admin product query failed, trying legacy projection:', err instanceof Error ? err.message : err)
    try {
      const result = await fetchAdminProductPages(ADMIN_PRODUCT_LEGACY_FIELDS, false, { onPage, onError, progressive: Boolean(onPage) })
      const data = Array.isArray(result) ? result : result.firstPage
      if (data.length) return { data: data.map(row => normalizeProduct({ ...row, _catalogSummary: true })), source: 'supabase', error: null }
    } catch (legacyError) {
      onError?.(legacyError)
      return { data: adminProducts, source: 'preview', error: legacyError instanceof Error ? legacyError.message : 'Product query failed.' }
    }
    onError?.(err)
    return { data: adminProducts, source: 'preview', error: err instanceof Error ? err.message : 'Product query failed.' }
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
    const { error } = await supabase.from('pod_products').delete().eq('id', productId)
    if (error) return { error: error.message, source: 'supabase' }
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
  const payload = { ...theme, status:theme.status || 'DRAFT', version:theme.version || 'v1.0', tokens:theme.tokens || {}, blocks:theme.blocks || [], content:theme.content || {}, pages:theme.pages || [] }
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

export async function fetchAdminCollections() {
  if (!supabase) return previewResult(adminCollections)
  try {
    const { data, error } = await supabase.from('pod_collections').select('*, pod_collection_products(product_id, sort_order, featured)').order('updated_at', { ascending: false })
    if (error || !data?.length) return previewResult(adminCollections, error?.message || null)
    return {
      data: data.map(collection => ({ ...collection, hero: collection.hero_image, sort: collection.sort_mode, products: (collection.pod_collection_products || []).sort((a, b) => a.sort_order - b.sort_order).map(item => item.product_id), productLinks:(collection.pod_collection_products || []).map(item => ({productId:item.product_id,sortOrder:item.sort_order,featured:Boolean(item.featured)})), count: collection.pod_collection_products?.length || 0, updatedAt: collection.updated_at })),
      source: 'supabase', error: null
    }
  } catch (err) {
    console.warn('fetchAdminCollections error, using fallback:', err.message)
    return previewResult(adminCollections, err.message)
  }
}

export async function saveAdminCollections(collections) {
  if (!supabase) return previewResult(collections)
  const { data, error } = await supabase.rpc('pod_save_collections', { collection_payload:collections })
  if (error) return { data:collections, source:'error', error:error.code === 'PGRST202' ? 'Storefront runtime migration is not installed. Nothing was saved.' : error.message }
  return { data, source:'supabase', error:null }
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
    const { data, error } = await supabase.from('pod_store_settings').select('value').eq('key', 'payment_provider_settings').maybeSingle()
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

export async function capturePayPalPayment({ publicId, token, providerOrderId }) {
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
