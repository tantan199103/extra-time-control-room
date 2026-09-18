const money = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

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

function quoteLine(line: any, membership: any, program: any, rules: any[]) {
  const qty = Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1))))
  const listUnit = money(line.compareAt && Number(line.compareAt) > Number(line.price) ? line.compareAt : line.price)
  const publicUnit = money(line.price)
  const base = { lineKey: line.lineKey, productId: line.productId, variantId: line.variantId, sku: line.sku, qty, listUnit, publicUnit, finalUnit: publicUnit, lineTotal: money(publicUnit * qty), discount: 0, discountPercent: 0, rule: null, marginLimited: false }
  if (!activeMembership(membership) || !program) return base
  const rule = matchingRule(rules, { productId: line.productId, variantId: line.variantId, tags: line.tags || [], collections: line.collections || [] })
  const requestedPercent = Math.min(Number(program.max_discount_percent || 40), Number(rule?.discount_percent ?? program.default_discount_percent ?? 0), 40)
  if (requestedPercent <= 0) return base
  const requestedUnit = money((rule?.stack_with_sale ? publicUnit : listUnit) * (1 - requestedPercent / 100))
  const cost = line.cost == null ? null : Number(line.cost)
  const marginFloor = cost == null ? 0 : money(cost / Math.max(0.01, 1 - Number(program.min_margin_percent || 0) / 100))
  const memberUnit = money(Math.max(requestedUnit, marginFloor))
  const finalUnit = Math.min(publicUnit, memberUnit)
  const discount = money((publicUnit - finalUnit) * qty)
  return { ...base, finalUnit, lineTotal: money(finalUnit * qty), discount, discountPercent: publicUnit ? money((1 - finalUnit / publicUnit) * 100) : 0, rule: rule ? { id: rule.id, name: rule.name, scopeType: rule.scope_type, requestedPercent } : { id: null, name: 'Club default', scopeType: 'ALL', requestedPercent }, marginLimited: memberUnit > requestedUnit }
}

export function quoteCart({ lines = [], membership, program, rules = [], shipping = {} }: any) {
  const quotedLines = lines.map(line => quoteLine(line, membership, program, rules))
  const publicSubtotal = money(quotedLines.reduce((sum, line) => sum + line.publicUnit * line.qty, 0))
  const subtotal = money(quotedLines.reduce((sum, line) => sum + line.lineTotal, 0))
  const discount = money(publicSubtotal - subtotal)
  const isMember = activeMembership(membership)
  const policy = program?.shipping_policy || {}
  const country = String(shipping.country || '').toUpperCase()
  const zones = Array.isArray(policy.eligible_zones) ? policy.eligible_zones : []
  const zoneEligible = zones.includes('ALL') || (country && zones.includes(country))
  const minimumMet = subtotal >= Number(policy.minimum_subtotal || 0)
  const excluded = new Set(policy.excluded_product_tags || [])
  const productEligible = !lines.some(line => (line.tags || []).some((tag: string) => excluded.has(tag)))
  const shippingEligible = Boolean(isMember && policy.enabled && zoneEligible && minimumMet && productEligible)
  return { member: isMember, membershipStatus: membership?.status || 'NONE', currency: program?.currency || 'USD', lines: quotedLines, publicSubtotal, subtotal, discount, shipping: { eligible: shippingEligible, method: policy.method || 'STANDARD', subsidyCap: shippingEligible ? Math.max(0, Number(policy.subsidy_cap || 0)) : 0, reason: shippingEligible ? '90+ Club benefit' : !isMember ? 'Active membership required' : !zoneEligible ? 'Destination not eligible' : !minimumMet ? 'Minimum subtotal not met' : !productEligible ? 'An item is excluded' : 'Not enabled' } }
}
