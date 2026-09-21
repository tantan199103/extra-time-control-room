/**
 * Store-wide quantity incentive.
 *
 * The wording used by the store is "add one more piece, save 10%, capped at
 * 30%". That means the first piece keeps its normal price, then each extra
 * piece moves the cart into the next tier: 2 = 10%, 3 = 20%, 4+ = 30%.
 * Keeping the tiers in one small pure module lets the PDP, cart preview and
 * the server quote use the same policy without trusting a browser-supplied
 * price.
 */

export const MAX_QUANTITY_DISCOUNT = 30

export const DEFAULT_QUANTITY_DISCOUNT_POLICY = Object.freeze([
  Object.freeze({ minQty: 2, discountPercent: 10 }),
  Object.freeze({ minQty: 3, discountPercent: 20 }),
  Object.freeze({ minQty: 4, discountPercent: 30 })
])

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0

export function normalizeQuantityDiscountPolicy(input = DEFAULT_QUANTITY_DISCOUNT_POLICY) {
  const source = Array.isArray(input) ? input : DEFAULT_QUANTITY_DISCOUNT_POLICY
  const byQty = new Map()
  source.forEach(item => {
    const minQty = Math.max(2, Math.trunc(number(item?.minQty ?? item?.quantity)))
    const discountPercent = Math.max(0, Math.min(MAX_QUANTITY_DISCOUNT, Math.round(number(item?.discountPercent ?? item?.discount))))
    if (!Number.isFinite(minQty) || minQty < 2 || discountPercent <= 0) return
    const current = byQty.get(minQty)
    if (!current || discountPercent > current.discountPercent) byQty.set(minQty, { minQty, discountPercent })
  })
  const normalized = [...byQty.values()].sort((a, b) => a.minQty - b.minQty)
  return normalized.length ? normalized : [...DEFAULT_QUANTITY_DISCOUNT_POLICY]
}

export function quantityDiscountForQty(quantity, policy = DEFAULT_QUANTITY_DISCOUNT_POLICY) {
  const qty = Math.max(0, Math.trunc(number(quantity)))
  const tiers = normalizeQuantityDiscountPolicy(policy)
  return tiers.reduce((active, tier) => tier.minQty <= qty ? tier : active, { minQty: 1, discountPercent: 0 })
}

export function quantityDiscountLabel(tier) {
  const minQty = Math.max(1, Math.trunc(number(tier?.minQty || 1)))
  return minQty <= 1 ? '1 piece' : `${minQty}+ pieces`
}

