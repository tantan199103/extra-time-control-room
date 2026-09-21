const DAY = 24 * 60 * 60 * 1000

export function businessDayRange(value, fallback = [3, 5]) {
  const values = String(value || '').match(/\d+/g)?.map(Number).filter(Number.isFinite) || []
  if (!values.length) return fallback
  return values.length === 1 ? [values[0], values[0]] : [Math.min(values[0], values[1]), Math.max(values[0], values[1])]
}

export function addBusinessDays(value, count) {
  const date = new Date(value)
  date.setHours(12, 0, 0, 0)
  let remaining = Math.max(0, Math.round(Number(count) || 0))
  while (remaining > 0) {
    date.setTime(date.getTime() + DAY)
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1
  }
  return date
}

const shortDate = date => new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric' }).format(date)

export function dateRangeLabel(start, end) {
  if (start.toDateString() === end.toDateString()) return shortDate(start)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${new Intl.DateTimeFormat('en-US', { month:'short' }).format(start)} ${start.getDate()}–${end.getDate()}`
  }
  return `${shortDate(start)}–${shortDate(end)}`
}

export function buildDeliveryEstimate(delivery = {}, now = new Date()) {
  const orderDate = new Date(now)
  orderDate.setHours(12, 0, 0, 0)
  const [productionMin, productionMax] = businessDayRange(delivery.production, [3, 5])
  const [transitMin, transitMax] = businessDayRange(delivery.transit, [5, 8])
  const productionStart = addBusinessDays(orderDate, productionMin)
  const productionEnd = addBusinessDays(orderDate, productionMax)
  const deliveryStart = addBusinessDays(orderDate, productionMin + transitMin)
  const deliveryEnd = addBusinessDays(orderDate, productionMax + transitMax)
  return {
    ordered:`Today · ${shortDate(orderDate)}`,
    orderCutoff:'Order by 11:59 PM CT',
    production:dateRangeLabel(productionStart, productionEnd),
    delivered:dateRangeLabel(deliveryStart, deliveryEnd),
    productionDays:`${productionMin}${productionMin === productionMax ? '' : `–${productionMax}`} business days`,
    transitDays:`${transitMin}${transitMin === transitMax ? '' : `–${transitMax}`} business days`
  }
}
