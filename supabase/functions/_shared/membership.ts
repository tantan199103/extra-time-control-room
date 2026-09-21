const money = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export const DEFAULT_QUANTITY_DISCOUNT_POLICY = [
  { minQty: 2, discountPercent: 10 },
  { minQty: 3, discountPercent: 20 },
  { minQty: 4, discountPercent: 30 }
]

function normalizeQuantityDiscountPolicy(input: any = DEFAULT_QUANTITY_DISCOUNT_POLICY) {
  const source = Array.isArray(input) ? input : DEFAULT_QUANTITY_DISCOUNT_POLICY
  const byQty = new Map<number, { minQty: number, discountPercent: number }>()
  source.forEach(item => {
    const minQty = Math.max(2, Math.trunc(Number(item?.minQty ?? item?.quantity) || 0))
    const discountPercent = Math.max(0, Math.min(30, Math.round(Number(item?.discountPercent ?? item?.discount) || 0)))
    if (minQty < 2 || discountPercent <= 0) return
    const current = byQty.get(minQty)
    if (!current || discountPercent > current.discountPercent) byQty.set(minQty, { minQty, discountPercent })
  })
  return [...byQty.values()].sort((a, b) => a.minQty - b.minQty).length ? [...byQty.values()].sort((a, b) => a.minQty - b.minQty) : DEFAULT_QUANTITY_DISCOUNT_POLICY
}

function quantityDiscountForQty(quantity: number, policy: any[]) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0))
  return normalizeQuantityDiscountPolicy(policy).reduce((active, tier) => tier.minQty <= qty ? tier : active, { minQty: 1, discountPercent: 0 })
}

export function activeMembership(membership: any, now = new Date()) {
  return Boolean(membership && ['ACTIVE', 'TRIALING'].includes(membership.status) && (!membership.current_period_end || new Date(membership.current_period_end) > now))
}

function matchingRule(rules: any[], context: any, now = new Date()) {
  const specificity: Record<string, number> = { VARIANT: 5, PRODUCT: 4, TAG: 3, COLLECTION: 2, ALL: 1 }
  return (rules || []).filter(rule => {
    if (!rule?.active || Number(rule.discount_percent) <= 0) return false
    if (rule.starts_at && new Date(rule.starts_at) > now) return false
    if (rule.ends_at && new Date(rule.ends_at) <= now) return false
    const scope = String(rule.scope_type || '').toUpperCase()
    const target = String(rule.scope_value || '')
    return scope === 'VARIANT' ? target === context.variantId : scope === 'PRODUCT' ? target === context.productId : scope === 'TAG' ? (context.tags || []).includes(target) : scope === 'COLLECTION' ? (context.collections || []).includes(target) : scope === 'ALL'
  }).sort((a, b) => (specificity[b.scope_type] || 0) - (specificity[a.scope_type] || 0) || Number(b.priority || 0) - Number(a.priority || 0) || Number(b.discount_percent || 0) - Number(a.discount_percent || 0))[0] || null
}

function quoteLine(line: any, membership: any, program: any, rules: any[], quantityPercent = 0) {
  const qty = Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1))))
  const listUnit = money(line.compareAt && Number(line.compareAt) > Number(line.price) ? line.compareAt : line.price)
  const publicUnit = money(line.price)
  const safeQuantityPercent = Math.max(0, Math.min(30, Math.round(Number(quantityPercent || 0))))
  const quantityUnit = money(publicUnit * (1 - safeQuantityPercent / 100))
  const quantityDiscount = money((publicUnit - quantityUnit) * qty)
  const base = { lineKey: line.lineKey, productId: line.productId, variantId: line.variantId, sku: line.sku, qty, listUnit, publicUnit, finalUnit: publicUnit, lineTotal: money(publicUnit * qty), discount: 0, discountPercent: 0, quantityDiscount, quantityDiscountPercent: safeQuantityPercent, rule: null, marginLimited: false }
  const memberActive = activeMembership(membership) && Boolean(program)
  const rule = memberActive ? matchingRule(rules, { productId: line.productId, variantId: line.variantId, tags: line.tags || [], collections: line.collections || [] }) : null
  const requestedPercent = memberActive ? Math.min(Number(program.max_discount_percent || 40), Number(rule?.discount_percent ?? program.default_discount_percent ?? 0), 40) : 0
  const memberUnit = requestedPercent > 0 ? money((rule?.stack_with_sale ? publicUnit : listUnit) * (1 - requestedPercent / 100)) : publicUnit
  const requestedUnit = Math.min(publicUnit, quantityUnit, memberUnit)
  const cost = line.cost == null ? null : Number(line.cost)
  // Quantity promotions must respect the same production margin guard as
  // member pricing. Final prices are server-owned even when the shopper is
  // not signed in.
  const marginFloor = cost == null || !program ? 0 : money(cost / Math.max(0.01, 1 - Number(program.min_margin_percent || 0) / 100))
  const finalUnit = Math.min(publicUnit, money(Math.max(requestedUnit, marginFloor)))
  const discount = money((publicUnit - finalUnit) * qty)
  return { ...base, finalUnit, lineTotal: money(finalUnit * qty), discount, discountPercent: publicUnit ? money((1 - finalUnit / publicUnit) * 100) : 0, rule: memberActive ? (rule ? { id: rule.id, name: rule.name, scopeType: rule.scope_type, requestedPercent } : { id: null, name: 'Club default', scopeType: 'ALL', requestedPercent }) : null, marginLimited: marginFloor > requestedUnit }
}

export function quoteCart({ lines = [], membership, program, rules = [], shipping = {} }: any) {
  const quantityPolicy = normalizeQuantityDiscountPolicy(program?.quantity_discount_policy || DEFAULT_QUANTITY_DISCOUNT_POLICY)
  const totalQty = lines.reduce((sum, line) => sum + Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1)))), 0)
  const quantityTier = quantityDiscountForQty(totalQty, quantityPolicy)
  const quotedLines = lines.map(line => quoteLine(line, membership, program, rules, quantityTier.discountPercent))
  const publicSubtotal = money(quotedLines.reduce((sum, line) => sum + line.publicUnit * line.qty, 0))
  const subtotal = money(quotedLines.reduce((sum, line) => sum + line.lineTotal, 0))
  const discount = money(publicSubtotal - subtotal)
  const quantityDiscount = money(quotedLines.reduce((sum, line) => sum + line.quantityDiscount, 0))
  const isMember = activeMembership(membership)
  const shippingPolicy = program?.shipping_policy || {}
  const country = String(shipping.country || '').toUpperCase()
  const zones = Array.isArray(shippingPolicy.eligible_zones) ? shippingPolicy.eligible_zones : []
  const zoneEligible = zones.includes('ALL') || (country && zones.includes(country))
  const minimumMet = subtotal >= Number(shippingPolicy.minimum_subtotal || 0)
  const excluded = new Set(shippingPolicy.excluded_product_tags || [])
  const productEligible = !lines.some(line => (line.tags || []).some((tag: string) => excluded.has(tag)))
  const shippingEligible = Boolean(isMember && shippingPolicy.enabled && zoneEligible && minimumMet && productEligible)
  return { member: isMember, membershipStatus: membership?.status || 'NONE', currency: program?.currency || 'USD', lines: quotedLines, publicSubtotal, subtotal, discount, quantityDiscount, quantityPolicy, quantityTier, shipping: { eligible: shippingEligible, method: shippingPolicy.method || 'STANDARD', subsidyCap: shippingEligible ? Math.max(0, Number(shippingPolicy.subsidy_cap || 0)) : 0, reason: shippingEligible ? '90+ Club benefit' : !isMember ? 'Active membership required' : !zoneEligible ? 'Destination not eligible' : !minimumMet ? 'Minimum subtotal not met' : !productEligible ? 'An item is excluded' : 'Not enabled' } }
}
