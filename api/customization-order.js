import { randomUUID } from 'node:crypto'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

const fieldValue = (field, raw) => {
  if (raw == null || raw === '') return ''
  if (field.type === 'photo') {
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

async function publishedListing(client, productId) {
  const columns = 'id, handle, title, status, updated_at, image, custom_fields'
  let result = await client.from('pod_products').select(columns).eq('id', productId).eq('status','PUBLISHED').maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(columns).eq('handle', productId).eq('status','PUBLISHED').maybeSingle()
  if (result.error) throw result.error
  return result.data
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST customization requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request)
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
    const { data:variant, error:variantError } = await client.from('pod_product_variants').select('id, sku, option_values, price, inventory, status').eq('id', variantId).eq('product_id',product.id).eq('status','ACTIVE').maybeSingle()
    if (variantError) throw variantError
    if (!variant || Number(variant.inventory || 0) < 1) throw Object.assign(new Error('This variation is unavailable. Choose another option.'), { status:409 })

    const schema = Array.isArray(product.custom_fields) ? product.custom_fields : []
    const incoming = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields : {}
    const allowedKeys = new Set(schema.map(field => field.key))
    if (Object.keys(incoming).some(key => !allowedKeys.has(key))) throw Object.assign(new Error('The request contains a field this listing does not allow.'), { status:422 })
    const fields = Object.fromEntries(schema.map(field => [field.key, fieldValue(field, incoming[field.key])]))
    const missing = schema.filter(field => field.required && !fields[field.key]).map(field => field.label)
    if (missing.length) throw Object.assign(new Error(`Complete the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`), { status:422 })

    const note = safeText(body.note, 500)
    const aiPrompt = safeText(body.aiPrompt, 1200)
    const aiPreviewUrl = safeText(body.aiPreviewUrl, 1600)
    if (aiPreviewUrl && !/^https:\/\//i.test(aiPreviewUrl)) throw Object.assign(new Error('AI preview must be a secure stored URL.'), { status:422 })
    if (!Object.values(fields).some(Boolean) && !note && !aiPreviewUrl) throw Object.assign(new Error('Add at least one custom detail, studio note or AI preview.'), { status:422 })

    const payload = {
      listingId:product.id,
      listingHandle:product.handle,
      listingImage:product.image,
      variantId:variant.id,
      sku:variant.sku,
      options:variant.option_values || {},
      unitPrice:Number(variant.price),
      fields,
      note,
      aiPreviewUrl:aiPreviewUrl || null,
      aiPrompt:aiPrompt || null,
      source:aiPreviewUrl ? 'ai-assisted-product-page' : 'product-page'
    }
    const order = {
      id:`custom-${randomUUID()}`,
      product_id:product.id,
      variant_id:variant.id,
      template_id:null,
      template_version:null,
      listing_revision:product.updated_at,
      custom_schema:schema,
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
