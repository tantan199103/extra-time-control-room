import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy.js'

function safeSvgBytes(input, mediaType) {
  const head = input.slice(0, 1024).toString('utf8')
  const looksLikeSvg = /svg\+xml/i.test(mediaType) || /^\uFEFF?\s*(?:<!--[^>]*-->\s*)*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(head)
  if (!looksLikeSvg) return input
  const source = input.toString('utf8')
  if (/<\/?(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|file:|javascript:|\/\/)|url\s*\(|@import|<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw Object.assign(new Error('SVG logos may not contain scripts or external references.'), { status:422 })
  }
  return Buffer.from(source.replace(/<!--([\s\S]*?)-->/g, ''), 'utf8')
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST customer image uploads only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12 * 1024 * 1024)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'customer-upload', identityHash)
    const productId = safeText(body.productId, 160)
    const fieldKey = safeText(body.fieldKey, 100)
    const kind = String(body.kind || '').toLowerCase() === 'logo' ? 'logo' : 'photo'
    const match = String(body.dataUrl || '').match(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i)
    if (!productId || !fieldKey || !match) throw Object.assign(new Error(kind === 'logo' ? 'Choose a PNG, SVG, JPG or WebP logo.' : 'Choose a JPG, PNG or WebP image.'), { status:422 })
    const input = safeSvgBytes(Buffer.from(match[2], 'base64'), match[1])
    const limit = kind === 'logo' ? 8 * 1024 * 1024 : 2 * 1024 * 1024
    if (!input.length || input.length > limit) throw Object.assign(new Error(`${kind === 'logo' ? 'Logo' : 'Reference image'} must be smaller than ${limit / 1024 / 1024} MB.`), { status:422 })
    let { data:product, error:productError } = await client.from('pod_products').select('id, handle, custom_fields').eq('id',productId).eq('status','PUBLISHED').maybeSingle()
    if (!product && !productError) ({ data:product, error:productError } = await client.from('pod_products').select('id, handle, custom_fields').eq('handle',productId).eq('status','PUBLISHED').maybeSingle())
    if (productError) throw productError
    const field = (Array.isArray(product?.custom_fields) ? product.custom_fields : []).find(item => item.key === fieldKey && item.type === kind)
    if (!field) throw Object.assign(new Error(kind === 'logo' ? 'This listing does not allow a logo in that field.' : 'This listing does not allow a photo in that field.'), { status:422 })
    let output
    try { output = await sharp(input).rotate().resize({ width:2400, height:2400, fit:'inside', withoutEnlargement:true }).webp({ quality:86 }).toBuffer() }
    catch { throw Object.assign(new Error('The selected image could not be read.'), { status:422 }) }
    let contentType = 'image/webp'
    if (kind === 'logo') {
      try {
        const inspected = await sharp(input).metadata()
        const minimum = Math.max(256, Number(field.minWidth || 800))
        if (!inspected.width || !inspected.height || Math.max(inspected.width, inspected.height) < minimum) throw Object.assign(new Error(`Logo should be at least ${minimum}px on its longest side.`), { status:422 })
        output = await sharp(input).rotate().ensureAlpha().resize({ width:2400, height:2400, fit:'inside', withoutEnlargement:true }).png().toBuffer()
        contentType = 'image/png'
      } catch (error) {
        if (error?.status) throw error
        throw Object.assign(new Error('The selected logo could not be read.'), { status:422 })
      }
      try {
        const cleaned = await sanitizeImagePrivacyMetadata(new Blob([output], { type:'image/png' }))
        output = Buffer.from(await cleaned.arrayBuffer())
      } catch {
        throw Object.assign(new Error('The selected logo could not be cleaned safely.'), { status:422 })
      }
    }
    const path = `${product.id}/${identityHash.slice(0,16)}/${randomUUID()}.${kind === 'logo' ? 'png' : 'webp'}`
    const { error:uploadError } = await client.storage.from('customer-references').upload(path, output, { contentType, cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('customer-references').createSignedUrl(path, 60 * 60 * 24 * 7)
    if (signError || !signed?.signedUrl) throw signError || new Error('Reference URL could not be created.')
    const metadata = await sharp(output).metadata().catch(() => ({}))
    return sendJson(response, 201, { imageUrl:signed.signedUrl, storage:{ bucket:'customer-references', path }, kind, quality:{ width:metadata.width || null, height:metadata.height || null, hasAlpha:Boolean(metadata.hasAlpha), ready:true }, expiresIn:604800 })
  } catch (error) {
    return handleApiError(response, error, 'The reference image could not be uploaded.')
  }
}
