// Normalized contracts for the artwork-first customization flow.
// The editor can use any canvas adapter; these values remain portable between
// the browser draft, a worker job and the 3D designer hand-off.

export const QUICK_STEPS = Object.freeze(['source', 'direction', 'variants', 'polish', 'product', 'review'])
export const ARTWORK_JOB_TYPES = Object.freeze(['generate', 'redesign', 'remix', 'inpaint', 'upscale', 'removeBackground', 'cleanup'])
export const ARTWORK_JOB_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled'])

export const QUICK_STYLES = Object.freeze([
  { id:'retro-mascot', label:'Retro mascot', detail:'Varsity energy' },
  { id:'street-collage', label:'Street collage', detail:'Cut-and-paste' },
  { id:'soft-chibi-pet', label:'Soft chibi pet', detail:'Friendly character' },
  { id:'gothic-ink', label:'Gothic ink', detail:'Sharp blackwork' },
  { id:'y2k-chrome', label:'Y2K chrome', detail:'Reflective type' },
  { id:'collegiate-sports', label:'Collegiate sports', detail:'Team poster' },
  { id:'halftone-poster', label:'Halftone poster', detail:'Print texture' },
  { id:'folk-illustration', label:'Folk illustration', detail:'Handmade rhythm' }
])

export const QUICK_DEFAULTS = Object.freeze({
  aspect:'square', palette:'auto', colorCount:'full', strength:.72,
  preserveSubject:true, preserveText:false, variants:2, style:'retro-mascot'
})

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export function normalizeTransform(input = {}) {
  return {
    x:clamp(input.x, 0, 1, .5),
    y:clamp(input.y, 0, 1, .5),
    width:clamp(input.width, .05, 1, .72),
    height:clamp(input.height, .05, 1, .72),
    scale:clamp(input.scale, .2, 2.5, 1),
    rotation:clamp(input.rotation, -180, 180, 0),
    opacity:clamp(input.opacity, 0, 1, 1),
    flipX:Boolean(input.flipX),
    flipY:Boolean(input.flipY)
  }
}

export function normalizeAdjustments(input = {}) {
  return {
    brightness:clamp(input.brightness, -100, 100, 0),
    contrast:clamp(input.contrast, -100, 100, 0),
    saturation:clamp(input.saturation, -100, 100, 0),
    crop:input.crop && typeof input.crop === 'object' ? {
      x:clamp(input.crop.x, 0, 1, 0), y:clamp(input.crop.y, 0, 1, 0),
      width:clamp(input.crop.width, .01, 1, 1), height:clamp(input.crop.height, .01, 1, 1)
    } : null
  }
}

export function normalizeArtworkAsset(input = {}) {
  return {
    id:String(input.id || ''), storageKey:String(input.storageKey || ''),
    mime:String(input.mime || 'image/png'), widthPx:Number(input.widthPx) || 0,
    heightPx:Number(input.heightPx) || 0, dpi:Number(input.dpi) || 0,
    sha256:String(input.sha256 || ''), source:['upload','ai-generated','remix','cleanup'].includes(input.source) ? input.source : 'upload',
    consent:Boolean(input.consent), private:input.private !== false,
    verified:Boolean(input.verified),
    // Browser-only presentation metadata. These flags never grant checkout
    // authority; the server still requires a verified asset row.
    previewOnly:Boolean(input.previewOnly), jobId:String(input.jobId || ''), variantId:String(input.variantId || ''),
    url:String(input.url || ''), name:String(input.name || 'Artwork'),
    createdAt:String(input.createdAt || new Date().toISOString())
  }
}

export function normalizeArtworkJob(input = {}) {
  return {
    id:String(input.id || ''), type:ARTWORK_JOB_TYPES.includes(input.type) ? input.type : 'generate',
    prompt:String(input.prompt || '').slice(0, 1200), style:String(input.style || QUICK_DEFAULTS.style),
    sourceAssetIds:Array.isArray(input.sourceAssetIds) ? input.sourceAssetIds.map(String).slice(0, 4) : [],
    params:input.params && typeof input.params === 'object' ? input.params : {},
    status:ARTWORK_JOB_STATUSES.includes(input.status) ? input.status : 'queued',
    variants:Array.isArray(input.variants) ? input.variants : [],
    error:String(input.error || ''), retryAfter:Number(input.retryAfter) || 0,
    createdAt:String(input.createdAt || new Date().toISOString()), updatedAt:String(input.updatedAt || new Date().toISOString())
  }
}

export function normalizeQuickDraft(input = {}) {
  const settings = { ...QUICK_DEFAULTS, ...(input.settings || {}) }
  const variants = Array.isArray(input.variants)
    ? input.variants.slice(0, 4).filter(item => item && typeof item === 'object').map(item => ({
      ...item,
      id:String(item.id || ''), assetId:item.assetId ? String(item.assetId) : null,
      url:String(item.url || item.previewUrl || ''), name:String(item.name || 'AI variant').slice(0, 120),
      previewOnly:Boolean(item.previewOnly), verified:Boolean(item.verified), seed:Number(item.seed) || 0
    }))
    : []
  return {
    id:String(input.id || `quick-${Date.now()}`), productId:String(input.productId || ''),
    variantId:String(input.variantId || ''), surfaceId:String(input.surfaceId || 'front'),
    assetId:String(input.assetId || ''), assetUrl:String(input.assetUrl || ''),
    assetName:String(input.assetName || 'Artwork').slice(0, 160), assetVerified:Boolean(input.assetVerified), assetPreviewOnly:Boolean(input.assetPreviewOnly),
    jobId:String(input.jobId || ''), jobKind:ARTWORK_JOB_TYPES.includes(input.jobKind) ? input.jobKind : 'generate', jobStatus:ARTWORK_JOB_STATUSES.includes(input.jobStatus) ? input.jobStatus : 'idle', step:QUICK_STEPS.includes(input.step) ? input.step : 'source',
    variants, selectedVariantId:String(input.selectedVariantId || ''),
    transform:normalizeTransform(input.transform), adjustments:normalizeAdjustments(input.adjustments),
    preflight:input.preflight && typeof input.preflight === 'object' ? input.preflight : null,
    lineage:input.lineage && typeof input.lineage === 'object' ? input.lineage : null,
    consent:Boolean(input.consent), settings,
    updatedAt:String(input.updatedAt || new Date().toISOString())
  }
}

export function saveQuickDraft(draft) {
  const normalized = normalizeQuickDraft(draft)
  try { localStorage.setItem('jersevo-quick-draft-v1', JSON.stringify(normalized)) } catch {}
  return normalized
}

export function readQuickDraft() {
  try {
    const raw = localStorage.getItem('jersevo-quick-draft-v1')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed ? normalizeQuickDraft(parsed) : null
  } catch { return null }
}

export function clearQuickDraft() {
  try { localStorage.removeItem('jersevo-quick-draft-v1') } catch {}
}
