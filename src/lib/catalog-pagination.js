export const CATALOG_PAGE_SIZE = 36

export function parseCatalogPagePath(pathname = '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  const match = path.match(/^(\/shop|\/category\/[^/]+|\/league\/[^/]+|\/team\/[^/]+\/[^/]+(?:\/[^/]+)?|\/(?:collection|collections)\/[^/]+)\/page\/(\d+)$/)
  if (!match) return { basePath:path, page:1, paginated:false }
  return {
    basePath:match[1] || '/',
    page:Number(match[2]),
    paginated:true
  }
}

export function catalogPagePath(basePath, page) {
  const base = String(basePath || '/').replace(/\/+$/, '') || '/'
  const target = Math.max(1, Math.trunc(Number(page) || 1))
  return target === 1 ? base : `${base}/page/${target}`
}

export function pageCount(total, pageSize = CATALOG_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / pageSize))
}
