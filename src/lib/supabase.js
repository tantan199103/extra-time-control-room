import { createClient } from '@supabase/supabase-js'
import { adminProducts } from '../admin-data'
import { adminCollections, adminMenus, adminProductOptions, adminTheme } from '../admin-builder-data'
import { buildListingInput, normalizeProduct, validateListing } from './catalog-model'
import { prepareStorefrontProduct } from './storefront-model'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

const previewResult = (data, error = null) => ({ data, source: 'preview', error })

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

export async function uploadCustomerReference(file, productId, fieldKey) {
  if (!file || !/^image\/(?:png|jpe?g|webp)$/i.test(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Use a JPG, PNG or WebP image smaller than 2 MB.')
  const dataUrl = await new Promise((resolve,reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })
  const response = await fetch('/api/customer-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sessionId:getCustomerSessionId(), productId, fieldKey, dataUrl }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The reference image could not be uploaded.')
  return result
}

export async function fetchStorefrontCatalog(fallback = []) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase
    .from('pod_products')
    .select('*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))')
    .eq('status', 'PUBLISHED')
    .order('updated_at', { ascending:false })
  if (error) return previewResult(fallback, error.message)
  const products = (data || []).map(row => prepareStorefrontProduct(row))
  return products.length ? { data:products, source:'supabase', error:null } : previewResult(fallback, 'No published listings were returned.')
}

export async function fetchStorefrontMenus(fallback = []) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase.from('pod_menus').select('*, pod_menu_items(*)').eq('status','PUBLISHED').order('updated_at',{ascending:false})
  if (error) return previewResult(fallback, error.message)
  const menus = (data || []).map(menu => {
    const all = (menu.pod_menu_items || []).filter(item => item.visible !== false).sort((a,b) => a.sort_order - b.sort_order)
    return { ...menu, items:all.filter(item => !item.parent_id).map(item => ({ ...item, type:item.link_type, children:all.filter(child => child.parent_id === item.id).map(child => ({...child,type:child.link_type})) })) }
  })
  return { data:menus.length ? menus : fallback, source:menus.length ? 'supabase' : 'preview', error:null }
}

export async function fetchStorefrontCollections(fallback = []) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase.from('pod_collections').select('*, pod_collection_products(product_id, sort_order, featured)').eq('status','PUBLISHED').order('updated_at',{ascending:false})
  if (error) return previewResult(fallback, error.message)
  const collections = (data || []).map(row => ({
    ...row,
    hero:row.hero_image,
    sort:row.sort_mode,
    products:(row.pod_collection_products || []).sort((a,b) => a.sort_order - b.sort_order).map(item => item.product_id)
  }))
  return { data:collections.length ? collections : fallback, source:collections.length ? 'supabase' : 'preview', error:null }
}

export async function fetchStorefrontTheme(fallback = null) {
  if (!supabase) return previewResult(fallback)
  const { data, error } = await supabase.from('pod_themes').select('*, pod_pages(*)').eq('status','PUBLISHED').order('updated_at',{ascending:false}).limit(1).maybeSingle()
  if (error || !data) return previewResult(fallback, error?.message || 'No published theme was returned.')
  const definition = data.definition && typeof data.definition === 'object' ? data.definition : {}
  return { data:{ ...data, ...definition, tokens:{ ...(fallback?.tokens || {}), ...(data.tokens || {}) }, pages:data.pod_pages || definition.pages || [] }, source:'supabase', error:null }
}

export async function fetchAdminProducts() {
  if (!supabase) return { data:[], source:'error', error:'Supabase is not configured.' }
  const { data, error } = await supabase.from('pod_products').select('*, pod_product_variants(*), pod_product_options(*, pod_product_option_values(*))').order('updated_at', { ascending: false })
  if (error) return { data:[], source:'error', error:error.message }
  return { data: (data || []).map(row => normalizeProduct(row)), source: 'supabase', error: null }
}

export async function saveAdminProduct(product) {
  if (!supabase) return { data:null, source:'error', error:'Supabase is not configured. Nothing was saved.' }
  const errors = validateListing(product)
  if (errors.length) return { data:null, source:'error', error:errors.join(' ') }
  const { data, error } = await supabase.rpc('pod_save_listing', {
    listing: buildListingInput(product), expected_updated_at: product._persisted ? product.updatedAt : null
  })
  if (error) return { data:null, source:'error', error:error.code === 'PGRST202' ? 'Listing migration is not installed. Apply 20260916_listing_workspace.sql before saving. Nothing was saved.' : error.message }
  return { data:normalizeProduct(data), source:'supabase', error:null }
}

const mediaTypes = new Map([
  ['image/jpeg','IMAGE'], ['image/png','IMAGE'], ['image/webp','IMAGE'], ['image/avif','IMAGE'],
  ['video/mp4','VIDEO'], ['video/webm','VIDEO']
])

export async function uploadProductMedia(file, productId) {
  if (!supabase) throw new Error('Supabase is not configured. Media was not uploaded.')
  const type = mediaTypes.get(file?.type)
  if (!type) throw new Error('Use JPG, PNG, WebP, AVIF, MP4 or WebM files.')
  const sizeLimit = type === 'VIDEO' ? 80 * 1024 * 1024 : 15 * 1024 * 1024
  if (!file.size || file.size > sizeLimit) throw new Error(`${type === 'VIDEO' ? 'Video' : 'Image'} must be smaller than ${sizeLimit / 1024 / 1024} MB.`)
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
  const response = await fetch('/api/ai-listing-copy', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify({
      product:{
        title:product.title, subtitle:product.subtitle, description:product.description, type:product.type,
        productGroup:product.productGroup, tags:product.tags, image:product.image,
        media:(product.media || []).slice(0,8).map(item => ({ type:item.type, url:item.url, alt:item.alt })),
        customFields:(product.customFields || []).map(field => field.label)
      },
      brief
    })
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'AI copy could not be generated.')
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
      blocks:definition.blocks || theme.blocks || [],
      content:definition.content || theme.content || {},
      pages: pagesError || !pages?.length ? (definition.pages || adminTheme.pages) : pages.map(page => ({ ...page, sections: Array.isArray(page.layout) ? page.layout.length : Number(page.sections || 0), updatedAt: page.updated_at, layout:page.layout }))
    },
    source: 'supabase', error: pagesError?.message || null
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
  const { data, error } = await supabase.from('pod_menus').select('*, pod_menu_items(*)').order('updated_at', { ascending: false })
  if (error || !data?.length) return previewResult(adminMenus, error?.message || null)
  const rows = data.map(menu => {
    const all = (menu.pod_menu_items || []).sort((a, b) => a.sort_order - b.sort_order)
    const roots = all.filter(item => !item.parent_id).map(item => ({ ...item, type: item.link_type, target: item.target, children: all.filter(child => child.parent_id === item.id).map(child => ({ ...child, type: child.link_type })) }))
    return { ...menu, location: menu.location, updatedAt: menu.updated_at, items: roots }
  })
  return { data: rows, source: 'supabase', error: null }
}

export async function saveAdminMenus(menus) {
  if (!supabase) return previewResult(menus)
  const payload = menus.map(menu => ({ ...menu, items:(menu.items || []).map((item,index) => ({...item,sortOrder:index,children:(item.children || []).map((child,childIndex) => ({...child,sortOrder:childIndex}))})) }))
  const { data, error } = await supabase.rpc('pod_save_menus', { menu_payload:payload })
  if (error) return { data:menus, source:'error', error:error.code === 'PGRST202' ? 'Storefront runtime migration is not installed. Nothing was saved.' : error.message }
  return { data, source:'supabase', error:null }
}

export async function fetchAdminCollections() {
  if (!supabase) return previewResult(adminCollections)
  const { data, error } = await supabase.from('pod_collections').select('*, pod_collection_products(product_id, sort_order)').order('updated_at', { ascending: false })
  if (error || !data?.length) return previewResult(adminCollections, error?.message || null)
  return {
    data: data.map(collection => ({ ...collection, hero: collection.hero_image, sort: collection.sort_mode, products: (collection.pod_collection_products || []).sort((a, b) => a.sort_order - b.sort_order).map(item => item.product_id), count: collection.pod_collection_products?.length || 0, updatedAt: collection.updated_at })),
    source: 'supabase', error: null
  }
}

export async function saveAdminCollections(collections) {
  if (!supabase) return previewResult(collections)
  const { data, error } = await supabase.rpc('pod_save_collections', { collection_payload:collections })
  if (error) return { data:collections, source:'error', error:error.code === 'PGRST202' ? 'Storefront runtime migration is not installed. Nothing was saved.' : error.message }
  return { data, source:'supabase', error:null }
}

export async function createCustomizationOrder(order) {
  const response = await fetch('/api/customization-order', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(order)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The custom request could not be saved.')
  return { data:result.order, source:'server', error:null }
}
