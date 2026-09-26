/*
 * Storefront theme contract.
 *
 * Theme Studio and the public app intentionally share this small resolver.
 * A page owns its layout and copy, while the theme provides safe defaults for
 * older rows that pre-date page-level editing.  Keeping the normalisation in
 * one place prevents the Admin preview and the storefront from drifting.
 */

const PATH_PAGE_IDS = [
  ['/', 'home'],
  ['/collection', 'collection'],
  ['/shop', 'collection'],
  ['/custom', 'custom'],
  ['/studio', 'custom'],
  ['/vault', 'vault'],
  ['/membership', 'membership'],
  ['/about', 'about'],
  ['/moments', 'story'],
  ['/players', 'players'],
  ['/journal', 'journal'],
  ['/shipping', 'shipping'],
  ['/returns', 'returns'],
  ['/warranty', 'warranty'],
  ['/privacy', 'privacy'],
  ['/terms', 'terms'],
  ['/accessibility', 'accessibility']
]

export function pageIdForPath(path = '/') {
  const value = String(path || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  if (value.startsWith('/product/')) return 'product'
  if (value.startsWith('/category/')) return 'collection'
  if (value.startsWith('/collection/')) return 'collection'
  if (value.startsWith('/collections/')) return 'collection'
  if (value.startsWith('/league/') || value.startsWith('/team/')) return 'collection'
  return PATH_PAGE_IDS.find(([prefix]) => value === prefix)?.[1] || 'home'
}

export function normalizePageLayout(layout) {
  if (!Array.isArray(layout)) return []
  return layout
    .map((entry, index) => {
      if (typeof entry === 'string') return { id: entry, enabled: true, order: index, settings: {} }
      if (!entry || typeof entry !== 'object') return null
      const id = String(entry.id || entry.blockId || entry.type || '').trim()
      if (!id) return null
      return {
        ...entry,
        id,
        enabled: entry.enabled !== false,
        order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,
        settings: entry.settings && typeof entry.settings === 'object' ? entry.settings : {}
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
}

export function resolveThemePage(theme, pageIdOrPath = 'home') {
  const wanted = String(pageIdOrPath || 'home').startsWith('/') ? pageIdForPath(pageIdOrPath) : pageIdOrPath
  const pages = Array.isArray(theme?.pages) ? theme.pages : []
  return pages.find(page => page?.id === wanted || page?.pageId === wanted) || null
}

export function resolvePageBlocks(theme, pageIdOrPath = 'home', defaults = []) {
  const page = resolveThemePage(theme, pageIdOrPath)
  const pageLayout = normalizePageLayout(page?.layout)
  const globalBlocks = Array.isArray(theme?.blocks) ? theme.blocks : []
  const rawLayout = Array.isArray(page?.layout) ? page.layout : []
  const legacyLayout = rawLayout.length > 0 && rawLayout.every(entry => typeof entry === 'string')
  // Older pages stored only a list of labels. Preserve those positions but
  // append current system blocks so an old publish cannot silently remove a
  // newly introduced storefront section.
  const pageId = String(pageIdOrPath || 'home').startsWith('/') ? pageIdForPath(pageIdOrPath) : pageIdOrPath
  const source = legacyLayout
    ? (pageId === 'home' ? (defaults.length ? defaults : globalBlocks) : defaults)
    : pageLayout.length ? pageLayout : pageId === 'home' ? (globalBlocks.length ? globalBlocks : defaults) : defaults
  const byId = new Map([...globalBlocks, ...defaults].filter(Boolean).map(block => [block.id, block]))
  const seen = new Set()
  return source.reduce((result, block, index) => {
    const id = block.id
    if (!id || seen.has(id)) return result
    const baseline = byId.get(id) || {}
    result.push({ ...baseline, ...block, id, order: index, enabled: block.enabled !== false, settings: { ...(baseline.settings || {}), ...(block.settings || {}) } })
    seen.add(id)
    return result
  }, [])
}

export function resolvePageContent(theme, pageIdOrPath = 'home', defaults = {}) {
  const pageId = String(pageIdOrPath || '').startsWith('/') ? pageIdForPath(pageIdOrPath) : pageIdOrPath
  const content = theme?.content && typeof theme.content === 'object' ? theme.content : {}
  const page = resolveThemePage(theme, pageId)
  const pages = content.pages && typeof content.pages === 'object' ? content.pages : {}
  const pageContent = pages[pageId] && typeof pages[pageId] === 'object' ? pages[pageId] : (content[pageId] && typeof content[pageId] === 'object' ? content[pageId] : {})
  // v1 stored Home fields at theme.content root. Keep those values readable
  // while new saves use content.pages[pageId].
  const legacy = pageId === 'home' ? content : {}
  return {
    ...defaults,
    ...legacy,
    ...pageContent,
    pageSettings: { ...(theme?.pageSettings?.[pageId] || {}), ...(page?.settings || {}), ...(pageContent.pageSettings || {}) },
    blocks: { ...(content.blocks || {}), ...(pageContent.blocks || {}) }
  }
}

export function resolveBlockContent(theme, pageIdOrPath, blockId, defaults = {}) {
  const content = resolvePageContent(theme, pageIdOrPath, {})
  const block = content.blocks?.[blockId] && typeof content.blocks[blockId] === 'object' ? content.blocks[blockId] : {}
  return { ...defaults, ...block }
}

export function mergePageLayoutWithDefaults(page, globalBlocks = [], defaults = []) {
  const current = normalizePageLayout(page?.layout)
  const legacy = Array.isArray(page?.layout) && page.layout.length > 0 && page.layout.every(entry => typeof entry === 'string')
  if (current.length && !legacy) return current
  // Legacy rows only carried opaque block names (for example `gallery` or
  // `product-info`). Prefer the page-specific fallback when one exists so a
  // legacy Product row does not make every page display the global homepage
  // block list in Theme Studio. The global list remains the safe fallback for
  // a newly-created/custom page with no known page contract.
  const source = defaults.length ? defaults : globalBlocks
  const byId = new Map([...globalBlocks, ...defaults].filter(Boolean).map(block => [block.id, block]))
  return source.filter(Boolean).map((block, index) => {
    const baseline = byId.get(block.id) || {}
    return { ...baseline, ...block, id: block.id, order: index, enabled: block.enabled !== false, settings: { ...(baseline.settings || {}), ...(block.settings || {}) } }
  })
}
