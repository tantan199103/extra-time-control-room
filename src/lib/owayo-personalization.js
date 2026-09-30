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

const PLACEMENTS = new Set(['back', 'front', 'left-sleeve', 'right-sleeve'])

// Owayo stores a logo as an object attached to a garment part. Keep the
// public handoff deliberately small, but retain the part/placement so the
// renderer can put the uploaded mark on the same UV surface the shopper saw.
const LOGO_PLACEMENTS = new Set(['front', 'back', 'left-sleeve', 'right-sleeve'])

const PLACEMENT_PART_PRIORITIES = Object.freeze({
  back: [['back1'], ['back']],
  front: [['frontrightpart'], ['front']],
  'left-sleeve': [['leftarm'], ['aermelbandlinks'], ['leftcuff'], ['keillinks']],
  'right-sleeve': [['rightarm'], ['aermelbandrechts'], ['rightcuff'], ['keilrechts']]
})

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)

const compactPartName = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * Resolve one deterministic garment mesh for a print placement. Several
 * Owayo cuts expose a primary sleeve plus a secondary side/keil mesh; using
 * every matching name would duplicate a customer's text or logo. The first
 * available priority is therefore the only active UV island.
 */
export function owayoPlacementPartNames(partNames = [], placement = 'front') {
  const names = (Array.isArray(partNames) ? partNames : []).map(value => String(value || '')).filter(Boolean)
  const priorities = PLACEMENT_PART_PRIORITIES[placement] || PLACEMENT_PART_PRIORITIES.front
  for (const group of priorities) {
    const matches = names.filter(name => group.includes(compactPartName(name)))
    if (matches.length) return [matches[0]]
  }
  const prefix = placement === 'back' ? 'back' : placement === 'front' ? 'front' : placement === 'left-sleeve' ? 'left' : 'right'
  return names.filter(name => compactPartName(name).startsWith(prefix)).slice(0, 1)
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
  const placementCandidate = clean(input?.placement, 24).toLowerCase()
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
    placement: PLACEMENTS.has(placementCandidate) ? placementCandidate : 'back',
    sameOnAll: Boolean(input?.sameOnAll),
    layer: clamp(input?.layer, 0, 20, 0)
  }
}

export function normalizeOwayoLogo(input = {}) {
  const placementCandidate = clean(input?.placement, 24).toLowerCase()
  return {
    name: clean(input?.name, 160),
    x: clamp(input?.x, -1, 1, 0),
    y: clamp(input?.y, -1, 1, 0),
    scale: clamp(input?.scale, .25, 2, 1),
    rotation: clamp(input?.rotation, -180, 180, 0),
    placement: LOGO_PLACEMENTS.has(placementCandidate) ? placementCandidate : 'front'
  }
}

/**
 * Normalized canvas coordinates (top-left origin). The renderer binds the
 * resulting map to the selected garment panel's UV island and leaves the
 * collar, pocket and hem clear where those regions exist.
 */
export function owayoBackTextLayout(placement = 'back') {
  if (placement === 'left-sleeve' || placement === 'right-sleeve') {
    return {
      team: { x: .5, y: .28, width: .72, size: .048, weight: 700 },
      name: { x: .5, y: .46, width: .76, size: .06, weight: 800 },
      number: { x: .5, y: .67, width: .58, size: .16, weight: 800 }
    }
  }
  return {
    team: { x: .5, y: .255, width: .58, size: .055, weight: 700 },
    name: { x: .5, y: .405, width: .62, size: .072, weight: 800 },
    // Keep the number above the C3 pocket seam (the lower Back UV island).
    number: { x: .5, y: .535, width: .52, size: .205, weight: 800 }
  }
}

export function serializeOwayoPersonalization(text = {}, roster = []) {
  return normalizeOwayoPersonalization(text, roster)
}

export const OWAYO_PERSONALIZATION_FONTS = [...FONT_ALLOWLIST]
