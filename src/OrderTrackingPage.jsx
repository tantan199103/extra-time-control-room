import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Copy, ExternalLink, Package, RefreshCw, Search, Truck } from 'lucide-react'
import { statusLabel, trackOrder } from './lib/order-tracking'
import { renderGoogleSurveyOptIn } from './lib/google-reviews'

const stages = [
  { key: 'PAID', title: 'Payment received', copy: 'Your payment is confirmed.' },
  { key: 'CONFIRMED', title: 'Order confirmed', copy: 'The studio has the order details.' },
  { key: 'PROCESSING', title: 'In production', copy: 'Artwork review and production are underway.' },
  { key: 'SHIPPED', title: 'On the way', copy: 'A tracking link appears here when dispatched.' },
  { key: 'DELIVERED', title: 'Delivered', copy: 'The memory has arrived.' }
]

function stageIndex(order) {
  if (order?.status === 'DELIVERED' || order?.fulfillmentStatus === 'DELIVERED') return 4
  if (order?.status === 'SHIPPED' || order?.fulfillmentStatus === 'SHIPPED') return 3
  if (order?.status === 'PROCESSING' || order?.fulfillmentStatus === 'IN_PROGRESS') return 2
  if (['CONFIRMED', 'PAID'].includes(order?.status) || order?.paymentStatus === 'PAID') return 1
  return -1
}

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)) } catch { return `${currency} ${Number(value || 0).toFixed(2)}` }
}
const terminalStatuses = new Set(['CANCELLED', 'EXPIRED', 'PAYMENT_FAILED', 'REFUNDED'])
const pendingStatuses = new Set(['PENDING', 'AUTHORIZED'])

function pendingPayment(order) {
  return Boolean(order && pendingStatuses.has(order.paymentStatus) && !terminalStatuses.has(order.status))
}

function reviewRequired(order) {
  // A review event is historical. Once a verified provider callback moves the
  // order to PAID, the warning must not permanently hide the live timeline.
  return order?.paymentStatus !== 'PAID' && Boolean(order?.events?.some(event => event.type === 'PAYMENT_REVIEW_REQUIRED'))
}

function readPendingCheckout() {
  try { return JSON.parse(sessionStorage.getItem('extra-time-pending-checkout') || 'null') } catch { return null }
}

function publicTrackingUrl(publicId, token) {
  if (!publicId || !token) return ''
  return `${window.location.origin}/order/${encodeURIComponent(publicId)}?token=${encodeURIComponent(token)}`
}

async function copyText(value) {
  if (!value) return false
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true }
  const node = document.createElement('textarea')
  node.value = value; node.setAttribute('readonly', ''); node.style.position = 'fixed'; node.style.opacity = '0'
  document.body.appendChild(node); node.select(); const copied = document.execCommand('copy'); node.remove(); return copied
}

export default function OrderTrackingPage({ onNavigate, onPaymentConfirmed, initialPublicId = '', initialToken = '' }) {
  const [publicId, setPublicId] = useState(initialPublicId)
  const [token, setToken] = useState(initialToken)
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pollCount, setPollCount] = useState(0)
  const [copied, setCopied] = useState(false)

  async function load(id = publicId, secureToken = token, { silent = false } = {}) {
    if (!id || !secureToken) { setError('Enter both the order number and tracking token.'); return null }
    if (silent) setRefreshing(true); else setLoading(true)
    setError('')
    try {
      const next = await trackOrder(id.trim(), secureToken.trim())
      setOrder(next)
      const pending = readPendingCheckout()
      if (next.paymentStatus === 'PAID' && pending?.publicId === next.publicId) {
        onPaymentConfirmed?.(pending.lineKeys)
        try { sessionStorage.removeItem('extra-time-pending-checkout') } catch {}
      }
      return next
    } catch (caught) {
      if (!silent) setOrder(null)
      setError(caught instanceof Error ? caught.message : 'Order tracking is unavailable.')
      return null
    } finally {
      if (silent) setRefreshing(false); else setLoading(false)
    }
  }

  useEffect(() => {
    if (initialPublicId && initialToken) load(initialPublicId, initialToken)
    // The route is intentionally the only trigger: typing in the lookup form
    // must not cause a network request until the customer submits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPublicId, initialToken])

  useEffect(() => {
    if (!order || !pendingPayment(order) || !publicId || !token) return undefined
    const delays = [15000, 25000, 40000, 60000]
    const delay = delays[Math.min(pollCount, delays.length - 1)] || 90000
    const timer = window.setTimeout(async () => {
      const result = await load(publicId, token, { silent: true })
      if (result && pendingPayment(result)) setPollCount(current => current + 1)
    }, delay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.publicId, order?.paymentStatus, order?.status, pollCount, publicId, token])

  useEffect(() => {
    if (!order || !order.publicId) return
    const isConfirmedOrPaid = order.paymentStatus === 'PAID' || ['CONFIRMED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)
    if (!isConfirmedOrPaid) return

    const pending = readPendingCheckout()
    const email = order.customerEmail || pending?.customerEmail || ''
    const country = order.shippingAddress?.country || pending?.country || 'US'

    if (email) {
      renderGoogleSurveyOptIn({
        orderId: order.publicId,
        email,
        country,
        orderDate: order.createdAt,
        products: (order.lines || []).map(line => ({ gtin: line.sku || '' })).filter(p => p.gtin)
      })
    }
  }, [order?.publicId, order?.paymentStatus, order?.status, order?.customerEmail, order?.createdAt])

  const current = stageIndex(order)
  const terminal = terminalStatuses.has(order?.status)
  const review = reviewRequired(order)
  const trackingLink = useMemo(() => publicTrackingUrl(order?.publicId, token), [order?.publicId, token])

  async function handleCopyLink() {
    const ok = await copyText(trackingLink)
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 1800)
  }

  const submitLookup = event => { event.preventDefault(); setPollCount(0); setOrder(null); load() }
  const statusMessage = review
    ? 'The provider reported an uncertain capture. Do not pay again; support must reconcile the payment before fulfillment.'
    : order?.status === 'EXPIRED'
    ? 'The payment window expired and reserved stock was released. Start a new checkout if you still want these pieces.'
    : order?.status === 'REFUNDED'
      ? 'This payment was refunded. Fulfillment is no longer active for this order.'
      : order?.status === 'PAYMENT_FAILED'
        ? 'Payment was not confirmed. No paid order was created.'
        : order?.status === 'CANCELLED'
          ? 'This order was cancelled and reserved stock was released.'
          : pendingPayment(order)
              ? order.paymentStatus === 'AUTHORIZED' ? 'The provider has authorized the payment. We are waiting for settlement; do not pay again.' : 'Payment has not been confirmed yet. This is not a paid order.'
              : ''

  return <main className="tracking-page">
    <div className="tracking-page__top"><button className="checkout-back" onClick={() => onNavigate('/shop')}><ArrowLeft size={16}/> Back to the drop</button><span>ORDER TRACKING / 90+</span></div>
    <section className="tracking-hero"><p>THE NEXT MINUTES MATTER.</p><h1>Follow the<br/><em>memory.</em></h1><span>Use the private order token returned after checkout. Order numbers alone never reveal an order.</span></section>
    <form className="tracking-lookup" onSubmit={submitLookup}><label><span>Order number</span><input value={publicId} onChange={event => setPublicId(event.target.value)} placeholder="ET-20260918-ABC123" autoComplete="off"/></label><label><span>Private tracking token</span><input value={token} onChange={event => setToken(event.target.value)} placeholder="Paste the token from checkout" autoComplete="off"/></label><button type="submit" disabled={loading}><Search size={17}/>{loading ? 'LOOKING…' : 'LOOK UP ORDER'}</button></form>
    {error && <div className="checkout-banner checkout-banner--error" role="alert"><CircleAlert size={17}/><span>{error}</span></div>}
    {order && <section className="tracking-result"><header className="tracking-result__head"><div><span>ORDER {order.publicId}</span><h2>{statusLabel(order.status)}</h2><p>Placed {new Date(order.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · {money(order.total, order.currency)}</p></div><div className="tracking-result__actions"><div className={`tracking-status tracking-status--${String(order.status).toLowerCase()}`}><Package size={18}/><span>{order.paymentStatus === 'PAID' ? 'Payment confirmed' : statusLabel(order.paymentStatus)}</span></div><div className="tracking-action-row"><button type="button" onClick={() => load(order.publicId, token, { silent: true })} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'is-spinning' : ''}/>{refreshing ? 'Refreshing…' : 'Refresh status'}</button><button type="button" onClick={handleCopyLink}><Copy size={14}/>{copied ? 'Link copied' : 'Copy tracking link'}</button></div></div></header>{statusMessage && <div className={`tracking-state tracking-state--${review || terminal ? 'alert' : 'pending'}`} role="status"><CircleAlert size={18}/><span>{statusMessage}</span></div>}{!terminal && !review && <div className="tracking-timeline">{stages.map((stage, index) => { const eventKeys = stage.key === 'PROCESSING' ? ['PROCESSING', 'IN_PROGRESS'] : [stage.key]; return <div key={stage.key} className={`tracking-stage ${index <= current ? 'is-done' : ''} ${index === current ? 'is-current' : ''}`}><div className="tracking-stage__dot">{index <= current ? <Check size={14}/> : <span>{index + 1}</span>}</div><div><strong>{stage.title}</strong><span>{stage.copy}</span>{order.events?.filter(event => eventKeys.some(key => event.type.includes(key)) || (stage.key === 'PAID' && event.type === 'PAYMENT_CONFIRMED') || (stage.key === 'CONFIRMED' && event.type === 'ORDER_CREATED')).slice(-1).map(event => <small key={`${event.type}-${event.createdAt}`}>{event.message} · {new Date(event.createdAt).toLocaleDateString()}</small>)}</div></div> })}</div>}{order.tracking && <div className="tracking-shipment"><Truck size={20}/><div><span>TRACKING</span><strong>{order.tracking.carrier || 'Carrier'} · {order.tracking.number}</strong></div>{order.tracking.url && <a href={order.tracking.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Open carrier</a>}</div>}<div className="tracking-order-grid"><div><span>ITEMS</span>{order.lines.map(line => <article key={line.id}><img src={line.image} alt=""/><div><strong>{line.title}</strong><small>{Object.entries(line.options || {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || line.sku}</small>{line.customization && <details className="tracking-customization"><summary>Personalization attached</summary>{Object.entries(line.customization.fields || {}).map(([key, value]) => <span key={key}>{key}: {value}</span>)}{line.customization.note && <span>Note: {line.customization.note}</span>}{line.customization.hasAiPreview && <span>AI preview included</span>}</details>}</div><b>×{line.quantity}</b></article>)}</div><div className="tracking-order-total"><span>DELIVERY</span><p>{order.shippingAddress?.city || 'Destination'} · {order.shippingAddress?.country || ''}</p><div><span>Subtotal</span><b>{money(order.subtotal, order.currency)}</b></div>{order.discount > 0 && <div><span>Club saving</span><b>−{money(order.discount, order.currency)}</b></div>}<div><span>Shipping</span><b>{order.shipping === 0 ? 'FREE' : money(order.shipping, order.currency)}</b></div>{order.tax > 0 && <div><span>Tax</span><b>{money(order.tax, order.currency)}</b></div>}<div className="tracking-grand"><span>Total</span><b>{money(order.total, order.currency)}</b></div></div></div></section>}
    <footer className="tracking-footer"><span>Need a hand?</span><button onClick={() => onNavigate('/shipping')}>Read shipping policy <ArrowRight size={15}/></button><button onClick={() => onNavigate('/shop')}>Continue shopping <ArrowRight size={15}/></button></footer>
  </main>
}
