import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, CircleAlert, ExternalLink, PackageCheck, RefreshCw, Search, Truck } from 'lucide-react'
import { fetchAdminOrder, fetchAdminOrders, updateAdminOrder } from './lib/supabase'
import './admin-orders.css'

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)) } catch { return `${currency} ${Number(value || 0).toFixed(2)}` }
}
const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase())
const activeFulfillment = new Set(['IN_PROGRESS', 'SHIPPED', 'DELIVERED'])

function fulfillmentChoices(order) {
  if (order.payment_status !== 'PAID') return order.status === 'PENDING_PAYMENT' && order.fulfillment_status !== 'CANCELLED' ? ['UNFULFILLED', 'CANCELLED'] : [order.fulfillment_status]
  if (order.fulfillment_status === 'DELIVERED') return ['DELIVERED']
  if (order.fulfillment_status === 'SHIPPED') return ['SHIPPED', 'DELIVERED']
  if (order.fulfillment_status === 'IN_PROGRESS') return ['IN_PROGRESS', 'SHIPPED']
  return ['UNFULFILLED', 'IN_PROGRESS', 'SHIPPED']
}

function Pill({ value }) {
  return <span className={`orders-pill orders-pill--${String(value).toLowerCase()}`}><i />{label(value)}</span>
}

function OrderDetail({ order, form, setForm, notice, saving, detailLoading, onClose, onSave }) {
  const canFulfill = order.payment_status === 'PAID'
  const hasLineItems = Array.isArray(order.lines) && order.lines.length > 0
  const choices = fulfillmentChoices(order)
  return <div className="orders-drawer">
    <button className="orders-drawer__backdrop" onClick={onClose} aria-label="Close order panel" />
    <aside>
      <header>
        <div><span>{order.order_number}</span><h2>{label(order.status)}</h2></div>
        <button onClick={onClose}>CLOSE</button>
      </header>
      <div className={`orders-payment-lock ${canFulfill ? '' : 'is-pending'}`}>
        {canFulfill ? <Check size={17} /> : <CircleAlert size={17} />}
        <div><strong>Payment: {label(order.payment_status)}</strong><span>{canFulfill ? 'Provider-confirmed. Fulfillment can move forward.' : 'This screen cannot change payment status. Only a verified provider capture or webhook can confirm payment.'}</span></div>
      </div>
      {detailLoading && <p className="orders-detail-loading" role="status">Loading line items and event history…</p>}
      <dl>
        <div><dt>Customer</dt><dd>{order.customer_name}<small>{order.customer_email}</small></dd></div>
        <div><dt>Total</dt><dd>{money(order.grand_total, order.currency)}</dd></div>
        <div><dt>Provider</dt><dd>{order.payment_provider}</dd></div>
        <div><dt>Paid at</dt><dd>{order.paid_at ? new Date(order.paid_at).toLocaleString() : 'Not confirmed'}</dd></div>
        <div><dt>Delivery</dt><dd>{order.shipping_address?.city || '—'}{order.shipping_address?.country ? `, ${order.shipping_address.country}` : ''}</dd></div>
      </dl>
      {hasLineItems && <section className="orders-detail-items"><p>LINE ITEMS</p>{order.lines.map(line => <article key={line.id}><img src={line.product_image} alt=""/><div><strong>{line.product_title}</strong><small>{line.sku} · ×{line.quantity}</small>{Object.keys(line.option_values || {}).length > 0 && <small>{Object.entries(line.option_values).map(([key, value]) => `${key}: ${value}`).join(' · ')}</small>}{line.customization && Object.keys(line.customization).length > 0 && <small>Personalized details attached</small>}</div><b>{money(line.line_total, order.currency)}</b></article>)}</section>}
      <section>
        <p>FULFILLMENT</p>
        <label><span>Stage</span><select value={form.fulfillmentStatus} onChange={event => setForm(current => ({ ...current, fulfillmentStatus: event.target.value }))}>{choices.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Carrier{['SHIPPED', 'DELIVERED'].includes(form.fulfillmentStatus) && ' · required'}</span><input value={form.trackingCarrier} required={['SHIPPED', 'DELIVERED'].includes(form.fulfillmentStatus)} onChange={event => setForm(current => ({ ...current, trackingCarrier: event.target.value }))} placeholder="UPS, DHL, USPS…" /></label>
        <label><span>Tracking number{['SHIPPED', 'DELIVERED'].includes(form.fulfillmentStatus) && ' · required'}</span><input value={form.trackingNumber} required={['SHIPPED', 'DELIVERED'].includes(form.fulfillmentStatus)} onChange={event => setForm(current => ({ ...current, trackingNumber: event.target.value }))} placeholder="Carrier tracking number" /></label>
        <label><span>Tracking URL</span><input value={form.trackingUrl} onChange={event => setForm(current => ({ ...current, trackingUrl: event.target.value }))} placeholder="https://…" /></label>
        {notice && <p className={notice.includes('saved') ? 'is-success' : 'is-error'} role={notice.includes('saved') ? 'status' : 'alert'}>{notice}</p>}
        <button className="orders-save" onClick={onSave} disabled={saving || (!canFulfill && activeFulfillment.has(form.fulfillmentStatus)) || (canFulfill && form.fulfillmentStatus === 'CANCELLED') || (['SHIPPED', 'DELIVERED'].includes(form.fulfillmentStatus) && (!form.trackingCarrier.trim() || !form.trackingNumber.trim()))}><Truck size={16} />{saving ? 'SAVING…' : 'SAVE FULFILLMENT'}</button>
        {!canFulfill && <small className="orders-warning"><CircleAlert size={14} /> Production and shipping stay locked until payment is confirmed.</small>}
      </section>
      {Array.isArray(order.events) && order.events.length > 0 && <section className="orders-events"><p>EVENT HISTORY</p>{order.events.slice(0, 12).map(event => <article key={event.id || `${event.event_type}-${event.created_at}`}><span>{new Date(event.created_at).toLocaleString()}</span><strong>{label(event.event_type)}</strong><small>{event.message}</small></article>)}</section>}
      {order.tracking_url && <a className="orders-track-link" href={order.tracking_url} target="_blank" rel="noreferrer">Open carrier tracking <ExternalLink size={14} /></a>}
    </aside>
  </div>
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ fulfillmentStatus: 'UNFULFILLED', trackingCarrier: '', trackingNumber: '', trackingUrl: '' })
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setNotice('')
    try { const result = await fetchAdminOrders(); setOrders(result.orders || []) } catch (error) { setNotice(error instanceof Error ? error.message : 'Orders could not be loaded.') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => orders
    .filter(order => {
      if (status === 'ALL') return true
      if (status.startsWith('PAYMENT_')) return order.payment_status === status.slice(8)
      if (status.startsWith('FULFILLMENT_')) return order.fulfillment_status === status.slice(12)
      return order.status === status
    })
    .filter(order => `${order.order_number} ${order.customer_name} ${order.customer_email} ${order.tracking_number || ''}`.toLowerCase().includes(query.toLowerCase())), [orders, status, query])

  const open = async order => {
    setSelected(order); setForm({ fulfillmentStatus: order.fulfillment_status, trackingCarrier: order.tracking_carrier || '', trackingNumber: order.tracking_number || '', trackingUrl: order.tracking_url || '' }); setNotice(''); setDetailLoading(true)
    try { const result = await fetchAdminOrder(order.id); setSelected(current => current?.id === order.id ? { ...current, ...result.order } : current) } catch (error) { setNotice(error instanceof Error ? error.message : 'Order details could not be loaded.') } finally { setDetailLoading(false) }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true); setNotice('Saving fulfillment update…')
    try {
      const result = await updateAdminOrder({ id: selected.id, ...form })
      setOrders(current => current.map(order => order.id === selected.id ? { ...order, ...result.order } : order))
      setSelected(current => ({ ...current, ...result.order }))
      setNotice('Fulfillment update saved and added to the customer timeline.')
      const detail = await fetchAdminOrder(selected.id).catch(() => null)
      if (detail?.order) setSelected(current => ({ ...current, ...detail.order }))
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Order update could not be saved.') } finally { setSaving(false) }
  }

  const paid = orders.filter(order => order.payment_status === 'PAID').length
  const waiting = orders.filter(order => order.status === 'PENDING_PAYMENT').length
  const shipping = orders.filter(order => ['IN_PROGRESS', 'SHIPPED'].includes(order.fulfillment_status)).length
  return <main className="admin-page admin-orders">
    <div className="admin-page-intro"><div><p>ORDERS / FULFILLMENT</p><h1>EVERY MINUTE, ACCOUNTED FOR.</h1><span>Payment is read-only here. Move only paid orders through production, shipping and delivery.</span></div><button className="admin-button admin-button--outline" onClick={load} disabled={loading}><RefreshCw size={15} />{loading ? 'Loading…' : 'Refresh'}</button></div>
    <section className="orders-stats"><article><span>Paid orders</span><strong>{paid}</strong><small>Provider-confirmed only</small></article><article><span>Awaiting payment</span><strong>{waiting}</strong><small>Not yet in production</small></article><article><span>In fulfillment</span><strong>{shipping}</strong><small>Production or shipped</small></article></section>
    <div className="orders-toolbar"><label><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Order, customer or tracking number" /></label><label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option>ALL</option><option>PENDING_PAYMENT</option><option>CONFIRMED</option><option>PROCESSING</option><option>SHIPPED</option><option>DELIVERED</option><option>REFUNDED</option><option>EXPIRED</option><option>PAYMENT_FAILED</option><option>CANCELLED</option><option>PAYMENT_AUTHORIZED</option><option>PAYMENT_PAID</option><option>FULFILLMENT_IN_PROGRESS</option><option>FULFILLMENT_UNFULFILLED</option></select><ChevronDown size={13} /></label></div>
    {notice && !selected && <p className="orders-notice" role="status">{notice}</p>}
    <section className="orders-table"><div className="orders-table__head"><span>ORDER</span><span>CUSTOMER</span><span>PAYMENT</span><span>FULFILLMENT</span><span>TOTAL</span><span>DATE</span></div>{shown.map(order => <button className="orders-row" key={order.id} onClick={() => open(order)}><span><strong>{order.order_number}</strong><small>{order.payment_provider}</small></span><span><strong>{order.customer_name}</strong><small>{order.customer_email}</small></span><Pill value={order.payment_status} /><Pill value={order.fulfillment_status} /><span><strong>{money(order.grand_total, order.currency)}</strong></span><span><small>{new Date(order.created_at).toLocaleDateString()}</small></span></button>)}{!loading && !shown.length && <div className="orders-empty"><PackageCheck size={24} /><strong>No matching orders</strong><span>Paid and pending orders appear after checkout creates them.</span></div>}</section>
    {selected && <OrderDetail order={selected} form={form} setForm={setForm} notice={notice} saving={saving} detailLoading={detailLoading} onClose={() => setSelected(null)} onSave={save} />}
  </main>
}
