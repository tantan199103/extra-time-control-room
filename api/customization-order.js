import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'
import { assertCustomerAsset } from './_logo-request.js'
import { normalizeOwayoLayers, normalizeOwayoLogo, normalizeOwayoPersonalization } from '../src/lib/owayo-personalization.js'

const fieldValue = (field, raw) => {
  if (raw == null || raw === '') return ''
  if (field.type === 'photo' || field.type === 'logo') {
    const url = safeText(raw, 1200)
    if (!/^https:\/\//i.test(url)) throw Object.assign(new Error(`${field.label} must be an uploaded HTTPS image.`), { status:422 })
    return url
  }
  const max = Math.min(500, Math.max(1, Number(field.maxLength || (field.type === 'textarea' ? 500 : 80))))
  const value = safeText(raw, max)
  if (field.type === 'number' && value && !/^\d+(?:\.\d+)?$/.test(value)) throw Object.assign(new Error(`${field.label} must be numeric.`), { status:422 })
  if (field.type === 'select' && value && !(field.options || []).includes(value)) throw Object.assign(new Error(`${field.label} is not an allowed choice.`), { status:422 })
  return value
}

const clamp = (value, min, max, fallback = min) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

export function normalizeDesignerSpec(value) {
  if (value == null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('The 3D design specification is invalid.'), { status:422 })
  if (safeText(value.source, 60) !== 'JERSEVO_3D_DESIGNER') throw Object.assign(new Error('The 3D design source is not supported.'), { status:422 })
  const provider = safeText(value.provider, 30).toLowerCase() || 'owayo'
  if (!['owayo', 'boombah'].includes(provider)) throw Object.assign(new Error('The 3D design provider is not supported.'), { status:422 })
  const requestedManifest = safeText(value.manifest, 180)
  const defaultManifest = provider === 'boombah' ? '/designer/boombah/products/fastpitch3d.json' : '/designer/owayo/cycling-c3/manifest.json'
  const manifest = /^\/designer\/(?:owayo\/[-a-z0-9/]+|boombah\/products\/[a-z0-9-]+)\.json$/i.test(requestedManifest) ? requestedManifest : defaultManifest
  const colorsSource = value.colors && typeof value.colors === 'object' && !Array.isArray(value.colors) ? value.colors : {}
  const colors = Object.fromEntries(Object.entries(colorsSource).slice(0, 12).map(([key, raw]) => [safeText(key, 20), /^#[0-9a-f]{6}$/i.test(String(raw || '')) ? String(raw).toUpperCase() : '']).filter(([key, raw]) => key && raw))
  const textSource = value.text && typeof value.text === 'object' && !Array.isArray(value.text) ? value.text : {}
  const logoSource = value.logo && typeof value.logo === 'object' && !Array.isArray(value.logo) ? value.logo : {}
  const patternSource = value.pattern && typeof value.pattern === 'object' && !Array.isArray(value.pattern) ? value.pattern : {}
  const rosterSource = Array.isArray(value.roster) ? value.roster : []
  const roster = rosterSource.slice(0, 99).map(player => ({
    name:safeText(player?.name, 80),
    number:safeText(player?.number, 6).replace(/\D/g, '').slice(0, 3),
    size:safeText(player?.size, 32)
  }))
  if (!roster.length) throw Object.assign(new Error('The 3D design needs at least one player.'), { status:422 })
  const text = normalizeOwayoPersonalization(textSource, roster)
  const layers = normalizeOwayoLayers(value.layers)
  if (layers.filter(layer => layer.kind === 'logo').length > 8) throw Object.assign(new Error('A 3D design can contain up to eight logo layers.'), { status:422 })
  if (layers.filter(layer => layer.kind === 'artwork').length > 8) throw Object.assign(new Error('A 3D design can contain up to eight artwork layers.'), { status:422 })
  const imageAssetIndexes = layers.filter(layer => ['logo', 'artwork'].includes(layer.kind)).map(layer => layer.assetIndex)
  if (new Set(imageAssetIndexes).size !== imageAssetIndexes.length) throw Object.assign(new Error('Every 3D image layer needs a distinct uploaded asset reference.'), { status:422 })
  return {
    source:'JERSEVO_3D_DESIGNER',
    version:Math.max(1, Math.min(3, Number(value.version) || 1)),
    provider,
    listingId:safeText(value.listingId, 160),
    listingHandle:safeText(value.listingHandle, 160),
    manifest,
    model:safeText(value.model, 60) || '253m_KA',
    product:safeText(value.product, 160),
    productId:safeText(value.productId, 80),
    styleCode:safeText(value.styleCode, 80),
    garment:safeText(value.garment, 160),
    designSlug:safeText(value.designSlug, 80),
    designName:safeText(value.designName, 120),
    assetPolicy:safeText(value.assetPolicy, 80) || 'private-customer-assets',
    colors,
    pattern:patternSource.slug ? {
      id:safeText(patternSource.id, 40),
      slug:safeText(patternSource.slug, 100),
      colorCode:safeText(patternSource.colorCode, 20).toUpperCase() || 'A',
      scale:clamp(patternSource.scale, .4, 2.4, 1),
      opacity:clamp(patternSource.opacity, .2, 1, .82)
    } : null,
    text,
    logo:normalizeOwayoLogo(logoSource),
    layerVersion:layers.length ? 1 : 0,
    layers,
    roster
  }
}

export function validateDesignerAssetRefs(designer, designerAssetRefs = []) {
  const refs = Array.isArray(designerAssetRefs) ? designerAssetRefs : []
  const logoLayers = designer?.layers?.filter(layer => layer.kind === 'logo') || []
  const artworkLayers = designer?.layers?.filter(layer => layer.kind === 'artwork') || []
  const imageLayers = [...logoLayers, ...artworkLayers]
  if (logoLayers.some(layer => !refs[layer.assetIndex])) {
    throw Object.assign(new Error('Every 3D logo layer must reference its securely uploaded logo asset.'), { status:422 })
  }
  if (artworkLayers.some(layer => !refs[layer.assetIndex])) {
    throw Object.assign(new Error('Every 3D artwork layer must reference its securely uploaded artwork asset.'), { status:422 })
  }
  if (refs.length && !imageLayers.length) {
    throw Object.assign(new Error('The uploaded 3D logo assets are not attached to a logo layer.'), { status:422 })
  }
  const referencedIndexes = new Set(imageLayers.map(layer => layer.assetIndex))
  if (refs.some((_, index) => !referencedIndexes.has(index))) {
    const message = artworkLayers.length ? 'Every uploaded 3D asset must be attached to an image layer.' : 'Every uploaded 3D logo asset must be attached to a logo layer.'
    throw Object.assign(new Error(message), { status:422 })
  }
  return imageLayers
}

async function publishedListing(client, productId) {
  const columns = 'id, handle, title, status, updated_at, image, custom_fields, ai_metadata'
  let result = await client.from('pod_products').select(columns).eq('id', productId).eq('status','PUBLISHED').maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(columns).eq('handle', productId).eq('status','PUBLISHED').maybeSingle()
  if (result.error) throw result.error
  return result.data
}

function validateListingDesigner(product, designer) {
  if (!designer) return
  const config = product?.ai_metadata?.designer
  if (!config || typeof config !== 'object') throw Object.assign(new Error('This listing is not connected to a 3D designer.'), { status:422 })
  const provider = safeText(config.provider, 30).toLowerCase()
  if (provider !== designer.provider) throw Object.assign(new Error('The selected 3D provider does not belong to this listing.'), { status:422 })
  if (safeText(config.productId, 80) !== designer.productId) throw Object.assign(new Error('The selected 3D product does not belong to this listing.'), { status:422 })
  if (safeText(config.manifest, 180) !== designer.manifest) throw Object.assign(new Error('The selected 3D manifest does not belong to this listing.'), { status:422 })
  const allowedDesigns = Array.isArray(config.allowedDesignIds) ? config.allowedDesignIds.map(value => String(value)) : []
  if (allowedDesigns.length && !allowedDesigns.includes(designer.designSlug)) throw Object.assign(new Error('The selected 3D artwork is not available for this listing.'), { status:422 })
  const allowedStyles = Array.isArray(config.allowedStyleCodes) ? config.allowedStyleCodes.map(value => String(value)) : []
  if (allowedStyles.length && designer.styleCode && !allowedStyles.includes(designer.styleCode)) throw Object.assign(new Error('The selected garment cut is not available for this listing.'), { status:422 })
  if (designer.listingId && safeText(designer.listingId, 160) !== String(product.id) && safeText(designer.listingId, 160) !== String(product.handle)) throw Object.assign(new Error('The 3D design references a different listing.'), { status:422 })
  if (designer.listingHandle && safeText(designer.listingHandle, 160) !== String(product.handle)) throw Object.assign(new Error('The 3D design handle does not match this listing.'), { status:422 })
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST customization requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 80000)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'customization-order', identityHash)

    const productId = safeText(body.productId, 160)
    const variantId = safeText(body.variantId, 180)
    const idempotencyKey = safeText(body.idempotencyKey, 180)
    if (!productId || !variantId || !/^[a-zA-Z0-9_-]{16,180}$/.test(idempotencyKey)) throw Object.assign(new Error('Listing, variation and request key are required.'), { status:422 })

    const product = await publishedListing(client, productId)
    if (!product) throw Object.assign(new Error('This listing is no longer published.'), { status:404 })
    const { data:variant, error:variantError } = await client.from('pod_product_variants').select('id, sku, option_values, price, inventory, reserved_inventory, status').eq('id', variantId).eq('product_id',product.id).eq('status','ACTIVE').maybeSingle()
    if (variantError) throw variantError
    if (!variant || Math.max(0, Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0)) < 1) throw Object.assign(new Error('This variation is unavailable. Choose another option.'), { status:409 })

    const schema = Array.isArray(product.custom_fields) ? product.custom_fields : []
    const incoming = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields : {}
    const allowedKeys = new Set(schema.map(field => field.key))
    if (Object.keys(incoming).some(key => !allowedKeys.has(key))) throw Object.assign(new Error('The request contains a field this listing does not allow.'), { status:422 })
    const fields = Object.fromEntries(schema.map(field => [field.key, fieldValue(field, incoming[field.key])]))
    const missing = schema.filter(field => field.required && !fields[field.key]).map(field => field.label)
    if (missing.length) throw Object.assign(new Error(`Complete the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`), { status:422 })

    const note = safeText(body.note, 500)
    const aiPrompt = safeText(body.aiPrompt, 1200)
    const incomingAssetRefs = body.assetRefs && typeof body.assetRefs === 'object' && !Array.isArray(body.assetRefs) ? body.assetRefs : {}
    const assetKeys = new Set(schema.filter(field => ['photo','logo'].includes(field.type)).map(field => field.key))
    const assetRefs = {}
    for (const [key,raw] of Object.entries(incomingAssetRefs)) {
      const field = schema.find(item => item.key === key)
      if (!assetKeys.has(key) || !field) throw Object.assign(new Error('A customer reference does not belong to this request.'), { status:422 })
      try {
        assetRefs[key] = assertCustomerAsset(product.id, identityHash, raw, { kind:field.type })
      } catch (error) {
        if (error?.status) throw error
        throw Object.assign(new Error('A customer reference does not belong to this request.'), { status:422 })
      }
    }
    const incomingDesignerAssetRefs = Array.isArray(body.designerAssetRefs) ? body.designerAssetRefs : []
    if (incomingDesignerAssetRefs.length > 16) throw Object.assign(new Error('A design can contain up to sixteen uploaded image assets.'), { status:422 })
    if (incomingDesignerAssetRefs.length && !schema.some(field => field.type === 'logo') && !body.designer) throw Object.assign(new Error('This listing does not accept designer image layers.'), { status:422 })
    const designerAssetRefs = incomingDesignerAssetRefs.map((raw, index) => {
      try {
        // The normalized designer spec below determines whether this index is
        // a logo (private PNG) or artwork (private WebP).  We validate the
        // path once more after parsing the spec; this first check only limits
        // the storage object to the current customer session.
        return assertCustomerAsset(product.id, identityHash, raw, { kind:'' })
      } catch (error) {
        if (error?.status) throw error
        throw Object.assign(new Error('A 3D image layer does not belong to this request.'), { status:422 })
      }
    })
    const aiPreviewId = safeText(body.aiPreviewId,180)
    const aiPreviewUrl = safeText(body.aiPreviewUrl, 1600)
    if (aiPreviewUrl && !/^https:\/\//i.test(aiPreviewUrl)) throw Object.assign(new Error('AI preview must be a secure stored URL.'), { status:422 })
    if (aiPreviewUrl && !aiPreviewId) throw Object.assign(new Error('AI preview reference is missing its stored preview ID.'), { status:422 })
    let aiPreviewStorage=null
    if(aiPreviewId){
      let {data:job,error:jobError}=await client.from('pod_ai_preview_jobs').select('id,product_id,session_hash,storage_path,status').eq('id',aiPreviewId).eq('product_id',product.id).eq('session_hash',identityHash).eq('status','COMPLETED').maybeSingle()
      if(jobError)throw jobError
      if(!job){
        // Resilient fallback: if mobile carrier NAT / Wi-Fi rotated IP between preview and order, verify by unique job ID and product ID
        const {data:anyJob,error:anyError}=await client.from('pod_ai_preview_jobs').select('id,product_id,session_hash,storage_path,status').eq('id',aiPreviewId).eq('product_id',product.id).eq('status','COMPLETED').maybeSingle()
        if(anyError)throw anyError
        if(anyJob) job = anyJob
      }
      if(!job)throw Object.assign(new Error('The AI preview does not belong to this request.'),{status:422})
      aiPreviewStorage={bucket:'ai-previews',path:job.storage_path,jobId:job.id}
    }
    const logoFields = schema.filter(field => field.type === 'logo' && fields[field.key])
    const logoConsent = body.logoConsent === true
    const assetConsent = body.assetConsent === true || logoConsent
    if (logoFields.some(field => field.requiresConsent !== false) && !logoConsent) {
      throw Object.assign(new Error('Confirm that you own or have permission to use the uploaded logo.'), { status:422 })
    }
    for (const field of logoFields) {
      if (!assetRefs[field.key]) throw Object.assign(new Error(`${field.label || 'Logo'} must use the securely uploaded logo asset.`), { status:422 })
      if (!field.previewRegion && !field.studioReviewRequired) throw Object.assign(new Error(`${field.label || 'Logo'} has no designer-approved placement area.`), { status:422 })
    }
    if (!Object.values(fields).some(Boolean) && !note && !aiPreviewStorage) throw Object.assign(new Error('Add at least one custom detail, studio note or AI preview.'), { status:422 })
    const designer = normalizeDesignerSpec(body.designer)
    const imageLayers = designer?.layers?.filter(layer => ['logo', 'artwork'].includes(layer.kind)) || []
    if (imageLayers.length && !assetConsent) throw Object.assign(new Error('Confirm that you own or have permission to use every uploaded logo or artwork asset.'), { status:422 })
    // Verify the extension of every uploaded object against its declared layer
    // kind. This prevents a WebP artwork from being replayed as a logo PNG (or
    // vice versa) while keeping the refs opaque to the client.
    imageLayers.forEach(layer => {
      const ref = designerAssetRefs[layer.assetIndex]
      try { assertCustomerAsset(product.id, identityHash, ref, { kind:layer.kind === 'logo' ? 'logo' : 'artwork' }) }
      catch (error) { throw error?.status ? error : Object.assign(new Error('A 3D image asset does not match its layer.'), { status:422 }) }
    })
    validateDesignerAssetRefs(designer, designerAssetRefs)
    validateListingDesigner(product, designer)

    const storedAssetRefs = {
      ...assetRefs,
      ...Object.fromEntries(designerAssetRefs.map((asset, index) => {
        const layer = imageLayers.find(item => Number(item.assetIndex) === index)
        return [`designer-${layer?.kind === 'artwork' ? 'artwork' : 'logo'}-${index + 1}`, asset]
      }))
    }

    const payload = {
      listingId:product.id,
      listingHandle:product.handle,
      listingImage:product.image,
      variantId:variant.id,
      sku:variant.sku,
      options:variant.option_values || {},
      unitPrice:Number(variant.price),
      fields,
      assetRefs,
      designerAssetRefs,
      note,
      assetConsent,
      aiPreviewUrl:aiPreviewUrl || null,
      aiPreviewStorage,
      aiPrompt:aiPrompt || null,
      logoConsent:logoFields.length ? { accepted:logoConsent, acceptedAt:new Date().toISOString(), fieldKeys:logoFields.map(field => field.key) } : null,
      designer,
      source:designer ? 'jersevo-3d-designer' : aiPreviewUrl ? 'ai-assisted-product-page' : 'product-page'
    }
    const order = {
      id:`custom-${randomUUID()}`,
      product_id:product.id,
      variant_id:variant.id,
      template_id:null,
      template_version:null,
      listing_revision:product.updated_at,
      custom_schema:schema,
      asset_refs:storedAssetRefs,
      ai_preview_id:aiPreviewId || null,
      idempotency_key:idempotencyKey,
      session_hash:identityHash,
      payload,
      preview_front_url:aiPreviewUrl || null,
      status:'PREVIEW'
    }
    const { data, error } = await client.from('pod_customization_orders').insert(order).select('id, status, created_at').single()
    if (error?.code === '23505') {
      const existing = await client.from('pod_customization_orders').select('id, status, created_at').eq('idempotency_key',idempotencyKey).eq('session_hash',identityHash).maybeSingle()
      if (existing.data) return sendJson(response, 200, { order:existing.data, replayed:true })
    }
    if (error) throw error
    return sendJson(response, 201, { order:data })
  } catch (error) {
    return handleApiError(response, error, 'The custom request could not be saved.')
  }
}
