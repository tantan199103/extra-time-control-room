import {
  enforceSameOrigin,
  handleApiError,
  readBody,
  requireAdmin,
  sendJson,
  serverSupabase
} from './_security.js'
import { buildListingInput } from '../src/lib/catalog-model.js'
import {
  normalizeFanaticsProduct,
  isFanaticsTargetProduct,
  hydrateListingMedia,
  PRIMARY_FANATICS_HOST
} from '../scripts/fanatics-import-lib.mjs'
import {
  publicListingHasSourceReferences,
  sanitizePublicText
} from '../scripts/fangear-import-lib.mjs'

export default async function handler(request, response) {
  try {
    enforceSameOrigin(request)
    const client = serverSupabase()
    const internalKey = request.headers?.['x-internal-key']
    // Never ship a usable default import key. Source permission and media
    // permission are separate decisions and must be configured server-side.
    const configuredInternalKey = String(process.env.INTERNAL_IMPORT_KEY || '').trim()
    const isInternalAuth = Boolean(configuredInternalKey && internalKey && internalKey === configuredInternalKey)
    if (!isInternalAuth) {
      await requireAdmin(request, client)
    }

    if (request.method === 'GET') {
      const { data, count, error } = await client
        .from('pod_products')
        .select('id,title,status,image,price,created_at,updated_at', { count: 'exact' })
        .eq('status', 'DRAFT')
      return sendJson(response, 200, {
        totalDrafts: count,
        drafts: data,
        error: error ? error.message : null
      })
    }

    if (request.method !== 'POST') {
      return sendJson(response, 405, { error: 'GET or POST only.' })
    }

    if (String(process.env.FANATICS_SOURCE_AUTHORIZED || '').toLowerCase() !== 'true') {
      return sendJson(response, 403, { error: 'Import is disabled until a licensed source feed, written permission, or owner-provided export is recorded.' })
    }
    if (String(process.env.FANATICS_MEDIA_AUTHORIZED || '').toLowerCase() !== 'true') {
      return sendJson(response, 403, { error: 'Media import is disabled until the source licence explicitly covers product photography reuse.' })
    }

    const rawBody = readBody(request, 1024 * 1024)
    const rawItems = Array.isArray(rawBody)
      ? rawBody
      : (Array.isArray(rawBody.products) ? rawBody.products : [rawBody.product || rawBody])

    const validItems = rawItems.filter(item => item && typeof item === 'object')
    if (!validItems.length) {
      throw Object.assign(new Error('Provide at least one product payload to import.'), { status: 422 })
    }

    const usedHandles = new Set()
    const usedSkus = new Set()
    const results = []
    const errors = []

    for (const rawProduct of validItems.slice(0, 10)) {
      try {
        if (!isFanaticsTargetProduct(rawProduct)) {
          errors.push({ item: rawProduct.name || rawProduct.title || 'Unknown', error: 'Only jersey and hat products are in the approved import scope.' })
          continue
        }
        const normalized = normalizeFanaticsProduct(rawProduct, { usedHandles, usedSkus })

        // Download, strip privacy metadata, and upload to 'product-media' bucket (capped at 4 per item for speed)
        const hydrated = await hydrateListingMedia(client, normalized, { mediaLimit: 4, errors })

        if (publicListingHasSourceReferences(hydrated.listing)) {
          throw new Error('Sanitized listing still contains source references.')
        }

        const listingInput = buildListingInput(hydrated.listing)
        const { data: existing } = await client.from('pod_products').select('id,updated_at').eq('id', hydrated.listing.id).maybeSingle()
        const { error: saveError } = await client.rpc('pod_save_listing', {
          listing: listingInput,
          expected_updated_at: existing?.updated_at || null
        })

        if (saveError) throw saveError

        // Record import in audit log
        await client.from('pod_catalog_imports').upsert({
          source: PRIMARY_FANATICS_HOST,
          source_entity_id: String(hydrated.sourceId),
          entity_type: 'PRODUCT',
          entity_id: hydrated.listing.id,
          source_sku: hydrated.sourceSku || '',
          source_categories: (hydrated.listing.tags || []).map(v => sanitizePublicText(v))
        }, { onConflict: 'source,source_entity_id,entity_type' })

        results.push({
          id: hydrated.listing.id,
          handle: hydrated.listing.handle,
          title: hydrated.listing.title,
          sku: hydrated.listing.sku,
          price: hydrated.listing.price,
          image: hydrated.listing.image,
          adminUrl: `/admin/products/${hydrated.listing.id}`
        })
      } catch (err) {
        errors.push({
          item: rawProduct.name || rawProduct.title || 'Unknown',
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }

    return sendJson(response, 200, {
      success: results.length > 0,
      importedCount: results.length,
      listings: results,
      errors
    })
  } catch (error) {
    return handleApiError(response, error, 'Fanatics import could not be completed.')
  }
}
