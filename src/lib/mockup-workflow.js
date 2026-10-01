/**
 * Jersevo-native mockup workflow contract.
 *
 * 3DMockups is used as a product-behaviour reference only.  This module keeps
 * the useful, provider-neutral parts of that workflow (garment -> artwork ->
 * print panel -> scene/export) in a small contract that can be shared by the
 * browser editor, import scripts and server validation.  It intentionally does
 * not describe or copy any proprietary third-party model, texture or template.
 */

export const MOCKUP_WORKFLOW_VERSION = '1.0'

export const MOCKUP_ASSET_KINDS = Object.freeze([
  'artwork',
  'logo',
  'photo',
  'texture',
  'model'
])

export const MOCKUP_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml'
])

export const MOCKUP_PRINT_AREAS = Object.freeze([
  Object.freeze({ id:'front-center', label:'Center front', surface:'front' }),
  Object.freeze({ id:'front-left-chest', label:'Left chest', surface:'front' }),
  Object.freeze({ id:'front-right-chest', label:'Right chest', surface:'front' }),
  Object.freeze({ id:'front-lower', label:'Lower front', surface:'front' }),
  Object.freeze({ id:'back-upper', label:'Upper back', surface:'back' }),
  Object.freeze({ id:'back-center', label:'Center back', surface:'back' }),
  Object.freeze({ id:'back-lower', label:'Lower back', surface:'back' }),
  Object.freeze({ id:'left-sleeve', label:'Left sleeve', surface:'left-sleeve' }),
  Object.freeze({ id:'right-sleeve', label:'Right sleeve', surface:'right-sleeve' })
])

export const MOCKUP_MATERIAL_PRESETS = Object.freeze([
  Object.freeze({ id:'performance-knit', label:'Performance knit', description:'Breathable polyester jersey with a restrained woven sheen.' }),
  Object.freeze({ id:'heavy-cotton', label:'Heavy cotton', description:'Dense cotton surface for tees and hoodies.' }),
  Object.freeze({ id:'mesh', label:'Athletic mesh', description:'Open-knit athletic surface for teamwear.' })
])

export const MOCKUP_SCENE_PRESETS = Object.freeze([
  Object.freeze({ id:'studio-light', label:'Studio light', background:'#F4F5F1', camera:'front' }),
  Object.freeze({ id:'ink', label:'Ink', background:'#111311', camera:'front' }),
  Object.freeze({ id:'transparent', label:'Transparent PNG', background:'transparent', camera:'front' })
])

export const MOCKUP_EXPORT_PRESETS = Object.freeze([
  Object.freeze({ id:'preview-png', label:'Preview PNG', mime:'image/png', width:1600, height:1600 }),
  Object.freeze({ id:'design-json', label:'Design JSON', mime:'application/json' })
])

export const THREEDMOCKUPS_REFERENCE = Object.freeze({
  provider:'3dmockups.app',
  sourceUrl:'https://www.3dmockups.app/',
  catalogUrl:'https://www.3dmockups.app/catalog',
  workflowUrl:'https://www.3dmockups.app/how-it-works',
  licenseStatus:'metadata-only',
  assetPolicy:'Do not copy or redistribute third-party models, textures, templates or branding without a written license.',
  previewPolicy:'Only Jersevo-owned or separately licensed previews may be displayed in the editor.'
})

const clean = (value, max = 160) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(0, max)

const slug = value => clean(value, 80)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

const isImageMime = value => MOCKUP_IMAGE_MIME_TYPES.includes(String(value || '').toLowerCase())
const printArea = value => {
  const candidate = slug(value)
  return MOCKUP_PRINT_AREAS.some(item => item.id === candidate) ? candidate : 'front-center'
}

/** Normalize one asset descriptor. Bytes are intentionally not accepted here. */
export function normalizeMockupAsset(input = {}, index = 0) {
  const kindCandidate = clean(input.kind, 20).toLowerCase()
  const kind = MOCKUP_ASSET_KINDS.includes(kindCandidate) ? kindCandidate : 'artwork'
  const mime = clean(input.mime || input.mimeType, 80).toLowerCase()
  const bytes = Math.max(0, Number(input.bytes || input.size || 0) || 0)
  return {
    id:slug(input.id || `${kind}-${index + 1}`) || `${kind}-${index + 1}`,
    kind,
    name:clean(input.name || `${kind} ${index + 1}`, 160),
    mime,
    bytes,
    width:Math.max(0, Math.round(Number(input.width) || 0)),
    height:Math.max(0, Math.round(Number(input.height) || 0)),
    checksum:clean(input.checksum || input.sha256, 128).toLowerCase(),
    placement:printArea(input.placement || input.printArea),
    source:clean(input.source, 240),
    license:clean(input.license || input.licenseStatus, 120),
    private:Boolean(input.private ?? true)
  }
}

/**
 * Validate an artwork/logo before it is put into the local draft.  The
 * browser uses this for quick feedback; the API repeats the checks server-side.
 */
export function validateMockupAsset(input = {}, { kind = input.kind || 'artwork' } = {}) {
  const asset = normalizeMockupAsset({ ...input, kind })
  const expectedKind = MOCKUP_ASSET_KINDS.includes(String(kind).toLowerCase()) ? String(kind).toLowerCase() : 'artwork'
  const maxBytes = expectedKind === 'photo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024
  if (!asset.name) return { ok:false, error:'Asset name is required.', asset }
  if (!isImageMime(asset.mime)) return { ok:false, error:'Use PNG, JPG, WebP or SVG artwork.', asset }
  if (asset.bytes > maxBytes) return { ok:false, error:`${expectedKind === 'photo' ? 'Reference images' : 'Artwork'} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`, asset }
  if (asset.width && asset.width < 256 || asset.height && asset.height < 256) return { ok:false, error:'Artwork must be at least 256px on each supplied dimension.', asset }
  return { ok:true, error:'', asset }
}

export function normalizeMockupCatalogEntry(input = {}) {
  const id = slug(input.id || input.slug || input.title)
  const category = slug(input.category || 'garments') || 'garments'
  // Never allow a source-hosted preview to leak into the public adapter.  A
  // source image can be visually useful during research, but displaying it in
  // the Jersevo editor would look like a redistribution of the provider's
  // protected asset.  Local paths and Jersevo storage URLs are safe.
  const previewCandidate = clean(input.preview || input.previewUrl, 400)
  const preview = isJersevoOwnedMockupAsset({ source:previewCandidate }) ? previewCandidate : ''
  const sourceUrl = clean(input.sourceUrl || THREEDMOCKUPS_REFERENCE.catalogUrl, 400)
  const adapterInput = input.adapter && typeof input.adapter === 'object' && !Array.isArray(input.adapter) ? input.adapter : {}
  const provider = clean(input.provider || adapterInput.provider, 40).toLowerCase()
  const productId = clean(input.productId || adapterInput.productId, 80)
  const statusCandidate = clean(adapterInput.status || input.adapterStatus || (provider && productId ? 'mapped' : 'reference-only'), 32).toLowerCase()
  const status = ['mapped', 'reference-only', 'pending-license'].includes(statusCandidate) ? statusCandidate : 'reference-only'
  const sourcePrintAreas = (Array.isArray(input.sourcePrintAreas) ? input.sourcePrintAreas : (Array.isArray(input.printAreas) ? input.printAreas : []))
    .map(value => slug(value)).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).slice(0, 16)
  return {
    id,
    title:clean(input.title || id, 160),
    category,
    description:clean(input.description, 500),
    material:clean(input.material, 120),
    printAreas:(Array.isArray(input.printAreas) ? input.printAreas : ['front-center']).map(printArea).filter((value, index, all) => all.indexOf(value) === index).slice(0, 9),
    sourcePrintAreas,
    sizes:Array.isArray(input.sizes) ? input.sizes.map(value => clean(value, 32)).filter(Boolean).slice(0, 40) : [],
    adapterSizes:Array.isArray(adapterInput.sizes) ? adapterInput.sizes.map(value => clean(value, 32)).filter(Boolean).slice(0, 40) : [],
    preview,
    sourceUrl,
    sourceSlug:clean(input.sourceSlug || '', 120),
    sourceVerifiedAt:clean(input.sourceVerifiedAt || '', 40),
    sourceEvidence:clean(input.sourceEvidence || '', 300),
    basePrice:Number.isFinite(Number(input.basePrice)) ? Number(input.basePrice) : null,
    premiumPrice:Number.isFinite(Number(input.premiumPrice)) ? Number(input.premiumPrice) : null,
    currency:clean(input.currency || 'USD', 8).toUpperCase(),
    assetStatus:status,
    mappingNote:clean(adapterInput.mappingNote || input.mappingNote, 240),
    sourceProvider:clean(input.sourceProvider || THREEDMOCKUPS_REFERENCE.provider, 80),
    licenseStatus:clean(input.licenseStatus || THREEDMOCKUPS_REFERENCE.licenseStatus, 80),
    assetPolicy:clean(input.assetPolicy || THREEDMOCKUPS_REFERENCE.assetPolicy, 300),
    adapter:provider && productId ? {
      provider,
      productId,
      manifest:clean(adapterInput.manifest, 240),
      status,
      exactModel:Boolean(adapterInput.exactModel),
      mappingNote:clean(adapterInput.mappingNote, 240)
    } : null
  }
}

export function normalizeMockupCatalog(input = {}) {
  const sourceEntries = Array.isArray(input) ? input : input.entries
  const entries = (Array.isArray(sourceEntries) ? sourceEntries : []).map(normalizeMockupCatalogEntry).filter(item => item.id)
  const seen = new Set()
  const unique = entries.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
  return {
    schemaVersion:MOCKUP_WORKFLOW_VERSION,
    provider:'jersevo',
    generatedAt:clean(input.generatedAt || new Date().toISOString(), 40),
    source:THREEDMOCKUPS_REFERENCE,
    entries:unique
  }
}

export function isJersevoOwnedMockupAsset(asset = {}) {
  const source = clean(asset.source, 400)
  // A leading single slash is a local public asset.  Protocol-relative URLs
  // (`//host/...`) are deliberately not treated as local because they can
  // silently point the editor at an untrusted origin.
  if (source.startsWith('/') && !source.startsWith('//')) return true
  let url
  try { url = new URL(source) } catch { return false }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'jersevo.com' || host.endsWith('.jersevo.com')) return true
  // Keep previews on the configured Jersevo Supabase project.  The fallback
  // is the current production project so the metadata sync script (which is
  // intentionally independent of Vite's env loader) preserves known assets.
  const configuredHost = (() => {
    try {
      const value = import.meta.env?.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') || ''
      return new URL(value).hostname.toLowerCase()
    } catch { return '' }
  })()
  const allowedSupabaseHost = configuredHost || 'ofetusgarxcwloxxkhnr.supabase.co'
  return host === allowedSupabaseHost && /^\/storage\/v1\/object\/public\/product-media\//i.test(url.pathname)
}

export function mockupPlacement(value) {
  return MOCKUP_PRINT_AREAS.find(item => item.id === printArea(value)) || MOCKUP_PRINT_AREAS[0]
}
