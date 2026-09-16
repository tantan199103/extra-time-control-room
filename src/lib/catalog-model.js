// Scope store permissions separately from other apps sharing the Supabase project.
export const isAdminUser = user => Boolean(user?.id && user?.app_metadata?.extra_time_role === 'admin')

export function normalizeProduct(row, persisted = true) {
  return {
    ...row,
    name: row.title ?? row.name ?? '',
    title: row.title ?? row.name ?? '',
    handle: row.handle || row.id,
    story: row.subtitle ?? row.story ?? row.description ?? '',
    description: row.description ?? row.story ?? '',
    price: Number(row.price || 0),
    compareAt: row.compare_at ?? row.compareAt ?? null,
    artworkLock: row.artwork_lock ?? row.artworkLock ?? 100,
    templateId: row.template_id ?? row.templateId ?? null,
    templateVersion: row.template_version ?? row.templateVersion ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    sku: row.sku || '',
    personalization: row.personalization || [],
    options: row.pod_product_options ? [...row.pod_product_options].sort((a,b) => a.sort_order - b.sort_order).map(option => ({
      id: option.id, name: option.name,
      values: [...(option.pod_product_option_values || [])].sort((a,b) => a.sort_order - b.sort_order).map(value => value.label)
    })) : (row.options || []),
    variants: (row.pod_product_variants || row.variants || []).map(variant => ({ ...variant,
      values: variant.option_values ?? variant.values ?? {}, price: Number(variant.price || 0),
      inventory: Number(variant.inventory || 0), compareAt: variant.compare_at ?? variant.compareAt ?? null
    })),
    _persisted: persisted
  }
}

export function normalizeTemplate(row) {
  return { ...row, lockPercent: row.artwork_lock_percent ?? row.lockPercent ?? 70,
    editable: row.editable_slots ?? row.editable ?? [], locked: row.locked_layers ?? row.locked ?? [],
    cover: row.cover_image ?? row.cover ?? '', templateDefinition: row.definition ?? row.templateDefinition ?? {} }
}

export function createProductDraft() {
  const id = `product-${globalThis.crypto.randomUUID()}`
  return normalizeProduct({ id, handle: id, title: 'Untitled listing', description: '', subtitle: '',
    price: 0, status: 'DRAFT', type: 'READY TO SHIP', image: '', color: '',
    inventory: 0, artwork_lock: 100, personalization: [], options: [], variants: [],
    sku: `ET-${id.slice(-8).toUpperCase()}` }, false)
}

export function variantCombinationKey(values) {
  return JSON.stringify(Object.entries(values || {}).sort(([a],[b]) => a.localeCompare(b)))
}

export function generateVariantMatrix(product) {
  const options = product.options || []
  if (options.length > 3 || options.some(option => !option.name.trim() || !option.values.length)) throw new Error('Enter up to 3 named options with values first.')
  if (new Set(options.map(option=>option.name.toLowerCase())).size !== options.length || options.some(option=>new Set(option.values.map(value=>value.toLowerCase())).size !== option.values.length)) throw new Error('Option names and values must be unique.')
  const count = options.reduce((size,option)=>size*option.values.length,1)
  if (count > 250) throw new Error('This would create more than 250 variants. Reduce the options.')
  const combinations = options.reduce((rows,option)=>rows.flatMap(row=>option.values.map(value=>({...row,[option.name]:value}))),[{}])
  const previous = product.variants || []
  const used = new Set()
  const variants = combinations.map(values => {
    const existing = previous.find(row=>row.status !== 'ARCHIVED' && variantCombinationKey(row.values)===variantCombinationKey(values))
    if (existing) { used.add(existing.id); return existing }
    const id = globalThis.crypto.randomUUID()
    return {id, sku:`${product.sku || 'ET'}-${id.slice(0,8).toUpperCase()}`, values, price:Number(product.price || 0), inventory:0, status:'DRAFT'}
  })
  return [...variants,...previous.filter(row=>!used.has(row.id)).map(row=>({...row,status:'ARCHIVED'}))]
}

export function validateListing(product) {
  const errors = []
  const money = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Math.abs(Number(value)*100 - Math.round(Number(value)*100)) < 0.000001
  if (!product.id) errors.push('Listing ID is required.')
  if (!String(product.title || product.name || '').trim()) errors.push('Product title is required.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle || '')) errors.push('Handle must use lowercase letters, numbers and hyphens.')
  if (!money(product.price)) errors.push('Price must be a non-negative number.')
  if (product.compareAt !== '' && product.compareAt != null && (!money(product.compareAt) || Number(product.compareAt) < Number(product.price))) errors.push('Compare-at price cannot be lower than the selling price.')
  if (!['DRAFT','PUBLISHED','ARCHIVED'].includes(product.status)) errors.push('Invalid publish status.')
  const options = product.options || []
  const variants = product.variants || []
  if (options.length > 3 || variants.length > 250) errors.push('Use at most 3 options and 250 variants per listing.')
  const optionNames = new Set()
  for (const option of options) {
    const key = String(option.name || '').trim().toLowerCase()
    if (!key || optionNames.has(key)) errors.push('Option names must be non-empty and unique.')
    optionNames.add(key)
    if (!option.values?.length || option.values.some(value => !String(value).trim()) || new Set(option.values.map(value => String(value).trim().toLowerCase())).size !== option.values.length) errors.push(`Option ${option.name || '(unnamed)'} needs unique, non-empty values.`)
  }
  const combinations = new Set(), skus = new Set(), ids = new Set()
  for (const variant of variants) {
    if (!variant.id || ids.has(variant.id)) errors.push('Each variant needs a unique ID.')
    ids.add(variant.id)
    if (!variant.sku?.trim() || skus.has(variant.sku.trim().toUpperCase())) errors.push('Variant SKUs must be non-empty and unique.')
    skus.add(variant.sku?.trim().toUpperCase())
    if (!money(variant.price)) errors.push(`Invalid price for ${variant.sku || 'variant'}.`)
    if (variant.inventory === '' || variant.inventory == null || !Number.isInteger(Number(variant.inventory)) || Number(variant.inventory) < 0) errors.push(`Invalid stock for ${variant.sku || 'variant'}.`)
    if (!['ACTIVE','DRAFT','ARCHIVED'].includes(variant.status)) errors.push(`Invalid status for ${variant.sku || 'variant'}.`)
    if (variant.status === 'ARCHIVED') continue
    const values = variant.values || {}
    if (Object.keys(values).length !== options.length || options.some(option => !option.values.includes(values[option.name]))) errors.push(`Option combination is invalid for ${variant.sku || 'variant'}.`)
    const combination = variantCombinationKey(values)
    if (combinations.has(combination)) errors.push('Two variants have the same option combination.')
    combinations.add(combination)
  }
  if (product.status === 'PUBLISHED') {
    if (!String(product.image || '').trim()) errors.push('A primary listing image is required before publishing.')
    if (!variants.some(variant => variant.status === 'ACTIVE')) errors.push('At least one active variant is required before publishing.')
  }
  return [...new Set(errors)]
}

export function buildListingInput(product) {
  return {
    id: product.id, handle: product.handle, title: (product.title || product.name || '').trim(),
    subtitle: product.story || '', description: product.description || '',
    price: Number(product.price), compare_at: product.compareAt === '' || product.compareAt == null ? null : Number(product.compareAt),
    status: product.status, badge: product.badge || null, type: product.type || 'READY TO SHIP',
    template_id: product.templateId || null, template_version: product.templateVersion || null,
    image: product.image || '', color: product.color || '', sku: product.sku || '',
    artwork_lock: Number(product.artworkLock ?? 100), personalization: product.personalization || [],
    inventory: (product.variants || []).filter(row => row.status === 'ACTIVE').reduce((sum,row) => sum + Number(row.inventory || 0), 0),
    options: (product.options || []).map(option => ({ name: option.name.trim(), values: option.values.map(value => String(value).trim()) })),
    variants: (product.variants || []).map(variant => ({ id: variant.id, sku: variant.sku.trim(),
      option_values: variant.values || {}, price: Number(variant.price), inventory: Number(variant.inventory),
      compare_at: variant.compareAt === '' || variant.compareAt == null ? null : Number(variant.compareAt),
      status: variant.status, image: variant.image || null }))
  }
}
