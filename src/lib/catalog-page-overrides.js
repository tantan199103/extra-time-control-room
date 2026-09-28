const cleanPath = value => {
  const raw = String(value || '').trim().split(/[?#]/)[0]
  if (!raw.startsWith('/')) return ''
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw
}

const cleanText = (value, limit = 4000) => String(value || '').trim().slice(0, limit)

export function normalizeCatalogPageOverride(path, value = {}) {
  const route = cleanPath(path || value.path)
  if (!route || !value || typeof value !== 'object' || Array.isArray(value)) return null
  return {
    path:route,
    title:cleanText(value.title || value.name, 160),
    description:cleanText(value.description, 4000),
    hero:cleanText(value.hero || value.heroImage || value.image, 2000),
    heroAlt:cleanText(value.heroAlt || value.hero_alt || value.imageAlt, 240),
    seoTitle:cleanText(value.seoTitle || value.seo_title || value.seo?.title, 180),
    seoDescription:cleanText(value.seoDescription || value.seo_description || value.seo?.description, 320),
    hidden:Boolean(value.hidden || String(value.status || '').toUpperCase() === 'HIDDEN'),
    updatedAt:cleanText(value.updatedAt || value.updated_at, 80)
  }
}

export function normalizeCatalogPageOverrides(value = {}) {
  const entries = Array.isArray(value)
    ? value.map(item => [item?.path, item])
    : value && typeof value === 'object'
      ? Object.entries(value)
      : []
  return Object.fromEntries(entries.map(([path, row]) => {
    const normalized = normalizeCatalogPageOverride(path, row)
    return normalized ? [normalized.path, normalized] : null
  }).filter(Boolean))
}

export function catalogPageOverrideFor(value, path) {
  const route = cleanPath(path)
  if (!route) return null
  return normalizeCatalogPageOverrides(value)[route] || null
}

export function applyCatalogPageOverride(page, value) {
  if (!page?.path) return page
  const override = catalogPageOverrideFor(value, page.path)
  if (!override) return page
  return {
    ...page,
    name:override.title || page.name,
    description:override.description || page.description,
    hero:override.hero || page.hero,
    heroAlt:override.heroAlt || page.heroAlt || '',
    seoTitle:override.seoTitle || '',
    seoDescription:override.seoDescription || '',
    hidden:override.hidden,
    customized:true,
    override
  }
}

export function upsertCatalogPageOverride(value, path, patch = {}) {
  const current = normalizeCatalogPageOverrides(value)
  const route = cleanPath(path)
  if (!route) throw new Error('A valid catalog page path is required.')
  const next = normalizeCatalogPageOverride(route, { ...(current[route] || {}), ...patch, path:route })
  return { ...current, [route]:next }
}

export function catalogPageRouteCanDeleteProducts(path) {
  const parts = cleanPath(path).split('/').filter(Boolean)
  return parts[0] === 'league' && parts.length === 2 || parts[0] === 'team' && (parts.length === 3 || parts.length === 4) || parts[0] === 'category' && parts.length === 2
}
