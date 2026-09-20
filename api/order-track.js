import { hashToken } from './_checkout.js'
import { consumeQuota, enforceSameOrigin, handleApiError, readBody, requestIdentity, safeText, sendJson, serverSupabase } from './_security.js'

function publicCustomization(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const sourceFields = value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields) ? value.fields : {}
  const fields = Object.fromEntries(Object.entries(sourceFields).slice(0, 30).map(([key, raw]) => {
    const value = safeText(raw, 500)
    return [safeText(key, 80), /^https?:\/\//i.test(value) ? 'Private asset attached' : value]
  }).filter(([key, raw]) => key && raw))
  const note = safeText(value.note, 500)
  const hasAiPreview = Boolean(value.hasAiPreview)
  return Object.keys(fields).length || note || hasAiPreview ? { fields, note, hasAiPreview } : null
}

function present(order, lines, events) {
  return {
    publicId: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount_total),
    shipping: Number(order.shipping_total),
    tax: Number(order.tax_total),
    total: Number(order.grand_total),
    memberPricing: Boolean(order.member_pricing),
    customerName: order.customer_name,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    updatedAt: order.updated_at,
    tracking: order.tracking_number ? { carrier: order.tracking_carrier || '', number: order.tracking_number, url: /^https:\/\//i.test(order.tracking_url || '') ? order.tracking_url : '' } : null,
    shippingAddress: { city: order.shipping_address?.city || '', country: order.shipping_address?.country || '' },
    lines: (lines || []).map(line => ({ id: line.id, title: line.product_title, handle: line.product_handle, image: line.product_image, sku: line.sku, options: line.option_values, customization: publicCustomization(line.customization), quantity: line.quantity, unitPrice: Number(line.unit_price), lineTotal: Number(line.line_total) })),
    events: (events || []).filter(event => event.visible_to_customer).map(event => ({ type: event.event_type, status: event.status, message: event.message, createdAt: event.created_at }))
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST order tracking requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 12000)
    const client = serverSupabase()
    await consumeQuota(client, 'order-track', requestIdentity(request, 'order-track'))
    const publicId = safeText(body.publicId || body.orderNumber, 80)
    const token = safeText(body.token || body.trackingToken, 180)
    if (!publicId || !token) throw Object.assign(new Error('Enter the order number and secure tracking token.'), { status: 422 })
    const { data: order, error: orderError } = await client.from('pod_orders').select('id,order_number,tracking_token_hash,status,payment_status,fulfillment_status,currency,subtotal,discount_total,shipping_total,tax_total,grand_total,member_pricing,customer_name,shipping_address,created_at,updated_at,paid_at,tracking_carrier,tracking_number,tracking_url').eq('order_number', publicId).eq('tracking_token_hash', hashToken(token)).maybeSingle()
    if (orderError) throw orderError
    if (!order) throw Object.assign(new Error('Order not found. Check the order number and tracking token.'), { status: 404 })
    const [{ data: lines, error: lineError }, { data: events, error: eventError }] = await Promise.all([
      client.from('pod_order_lines').select('id,product_title,product_handle,product_image,sku,option_values,customization,quantity,unit_price,line_total').eq('order_id', order.id).order('created_at'),
      client.from('pod_order_events').select('event_type,status,message,visible_to_customer,created_at').eq('order_id', order.id).order('created_at')
    ])
    if (lineError || eventError) throw lineError || eventError
    return sendJson(response, 200, { order: present(order, lines, events) })
  } catch (error) {
    return handleApiError(response, error, 'Order tracking is unavailable.')
  }
}
