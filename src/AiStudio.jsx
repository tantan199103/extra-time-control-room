import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, Sparkles } from 'lucide-react'
import { products } from './data'

const fieldLabels = { name:'name', number:'number', teamCity:'team / city', year:'year', color:'colour', printText:'printed message' }

function readDraft(productId) {
  try { return JSON.parse(window.sessionStorage.getItem(`extra-time-pdp-draft-${productId}`) || 'null') || {} } catch { return {} }
}

function draftValue(draft, key, fallback) {
  return draft?.values?.[key] || fallback
}

function go(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top:0, behavior:'instant' })
}

function listingForQuery() {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('product') || 'touchline'
  return products.find(item => item.id === id) || products.find(item => item.id === 'touchline') || products[0]
}

export default function AiStudio() {
  const product = listingForQuery()
  const fields = product.customFields || ['name', 'number']
  const draft = readDraft(product.id)
  const name = draftValue(draft, 'name', 'ALEX')
  const number = draftValue(draft, 'number', '07')
  const teamCity = draftValue(draft, 'teamCity', 'SAIGON')
  const year = draftValue(draft, 'year', '2026')
  const printText = draftValue(draft, 'printText', 'RELENTLESS')
  const suggestions = useMemo(() => [
    { label:'Fill every editable area', prompt:`Use the exact main listing image as the only reference. Keep the jersey silhouette, camera angle, background, logos, snake texture, seams, lighting and designer composition unchanged. Update the editable print areas together: set the back name to ${name}, number to ${number}, team or city text to ${teamCity}, year to ${year}, and the short printed message to ${printText}. Keep every other visual detail exactly as shown. This is a realistic visual preview only.` },
    { label:'Make the back feel personal', prompt:`Use the exact listing image and preserve its original artwork. On the back of the jersey, change the name to ${name} and number to ${number}; add ${teamCity} and ${year} only in the existing editable information areas, with the same scale, alignment, material and lighting as the reference. Keep the logos, typography style, texture, silhouette, folds, camera angle and background untouched. Do not add sponsors or invent graphics.` },
    { label:'Change the printed message too', prompt:`Keep the exact jersey from the listing as the visual source. Apply a coordinated personalization: name ${name}, number ${number}, team/city ${teamCity}, year ${year}, and printed message “${printText}”. Place each change only where the existing artwork already suggests an editable print area. Preserve the designer's typography, hierarchy, composition, effects, texture, logos, seams, lighting and model pose. Return a polished product preview, not a print-ready file.` },
    { label:'Create a new direction', prompt:`Use the exact main listing image as the starting point. Keep the product identity, jersey cut, logos and camera framing recognizable, but propose a new limited-edition direction around this story: ${draft?.note || 'a late-night football memory'}. Change the requested text together — name ${name}, number ${number}, team/city ${teamCity}, year ${year}, printed message ${printText} — while keeping the original texture and designer-led hierarchy. Avoid new brands, sponsors or unrelated objects.` }
  ].filter(Boolean), [fields])
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) { setError('Write what you want to change first.'); return }
    setLoading(true); setError(''); setPreview(null)
    try {
      const response = await fetch('/api/ai-preview', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ productId:product.id, prompt:prompt.trim(), fields }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'AI preview is not connected yet.')
      setPreview(body)
      try { window.sessionStorage.setItem('extra-time-ai-preview', JSON.stringify({ productId:product.id, imageUrl:body.imageUrl, prompt:prompt.trim() })) } catch {}
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'AI preview failed.') }
    finally { setLoading(false) }
  }

  return <main className="ai-studio-page">
    <header className="ai-studio-head"><button onClick={() => go(`/product/${product.id}?custom=1`)}><ArrowLeft size={15}/> Back to product</button><span><Sparkles size={15}/> AI EDIT / GPT-IMAGE-2</span></header>
    <section className="ai-studio-grid">
      <div className="ai-studio-reference"><div className="ai-studio-reference__top"><span>REFERENCE LOCKED</span><Lock size={14}/></div><figure><img src={product.image} alt={`${product.name} listing reference`}/><figcaption><strong>{product.name}</strong><span>{product.story}</span></figcaption></figure><p><ImageIcon size={14}/> This is the exact main image from the listing. It is sent as the only reference image.</p></div>
      <div className="ai-studio-editor"><div className="ai-studio-editor__intro"><span>OPTIONAL / FOR BIGGER CHANGES</span><h1>DESCRIBE<br/><em>THE SHIFT.</em></h1><p>One prompt can update several print areas at once. The listing image stays attached as the single visual reference.</p></div><div className="ai-studio-draft"><span>YOUR CURRENT DETAILS</span><div>{fields.map(key => <b key={key}>{fieldLabels[key] || key}: {draftValue(draft, key, '—')}</b>)}</div></div><div className="ai-studio-suggestions"><span>LONG-FORM STARTERS</span><div>{suggestions.map(item => <button type="button" key={item.label} onClick={() => { setPrompt(item.prompt); setError('') }}><span><strong>{item.label}</strong><small>{item.prompt}</small></span><ArrowRight size={13}/></button>)}</div></div><label className="ai-studio-prompt"><span>Your prompt</span><textarea value={prompt} onChange={event => { setPrompt(event.target.value); setError('') }} placeholder="Example: keep the exact listing image, change the name, number and printed message together…"/><small>{prompt.length}/1200</small></label>{error && <p className="ai-studio-error">{error}</p>}<button className="ai-studio-generate" onClick={generate} disabled={loading}>{loading ? <><Sparkles size={16}/> GENERATING PREVIEW…</> : <><Sparkles size={16}/> GENERATE AI PREVIEW</>}</button>{preview && <div className="ai-studio-result"><div className="ai-studio-result__head"><span><Check size={14}/> Preview ready</span><small>{preview.model || 'gpt-image-2'}</small></div><img src={preview.imageUrl} alt="AI generated listing preview"/><button onClick={() => go(`/product/${product.id}?custom=1`)}>USE THIS DIRECTION <ArrowRight size={15}/></button></div>}<div className="ai-studio-guard"><Lock size={15}/><span><strong>Reference guard</strong><small>We never replace the listing reference with a customer-uploaded source in this flow.</small></span></div></div>
    </section>
    <section className="ai-studio-bottom"><span>WHAT CAN CHANGE</span><div>{fields.map(key => <span key={key}>{fieldLabels[key] || key}</span>)}</div><p>Or write a completely new direction. The studio keeps the listing image attached so the request stays grounded.</p></section>
  </main>
}
