import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'
import { enforceSameOrigin, handleApiError, readBody, requireAdmin, safeText, sendJson, serverSupabase } from './_security.js'

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

function hasProvenance(bytes, type) {
  const lower = Buffer.from(bytes).toString('latin1').toLowerCase()
  if (lower.includes('c2pa') || lower.includes('jumbf') || lower.includes('cabx')) return true
  // JPEG Content Credentials are commonly carried in an APP11/JUMBF segment.
  if (type === 'image/jpeg') {
    for (let index = 0; index + 1 < bytes.length; index += 1) if (bytes[index] === 0xff && bytes[index + 1] === 0xeb) return true
  }
  return false
}

function decodeDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp|avif));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) throw Object.assign(new Error('Choose a JPG, PNG, WebP or AVIF image.'), { status:422 })
  const type = match[1].toLowerCase()
  const bytes = Buffer.from(match[2], 'base64')
  if (!ALLOWED_TYPES.has(type) || !bytes.length || bytes.length > MAX_INPUT_BYTES) throw Object.assign(new Error('Image must be smaller than 15 MB.'), { status:422 })
  return { type, bytes }
}

function safePathPart(value, fallback) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || fallback
}

async function cleanImage(input) {
  const originalType = input.type
  const provenanceDetected = hasProvenance(input.bytes, originalType)
  let output = input.bytes
  let contentType = originalType
  let mode = provenanceDetected ? 'PROVENANCE_PRESERVED' : 'OPTIMIZED'
  let metadata

  if (provenanceDetected) {
    // Privacy cleaning is safe; re-encoding is not, because it can destroy a
    // valid C2PA manifest. Keep the original pixels and provenance intact.
    const cleaned = await sanitizeImagePrivacyMetadata(new Blob([input.bytes], { type:originalType }))
    output = Buffer.from(await cleaned.arrayBuffer())
    metadata = await sharp(output).metadata()
  } else {
    const inspected = await sharp(input.bytes).metadata()
    const alpha = Boolean(inspected.hasAlpha)
    const pipeline = sharp(input.bytes).rotate().resize({ width:2400, height:2400, fit:'inside', withoutEnlargement:true })
    if (alpha) {
      output = await pipeline.png({ compressionLevel:9, effort:6 }).toBuffer()
      contentType = 'image/png'
    } else {
      output = await pipeline.webp({ quality:84, effort:5 }).toBuffer()
      contentType = 'image/webp'
    }
    const cleaned = await sanitizeImagePrivacyMetadata(new Blob([output], { type:contentType }))
    output = Buffer.from(await cleaned.arrayBuffer())
    metadata = await sharp(output).metadata()
  }

  return {
    bytes:output,
    contentType,
    extension:contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1],
    width:metadata?.width || null,
    height:metadata?.height || null,
    mode,
    provenanceDetected,
    originalBytes:input.bytes.length
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST product image uploads only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 24 * 1024 * 1024)
    const client = serverSupabase()
    const admin = await requireAdmin(request, client)
    const productId = safeText(body.productId, 160)
    if (!productId) throw Object.assign(new Error('A product ID is required.'), { status:422 })
    let { data:product, error:productError } = await client.from('pod_products').select('id,title,status').eq('id',productId).maybeSingle()
    if (!product && !productError) ({ data:product, error:productError } = await client.from('pod_products').select('id,title,status').eq('handle',productId).maybeSingle())
    if (productError) throw productError
    if (!product) throw Object.assign(new Error('Listing not found.'), { status:404 })
    if (String(product.status || '').toUpperCase() === 'ARCHIVED') throw Object.assign(new Error('Archived listings cannot receive new media.'), { status:409 })

    const input = decodeDataUrl(body.dataUrl)
    let cleaned
    try { cleaned = await cleanImage(input) }
    catch (error) {
      if (error?.status) throw error
      throw Object.assign(new Error('The selected image could not be read or safely optimized.'), { status:422 })
    }
    const id = randomUUID()
    const safeProduct = safePathPart(product.id, 'product')
    const filename = safePathPart(body.filename, 'media')
    const path = `${safeProduct}/${id}-${filename}.${cleaned.extension}`
    const { error:uploadError } = await client.storage.from('product-media').upload(path, cleaned.bytes, { contentType:cleaned.contentType, cacheControl:'31536000', upsert:false })
    if (uploadError) throw uploadError
    const { data:publicData } = client.storage.from('product-media').getPublicUrl(path)
    if (!publicData?.publicUrl) throw new Error('The upload finished but no public media URL was returned.')
    const title = safeText(product.title, 120)
    const requestedAlt = safeText(body.alt, 240)
    const alt = requestedAlt || `${title || 'Product'} product image`
    const media = {
      id:`media-${id}`, type:'IMAGE', url:publicData.publicUrl, path,
      filename:`${filename}.${cleaned.extension}`, alt, createdAt:new Date().toISOString(),
      width:cleaned.width, height:cleaned.height, byteSize:cleaned.bytes.length,
      optimized:cleaned.mode === 'OPTIMIZED', originalByteSize:cleaned.originalBytes,
      provenance:{ source:'UPLOAD', aiGenerated:'UNKNOWN', status:cleaned.provenanceDetected ? 'CREDENTIALS_PRESENT' : 'NOT_DETECTED', preserved:cleaned.provenanceDetected }
    }
    await client.from('pod_audit_logs').insert({ actor_id:admin.id, entity_type:'product_media', entity_id:product.id, action:'UPLOAD_PRODUCT_MEDIA', snapshot:{ media_id:media.id, optimized:media.optimized, provenance:media.provenance.status } })
    return sendJson(response, 201, { productId:product.id, media, quality:{ width:cleaned.width, height:cleaned.height, bytes:cleaned.bytes.length, originalBytes:cleaned.originalBytes, compressionRatio:cleaned.originalBytes ? Number((cleaned.bytes.length / cleaned.originalBytes).toFixed(3)) : 1, optimized:media.optimized, metadataSanitized:true, provenancePreserved:cleaned.provenanceDetected } })
  } catch (error) {
    return handleApiError(response, error, 'The product image could not be uploaded.')
  }
}
