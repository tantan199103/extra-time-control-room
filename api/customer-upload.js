import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST customer image uploads only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 3 * 1024 * 1024)
    const sessionId = customerSession(body)
    const identityHash = requestIdentity(request, sessionId)
    const client = serverSupabase()
    await consumeQuota(client, 'customer-upload', identityHash)
    const productId = safeText(body.productId, 160)
    const fieldKey = safeText(body.fieldKey, 100)
    const match = String(body.dataUrl || '').match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i)
    if (!productId || !fieldKey || !match) throw Object.assign(new Error('Choose a JPG, PNG or WebP image.'), { status:422 })
    const input = Buffer.from(match[2], 'base64')
    if (!input.length || input.length > 2 * 1024 * 1024) throw Object.assign(new Error('Reference image must be smaller than 2 MB.'), { status:422 })
    const { data:product, error:productError } = await client.from('pod_products').select('id, custom_fields').eq('id',productId).eq('status','PUBLISHED').maybeSingle()
    if (productError) throw productError
    const field = (Array.isArray(product?.custom_fields) ? product.custom_fields : []).find(item => item.key === fieldKey && item.type === 'photo')
    if (!field) throw Object.assign(new Error('This listing does not allow a photo in that field.'), { status:422 })
    let output
    try { output = await sharp(input).rotate().resize({ width:2400, height:2400, fit:'inside', withoutEnlargement:true }).webp({ quality:86 }).toBuffer() }
    catch { throw Object.assign(new Error('The selected image could not be read.'), { status:422 }) }
    const path = `${product.id}/${identityHash.slice(0,16)}/${randomUUID()}.webp`
    const { error:uploadError } = await client.storage.from('customer-references').upload(path, output, { contentType:'image/webp', cacheControl:'3600', upsert:false })
    if (uploadError) throw uploadError
    const { data:signed, error:signError } = await client.storage.from('customer-references').createSignedUrl(path, 60 * 60 * 24 * 7)
    if (signError || !signed?.signedUrl) throw signError || new Error('Reference URL could not be created.')
    return sendJson(response, 201, { imageUrl:signed.signedUrl, storage:{ bucket:'customer-references', path }, expiresIn:604800 })
  } catch (error) {
    return handleApiError(response, error, 'The reference image could not be uploaded.')
  }
}
