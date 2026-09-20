// Scope store permissions separately from other apps sharing the Supabase project.
export const isAdminUser = user => Boolean(user?.id && user?.app_metadata?.extra_time_role === 'admin')

const CUSTOM_TYPES = new Set(['text', 'number', 'textarea', 'select', 'photo', 'logo'])
const LOGO_TREATMENTS = new Set(['EXACT', 'FABRIC', 'VINTAGE', 'MONOCHROME'])
export const SEO_STATUSES = Object.freeze(['BLOCKED', 'READY', 'INDEXABLE'])
const RIGHTS_REVIEW_TERMS = /\b(?:official|authentic|licensed|replica|nike|adidas|marvel|disney|spider[- ]?man)\b/i
const uuid = () => globalThis.crypto.randomUUID()
const cleanTag = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '-')
const moneyValue = value => value === '' || value == null ? null : Number(value)

export const customFieldPresets = [
  { key:'name', label:'Name', type:'text', required:false, placeholder:'YOUR NAME', maxLength:14, help:'Name printed on the garment.' },
  { key:'number', label:'Number', type:'number', required:false, placeholder:'24', maxLength:2, help:'Player number from 00 to 99.' },
  { key:'teamCity', label:'Team / city', type:'text', required:false, placeholder:'SAIGON', maxLength:18, help:'Team, city or place tied to the story.' },
  { key:'year', label:'Year', type:'number', required:false, placeholder:'2026', maxLength:4, help:'A four-digit season or memory.' },
  { key:'color', label:'Colour note', type:'text', required:false, placeholder:'BLACK / PURPLE', maxLength:20, help:'A colour request when this design permits it.' },
  { key:'photo', label:'Photo', type:'photo', required:false, placeholder:'', maxLength:null, help:'Optional customer reference photo.' },
  { key:'teamLogo', label:'Team logo', type:'logo', required:false, placeholder:'', maxLength:null, help:'Optional logo placed inside the designer-approved badge area.', previewRegion:null, allowAiFinish:true, requiresConsent:true, logoTreatment:'EXACT' },
  { key:'printText', label:'Printed message', type:'text', required:false, placeholder:'RELENTLESS', maxLength:28, help:'Short copy printed on the piece.' },
  { key:'note', label:'Studio note', type:'textarea', required:false, placeholder:'Production notes…', maxLength:500, help:'Freeform direction for the studio.' }
]

export function catalogLegalReview(product = {}) {
  const taxonomy = product.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {}
  const title = String(product.title || product.name || '')
  const reasons = []
  if (taxonomy.league || taxonomy.team) reasons.push('LEAGUE_OR_TEAM_REFERENCE')
  if (RIGHTS_REVIEW_TERMS.test(title) || RIGHTS_REVIEW_TERMS.test((product.tags || []).join(' '))) reasons.push('TRADEMARK_OR_AFFILIATION_LANGUAGE')
  const status = String(product.aiMetadata?.catalogReview?.status || '').toUpperCase()
  return { required:reasons.length > 0, approved:!reasons.length || status === 'APPROVED', reasons, status:status || 'PENDING' }
}

/**
 * Deterministic SEO approval gate shared by the editor and save validation.
 * Search/indexing is never enabled just because an operator picked a value in
 * a select; every blocker must be resolved first.
 */
export function seoReviewGate(product = {}) {
  const blockers = []
  const warnings = []
  const title = String(product.title || product.name || '').trim()
  const description = String(product.description || '').trim()
  const seo = product.seo && typeof product.seo === 'object' ? product.seo : {}
  const seoTitle = String(seo.title || '').trim()
  const seoDescription = String(seo.description || '').trim()
  const media = Array.isArray(product.media) ? product.media : []
  const images = media.filter(item => String(item?.type || '').toUpperCase() === 'IMAGE' && String(item?.url || '').trim())
  const variants = Array.isArray(product.variants) ? product.variants : []
  const legal = catalogLegalReview(product)

  if (String(product.status || '').toUpperCase() !== 'PUBLISHED') blockers.push('PUBLISH_LISTING_FIRST')
  if (!String(product.image || '').trim()) blockers.push('PRIMARY_IMAGE_REQUIRED')
  if (!title) blockers.push('TITLE_REQUIRED')
  if (description.length < 160) blockers.push('DESCRIPTION_160_CHARACTERS')
  if (seoTitle.length < 30 || seoTitle.length > 60) blockers.push('SEO_TITLE_30_60_CHARACTERS')
  if (seoDescription.length < 120 || seoDescription.length > 160) blockers.push('SEO_DESCRIPTION_120_160_CHARACTERS')
  if (!images.length) blockers.push('MEDIA_IMAGE_REQUIRED')
  if (images.some(item => !String(item.alt || '').trim())) blockers.push('ALT_TEXT_REQUIRED_ON_EVERY_IMAGE')
  if (!variants.some(variant => variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0 && Number(variant.price || 0) > 0)) blockers.push('PRICED_IN_STOCK_VARIANT_REQUIRED')
  if (legal.required && !legal.approved) blockers.push('RIGHTS_REVIEW_REQUIRED')
  if (!seo.primaryKeyword) warnings.push('PRIMARY_KEYWORD_RECOMMENDED')
  if (!Array.isArray(product.tags) || !product.tags.length) warnings.push('CATALOGUE_TAG_RECOMMENDED')
  const quality = Math.max(0, Math.round(100 - blockers.length * 12 - warnings.length * 3))
  return { ready:blockers.length === 0, blockers, warnings, quality, reviewedAt:product.seoReviewedAt || product.aiMetadata?.seoReview?.reviewedAt || null }
}

export function slugify(value, fallback = 'untitled-listing') {
  const slug = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function normalizeCustomFields(fields = []) {
  const source = Array.isArray(fields) ? fields : []
  const seen = new Set()
  return source.map((field, index) => {
    const preset = typeof field === 'string' ? customFieldPresets.find(item => item.label === field || item.key === field) : null
    const input = preset || field || {}
    const rawKey = String(input.key || '').trim()
    let key = /^[A-Za-z][A-Za-z0-9]*$/.test(rawKey)
      ? `${rawKey[0].toLowerCase()}${rawKey.slice(1)}`
      : slugify(rawKey || input.label || `field-${index + 1}`, `field-${index + 1}`).replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())
    if (seen.has(key)) key = `${key}${index + 1}`
    seen.add(key)
    return {
      id: input.id || `field-${uuid()}`,
      key,
      label: String(input.label || key).trim(),
      type: CUSTOM_TYPES.has(input.type) ? input.type : 'text',
      required: Boolean(input.required),
      placeholder: String(input.placeholder || ''),
      maxLength: input.maxLength === '' || input.maxLength == null ? null : Math.max(1, Number(input.maxLength) || 1),
      help: String(input.help || ''),
      options: Array.isArray(input.options) ? input.options.map(value => String(value).trim()).filter(Boolean) : [],
      allowAiFinish: input.type === 'logo' ? input.allowAiFinish !== false : false,
      requiresConsent: input.type === 'logo' ? input.requiresConsent !== false : false,
      logoTreatment: input.type === 'logo' ? (LOGO_TREATMENTS.has(String(input.logoTreatment || 'EXACT').toUpperCase()) ? String(input.logoTreatment || 'EXACT').toUpperCase() : 'EXACT') : null,
      minWidth: input.type === 'logo' ? Math.max(256, Math.min(4000, Number(input.minWidth) || 800)) : null,
      previewRegion: (() => {
        if (!input.previewRegion || typeof input.previewRegion !== 'object' || Array.isArray(input.previewRegion)) return null
        const x=Math.max(0,Math.min(99,Number(input.previewRegion.x) || 0))
        const y=Math.max(0,Math.min(99,Number(input.previewRegion.y) || 0))
        const width=Math.max(1,Math.min(100-x,Number(input.previewRegion.width) || 1))
        const height=Math.max(1,Math.min(100-y,Number(input.previewRegion.height) || 1))
        return { x,y,width,height }
      })()
    }
  })
}

function legacyPersonalizationFields(fields = [], productType = '') {
  if (!Array.isArray(fields) || !fields.length) return []
  const keys = []
  const add = key => { if (!keys.includes(key)) keys.push(key) }
  fields.forEach(field => {
    if (field && typeof field === 'object') { keys.push(field); return }
    const label = String(field || '').toUpperCase()
    const isLogo = label.includes('LOGO') || label.includes('BADGE') || label.includes('CREST')
    if (label.includes('NAME')) add('name')
    if (label.includes('NUMBER')) add('number')
    if (isLogo) add('teamLogo')
    else if (label.includes('TEAM') || label.includes('CITY')) add('teamCity')
    if (label.includes('YEAR')) add('year')
    if (label.includes('COLOUR') || label.includes('COLOR')) add('color')
    if (label.includes('PHOTO')) add('photo')
    if (label.includes('MESSAGE') || label.includes('PRINT')) add('printText')
  })
  if (String(productType).toUpperCase() === 'PERSONALIZED' && keys.length && !keys.includes('photo')) add('photo')
  return keys.map(key => typeof key === 'string' ? (customFieldPresets.find(field => field.key === key) || key) : key)
}

export function deriveAutomaticTags(product) {
  const variants = product.variants || []
  const active = variants.filter(row => row.status === 'ACTIVE')
  const totalStock = active.reduce((sum, row) => sum + Number(row.inventory || 0), 0)
  const tags = [product.status, product.type, product.productGroup].filter(Boolean).map(cleanTag)
  if ((product.customFields || []).length) tags.push('customizable')
  if ((product.media || []).some(item => item.type === 'VIDEO')) tags.push('has-video')
  if (product.compareAt != null && Number(product.compareAt) > Number(product.price || 0) || active.some(row => row.compareAt != null && Number(row.compareAt) > Number(row.price || 0))) tags.push('sale')
  if (active.length && totalStock === 0) tags.push('out-of-stock')
  else if (active.length && totalStock <= 10) tags.push('low-stock')
  return [...new Set(tags.filter(Boolean))]
}

export function productCompleteness(product) {
  const checks = [
    { key:'story', label:'Story & title', done:Boolean(product.title?.trim() && product.description?.trim()) },
    { key:'media', label:'Primary image', done:Boolean(product.image?.trim()) },
    { key:'variants', label:'Active variation', done:Boolean((product.variants || []).some(row => row.status === 'ACTIVE')) },
    { key:'seo', label:'SEO metadata', done:Boolean(product.seo?.title?.trim() && product.seo?.description?.trim()) },
    { key:'seoGate', label:'SEO review gate', done:product.seoStatus === 'INDEXABLE' },
    { key:'organization', label:'Catalogue routing', done:Boolean(product.type?.trim() && (product.tags || []).length) }
  ]
  // SEO gate is deliberately reported as a separate readiness signal. It is
  // not folded into the editorial completeness percentage so existing admin
  // workflows keep the same meaning while a listing can still be complete
  // enough for commerce and remain blocked from search until reviewed.
  const completenessChecks = checks.filter(item => item.key !== 'seoGate')
  const completed = completenessChecks.filter(item => item.done).length
  return { checks, completed, total:completenessChecks.length, percent:Math.round(completed / completenessChecks.length * 100) }
}

export function normalizeProduct(row, persisted = true) {
  const normalizedTitle = row.title ?? row.name ?? ''
  const media = (Array.isArray(row.media) ? row.media : []).map((item, index) => {
    if (!item || String(item.type || '').toUpperCase() !== 'IMAGE' || String(item.alt || '').trim()) return item
    // Safe, deterministic draft text for legacy uploads. It never guesses
    // colours, people, teams or visual claims; the admin can refine it.
    return { ...item, alt:`${normalizedTitle || 'Product'} product image${index ? ` ${index + 1}` : ''}`.slice(0, 240) }
  })
  const configuredFields = row.custom_fields ?? row.customFields
  const customFieldSource = Array.isArray(configuredFields) && configuredFields.length
    ? configuredFields
    : legacyPersonalizationFields(row.personalization, row.type)
  const customFields = normalizeCustomFields(customFieldSource)
  return {
    ...row,
    name: normalizedTitle,
    title: normalizedTitle,
    handle: row.handle || row.id,
    story: row.subtitle ?? row.story ?? '',
    subtitle: row.subtitle ?? row.story ?? '',
    description: row.description ?? '',
    price: Number(row.price || 0),
    compareAt: row.compare_at ?? row.compareAt ?? null,
    artworkLock: row.artwork_lock ?? row.artworkLock ?? 100,
    templateId: row.template_id ?? row.templateId ?? null,
    templateVersion: row.template_version ?? row.templateVersion ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    sku: row.sku || '',
    media,
    contentBlocks: Array.isArray(row.content_blocks ?? row.contentBlocks) ? (row.content_blocks ?? row.contentBlocks) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(cleanTag).filter(Boolean) : [],
    productGroup: row.product_group ?? row.productGroup ?? '',
    taxonomy: row.taxonomy && typeof row.taxonomy === 'object' ? row.taxonomy : {},
    customFields,
    personalization: customFields.map(field => field.label),
    seo: row.seo && typeof row.seo === 'object' ? row.seo : {},
    seoStatus: SEO_STATUSES.includes(String(row.seo_status || row.seoStatus || row.seo?.status || '').toUpperCase())
      ? String(row.seo_status || row.seoStatus || row.seo?.status).toUpperCase()
      : (String(row.status || '').toUpperCase() === 'PUBLISHED' ? 'READY' : 'BLOCKED'),
    seoQualityScore: Math.max(0, Math.min(100, Number(row.seo_quality_score ?? row.seoQualityScore ?? row.seo?.quality_score ?? 0) || 0)),
    seoBlockReasons: Array.isArray(row.seo_block_reasons ?? row.seoBlockReasons ?? row.seo?.block_reasons)
      ? (row.seo_block_reasons ?? row.seoBlockReasons ?? row.seo?.block_reasons)
      : [],
    seoReviewedAt: row.seo_reviewed_at ?? row.seoReviewedAt ?? null,
    seoPublishedAt: row.seo_published_at ?? row.seoPublishedAt ?? null,
    aiMetadata: row.ai_metadata ?? row.aiMetadata ?? {},
    options: row.pod_product_options ? [...row.pod_product_options].sort((a,b) => a.sort_order - b.sort_order).map(option => ({
      id: option.id, name: option.name,
      values: [...(option.pod_product_option_values || [])].sort((a,b) => a.sort_order - b.sort_order).map(value => value.label)
    })) : (row.options || []),
    variants: (row.pod_product_variants || row.variants || []).map(variant => ({ ...variant,
      values: variant.option_values ?? variant.values ?? {}, price: Number(variant.price || 0),
      inventory: Number(variant.inventory || 0), compareAt: variant.compare_at ?? variant.compareAt ?? null,
      cost: variant.cost === '' || variant.cost == null ? null : Number(variant.cost),
      weightGrams: variant.weight_grams ?? variant.weightGrams ?? null,
      barcode: variant.barcode || ''
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
  const token = uuid()
  const id = `product-${token}`
  return normalizeProduct({ id, handle: id, title: 'Untitled listing', description: '', subtitle: '',
    price: 0, status: 'DRAFT', type: 'READY TO SHIP', image: '', color: '',
    inventory: 0, artwork_lock: 100, personalization: [], custom_fields: [], media: [], content_blocks: [],
    tags: [], product_group: '', taxonomy: {}, seo: {}, seo_status: 'BLOCKED', seo_quality_score: 0,
    seo_block_reasons: [], ai_metadata: {}, options: [], variants: [],
    sku: `ET-${token.slice(0,8).toUpperCase()}` }, false)
}

export function duplicateProductDraft(product, existingProducts = []) {
  const token = uuid()
  const existingHandles = new Set(existingProducts.map(row => row.handle))
  const base = slugify(`${product.handle || product.title}-copy`)
  let handle = base
  let suffix = 2
  while (existingHandles.has(handle)) handle = `${base}-${suffix++}`
  const id = `product-${token}`
  return normalizeProduct({
    ...structuredClone(product), id, handle, title:`${product.title || product.name || 'Untitled listing'} / COPY`, status:'DRAFT',
    sku:`ET-${token.slice(0,8).toUpperCase()}`, template_id:null, template_version:null,
    media:(product.media || []).map(item => ({ ...item, id:`media-${uuid()}` })),
    content_blocks:(product.contentBlocks || []).map(block => ({ ...block, id:`block-${uuid()}` })),
    custom_fields:(product.customFields || []).map(field => ({ ...field, id:`field-${uuid()}` })),
    pod_product_options:undefined,
    pod_product_variants:(product.variants || []).map(variant => {
      const variantToken = uuid()
      return { ...variant, id:variantToken, sku:`ET-${token.slice(0,5).toUpperCase()}-${variantToken.slice(0,5).toUpperCase()}`, status:variant.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT' }
    }),
    updated_at:null,
    created_at:null
  }, false)
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
    const id = uuid()
    return {id, sku:`${product.sku || 'ET'}-${id.slice(0,8).toUpperCase()}`, values, price:Number(product.price || 0), compareAt:null, cost:null, inventory:0, weightGrams:null, barcode:'', status:'DRAFT'}
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
  if (!SEO_STATUSES.includes(String(product.seoStatus || product.seo?.status || 'BLOCKED').toUpperCase())) errors.push('Invalid SEO status.')
  if (String(product.seoStatus || product.seo?.status || '').toUpperCase() === 'INDEXABLE') {
    const gate = seoReviewGate(product)
    if (!gate.ready) errors.push(`SEO review gate is not ready: ${gate.blockers.join(', ')}.`)
  }
  if (!Array.isArray(product.media) || !Array.isArray(product.contentBlocks) || !Array.isArray(product.tags) || !Array.isArray(product.customFields)) errors.push('Media, content, tags and custom fields must be lists.')
  const customKeys = new Set()
  for (const field of product.customFields || []) {
    if (!field.label?.trim() || !field.key?.trim() || customKeys.has(field.key)) errors.push('Custom fields need unique keys and labels.')
    if (!CUSTOM_TYPES.has(field.type)) errors.push(`Invalid custom field type for ${field.label || field.key || 'field'}.`)
    if (field.type === 'select' && !field.options?.length) errors.push(`${field.label || 'Select field'} needs at least one option.`)
    if (field.type === 'logo' && !LOGO_TREATMENTS.has(String(field.logoTreatment || 'EXACT').toUpperCase())) errors.push(`${field.label || 'Logo'} has an invalid finish treatment.`)
    if (field.type === 'logo' && (!Number.isInteger(Number(field.minWidth)) || Number(field.minWidth) < 256 || Number(field.minWidth) > 4000)) errors.push(`${field.label || 'Logo'} needs a minimum size between 256 and 4000 pixels.`)
    if (field.type === 'logo' && product.status === 'PUBLISHED' && !field.previewRegion) errors.push(`${field.label || 'Logo'} needs a designer-approved logo area.`)
    customKeys.add(field.key)
  }
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
    if (variant.compareAt !== '' && variant.compareAt != null && (!money(variant.compareAt) || Number(variant.compareAt) < Number(variant.price))) errors.push(`Invalid compare-at price for ${variant.sku || 'variant'}.`)
    if (variant.cost !== '' && variant.cost != null && !money(variant.cost)) errors.push(`Invalid cost for ${variant.sku || 'variant'}.`)
    if (variant.inventory === '' || variant.inventory == null || !Number.isInteger(Number(variant.inventory)) || Number(variant.inventory) < 0) errors.push(`Invalid stock for ${variant.sku || 'variant'}.`)
    if (variant.weightGrams !== '' && variant.weightGrams != null && (!Number.isInteger(Number(variant.weightGrams)) || Number(variant.weightGrams) < 0)) errors.push(`Invalid weight for ${variant.sku || 'variant'}.`)
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
    if (!String(product.description || '').trim()) errors.push('A product description is required before publishing.')
    if (!String(product.seo?.title || '').trim() || !String(product.seo?.description || '').trim()) errors.push('SEO title and description are required before publishing.')
    if (!String(product.type || '').trim() || !(product.tags || []).length) errors.push('Product type and at least one catalogue tag are required before publishing.')
    if (!variants.some(variant => variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0 && Number(variant.price || 0) > 0)) errors.push('At least one priced, in-stock active variant is required before publishing.')
    const legal = catalogLegalReview(product)
    if (legal.required && !legal.approved) errors.push(`Rights and affiliation review required before publishing (${legal.reasons.join(', ')}). Mark the admin review as approved only after verifying the source and wording.`)
  }
  return [...new Set(errors)]
}

export function buildListingInput(product) {
  const customFields = normalizeCustomFields(product.customFields || [])
  return {
    id: product.id, handle: product.handle, title: (product.title || product.name || '').trim(),
    subtitle: product.subtitle ?? product.story ?? '', description: product.description || '',
    price: Number(product.price), compare_at: moneyValue(product.compareAt),
    status: product.status, badge: product.badge || null, type: product.type || 'READY TO SHIP',
    template_id: null, template_version: null,
    image: product.image || '', color: product.color || '', sku: product.sku || '',
    artwork_lock: Number(product.artworkLock ?? 100), personalization: customFields.map(field => field.label),
    media: product.media || [], content_blocks: product.contentBlocks || [], tags:[...new Set((product.tags || []).map(cleanTag).filter(Boolean))],
    product_group: product.productGroup || '', taxonomy: product.taxonomy || {}, custom_fields:customFields,
    seo: {
      ...(product.seo || {}),
      status: String(product.seoStatus || product.seo?.status || 'BLOCKED').toUpperCase(),
      quality_score: Math.max(0, Math.min(100, Number(product.seoQualityScore ?? product.seo?.quality_score ?? 0) || 0)),
      block_reasons: Array.isArray(product.seoBlockReasons) ? product.seoBlockReasons : (Array.isArray(product.seo?.block_reasons) ? product.seo.block_reasons : [])
    },
    seo_status: String(product.seoStatus || product.seo?.status || 'BLOCKED').toUpperCase(),
    seo_quality_score: Math.max(0, Math.min(100, Number(product.seoQualityScore ?? product.seo?.quality_score ?? 0) || 0)),
    seo_block_reasons: Array.isArray(product.seoBlockReasons) ? product.seoBlockReasons : (Array.isArray(product.seo?.block_reasons) ? product.seo.block_reasons : []),
    seo_reviewed_at: product.seoReviewedAt || product.aiMetadata?.seoReview?.reviewedAt || null,
    seo_published_at: product.seoPublishedAt || null,
    ai_metadata:product.aiMetadata || {},
    inventory: (product.variants || []).filter(row => row.status === 'ACTIVE').reduce((sum,row) => sum + Number(row.inventory || 0), 0),
    options: (product.options || []).map(option => ({ name: option.name.trim(), values: option.values.map(value => String(value).trim()) })),
    variants: (product.variants || []).map(variant => ({ id: variant.id, sku: variant.sku.trim(),
      option_values: variant.values || {}, price: Number(variant.price), inventory: Number(variant.inventory),
      compare_at: moneyValue(variant.compareAt), cost:moneyValue(variant.cost),
      weight_grams:variant.weightGrams === '' || variant.weightGrams == null ? null : Number(variant.weightGrams),
      barcode:variant.barcode || null, status: variant.status, image: variant.image || null }))
  }
}
