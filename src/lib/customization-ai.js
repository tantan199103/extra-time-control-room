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
  const supported = (Array.isArray(fields) ? fields : []).filter(field => !field?.studioReviewRequired && !['photo', 'textarea'].includes(field?.type))
  const explicitReady = supported.filter(field => normalizePreviewRegion(field?.previewRegion))
  const missing = supported.filter(field => !normalizePreviewRegion(field?.previewRegion))
  const hasExplicit = explicitReady.length > 0
  const ready = hasExplicit ? explicitReady : supported
  return {
    enabled: supported.length > 0,
    readyCount: hasExplicit ? explicitReady.length : supported.length,
    supportedCount: supported.length,
    readyFields: ready,
    missingFields: hasExplicit ? missing : [],
    dynamic: !hasExplicit && supported.length > 0,
    allFields: supported
  }
}

export function buildDynamicPreviewDirection({ title, details = [] } = {}) {
  const requestedDetails = details
    .map(item => ({ label:clean(item?.label, 80), value:clean(item?.value, 500), region:normalizePreviewRegion(item?.region) }))
    .filter(item => item.label && item.value)
  if (!requestedDetails.length) throw new Error('Add at least one personal detail.')
  const normalizedDetails = requestedDetails.slice(0, 12)
  const changes = normalizedDetails.map(item => `${item.label}: ${item.value}`).join('; ')
  const productTitle = clean(title, 140) || 'this jersey'
  return {
    mode:'dynamic-design-edit',
    summary:changes,
    details:normalizedDetails,
    direction:[
      `Analyze the garment photo of “${productTitle}” and proactively apply the requested personalization.`,
      `Customer personalization details: ${changes}.`,
      'Intelligently analyze the jersey design, silhouette, collar, badges, seams, and fabric weave to determine the natural, authentic placement for each detail (e.g. arched player nameplate across upper back/chest, squad number centered below name, matching team color accents).',
      'Render the custom text and numbers with matching athletic typography, correct perspective, fabric fold curvature, realistic lighting and surface texture.',
      'Preserve the original jersey pattern, team crests, sponsors, background, camera angle, and photograph authentic quality.'
    ].join(' ')
  }
}

export function buildExactPreviewDirection({ title, details = [], allowDynamic = false } = {}) {
  const requestedDetails = details
    .map(item => ({ label:clean(item?.label, 80), value:clean(item?.value, 500), region:normalizePreviewRegion(item?.region) }))
    .filter(item => item.label && item.value)
  if (!allowDynamic && requestedDetails.some(item => !item.region)) throw new Error('Every personal detail needs a designer-approved edit area.')
  if (allowDynamic && requestedDetails.some(item => !item.region)) return buildDynamicPreviewDirection({ title, details })
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
