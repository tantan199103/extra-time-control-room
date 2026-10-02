/**
 * Deterministic personalization contract shared by the browser designer and
 * server-side order validation.  Owayo's editor treats the first roster row as
 * the live preview; keeping that rule here prevents the common failure where
 * the text panel and the 3D garment show different name/number values.
 */

const FONT_ALLOWLIST = new Set([
  'Barlow Condensed',
  'Manrope',
  'Arial',
  'Georgia',
  'Impact'
])

const PLACEMENT_ALIASES = Object.freeze({
  front:'front-center',
  back:'back-center'
})

const PLACEMENT_PRESETS = Object.freeze({
  'front-center': Object.freeze({ surface:'front', spanFront:true, centerX:.5, centerY:.46, logoHeight:.2, logoWidth:.66 }),
  // The front canvas represents the complete torso. Each chest therefore
  // owns one quarter-center so multiple independent layers can share a single
  // composited UV map without being duplicated across the zip.
  'front-left-chest': Object.freeze({ surface:'front', centerX:.75, centerY:.28, logoHeight:.16, logoWidth:.29 }),
  'front-right-chest': Object.freeze({ surface:'front', centerX:.25, centerY:.28, logoHeight:.16, logoWidth:.29 }),
  'front-lower': Object.freeze({ surface:'front', spanFront:true, centerX:.5, centerY:.67, logoHeight:.2, logoWidth:.66 }),
  'back-upper': Object.freeze({ surface:'back', centerX:.5, centerY:.25, logoHeight:.2, logoWidth:.62 }),
  'back-center': Object.freeze({ surface:'back', centerX:.5, centerY:.46, logoHeight:.22, logoWidth:.66 }),
  'back-lower': Object.freeze({ surface:'back', centerX:.5, centerY:.69, logoHeight:.2, logoWidth:.62 }),
  'left-sleeve': Object.freeze({ surface:'left-sleeve', centerX:.5, centerY:.43, logoHeight:.18, logoWidth:.58 }),
  'right-sleeve': Object.freeze({ surface:'right-sleeve', centerX:.5, centerY:.43, logoHeight:.18, logoWidth:.58 })
})

const PLACEMENTS = new Set(Object.keys(PLACEMENT_PRESETS))
// `artwork` is a customer-supplied image layer.  It shares the same bounded
// UV placement pipeline as a logo, but remains a distinct kind in the order
// contract so production tooling can tell a team mark from general artwork.
const LAYER_KINDS = new Set(['team', 'name', 'number', 'logo', 'artwork'])

export const OWAYO_PRINT_AREA_GROUPS = Object.freeze([
  Object.freeze({ label:'Front', options:Object.freeze([
    Object.freeze({ value:'front-center', label:'Center front' }),
    Object.freeze({ value:'front-left-chest', label:'Left chest' }),
    Object.freeze({ value:'front-right-chest', label:'Right chest' }),
    Object.freeze({ value:'front-lower', label:'Lower front' })
  ]) }),
  Object.freeze({ label:'Back', options:Object.freeze([
    Object.freeze({ value:'back-upper', label:'Upper back' }),
    Object.freeze({ value:'back-center', label:'Center back' }),
    Object.freeze({ value:'back-lower', label:'Lower back' })
  ]) }),
  Object.freeze({ label:'Sleeves', options:Object.freeze([
    Object.freeze({ value:'left-sleeve', label:'Left sleeve' }),
    Object.freeze({ value:'right-sleeve', label:'Right sleeve' })
  ]) })
])

const PLACEMENT_PART_PRIORITIES = Object.freeze({
  'front-center': [['frontleftpart', 'frontrightpart'], ['front']],
  'front-left-chest': [['frontleftpart'], ['front']],
  'front-right-chest': [['frontrightpart'], ['front']],
  'front-lower': [['frontleftpart', 'frontrightpart'], ['front']],
  'back-upper': [['back1'], ['back']],
  'back-center': [['back1'], ['back']],
  'back-lower': [['back1'], ['back']],
  'left-sleeve': [['leftarm'], ['aermelbandlinks'], ['leftcuff'], ['keillinks']],
  'right-sleeve': [['rightarm'], ['aermelbandrechts'], ['rightcuff'], ['keilrechts']]
})

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)

const compactPartName = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

export function normalizeOwayoPlacement(value, fallback = 'front-center') {
  const candidate = clean(value, 24).toLowerCase()
  const canonical = PLACEMENT_ALIASES[candidate] || candidate
  return PLACEMENTS.has(canonical) ? canonical : fallback
}

export function owayoPlacementPreset(placement = 'front-center') {
  const id = normalizeOwayoPlacement(placement)
  return { id, ...PLACEMENT_PRESETS[id] }
}

export function owayoPlacementSurface(placement = 'front-center') {
  return owayoPlacementPreset(placement).surface
}

/**
 * Resolve the deterministic garment mesh set for a print placement. Centered
 * front artwork intentionally spans the paired zip panels; sleeves and split
 * back cuts still select only one primary UV island to prevent duplication.
 */
export function owayoPlacementPartNames(partNames = [], placement = 'front-center') {
  const names = (Array.isArray(partNames) ? partNames : []).map(value => String(value || '')).filter(Boolean)
  const preset = owayoPlacementPreset(placement)
  const priorities = PLACEMENT_PART_PRIORITIES[preset.id] || PLACEMENT_PART_PRIORITIES['front-center']
  for (const group of priorities) {
    const matches = names.filter(name => group.includes(compactPartName(name)))
    if (matches.length) return preset.spanFront ? matches : [matches[0]]
  }
  const prefix = preset.surface === 'back' ? 'back' : preset.surface === 'front' ? 'front' : preset.surface === 'left-sleeve' ? 'left' : 'right'
  return names.filter(name => compactPartName(name).startsWith(prefix)).slice(0, preset.spanFront ? 2 : 1)
}

/**
 * A zipped cycling jersey commonly exposes its front as two independent UV
 * canvases. Map those canvases to opposite halves of one logical artwork so a
 * centered logo or number crosses the zip once instead of being duplicated.
 */
export function owayoPlacementUvTransform(partName, placement = 'front-center', bounds = {}) {
  const preset = owayoPlacementPreset(placement)
  const part = compactPartName(partName)
  if (!preset.spanFront || !['frontleftpart', 'frontrightpart'].includes(part)) {
    return { scaleX:1, scaleY:1, offsetX:0, offsetY:0 }
  }
  const minX = clamp(bounds?.minX, -4, 4, 0)
  const maxX = clamp(bounds?.maxX, -4, 4, 1)
  const span = Math.max(.001, maxX - minX)
  const scaleX = .5 / span
  return {
    scaleX,
    scaleY:1,
    offsetX:(part === 'frontleftpart' ? .5 : 0) - minX * scaleX,
    offsetY:0
  }
}

function sizeTokens(value) {
  const text = clean(value, 40).toUpperCase()
  if (!text) return []
  const tokens = new Set([text])
  const parenthetical = text.match(/\(([^)]+)\)/)?.[1]?.trim()
  if (parenthetical) tokens.add(parenthetical)
  const sourceCode = text.match(/^([^\s(]+)(?:\s|\()/)?.[1]?.trim()
  if (sourceCode) tokens.add(sourceCode)
  return [...tokens]
}

/**
 * Convert the source configurator's size objects into the one shape shared by
 * the roster UI, variant resolver and order payload. Owayo uses internal
 * garment codes (for example `5`) with a customer-facing label (`M`). Keeping
 * the code as the value prevents the familiar bug where the UI showed M while
 * the handoff silently selected a different variant.
 */
export function normalizeOwayoSizeOptions(sizes = []) {
  const seen = new Set()
  return (Array.isArray(sizes) ? sizes : []).flatMap(item => {
    const value = typeof item === 'string'
      ? clean(item, 40)
      : clean(item?.value || item?.code || item?.size || item?.name, 40)
    const label = typeof item === 'string'
      ? clean(item, 80)
      : clean(item?.label || item?.name || item?.size || item?.code || item?.value, 80)
    if (!value || !label || /choose your size|choose a size|^choose$/i.test(label) || seen.has(value)) return []
    seen.add(value)
    return [{ value, label }]
  })
}

/** Resolve a saved display size to the exact source/configurator code. */
export function resolveOwayoSizeValue(requested, sizes = []) {
  const options = normalizeOwayoSizeOptions(sizes)
  if (!options.length) return clean(requested, 40)
  const requestedTokens = new Set(sizeTokens(requested))
  const exact = options.find(option => option.value === clean(requested, 40))
  if (exact) return exact.value
  const match = options.find(option => sizeTokens(option.value).some(token => requestedTokens.has(token))
    || sizeTokens(option.label).some(token => requestedTokens.has(token)))
  return match?.value || options[0].value
}

/** Normalize every roster row before it is rendered or sent to checkout. */
export function normalizeOwayoRoster(roster = [], sizes = []) {
  const options = normalizeOwayoSizeOptions(sizes)
  const fallback = options.find(option => /\(M\)|\bM\b/i.test(option.label))?.value || options[0]?.value || 'M'
  const rows = Array.isArray(roster) && roster.length ? roster : [{ id:'player-1', name:'', number:'', size:fallback }]
  return rows.slice(0, 99).map((player, index) => ({
    id:clean(player?.id, 80) || `player-${index + 1}`,
    name:clean(player?.name, 24),
    number:clean(player?.number, 3).replace(/\D/g, '').slice(0, 3),
    size:resolveOwayoSizeValue(player?.size || fallback, options)
  }))
}

export function normalizeOwayoColor(value, fallback = '#F8F8F4') {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback
}

export function normalizeOwayoPlayer(player = {}) {
  return {
    name: clean(player?.name, 24),
    number: clean(player?.number, 3).replace(/\D/g, '').slice(0, 3),
    size: clean(player?.size, 32)
  }
}

export function resolveOwayoPreviewText(text = {}, roster = []) {
  const first = Array.isArray(roster) && roster.length ? normalizeOwayoPlayer(roster[0]) : null
  return {
    team: clean(text?.team, 24),
    // A blank roster value intentionally falls back to the shared Text panel.
    name: first?.name || clean(text?.name, 24),
    number: first?.number || clean(text?.number, 3).replace(/\D/g, '').slice(0, 3)
  }
}

export function normalizeOwayoPersonalization(input = {}, roster = []) {
  const preview = resolveOwayoPreviewText(input, roster)
  const fontCandidate = clean(input?.font, 32)
  return {
    ...preview,
    font: FONT_ALLOWLIST.has(fontCandidate) ? fontCandidate : 'Barlow Condensed',
    color: normalizeOwayoColor(input?.color),
    outlineColor: normalizeOwayoColor(input?.outlineColor, '#111311'),
    outlineWidth: clamp(input?.outlineWidth, 0, 24, 8),
    // Position and size are part of the production contract.  The editor
    // exposes them as normalized values so a pointer drag remains portable
    // between garment cuts and the server can validate the same bounds.
    x: clamp(input?.x, -1, 1, 0),
    y: clamp(input?.y, -1, 1, 0),
    scale: clamp(input?.scale, .55, 1.8, 1),
    rotation: clamp(input?.rotation, -30, 30, 0),
    placement: normalizeOwayoPlacement(input?.placement, 'back-center'),
    sameOnAll: Boolean(input?.sameOnAll),
    layer: clamp(input?.layer, 0, 20, 0)
  }
}

export function normalizeOwayoLogo(input = {}) {
  const placement = normalizeOwayoPlacement(input?.placement)
  return {
    name: clean(input?.name, 160),
    x: clamp(input?.x, -1, 1, 0),
    y: clamp(input?.y, -1, 1, 0),
    scale: clamp(input?.scale, .25, 2, 1),
    rotation: clamp(input?.rotation, -180, 180, 0),
    placement
  }
}

/**
 * Normalize one independently movable personalization layer. Image bytes stay
 * browser-side; the order contract carries only the bounded placement plus an
 * index into separately verified private logo assets.
 */
export function normalizeOwayoLayer(input = {}, index = 0) {
  const kindCandidate = clean(input?.kind, 16).toLowerCase()
  const kind = LAYER_KINDS.has(kindCandidate) ? kindCandidate : 'name'
  const isImage = kind === 'logo' || kind === 'artwork'
  const isLogo = kind === 'logo'
  const assetId = isImage ? clean(input?.assetId, 160) : ''
  return {
    id:clean(input?.id, 80) || `${kind}-${index + 1}`,
    kind,
    placement:normalizeOwayoPlacement(input?.placement, isLogo ? 'front-left-chest' : kind === 'artwork' ? 'front-center' : 'back-center'),
    x:clamp(input?.x, -1, 1, 0),
    y:clamp(input?.y, -1, 1, 0),
    scale:clamp(input?.scale, isImage ? .25 : .55, isImage ? 2 : 1.8, 1),
    rotation:clamp(input?.rotation, isImage ? -180 : -30, isImage ? 180 : 30, 0),
    name:isImage ? clean(input?.name, 160) : '',
    // Logo-only legacy payloads remain indexed 0–7; the combined designer
    // workflow may carry up to eight logos plus eight artwork layers.
    assetIndex:isImage ? Math.round(clamp(input?.assetIndex, 0, isLogo ? 7 : 15, 0)) : null,
    ...(assetId ? { assetId } : {})
  }
}

export function normalizeOwayoLayers(layers = []) {
  const seen = new Set()
  return (Array.isArray(layers) ? layers : []).slice(0, 24).flatMap((layer, index) => {
    const normalized = normalizeOwayoLayer(layer, index)
    let layerId = normalized.id
    if (seen.has(layerId)) layerId = `${normalized.kind}-${index + 1}`
    while (seen.has(layerId)) layerId = `${layerId}-${seen.size + 1}`
    seen.add(layerId)
    return [{ ...normalized, id:layerId }]
  })
}

/**
 * Normalized canvas coordinates (top-left origin). The renderer binds the
 * resulting map to the selected garment panel's UV island and leaves the
 * collar, pocket and hem clear where those regions exist.
 */
export function owayoBackTextLayout(placement = 'back-center') {
  const preset = owayoPlacementPreset(placement)
  if (preset.surface === 'left-sleeve' || preset.surface === 'right-sleeve') {
    return {
      team: { x: .5, y: .28, width: .72, size: .048, weight: 700 },
      name: { x: .5, y: .46, width: .76, size: .06, weight: 800 },
      number: { x: .5, y: .67, width: .58, size: .16, weight: 800 }
    }
  }
  if (preset.id === 'front-left-chest' || preset.id === 'front-right-chest') {
    return {
      team: { x: .5, y: .19, width: .64, size: .04, weight: 700 },
      name: { x: .5, y: .31, width: .7, size: .052, weight: 800 },
      number: { x: .5, y: .47, width: .54, size: .135, weight: 800 }
    }
  }
  const nameY = preset.id === 'back-upper' ? .28
    : preset.id === 'front-lower' || preset.id === 'back-lower' ? .61
      : .43
  return {
    team: { x: .5, y:nameY - .14, width: .58, size: .055, weight: 700 },
    name: { x: .5, y:nameY, width: .62, size: .072, weight: 800 },
    number: { x: .5, y:nameY + .15, width: .52, size: .19, weight: 800 }
  }
}

export function serializeOwayoPersonalization(text = {}, roster = []) {
  return normalizeOwayoPersonalization(text, roster)
}

export const OWAYO_PERSONALIZATION_FONTS = [...FONT_ALLOWLIST]
