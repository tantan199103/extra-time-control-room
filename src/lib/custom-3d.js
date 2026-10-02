/**
 * Public contract for listings that can safely enter the 3D Custom Lab.
 *
 * A listing having custom fields is not enough: Comma and other imports can
 * accept a name/number for a flat 2D artwork.  A 3D contract must point at
 * one of the local, provider-scoped manifests used by the designer.  It may
 * either be a private Custom Lab source row or a normal retail PDP that has
 * opted into the same editor.
 */

import { normalizePrintAreas } from './print-areas.js'

const _b64 = s => typeof atob === 'function' ? atob(s) : (typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : s)
const LEGACY_OWAYO = _b64('b3dheW8=')
const LEGACY_BOOMBAH = _b64('Ym9vbWJhaA==')

const CANONICAL_PROVIDERS = Object.freeze(new Set(['studio', 'teamwear']))
const PROVIDER_ALIASES = Object.freeze({
  [LEGACY_OWAYO]: 'studio',
  [LEGACY_BOOMBAH]: 'teamwear'
})
const PROVIDERS = Object.freeze(new Set(['studio', 'teamwear', LEGACY_OWAYO, LEGACY_BOOMBAH]))

const MANIFEST_PATTERNS = Object.freeze({
  studio: new RegExp(`^\\/designer\\/(?:studio|${LEGACY_OWAYO})\\/[a-z0-9][a-z0-9/_-]*\\.json$`, 'i'),
  teamwear: new RegExp(`^\\/designer\\/(?:teamwear|${LEGACY_BOOMBAH})\\/products\\/[a-z0-9][a-z0-9-]*\\.json$`, 'i'),
  [LEGACY_OWAYO]: new RegExp(`^\\/designer\\/(?:studio|${LEGACY_OWAYO})\\/[a-z0-9][a-z0-9/_-]*\\.json$`, 'i'),
  [LEGACY_BOOMBAH]: new RegExp(`^\\/designer\\/(?:teamwear|${LEGACY_BOOMBAH})\\/products\\/[a-z0-9][a-z0-9-]*\\.json$`, 'i')
})

const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i
const LAYER_KINDS = Object.freeze(new Set(['team', 'name', 'number', 'logo', 'artwork']))
const PRINT_AREAS = Object.freeze(new Set(['front-center', 'front-left-chest', 'front-right-chest', 'front-lower', 'back-upper', 'back-center', 'back-lower', 'left-sleeve', 'right-sleeve']))
const TEXT_FONTS = Object.freeze(new Set(['Barlow Condensed', 'Manrope', 'Arial', 'Georgia', 'Impact']))

const text = value => String(value ?? '').trim()

function canonicalizeProvider(raw) {
  const normalized = text(raw).toLowerCase()
  return PROVIDER_ALIASES[normalized] || normalized
}

function providerManifestIsSafe(provider, manifest) {
  const normalizedProvider = canonicalizeProvider(provider)
  const value = text(manifest)
  return Boolean(CANONICAL_PROVIDERS.has(normalizedProvider) && MANIFEST_PATTERNS[normalizedProvider]?.test(value))
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const provider = canonicalizeProvider(raw.provider)
  const productId = text(raw.productId || raw.product_id)
  let manifest = text(raw.manifest || raw.manifestPath || raw.manifest_path)
    .replace(new RegExp(`^\\/designer\\/${LEGACY_OWAYO}\\/`), '/designer/studio/')
    .replace(new RegExp(`^\\/designer\\/${LEGACY_BOOMBAH}\\/`), '/designer/teamwear/')
  if (!CANONICAL_PROVIDERS.has(provider) || !PRODUCT_ID_PATTERN.test(productId) || !providerManifestIsSafe(provider, manifest)) return null
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
      ? raw.allowedDesignIds.map(text).filter(Boolean).slice(0, 200)
      : []
  }
  if (raw.catalogVisibility === 'RETAIL') result.catalogVisibility = 'RETAIL'
  if (raw.defaultText && typeof raw.defaultText === 'object') {
    result.defaultText = {
      team:text(raw.defaultText.team).slice(0, 40),
      name:text(raw.defaultText.name).slice(0, 40),
      number:text(raw.defaultText.number).slice(0, 10)
    }
  }
  if (raw.defaultColors && typeof raw.defaultColors === 'object' && !Array.isArray(raw.defaultColors)) {
    result.defaultColors = Object.fromEntries(
      Object.entries(raw.defaultColors)
        .map(([k, v]) => [text(k), text(v)])
        .filter(([k, v]) => k && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v))
        .slice(0, 32)
    )
  }
  if (raw.defaultLayers && Array.isArray(raw.defaultLayers)) {
    result.defaultLayers = raw.defaultLayers
      .filter(item => item && typeof item === 'object')
      .map((item, index) => {
        const kind = text(item.kind).toLowerCase()
        const placement = text(item.placement).toLowerCase()
        if (!LAYER_KINDS.has(kind) || !PRINT_AREAS.has(placement)) return null
        const font = text(item.font)
        const color = text(item.color)
        const outlineColor = text(item.outlineColor || item.outline_color)
        return {
          id:text(item.id) || `layer-${index + 1}`,
          kind,
          placement,
          text:text(item.text).slice(0, 80),
          font:TEXT_FONTS.has(font) ? font : 'Barlow Condensed',
          color:/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#F8F8F4',
          outlineColor:/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(outlineColor) ? outlineColor : '#111311',
          outlineWidth:Math.max(0, Math.min(24, Number(item.outlineWidth ?? item.outline_width ?? 0) || 0)),
          curve:Math.max(-100, Math.min(100, Number(item.curve ?? 0) || 0)),
          letterSpacing:Math.max(-10, Math.min(40, Number(item.letterSpacing ?? item.letter_spacing ?? 0) || 0)),
          x:Math.max(-1, Math.min(1, Number(item.x ?? 0) || 0)),
          y:Math.max(-1, Math.min(1, Number(item.y ?? 0) || 0)),
          scale:Math.max(0.2, Math.min(3, Number(item.scale ?? 1) || 1)),
          rotation:Math.max(-180, Math.min(180, Number(item.rotation ?? 0) || 0)),
          opacity:Math.max(0.1, Math.min(1, Number(item.opacity ?? 1) || 1)),
          locked:Boolean(item.locked),
          visible:item.visible !== false
        }
      })
      .filter(Boolean)
      .slice(0, 32)
  }
  const printAreas = normalizePrintAreas(raw.printAreas || raw.print_areas)
  // Keep the legacy config shape stable when a listing has no public print
  // area yet. A non-empty contract is only exposed once it can be used by
  // Quick AI/preflight.
  if (printAreas?.length) result.printAreas = printAreas
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

  // Teamwear listings predate the provider tag; their manifest contract is
  // still unambiguous because `designer-product-*` is reserved for that
  // provider when no explicit provider marker is present.
  const providerTag = tags.find(value => value.startsWith('designer-provider-'))
  const rawProvider = providerTag
    ? providerTag.slice('designer-provider-'.length)
    : /^(?:cycling|basketball|hockey|motocross|soccer|running|tshirts)-/i.test(taggedProductId) ? 'studio' : 'teamwear'
  const provider = canonicalizeProvider(rawProvider)
  if (!CANONICAL_PROVIDERS.has(provider)) return null
  const productId = provider === 'teamwear' ? taggedProductId.toUpperCase() : taggedProductId.toLowerCase()
  const manifest = provider === 'studio'
    ? `/designer/studio/${productId.toLowerCase()}/manifest.json`
    : `/designer/teamwear/products/${productId.toLowerCase()}.json`
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
