import { json, options, readJson, requireCustomer, safeText, serviceSupabase, withError } from '../_shared/http.ts'
import { quoteCart } from '../_shared/membership.ts'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return options(request)
  if (request.method !== 'POST') return json(request, { error: 'POST member quote requests only.' }, 405)
  try {
    const body = await readJson(request, 32_000)
    const requested = Array.isArray(body.lines) ? body.lines.slice(0, 100) : []
    if (!requested.length) return json(request, { member: false, membershipStatus: 'NONE', currency: 'USD', lines: [], publicSubtotal: 0, subtotal: 0, discount: 0, shipping: { eligible: false, subsidyCap: 0, reason: 'Bag is empty' } })
    const client = serviceSupabase()
    const user = await requireCustomer(request, client)
    const normalized = requested.map((line: any) => ({ lineKey: safeText(line.lineKey, 240), productId: safeText(line.productId, 160), variantId: safeText(line.variantId, 180), qty: Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1)))) }))
    if (normalized.some(line => !line.lineKey || !line.productId || !line.variantId) || new Set(normalized.map(line => line.lineKey)).size !== normalized.length) throw Object.assign(new Error('Each bag line needs a unique listing and variation.'), { status: 422 })
    const variantIds = [...new Set(normalized.map(line => line.variantId))]
    const productIds = [...new Set(normalized.map(line => line.productId))]
    const [{ data: variants, error: variantError }, { data: products, error: productError }, { data: memberships, error: memberError }, { data: program, error: programError }, { data: rules, error: rulesError }, { data: collectionRows, error: collectionError }] = await Promise.all([
      client.from('pod_product_variants').select('id,product_id,sku,price,compare_at,cost,inventory,status').in('id', variantIds),
      client.from('pod_products').select('id,status,tags').in('id', productIds),
      client.from('pod_memberships').select('*').eq('user_id', user.id).in('status', ['ACTIVE', 'TRIALING']).order('current_period_end', { ascending: false }).limit(1),
      client.from('pod_membership_programs').select('*').eq('id', '90-club').maybeSingle(),
      client.from('pod_membership_discount_rules').select('*').eq('program_id', '90-club').eq('active', true),
      client.from('pod_collection_products').select('product_id,collection_id').in('product_id', productIds)
    ])
    if (variantError || productError || memberError || programError || rulesError || collectionError) throw variantError || productError || memberError || programError || rulesError || collectionError
    const productMap = new Map((products || []).map(item => [item.id, item]))
    const variantMap = new Map((variants || []).map(item => [item.id, item]))
    const collectionMap = new Map(productIds.map(id => [id, (collectionRows || []).filter(row => row.product_id === id).map(row => row.collection_id)]))
    const lines = normalized.map(line => {
      const variant = variantMap.get(line.variantId); const product = productMap.get(line.productId)
      if (!variant || variant.product_id !== line.productId || variant.status !== 'ACTIVE' || !product || product.status !== 'PUBLISHED') throw Object.assign(new Error('A bag variation is no longer available.'), { status: 409 })
      if (Number(variant.inventory || 0) < line.qty) throw Object.assign(new Error(`Only ${Math.max(0, Number(variant.inventory || 0))} unit(s) remain for ${variant.sku}.`), { status: 409 })
      return { ...line, sku: variant.sku, price: Number(variant.price), compareAt: variant.compare_at == null ? null : Number(variant.compare_at), cost: variant.cost == null ? null : Number(variant.cost), tags: product.tags || [], collections: collectionMap.get(line.productId) || [] }
    })
    return json(request, quoteCart({ lines, membership: memberships?.[0] || null, program, rules: rules || [], shipping: { country: safeText(body.shipping?.country, 2) } }))
  } catch (error) { return withError(request, error, 'Member quote could not be calculated.') }
})
