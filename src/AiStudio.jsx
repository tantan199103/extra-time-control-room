import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, RefreshCw, Sparkles } from 'lucide-react'
import { findStorefrontProduct } from './lib/storefront-model'
import { getCustomerSessionId } from './lib/supabase'

function readDraft(productId) {
  try { return JSON.parse(window.sessionStorage.getItem(`extra-time-pdp-draft-${productId}`) || 'null') || {} } catch { return {} }
}

function go(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top:0, behavior:'instant' })
}

export default function AiStudio({ products = [] }) {
  const params = new URLSearchParams(window.location.search)
  const product = findStorefrontProduct(products, params.get('product') || 'touchline') || products.find(item => item.customFields?.length) || products[0]
  const draft = readDraft(product?.id)
  const fields = product?.customFields || []
  const editable = useMemo(() => fields.map(field => ({
    ...field,
    value:String(draft?.values?.[field.key] || '').trim() || 'keep as shown'
  })), [product?.id, draft?.values])
  const requestedDetails = editable.map(field => `${field.label}: ${field.value}`).join('; ')
  const allowedLabels = editable.map(field => field.label).join(', ')
  const suggestions = useMemo(() => {
    if (!product) return []
    const preserve = `Use the exact published ${product.title || product.name} listing image as the only visual reference. Preserve the jersey silhouette, camera angle, background, official marks, texture, seams, lighting, typography system and designer hierarchy.`
    return [
      { label:'Apply my current details', prompt:`${preserve} Update only these customer-editable areas: ${requestedDetails}. Match the material, scale and alignment already present in the reference. Do not add sponsors, brands or unrelated graphics.` },
      { label:'Make the changes feel integrated', prompt:`${preserve} Apply the allowed details together — ${requestedDetails}. Make every updated print look physically integrated into the garment, following its folds, perspective and lighting. Keep all non-editable artwork exactly unchanged.` },
      { label:'Explore a new limited direction', prompt:`Use the exact published ${product.title || product.name} image as the foundation and keep the product cut, camera framing and official marks recognizable. Propose one coherent limited-edition direction around this customer story: ${draft?.note || 'a football memory after the final whistle'}. Incorporate only the supported details (${allowedLabels}) using these values: ${requestedDetails}. Do not invent sponsors or unrelated objects.` }
    ]
  }, [product?.id, requestedDetails, allowedLabels, draft?.note])
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!product) return <main className="not-found"><span>90+</span><h1>NO LISTING.</h1><p>Open AI editing from a published product.</p><button className="button button--dark" onClick={() => go('/shop')}>BACK TO SHOP</button></main>

  const generate = async () => {
    if (prompt.trim().length < 8) { setError('Describe the change in at least 8 characters.'); return }
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/ai-preview', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sessionId:getCustomerSessionId(), productId:product.id, prompt:prompt.trim() }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'AI preview is not connected yet.')
      setPreview(body)
      try { window.sessionStorage.setItem('extra-time-ai-preview', JSON.stringify({ productId:product.id, previewId:body.previewId, imageUrl:body.imageUrl, storage:body.storage, prompt:prompt.trim(), expiresAt:Date.now() + Number(body.expiresIn || 86400) * 1000 })) } catch {}
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'AI preview failed.') }
    finally { setLoading(false) }
  }

  return <main className="ai-studio-page">
    <header className="ai-studio-head"><button onClick={() => go(`/product/${product.handle || product.id}?custom=1`)}><ArrowLeft size={15}/> Back to product</button><span><Sparkles size={15}/> AI EDIT / GPT-IMAGE-2</span></header>
    <section className="ai-studio-grid">
      <div className="ai-studio-reference"><div className="ai-studio-reference__top"><span>PUBLISHED REFERENCE</span><Lock size={14}/></div><figure><img src={product.image} alt={`${product.name} listing reference`}/><figcaption><strong>{product.name}</strong><span>{product.story}</span></figcaption></figure><p><ImageIcon size={14}/> This exact primary listing image is attached to every request.</p></div>
      <div className="ai-studio-editor"><div className="ai-studio-editor__intro"><span>OPTIONAL / FOR BIGGER CHANGES</span><h1>DESCRIBE<br/><em>THE SHIFT.</em></h1><p>Change several supported areas in one prompt. The designer artwork remains the visual source of truth.</p></div><div className="ai-studio-draft"><span>SUPPORTED DETAILS</span><div>{editable.map(field => <b key={field.key}>{field.label}: {field.value}</b>)}</div></div><div className="ai-studio-suggestions"><span>PROMPT STARTERS FOR THIS LISTING</span><div>{suggestions.map(item => <button type="button" key={item.label} onClick={() => { setPrompt(item.prompt); setError('') }}><span><strong>{item.label}</strong><small>{item.prompt}</small></span><ArrowRight size={13}/></button>)}</div></div><label className="ai-studio-prompt"><span>Your prompt</span><textarea value={prompt} onChange={event => { setPrompt(event.target.value.slice(0,1200)); setError('') }} placeholder={`Describe changes to ${allowedLabels || 'the supported artwork areas'}…`}/><small>{prompt.length}/1200</small></label>{error && <p className="ai-studio-error" role="alert">{error}</p>}<button className="ai-studio-generate" onClick={generate} disabled={loading}>{loading ? <><Sparkles size={16}/> GENERATING PREVIEW…</> : preview ? <><RefreshCw size={16}/> GENERATE ANOTHER DIRECTION</> : <><Sparkles size={16}/> GENERATE AI PREVIEW</>}</button>{preview && <div className="ai-studio-result"><div className="ai-studio-result__head"><span><Check size={14}/> Direction ready</span><small>Stored securely for 24 hours</small></div><div className="ai-studio-compare"><figure><img src={product.image} alt="Published listing before AI edit"/><figcaption>Listing</figcaption></figure><figure><img src={preview.imageUrl} alt="AI generated listing preview"/><figcaption>AI direction</figcaption></figure></div><button onClick={() => go(`/product/${product.handle || product.id}?custom=1`)}>ATTACH TO CUSTOM REQUEST <ArrowRight size={15}/></button></div>}<div className="ai-studio-guard"><Lock size={15}/><span><strong>Preview, then studio review</strong><small>AI output is directional. The final artwork is confirmed before production.</small></span></div></div>
    </section>
    <section className="ai-studio-bottom"><span>WHAT CAN CHANGE</span><div>{fields.map(field => <span key={field.key}>{field.label}</span>)}</div><p>{fields.length ? 'Every starter is generated from the fields enabled for this listing.' : 'This listing has no editable fields.'}</p></section>
  </main>
}
