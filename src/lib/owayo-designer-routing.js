const text = value => String(value ?? '').trim()

export function owayoFamilyByProductId(catalog, productId) {
  const value = text(productId).toLowerCase()
  if (!value) return null
  return (catalog?.products || []).find(item => text(item?.id).toLowerCase() === value || text(item?.key).toLowerCase() === value) || null
}

export function owayoManifestForProduct(catalog, productId, fallback = '/designer/owayo/cycling-c3/manifest.json') {
  const family = owayoFamilyByProductId(catalog, productId)
  return family?.assetsReady && family?.manifest ? family.manifest : fallback
}

/**
 * Resolve the public manifest path before fetching assets. Listing metadata is
 * authoritative; otherwise a route/draft family id selects the matching local
 * manifest. Unknown or pending families intentionally fall back to C3 only for
 * the generic builder entry point, never for a listing-owned route.
 */
export function resolveOwayoManifestRequest({ catalog, listingDesigner = null, routeProduct = '', draftProduct = '', fallback } = {}) {
  if (listingDesigner?.provider === 'owayo' && text(listingDesigner.manifest)) return text(listingDesigner.manifest)
  const familyId = routeProduct || draftProduct
  return owayoManifestForProduct(catalog, familyId, fallback)
}
