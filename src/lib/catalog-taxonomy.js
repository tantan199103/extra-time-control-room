/**
 * Controlled catalogue values used by the admin listing workspace.
 *
 * These are intentionally small, human-readable values.  They are a UI
 * contract, not database IDs, so a future taxonomy service can replace this
 * module without changing the product shape.  Legacy values are appended by
 * the workspace so an old listing can be edited without being silently
 * rewritten.
 */
export const CATALOG_CATEGORY_OPTIONS = Object.freeze([
  { value:'Football Jerseys', label:'Football jerseys' },
  { value:'Basketball Jerseys', label:'Basketball jerseys' },
  { value:'Baseball Jerseys', label:'Baseball jerseys' },
  { value:'Hockey Jerseys', label:'Hockey jerseys' },
  { value:'Soccer Jerseys', label:'Soccer jerseys' },
  { value:'Fan Apparel', label:'Fan apparel' },
  { value:'Custom Jerseys', label:'Custom jerseys' },
  { value:'Accessories', label:'Accessories' },
  { value:'Collectibles', label:'Collectibles' },
  { value:'Fan Gear', label:'Fan gear' }
])

export const SEASON_DROP_OPTIONS = Object.freeze([
  { value:'The 90+ Drop', label:'The 90+ Drop' },
  { value:'Drop 01 / 2026', label:'Drop 01 / 2026' },
  { value:'Drop 02 / 2026', label:'Drop 02 / 2026' },
  { value:'Evergreen', label:'Evergreen' },
  { value:'Archive', label:'Archive' }
])

export const CATALOG_CATEGORY_PAGES = Object.freeze([
  { value:'Caps', handle:'caps', label:'Caps', icon:'cap', description:'Shop fitted, adjustable and snapback caps across leagues and teams.' },
  { value:'Knit Hats', handle:'knit-hats', label:'Knit hats', icon:'beanie', description:'Explore knit hats and beanies for game day and colder weather.' },
  { value:'Football Jerseys', handle:'football-jerseys', label:'Football jerseys', icon:'jersey', description:'Shop football jerseys and personalized fan gear with tracked US delivery.' },
  { value:'Basketball Jerseys', handle:'basketball-jerseys', label:'Basketball jerseys', icon:'jersey', description:'Shop basketball jerseys and personalized fan gear for game day and beyond.' },
  { value:'Baseball Jerseys', handle:'baseball-jerseys', label:'Baseball jerseys', icon:'jersey', description:'Shop baseball jerseys and personalized fan gear with clear size and delivery details.' },
  { value:'Hockey Jerseys', handle:'hockey-jerseys', label:'Hockey jerseys', icon:'jersey', description:'Shop hockey jerseys and fan gear with tracked delivery across supported destinations.' },
  { value:'Soccer Jerseys', handle:'soccer-jerseys', label:'Soccer jerseys', icon:'jersey', description:'Shop soccer jerseys and personalized fan gear built for match day.' },
  { value:'Fan Apparel', handle:'fan-apparel', label:'Fan apparel', icon:'apparel', description:'Explore fan apparel, layers and match-day pieces from Jersevo.' },
  { value:'Custom Jerseys', handle:'custom-jerseys', label:'Custom jerseys', icon:'custom', description:'Choose a fixed jersey design and add the name and number that make it yours.' },
  { value:'Accessories', handle:'accessories', label:'All accessories', icon:'accessories', description:'Explore caps, knit hats and other sports accessories from Jersevo.' },
  { value:'Collectibles', handle:'collectibles', label:'Collectibles', icon:'collectibles', description:'Browse sports collectibles and keepsakes selected for the archive.' },
  { value:'Fan Gear', handle:'fan-gear', label:'Fan gear', icon:'gear', description:'Browse Jersevo fan gear across leagues, teams and match-day moments.' }
])

export function catalogCategoryByHandle(handle) {
  const value = String(handle || '').toLowerCase()
  return CATALOG_CATEGORY_PAGES.find(item => item.handle === value) || null
}

export function catalogCategoryHandle(value) {
  return CATALOG_CATEGORY_PAGES.find(item => item.value === value)?.handle || ''
}

export function catalogIconForProduct(product = {}) {
  const group = String(product.productGroup || product.product_group || '').toLowerCase()
  if (/knit hat|beanie/.test(group)) return 'beanie'
  if (/\bcap\b|\bcaps\b|snapback|fitted hat/.test(group)) return 'cap'
  if (/jersey/.test(group)) return Array.isArray(product.customFields || product.custom_fields) && (product.customFields || product.custom_fields).length ? 'custom' : 'jersey'
  if (/apparel|hoodie|shirt|sweat/.test(group)) return 'apparel'
  if (/collectible|memorabilia|trading card/.test(group)) return 'collectibles'
  return 'accessories'
}

export function productMatchesCatalogCategory(product = {}, category = {}) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const target = String(category.value || category || '').toLowerCase()
  if (!target) return true
  if (target === 'custom jerseys') return Array.isArray(product.customFields || product.custom_fields) && (product.customFields || product.custom_fields).length > 0
  const aliases = {
    caps:['caps','cap','snapback caps','fitted caps','adjustable caps'],
    'knit hats':['knit hats','knit hat','beanies','beanie'],
    'football jerseys':['football jerseys','football jersey','football','nfl jerseys'],
    'basketball jerseys':['basketball jerseys','basketball jersey','basketball','nba jerseys'],
    'baseball jerseys':['baseball jerseys','baseball jersey','baseball','mlb jerseys'],
    'hockey jerseys':['hockey jerseys','hockey jersey','hockey','nhl jerseys'],
    'soccer jerseys':['soccer jerseys','soccer jersey','soccer','football kits','soccer kits'],
    'fan apparel':['fan apparel','apparel','clothing','hoodies','t-shirts','shirts'],
    accessories:['accessories','caps','hats','knit hats','beanies','headwear','visors'],
    collectibles:['collectibles','trading cards','memorabilia','autographs'],
    'fan gear':['fan gear','sports gear']
  }
  const accepted = aliases[target] || [target]
  return [taxonomy.category, taxonomy.productGroup, product.productGroup, product.type]
    .filter(Boolean)
    .some(value => accepted.includes(String(value).toLowerCase()) || accepted.some(alias => String(value).toLowerCase().includes(alias)))
}

export function optionsWithLegacyValues(presets, value) {
  const current = String(value || '').trim()
  if (!current || presets.some(option => option.value === current)) return presets
  return [{ value:current, label:`Legacy value · ${current}` }, ...presets]
}

export function controlledTaxonomyValues() {
  return {
    categories: CATALOG_CATEGORY_OPTIONS.map(option => option.value),
    seasons: SEASON_DROP_OPTIONS.map(option => option.value)
  }
}
