const clean = (value, max = 500) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim()
  .slice(0, max)

export function normalizePreviewRegion(region) {
  if (!region || typeof region !== 'object' || Array.isArray(region)) return null
  const x = Number(region.x), y = Number(region.y), width = Number(region.width), height = Number(region.height)
  if (![x,y,width,height].every(Number.isFinite)) return null
  const normalized = {
    x:Math.max(0,Math.min(100,x)),
    y:Math.max(0,Math.min(100,y)),
    width:Math.max(1,Math.min(100,width)),
    height:Math.max(1,Math.min(100,height))
  }
  if (normalized.x + normalized.width > 100) normalized.width = 100 - normalized.x
  if (normalized.y + normalized.height > 100) normalized.height = 100 - normalized.y
  return normalized.width >= 1 && normalized.height >= 1 ? normalized : null
}

export function productPreviewReadiness(fields = []) {
  const supported = (Array.isArray(fields) ? fields : []).filter(field => !['photo', 'textarea'].includes(field?.type))
  const ready = supported.filter(field => normalizePreviewRegion(field?.previewRegion))
  const missing = supported.filter(field => !normalizePreviewRegion(field?.previewRegion))
  return {
    enabled: ready.length > 0,
    readyCount: ready.length,
    supportedCount: supported.length,
    readyFields: ready,
    missingFields: missing
  }
}

export function buildExactPreviewDirection({ title, details = [] } = {}) {
  const requestedDetails = details
    .map(item => ({ label:clean(item?.label, 80), value:clean(item?.value, 500), region:normalizePreviewRegion(item?.region) }))
    .filter(item => item.label && item.value)
  if (requestedDetails.some(item => !item.region)) throw new Error('Every personal detail needs a designer-approved edit area.')
  const normalizedDetails = requestedDetails.slice(0, 12)
  if (!normalizedDetails.length) throw new Error('Add at least one personal detail.')
  const changes = normalizedDetails.map(item => `${item.label}: ${item.value}`).join('; ')
  const productTitle = clean(title, 140) || 'this listing'
  return {
    mode:'exact-image-edit',
    summary:changes,
    details:normalizedDetails,
    direction:[
      `Edit the supplied image of “${productTitle}” in place.`,
      `Change only these approved personalisation values: ${changes}.`,
      'This is a strict two-dimensional image edit, not a new product render.',
      'Keep the original canvas size, crop, camera angle, garment silhouette, collar, sleeves, seams, folds, fabric texture, lighting, shadows, background, logos, marks, pattern, artwork, typography style and every non-requested pixel visually unchanged.',
      'Do not create a 3D mockup, a new garment, a new pose, another view, another model, another background, additional graphics or a redesigned pattern.',
      'Replace only the existing customer-editable text or colour area required by the supplied values. If an exact local edit is not possible, return no image rather than reinterpret the design.'
    ].join(' ')
  }
}
