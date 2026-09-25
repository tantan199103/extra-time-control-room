const SEARCH_FIELDS = new Set(['title', 'handle', 'sku', 'tags', 'description'])
const STATUSES = new Set(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'])
const CUSTOMIZABLE = new Set(['ANY', 'YES', 'NO'])

export const DEFAULT_COLLECTION_AUTOMATION = Object.freeze({
  enabled:false,
  keywordMode:'ANY',
  includeKeywords:[],
  excludeKeywords:[],
  searchFields:['title', 'sku', 'tags'],
  status:'ALL',
  productGroup:'',
  productType:'',
  league:'',
  team:'',
  customizable:'ANY'
})

const cleanText = value => String(value ?? '').trim().replace(/\s+/g, ' ')
const comparable = value => cleanText(value).toLocaleLowerCase('en-US')

export function parseCollectionKeywords(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/)
  return [...new Set(source.map(cleanText).filter(Boolean))].slice(0, 50)
}

export function normalizeCollectionAutomation(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const fields = Array.isArray(input.searchFields)
    ? [...new Set(input.searchFields.map(String).filter(field => SEARCH_FIELDS.has(field)))]
    : DEFAULT_COLLECTION_AUTOMATION.searchFields
  const status = String(input.status || 'ALL').toUpperCase()
  const customizable = String(input.customizable || 'ANY').toUpperCase()
  return {
    enabled:Boolean(input.enabled),
    keywordMode:String(input.keywordMode || '').toUpperCase() === 'ALL' ? 'ALL' : 'ANY',
    includeKeywords:parseCollectionKeywords(input.includeKeywords),
    excludeKeywords:parseCollectionKeywords(input.excludeKeywords),
    searchFields:fields.length ? fields : [...DEFAULT_COLLECTION_AUTOMATION.searchFields],
    status:STATUSES.has(status) ? status : 'ALL',
    productGroup:cleanText(input.productGroup),
    productType:cleanText(input.productType),
    league:cleanText(input.league),
    team:cleanText(input.team),
    customizable:CUSTOMIZABLE.has(customizable) ? customizable : 'ANY'
  }
}

export function collectionAutomationHasConditions(value = {}) {
  const rule = normalizeCollectionAutomation(value)
  return Boolean(
    rule.includeKeywords.length || rule.excludeKeywords.length ||
    rule.status !== 'ALL' || rule.productGroup || rule.productType ||
    rule.league || rule.team || rule.customizable !== 'ANY'
  )
}

function customFieldCount(product = {}) {
  const fields = product.customFields ?? product.custom_fields
  if (Array.isArray(fields) && fields.length) return fields.length
  return Array.isArray(product.personalization) ? product.personalization.length : 0
}

function searchDocument(product, fields) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const parts = []
  if (fields.includes('title')) parts.push(product.title, product.name, product.subtitle, product.story)
  if (fields.includes('handle')) parts.push(product.handle)
  if (fields.includes('sku')) parts.push(product.sku)
  if (fields.includes('tags')) parts.push(...(Array.isArray(product.tags) ? product.tags : []), taxonomy.league, taxonomy.team, taxonomy.category, taxonomy.brand)
  if (fields.includes('description')) parts.push(product.description)
  return comparable(parts.filter(Boolean).join(' '))
}

export function productMatchesCollectionAutomation(product = {}, value = {}) {
  const rule = normalizeCollectionAutomation(value)
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  if (rule.status !== 'ALL' && comparable(product.status) !== comparable(rule.status)) return false
  if (rule.productGroup && comparable(product.productGroup ?? product.product_group) !== comparable(rule.productGroup)) return false
  if (rule.productType && comparable(product.type) !== comparable(rule.productType)) return false
  if (rule.league && comparable(taxonomy.league) !== comparable(rule.league)) return false
  if (rule.team && comparable(taxonomy.team) !== comparable(rule.team)) return false
  const customizable = customFieldCount(product) > 0
  if (rule.customizable === 'YES' && !customizable) return false
  if (rule.customizable === 'NO' && customizable) return false

  const document = searchDocument(product, rule.searchFields)
  if (rule.excludeKeywords.some(keyword => document.includes(comparable(keyword)))) return false
  if (!rule.includeKeywords.length) return true
  const checks = rule.includeKeywords.map(keyword => document.includes(comparable(keyword)))
  return rule.keywordMode === 'ALL' ? checks.every(Boolean) : checks.some(Boolean)
}

export function filterProductsByCollectionAutomation(products = [], value = {}) {
  if (!collectionAutomationHasConditions(value)) return []
  return products.filter(product => productMatchesCollectionAutomation(product, value))
}
