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

const clamp = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max)

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
    scale: clamp(input?.scale, .7, 1.3, 1),
    rotation: clamp(input?.rotation, -30, 30, 0),
    placement: PLACEMENTS.has(placementCandidate) ? placementCandidate : 'back',
    sameOnAll: Boolean(input?.sameOnAll),
    layer: clamp(input?.layer, 0, 20, 0)
  }
}

/**
 * Normalized canvas coordinates (top-left origin). These align with the
 * garment's Back UV island and leave room for the collar, pocket and hem.
 */
export function owayoBackTextLayout() {
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
