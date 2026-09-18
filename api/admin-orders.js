import { enforceSameOrigin, handleApiError, readBody, requireAdmin, safeText, sendJson, serverSupabase } from './_security.js'

const fulfillmentStatuses = new Set(['UNFULFILLED', 'IN_PROGRESS', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
const orderStatuses = new Set(['PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PAYMENT_FAILED', 'EXPIRED'])
const paymentStatuses = new Set(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED'])

function safeTrackingUrl(value) {
  const url = safeText(value, 500)
  return /^https:\/\//i.test(url) ? url : ''
}

function presentOrder(order) {
  if (!order) return order
  return { ...order, tracking_url: safeTrackingUrl(order.tracking_url) }
}

const listFields = 'id,order_number,customer_email,customer_name,status,payment_status,fulfillment_status,currency,grand_total,payment_provider,created_at,paid_at,tracking_carrier,tracking_number,tracking_url'
const detailFields = `${listFields},subtotal,public_subtotal,discount_total,shipping_total,tax_total,shipping_address,member_pricing,provider_order_id,provider_payment_id,shipped_at,delivered_at,cancelled_at,updated_at`

export default async function handler(request, response) {
  try {
    enforceSameOrigin(request)
    const client = serverSupabase()
    const admin = await requireAdmin(request, client)
    if (request.method === 'GET') {
      const status = safeText(request.query?.status, 40)
      const id = safeText(request.query?.id, 80)
      if (id) {
        const { data: order, error: orderError } = await client.from('pod_orders').select(detailFields).eq('id', id).maybeSingle()
        if (orderError) throw orderError
        if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 })
        const [{ data: lines, error: lineError }, { data: events, error: eventError }] = await Promise.all([
          client.from('pod_order_lines').select('id,product_id,variant_id,sku,product_title,product_handle,product_image,option_values,customization,unit_price,public_unit_price,discount_total,quantity,line_total,created_at').eq('order_id', id).order('created_at'),
          client.from('pod_order_events').select('id,event_type,status,message,metadata,visible_to_customer,actor_id,created_at').eq('order_id', id).order('created_at', { ascending: false })
        ])
        if (lineError || eventError) throw lineError || eventError
        return sendJson(response, 200, { order: { ...presentOrder(order), lines: lines || [], events: events || [] } })
      }
      let query = client.from('pod_orders').select(listFields).order('created_at', { ascending: false }).limit(250)
      if (status) {
        if (paymentStatuses.has(status)) query = query.eq('payment_status', status)
        else if (fulfillmentStatuses.has(status)) query = query.eq('fulfillment_status', status)
        else if (orderStatuses.has(status)) query = query.eq('status', status)
        else throw Object.assign(new Error('Choose a valid order filter.'), { status: 422 })
      }
      const { data, error } = await query
      if (error) throw error
      return sendJson(response, 200, { orders: (data || []).map(presentOrder) })
    }
    if (request.method !== 'PATCH') return sendJson(response, 405, { error: 'GET or PATCH order management only.' })
    const body = readBody(request, 16000)
    const id = safeText(body.id, 80)
    const next = String(body.fulfillmentStatus || '').toUpperCase()
    if (!id || !fulfillmentStatuses.has(next)) throw Object.assign(new Error('Choose a valid fulfillment status.'), { status: 422 })
    const trackingCarrier = safeText(body.trackingCarrier, 80)
    const trackingNumber = safeText(body.trackingNumber, 160)
    const trackingUrl = safeText(body.trackingUrl, 500)
    if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) throw Object.assign(new Error('Tracking links must use HTTPS.'), { status: 422 })
    const { data: updated, error: updateError } = await client.rpc('pod_admin_update_order_fulfillment', {
      p_order_id: id,
      p_fulfillment_status: next,
      p_tracking_carrier: trackingCarrier || null,
      p_tracking_number: trackingNumber || null,
      p_tracking_url: trackingUrl || null,
      p_actor_id: admin.id
    })
    if (updateError) {
      if (updateError.code === 'PGRST202') throw Object.assign(new Error('Order workflow migration is not installed. Apply 20260919_checkout_orders.sql before updating fulfillment.'), { status: 503 })
      throw updateError
    }
    return sendJson(response, 200, { order: presentOrder(updated) })
  } catch (error) {
    return handleApiError(response, error, 'Order management request failed.')
  }
}
