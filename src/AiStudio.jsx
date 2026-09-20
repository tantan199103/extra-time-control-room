import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, RefreshCw, Sparkles } from 'lucide-react'
import { findStorefrontProduct } from './lib/storefront-model'
import { getCustomerSessionId } from './lib/supabase'
import { apiFetch } from './lib/api-client'
import { normalizePreviewRegion } from './lib/customization-ai'

const COLOR_PRESETS = Object.freeze([
  ['Black', '#111111'], ['White', '#eeeeea'], ['Navy', '#18233e'],
  ['Red', '#a5272d'], ['Green', '#315c43'], ['Purple', '#5f3a78']
])

function readDraft(productId) {
  try { return JSON.parse(window.sessionStorage.getItem(`extra-time-pdp-draft-${productId}`) || 'null') || {} } catch { return {} }
}

function saveDraft(productId, patch) {
  try {
    const current = readDraft(productId)
    window.sessionStorage.setItem(`extra-time-pdp-draft-${productId}`, JSON.stringify({ ...current, ...patch }))
  } catch {}
}

function go(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top:0, behavior:'instant' })
}

function StudioField({ field, value, onChange }) {
  const isColor = /colou?r/i.test(`${field.key} ${field.label}`)
  const inputValue = value || ''
  const update = raw => {
    const next = field.type === 'number' ? raw.replace(/\D/g, '') : raw.toUpperCase()
    onChange(next.slice(0, field.maxLength || 500))
  }
  return <label className={`ai-studio-field ${field.type === 'textarea' ? 'is-wide' : ''}`}>
    <span><strong>{field.label}</strong><small>{field.help || (field.required ? 'Required for this listing' : 'Optional')}</small></span>
    {field.type === 'select'
      ? <select value={inputValue} onChange={event => update(event.target.value)}><option value="">Keep as shown</option>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select>
      : field.type === 'textarea'
        ? <textarea value={inputValue} onChange={event => update(event.target.value)} placeholder={field.placeholder || 'Add the detail…'}/>
        : <input type="text" inputMode={field.type === 'number' ? 'numeric' : 'text'} value={inputValue} onChange={event => update(event.target.value)} placeholder={field.placeholder || 'Keep as shown'} maxLength={field.maxLength || undefined}/>
    }
    {isColor && <div className="ai-studio-colors" aria-label="Quick colour choices">{COLOR_PRESETS.map(([name,hex]) => <button type="button" key={name} className={inputValue.toLowerCase() === name.toLowerCase() ? 'is-active' : ''} aria-label={`Choose ${name}`} aria-pressed={inputValue.toLowerCase() === name.toLowerCase()} onClick={() => onChange(name.toUpperCase())}><i style={{ '--preview-swatch':hex }}/><span>{name}</span></button>)}</div>}
  </label>
}

export default function AiStudio({ products = [] }) {
  const params = new URLSearchParams(window.location.search)
  const product = findStorefrontProduct(products, params.get('product') || 'touchline') || products.find(item => item.customFields?.length) || products[0]
  const draft = readDraft(product?.id)
  const fields = product?.customFields || []
  const editableFields = useMemo(() => fields.map(field => ({ ...field, previewRegion:normalizePreviewRegion(field.previewRegion) })).filter(field => field.type !== 'photo' && field.type !== 'textarea' && field.previewRegion), [fields])
  const [values, setValues] = useState(() => Object.fromEntries(editableFields.map(field => [field.key, String(draft?.values?.[field.key] || '')])))
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const details = useMemo(() => editableFields.map(field => ({ key:field.key, label:field.label, value:String(values[field.key] || '').trim() })).filter(item => item.value), [editableFields,values])
  useEffect(() => {
    if (product?.id) saveDraft(product.id, { values:{ ...(draft?.values || {}), ...values } })
  }, [product?.id,values])

  if (!product) return <main className="not-found"><span>90+</span><h1>NO LISTING.</h1><p>Open visual preview from a published product.</p><button className="button button--dark" onClick={() => go('/shop')}>BACK TO SHOP</button></main>

  const updateValue = (key, value) => { setValues(current => ({ ...current, [key]:value })); setError(''); setPreview(null) }
  const generate = async () => {
    if (!details.length) { setError('Add a name, number, colour or another supported detail first.'); return }
    setLoading(true); setError('')
    try {
      const response = await apiFetch('/api/ai-preview', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ sessionId:getCustomerSessionId(), productId:product.id, values })
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Exact visual preview is not connected yet.')
      setPreview(body)
      saveDraft(product.id, { values:{ ...(draft?.values || {}), ...values } })
      try {
        window.sessionStorage.setItem('extra-time-ai-preview', JSON.stringify({
          productId:product.id, previewId:body.previewId, imageUrl:body.imageUrl, storage:body.storage,
          prompt:body.direction || body.summary || details.map(item => `${item.label}: ${item.value}`).join('; '),
          values, mode:'exact-image-edit', expiresAt:Date.now() + Number(body.expiresIn || 86400) * 1000
        }))
      } catch {}
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Exact visual preview failed.') }
    finally { setLoading(false) }
  }

  return <main className="ai-studio-page">
    <header className="ai-studio-head"><button onClick={() => go(`/product/${product.handle || product.id}?custom=1`)}><ArrowLeft size={15}/> Back to product</button><span><Lock size={15}/> EXACT IMAGE EDIT</span></header>
    <section className="ai-studio-grid">
      <div className="ai-studio-reference">
        <div className="ai-studio-reference__top"><span>LOCKED ORIGINAL IMAGE</span><Lock size={14}/></div>
        <figure><div className="ai-studio-reference__image"><img src={product.image} alt={`${product.name} exact edit reference`}/>{editableFields.map(field => <i key={field.key} style={{ left:`${field.previewRegion.x}%`, top:`${field.previewRegion.y}%`, width:`${field.previewRegion.width}%`, height:`${field.previewRegion.height}%` }}><span>{field.label}</span></i>)}</div><figcaption><strong>{product.name}</strong><span>{product.story}</span></figcaption></figure>
        <p><ImageIcon size={14}/> This exact image is edited in place. It is never replaced by a new shirt render.</p>
      </div>
      <div className="ai-studio-editor">
        <div className="ai-studio-editor__intro"><span>LOCAL EDIT / NO REDESIGN</span><h1>KEEP IT.<br/><em>MAKE IT YOURS.</em></h1><p>Enter only the permitted details. The shirt, pattern, artwork and photograph remain exactly as they are.</p></div>
        <section className="ai-studio-step"><div className="ai-studio-step__head"><b>1</b><span><strong>Your permitted details</strong><small>Only fields with a designer-approved area are shown.</small></span></div>{editableFields.length ? <div className="ai-studio-form-grid">{editableFields.map(field => <StudioField key={field.key} field={field} value={values[field.key]} onChange={value => updateValue(field.key,value)}/>)}</div> : <div className="ai-studio-no-regions"><Lock size={18}/><div><strong>This product does not yet have designer-approved edit areas.</strong><p>The original image cannot be sent for editing until the designer marks the exact name, number or colour area.</p></div></div>}{fields.some(field => field.type === 'photo') && <p className="ai-studio-photo-note"><Lock size={13}/> Photo references stay private for studio review and do not unlock a redesign.</p>}</section>
        <section className="ai-studio-step"><div className="ai-studio-step__head"><b>2</b><span><strong>Original design lock</strong><small>There is no creative mode and no freeform prompt.</small></span></div><div className="ai-studio-exact-lock"><Lock size={17}/><div><strong>Everything else stays exactly as shown</strong><p>Same shirt shape, crop, camera angle, background, fabric, seams, logos, pattern, artwork, lighting and shadows. No 3D render and no newly invented garment.</p></div></div></section>
        <section className="ai-studio-step ai-studio-step--preview"><div className="ai-studio-step__head"><b>3</b><span><strong>Edit the original image</strong><small>Review the values, then request one locked preview.</small></span></div><div className="ai-studio-summary">{details.length ? details.map(item => <span key={item.key}><small>{item.label}</small><strong>{item.value}</strong></span>) : <p>Your selected details will appear here.</p>}</div>{error && <p className="ai-studio-error" role="alert">{error}</p>}<button className="ai-studio-generate" onClick={generate} disabled={loading || !details.length}>{loading ? <><Sparkles size={16}/> EDITING THE ORIGINAL…</> : preview ? <><RefreshCw size={16}/> UPDATE EXACT PREVIEW</> : <><Sparkles size={16}/> EDIT THIS EXACT IMAGE</>}</button></section>
        {preview && <div className="ai-studio-result"><div className="ai-studio-result__head"><span><Check size={14}/> Locked pixels verified</span><small>Private link · 24 hours</small></div><div className="ai-studio-compare"><figure><img src={product.image} alt="Locked original product image"/><figcaption>Locked original</figcaption></figure><figure><img src={preview.imageUrl} alt="Locally edited personalisation preview"/><figcaption>Verified local edit</figcaption></figure></div><button onClick={() => go(`/product/${product.handle || product.id}?custom=1`)}>USE THIS PREVIEW <ArrowRight size={15}/></button></div>}
        <div className="ai-studio-guard"><Lock size={15}/><span><strong>Mismatch means rejection</strong><small>If the result changes the garment or original artwork, it must not be used for the order.</small></span></div>
      </div>
    </section>
  </main>
}
