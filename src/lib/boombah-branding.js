const BRAND_PART_PATTERN = /(?:^|[\s_.-])(?:logo|wordmark|trademark|woven[\s_.-]*label|brand[\s_.-]*mark|jock[\s_.-]*tag|vendor[\s_.-]*tag|(?:vendor|manufacturer)[\s_.-]*label)(?:$|[\s_.-])/i
const VENDOR_ASSET_PATTERN = /boombah|vendor[\s_.-]*(?:logo|mark)|manufacturer[\s_.-]*(?:logo|mark)/i

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function appendHiddenStyle(openingTag) {
  if (/\bstyle\s*=\s*(["'])[^"']*\bdisplay\s*:\s*none/i.test(openingTag)) return openingTag
  if (/\bstyle\s*=/.test(openingTag)) {
    return openingTag.replace(/\bstyle\s*=\s*(["'])(.*?)\1/i, (_all, quote, style) => `style=${quote}${style};display:none${quote}`)
  }
  return openingTag.replace(/\s*\/?\s*>$/, ending => ` style="display:none"${ending}`)
}

function hideGroup(svg, id) {
  const pattern = new RegExp(`<g\\s+([^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*)>`, 'i')
  return svg.replace(pattern, openingTag => appendHiddenStyle(openingTag))
}

function colorFromMarker(svg, code) {
  const marker = new RegExp(`<rect\\b(?=[^>]*\\bid=["']paramcolor-${escapeRegExp(code)}["'])[^>]*>`, 'i').exec(svg)?.[0] || ''
  return marker.match(/\bfill=["']([^"']+)["']/i)?.[1]
    || marker.match(/(?:^|;)\s*fill\s*:\s*([^;"']+)/i)?.[1]?.trim()
    || ''
}

function gradientIdsUsingColor(svg, color) {
  const ids = []
  const colorPattern = new RegExp(escapeRegExp(color), 'i')
  const gradientPattern = /<(?:linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/(?:linearGradient|radialGradient)>/gi
  for (const match of svg.matchAll(gradientPattern)) {
    if (!colorPattern.test(match[2])) continue
    const id = match[1].match(/\bid=["']([^"']+)["']/i)?.[1]
    if (id) ids.push(id)
  }
  return ids
}

function removeColor(svg, color) {
  if (!color) return svg
  const escapedColor = escapeRegExp(color)
  const gradients = gradientIdsUsingColor(svg, color)
  let output = svg.split(/(<[^>]+>)/g).map(part => {
    if (!part.startsWith('<') || /\bid=["']paramcolor-/i.test(part)) return part
    return part
      .replace(new RegExp(`\\bfill=(["'])${escapedColor}\\1`, 'gi'), 'fill="none"')
      .replace(new RegExp(`\\bstroke=(["'])${escapedColor}\\1`, 'gi'), 'stroke="none"')
      .replace(new RegExp(`\\bstop-color=(["'])${escapedColor}\\1`, 'gi'), 'stop-color="transparent"')
      .replace(new RegExp(`fill\\s*:\\s*${escapedColor}(?=[;"'])`, 'gi'), 'fill:none')
      .replace(new RegExp(`stroke\\s*:\\s*${escapedColor}(?=[;"'])`, 'gi'), 'stroke:none')
      .replace(new RegExp(`stop-color\\s*:\\s*${escapedColor}(?=[;"'])`, 'gi'), 'stop-color:transparent')
  }).join('')
  for (const id of gradients) {
    const reference = `url\\(\\s*#${escapeRegExp(id)}\\s*\\)`
    output = output.split(/(<[^>]+>)/g).map(part => {
      if (!part.startsWith('<')) return part
      return part
        .replace(new RegExp(`\\bfill=(["'])${reference}\\1`, 'gi'), 'fill="none"')
        .replace(new RegExp(`\\bstroke=(["'])${reference}\\1`, 'gi'), 'stroke="none"')
        .replace(new RegExp(`fill\\s*:\\s*${reference}(?=[;"'])`, 'gi'), 'fill:none')
        .replace(new RegExp(`stroke\\s*:\\s*${reference}(?=[;"'])`, 'gi'), 'stroke:none')
    }).join('')
  }
  return output
}

function hideNamedBrandElements(svg) {
  const namedTag = /<(g|path|rect|circle|ellipse|polygon|polyline|image|use|text|tspan|symbol)\b[^>]*>/gi
  let output = svg.replace(namedTag, openingTag => {
    const identity = [
      ...openingTag.matchAll(/\b(?:id|class|name|data-name|aria-label|inkscape:label|href|xlink:href)\s*=\s*(["'])(.*?)\1/gi)
    ].map(match => match[2]).join(' ')
    return isBoombahBrandingName(identity) ? appendHiddenStyle(openingTag) : openingTag
  })
  output = output.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi, (element, _attributes, contents) => {
    const readable = contents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    return VENDOR_ASSET_PATTERN.test(readable) ? element.replace(/^<text\b[^>]*>/i, openingTag => appendHiddenStyle(openingTag)) : element
  })
  return output
}

export function isBoombahBrandingName(value) {
  const name = String(value || '')
  return BRAND_PART_PATTERN.test(` ${name} `) || VENDOR_ASSET_PATTERN.test(name)
}

export function isBoombahLogoPartName(value) {
  return BRAND_PART_PATTERN.test(` ${String(value || '')} `)
}

export function stripBoombahBrandingText(value, colorZones = []) {
  const source = String(value || '')
  // The same helper is used for manifest labels in the public editor. Avoid
  // exposing the upstream vendor name there while leaving SVG identifiers and
  // linked resources untouched during the markup sanitization path below.
  if (!/<[a-z][\s\S]*>/i.test(source)) {
    return source
      .replace(/\bBoombah(?:\s+Ink)?\b/gi, 'Jersevo')
      .replace(/\s+/g, ' ')
      .trim()
  }
  let svg = source.replace(/encoding=["']iso-8859-1["']/i, 'encoding="utf-8"')
  // Production SVGs contain several non-artwork layers alongside the UV
  // atlas.  Leaving any of these visible makes the 3D garment render yellow
  // target boxes, cut lines or vendor notes instead of the photographed
  // product.  Keep only the `Art` paths and the paramcolor markers.
  for (const id of [
    'production_colors', 'guides', 'artwork_targets', 'Targets',
    'CUT_LINE', 'CUT_LINE_1_', 'Thru-cut', 'SEW_LINE', 'Info_B',
    'LWPOLYLINE_77_', 'LWPOLYLINE_80_'
  ]) svg = hideGroup(svg, id)
  svg = hideNamedBrandElements(svg)
  const removedCodes = colorZones
    .filter(zone => zone?.removed || zone?.editable === false && isBoombahBrandingName(zone?.name))
    .map(zone => String(zone.code || ''))
    .filter(Boolean)
  for (const code of removedCodes) svg = removeColor(svg, colorFromMarker(svg, code))
  return svg
}
