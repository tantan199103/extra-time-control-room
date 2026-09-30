/**
 * Public contract for listings that can safely enter the 3D Custom Lab.
 *
 * A listing having custom fields is not enough: Comma and other imports can
 * accept a name/number for a flat 2D artwork.  The Custom Lab is reserved for
 * listings that point at one of the local, provider-scoped 3D manifests used
 * by the designer and carry the public `3d-designer` marker.
 */

const PROVIDERS = Object.freeze(new Set(['owayo', 'boombah']))

const MANIFEST_PATTERNS = Object.freeze({
  owayo: /^\/designer\/owayo\/[a-z0-9][a-z0-9/_-]*\.json$/i,
  boombah: /^\/designer\/boombah\/products\/[a-z0-9][a-z0-9-]*\.json$/i
})

const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i

const text = value => String(value ?? '').trim()

function providerManifestIsSafe(provider, manifest) {
  const normalizedProvider = text(provider).toLowerCase()
  const value = text(manifest)
  return Boolean(PROVIDERS.has(normalizedProvider) && MANIFEST_PATTERNS[normalizedProvider]?.test(value))
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const provider = text(raw.provider).toLowerCase()
  const productId = text(raw.productId || raw.product_id)
  const manifest = text(raw.manifest || raw.manifestPath || raw.manifest_path)
  if (!PROVIDERS.has(provider) || !PRODUCT_ID_PATTERN.test(productId) || !providerManifestIsSafe(provider, manifest)) return null
  return {
    provider,
    productId,
    manifest,
    defaultDesignId:text(raw.defaultDesignId || raw.default_design_id),
    defaultStyleCode:text(raw.defaultStyleCode || raw.default_style_code),
    allowedStyleCodes:Array.isArray(raw.allowedStyleCodes)
      ? raw.allowedStyleCodes.map(text).filter(Boolean).slice(0, 200)
      : [],
    allowedDesignIds:Array.isArray(raw.allowedDesignIds)
      ? raw.allowedDesignIds.map(text).filter(Boolean).slice(0, 5000)
      : []
  }
}

function tagConfig(product = {}) {
  const tags = Array.isArray(product.tags)
    ? product.tags.map(value => text(value).toLowerCase()).filter(Boolean)
    : []
  if (!tags.includes('3d-designer')) return null

  const productTag = tags.find(value => value.startsWith('designer-product-'))
  if (!productTag) return null
  const taggedProductId = productTag.slice('designer-product-'.length).trim()
  if (!PRODUCT_ID_PATTERN.test(taggedProductId)) return null

  // Boombah listings predate the provider tag; their manifest contract is
  // still unambiguous because `designer-product-*` is reserved for that
  // provider when no explicit provider marker is present.
  const providerTag = tags.find(value => value.startsWith('designer-provider-'))
  // Early Owayo imports only carried `designer-product-*`; infer every
  // reserved Owayo catalogue namespace so stripped public records still route
  // to the exact synchronized garment manifest.
  const provider = providerTag
    ? providerTag.slice('designer-provider-'.length)
    : /^(?:cycling|basketball|hockey|motocross|soccer|running|tshirts)-/i.test(taggedProductId) ? 'owayo' : 'boombah'
  if (!PROVIDERS.has(provider)) return null
  const productId = provider === 'boombah' ? taggedProductId.toUpperCase() : taggedProductId.toLowerCase()
  const manifest = provider === 'owayo'
    ? `/designer/owayo/${productId.toLowerCase()}/manifest.json`
    : `/designer/boombah/products/${productId.toLowerCase()}.json`
  if (!providerManifestIsSafe(provider, manifest)) return null
  return normalizeConfig({ provider, productId, manifest })
}

/**
 * Return the validated public designer contract, or null for a normal
 * personalized/2D listing.
 */
export function custom3DDesignerConfig(product = {}) {
  // Storefront data is hydrated asynchronously. Callers may briefly pass
  // `null` while the live catalogue is loading; treat that as a normal
  // non-designer listing instead of letting the homepage crash during the
  // first render.
  const safeProduct = product && typeof product === 'object' ? product : {}
  const raw = safeProduct.designerConfig || safeProduct.aiMetadata?.designer || safeProduct.ai_metadata?.designer
  return normalizeConfig(raw) || tagConfig(safeProduct)
}

export function hasCustom3DDesigner(product = {}) {
  return Boolean(custom3DDesignerConfig(product))
}

/**
 * 3D designer listings are production inputs for the Custom Lab rather than
 * ordinary ready-to-buy catalogue rows.  Keep this predicate at the public
 * model boundary so Shop, search, taxonomy hubs and collections can all make
 * the same visibility decision without guessing from a title or product
 * group.
 */
export function isCustom3DOnlyProduct(product = {}) {
  return hasCustom3DDesigner(product)
}

export function custom3DManifestIsSafe(provider, manifest) {
  return providerManifestIsSafe(provider, manifest)
}
