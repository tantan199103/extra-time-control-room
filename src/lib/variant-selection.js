function sizeTokens(value) {
  const text = String(value || '').trim().toUpperCase()
  if (!text) return []
  const tokens = new Set([text])
  const parenthetical = text.match(/\(([^)]+)\)/)?.[1]?.trim()
  if (parenthetical) tokens.add(parenthetical)
  const sourceCode = text.match(/^([^\s(]+)(?:\s|\()/)?.[1]?.trim()
  if (sourceCode) tokens.add(sourceCode)
  return [...tokens]
}

/**
 * Resolve a sellable variation from either a storefront label ("2 (XS)") or
 * the source designer's garment code ("2").  Owayo exposes both, while most
 * catalogue products use a single plain size such as "M".
 */
export function findActiveVariant(product, requestedSize = '') {
  const variants = (product?.variants || []).filter(variant =>
    String(variant.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
    && Number(variant.inventory ?? 1000) > 0
  )
  const requested = new Set(sizeTokens(requestedSize))
  if (!requested.size) return variants[0]
  return variants.find(variant => Object.values(variant.values || {}).some(value =>
    sizeTokens(value).some(token => requested.has(token))
  )) || variants[0]
}
