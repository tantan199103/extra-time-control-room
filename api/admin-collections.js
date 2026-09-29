import { enforceSameOrigin, handleApiError, requireAdmin, safeText, sendJson, serverSupabase } from './_security.js'

const collectionFields = 'id,handle,name,description,status,hero_image,sort_mode,seo,automation,created_at,updated_at'
const linkFields = 'collection_id,product_id,sort_order,featured'
const catalogFields = [
  'id', 'handle', 'title', 'subtitle', 'status', 'type', 'image', 'sku', 'tags',
  'product_group', 'taxonomy', 'custom_fields', 'personalization', 'seo_status', 'updated_at'
].join(',')

function positiveInt(value, fallback, max) {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

function safeSearch(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}\s._\/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

async function readMembership(client, collectionId) {
  const rows = []
  let cursor = ''
  for (;;) {
    let query = client.from('pod_collection_products')
      .select(linkFields)
      .eq('collection_id', collectionId)
      .order('product_id', { ascending: true })
      .range(0, 999)
    if (cursor) query = query.gt('product_id', cursor)
    const { data, error } = await query
    if (error) throw error
    const chunk = Array.isArray(data) ? data : []
    rows.push(...chunk)
    if (chunk.length < 1000) break
    const next = String(chunk.at(-1)?.product_id || '')
    if (!next || next === cursor) throw new Error('Collection membership cursor did not advance.')
    cursor = next
  }
  return rows
}

function applyCatalogFilters(query, params) {
  const status = safeText(params.status, 20).toUpperCase()
  const seoStatus = safeText(params.seoStatus, 20).toUpperCase()
  const productGroup = safeText(params.productGroup, 80)
  const productType = safeText(params.productType, 80)
  const category = safeText(params.category, 120)
  const accessoryFamily = safeText(params.accessoryFamily, 120)
  const accessoryType = safeText(params.accessoryType, 120)
  const term = safeSearch(params.search)
  if (status && status !== 'ALL') query = query.eq('status', status)
  if (seoStatus && seoStatus !== 'ALL') query = query.eq('seo_status', seoStatus)
  if (productGroup && productGroup !== 'ALL') query = query.eq('product_group', productGroup)
  if (productType && productType !== 'ALL') query = query.eq('type', productType)
  if (category && category !== 'ALL') query = query.eq('taxonomy->>category', category)
  if (accessoryFamily && accessoryFamily !== 'ALL') query = query.eq('taxonomy->>accessoryCategory', accessoryFamily)
  if (accessoryType && accessoryType !== 'ALL') query = query.eq('taxonomy->>accessoryType', accessoryType)
  if (term) query = query.or(`title.ilike.*${term}*,handle.ilike.*${term}*,sku.ilike.*${term}*,type.ilike.*${term}*,product_group.ilike.*${term}*`)
  return query
}

async function metadata(client) {
  const withCounts = await client.from('pod_collections')
    .select(`${collectionFields},pod_collection_products(count)`)
    .order('updated_at', { ascending: false })
  if (!withCounts.error) return withCounts.data || []
  // Counts are useful in the tree, but metadata must remain available even if
  // a project has not yet created the relation-count plan.
  const lean = await client.from('pod_collections')
    .select(collectionFields)
    .order('updated_at', { ascending: false })
  if (lean.error) throw lean.error
  return lean.data || []
}

export default async function handler(request, response) {
  try {
    enforceSameOrigin(request)
    const client = serverSupabase()
    await requireAdmin(request, client)
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'GET collection administration only.' })

    const params = request.query || {}
    const mode = safeText(params.mode || 'metadata', 24).toLowerCase()
    if (mode === 'metadata') return sendJson(response, 200, { collections: await metadata(client) })

    const collectionId = safeText(params.collectionId, 180)
    if (mode === 'membership') {
      if (!collectionId) throw Object.assign(new Error('Collection ID is required.'), { status: 422 })
      const links = await readMembership(client, collectionId)
      return sendJson(response, 200, { links })
    }

    if (mode === 'catalog') {
      const page = positiveInt(params.page, 1, 100000)
      const pageSize = positiveInt(params.pageSize, 50, 100)
      const from = (page - 1) * pageSize
      const projection = collectionId
        ? `${catalogFields},collection_membership:pod_collection_products!inner(collection_id)`
        : catalogFields
      let query = client.from('pod_products').select(projection, { count: 'exact' })
      if (collectionId) query = query.eq('collection_membership.collection_id', collectionId)
      query = applyCatalogFilters(query, params)
      const result = await query
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (result.error) throw result.error
      return sendJson(response, 200, { products: result.data || [], total: Number.isInteger(result.count) ? result.count : (result.data || []).length, page, pageSize })
    }

    throw Object.assign(new Error('Unknown collection administration mode.'), { status: 422 })
  } catch (error) {
    return handleApiError(response, error, 'Collection administration request failed.')
  }
}
