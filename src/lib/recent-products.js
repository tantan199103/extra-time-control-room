export const RECENT_PRODUCTS_KEY = 'jersevo:recently-viewed:v1'
export const MAX_RECENT_PRODUCTS = 10

const text = (value, max = 240) => String(value || '').trim().slice(0, max)
const defaultStorage = () => {
  try { return globalThis.localStorage || null } catch { return null }
}

export function recentProductSnapshot(product = {}) {
  const id = text(product.id || product.handle, 160)
  if (!id) return null
  const name = text(product.name || product.title || 'Product')
  return {
    id,
    handle:text(product.handle || id, 220),
    name,
    image:text(product.image, 1200),
    alt:text(product.alt || name),
    price:Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
    productGroup:text(product.productGroup || product.type, 120),
    league:text(product.taxonomy?.league || product.league, 120),
    team:text(product.taxonomy?.team || product.team, 160)
  }
}

export function readRecentlyViewed(storage = defaultStorage()) {
  if (!storage) return []
  try {
    const rows = JSON.parse(storage.getItem(RECENT_PRODUCTS_KEY) || '[]')
    if (!Array.isArray(rows)) return []
    const seen = new Set()
    return rows.map(recentProductSnapshot).filter(item => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).slice(0, MAX_RECENT_PRODUCTS)
  } catch { return [] }
}

export function rememberRecentlyViewed(product, storage = defaultStorage()) {
  const snapshot = recentProductSnapshot(product)
  if (!snapshot || !storage) return readRecentlyViewed(storage)
  const next = [snapshot, ...readRecentlyViewed(storage).filter(item => item.id !== snapshot.id)].slice(0, MAX_RECENT_PRODUCTS)
  try { storage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next)) } catch {}
  return next
}
