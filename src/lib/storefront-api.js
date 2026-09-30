// The storefront only needs a small async facade during the first paint.
// Keep the Supabase SDK and its admin/catalog helpers in an on-demand chunk;
// the browser can render the shell and fallback content before live data is
// requested. Admin and checkout continue to import the full module directly.
let supabaseModulePromise

const loadSupabaseModule = () => {
  if (!supabaseModulePromise) supabaseModulePromise = import('./supabase')
  return supabaseModulePromise
}

const forward = name => (...args) => loadSupabaseModule().then(module => module[name](...args))

export const fetchStorefrontProduct = forward('fetchStorefrontProduct')
export const fetchStorefrontDesignerProduct = forward('fetchStorefrontDesignerProduct')
export const fetchStorefrontCatalogPage = forward('fetchStorefrontCatalogPage')
export const fetchStorefrontCollectionPage = forward('fetchStorefrontCollectionPage')
export const fetchStorefrontSearch = forward('fetchStorefrontSearch')
export const fetchStorefrontNavigationIndex = forward('fetchStorefrontNavigationIndex')
export const fetchStorefrontMenus = forward('fetchStorefrontMenus')
export const fetchStorefrontCollections = forward('fetchStorefrontCollections')
export const fetchStorefrontTheme = forward('fetchStorefrontTheme')
export const uploadCustomerReference = forward('uploadCustomerReference')
export const createExactLogoPreview = forward('createExactLogoPreview')
export const createAiLogoPreview = forward('createAiLogoPreview')
export const createCustomizationOrder = forward('createCustomizationOrder')
export const customerAuthSnapshot = forward('customerAuthSnapshot')
export const requestCartValidation = forward('requestCartValidation')
export const requestMemberQuote = forward('requestMemberQuote')

export const getSupabase = () => loadSupabaseModule().then(module => module.supabase)

// This tiny browser-only helper is kept local so merely reading a session id
// does not pull the Supabase SDK into the initial storefront entry.
export function getCustomerSessionId() {
  const key = 'extra-time-customer-session'
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const created = `session_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
    window.localStorage.setItem(key, created)
    return created
  } catch {
    return `session_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
  }
}
