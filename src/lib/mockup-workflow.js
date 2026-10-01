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
  assetPolicy:'Do not copy or redistribute third-party models, textures, templates or branding without a written license.'
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
  const preview = clean(input.preview || input.previewUrl, 400)
  const sourceUrl = clean(input.sourceUrl || THREEDMOCKUPS_REFERENCE.catalogUrl, 400)
  const provider = clean(input.provider || input.adapter?.provider, 40).toLowerCase()
  const productId = clean(input.productId || input.adapter?.productId, 80)
  return {
    id,
    title:clean(input.title || id, 160),
    category,
    description:clean(input.description, 500),
    material:clean(input.material, 120),
    printAreas:(Array.isArray(input.printAreas) ? input.printAreas : ['front-center']).map(printArea).filter((value, index, all) => all.indexOf(value) === index).slice(0, 9),
    sizes:Array.isArray(input.sizes) ? input.sizes.map(value => clean(value, 32)).filter(Boolean).slice(0, 40) : [],
    preview,
    sourceUrl,
    sourceProvider:clean(input.sourceProvider || THREEDMOCKUPS_REFERENCE.provider, 80),
    licenseStatus:clean(input.licenseStatus || THREEDMOCKUPS_REFERENCE.licenseStatus, 80),
    assetPolicy:clean(input.assetPolicy || THREEDMOCKUPS_REFERENCE.assetPolicy, 300),
    adapter:provider && productId ? { provider, productId, manifest:clean(input.adapter?.manifest, 240) } : null
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
  return source.startsWith('/') || /jersevo\.com|supabase\.co/i.test(source)
}

export function mockupPlacement(value) {
  return MOCKUP_PRINT_AREAS.find(item => item.id === printArea(value)) || MOCKUP_PRINT_AREAS[0]
}

