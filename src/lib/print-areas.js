// Public, normalized print-area contract shared by the storefront, designer
// listing importer and server-side preflight.  Keeping this separate from
// private provider metadata lets Quick AI render only the production surfaces
// that a listing has explicitly published.

const AREA_ID = /^[a-z0-9][a-z0-9_-]{0,48}$/i
const AREA_LABEL = /^[^<>]{1,80}$/
const MASK_URL = /^(?:\/|https:\/\/|https?:\/\/)/i

export const QUICK_PRINT_AREAS = Object.freeze([
  { id:'front', surface:'front', label:'Front', widthMm:320, heightMm:400, bleedMm:5, safeAreaMm:12, maxDpi:300 },
  { id:'back', surface:'back', label:'Back', widthMm:320, heightMm:400, bleedMm:5, safeAreaMm:12, maxDpi:300 },
  { id:'left-sleeve', surface:'left-sleeve', label:'Left sleeve', widthMm:105, heightMm:140, bleedMm:3, safeAreaMm:8, maxDpi:300 },
  { id:'right-sleeve', surface:'right-sleeve', label:'Right sleeve', widthMm:105, heightMm:140, bleedMm:3, safeAreaMm:8, maxDpi:300 }
])

const numberInRange = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

/**
 * Normalize untrusted listing data into the small public print-area shape.
 * Invalid areas are dropped rather than guessed; an empty list keeps the
 * artwork flow saveable while correctly disabling ordering.
 */
export function normalizePrintAreas(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.slice(0, 16).flatMap(area => {
    if (!area || typeof area !== 'object' || Array.isArray(area)) return []
    const id = String(area.id || area.surface || '').trim().toLowerCase()
    const widthMm = Number(area.widthMm ?? area.width_mm)
    const heightMm = Number(area.heightMm ?? area.height_mm)
    if (!AREA_ID.test(id) || seen.has(id) || !Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 20 || widthMm > 2000 || heightMm < 20 || heightMm > 2000) return []
    const label = String(area.label || area.surface || id).trim().replace(/\s+/g, ' ')
    if (!AREA_LABEL.test(label)) return []
    seen.add(id)
    const bleedMm = numberInRange(area.bleedMm ?? area.bleed_mm, 0, 100, 0)
    const safeAreaMm = numberInRange(area.safeAreaMm ?? area.safe_area_mm, 0, Math.min(widthMm, heightMm) / 2, 0)
    const maxDpi = Math.round(numberInRange(area.maxDpi ?? area.max_dpi, 72, 1200, 300))
    const maskUrl = String(area.maskUrl || area.mask_url || '').trim()
    return [{
      id,
      surface: String(area.surface || id).trim().slice(0, 48) || id,
      label,
      widthMm: Math.round(widthMm * 100) / 100,
      heightMm: Math.round(heightMm * 100) / 100,
      bleedMm: Math.round(bleedMm * 100) / 100,
      safeAreaMm: Math.round(safeAreaMm * 100) / 100,
      maxDpi,
      ...(maskUrl && MASK_URL.test(maskUrl) ? { maskUrl: maskUrl.slice(0, 500) } : {})
    }]
  })
}
