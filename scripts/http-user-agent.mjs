// Neutral, truthful identifier for first-party catalog synchronization jobs.
// Source servers may still record ordinary request metadata such as IP, time,
// and URL; this only keeps the storefront brand out of the User-Agent token.
export const CATALOG_SYNC_USER_AGENT = 'ProductCatalogSync/1.0'

export function catalogRequestHeaders(headers = {}) {
  return {
    ...headers,
    'user-agent': CATALOG_SYNC_USER_AGENT
  }
}
