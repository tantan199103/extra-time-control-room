import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Lock, Sparkles } from 'lucide-react'
import { products } from './data'
import { createCustomizationOrder } from './lib/supabase'

const fieldDefinitions = {
  name: { label:'Name', hint:'Printed on the back', placeholder:'YOUR NAME', maxLength:14, required:true },
  number: { label:'Number', hint:'00—99', placeholder:'00', maxLength:2, inputMode:'numeric', required:true },
  teamCity: { label:'Team / city', hint:'Optional listing area', placeholder:'TEAM OR CITY', maxLength:18 },
  year: { label:'Year', hint:'Four digits', placeholder:'2026', maxLength:4, inputMode:'numeric' },
  color: { label:'Colour note', hint:'Only if this listing allows it', placeholder:'BLACK / PURPLE', maxLength:20 }
}

const defaultValues = { name:'', number:'', teamCity:'', year:'', color:'' }
const money = (amount, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

function go(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top:0, behavior:'instant' })
}

function listingForQuery() {
  const id = new URLSearchParams(window.location.search).get('product') || 'touchline'
  return products.find(item => item.id === id) || products.find(item => item.id === 'touchline') || products[0]
}

function readAiPreview(productId) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem('extra-time-ai-preview') || 'null')
    return saved?.productId === productId ? saved : null
  } catch { return null }
}

export default function SimpleCustomize({ onAdd }) {
  const product = listingForQuery()
  const fields = product.customFields || ['name', 'number']
  const aiPreview = useMemo(() => readAiPreview(product.id), [product.id])
  const [values, setValues] = useState(() => ({ ...defaultValues, name:'', number:'' }))
  const [note, setNote] = useState('')
  const [size, setSize] = useState('M')
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)

  const update = (key, value) => {
    const next = fieldDefinitions[key]?.inputMode === 'numeric' ? value.replace(/\D/g, '') : value.toUpperCase()
    setValues(current => ({ ...current, [key]: next }))
    setErrors(current => ({ ...current, [key]: '' }))
    setSaved(false)
  }

  const add = () => {
    const nextErrors = {}
    fields.forEach(key => { if (fieldDefinitions[key]?.required && !values[key].trim()) nextErrors[key] = `${fieldDefinitions[key].label} is required.` })
    if (values.number && Number(values.number) > 99) nextErrors.number = 'Use a number from 00 to 99.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    const customization = {
      source:'customer-form',
      listingId:product.id,
      listingImage:product.image,
      fields:Object.fromEntries(fields.map(key => [key, values[key].trim()])),
      note:note.trim(),
      aiPreview:aiPreview?.imageUrl || null,
      aiPrompt:aiPreview?.prompt || null
    }
    const templateId = product.id === 'touchline' ? 'touchline-04' : 'after-90-core'
    const templateVersion = product.id === 'touchline' ? 'v1.4' : 'v2.0'
    // Keep the cart flow responsive, while recording the same request for the
    // studio queue whenever the Supabase table is available.
    createCustomizationOrder({
      id:globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}`,
      product_id:product.id,
      template_id:templateId,
      template_version:templateVersion,
      payload:{ ...customization, size },
      preview_front_url:aiPreview?.imageUrl || null,
      status:'PREVIEW'
    }).catch(() => {})
    onAdd({ ...product, id:`${product.id}-custom-${Date.now()}`, name:`${product.name} / ${values.name || 'CUSTOM'}`, image:aiPreview?.imageUrl || product.image, customization }, size)
    setSaved(true)
  }

  return <main className="simple-custom-page">
    <section className="simple-custom-hero">
      <button className="simple-custom-back" onClick={() => go(`/product/${product.id}`)}><ArrowLeft size={15}/> Back to listing</button>
      <div className="simple-custom-hero__copy"><span>LISTING CUSTOM</span><h1>MAKE IT<br/><em>YOURS.</em></h1><p>Keep the design. Add only the details that belong to you.</p></div>
      <div className="simple-custom-hero__meta"><span>{product.name}</span><strong>{product.story}</strong><small>Listing artwork stays fixed</small></div>
    </section>
    <section className="simple-custom-layout">
      <div className="simple-custom-product"><figure><img src={product.image} alt={product.alt || product.name}/><span>01 / LISTING IMAGE</span></figure>{aiPreview && <div className="simple-custom-ai-attached"><Sparkles size={15}/><span><strong>AI direction attached</strong><small>Your prompt preview will be reviewed with this request.</small></span></div>}<div className="simple-custom-trust"><Lock size={15}/><span>We use this exact listing image as the artwork reference.</span></div></div>
      <form className="simple-custom-form" onSubmit={event => { event.preventDefault(); add() }}>
        <div className="simple-custom-form__head"><span>YOUR DETAILS</span><h2>ONE SMALL<br/>PERSONAL LAYER.</h2><p>Fill the fields available for this listing. Nothing else changes.</p></div>
        <div className="simple-custom-fields">{fields.map((key, index) => { const field = fieldDefinitions[key]; if (!field) return null; return <label key={key} className="simple-custom-field"><span><b>0{index + 1}</b>{field.label}<small>{field.hint}</small></span><input value={values[key]} onChange={event => update(key, event.target.value.slice(0, field.maxLength))} placeholder={field.placeholder} maxLength={field.maxLength} inputMode={field.inputMode || 'text'}/>{errors[key] && <em>{errors[key]}</em>}</label> })}</div>
        <label className="simple-custom-note"><span>NOTE TO THE STUDIO <small>OPTIONAL</small></span><textarea value={note} onChange={event => setNote(event.target.value.slice(0,320))} placeholder="Anything we should know about this request?"/><small>{note.length}/320</small></label>
        <div className="simple-custom-size"><span>SIZE</span><div>{['XS','S','M','L','XL','XXL'].map(item => <button type="button" key={item} className={size === item ? 'is-active' : ''} onClick={() => setSize(item)}>{item}</button>)}</div></div>
        <div className="simple-custom-ai-link"><div><Sparkles size={16}/><span><strong>Want to change more?</strong><small>Use an AI prompt with this listing image as reference.</small></span></div><button type="button" onClick={() => go(`/studio?product=${product.id}`)}>Edit with AI <ArrowRight size={15}/></button></div>
        <div className="simple-custom-submit"><div><span>{product.name} / {values.name || 'YOUR NAME'}</span><strong>{money(product.price)}</strong></div><button type="submit">{saved ? <><Check size={16}/> ADDED TO BAG</> : <>SAVE CUSTOM REQUEST <ArrowRight size={16}/></>}</button><p>We confirm the final artwork before production.</p></div>
      </form>
    </section>
  </main>
}

const money = value => `$${Number(value || 0).toFixed(0)}`
