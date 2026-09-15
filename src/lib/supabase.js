import { createClient } from '@supabase/supabase-js'
import { adminProducts, adminTemplates } from '../admin-data'
import { storyTemplates } from '../template-engine'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

const previewResult = (data, error = null) => ({ data, source: 'preview', error })

export async function fetchAdminProducts() {
  if (!supabase) return previewResult(adminProducts)
  const { data, error } = await supabase.from('products').select('*').order('updated_at', { ascending: false })
  if (error || !data?.length) return previewResult(adminProducts, error?.message || null)
  return { data, source: 'supabase', error: null }
}

export async function saveAdminProduct(product) {
  if (!supabase) return previewResult(product)
  const payload = {
    id: product.id,
    handle: product.handle || product.id,
    title: product.title || product.name,
    subtitle: product.subtitle || product.story,
    description: product.description || product.story,
    price: Number(product.price),
    compare_at: product.compareAt ? Number(product.compareAt) : null,
    status: product.status || 'DRAFT',
    badge: product.badge || null,
    type: product.type || 'READY TO SHIP',
    template_id: product.templateId || storyTemplates.find(item => item.name === product.template)?.id || 'after-90-core',
    image: product.image,
    color: product.color,
    artwork_lock: Number(product.artworkLock ?? 100),
    personalization: product.personalization || [],
    inventory: Number(product.inventory ?? 0),
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from('products').upsert(payload).select().single()
  if (error) return previewResult(product, error.message)
  return { data, source: 'supabase', error: null }
}

export async function fetchAdminTemplates() {
  if (!supabase) return previewResult(adminTemplates)
  const { data, error } = await supabase.from('templates').select('*').order('updated_at', { ascending: false })
  if (error || !data?.length) return previewResult(adminTemplates, error?.message || null)
  const slotLabels = { BACK_NAME:'NAME + NUMBER', BACK_NUMBER:'NAME + NUMBER', FRONT_NUMBER:'NAME + NUMBER', CITY:'TEAM / CITY', CITY_CODE:'TEAM / CITY', COORDINATES:'TEAM / CITY', YEAR:'YEAR', MILESTONE_1:'MILESTONE 1', MILESTONE_2:'MILESTONE 2', MILESTONE_3:'MILESTONE 3', MOTTO:'MOTTO', ACCENT_COLOR:'COLOUR', METAL_ACCENT:'COLOUR', CREST:'CREST INITIALS', CHAMPIONSHIP_YEARS:'CHAMPIONSHIP YEARS', OPTIONAL_PHOTO:'OPTIONAL PHOTO' }
  return { data: data.map(row => ({ ...row, editable_slots: (row.editable_slots || []).map(item => slotLabels[item] || item), locked_layers: row.locked_layers || [] })), source: 'supabase', error: null }
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
  const { data, error } = await supabase.from('templates').upsert(payload).select().single()
  if (error) return previewResult(template, error.message)
  await supabase.from('template_versions').upsert({ id:`${template.id}-${template.version}`, template_id:template.id, version:template.version, definition:payload.definition, changelog:'Updated from Admin Template Builder' }).catch(() => {})
  return { data, source: 'supabase', error: null }
}

export async function requestArtworkRender(payload) {
  const response = await fetch('/api/render-artwork', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Artwork render failed.')
  return result
}

export async function createCustomizationOrder(order) {
  if (!supabase) return previewResult(order)
  const { data, error } = await supabase.from('customization_orders').insert(order).select().single()
  if (error) return previewResult(order, error.message)
  return { data, source:'supabase', error:null }
}
