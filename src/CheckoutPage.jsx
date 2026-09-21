import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, Lock, PackageCheck, ShieldCheck, ShoppingBag, Sparkles } from 'lucide-react'
import { cancelPendingPayment, capturePayPalPayment, createCheckout, requestCheckoutQuote } from './lib/supabase'

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)) } catch { return `${currency} ${Number(value || 0).toFixed(2)}` }
}
const emptyShipping = { method: 'STANDARD', country: 'US', address1: '', address2: '', city: '', state: '', postalCode: '' }

const REGION_OPTIONS = {
  US: [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['AS','American Samoa'],['GU','Guam'],['MP','Northern Mariana Islands'],['PR','Puerto Rico'],['VI','U.S. Virgin Islands']
  ],
  CA: [['AB','Alberta'],['BC','British Columbia'],['MB','Manitoba'],['NB','New Brunswick'],['NL','Newfoundland and Labrador'],['NT','Northwest Territories'],['NS','Nova Scotia'],['NU','Nunavut'],['ON','Ontario'],['PE','Prince Edward Island'],['QC','Quebec'],['SK','Saskatchewan'],['YT','Yukon']]
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '')
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

function newCheckoutAttempt() {
  return {
    idempotencyKey: `checkout_${randomId()}`,
    trackingToken: `track_${randomId()}${randomId()}`
  }
}

function Field({ label, value, onChange, required = false, ...props }) {
  return <label className="checkout-field"><span>{label}{required && <b>Required</b>}</span><input value={value} required={required} onChange={event => onChange(event.target.value)} {...props}/></label>
}

function routeParams(route) {
  const raw = String(route || window.location.search || '')
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : raw.replace(/^\?/, '')
  return new URLSearchParams(query)
}

function statusLabel(status) {
  return String(status || 'PENDING_PAYMENT').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase())
}

function customerFacingCheckoutError(error, fallback) {
  const message = error instanceof Error ? error.message : ''
  if (/migration|request protection|server access|not configured/i.test(message)) return 'Secure checkout is temporarily paused while the store finishes setup. Your bag is safe; please try again shortly.'
  return message || fallback
}

export default function CheckoutPage({ cart = [], account, onNavigate, onClearCart, onPaymentConfirmed, initialRoute = '' }) {
  const [shipping, setShipping] = useState(emptyShipping)
  const [customer, setCustomer] = useState({ email: account?.user?.email || '', name: account?.user?.user_metadata?.full_name || '' })
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [cancelSyncing, setCancelSyncing] = useState(false)
  const [paymentFailure, setPaymentFailure] = useState('')
  const [paymentReview, setPaymentReview] = useState(false)
  const [reviewOrder, setReviewOrder] = useState(null)
  const [returning, setReturning] = useState(false)
  const [checkoutAttempt, setCheckoutAttempt] = useState(newCheckoutAttempt)

  const params = useMemo(() => routeParams(initialRoute), [initialRoute])

  useEffect(() => {
    if (account?.user?.email && !customer.email) setCustomer(current => ({ ...current, email: account.user.email }))
  }, [account?.user?.email])

  useEffect(() => {
    const paymentState = params.get('payment')
    setCancelled(false)
    setPaymentFailure('')
    setPaymentReview(false)
    setReviewOrder(null)
    if (paymentState === 'cancelled') {
      const publicId = params.get('order')
      const returnedTrackingToken = params.get('tracking')
      const providerOrderId = params.get('token') || ''
      if (!publicId || !returnedTrackingToken) {
        setCancelled(true)
        return undefined
      }
      let active = true
      setCancelSyncing(true)
      setCheckoutError('')
      cancelPendingPayment({ publicId, token: returnedTrackingToken, providerOrderId }).then(result => {
        if (!active) return
        if (result.paid) {
          setReviewOrder({ publicId, token: returnedTrackingToken })
          setCheckoutError('This payment was already confirmed. Open order tracking to see the confirmed order.')
        }
        else {
          setCancelled(Boolean(result.cancelled))
          // A cancelled order is terminal. Rotate the client identity so the
          // next submit reserves a fresh order instead of replaying it.
          if (result.cancelled) setCheckoutAttempt(newCheckoutAttempt())
        }
      }).catch(error => active && setCheckoutError(customerFacingCheckoutError(error, 'Payment cancellation could not be recorded.'))).finally(() => active && setCancelSyncing(false))
      return () => { active = false }
    }
    const providerOrderId = params.get('token')
    const publicId = params.get('order')
    const trackingToken = params.get('tracking')
    if (paymentState !== 'return') return undefined
    if (!providerOrderId || !publicId || !trackingToken) {
      setPaymentFailure('The payment return link is incomplete, so no payment can be confirmed from this page.')
      return undefined
    }
    let active = true
    setReturning(true)
    capturePayPalPayment({ publicId, token: trackingToken, providerOrderId }).then(result => {
      if (!active) return
      if (result.paid) {
        let pending = null
        try { pending = JSON.parse(sessionStorage.getItem('extra-time-pending-checkout') || 'null') } catch {}
        const fallbackLineKeys = cart.map(item => item.key || `${item.product.id}:${item.variantId}`)
        onPaymentConfirmed?.(pending?.publicId === publicId ? (pending.lineKeys || fallbackLineKeys) : fallbackLineKeys)
        if (!onPaymentConfirmed) onClearCart?.()
        try { sessionStorage.removeItem('extra-time-pending-checkout') } catch {}
        onNavigate(`/order/${encodeURIComponent(publicId)}?token=${encodeURIComponent(trackingToken)}`)
      } else if (result.pending) {
        onNavigate(`/order/${encodeURIComponent(publicId)}?token=${encodeURIComponent(trackingToken)}`)
      }
    }).catch(error => { if (!active) return; setPaymentReview(Boolean(error?.reviewRequired)); setReviewOrder({ publicId, token: trackingToken }); setPaymentFailure(customerFacingCheckoutError(error, 'Payment could not be confirmed.')) }).finally(() => active && setReturning(false))
    return () => { active = false }
  }, [initialRoute])

  useEffect(() => {
    if (!cart.length || params.get('payment') === 'return') { setQuote(null); return undefined }
    let active = true
    setQuoteLoading(true)
    setQuoteError('')
    requestCheckoutQuote(cart, { country: shipping.country, method: shipping.method }).then(result => active && setQuote(result)).catch(error => active && setQuoteError(customerFacingCheckoutError(error, 'Quote unavailable.'))).finally(() => active && setQuoteLoading(false))
    return () => { active = false }
  }, [cart, shipping.country, shipping.method, initialRoute])

  const updateShipping = (key, value) => setShipping(current => ({ ...current, [key]: value, ...(key === 'country' ? { state: '' } : {}) }))
  const updateCustomer = (key, value) => setCustomer(current => ({ ...current, [key]: value }))
  const submit = async event => {
    event.preventDefault()
    if (!quote) { setCheckoutError('Complete the delivery country and wait for the secure quote.'); return }
    let checkoutShipping = shipping
    const regionOptions = REGION_OPTIONS[shipping.country]
    if (regionOptions) {
      const enteredRegion = String(shipping.state || '').trim().toUpperCase()
      const matchedRegion = regionOptions.find(([code, label]) => code === enteredRegion || label.toUpperCase() === enteredRegion)
      if (!matchedRegion) { setCheckoutError(`Enter a valid ${shipping.country === 'US' ? 'US state' : 'Canadian province'} name or two-letter code before continuing to PayPal.`); return }
      checkoutShipping = { ...shipping, state: matchedRegion[0] }
    }
    if (quote.paymentAvailable === false) { setCheckoutError(quote.paymentMessage || 'Online payment is temporarily unavailable.'); return }
    setSubmitting(true)
    setCheckoutError('')
    try {
      const lineKeys = cart.map(item => item.key || `${item.product.id}:${item.variantId}`)
      const result = await createCheckout({ cart, shipping: checkoutShipping, customer, quoteToken: quote.quoteToken, idempotencyKey: checkoutAttempt.idempotencyKey, trackingToken: checkoutAttempt.trackingToken })
      if (result.approvalUrl) {
        let approval
        try { approval = new URL(result.approvalUrl, window.location.origin) } catch { approval = null }
        if (!approval || approval.protocol !== 'https:' || !/((^|\.)paypal\.com|(^|\.)paypalobjects\.com)$/i.test(approval.hostname)) throw new Error('The payment provider returned an invalid approval link. Your bag is still available; try again shortly.')
        sessionStorage.setItem('extra-time-pending-checkout', JSON.stringify({ publicId: result.order.publicId, token: result.order.token, provider: result.provider, lineKeys }))
        window.location.assign(approval.href)
        return
      }
      if (!result.paid) throw new Error('The payment provider did not return a secure approval link. Your bag is still available; start checkout again.')
      onPaymentConfirmed?.(lineKeys)
      if (!onPaymentConfirmed) onClearCart?.()
      onNavigate(`/order/${encodeURIComponent(result.order.publicId)}?token=${encodeURIComponent(result.order.token)}`)
    } catch (error) {
      // A handled server response means the attempt is either invalid or
      // terminal. Preserve the key only for ambiguous network failures, where
      // replaying is what prevents a duplicate reservation.
      if (Number.isFinite(Number(error?.status)) && Number(error.status) >= 400) setCheckoutAttempt(newCheckoutAttempt())
      setCheckoutError(customerFacingCheckoutError(error, 'Checkout could not be started.'))
    } finally { setSubmitting(false) }
  }

  const retryPayment = () => {
    setCheckoutAttempt(newCheckoutAttempt())
    setCheckoutError('')
    setQuoteError('')
    setPaymentFailure('')
    setPaymentReview(false)
    setReviewOrder(null)
    setCancelled(false)
    onNavigate('/checkout')
  }

  const paymentReturn = params.get('payment') === 'return' && params.get('token') && params.get('order') && params.get('tracking')

  if (returning) return <main className="checkout-page checkout-page--return"><div className="checkout-spinner"/><p>CONFIRMING PAYMENT</p><h1>Checking the final whistle.</h1><span>We are waiting for the payment provider’s server confirmation. Keep this window open.</span></main>
  if (paymentReturn && !paymentFailure) return <main className="checkout-page checkout-page--return"><div className="checkout-spinner"/><p>CONFIRMING PAYMENT</p><h1>Checking the final whistle.</h1><span>We are waiting for the payment provider’s server confirmation. Keep this window open.</span></main>
  if (paymentFailure) return <main className="checkout-page checkout-page--return checkout-page--failure"><CircleAlert size={40}/><p>{paymentReview ? 'PAYMENT NEEDS REVIEW' : 'PAYMENT NOT CONFIRMED'}</p><h1>{paymentReview ? <>We’re on<br/><em>it.</em></> : <>One more<br/><em>try.</em></>}</h1><span>{paymentFailure} {paymentReview ? 'Do not pay again yet. Keep your order number and contact support so the captured payment can be reconciled.' : 'No paid order was created. Your bag is still available so you can review the details and try again.'}</span><div className="checkout-failure-actions">{reviewOrder && <button className="button button--dark" onClick={() => onNavigate(`/order/${encodeURIComponent(reviewOrder.publicId)}?token=${encodeURIComponent(reviewOrder.token)}`)}>VIEW ORDER STATUS <ArrowRight size={16}/></button>}{!paymentReview && <button className="button button--dark" onClick={retryPayment}>TRY PAYMENT AGAIN <ArrowRight size={16}/></button>}<button className="checkout-back" onClick={() => onNavigate('/shop')}><ArrowLeft size={16}/> Back to the drop</button></div></main>
  if (!cart.length) return <main className="checkout-page checkout-page--empty"><div className="checkout-empty-mark">90<span>+</span></div><h1>Your bag is clear.</h1><p>Add a piece before starting checkout.</p><button className="button button--dark" onClick={() => onNavigate('/shop')}>SHOP THE DROP <ArrowRight size={16}/></button></main>

  return <main className="checkout-page">
    <div className="checkout-page__top"><button className="checkout-back" onClick={() => onNavigate('/shop')}><ArrowLeft size={16}/> Back to the drop</button><span className="checkout-step">SECURE CHECKOUT / 01</span></div>
    {cancelled && <div className="checkout-banner checkout-banner--warning" role="status"><CircleAlert size={17}/><span>{cancelSyncing ? 'Syncing the cancellation and releasing the reserved stock…' : 'Payment was cancelled. The pending order was closed and reserved stock was released. Your bag is still here.'}</span></div>}
    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={submit}>
        <header className="checkout-heading"><p>ONE SCREEN. NO DETOURS.</p><h1>Finish the<br/><em>memory.</em></h1><span>Enter delivery details, review the live price, then continue to the secure payment provider.</span></header>
        <section className="checkout-section"><div className="checkout-section__head"><span>01</span><div><h2>Contact</h2><p>Keep this address with the order so delivery updates can reach you.</p></div></div><div className="checkout-fields"><Field label="Email" required type="email" autoComplete="email" value={customer.email} onChange={value => updateCustomer('email', value)}/><Field label="Name" required autoComplete="name" value={customer.name} onChange={value => updateCustomer('name', value)}/></div></section>
        <section className="checkout-section"><div className="checkout-section__head"><span>02</span><div><h2>Delivery</h2><p>Tracked delivery. The studio confirms production timing after payment.</p></div></div><div className="checkout-fields"><label className="checkout-field"><span>Country <b>Required</b></span><select value={shipping.country} onChange={event => updateShipping('country', event.target.value)}><option value="US">United States</option><option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="AU">Australia</option><option value="SG">Singapore</option><option value="VN">Vietnam</option><option value="DE">Germany</option><option value="FR">France</option><option value="JP">Japan</option></select></label><Field label="Address" required autoComplete="street-address" value={shipping.address1} onChange={value => updateShipping('address1', value)}/><Field label="Apartment / suite" autoComplete="address-line2" value={shipping.address2} onChange={value => updateShipping('address2', value)}/><Field label="City" required autoComplete="address-level2" value={shipping.city} onChange={value => updateShipping('city', value)}/><Field label="State / region" autoComplete="address-level1" value={shipping.state} onChange={value => updateShipping('state', value)}/><Field label="Postal code" required autoComplete="postal-code" value={shipping.postalCode} onChange={value => updateShipping('postalCode', value)}/></div><div className="checkout-shipping-options"><p>Delivery speed</p>{['STANDARD','EXPRESS'].map(method => <button type="button" key={method} className={shipping.method === method ? 'is-active' : ''} onClick={() => updateShipping('method', method)}><span><strong>{method === 'STANDARD' ? 'Standard tracked' : 'Express tracked'}</strong><small>{method === 'STANDARD' ? '5–8 business days' : '2–4 business days'}</small></span><b>{quote?.shipping?.method === method ? (quote.shipping.free ? 'FREE' : money(quote.shipping.amount)) : method === 'STANDARD' ? 'from $8' : '$18'}</b></button>)}</div></section>
        <section className="checkout-section checkout-section--trust"><div className="checkout-trust"><ShieldCheck size={19}/><div><strong>Payment is handled by the provider</strong><span>Extra Time never stores card details. An order only becomes confirmed after a verified payment response.</span></div></div><div className="checkout-trust"><PackageCheck size={19}/><div><strong>Personalized pieces stay reviewable</strong><span>Your name, number, note and optional photo remain attached to the order for the studio review.</span></div></div></section>
        {checkoutError && <div className="checkout-banner checkout-banner--error" role="alert"><CircleAlert size={17}/><span>{checkoutError}</span></div>}
        {quoteError && <div className="checkout-banner checkout-banner--error" role="alert"><CircleAlert size={17}/><span>{quoteError}</span></div>}
        {quote?.paymentAvailable === false && <div className="checkout-banner checkout-banner--warning" role="status"><CircleAlert size={17}/><span>{quote.paymentMessage || 'Online payment is temporarily unavailable.'} Checkout stays paused until the provider is ready.</span></div>}
        <button className="checkout-submit" type="submit" disabled={submitting || quoteLoading || !quote || quote.paymentAvailable === false}><Lock size={16}/><span>{submitting ? 'STARTING SECURE PAYMENT…' : quoteLoading ? 'CHECKING LIVE PRICE…' : quote?.paymentAvailable === false ? 'PAYMENT SETUP IN PROGRESS' : quote ? `CONTINUE TO PAYMENT · ${money(quote.total, quote.currency)}` : 'ENTER DELIVERY TO CONTINUE'}</span><ArrowRight size={17}/></button>
        <p className="checkout-disclaimer">By continuing, you agree to the <button type="button" onClick={() => onNavigate('/terms')}>store terms</button>. Payment confirmation, not this button, creates a paid order.</p>
      </form>
      <aside className="checkout-summary"><div className="checkout-summary__label"><ShoppingBag size={15}/> Your bag <span>{cart.reduce((sum, item) => sum + item.qty, 0)}</span></div><div className="checkout-summary__items">{cart.map(item => <article key={item.key || `${item.product.id}:${item.variantId}`}><img src={item.customization?.aiPreviewUrl || item.product.image} alt=""/><div><strong>{item.product.name}</strong><span>{Object.entries(item.options || {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}</span>{item.customization && <small><Sparkles size={12}/> Personalized details attached</small>}</div><b>{money((quote?.lines?.find(line => line.lineKey === item.key)?.finalUnit ?? item.unitPrice ?? item.product.price) * item.qty, quote?.currency || 'USD')}</b></article>)}</div>{quote ? <div className="checkout-totals"><div><span>Items</span><b>{money(quote.subtotal, quote.currency)}</b></div>{quote.discount > 0 && <div className="is-saving"><span>{quote.quantityTier?.discountPercent > 0 && !quote.member ? `Quantity saving · ${quote.quantityTier.discountPercent}%` : quote.quantityTier?.discountPercent > 0 ? `Best saving applied · ${quote.quantityTier.discountPercent}% tier` : '90+ Club saving'}</span><b>−{money(quote.discount, quote.currency)}</b></div>}<div><span>Delivery</span><b>{quote.shipping.free ? 'FREE' : money(quote.shipping.amount, quote.currency)}</b></div>{quote.tax > 0 && <div><span>Tax</span><b>{money(quote.tax, quote.currency)}</b></div>}<div className="checkout-total"><span>Total</span><b>{money(quote.total, quote.currency)} <small>{quote.currency}</small></b></div></div> : <div className="checkout-summary__waiting">Enter your country to calculate the live total.</div>}<div className="checkout-summary__foot"><span>90+</span><p>Football memories,<br/>made wearable.</p></div></aside>
    </div>
  </main>
}

export { statusLabel }
