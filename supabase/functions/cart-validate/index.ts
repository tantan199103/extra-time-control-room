import { consumeQuota, json, options, readJson, safeText, serviceSupabase, withError } from '../_shared/http.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options(request)
  if (request.method !== 'POST') return json(request, { error: 'POST cart validation requests only.' }, 405)
  try {
    const body = await readJson(request, 24_000)
    const sessionId = String(body.sessionId || '')
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) throw Object.assign(new Error('A valid customer session is required.'), { status: 422 })
    const client = serviceSupabase()
    await consumeQuota(client, request, 'cart-validate', sessionId)
    const requested = Array.isArray(body.lines) ? body.lines.slice(0, 100) : []
    const variantIds = [...new Set(requested.map((line: any) => safeText(line.variantId, 180)).filter(Boolean))]
    const productIds = [...new Set(requested.map((line: any) => safeText(line.productId, 160)).filter(Boolean))]
    if (!variantIds.length) return json(request, { lines: [] })
    const [{ data: variants, error: variantError }, { data: products, error: productError }] = await Promise.all([
      client.from('pod_product_variants').select('id,product_id,sku,price,inventory,status').in('id', variantIds),
      client.from('pod_products').select('id,status,handle,title').in('id', productIds)
    ])
    if (variantError || productError) throw variantError || productError
    const productsById = new Map((products || []).map(row => [row.id, row]))
    const variantsById = new Map((variants || []).map(row => [row.id, row]))
    const lines = requested.map((line: any) => {
      const variant = variantsById.get(line.variantId)
      const product = productsById.get(line.productId)
      const requestedQty = Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1))))
      const available = Boolean(product?.status === 'PUBLISHED' && variant?.product_id === product.id && variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0)
      return { lineKey: safeText(line.lineKey, 240), productId: safeText(line.productId, 160), variantId: safeText(line.variantId, 180), available, qty: available ? Math.min(requestedQty, Number(variant.inventory)) : 0, inventory: available ? Number(variant.inventory) : 0, sku: variant?.sku || '', unitPrice: available ? Number(variant.price) : null, reason: available ? '' : !product || product.status !== 'PUBLISHED' ? 'PRODUCT_UNAVAILABLE' : !variant || variant.status !== 'ACTIVE' ? 'VARIANT_UNAVAILABLE' : 'OUT_OF_STOCK' }
    })
    return json(request, { lines })
  } catch (error) { return withError(request, error, 'Cart could not be validated.') }
})
