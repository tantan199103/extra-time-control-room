import { buildGoogleMerchantCatalogue, renderGoogleMerchantTsv, renderGoogleMerchantXml } from '../src/lib/google-merchant.js'
import { handleApiError, sendJson, serverSupabase } from './_security.js'

const PRODUCT_SELECT = [
  'id', 'handle', 'title', 'subtitle', 'description', 'price', 'compare_at', 'status', 'image',
  'media', 'seo', 'seo_status', 'taxonomy', 'tags', 'product_group', 'sku', 'color', 'inventory',
  'custom_fields', 'pod_product_variants(id,sku,option_values,price,compare_at,inventory,status,image,weight_grams,barcode)'
].join(',')

async function loadProducts(client) {
  const gated = await client
    .from('pod_products')
    .select(PRODUCT_SELECT)
    .eq('status', 'PUBLISHED')
    .eq('seo_status', 'INDEXABLE')
    .order('updated_at', { ascending: false })
    .limit(5000)

  if (!gated.error) return gated.data || []

  // Keep the feed usable while an older Supabase project is applying the SEO
  // gate migration. Never fall back to every published row: only rows carrying
  // the explicit structured INDEXABLE status may enter the legacy path.
  const legacySelect = PRODUCT_SELECT.replace(',seo_status', '')
  const legacy = await client
    .from('pod_products')
    .select(legacySelect)
    .eq('status', 'PUBLISHED')
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (legacy.error) throw legacy.error
  return (legacy.data || []).filter(row => String(row.seo?.status || '').toUpperCase() === 'INDEXABLE')
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'GET Google Merchant feeds only.' })
  try {
    const client = serverSupabase()
    const products = await loadProducts(client)
    const catalogue = buildGoogleMerchantCatalogue(products, {
      origin: process.env.SITE_URL || 'https://www.jersevo.com',
      brand: process.env.GMC_BRAND || 'Extra Time'
    })
    const format = String(request.query?.format || new URL(request.url || 'http://localhost', 'http://localhost').searchParams.get('format') || 'xml').toLowerCase()

    if (format === 'json') {
      // Diagnostics intentionally contain IDs and counts only. Product copy,
      // image URLs and customer data are not returned by the public report.
      return sendJson(response, 200, {
        ...catalogue.report,
        feedUrl: `${new URL(process.env.SITE_URL || 'https://www.jersevo.com').origin}/api/google-merchant-feed`,
        formats: ['xml', 'tsv']
      })
    }

    const body = format === 'tsv' ? renderGoogleMerchantTsv(catalogue) : renderGoogleMerchantXml(catalogue, {
      origin: process.env.SITE_URL || 'https://www.jersevo.com'
    })
    response.setHeader('Content-Type', format === 'tsv' ? 'text/tab-separated-values; charset=utf-8' : 'application/rss+xml; charset=utf-8')
    response.setHeader('Content-Disposition', `inline; filename="jersevo-google-merchant.${format === 'tsv' ? 'tsv' : 'xml'}"`)
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    response.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
    return response.status(200).send(body)
  } catch (error) {
    return handleApiError(response, error, 'Google Merchant feed is unavailable.')
  }
}
