import { createClient } from '@supabase/supabase-js'
import { adminProducts, adminTemplates } from '../admin-data'

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
    template_id: product.templateId || (product.template === 'TOUCHLINE / DESIGN 001' ? 'touchline-04' : 'after-90-core'),
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
  return { data, source: 'supabase', error: null }
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
    cover_image: template.cover || null,
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase.from('templates').upsert(payload).select().single()
  if (error) return previewResult(template, error.message)
  return { data, source: 'supabase', error: null }
}
