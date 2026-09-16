import { createClient } from '@supabase/supabase-js'
import { adminProducts, adminTemplates } from '../admin-data'
import { adminCollections, adminMenus, adminProductOptions, adminTheme } from '../admin-builder-data'
import { storyTemplates } from '../template-engine'
import { buildListingInput, normalizeProduct, normalizeTemplate, validateListing } from './catalog-model'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

const previewResult = (data, error = null) => ({ data, source: 'preview', error })

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

export async function fetchAdminTemplates() {
  if (!supabase) return previewResult(adminTemplates)
  const { data, error } = await supabase.from('pod_templates').select('*').order('updated_at', { ascending: false })
  if (error) return { data:[], source:'error', error:error.message }
  const slotLabels = { BACK_NAME:'NAME + NUMBER', BACK_NUMBER:'NAME + NUMBER', FRONT_NUMBER:'NAME + NUMBER', CITY:'TEAM / CITY', CITY_CODE:'TEAM / CITY', COORDINATES:'TEAM / CITY', YEAR:'YEAR', MILESTONE_1:'MILESTONE 1', MILESTONE_2:'MILESTONE 2', MILESTONE_3:'MILESTONE 3', MOTTO:'MOTTO', ACCENT_COLOR:'COLOUR', METAL_ACCENT:'COLOUR', CREST:'CREST INITIALS', CHAMPIONSHIP_YEARS:'CHAMPIONSHIP YEARS', OPTIONAL_PHOTO:'OPTIONAL PHOTO' }
  return { data: (data || []).map(row => normalizeTemplate({ ...row, editable_slots: [...new Set((row.editable_slots || []).map(item => slotLabels[item] || item))], locked_layers: row.locked_layers || [] })), source: 'supabase', error: null }
}

export async function fetchRuntimeTemplates() {
  if (!supabase) return { data: storyTemplates, source:'preview', error:null }
  const result = await fetchAdminTemplates()
  const labelToField = {
    'NAME + NUMBER':['backName','backNumber'], 'TEAM / CITY':['city'], YEAR:['year'], COLOUR:['accent'], 'OPTIONAL PHOTO':['optionalPhoto'],
    'MILESTONE 1':['milestone1'], 'MILESTONE 2':['milestone2'], 'MILESTONE 3':['milestone3'], MOTTO:['motto'], 'CREST INITIALS':['crest'], 'CHAMPIONSHIP YEARS':['championshipYears']
  }
  const runtime = result.data.map(row => {
    const base = storyTemplates.find(template => template.id === row.id)
    if (!base) return null
    const editableFields = (row.editable_slots || []).flatMap(label => labelToField[label] || [])
    return { ...base, version:row.version || base.version, artworkLock:row.artwork_lock_percent ?? base.artworkLock, status:row.status || base.status, strapline:row.description || base.strapline, fields:editableFields.length ? [...new Set(editableFields)] : base.fields }
  }).filter(Boolean)
  return { data: runtime.length ? runtime : storyTemplates, source:result.source, error:result.error }
}

export async function saveAdminTemplate(template) {
  if (!supabase) return previewResult(template)
  const payload = {
    id: template.id,
    name: template.name,
    slug: template.slug || template.id,
    status: template.status || 'DRAFT',
    version: template.version || 'v1.0',
    artwork_lock_percent: Number(template.lockPercent ?? 70),
    description: template.description || '',
    locked_layers: template.locked || [],
    editable_slots: template.editable || [],
    definition: template.templateDefinition || {},
    cover_image: template.cover || null,
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from('pod_templates').upsert(payload).select().single()
  if (error) return previewResult(template, error.message)
  await supabase.from('pod_template_versions').upsert({ id:`${template.id}-${template.version}`, template_id:template.id, version:template.version, definition:payload.definition, changelog:'Updated from Admin Template Builder' }).catch(() => {})
  return { data, source: 'supabase', error: null }
}

export async function fetchAdminTheme() {
  if (!supabase) return previewResult(adminTheme)
  const [{ data: theme, error: themeError }, { data: pages, error: pagesError }] = await Promise.all([
    supabase.from('pod_themes').select('*').eq('id', adminTheme.id).maybeSingle(),
    supabase.from('pod_pages').select('*').eq('theme_id', adminTheme.id).order('updated_at', { ascending: false })
  ])
  if (themeError || !theme) return previewResult(adminTheme, themeError?.message || null)
  return {
    data: {
      ...adminTheme,
      ...theme,
      updatedAt: theme.updated_at,
      tokens: { ...adminTheme.tokens, ...(theme.tokens || {}) },
      pages: pagesError || !pages?.length ? adminTheme.pages : pages.map(page => ({ ...page, sections: Array.isArray(page.layout) ? page.layout.length : 0, updatedAt: page.updated_at, layout: Array.isArray(page.layout) ? page.layout.join(' + ') : 'Custom layout' }))
    },
    source: 'supabase', error: pagesError?.message || null
  }
}

export async function saveAdminTheme(theme) {
  if (!supabase) return previewResult(theme)
  const payload = {
    id: theme.id,
    name: theme.name,
    status: theme.status || 'DRAFT',
    version: theme.version || 'v1.0',
    tokens: theme.tokens || {},
    definition: { blocks: theme.blocks || [], pages: theme.pages || [] },
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from('pod_themes').upsert(payload).select().single()
  if (error) return previewResult(theme, error.message)
  await supabase.from('pod_theme_versions').upsert({ id: `${theme.id}-${theme.version}`, theme_id: theme.id, version: theme.version, definition: payload.definition, changelog: 'Theme draft updated from Control Room' }).catch(() => {})
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
  for (const menu of menus) {
    const { error } = await supabase.from('pod_menus').upsert({ id: menu.id, name: menu.name, location: menu.location, status: menu.status || 'DRAFT', updated_at: new Date().toISOString() })
    if (error) return previewResult(menus, error.message)
    await supabase.from('pod_menu_items').delete().eq('menu_id', menu.id)
    const flat = menu.items.flatMap((item, index) => [
      { id: item.id, menu_id: menu.id, parent_id: null, label: item.label, target: item.target, link_type: String(item.type || 'PAGE').toUpperCase(), visible: item.visible !== false, sort_order: index },
      ...(item.children || []).map((child, childIndex) => ({ id: child.id, menu_id: menu.id, parent_id: item.id, label: child.label, target: child.target, link_type: String(child.type || 'PAGE').toUpperCase(), visible: child.visible !== false, sort_order: childIndex }))
    ])
    if (flat.length) await supabase.from('pod_menu_items').insert(flat)
  }
  return { data: menus, source: 'supabase', error: null }
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
  for (const collection of collections) {
    const { error } = await supabase.from('pod_collections').upsert({ id: collection.id, handle: collection.handle, name: collection.name, description: collection.description || '', status: collection.status || 'DRAFT', hero_image: collection.hero || null, sort_mode: String(collection.sort || 'MANUAL').toUpperCase().replace(/\s+/g, '_'), updated_at: new Date().toISOString() })
    if (error) return previewResult(collections, error.message)
    await supabase.from('pod_collection_products').delete().eq('collection_id', collection.id)
    if (collection.products?.length) await supabase.from('pod_collection_products').insert(collection.products.map((productId, index) => ({ collection_id: collection.id, product_id: productId, sort_order: index, featured: index === 0 })))
  }
  return { data: collections, source: 'supabase', error: null }
}

export async function requestArtworkRender(payload) {
  const response = await fetch('/api/render-artwork', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Artwork render failed.')
  return result
}

export async function createCustomizationOrder(order) {
  if (!supabase) return previewResult(order)
  const { data, error } = await supabase.from('pod_customization_orders').insert(order).select().single()
  if (error) return previewResult(order, error.message)
  return { data, source:'supabase', error:null }
}
