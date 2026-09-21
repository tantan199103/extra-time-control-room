const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL']

const PROFILE_RANGES = {
  ADULT: { label:'Adult / Unisex', minHeight:145, maxHeight:205, defaultHeight:175, minWeight:40, maxWeight:180, defaultWeight:72 },
  WOMEN: { label:'Women', minHeight:140, maxHeight:195, defaultHeight:165, minWeight:35, maxWeight:150, defaultWeight:60 },
  KIDS: { label:'Kids', minHeight:90, maxHeight:165, defaultHeight:125, minWeight:15, maxWeight:80, defaultWeight:30 },
  YOUTH: { label:'Youth', minHeight:120, maxHeight:195, defaultHeight:155, minWeight:25, maxWeight:120, defaultWeight:50 }
}

const optionValue = (values, name) => Object.entries(values || {}).find(([key]) => key.toLowerCase() === String(name || '').toLowerCase())?.[1]

export function canonicalSize(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '')
  if (!compact) return ''
  if (compact === 'XSMALL') return 'XS'
  if (compact === 'SMALL') return 'S'
  if (compact === 'MEDIUM') return 'M'
  if (compact === 'LARGE') return 'L'
  if (compact === 'XLARGE') return 'XL'
  if (/^X{2,7}L$/.test(compact)) return `${compact.length - 1}XL`
  if (/^[2-7]XL$/.test(compact) || SIZE_ORDER.includes(compact)) return compact
  return compact
}

export function sizeRank(value) {
  return SIZE_ORDER.indexOf(canonicalSize(value))
}

export function audienceKey(value) {
  const text = String(value || '').trim().toLowerCase()
  if (/women|woman|female|ladies|lady/.test(text)) return 'WOMEN'
  if (/youth|junior|teen/.test(text)) return 'YOUTH'
  if (/kid|child|children|boy|girl/.test(text)) return 'KIDS'
  return 'ADULT'
}

export function sizeProfile(value) {
  return PROFILE_RANGES[audienceKey(value)]
}

export function findAudienceOption(product) {
  const names = new Set(['fit type', 'audience', 'age group', 'gender', 'wearer'])
  return (product?.options || []).find(option => names.has(String(option.name || '').trim().toLowerCase())) || null
}

export function sizeFinderAudiences(product) {
  const option = findAudienceOption(product)
  if (option?.values?.length) return [...new Set(option.values.filter(Boolean))].map(value => ({ value, label:value, key:audienceKey(value) }))
  if (!product) return ['Adult / Unisex', 'Women', 'Kids', 'Youth'].map(value => ({ value, label:value, key:audienceKey(value) }))
  const inferred = product.taxonomy?.audience || product.seo?.gmc?.age_group || product.seo?.gmc?.gender || 'Adult / Unisex'
  return [{ value:inferred, label:PROFILE_RANGES[audienceKey(inferred)].label, key:audienceKey(inferred) }]
}

export function availableFinderSizes(product, { sizeOptionName = 'Size', selections = {}, audienceOptionName = '', audienceValue = '' } = {}) {
  if (!product) return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL']
  const variants = (product.variants || []).filter(variant => String(variant.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(variant.inventory || 0) > 0)
  const matching = variants.filter(variant => Object.entries(variant.values || {}).every(([name, value]) => {
    if (name.toLowerCase() === String(sizeOptionName).toLowerCase()) return true
    if (audienceOptionName && name.toLowerCase() === audienceOptionName.toLowerCase()) return !audienceValue || value === audienceValue
    return !selections[name] || selections[name] === value
  }))
  const sortSizes = values => values.slice().sort((a, b) => {
    const left = sizeRank(a)
    const right = sizeRank(b)
    return (left < 0 ? Number.MAX_SAFE_INTEGER : left) - (right < 0 ? Number.MAX_SAFE_INTEGER : right)
      || String(a).localeCompare(String(b))
  })
  const values = sortSizes([...new Set(matching.map(variant => optionValue(variant.values, sizeOptionName)).filter(Boolean))])
  if (values.length || Array.isArray(product.variants)) return values
  return sortSizes((product.options || []).find(option => option.name.toLowerCase() === String(sizeOptionName).toLowerCase())?.values || [])
}

function adultTarget(height, weight, women = false) {
  const adjustedWeight = weight + (height - (women ? 165 : 175)) * .28
  const thresholds = women
    ? [46, 54, 63, 73, 84, 96, 109, 123, 138, 153, 168]
    : [52, 62, 73, 84, 96, 109, 123, 138, 153, 168, 183]
  const labels = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL']
  return labels[thresholds.findIndex(limit => adjustedWeight <= limit)] || '7XL'
}

function juniorTarget(height, weight, youth = false) {
  const heightLimits = youth ? [130, 142, 154, 166, 178, 188, 198] : [105, 118, 130, 142, 154, 164, 174]
  const weightLimits = youth ? [30, 38, 48, 60, 75, 90, 108] : [18, 25, 33, 43, 54, 66, 80]
  const labels = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']
  const heightIndex = heightLimits.findIndex(limit => height <= limit)
  const weightIndex = weightLimits.findIndex(limit => weight <= limit)
  return labels[Math.max(heightIndex < 0 ? labels.length - 1 : heightIndex, weightIndex < 0 ? labels.length - 1 : weightIndex)]
}

export function recommendCatalogSize({ audience = 'Adult / Unisex', heightCm, weightKg, fit = 'ATHLETIC', availableSizes = [] }) {
  const key = audienceKey(audience)
  const profile = PROFILE_RANGES[key]
  const height = Math.max(profile.minHeight, Math.min(profile.maxHeight, Number(heightCm) || profile.defaultHeight))
  const weight = Math.max(profile.minWeight, Math.min(profile.maxWeight, Number(weightKg) || profile.defaultWeight))
  const base = key === 'KIDS' || key === 'YOUTH'
    ? juniorTarget(height, weight, key === 'YOUTH')
    : adultTarget(height, weight, key === 'WOMEN')
  const baseRank = sizeRank(base)
  const targetRank = Math.min(SIZE_ORDER.length - 1, Math.max(0, baseRank + (fit === 'RELAXED' ? 1 : 0)))
  const candidates = [...new Set(availableSizes)].map((label, index) => ({ label, index, rank:sizeRank(label) })).filter(item => item.rank >= 0)
  if (!candidates.length) return null
  candidates.sort((a, b) => Math.abs(a.rank - targetRank) - Math.abs(b.rank - targetRank)
    || (fit === 'RELAXED' ? b.rank - a.rank : a.rank - b.rank)
    || a.index - b.index)
  return candidates[0].label
}
