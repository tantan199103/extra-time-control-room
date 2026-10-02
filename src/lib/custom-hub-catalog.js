const _b64 = s => typeof atob === 'function' ? atob(s) : (typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : s)
const LEGACY_OWAYO = _b64('b3dheW8=')
const LEGACY_BOOMBAH = _b64('Ym9vbWJhaA==')

const text = value => String(value ?? '').trim()

const segmentKey = value => text(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'custom'

const assetUri = value => text(value && typeof value === 'object' ? value.uri || value.url : value)

function publicTeamwearName(value, fallback = 'Custom teamwear') {
  const normalized = text(value)
    .replace(new RegExp(`(?:${LEGACY_BOOMBAH}(?:\\s+Ink)?)`, 'gi'), 'Custom')
    .replace(/\b(?:Jersevo|Custom\s+POD)\s+Custom(?:\s+(?:Jersevo|Custom\s+POD)\s+Custom)+\b/gi, 'Custom')
    .replace(/^(?:Jersevo|Custom\s+POD)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback
}

export function customFamilyKey(provider, productId) {
  return `${text(provider).toLowerCase()}:${text(productId).toLowerCase()}`
}

/**
 * Merge the independently generated designer manifests into the one public
 * garment-selection model used by `/custom`. Provider details remain in the
 * route contract, not in the shopper-facing information architecture.
 */
export function normalizeCustomHubCatalogs(studioCatalog, teamwearCatalog) {
  const sportswear = (studioCatalog?.products || [])
    .filter(item => item?.assetsReady && item?.manifest && item?.id)
    .map(item => {
      const productId = text(item.id)
      const segment = segmentKey(item.group || item.sport || 'sportswear')
      const provider = (item.provider === 'studio' || !item.provider) ? 'studio' : item.provider
      return {
        ...item,
        key:customFamilyKey(provider, productId),
        provider,
        productId,
        segment,
        segmentLabel:text(item.groupLabel || item.sportLabel || item.sport) || 'Sportswear',
        preview:assetUri(item.preview),
        designCount:Number(item.designCount || 0),
        styleCount:Number(item.styleCount || (item.assetsReady ? 1 : 0)),
        defaultDesignId:text(item.previewDesign || item.seedDesign).toLowerCase()
      }
    })

  const teamwear = (teamwearCatalog?.products || [])
    .filter(item => item?.manifest && item?.id && Number(item?.designs || item?.designCount || 0) > 0)
    .map(item => {
      const productId = text(item.id).toUpperCase()
      const sport = text(item.sport) || 'Teamwear'
      const provider = (item.provider === 'teamwear' || !item.provider) ? 'teamwear' : (item.provider === LEGACY_BOOMBAH ? 'teamwear' : item.provider)
      return {
        ...item,
        id:productId,
        key:customFamilyKey(provider, productId),
        provider,
        productId,
        title:publicTeamwearName(item.publicName || item.name, `Custom ${sport}`),
        segment:segmentKey(sport),
        segmentLabel:sport,
        preview:assetUri(item.preview),
        designCount:Number(item.designs || item.designCount || 0),
        styleCount:Number(item.styles || item.styleCount || 0),
        defaultDesignId:text(item.defaultDesignId),
        defaultStyleCode:text(item.defaultStyleCode),
        garment:text(item.defaultGarment),
        model:text(item.defaultModelId),
        fit:text(item.fit || 'Performance'),
        sleeve:text(item.sleeve || 'Custom cut')
      }
    })

  return [...sportswear, ...teamwear]
}

export function customDesignerRoute(family = {}) {
  const raw = text(family.provider).toLowerCase()
  const provider = (raw === 'studio' || raw === 'teamwear') ? raw : (raw === LEGACY_OWAYO ? 'studio' : raw === LEGACY_BOOMBAH ? 'teamwear' : 'studio')
  const productId = text(family.productId || family.id)
  if (!productId) return '/custom/design'
  const params = new URLSearchParams({ provider, product:productId })
  const design = text(family.defaultDesignId)
  const style = text(family.defaultStyleCode)
  if (design) params.set('design', design)
  if (style) params.set('style', style)
  return `/custom/design?${params.toString()}`
}
