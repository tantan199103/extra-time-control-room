import { safeText } from './_security.js'

export function getOrigin(request) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.FRONTEND_URL
  if (configured) {
    try { return new URL(configured).origin } catch {}
  }
  const forwarded = request.headers?.['x-forwarded-host'] || request.headers?.host || 'localhost:5173'
  const protocol = request.headers?.['x-forwarded-proto'] || (forwarded.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${forwarded}`
}

export async function publishedListing(client, productId) {
  const columns = 'id, handle, title, image, custom_fields, status'
  let result = await client.from('pod_products').select(columns).eq('id', productId).eq('status','PUBLISHED').maybeSingle()
  if (!result.data && !result.error) result = await client.from('pod_products').select(columns).eq('handle', productId).eq('status','PUBLISHED').maybeSingle()
  if (result.error) throw result.error
  return result.data
}

export function logoField(listing, fieldKey) {
  const key = safeText(fieldKey, 100)
  const field = (Array.isArray(listing?.custom_fields) ? listing.custom_fields : []).find(item => item.key === key && item.type === 'logo')
  if (!field) throw Object.assign(new Error('This listing does not allow a logo in that field.'), { status:422 })
  if (!field.previewRegion) throw Object.assign(new Error('This listing has no designer-approved logo area yet.'), { status:422 })
  return field
}

export function assertCustomerAsset(productId, identityHash, rawAsset, { kind = '' } = {}) {
  const bucket = safeText(rawAsset?.bucket, 80)
  const path = safeText(rawAsset?.path, 700)
  const sessionPrefix = identityHash.slice(0,16)
  const parts = path.split('/')
  const prefix = `${productId}/${sessionPrefix}/`
  const filename = parts[2] || ''
  const normalizedPath = parts.length === 3
    && parts[0] === String(productId)
    && parts[1] === sessionPrefix
    && /^[A-Za-z0-9_-]+\.(?:png|webp)$/i.test(filename)
    ? path
    : ''
  if (bucket !== 'customer-references' || !normalizedPath || !path.startsWith(prefix)) {
    throw Object.assign(new Error('The uploaded logo does not belong to this request.'), { status:422 })
  }
  if (kind === 'logo' && !/\.png$/i.test(path)) {
    throw Object.assign(new Error('The logo asset must be the normalized private PNG upload.'), { status:422 })
  }
  if (kind === 'photo' && !/\.webp$/i.test(path)) {
    throw Object.assign(new Error('The reference asset must be the normalized private WebP upload.'), { status:422 })
  }
  return { bucket, path:normalizedPath }
}

export async function downloadStorageAsset(client, asset) {
  const { data, error } = await client.storage.from(asset.bucket).download(asset.path)
  if (error || !data) throw error || Object.assign(new Error('The uploaded logo could not be loaded.'), { status:422 })
  return Buffer.from(await data.arrayBuffer())
}

export async function fetchListingImage(request, listing) {
  if (!listing?.image) throw Object.assign(new Error('This listing has no primary image reference.'), { status:422 })
  let url
  try { url = new URL(listing.image, getOrigin(request)) } catch { throw Object.assign(new Error('The listing primary image URL is invalid.'), { status:422 }) }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('The listing primary image must be an HTTP or HTTPS image.'), { status:422 })
  const response = await fetch(url, { signal:AbortSignal.timeout(15000) })
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || !contentType.startsWith('image/')) throw Object.assign(new Error(`Listing reference could not be loaded (${response.status}).`), { status:502 })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw Object.assign(new Error('The listing reference is too large for logo editing.'), { status:422 })
  return { bytes, url:url.toString() }
}
