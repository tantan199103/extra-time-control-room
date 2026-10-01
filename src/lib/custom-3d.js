/**
 * Public contract for listings that can safely enter the 3D Custom Lab.
 *
 * A listing having custom fields is not enough: Comma and other imports can
 * accept a name/number for a flat 2D artwork.  A 3D contract must point at
 * one of the local, provider-scoped manifests used by the designer.  It may
 * either be a private Custom Lab source row or a normal retail PDP that has
 * opted into the same editor.
 */

const PROVIDERS = Object.freeze(new Set(['owayo', 'boombah']))

const MANIFEST_PATTERNS = Object.freeze({
  owayo: /^\/designer\/owayo\/[a-z0-9][a-z0-9/_-]*\.json$/i,
  boombah: /^\/designer\/boombah\/products\/[a-z0-9][a-z0-9-]*\.json$/i
})

const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i
const LAYER_KINDS = Object.freeze(new Set(['team', 'name', 'number', 'logo', 'artwork']))
const PRINT_AREAS = Object.freeze(new Set(['front-center', 'front-left-chest', 'front-right-chest', 'front-lower', 'back-upper', 'back-center', 'back-lower', 'left-sleeve', 'right-sleeve']))
const TEXT_FONTS = Object.freeze(new Set(['Barlow Condensed', 'Manrope', 'Arial', 'Georgia', 'Impact']))

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
  const result = {
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
  // A retail listing may expose the same editor contract while remaining a
  // normal sellable row in Shop/Search/PDP.  Keep this opt-in so legacy
  // designer source rows retain their Custom-Lab-only behaviour.
  const visibility = text(raw.catalogVisibility || raw.catalog_visibility || raw.visibility).toUpperCase()
  if (visibility === 'RETAIL' || visibility === 'CUSTOM_ONLY') result.catalogVisibility = visibility

  const safeText = value => text(value).slice(0, 32)
  if (raw.defaultText && typeof raw.defaultText === 'object' && !Array.isArray(raw.defaultText)) {
    const color = /^#[0-9a-f]{6}$/i.test(String(raw.defaultText.color || '')) ? String(raw.defaultText.color).toUpperCase() : ''
    const outlineColor = /^#[0-9a-f]{6}$/i.test(String(raw.defaultText.outlineColor || '')) ? String(raw.defaultText.outlineColor).toUpperCase() : ''
    const outlineWidth = Number(raw.defaultText.outlineWidth)
    const font = TEXT_FONTS.has(String(raw.defaultText.font || '')) ? String(raw.defaultText.font) : ''
    const numberStyle = text(raw.defaultText.numberStyle).toLowerCase() === 'carbon' ? 'carbon' : ''
    result.defaultText = {
      ...(safeText(raw.defaultText.team) ? { team:safeText(raw.defaultText.team) } : {}),
      ...(safeText(raw.defaultText.name) ? { name:safeText(raw.defaultText.name) } : {}),
      ...(safeText(raw.defaultText.number).replace(/\D/g, '') ? { number:safeText(raw.defaultText.number).replace(/\D/g, '').slice(0, 3) } : {}),
      ...(color ? { color } : {}),
      ...(outlineColor ? { outlineColor } : {}),
      ...(Number.isFinite(outlineWidth) ? { outlineWidth:Math.max(0, Math.min(24, outlineWidth)) } : {}),
      ...(font ? { font } : {}),
      ...(numberStyle ? { numberStyle } : {})
    }
  }
  if (raw.defaultColors && typeof raw.defaultColors === 'object' && !Array.isArray(raw.defaultColors)) {
    const colors = Object.fromEntries(Object.entries(raw.defaultColors)
      .slice(0, 12)
      .filter(([key, value]) => /^[a-z0-9_-]{1,24}$/i.test(String(key)) && /^#[0-9a-f]{6}$/i.test(String(value || '')))
      .map(([key, value]) => [key, String(value).toUpperCase()]))
    if (Object.keys(colors).length) result.defaultColors = colors
  }
  if (Array.isArray(raw.defaultLayers)) {
    const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback
    result.defaultLayers = raw.defaultLayers.slice(0, 24).flatMap(layer => {
      const kind = text(layer?.kind).toLowerCase()
      const placement = text(layer?.placement).toLowerCase()
      if (!LAYER_KINDS.has(kind) || !PRINT_AREAS.has(placement)) return []
      return [{
        kind,
        placement,
        x:clamp(layer.x, -1, 1, 0),
        y:clamp(layer.y, -1, 1, 0),
        scale:clamp(layer.scale, ['logo', 'artwork'].includes(kind) ? .25 : .55, 2, 1),
        rotation:clamp(layer.rotation, ['logo', 'artwork'].includes(kind) ? -180 : -30, ['logo', 'artwork'].includes(kind) ? 180 : 30, 0),
        ...( /^#[0-9a-f]{6}$/i.test(String(layer.color || '')) ? { color:String(layer.color).toUpperCase() } : {} ),
        ...( /^#[0-9a-f]{6}$/i.test(String(layer.outlineColor || '')) ? { outlineColor:String(layer.outlineColor).toUpperCase() } : {} ),
        ...( /^#[0-9a-f]{6}$/i.test(String(layer.textureColor || '')) ? { textureColor:String(layer.textureColor).toUpperCase() } : {} )
      }]
    })
  }
  return result
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
 * Only private designer source rows are production inputs for the Custom Lab.
 * Keep this predicate at the public model boundary so Shop, search, taxonomy
 * hubs and collections can all make the same visibility decision without
 * guessing from a title or product group.
 */
export function isCustom3DOnlyProduct(product = {}) {
  const config = custom3DDesignerConfig(product)
  return Boolean(config && config.catalogVisibility !== 'RETAIL')
}

/**
 * A normal retail listing can offer the 3D editor without being moved into
 * the private Custom Lab catalogue.  Keeping this predicate explicit avoids
 * accidentally hiding a ready-to-buy PDP when a designer contract is added.
 */
export function isRetail3DCustomizableProduct(product = {}) {
  const config = custom3DDesignerConfig(product)
  return Boolean(config?.catalogVisibility === 'RETAIL')
}

export function custom3DManifestIsSafe(provider, manifest) {
  return providerManifestIsSafe(provider, manifest)
}
