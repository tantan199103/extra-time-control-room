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
  { value:'Caps', handle:'caps', label:'Caps', icon:'cap', accessoryFamily:'Headwear', accessoryType:'Caps', description:'Shop fitted, adjustable and snapback caps across leagues and teams.' },
  { value:'Knit Hats', handle:'knit-hats', label:'Knit hats', icon:'beanie', accessoryFamily:'Headwear', accessoryType:'Knit Hats', description:'Explore knit hats and beanies for game day and colder weather.' },
  { value:'Football Jerseys', handle:'football-jerseys', label:'Football jerseys', icon:'jersey', description:'Shop football jerseys and personalized fan gear with tracked US delivery.' },
  { value:'Basketball Jerseys', handle:'basketball-jerseys', label:'Basketball jerseys', icon:'jersey', description:'Shop basketball jerseys and personalized fan gear for game day and beyond.' },
  { value:'Baseball Jerseys', handle:'baseball-jerseys', label:'Baseball jerseys', icon:'jersey', description:'Shop baseball jerseys and personalized fan gear with clear size and delivery details.' },
  { value:'Hockey Jerseys', handle:'hockey-jerseys', label:'Hockey jerseys', icon:'jersey', description:'Shop hockey jerseys and fan gear with tracked delivery across supported destinations.' },
  { value:'Soccer Jerseys', handle:'soccer-jerseys', label:'Soccer jerseys', icon:'jersey', description:'Shop soccer jerseys and personalized fan gear built for match day.' },
  { value:'Fan Apparel', handle:'fan-apparel', label:'Fan apparel', icon:'apparel', description:'Explore fan apparel, layers and match-day pieces from Jersevo.' },
  { value:'Custom Jerseys', handle:'custom-jerseys', label:'Custom jerseys', icon:'custom', description:'Choose a fixed jersey design and add the name and number that make it yours.' },
  { value:'Accessories', handle:'accessories', label:'All accessories', icon:'accessories', description:'Shop headwear, bags, cold-weather layers, matchday details, drinkware and giftable fan accessories.' },
  { value:'Collectibles', handle:'collectibles', label:'Collectibles', icon:'collectibles', description:'Browse sports collectibles and keepsakes selected for the archive.' },
  { value:'Fan Gear', handle:'fan-gear', label:'Fan gear', icon:'gear', description:'Browse Jersevo fan gear across leagues, teams and match-day moments.' }
])

/**
 * Accessories are a department, not one undifferentiated product bucket.
 * These values are intentionally human-readable because they are also used
 * in the admin editor and in collection automation rules. `accessoryFamily`
 * is the first-level browse route; `accessoryType` is the optional second
 * level that makes a listing precise without forcing a new database table.
 */
export const ACCESSORY_FAMILY_OPTIONS = Object.freeze([
  { value:'Headwear', handle:'headwear', label:'Headwear', icon:'cap', description:'Caps, knit hats and other pieces worn above the collar.' },
  { value:'Bags', handle:'bags', label:'Bags', icon:'bag', description:'Backpacks, crossbody bags and useful matchday carry pieces.' },
  { value:'Scarves & cold weather', handle:'scarves-cold-weather', label:'Scarves & cold weather', icon:'scarf', description:'Scarves, gloves and cold-weather accessories for the stands.' },
  { value:'Matchday accessories', handle:'matchday-accessories', label:'Matchday accessories', icon:'matchday', description:'Flags, banners, pins, patches and small details for game day.' },
  { value:'Drinkware & lifestyle', handle:'drinkware-lifestyle', label:'Drinkware & lifestyle', icon:'drinkware', description:'Bottles, mugs and everyday fan pieces beyond the jersey.' },
  { value:'Socks & small apparel', handle:'socks-small-apparel', label:'Socks & small apparel', icon:'socks', description:'Socks, leg sleeves and compact apparel accessories.' },
  { value:'Gifts & bundles', handle:'gifts-bundles', label:'Gifts & bundles', icon:'gift', description:'Ready-to-give fan gifts and curated accessory sets.' },
  { value:'Other accessories', handle:'other-accessories', label:'Other accessories', icon:'accessories', description:'Additional sports accessories that do not fit another department.' }
])

export const ACCESSORY_TYPE_OPTIONS = Object.freeze([
  { value:'Caps', family:'Headwear', handle:'caps', label:'Caps', icon:'cap', groups:['Caps'], aliases:['cap','caps','snapback','fitted cap','trucker cap','visor'], keywords:['\\bcap(?:s)?\\b','\\bsnapbacks?\\b','\\bfitted\\b','\\bvisors?\\b'] },
  { value:'Knit Hats', family:'Headwear', handle:'knit-hats', label:'Knit hats', icon:'beanie', groups:['Knit Hats'], aliases:['knit hat','knit hats','beanie','beanies','skully'], keywords:['\\bknit hats?\\b','\\bbeanies?\\b','\\bskull(?:y|ies)\\b'] },
  { value:'Bags', family:'Bags', handle:'bags', label:'Bags', icon:'bag', groups:['Bags','Backpacks','Sports Bags'], aliases:['bag','bags','backpack','backpacks','sports bag','sports bags','crossbody','tote'], keywords:['\\bbags?\\b','\\bbackpacks?\\b','\\bcrossbody\\b','\\btotes?\\b'] },
  { value:'Scarves', family:'Scarves & cold weather', handle:'scarves', label:'Scarves', icon:'scarf', groups:['Scarves'], aliases:['scarf','scarves'], keywords:['\\b(?:scarf|scarves)\\b'] },
  { value:'Gloves', family:'Scarves & cold weather', handle:'gloves', label:'Gloves', icon:'scarf', groups:['Gloves'], aliases:['glove','gloves'], keywords:['\\bgloves?\\b','\\bmittens?\\b'] },
  { value:'Flags & banners', family:'Matchday accessories', handle:'flags-banners', label:'Flags & banners', icon:'matchday', groups:['Flags','Banners'], aliases:['flag','flags','banner','banners','pennant','pennants'], keywords:['\\bflags?\\b','\\bbanners?\\b','\\bpennants?\\b'] },
  { value:'Pins & patches', family:'Matchday accessories', handle:'pins-patches', label:'Pins & patches', icon:'matchday', groups:['Pins','Patches'], aliases:['pin','pins','patch','patches','badges'], keywords:['\\bpins?\\b','\\bpatches?\\b','\\bbadges?\\b'] },
  { value:'Keychains & small goods', family:'Matchday accessories', handle:'keychains-small-goods', label:'Keychains & small goods', icon:'matchday', groups:['Key Chains','Keychains','Decals','Magnets','Stickers'], aliases:['key chain','key chains','keychain','keychains','decal','decals','magnet','magnets','sticker','stickers'], keywords:['\\bkey[ -]?chains?\\b','\\bkey[ -]?rings?\\b','\\bdecals?\\b','\\bmagnets?\\b','\\bstickers?\\b','\\bcharms?\\b'] },
  { value:'Bottles', family:'Drinkware & lifestyle', handle:'bottles', label:'Bottles', icon:'drinkware', groups:['Bottles'], aliases:['bottle','bottles','flask','flasks'], keywords:['\\bbottles?\\b','\\bflasks?\\b'] },
  { value:'Mugs & drinkware', family:'Drinkware & lifestyle', handle:'mugs-drinkware', label:'Mugs & drinkware', icon:'drinkware', groups:['Mugs','Drinkware','Glassware','Coasters'], aliases:['mug','mugs','drinkware','glassware','coaster','coasters'], keywords:['\\bmugs?\\b','\\bdrinkware\\b','\\bglassware\\b','\\bcoasters?\\b'] },
  { value:'Socks & leg sleeves', family:'Socks & small apparel', handle:'socks-leg-sleeves', label:'Socks & leg sleeves', icon:'socks', groups:['Socks','Leg Sleeves'], aliases:['sock','socks','leg sleeve','leg sleeves'], keywords:['\\bsocks?\\b','\\bleg sleeves?\\b'] },
  { value:'Gift bundles', family:'Gifts & bundles', handle:'gift-bundles', label:'Gift bundles', icon:'gift', groups:['Gift Sets','Gift Bundles','Bundles'], aliases:['gift set','gift sets','gift bundle','gift bundles','bundle','bundles'], keywords:['\\bgift sets?\\b','\\bgift bundles?\\b','\\bbundles?\\b'] },
  { value:'Other accessories', family:'Other accessories', handle:'other-accessories', label:'Other accessories', icon:'accessories', groups:['Accessories'], aliases:['accessories','other accessories'], keywords:[] }
])

export const ACCESSORY_CATEGORY_PAGES = Object.freeze([
  ...ACCESSORY_FAMILY_OPTIONS.map(item => ({ ...item, value:item.value, accessoryFamily:item.value, level:'family' })),
  ...ACCESSORY_TYPE_OPTIONS.map(item => ({ value:item.value, handle:item.handle, label:item.label, icon:item.icon, description:`Shop ${item.label.toLowerCase()} for game day and everyday fan life.`, accessoryFamily:item.family, accessoryType:item.value, level:'type' }))
])

export const ALL_CATALOG_CATEGORY_PAGES = Object.freeze([...CATALOG_CATEGORY_PAGES, ...ACCESSORY_CATEGORY_PAGES].reduce((pages, item) => {
  if (!pages.some(existing => existing.handle === item.handle)) pages.push(item)
  return pages
}, []))

const normalizeAccessoryValue = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')

function accessoryText(product = {}) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  return {
    taxonomy,
    group: normalizeAccessoryValue(product.productGroup || product.product_group || taxonomy.productGroup),
    text: [product.title, product.name, product.subtitle, product.description, product.story, product.handle, ...(Array.isArray(product.tags) ? product.tags : [])].filter(Boolean).join(' ').toLowerCase()
  }
}

function descriptorMatches(descriptor, group, text) {
  if (descriptor.groups.some(value => normalizeAccessoryValue(value) === group)) return true
  if (descriptor.aliases.some(value => normalizeAccessoryValue(value) === group)) return true
  return descriptor.keywords.some(pattern => new RegExp(pattern, 'i').test(`${group} ${text}`))
}

/** Infer an accessory family/type while keeping explicit admin values first. */
export function accessoryTaxonomyForProduct(product = {}) {
  const { taxonomy, group, text } = accessoryText(product)
  const explicitType = normalizeAccessoryValue(taxonomy.accessoryType || taxonomy.accessory_type)
  const explicitFamily = normalizeAccessoryValue(taxonomy.accessoryCategory || taxonomy.accessory_category || taxonomy.accessoryFamily || taxonomy.accessory_family)
  const category = normalizeAccessoryValue(taxonomy.category)
  const looksAccessory = category === 'accessories'
    || ACCESSORY_TYPE_OPTIONS.some(item => item.groups.some(value => normalizeAccessoryValue(value) === group))
    || ACCESSORY_TYPE_OPTIONS.some(item => item.keywords.some(pattern => new RegExp(pattern, 'i').test(`${group} ${text}`)))
  if (!looksAccessory && !explicitType && !explicitFamily) return { isAccessory:false, family:'', type:'' }

  const family = ACCESSORY_FAMILY_OPTIONS.find(item => normalizeAccessoryValue(item.value) === explicitFamily || normalizeAccessoryValue(item.handle) === explicitFamily)
  const explicit = ACCESSORY_TYPE_OPTIONS.find(item => normalizeAccessoryValue(item.value) === explicitType || normalizeAccessoryValue(item.handle) === explicitType)
  const inferredDescriptor = ACCESSORY_TYPE_OPTIONS.find(item => descriptorMatches(item, group, text))
  const descriptor = explicit || (family ? ACCESSORY_TYPE_OPTIONS.find(item => item.family === family.value && descriptorMatches(item, group, text)) : inferredDescriptor)
  const resolvedFamily = family?.value || descriptor?.family || (category === 'accessories' ? 'Other accessories' : '')
  const resolvedType = explicit?.value || (descriptor && (!family || descriptor.family === family.value) ? descriptor.value : (explicitType ? taxonomy.accessoryType || taxonomy.accessory_type : (resolvedFamily === 'Other accessories' ? 'Other accessories' : '')))
  return { isAccessory:true, family:resolvedFamily, type:resolvedType }
}

export function normalizeAccessoryTaxonomy(product = {}) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const inferred = accessoryTaxonomyForProduct({ ...product, taxonomy })
  if (!inferred.isAccessory) return taxonomy
  return {
    ...taxonomy,
    accessoryCategory: taxonomy.accessoryCategory || taxonomy.accessory_category || inferred.family,
    accessoryType: taxonomy.accessoryType || taxonomy.accessory_type || inferred.type
  }
}

export function accessoryGroupsForCategory(category = {}) {
  const family = category.accessoryFamily || (category.value && ACCESSORY_FAMILY_OPTIONS.find(item => item.value === category.value)?.value)
  const type = category.accessoryType || (category.value && ACCESSORY_TYPE_OPTIONS.find(item => item.value === category.value)?.value)
  const descriptors = ACCESSORY_TYPE_OPTIONS.filter(item => (type ? item.value === type : true) && (family ? item.family === family : true))
  return [...new Set(descriptors.flatMap(item => item.groups))]
}

export function catalogCategoryByHandle(handle) {
  const value = String(handle || '').toLowerCase()
  return ALL_CATALOG_CATEGORY_PAGES.find(item => item.handle === value) || null
}

export function catalogCategoryHandle(value) {
  return ALL_CATALOG_CATEGORY_PAGES.find(item => item.value === value)?.handle || ''
}

export function catalogIconForProduct(product = {}) {
  const group = String(product.productGroup || product.product_group || '').toLowerCase()
  if (/knit hat|beanie/.test(group)) return 'beanie'
  if (/\bcap\b|\bcaps\b|snapback|fitted hat/.test(group)) return 'cap'
  const accessory = accessoryTaxonomyForProduct(product)
  if (accessory.type === 'Caps') return 'cap'
  if (accessory.type === 'Knit Hats') return 'beanie'
  if (accessory.type === 'Bags') return 'bag'
  if (accessory.family === 'Scarves & cold weather') return 'scarf'
  if (accessory.family === 'Drinkware & lifestyle') return 'drinkware'
  if (accessory.family === 'Matchday accessories') return 'matchday'
  if (accessory.family === 'Socks & small apparel') return 'socks'
  if (accessory.family === 'Gifts & bundles') return 'gift'
  if (/jersey/.test(group)) return Array.isArray(product.customFields || product.custom_fields) && (product.customFields || product.custom_fields).length ? 'custom' : 'jersey'
  if (/apparel|hoodie|shirt|sweat/.test(group)) return 'apparel'
  if (/collectible|memorabilia|trading card/.test(group)) return 'collectibles'
  return 'accessories'
}

export function productMatchesCatalogCategory(product = {}, category = {}) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const target = String(category.value || category || '').toLowerCase()
  if (!target) return true
  const accessory = accessoryTaxonomyForProduct(product)
  const resolvedCategory = String(category.accessoryFamily || '').trim()
    ? category
    : ALL_CATALOG_CATEGORY_PAGES.find(item => normalizeAccessoryValue(item.value) === target || item.handle === target) || category
  if (String(resolvedCategory.accessoryFamily || '').trim()) {
    if (!accessory.isAccessory || normalizeAccessoryValue(accessory.family) !== normalizeAccessoryValue(resolvedCategory.accessoryFamily)) return false
    if (resolvedCategory.accessoryType) return normalizeAccessoryValue(accessory.type) === normalizeAccessoryValue(resolvedCategory.accessoryType)
    return true
  }
  if (target === 'custom jerseys') {
    const fields = product.customFields || product.custom_fields
    const jersey = /\bjerseys?\b/i.test(`${taxonomy.category || ''} ${taxonomy.productGroup || ''} ${product.productGroup || product.product_group || ''}`)
    return Array.isArray(fields) && fields.length > 0 && jersey
  }
  const aliases = {
    caps:['caps','cap','snapback caps','fitted caps','adjustable caps'],
    'knit hats':['knit hats','knit hat','beanies','beanie'],
    'football jerseys':['football jerseys','football jersey','football','nfl jerseys'],
    'basketball jerseys':['basketball jerseys','basketball jersey','basketball','nba jerseys'],
    'baseball jerseys':['baseball jerseys','baseball jersey','baseball','mlb jerseys'],
    'hockey jerseys':['hockey jerseys','hockey jersey','hockey','nhl jerseys'],
    'soccer jerseys':['soccer jerseys','soccer jersey','soccer','football kits','soccer kits'],
    'fan apparel':['fan apparel','apparel','clothing','hoodies','t-shirts','shirts'],
    accessories:['accessories','caps','hats','knit hats','beanies','headwear','visors','bags','backpacks','sports bags','scarves','gloves','flags','banners','pins','patches','keychains','key chains','decals','magnets','stickers','bottles','mugs','drinkware','socks','gift sets','gift bundles'],
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
