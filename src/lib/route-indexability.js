import { catalogPagePath, parseCatalogPagePath } from './catalog-pagination.js'

export const CATALOG_SEARCH_PARAMS = Object.freeze(['search', 'q'])
export const CATALOG_FACET_PARAMS = Object.freeze(['color', 'size', 'team', 'sport', 'league', 'brand', 'price', 'group', 'type', 'sort', 'stock', 'custom'])
export const PRODUCT_PERSONALIZATION_PARAMS = Object.freeze(['name', 'number', 'teamCity', 'year', 'color', 'photo', 'teamLogo', 'printText', 'note'])

const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|mc_[a-z0-9_]+)$/i
// Team product-type landings are controlled descendants of a team route. Keep
// them in the same crawl/robots contract as the parent instead of treating
// `/team/nfl/dallas-cowboys/jerseys` as an arbitrary application path.
const CATALOG_BASE = /^(?:\/shop|\/category\/[^/]+|\/league\/[^/]+|\/team\/[^/]+\/[^/]+(?:\/[^/]+)?|\/(?:collection|collections)\/[^/]+)$/
const PRODUCT_ROUTE = /^\/product\/[^/]+$/

function cleanPath(value) {
  const path = String(value || '/').split(/[?#]/, 1)[0].replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return path || '/'
}

function paramsFrom(value) {
  const search = String(value || '').replace(/^\?/, '')
  return new URLSearchParams(search)
}

export function isCatalogRoute(pathname = '') {
  const parsed = parseCatalogPagePath(cleanPath(pathname))
  return CATALOG_BASE.test(parsed.basePath)
}

export function isProductRoute(pathname = '') {
  return PRODUCT_ROUTE.test(cleanPath(pathname))
}

function searchString(params) {
  const value = params.toString()
  return value ? `?${value}` : ''
}

/**
 * One request-level contract shared by browser metadata and Vercel routing.
 * It does not decide whether a known page has enough products to index; it
 * only handles URL shape, duplicate parameters and crawl-space controls.
 */
export function routeIndexability({ pathname = '/', search = '' } = {}) {
  const path = cleanPath(pathname)
  const query = paramsFrom(search)
  const catalog = isCatalogRoute(path)
  const product = isProductRoute(path)
  const parsed = catalog ? parseCatalogPagePath(path) : { basePath: path, page: 1, paginated: false }
  const canonicalBasePath = parsed.basePath.replace(/^\/collections\//, '/collection/')
  const canonicalPath = catalog ? catalogPagePath(canonicalBasePath, parsed.page) : path
  const reasons = []
  let redirectPath = ''

  // Older menu records used the plural alias. Keep one canonical storefront
  // URL so direct links and crawlers land on the same collection page.
  if (/^\/collections\//.test(path)) redirectPath = canonicalPath

  if (catalog && query.has('page')) {
    const rawPage = String(query.get('page') || '')
    if (/^\d+$/.test(rawPage)) {
      const requestedPage = Math.max(1, Number.parseInt(rawPage, 10) || 1)
      const nextQuery = new URLSearchParams(query)
      nextQuery.delete('page')
      redirectPath = `${catalogPagePath(canonicalBasePath, requestedPage)}${searchString(nextQuery)}`
    } else {
      reasons.push('INVALID_PAGE_QUERY')
    }
  }

  if (catalog) {
    const keys = [...new Set([...query.keys()])]
    if (keys.some(key => CATALOG_SEARCH_PARAMS.includes(key))) reasons.push('CATALOG_SEARCH_QUERY')
    if (keys.some(key => CATALOG_FACET_PARAMS.includes(key))) reasons.push('CATALOG_FACET_QUERY')
    const unknown = keys.filter(key => key !== 'page' && !CATALOG_SEARCH_PARAMS.includes(key) && !CATALOG_FACET_PARAMS.includes(key) && !TRACKING_PARAM.test(key))
    if (unknown.length) reasons.push('UNKNOWN_CATALOG_QUERY')
  }

  if (product) {
    const keys = [...new Set([...query.keys()])]
    const personal = keys.some(key => PRODUCT_PERSONALIZATION_PARAMS.includes(key))
    if (personal) reasons.push('PRODUCT_PERSONALIZATION_QUERY')
    const unknown = keys.filter(key => !['variant', 'custom'].includes(key) && !PRODUCT_PERSONALIZATION_PARAMS.includes(key) && !TRACKING_PARAM.test(key))
    if (unknown.length) reasons.push('UNKNOWN_PRODUCT_QUERY')
  }

  const cleanReasons = [...new Set(reasons)]
  return {
    pathname: path,
    canonicalPath,
    catalogRoute: catalog,
    productRoute: product,
    redirectPath,
    noindex: cleanReasons.length > 0,
    robots: cleanReasons.length ? 'noindex, follow' : 'index, follow',
    reasons: cleanReasons,
    trackingOnly: query.size > 0 && [...query.keys()].every(key => TRACKING_PARAM.test(key))
  }
}
