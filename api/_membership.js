const moneyNumber = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

export function activeMembership(membership, now = new Date()) {
  if (!membership || !['ACTIVE','TRIALING'].includes(membership.status)) return false
  if (membership.current_period_end && new Date(membership.current_period_end) <= now) return false
  return true
}

export function matchingRule(rules, context, now = new Date()) {
  const matches = (rules || []).filter(rule => {
    if (!rule?.active || Number(rule.discount_percent) <= 0) return false
    if (rule.starts_at && new Date(rule.starts_at) > now) return false
    if (rule.ends_at && new Date(rule.ends_at) <= now) return false
    const scope = String(rule.scope_type || '').toUpperCase()
    const target = String(rule.scope_value || '')
    if (scope === 'VARIANT') return target === context.variantId
    if (scope === 'PRODUCT') return target === context.productId
    if (scope === 'TAG') return (context.tags || []).includes(target)
    if (scope === 'COLLECTION') return (context.collections || []).includes(target)
    return scope === 'ALL'
  })
  const specificity = { VARIANT:5, PRODUCT:4, TAG:3, COLLECTION:2, ALL:1 }
  return matches.sort((a,b) => (specificity[b.scope_type] || 0) - (specificity[a.scope_type] || 0) || Number(b.priority || 0) - Number(a.priority || 0) || Number(b.discount_percent || 0) - Number(a.discount_percent || 0))[0] || null
}

export function quoteLine({ line, membership, program, rules = [], collections = [], now = new Date() }) {
  const qty = Math.max(1, Math.min(99, Math.trunc(Number(line.qty || 1))))
  const listUnit = moneyNumber(line.compareAt && Number(line.compareAt) > Number(line.price) ? line.compareAt : line.price)
  const publicUnit = moneyNumber(line.price)
  const base = { lineKey:line.lineKey, productId:line.productId, variantId:line.variantId, sku:line.sku, qty, listUnit, publicUnit, finalUnit:publicUnit, lineTotal:moneyNumber(publicUnit * qty), discount:0, discountPercent:0, rule:null, marginLimited:false }
  if (!activeMembership(membership,now) || !program) return base
  const rule = matchingRule(rules,{ productId:line.productId, variantId:line.variantId, tags:line.tags || [], collections },now)
  const requestedPercent = Math.min(Number(program.max_discount_percent || 40), Number(rule?.discount_percent ?? program.default_discount_percent ?? 0), 40)
  if (requestedPercent <= 0) return base
  const candidateBase = rule?.stack_with_sale ? publicUnit : listUnit
  const requestedUnit = moneyNumber(candidateBase * (1 - requestedPercent / 100))
  const cost = line.cost == null ? null : Number(line.cost)
  const marginFloor = cost == null ? 0 : moneyNumber(cost / Math.max(0.01, 1 - Number(program.min_margin_percent || 0) / 100))
  const memberUnit = moneyNumber(Math.max(requestedUnit,marginFloor))
  const finalUnit = Math.min(publicUnit,memberUnit)
  const discount = moneyNumber((publicUnit - finalUnit) * qty)
  const effectivePercent = publicUnit ? moneyNumber((1 - finalUnit / publicUnit) * 100) : 0
  return { ...base, finalUnit, lineTotal:moneyNumber(finalUnit * qty), discount, discountPercent:effectivePercent, rule:rule ? { id:rule.id,name:rule.name,scopeType:rule.scope_type,requestedPercent } : { id:null,name:'Club default',scopeType:'ALL',requestedPercent }, marginLimited:memberUnit > requestedUnit }
}

export function quoteCart({ lines = [], membership, program, rules = [], shipping = {}, now = new Date() }) {
  const quotedLines = lines.map(line => quoteLine({ line,membership,program,rules,collections:line.collections || [],now }))
  const publicSubtotal = moneyNumber(quotedLines.reduce((sum,line) => sum + line.publicUnit * line.qty,0))
  const subtotal = moneyNumber(quotedLines.reduce((sum,line) => sum + line.lineTotal,0))
  const discount = moneyNumber(publicSubtotal - subtotal)
  const isMember = activeMembership(membership,now)
  const shippingPolicy = program?.shipping_policy || {}
  const country = String(shipping.country || '').toUpperCase()
  const zones = Array.isArray(shippingPolicy.eligible_zones) ? shippingPolicy.eligible_zones : []
  const zoneEligible = zones.includes('ALL') || (country && zones.includes(country))
  const minimumMet = subtotal >= Number(shippingPolicy.minimum_subtotal || 0)
  const excludedTags = new Set(shippingPolicy.excluded_product_tags || [])
  const productEligible = !lines.some(line => (line.tags || []).some(tag => excludedTags.has(tag)))
  const shippingEligible = Boolean(isMember && shippingPolicy.enabled && zoneEligible && minimumMet && productEligible)
  return {
    member:isMember,
    membershipStatus:membership?.status || 'NONE',
    currency:program?.currency || 'USD',
    lines:quotedLines,
    publicSubtotal,
    subtotal,
    discount,
    shipping:{ eligible:shippingEligible, method:shippingPolicy.method || 'STANDARD', subsidyCap:shippingEligible ? Math.max(0,Number(shippingPolicy.subsidy_cap || 0)) : 0, reason:shippingEligible ? '90+ Club benefit' : !isMember ? 'Active membership required' : !zoneEligible ? 'Destination not eligible' : !minimumMet ? 'Minimum subtotal not met' : !productEligible ? 'An item is excluded' : 'Not enabled' }
  }
}
