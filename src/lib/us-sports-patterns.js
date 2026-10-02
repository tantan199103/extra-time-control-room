// Logo-free, procedural SVG recipes for the US team-inspired color families.
// The output is intentionally self-contained: no external assets, references,
// links, scripts, or supplier artwork are emitted.

const SVG_SIZE = 128
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const SAFE_COLORS = Object.freeze(['#111311', '#F8F8F4', '#2876FF', '#F3ED45'])

const RECIPE_IDS = Object.freeze([
  'classic-pinstripe',
  'triple-rail',
  'vertical-contrast',
  'split-field',
  'monochrome-stripe',
  'hockey-horizontal'
])

function colorList(colors) {
  if (Array.isArray(colors)) return colors
  if (typeof colors === 'string') return [colors]
  if (colors && typeof colors === 'object') {
    return Object.entries(colors)
      .sort(([left], [right]) => {
        const leftIndex = Number(left)
        const rightIndex = Number(right)
        if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) return leftIndex - rightIndex
        return 0
      })
      .map(([, value]) => value)
  }
  return []
}

function normalizeColors(colors) {
  const source = colorList(colors)
  return SAFE_COLORS.map((fallback, index) => {
    const value = source[index]
    return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback
  })
}

function meshOverlay() {
  const dots = []
  for (let y = 4; y < SVG_SIZE; y += 8) {
    for (let x = 4; x < SVG_SIZE; x += 8) dots.push(`<circle cx="${x}" cy="${y}" r=".65"/>`)
  }
  return `<g fill="#FFFFFF" opacity="0.08">${dots.join('')}</g>`
}

function root(content, recipeId) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${recipeId} pattern">${content}${meshOverlay()}</svg>`
}

function classicPinstripe(colors) {
  const [base, stripe] = colors
  const lines = []
  for (let x = 13; x < SVG_SIZE; x += 21) lines.push(`<path d="M${x} 0V128" stroke="${stripe}" stroke-width="2"/>`)
  return root(`<rect width="128" height="128" fill="${base}"/><g opacity=".9">${lines.join('')}</g>`, 'classic-pinstripe')
}

function tripleRail(colors) {
  const [base, rail, center] = colors
  return root(`<rect width="128" height="128" fill="${base}"/><rect x="55" width="5" height="128" fill="${rail}"/><rect x="60" width="8" height="128" fill="${center}"/><rect x="68" width="5" height="128" fill="${rail}"/>`, 'triple-rail')
}

function verticalContrast(colors) {
  const [base, block, keyline] = colors
  return root(`<rect width="128" height="128" fill="${base}"/><rect x="60" width="28" height="128" fill="${block}"/><rect x="88" width="4" height="128" fill="${keyline}"/>`, 'vertical-contrast')
}

function splitField(colors) {
  const [base, field, seam] = colors
  return root(`<rect width="128" height="128" fill="${base}"/><rect x="55" width="24" height="128" fill="${field}"/><rect x="79" width="6" height="128" fill="${seam}"/>`, 'split-field')
}

function monochromeStripe(colors) {
  const [base, stripe, steel] = colors
  const blocks = []
  for (let x = 0; x < SVG_SIZE; x += 18) {
    blocks.push(`<rect x="${x}" width="12" height="128" fill="${base}"/>`)
    blocks.push(`<rect x="${x + 12}" width="4" height="128" fill="${stripe}"/>`)
    blocks.push(`<rect x="${x + 16}" width="2" height="128" fill="${steel}"/>`)
  }
  return root(blocks.join(''), 'monochrome-stripe')
}

function hockeyHorizontal(colors) {
  const [base, rail, band] = colors
  return root(`<rect width="128" height="128" fill="${base}"/><rect y="42" width="128" height="10" fill="${rail}"/><rect y="52" width="128" height="9" fill="${band}"/>`, 'hockey-horizontal')
}

/**
 * Create a self-contained 128x128 SVG for a supported teamwear recipe.
 * Invalid colors are replaced with conservative defaults; unknown recipes
 * return an empty string so callers can fail closed before rendering.
 */
export function createUsSportsPatternSvg(recipeId, colors) {
  const id = String(recipeId || '').toLowerCase()
  if (!RECIPE_IDS.includes(id)) return ''
  const normalized = normalizeColors(colors)
  switch (id) {
    case 'classic-pinstripe': return classicPinstripe(normalized)
    case 'triple-rail': return tripleRail(normalized)
    case 'vertical-contrast': return verticalContrast(normalized)
    case 'split-field': return splitField(normalized)
    case 'monochrome-stripe': return monochromeStripe(normalized)
    case 'hockey-horizontal': return hockeyHorizontal(normalized)
    default: return ''
  }
}
