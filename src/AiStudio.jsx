import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, Lock, Sparkles } from 'lucide-react'
import { products } from './data'

const fieldLabels = { name:'name', number:'number', teamCity:'team / city', year:'year', color:'colour' }

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
  const suggestions = useMemo(() => [
    fields.includes('name') ? 'Change the name to ALEX' : null,
    fields.includes('number') ? 'Change the number to 07' : null,
    fields.includes('teamCity') ? 'Use SAIGON as the team / city' : null,
    fields.includes('year') ? 'Set the year to 2026' : null,
    'Keep the exact jersey silhouette and listing photo'
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
    <header className="ai-studio-head"><button onClick={() => go(`/custom?product=${product.id}`)}><ArrowLeft size={15}/> Back to simple form</button><span><Sparkles size={15}/> AI EDIT / GPT-IMAGE-2</span></header>
    <section className="ai-studio-grid">
      <div className="ai-studio-reference"><div className="ai-studio-reference__top"><span>REFERENCE LOCKED</span><Lock size={14}/></div><figure><img src={product.image} alt={`${product.name} listing reference`}/><figcaption><strong>{product.name}</strong><span>{product.story}</span></figcaption></figure><p><ImageIcon size={14}/> This is the exact main image from the listing. It is sent as the only reference image.</p></div>
      <div className="ai-studio-editor"><div className="ai-studio-editor__intro"><span>OPTIONAL / FOR BIGGER CHANGES</span><h1>DESCRIBE<br/><em>THE SHIFT.</em></h1><p>Use a prompt when the fixed listing fields are not enough. The AI preview is a visual direction, not a print file.</p></div><div className="ai-studio-suggestions"><span>START WITH A SUGGESTION</span><div>{suggestions.map(item => <button type="button" key={item} onClick={() => setPrompt(item)}>{item}<ArrowRight size={13}/></button>)}</div></div><label className="ai-studio-prompt"><span>Your prompt</span><textarea value={prompt} onChange={event => { setPrompt(event.target.value); setError('') }} placeholder="Example: keep this exact jersey, change the back name to ALEX and number to 07, keep all snake texture, logos, light and camera angle unchanged."/><small>{prompt.length}/1200</small></label>{error && <p className="ai-studio-error">{error}</p>}<button className="ai-studio-generate" onClick={generate} disabled={loading}>{loading ? <><Sparkles size={16}/> GENERATING PREVIEW…</> : <><Sparkles size={16}/> GENERATE AI PREVIEW</>}</button>{preview && <div className="ai-studio-result"><div className="ai-studio-result__head"><span><Check size={14}/> Preview ready</span><small>{preview.model || 'gpt-image-2'}</small></div><img src={preview.imageUrl} alt="AI generated listing preview"/><button onClick={() => go(`/custom?product=${product.id}`)}>USE THIS DIRECTION <ArrowRight size={15}/></button></div>}<div className="ai-studio-guard"><Lock size={15}/><span><strong>Reference guard</strong><small>We never replace the listing reference with a customer-uploaded source in this flow.</small></span></div></div>
    </section>
    <section className="ai-studio-bottom"><span>WHAT CAN CHANGE</span><div>{fields.map(key => <span key={key}>{fieldLabels[key] || key}</span>)}</div><p>Or write a completely new direction. The studio keeps the listing image attached so the request stays grounded.</p></section>
  </main>
}
