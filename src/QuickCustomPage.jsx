import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Crop, FlipHorizontal2, FlipVertical2, ImagePlus, Layers3, Lock, Minus, Move, Palette, RefreshCw, RotateCw, Save, ScanLine, Sparkles, Trash2, Type, Upload, WandSparkles, ZoomIn } from 'lucide-react'
import { trackStorefrontEvent } from './lib/storefront-analytics'
import { getCustomerSessionId } from './lib/storefront-api'
import { completeArtworkAsset, createArtworkJob, createQuickOrder, getArtworkJob, preflightArtwork, presignArtworkAsset } from './lib/artwork-api'
import { QUICK_DEFAULTS, QUICK_STEPS, QUICK_STYLES, normalizeArtworkAsset, normalizeQuickDraft, normalizeTransform, readQuickDraft, saveQuickDraft } from './lib/quick-artwork-schema'
import { QUICK_PRINT_AREAS, normalizePrintAreas } from './lib/print-areas'

const STEP_LABELS = { source:'Source', direction:'Direction', variants:'Variants', polish:'Polish', product:'Product', review:'Review' }
const PRINT_AREAS = QUICK_PRINT_AREAS

function uid(prefix = 'quick') { return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}` }

function dataUrlFromSvg(label, index, style) {
  const palettes = [['#DFFF3F','#F04F3D','#0B0B0B'], ['#8FD7FF','#F04F3D','#111311'], ['#F8F8F4','#B48CFF','#0B0B0B'], ['#F5C451','#2D70FF','#111311']]
  const colors = palettes[index % palettes.length]
  const safe = String(label || 'YOUR ARTWORK').replace(/[<>&"']/g, '').slice(0, 30)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="${colors[2]}"/><path d="M0 720L340 120l250 360 180-210 230 350v380H0z" fill="${colors[1]}"/><circle cx="760" cy="250" r="150" fill="${colors[0]}"/><path d="M120 820c170-190 420-170 650-20" fill="none" stroke="${colors[0]}" stroke-width="28"/><text x="70" y="900" fill="${colors[0]}" font-family="Arial Black, sans-serif" font-size="58" letter-spacing="4">${safe}</text><text x="74" y="950" fill="${colors[1]}" font-family="Arial, sans-serif" font-size="20" letter-spacing="5">${String(style || 'QUICK AI').toUpperCase()}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function productPrintAreas(product) {
  const customFields = product?.custom_fields || product?.customFields
  const configured = product?.printAreas || product?.print_areas || product?.customization?.printAreas || product?.designerConfig?.printAreas || product?.customization?.print_areas || (customFields && !Array.isArray(customFields) ? customFields.printAreas || customFields.print_areas : null)
  return normalizePrintAreas(configured)
}

function productLabel(product) { return product?.title || product?.name || product?.handle || 'Custom product' }
function productIsOrderable(product) { return String(product?.status || '').toUpperCase() === 'PUBLISHED' && (product?.variants || []).some(variant => String(variant?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(variant.price ?? product?.price ?? 0) > 0 && Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0) > 0) }

function localPreviewVariant(prompt, style, index, sourceUrl = '') {
  const label = prompt ? prompt.split(/\s+/).slice(0, 3).join(' ') : 'YOUR MASCOT'
  return { id:uid('variant'), assetId:uid('asset'), url:sourceUrl || dataUrlFromSvg(label, index, style), name:`Variant ${index + 1}`, seed:Math.floor(Math.random() * 999999), previewOnly:true }
}

function normalizeRemoteVariants(job) {
  if (!job?.variants?.length) return []
  return job.variants.filter(variant => variant?.url || variant?.previewUrl).slice(0, 4).map(variant => {
    const assetId = variant.assetId || variant.asset_id || ''
    const verified = Boolean(variant.verified || variant.status === 'verified' || assetId)
    return { ...variant, url:variant.url || variant.previewUrl, id:variant.id || uid('variant'), assetId:assetId || null, verified, previewOnly:Boolean(variant.previewOnly || variant.status === 'preview-only' || !assetId), name:variant.name || 'AI variant' }
  })
}

function assetFromVariant(variant, { consent = false, source = 'ai-generated', jobId = '' } = {}) {
  return normalizeArtworkAsset({ ...variant, id:variant?.assetId || variant?.id, source, consent, verified:Boolean(variant?.verified || variant?.status === 'verified'), previewOnly:Boolean(variant?.previewOnly || !variant?.assetId), jobId, variantId:variant?.id, name:variant?.name || 'AI artwork' })
}

function FieldLabel({ children, htmlFor }) { return <label className="quick-label" htmlFor={htmlFor}>{children}</label> }

function QuickProgress({ step, onStep }) {
  return <nav className="quick-progress" aria-label="Quick AI progress">{QUICK_STEPS.map((item, index) => <button key={item} type="button" className={item === step ? 'is-active' : index < QUICK_STEPS.indexOf(step) ? 'is-done' : ''} onClick={() => index < QUICK_STEPS.indexOf(step) && onStep(item)}><span>{index < QUICK_STEPS.indexOf(step) ? <Check size={13}/> : String(index + 1).padStart(2, '0')}</span><strong>{STEP_LABELS[item]}</strong></button>)}</nav>
}

function ArtworkSourcePanel({ prompt, setPrompt, sourceAsset, onUpload, consent, setConsent }) {
  const inputRef = useRef(null)
  return <section className="quick-source-panel">
    <div className="quick-section-intro"><span className="quick-kicker">01 / source</span><h2>Start with a thought<br/><em>or something real.</em></h2><p>Give the studio a direction, a reference image, or both. Your artwork stays private while you work.</p></div>
    <div className="quick-source-grid">
      <div className="quick-prompt-block"><FieldLabel htmlFor="quick-prompt">What should we make?</FieldLabel><textarea id="quick-prompt" value={prompt} onChange={event => setPrompt(event.target.value.slice(0, 1200))} placeholder="Turn my dog into a retro baseball mascot…" rows={6}/><div className="quick-prompt-examples"><button type="button" onClick={() => setPrompt('Turn my dog into a retro baseball mascot.')}>Pet mascot</button><button type="button" onClick={() => setPrompt('Create gothic ink artwork for a black tee.')}>Gothic ink</button><button type="button" onClick={() => setPrompt('Make a collegiate sports poster from this photo.')}>Sports poster</button></div><small>{prompt.length}/1200 · Names, numbers and slogans become editable text layers later.</small></div>
      <div className={`quick-upload-block${sourceAsset ? ' has-file' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onUpload(event.dataTransfer.files?.[0]) }}><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={event => onUpload(event.target.files?.[0])}/>{sourceAsset ? <><img src={sourceAsset.url} alt="Reference upload preview"/><button type="button" className="quick-upload-replace" onClick={() => inputRef.current?.click()}><RefreshCw size={14}/> Replace reference</button></> : <button type="button" onClick={() => inputRef.current?.click()}><Upload size={23}/><strong>Drop an image here</strong><span>or choose a photo · PNG, JPG, WebP</span><small>Camera upload works on mobile</small></button>}</div>
    </div>
    <label className="quick-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I own this image or have permission to use it. I understand artwork may be reviewed for safe production.</span><Lock size={14}/></label>
  </section>
}

function DirectionPanel({ settings, setSettings }) {
  const patch = update => setSettings(current => ({ ...current, ...update }))
  return <section className="quick-direction-panel"><div className="quick-section-intro"><span className="quick-kicker">02 / direction</span><h2>Give it a<br/><em>point of view.</em></h2><p>Choose a visual language, then keep the details you care about under control.</p></div><div className="quick-direction-workbench"><div className="quick-style-grid">{QUICK_STYLES.map(style => <button type="button" key={style.id} className={settings.style === style.id ? 'is-active' : ''} onClick={() => patch({ style:style.id })}><span className={`quick-style-swatch quick-style-swatch--${style.id}`}/><strong>{style.label}</strong><small>{style.detail}</small></button>)}</div><div className="quick-control-grid"><label><span>Aspect</span><select value={settings.aspect} onChange={event => patch({ aspect:event.target.value })}><option value="square">Square</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label><span>Palette</span><select value={settings.palette} onChange={event => patch({ palette:event.target.value })}><option value="auto">Auto</option><option value="monochrome">Monochrome</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="brand">Jersevo signal</option><option value="custom">Custom</option></select></label><label><span>Color count</span><select value={settings.colorCount} onChange={event => patch({ colorCount:event.target.value })}><option value="full">Full color</option><option value="3">3 colors</option><option value="5">5 colors</option><option value="8">8 colors</option></select></label><label><span>Variants <b>{settings.variants}</b></span><input type="range" min="1" max="4" step="1" value={settings.variants} onChange={event => patch({ variants:Number(event.target.value) })}/></label><label className="quick-range-wide"><span>Creative strength <b>{Math.round(settings.strength * 100)}%</b></span><input type="range" min="0" max="1" step=".01" value={settings.strength} onChange={event => patch({ strength:Number(event.target.value) })}/></label><label className="quick-toggle"><input type="checkbox" checked={settings.preserveSubject} onChange={event => patch({ preserveSubject:event.target.checked })}/><span>Preserve subject</span></label><label className="quick-toggle"><input type="checkbox" checked={settings.preserveText} onChange={event => patch({ preserveText:event.target.checked })}/><span>Preserve reference text</span></label></div></div></section>
}

function VariantGrid({ variants, selected, onSelect, onRemix, onRegenerate }) {
  return <section className="quick-variants-panel"><div className="quick-section-intro quick-section-intro--row"><div><span className="quick-kicker">03 / variants</span><h2>Pick the frame<br/><em>that feels right.</em></h2></div><p>Every result keeps its prompt, style and seed so you can remix without losing the thread.</p></div><div className="quick-variant-grid">{variants.map((variant, index) => <article key={variant.id} className={selected?.id === variant.id ? 'is-selected' : ''}><div className="quick-variant-media"><img src={variant.url} alt={`${variant.name} artwork`} /><span>V{index + 1}</span>{selected?.id === variant.id && <b><Check size={13}/> Selected</b>}</div><div className="quick-variant-meta"><strong>{variant.name}</strong><small>Seed {variant.seed || '—'} · {variant.previewOnly ? 'Preview mode' : 'AI job'}</small><div><button type="button" onClick={() => onSelect(variant)}>{selected?.id === variant.id ? 'Using this' : 'Use this'}</button><button type="button" onClick={() => onRemix(variant)} aria-label={`Remix ${variant.name}`}><RefreshCw size={14}/> Remix</button><button type="button" onClick={() => onRegenerate(variant)} aria-label={`Regenerate ${variant.name}`}><WandSparkles size={14}/> Regenerate</button></div></div></article>)}</div></section>
}

function ArtworkCanvas({ asset, transform, adjustments, onTransform, onAdjustment }) {
  const dragRef = useRef(null)
  const patch = update => onTransform(normalizeTransform({ ...transform, ...update }))
  const filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`
  const startDrag = event => {
    if (event.button !== undefined && event.button !== 0) return
    const canvas = event.currentTarget.parentElement
    if (!canvas) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, x:transform.x, y:transform.y, width:canvas.clientWidth || 1, height:canvas.clientHeight || 1 }
  }
  const moveDrag = event => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    patch({ x:drag.x + (event.clientX - drag.startX) / drag.width, y:drag.y + (event.clientY - drag.startY) / drag.height })
  }
  const stopDrag = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
  }
  const moveWithKeyboard = event => {
    const amount = event.shiftKey ? .05 : .01
    const moves = { ArrowLeft:{ x:transform.x - amount }, ArrowRight:{ x:transform.x + amount }, ArrowUp:{ y:transform.y - amount }, ArrowDown:{ y:transform.y + amount } }
    if (!moves[event.key]) return
    event.preventDefault()
    patch(moves[event.key])
  }
  return <div className="quick-canvas-shell"><div className="quick-canvas-toolbar"><span><ScanLine size={15}/> Safe area · 320 × 400 mm</span><span>Front / 300 DPI target</span></div><div className="quick-canvas" style={{ aspectRatio:'1 / 1' }}><div className="quick-safe-area"/><div className="quick-canvas-art" role="img" aria-label="Artwork on print canvas; drag to reposition" tabIndex="0" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onKeyDown={moveWithKeyboard} style={{ left:`${transform.x * 100}%`, top:`${transform.y * 100}%`, width:`${transform.width * 100}%`, height:`${transform.height * 100}%`, transform:`translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale * (transform.flipX ? -1 : 1)}, ${transform.scale * (transform.flipY ? -1 : 1)})`, opacity:transform.opacity, filter }}><img src={asset?.url} alt="" draggable="false"/></div><span className="quick-canvas-hint"><Move size={13}/> Drag, then refine in the inspector</span></div><div className="quick-transform-strip" aria-label="Artwork transform tools"><button type="button" aria-label="Scale artwork down" title="Scale artwork down" onClick={() => patch({ scale:transform.scale - .05 })}><Minus size={14}/></button><span aria-live="polite">{Math.round(transform.scale * 100)}%</span><button type="button" aria-label="Scale artwork up" title="Scale artwork up" onClick={() => patch({ scale:transform.scale + .05 })}><ZoomIn size={14}/></button><button type="button" aria-label="Rotate artwork left 5 degrees" title="Rotate artwork left 5 degrees" onClick={() => patch({ rotation:transform.rotation - 5 })}><RotateCw size={14}/></button><button type="button" aria-label="Flip artwork horizontally" title="Flip artwork horizontally" onClick={() => patch({ flipX:!transform.flipX })}><FlipHorizontal2 size={14}/></button><button type="button" aria-label="Flip artwork vertically" title="Flip artwork vertically" onClick={() => patch({ flipY:!transform.flipY })}><FlipVertical2 size={14}/></button></div></div>
}

function Inspector({ transform, adjustments, onTransform, onAdjustment, onAction }) {
  const patch = update => onTransform(normalizeTransform({ ...transform, ...update }))
  const adjust = update => onAdjustment(current => ({ ...current, ...update }))
  return <aside className="quick-inspector"><div className="quick-inspector-head"><span><Layers3 size={15}/> Artwork layer</span><Lock size={14}/></div><div className="quick-inspector-section"><strong>Transform</strong><label><span>Scale <b>{Math.round(transform.scale * 100)}%</b></span><input type="range" min=".2" max="2.5" step=".01" value={transform.scale} onChange={event => patch({ scale:Number(event.target.value) })}/></label><label><span>Position X</span><input type="range" min="0" max="1" step=".01" value={transform.x} onChange={event => patch({ x:Number(event.target.value) })}/></label><label><span>Position Y</span><input type="range" min="0" max="1" step=".01" value={transform.y} onChange={event => patch({ y:Number(event.target.value) })}/></label><label><span>Rotate <b>{Math.round(transform.rotation)}°</b></span><input type="range" min="-180" max="180" value={transform.rotation} onChange={event => patch({ rotation:Number(event.target.value) })}/></label></div><div className="quick-inspector-section"><strong>Polish</strong><label><span>Brightness</span><input type="range" min="-100" max="100" value={adjustments.brightness} onChange={event => adjust({ brightness:Number(event.target.value) })}/></label><label><span>Contrast</span><input type="range" min="-100" max="100" value={adjustments.contrast} onChange={event => adjust({ contrast:Number(event.target.value) })}/></label><label><span>Saturation</span><input type="range" min="-100" max="100" value={adjustments.saturation} onChange={event => adjust({ saturation:Number(event.target.value) })}/></label></div><div className="quick-inspector-actions"><button type="button" onClick={() => onAction('removeBackground')}><Sparkles size={14}/> Remove background</button><button type="button" onClick={() => onAction('cleanup')}><ScanLine size={14}/> Cleanup edges</button><button type="button" onClick={() => onAction('upscale')}><ZoomIn size={14}/> Upscale 2×</button><button type="button" onClick={() => onAction('crop')}><Crop size={14}/> Crop image</button></div></aside>
}

function PolishPanel({ asset, transform, setTransform, adjustments, setAdjustments, onAction }) {
  const [tool, setTool] = useState('artwork')
  return <section className="quick-polish-panel"><div className="quick-section-intro quick-section-intro--row"><div><span className="quick-kicker">04 / polish</span><h2>Make it print<br/><em>like you mean it.</em></h2></div><p>Work in a safe-area canvas. Type, names and numbers stay editable instead of becoming unreliable AI pixels.</p></div><div className="quick-workbench"><nav className="quick-tool-rail" aria-label="Artwork tools"><button type="button" className={tool === 'upload' ? 'is-active' : ''} onClick={() => setTool('upload')}><Upload size={16}/><span>Upload</span></button><button type="button" className={tool === 'ai' ? 'is-active' : ''} onClick={() => setTool('ai')}><Sparkles size={16}/><span>AI polish</span></button><button type="button" className={tool === 'layers' ? 'is-active' : ''} onClick={() => setTool('layers')}><Layers3 size={16}/><span>Layers</span></button><button type="button" className={tool === 'type' ? 'is-active' : ''} onClick={() => setTool('type')}><Type size={16}/><span>Text layer</span></button></nav><ArtworkCanvas asset={asset} transform={transform} adjustments={adjustments} onTransform={setTransform} onAdjustment={setAdjustments}/><Inspector transform={transform} adjustments={adjustments} onTransform={setTransform} onAdjustment={setAdjustments} onAction={onAction}/></div></section>
}

function ProductSurfacePicker({ products, product, setProduct, surface, setSurface, variantId, setVariantId }) {
  const eligible = products.filter(item => productPrintAreas(item).length)
  const variants = (product?.variants || []).filter(item => String(item?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(item.inventory || 0) - Number(item.reserved_inventory || 0) > 0)
  const variantLabel = variant => Object.values(variant?.values || variant?.option_values || {}).filter(Boolean).join(' · ') || variant?.sku || variant?.id || 'Available size'
  return <section className="quick-product-panel"><div className="quick-section-intro quick-section-intro--row"><div><span className="quick-kicker">05 / product</span><h2>Choose where<br/><em>it will live.</em></h2></div><p>Only published products with a verified print area can move to checkout. Preview-only products can still save your artwork.</p></div><div className="quick-product-layout"><div className="quick-product-list">{eligible.length ? eligible.map(item => <button type="button" key={item.id || item.handle} className={product?.id === item.id ? 'is-active' : ''} onClick={() => { setProduct(item); setVariantId(item.variants?.find(variant => String(variant?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0) > 0)?.id || ''); setSurface(productPrintAreas(item)[0]?.id || 'front') }}><span className="quick-product-thumb">{item.image ? <img src={item.image} alt=""/> : <ShirtGlyph/>}</span><span><strong>{productLabel(item)}</strong><small>{productPrintAreas(item).length} print surfaces · {productIsOrderable(item) ? 'Orderable' : 'Preview only'}</small></span><ArrowRight size={15}/></button>) : <div className="quick-empty-product"><Palette size={22}/><strong>No print-ready product is published yet.</strong><p>Your artwork remains safe in this draft. Product selection will unlock when a listing includes printAreas, price and stock.</p></div>}</div><div className="quick-surface-panel"><span className="quick-label">Print surface</span><div className="quick-surface-grid">{(product ? productPrintAreas(product) : PRINT_AREAS).map(area => <button type="button" key={area.id} className={surface === area.id ? 'is-active' : ''} onClick={() => setSurface(area.id)}><span>{area.label}</span><small>{area.widthMm} × {area.heightMm} mm</small></button>)}</div>{product && <label className="quick-variant-select"><span className="quick-label">Size / colour</span><select value={variantId || variants[0]?.id || ''} onChange={event => setVariantId(event.target.value)} disabled={!variants.length}><option value="">{variants.length ? 'Select an available size' : 'No in-stock variant'}</option>{variants.map(item => <option key={item.id} value={item.id}>{variantLabel(item)}{item.price ? ` · $${item.price}` : ''}</option>)}</select></label>}<div className="quick-product-preview"><div className="quick-product-shirt"><ShirtGlyph/><span className="quick-print-marker">{surface.replace('-', ' ')}</span></div><p>Artwork preview uses the selected print area and safe-area inset.</p></div></div></div></section>
}

function ShirtGlyph() { return <svg viewBox="0 0 160 180" aria-hidden="true"><path d="M45 22L67 10h26l22 12 30 18-18 32-16-8v97H49V64l-16 8L15 40z" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M67 10c1 18 25 18 26 0" fill="none" stroke="currentColor" strokeWidth="3"/></svg> }

function PreflightPanel({ result, running, onRun, onContinue }) {
  const issues = result?.issues || []
  return <section className="quick-review-panel"><div className="quick-section-intro quick-section-intro--row"><div><span className="quick-kicker">06 / review</span><h2>One last<br/><em>production check.</em></h2></div><p>Errors block checkout. Warnings stay visible so you can choose with context.</p></div><div className="quick-review-grid"><div className="quick-preflight"><div className="quick-preflight-head"><span>Preflight</span><strong className={result?.ok ? 'is-pass' : result ? 'is-warning' : ''}>{result?.ok ? 'PASS' : result ? 'REVIEW' : 'NOT RUN'}</strong></div>{issues.length ? issues.map((issue, index) => <div className={`quick-issue is-${issue.level || 'warning'}`} key={`${issue.code || 'issue'}-${index}`}><span>{issue.level === 'error' ? '!' : issue.level === 'pass' ? '✓' : 'i'}</span><p><strong>{issue.title || issue.code || 'Artwork check'}</strong><small>{issue.message}</small></p></div>) : <div className="quick-issue is-pass"><span>✓</span><p><strong>Ready to check</strong><small>Run preflight to validate safe area, DPI, consent and product support.</small></p></div>}<button type="button" className="button button--dark quick-preflight-run" onClick={onRun} disabled={running}>{running ? 'CHECKING…' : 'RUN PREFLIGHT'} <ScanLine size={15}/></button></div><div className="quick-order-summary"><span className="quick-label">Order summary</span><dl><div><dt>Artwork</dt><dd>{result?.assetName || 'Selected variant'}</dd></div><div><dt>Surface</dt><dd>{result?.surfaceLabel || 'Front'}</dd></div><div><dt>Print size</dt><dd>{result?.printSize || '320 × 400 mm'}</dd></div><div><dt>Price</dt><dd>{result?.price ? `$${result.price}` : 'Shown at product selection'}</dd></div></dl><button type="button" className="button button--acid" disabled={!result?.ok} onClick={onContinue}>ADD TO BAG <ArrowRight size={15}/></button><small className="quick-order-note">Cart receives a verified asset ID, never image bytes.</small></div></div></section>
}

export default function QuickCustomPage({ products = [], onNavigate, onAdd }) {
  const persisted = useMemo(() => readQuickDraft(), [])
  const [step, setStep] = useState('source')
  const [prompt, setPrompt] = useState('')
  const [sourceAsset, setSourceAsset] = useState(null)
  const [pendingUpload, setPendingUpload] = useState(null)
  const [consent, setConsent] = useState(false)
  const [settings, setSettings] = useState({ ...QUICK_DEFAULTS })
  const [variants, setVariants] = useState(() => persisted?.variants || [])
  const [selectedVariant, setSelectedVariant] = useState(() => persisted?.variants?.find(item => item.id === persisted.selectedVariantId) || persisted?.variants?.[0] || null)
  const [asset, setAsset] = useState(() => persisted?.assetId && persisted?.assetUrl ? normalizeArtworkAsset({ id:persisted.assetId, url:persisted.assetUrl, name:persisted.assetName, verified:persisted.assetVerified, previewOnly:persisted.assetPreviewOnly }) : null)
  const [transform, setTransform] = useState(normalizeTransform(persisted?.transform))
  const [adjustments, setAdjustments] = useState(persisted?.adjustments || { brightness:0, contrast:0, saturation:0 })
  const [product, setProduct] = useState(null)
  const [surface, setSurface] = useState(persisted?.surfaceId || 'front')
  const [variantId, setVariantId] = useState(persisted?.variantId || '')
  const [jobStatus, setJobStatus] = useState(persisted?.jobStatus === 'queued' || persisted?.jobStatus === 'running' ? persisted.jobStatus : 'idle')
  const [jobId, setJobId] = useState(persisted?.jobId || '')
  const [jobError, setJobError] = useState('')
  const [preflight, setPreflight] = useState(null)
  const [preflightRunning, setPreflightRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const activeJobRef = useRef('')

  useEffect(() => { trackStorefrontEvent('quick_ai_started', { source:'custom_quick' }) }, [])
  useEffect(() => {
    if (!persisted) return
    setPrompt(persisted.lineage?.prompt || '')
    setSettings(current => ({ ...current, ...(persisted.settings || {}) }))
    setSurface(persisted.surfaceId || 'front')
    if (persisted.step && persisted.step !== 'source') setStep(persisted.step)
  }, [persisted])
  useEffect(() => {
    if (product || !products.length) return
    const preferred = products.find(item => /tshirts-basic/i.test(`${item?.id || ''} ${item?.handle || ''}`) && productPrintAreas(item).length)
      || products.find(item => productPrintAreas(item).length)
    if (preferred) {
      setProduct(preferred)
      setVariantId(preferred.variants?.find(variant => String(variant?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(variant.inventory || 0) - Number(variant.reserved_inventory || 0) > 0)?.id || '')
      setSurface(productPrintAreas(preferred)[0]?.id || 'front')
    }
  }, [products, product])
  useEffect(() => {
    if (!asset && !jobId) return
    saveQuickDraft(normalizeQuickDraft({ assetId:asset?.id || persisted?.assetId, assetUrl:asset?.url || persisted?.assetUrl, assetName:asset?.name || persisted?.assetName, assetVerified:Boolean(asset?.verified), assetPreviewOnly:Boolean(asset?.previewOnly), jobId, jobStatus, step, variants, selectedVariantId:selectedVariant?.id || '', transform, adjustments, surfaceId:surface, productId:product?.id, variantId, consent, settings, lineage:{ prompt, style:settings.style } }))
  }, [asset, jobId, jobStatus, step, variants, selectedVariant, transform, adjustments, surface, product, variantId, consent, settings, prompt, persisted])
  useEffect(() => {
    // A refresh can interrupt the client-side polling loop. Reattach to the
    // durable server job so a completed result remains recoverable.
    if (!jobId || !['queued', 'running'].includes(jobStatus) || activeJobRef.current === jobId) return undefined
    let active = true
    const recover = async () => {
      let current = { id:jobId, status:jobStatus }
      for (let attempt = 0; attempt < 20 && active && ['queued', 'running'].includes(current.status); attempt += 1) {
        try { current = await getArtworkJob(jobId) } catch { current = { ...current, error:'The artwork job is still running. Refresh this draft to check it again.' }; break }
        if (['queued', 'running'].includes(current.status)) await new Promise(resolve => setTimeout(resolve, 900))
      }
      if (!active) return
      if (current.status === 'succeeded') {
        const recovered = normalizeRemoteVariants(current)
        if (recovered.length) {
          const first = recovered[0]
          setVariants(recovered); setSelectedVariant(first); setAsset(assetFromVariant(first, { consent, jobId })); setJobStatus('succeeded'); setJobError(''); setStep('variants'); activeJobRef.current = jobId
        } else { setJobStatus('failed'); setJobError('The artwork job completed without a usable preview.') }
      } else if (current.status === 'failed' || current.status === 'cancelled') {
        setJobStatus('failed'); setJobError(current.error || (current.status === 'cancelled' ? 'The artwork job was cancelled.' : 'The artwork job failed. Retry when the provider is available.'))
      } else if (current.error) setJobError(current.error)
    }
    recover()
    return () => { active = false }
  }, [jobId, jobStatus, consent])

  useEffect(() => {
    if (!consent || !pendingUpload) return undefined
    let active = true
    completeArtworkAsset({ ...pendingUpload, consent:true })
      .then(verified => {
        if (!active) return
        setSourceAsset(current => current ? normalizeArtworkAsset({ ...current, ...verified, id:verified.id || pendingUpload.id, storageKey:verified.storageKey || pendingUpload.storageKey, url:verified.url || current.url, consent:true, verified:true }) : current)
        setPendingUpload(null)
        setNotice('Reference verified in a private artwork slot. You can generate now.')
      })
      .catch(error => {
        if (active) setNotice(error.message || 'The secure artwork upload could not be verified yet.')
      })
    return () => { active = false }
  }, [consent, pendingUpload])

  const upload = file => {
    if (!file || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) { setNotice('Choose a PNG, JPG or WebP image.'); return }
    if (file.size > 12 * 1024 * 1024) { setNotice('Reference images must be smaller than 12 MB.'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      const next = normalizeArtworkAsset({ id:uid('asset'), mime:file.type, source:'upload', consent:false, private:true, verified:false, name:file.name, url:String(reader.result) })
      setSourceAsset(next); setNotice('Reference ready. Confirm permission before generating.')
      try {
        const ticket = await presignArtworkAsset({ sessionId:getCustomerSessionId(), mime:file.type, size:file.size, name:file.name })
        const uploadResponse = await fetch(ticket.uploadUrl, { method:'PUT', headers:{ 'Content-Type':file.type, ...(ticket.token ? { 'x-upsert':'false' } : {}) }, body:file })
        if (!uploadResponse.ok) throw new Error('upload-failed')
        const pending = { sessionId:getCustomerSessionId(), id:ticket.id, storageKey:ticket.storageKey, mime:file.type, size:file.size, source:'upload', name:file.name }
        setPendingUpload(pending)
        setSourceAsset(current => current ? normalizeArtworkAsset({ ...current, ...pending, id:ticket.id, storageKey:ticket.storageKey, verified:false, consent:false }) : current)
        setNotice(consent ? 'Reference uploaded. Verifying the private artwork slot…' : 'Reference uploaded to a private artwork slot. Confirm permission before generating.')
      } catch { /* The local preview remains available, but uploaded artwork stays unverified. */ }
    }
    reader.readAsDataURL(file)
  }

  const generate = async (type = 'generate', remixVariant = null) => {
    if (!prompt.trim() && !sourceAsset) { setNotice('Add a prompt, upload an image, or do both.'); setStep('source'); return }
    if (sourceAsset && !consent) { setNotice('Confirm you have permission to use the uploaded image.'); setStep('source'); return }
    if (sourceAsset && !sourceAsset.verified) { setNotice('Finish verifying the private upload before using it as an AI reference.'); setStep('source'); return }
    setJobStatus('running'); setJobError(''); setNotice('')
    let remoteJob = null
    let remoteVariants = null
    let remoteFailure = ''
    try { remoteJob = await createArtworkJob({ sessionId:getCustomerSessionId(), type, prompt, style:settings.style, sourceAssetIds:sourceAsset ? [sourceAsset.id] : [], params:settings, variants:settings.variants, lineage:remixVariant ? { parentVariantId:remixVariant.id } : undefined }) } catch { /* Local preview keeps the prompt-only flow usable while the worker is unavailable. */ }
    if (remoteJob?.id) { activeJobRef.current = remoteJob.id; setJobId(remoteJob.id) }
    else { activeJobRef.current = ''; setJobId('') }
    if (remoteJob?.status === 'queued' || remoteJob?.status === 'running') {
      let current = remoteJob
      for (let attempt = 0; attempt < 20 && ['queued','running'].includes(current.status); attempt += 1) { await new Promise(resolve => setTimeout(resolve, 900)); try { current = await getArtworkJob(remoteJob.id) } catch { remoteFailure = 'The artwork job is still running. Refresh this draft to check it again.'; break } }
      if (current.status === 'succeeded') remoteVariants = normalizeRemoteVariants(current)
      else if (current.status === 'failed') remoteFailure = current.error || 'The artwork job failed. Retry when the provider is available.'
      else if (current.status === 'cancelled') remoteFailure = 'The artwork job was cancelled.'
      else if (!remoteFailure) remoteFailure = 'The artwork job is still running. Refresh this draft to check it again.'
    }
    if (remoteJob && !remoteVariants) {
      setJobStatus(remoteFailure.startsWith('The artwork job failed') ? 'failed' : 'running')
      setJobError(remoteFailure)
      return
    }
    const nextVariants = remoteVariants || Array.from({ length:settings.variants }, (_, index) => localPreviewVariant(prompt, settings.style, index, sourceAsset?.url || ''))
    const firstVariant = nextVariants[0]
    setVariants(nextVariants); setSelectedVariant(firstVariant); setAsset(assetFromVariant({ ...firstVariant, name:`${settings.style} artwork` }, { source:type === 'remix' ? 'remix' : 'ai-generated', consent, jobId:remoteJob?.id || '' })); setJobStatus('succeeded'); setStep('variants'); if (!remoteJob) setNotice('Preview mode: connect the artwork worker to create a verified print asset.'); trackStorefrontEvent('quick_ai_variants_ready', { count:settings.variants, style:settings.style, has_reference:Boolean(sourceAsset) })
  }

  const selectVariant = variant => { setSelectedVariant(variant); setAsset(assetFromVariant(variant, { source:variant.source || 'ai-generated', consent, jobId:jobId || '' })) }
  const polish = action => { setNotice(`${action === 'removeBackground' ? 'Background removal' : action === 'upscale' ? '2× upscale' : action === 'cleanup' ? 'Edge cleanup' : 'Crop'} queued for this artwork.`); setAdjustments(current => action === 'removeBackground' ? { ...current, backgroundRemoved:true } : current) }
  const runPreflight = async () => {
    if (!asset) { setNotice('Select an artwork variant first.'); return }
    setPreflightRunning(true); setNotice('')
    const area = (product ? productPrintAreas(product) : PRINT_AREAS).find(item => item.id === surface) || PRINT_AREAS[0]
    let result = null
    try { result = await preflightArtwork({ sessionId:getCustomerSessionId(), productId:product?.id || product?.handle || '', assetId:asset.id, transform, adjustments, surfaceId:surface, printArea:area, consent }) } catch {}
    const localIssues = []
    if (sourceAsset && !consent) localIssues.push({ level:'error', code:'consent', title:'Image permission is missing', message:'Confirm that you own or can use every uploaded reference.' })
    if (!asset.verified && !asset.previewOnly) localIssues.push({ level:'warning', code:'asset', title:'Asset verification pending', message:'The secure asset worker has not confirmed this file yet.' })
    if (transform.width * transform.scale > 1 || transform.height * transform.scale > 1) localIssues.push({ level:'error', code:'bounds', title:'Artwork exceeds the print area', message:'Reduce scale or move the artwork inside the safe area.' })
    if (!product) localIssues.push({ level:'warning', code:'product', title:'Preview-only draft', message:'Choose a published product with printAreas before ordering.' })
    else if (!productIsOrderable(product)) localIssues.push({ level:'warning', code:'listing', title:'Product is preview-only', message:'This listing needs a published price and in-stock variant before checkout can open.' })
    const selectedProductVariant = product?.variants?.find(item => item.id === variantId) || null
    if (product && !selectedProductVariant) localIssues.push({ level:'error', code:'variant', title:'Choose a size and colour', message:'Select an in-stock variant before sending artwork to print.' })
    if (product && selectedProductVariant && (String(selectedProductVariant.status || 'ACTIVE').toUpperCase() !== 'ACTIVE' || Number(selectedProductVariant.inventory || 0) - Number(selectedProductVariant.reserved_inventory || 0) < 1)) localIssues.push({ level:'error', code:'variant-stock', title:'Selected variant is unavailable', message:'Choose another in-stock size or colour.' })
    const serverIssues = Array.isArray(result?.issues) ? result.issues : []
    const issueKeys = new Set()
    const mergedIssues = [...serverIssues, ...localIssues].filter(item => { const key = `${item.code || item.title || 'issue'}:${item.level || 'warning'}`; if (issueKeys.has(key)) return false; issueKeys.add(key); return true })
    const merged = { ...(result || {}), ok:Boolean(result?.ok !== false) && mergedIssues.every(item => item.level !== 'error'), issues:mergedIssues }
    if (!product || !productIsOrderable(product) || !asset.verified || !selectedProductVariant) merged.ok = false
    if (!merged.issues?.length && merged.ok !== false) merged.issues = [{ level:'pass', code:'ready', title:'Artwork is ready for review', message:'No blocking issues were found in this pass.' }]
    setPreflight({ ...merged, assetName:asset.name, surfaceLabel:area.label, printSize:`${area.widthMm} × ${area.heightMm} mm`, price:selectedProductVariant?.price || product?.price, variantId:variantId || selectedProductVariant?.id || '', variantLabel:selectedProductVariant ? Object.values(selectedProductVariant.values || selectedProductVariant.option_values || {}).filter(Boolean).join(' · ') : '' })
    trackStorefrontEvent('quick_ai_preflight', { ok:Boolean(merged.ok), issue_count:merged.issues?.length || 0, product_id:product?.id || '' })
    setPreflightRunning(false)
  }
  const handoff = () => {
    try {
      const verifiedAssetId = asset?.verified && !asset?.previewOnly ? asset.id : ''
      localStorage.setItem('custom-quick-handoff-v1', JSON.stringify({
        ...(verifiedAssetId ? { assetId:verifiedAssetId } : {}),
        assetUrl:asset?.url || '', name:asset?.name, source:'quick-ai',
        transform:{ ...transform, x:(transform.x - .5) * 2, y:(transform.y - .5) * 2 },
        lineage:{ prompt, style:settings.style }
      }))
    } catch {}
    trackStorefrontEvent('quick_ai_handoff', { asset_id:asset?.id || '', style:settings.style })
    onNavigate?.('/custom/design?provider=studio&product=cycling-c3&quick=1')
  }
  const addToBag = async () => {
    if (!preflight?.ok || !product || !asset?.verified) return
    try {
      const variant = product.variants?.find(item => item.id === variantId) || product.variants?.find(item => String(item?.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Number(item.inventory || 0) - Number(item.reserved_inventory || 0) > 0)
      if (!variant) throw new Error('Select an in-stock size and colour before adding the artwork to the bag.')
      const result = await createQuickOrder({ sessionId:getCustomerSessionId(), productId:product.id || product.handle, variantId:variant.id, surfaceId:surface, assetId:asset.id, transform, adjustments, lineage:{ prompt, style:settings.style }, consent:true, idempotencyKey:uid('quick_order') })
      onAdd?.(product, { variant, options:variant.values || variant.option_values || {}, customization:{ requestId:result?.order?.id || result?.id || '', fields:{ artworkAssetId:asset.id }, note:'Quick AI artwork attached for studio review.' } })
      setNotice(result?.order ? `Draft order ${result.order.id} is ready for the bag.` : 'Artwork order saved.')
    } catch (error) { setNotice(error.message || 'The artwork order is not ready yet.') }
  }
  const canContinue = step === 'source' ? Boolean(prompt.trim() || sourceAsset) : step === 'direction' ? Boolean(settings.style) : step === 'variants' ? Boolean(asset) : step === 'polish' ? Boolean(asset) : step === 'product' ? Boolean(asset) : Boolean(asset)
  const advance = () => { if (step === 'source') setStep('direction'); else if (step === 'direction') generate(); else if (step === 'variants') setStep('polish'); else if (step === 'polish') setStep('product'); else if (step === 'product') setStep('review'); else runPreflight() }
  const back = () => { const index = QUICK_STEPS.indexOf(step); if (index > 0) setStep(QUICK_STEPS[index - 1]) }

  return <main className="quick-custom-page"><header className="quick-page-header"><button type="button" className="quick-back-link" onClick={() => onNavigate?.('/custom')}><ArrowLeft size={15}/> Custom studio</button><div><span className="quick-brand-mark">JERSEVO / QUICK AI</span><strong>Artwork workbench</strong></div><button type="button" className="quick-save-link" onClick={() => { if (asset) saveQuickDraft({ assetId:asset.id, assetUrl:asset.url, transform, adjustments, surfaceId:surface, productId:product?.id, variantId, consent, settings, lineage:{ prompt, style:settings.style } }); setNotice('Draft saved on this device.') }}><Save size={15}/> Save draft</button></header><QuickProgress step={step} onStep={setStep}/><div className="quick-page-body">{step === 'source' && <ArtworkSourcePanel prompt={prompt} setPrompt={setPrompt} sourceAsset={sourceAsset} onUpload={upload} consent={consent} setConsent={setConsent}/>} {step === 'direction' && <DirectionPanel settings={settings} setSettings={setSettings}/>} {step === 'variants' && <VariantGrid variants={variants} selected={selectedVariant} onSelect={selectVariant} onRemix={variant => generate('remix', variant)} onRegenerate={() => generate('generate')}/>} {step === 'polish' && asset && <PolishPanel asset={asset} transform={transform} setTransform={setTransform} adjustments={adjustments} setAdjustments={setAdjustments} onAction={polish}/>} {step === 'product' && <ProductSurfacePicker products={products} product={product} setProduct={setProduct} surface={surface} setSurface={setSurface} variantId={variantId} setVariantId={setVariantId}/>} {step === 'review' && <PreflightPanel result={preflight} running={preflightRunning} onRun={runPreflight} onContinue={addToBag} />} {jobStatus === 'running' && <div className="quick-job-status" role="status"><Sparkles size={15}/> Generating variants… this draft survives a refresh.</div>} {jobError && <div className="quick-job-error" role="alert">{jobError} <button type="button" onClick={() => generate('generate')}>Retry</button></div>} {notice && <div className="quick-notice" role="status">{notice}</div>}</div><footer className="quick-sticky-footer"><button type="button" className="button-link" onClick={back} disabled={step === 'source'}><ArrowLeft size={15}/> Back</button>{step === 'polish' && <button type="button" className="quick-handoff-button" onClick={handoff}>Continue in 3D Designer <ArrowRight size={15}/></button>}<button type="button" className="button button--acid" onClick={advance} disabled={!canContinue || jobStatus === 'running'}>{step === 'review' ? 'CHECK PREFLIGHT' : step === 'direction' ? 'GENERATE ARTWORK' : step === 'variants' ? 'POLISH ARTWORK' : step === 'polish' ? 'CHOOSE PRODUCT' : step === 'product' ? 'REVIEW ORDER' : 'CONTINUE'} <ArrowRight size={15}/></button></footer></main>
}
