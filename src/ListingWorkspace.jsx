import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ClipboardCheck, Copy, Eye, FileText,
  GripVertical, Image as ImageIcon, Layers3, Link2, ListFilter, LoaderCircle, Lock,
  MessageSquareText, PackageCheck, Plus, Save, SearchCheck, Sparkles, Trash2, Upload,
  Video, WandSparkles, X, RefreshCw
} from 'lucide-react'
import VariantMatrix from './VariantMatrix'
import { catalogLegalReview, createProductDraft, customFieldPresets, duplicateProductDraft, productCompleteness, slugify } from './lib/catalog-model'
import { googleMerchantReadiness } from './lib/google-merchant'
import { requestAiListingCopy, requestAiListingMedia, requestAiListingReview, saveAdminProduct, uploadProductMedia } from './lib/supabase'
import { CUSTOM_GUIDE_SLOT_ID, LISTING_MEDIA_SLOTS, MODEL_MEDIA_SLOT_IDS, listingMediaRole, listingMediaSlot } from './lib/listing-media'
import { normalizePreviewRegion } from './lib/customization-ai'
import './listing-workspace.css'

const navigate = path => {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top:0, behavior:'instant' })
}

const sections = [
  { id:'story', label:'Story & SEO', copy:'Identity, narrative and search', icon:FileText },
  { id:'media', label:'Media', copy:'Images, video and alt text', icon:ImageIcon },
  { id:'variants', label:'Variations & price', copy:'SKUs, margin and inventory', icon:Layers3 },
  { id:'custom', label:'Custom fields', copy:'What customers may change', icon:MessageSquareText },
  { id:'organization', label:'Organization', copy:'Tags, group and catalogue', icon:ListFilter }
]

const blockLabels = { heading:'Heading', paragraph:'Paragraph', quote:'Quote', image:'Image', video:'Video' }

function attachGeneratedMedia(current, slot, generatedMedia) {
  if (!generatedMedia?.url) return current
  const previous = (current.media || []).find(item => listingMediaRole(item) === slot.id)
  const nextMedia = [...(current.media || []).filter(item => listingMediaRole(item) !== slot.id), generatedMedia]
  const nextBlocks = (current.contentBlocks || []).map(block => (block.mediaRole === slot.id || block.mediaId === previous?.id)
    ? { ...block, mediaRole:slot.id, mediaId:generatedMedia.id, url:generatedMedia.url }
    : block)
  return { ...current, media:nextMedia, image:current.image || generatedMedia.url, contentBlocks:nextBlocks }
}

function Field({ label, value, onChange, type='text', hint, placeholder, maxLength, rows=5 }) {
  return <label className="listing-field"><span>{label}</span>{type === 'textarea' ? <textarea rows={rows} maxLength={maxLength} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/> : <input type={type} maxLength={maxLength} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>} {hint && <small>{hint}</small>}</label>
}

function SelectField({ label, value, onChange, children, hint }) {
  return <label className="listing-field listing-field--select"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value)}>{children}</select><ChevronDown size={14}/>{hint && <small>{hint}</small>}</label>
}

function WorkspaceHeader({ draft, dirty, saving, previewProduct, onSave, onPublish, onDuplicate }) {
  return <header className="listing-workspace__header"><button className="listing-workspace__back" onClick={() => navigate('/admin/catalog')}><ArrowLeft size={15}/> Products</button><div className="listing-workspace__identity"><span>{draft._persisted ? 'LISTING' : 'UNSAVED DRAFT'} / {draft.sku}</span><h1>{draft.title || 'Untitled listing'}</h1></div><div className="listing-workspace__actions"><span className={`listing-dirty ${dirty ? 'is-dirty' : ''}`}><i/>{dirty ? 'Unsaved changes' : 'Up to date'}</span><button className="admin-button admin-button--outline" onClick={onDuplicate}><Copy size={14}/> Duplicate</button><button className="admin-button admin-button--outline" disabled={!previewProduct} title={previewProduct ? 'Open the current published storefront listing.' : 'Publish this listing before opening its storefront page.'} onClick={() => previewProduct && window.open(`/product/${previewProduct.handle || previewProduct.id}`, '_blank', 'noopener,noreferrer')}><Eye size={14}/> Preview</button><button className="admin-button admin-button--outline" disabled={saving} onClick={() => onSave()}><Save size={14}/>{saving ? 'Saving…' : 'Save changes'}</button><button className="admin-button admin-button--dark" disabled={saving || draft.status === 'ARCHIVED'} onClick={onPublish}><PackageCheck size={14}/> Publish</button></div></header>
}

function AiBriefFields({ brief, setBrief }) {
  const update = (key, value) => setBrief(current => ({ ...current, [key]:value }))
  return <div className="listing-form-grid listing-ai__brief-fields">
    <SelectField label="Output language" value={brief.language} onChange={value => update('language',value)}><option>English</option><option>Vietnamese</option></SelectField>
    <Field label="Editorial tone" value={brief.tone} onChange={value => update('tone',value)} placeholder="Editorial, direct, emotionally precise"/>
    <Field label="Primary keyword" value={brief.primaryKeyword} onChange={value => update('primaryKeyword',value)} placeholder="personalized football jersey" hint="One phrase describing the main search intent."/>
    <Field label="Search intent" value={brief.searchIntent} onChange={value => update('searchIntent',value)} placeholder="football memory gift, custom jersey"/>
    <div className="listing-form-grid__wide"><Field label="Secondary keywords" type="textarea" rows={2} value={brief.secondaryKeywords} onChange={value => update('secondaryKeywords',value)} placeholder="custom football jersey, matchday shirt, personalized sportswear" hint="Comma-separated; the writer uses only relevant phrases."/></div>
    <Field label="Verified customer value" type="textarea" rows={3} value={brief.valueProps} onChange={value => update('valueProps',value)} placeholder="What the customer receives, how the artwork stays locked, what can be entered…"/>
    <Field label="Verified differences" type="textarea" rows={3} value={brief.differentiators} onChange={value => update('differentiators',value)} placeholder="The visual symbol, local reference, detail or design choice that makes this listing distinct…"/>
    <div className="listing-form-grid__wide"><Field label="Creative direction" type="textarea" rows={4} value={brief.direction} onChange={value => update('direction',value)} placeholder="Describe the visual symbols, match, place, emotion and factual details the copy must preserve."/></div>
  </div>
}

function AiSuggestionDetails({ suggestion }) {
  const rows = [
    ['SEO title', suggestion.seoTitle],
    ['SEO description', suggestion.seoDescription],
    ['Primary keyword', suggestion.primaryKeyword],
    ['Secondary keywords', (suggestion.secondaryKeywords || []).join(' · ')],
    ['Value points', (suggestion.valueProps || []).join(' · ')],
    ['Differences', (suggestion.differentiators || []).join(' · ')],
    ['Suggested tags', (suggestion.tags || []).join(' · ')]
  ]
  return <><dl>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{suggestion.imagePlan?.length > 0 && <div className="listing-ai__image-plan"><span>Image plan</span>{suggestion.imagePlan.map(item => <p key={`${item.role}-${item.caption}`}><b>{item.role}</b><em>{item.caption || 'Use this frame to support the product story.'}</em></p>)}</div>}</>
}

function AiAuditSummary({ suggestion }) {
  const audit = suggestion?.audit || {}
  const issues = Array.isArray(audit.issues) ? audit.issues : []
  const gaps = Array.isArray(audit.imageGaps) ? audit.imageGaps : []
  return <div className="listing-ai-audit"><div className="listing-ai-audit__scores"><div><strong>{audit.contentScore ?? '—'}</strong><span>CONTENT / 100</span></div><div><strong>{audit.mediaScore ?? '—'}</strong><span>MEDIA / 100</span></div><div><strong>{audit.reviewedImageCount ?? '—'}</strong><span>IMAGES READ</span></div></div>{audit.summary && <p className="listing-ai-audit__summary">{audit.summary}</p>}{issues.length > 0 && <div className="listing-ai-audit__list"><span>Priority fixes</span>{issues.map((issue,index) => <p key={`${issue}-${index}`}><b>{String(index + 1).padStart(2,'0')}</b>{issue}</p>)}</div>}{gaps.length > 0 && <div className="listing-ai-audit__list"><span>Recommended image gaps</span>{gaps.map(item => <p key={item.role}><b>+</b><strong>{item.role}</strong>{item.reason}</p>)}</div>}</div>
}

function SeoSignals({ seo, onChange }) {
  const update = (key, value) => onChange({ ...seo, [key]:value })
  const secondary = Array.isArray(seo.secondaryKeywords) ? seo.secondaryKeywords.join(', ') : (seo.secondaryKeywords || '')
  const valueProps = Array.isArray(seo.valueProps) ? seo.valueProps.join('\n') : (seo.valueProps || '')
  const differentiators = Array.isArray(seo.differentiators) ? seo.differentiators.join('\n') : (seo.differentiators || '')
  return <>
    <Field label="Primary keyword" value={seo.primaryKeyword || ''} onChange={value => update('primaryKeyword',value)} placeholder="personalized football jersey" hint="One clear phrase; keep it natural in the opening story."/>
    <Field label="Secondary keywords" type="textarea" rows={3} value={secondary} onChange={value => update('secondaryKeywords',value.split(',').map(item => item.trim()).filter(Boolean))} placeholder="custom football jersey, football memory gift" hint="Comma-separated supporting phrases."/>
    <Field label="Customer value points" type="textarea" rows={3} value={valueProps} onChange={value => update('valueProps',value.split('\n').map(item => item.trim()).filter(Boolean))} placeholder="One verified value per line"/>
    <Field label="Design differences" type="textarea" rows={3} value={differentiators} onChange={value => update('differentiators',value.split('\n').map(item => item.trim()).filter(Boolean))} placeholder="One factual difference per line"/>
  </>
}

function StoryPanel({ draft, update, dirty }) {
  const [aiOpen, setAiOpen] = useState(false)
  const [brief, setBrief] = useState(() => ({ language:'English', tone:'Editorial, direct, emotionally precise', direction:'', searchIntent:'', primaryKeyword:draft.seo?.primaryKeyword || '', secondaryKeywords:Array.isArray(draft.seo?.secondaryKeywords) ? draft.seo.secondaryKeywords.join(', ') : (draft.seo?.secondaryKeywords || ''), valueProps:Array.isArray(draft.seo?.valueProps) ? draft.seo.valueProps.join('\n') : (draft.seo?.valueProps || ''), differentiators:Array.isArray(draft.seo?.differentiators) ? draft.seo.differentiators.join('\n') : (draft.seo?.differentiators || '') }))
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [suggestion, setSuggestion] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewSuggestion, setReviewSuggestion] = useState(null)
  const [generatingReviewMedia, setGeneratingReviewMedia] = useState(false)
  const [reviewMediaProgress, setReviewMediaProgress] = useState({ done:0, total:0 })
  const seo = draft.seo || {}
  const blocks = draft.contentBlocks || []
  const addBlock = type => update('contentBlocks', [...blocks,{ id:`block-${crypto.randomUUID()}`, type, content:'', mediaId:'' }])
  const updateBlock = (id, patch) => update('contentBlocks', blocks.map(block => block.id === id ? {...block,...patch} : block))
  const removeBlock = id => update('contentBlocks', blocks.filter(block => block.id !== id))
  const moveBlock = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]; [next[index],next[target]] = [next[target],next[index]]; update('contentBlocks',next)
  }
  const generate = async () => {
    setGenerating(true); setAiError(''); setSuggestion(null)
    try { const result = await requestAiListingCopy(draft, brief); setSuggestion(result.suggestion) }
    catch (error) { setAiError(error instanceof Error ? error.message : 'AI copy could not be generated.') }
    finally { setGenerating(false) }
  }
  const applySuggestion = candidate => {
    const nextSuggestion = candidate || suggestion
    if (!nextSuggestion) return
    update(null, current => {
      const media = current.media || []
      const resolveImageBlock = block => {
        const role = listingMediaRole({ role:block.mediaRole })
        const asset = media.find(item => listingMediaRole(item) === role)
        return asset ? { ...block, mediaRole:role, mediaId:asset.id, url:asset.url } : null
      }
      const resolvedBlocks = (nextSuggestion.contentBlocks || []).map(block => {
        if (block.type !== 'image') return block
        return resolveImageBlock(block)
      }).filter(Boolean)
      const imageRoles = new Set(resolvedBlocks.filter(block => block.type === 'image').map(block => block.mediaRole))
      const plannedImages = (nextSuggestion.imagePlan || []).map((plan, index) => {
        const role = listingMediaRole({ role:plan.role })
        if (!role || imageRoles.has(role)) return null
        const block = resolveImageBlock({ id:`ai-image-${Date.now()}-${index}`, type:'image', content:plan.caption || '', mediaRole:role })
        if (block) imageRoles.add(role)
        return block
      }).filter(Boolean)
      const storyBlocks = [...resolvedBlocks, ...plannedImages]
      const primaryKeyword = nextSuggestion.primaryKeyword || current.seo?.primaryKeyword || ''
      const secondaryKeywords = nextSuggestion.secondaryKeywords || current.seo?.secondaryKeywords || []
      return {
        ...current,
        title:nextSuggestion.title || current.title,
        handle:current._persisted ? current.handle : slugify(nextSuggestion.title || current.title),
        subtitle:nextSuggestion.subtitle || current.subtitle,
        story:nextSuggestion.subtitle || current.story,
        description:nextSuggestion.description || current.description,
        seo:{ ...current.seo, title:nextSuggestion.seoTitle, description:nextSuggestion.seoDescription, keywords:nextSuggestion.keywords, primaryKeyword, secondaryKeywords, valueProps:nextSuggestion.valueProps, differentiators:nextSuggestion.differentiators, imagePlan:nextSuggestion.imagePlan },
        tags:[...new Set([...(current.tags || []),...(nextSuggestion.tags || [])])],
        contentBlocks:storyBlocks.length ? storyBlocks : current.contentBlocks,
        aiMetadata:{ ...(current.aiMetadata || {}), copy:{ generatedAt:nextSuggestion.generatedAt, language:nextSuggestion.language, mode:nextSuggestion.audit ? 'FULL_AUDIT' : 'COPY_DRAFT' } }
      }
    })
    if (candidate) setReviewSuggestion(null)
    else setSuggestion(null)
    setAiOpen(false)
  }
  const runReview = async () => {
    setReviewing(true); setReviewError(''); setReviewSuggestion(null); setAiOpen(true)
    try {
      const result = await requestAiListingReview(draft, { ...brief, direction:brief.direction || 'Read the complete listing, normalize the copy and identify the highest-value missing image roles.' })
      setReviewSuggestion(result.suggestion)
    } catch (error) { setReviewError(error instanceof Error ? error.message : 'The full listing review could not be generated.') }
    finally { setReviewing(false) }
  }
  const reviewPlans = [...new Map([...(reviewSuggestion?.imagePlan || []), ...(reviewSuggestion?.audit?.imageGaps || [])].map(item => [item.role, item])).values()]
    .map(item => ({ ...item, slot:listingMediaSlot(item.role) }))
    .filter(item => item.slot && !(draft.media || []).some(media => listingMediaRole(media) === item.slot.id))
  const generateReviewMedia = async () => {
    if (!reviewPlans.length) return
    if (!draft._persisted) { setReviewError('Save the listing once before generating new images.'); return }
    if (dirty) { setReviewError('Save the listing first so generated images use the current listing reference.'); return }
    setGeneratingReviewMedia(true); setReviewError(''); setReviewMediaProgress({ done:0, total:reviewPlans.length })
    let failures = 0
    for (let index = 0; index < reviewPlans.length; index += 1) {
      const plan = reviewPlans[index]
      try {
        const result = await requestAiListingMedia(draft, plan.slot.id, plan.caption || plan.reason || '')
        update(null, current => attachGeneratedMedia(current, plan.slot, result.media))
      } catch { failures += 1 }
      setReviewMediaProgress({ done:index + 1, total:reviewPlans.length })
    }
    setGeneratingReviewMedia(false)
    if (failures) setReviewError(`${failures} recommended image${failures === 1 ? '' : 's'} failed. You can retry the missing roles.`)
  }
  return <section className="listing-section listing-story"><div className="listing-section__heading"><div><span>Product story spine</span><h2>Make the design understandable.</h2><p>Write one source story first. Storefront copy, SEO and rich content should reinforce it rather than repeat unrelated claims.</p></div><div className="listing-ai-actions"><button className="listing-ai-audit-trigger" disabled={reviewing} onClick={runReview}><ClipboardCheck size={16}/>{reviewing ? 'Reading listing…' : 'Review entire listing'}</button><button className="listing-ai-trigger" onClick={() => setAiOpen(value => !value)}><WandSparkles size={17}/>{aiOpen ? 'Close AI writer' : 'Write with AI'}</button></div></div>
    {aiOpen && <div className="listing-ai"><div className="listing-ai__intro"><Sparkles size={19}/><div><strong>{reviewSuggestion ? 'Full listing audit' : 'AI listing writer'}</strong><span>{reviewSuggestion ? 'AI inspected the current copy, SEO fields, story blocks and supplied product images. Nothing is saved until you apply it.' : 'The listing text and public product images are sent as a visual reference. Suggestions never overwrite fields until you apply them.'}</span></div></div>{!reviewSuggestion && <><AiBriefFields brief={brief} setBrief={setBrief}/><button className="listing-ai__generate" disabled={generating} onClick={generate}>{generating ? <LoaderCircle className="is-spinning" size={15}/> : <Sparkles size={15}/>} {generating ? 'Reading the story…' : 'Generate title, story & SEO'}</button>{aiError && <p className="listing-ai__error" role="alert">{aiError}</p>}{suggestion && <div className="listing-ai__result"><div><span>AI DRAFT / REVIEW BEFORE APPLYING</span><button onClick={() => setSuggestion(null)} aria-label="Discard AI draft"><X size={15}/></button></div><h3>{suggestion.title}</h3><strong>{suggestion.subtitle}</strong><p>{suggestion.description}</p><AiSuggestionDetails suggestion={suggestion}/><button onClick={() => applySuggestion()}><Check size={14}/> Apply this draft</button></div>}</>}{reviewing && <div className="listing-ai__loading"><LoaderCircle className="is-spinning" size={16}/> Reading all listing text and images…</div>}{reviewError && <p className="listing-ai__error" role="alert">{reviewError}</p>}{reviewSuggestion && <div className="listing-ai__result listing-ai__result--audit"><div><span>FULL AUDIT / REVIEW BEFORE APPLYING</span><button onClick={() => setReviewSuggestion(null)} aria-label="Discard full listing audit"><X size={15}/></button></div><AiAuditSummary suggestion={reviewSuggestion}/><h3>{reviewSuggestion.title}</h3><strong>{reviewSuggestion.subtitle}</strong><p>{reviewSuggestion.description}</p><AiSuggestionDetails suggestion={reviewSuggestion}/><div className="listing-ai__result-actions"><button onClick={() => applySuggestion(reviewSuggestion)}><Check size={14}/> Apply content draft</button><button className="listing-secondary-action" disabled={generatingReviewMedia || !reviewPlans.length} title={!reviewPlans.length ? 'The audit did not identify a missing controlled image role.' : !draft._persisted ? 'Save the listing before generating images.' : dirty ? 'Save the listing before generating images.' : 'Generate the recommended missing images.'} onClick={generateReviewMedia}>{generatingReviewMedia ? <><LoaderCircle className="is-spinning" size={14}/> Creating {reviewMediaProgress.done}/{reviewMediaProgress.total}</> : <><ImageIcon size={14}/> Generate {reviewPlans.length ? `${reviewPlans.length} missing image${reviewPlans.length === 1 ? '' : 's'}` : 'recommended images'}</>}</button></div></div>}</div>}

    <div className="listing-form-grid listing-form-grid--story"><div className="listing-form-grid__wide"><Field label="Product title" value={draft.title} onChange={value => update('title',value)} maxLength={120} hint={`${(draft.title || '').length}/120 · Main product name shown across the storefront.`}/></div><Field label="URL handle" value={draft.handle} onChange={value => update('handle',slugify(value))} hint="Lowercase URL path; keep stable after publishing."/><Field label="Short story line" value={draft.subtitle || ''} onChange={value => update('subtitle',value)} maxLength={180} hint={`${(draft.subtitle || '').length}/180 · Used on product cards and the opening section.`}/><div className="listing-form-grid__wide"><Field label="Design story" type="textarea" rows={9} value={draft.description} onChange={value => update('description',value)} placeholder="What happened, what the visual symbols mean, and why this piece exists…" hint="Factual source narrative for customers and AI tools."/></div></div>

    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Search preview</span><h3>SEO metadata</h3></div><SearchCheck size={19}/></div><div className="listing-form-grid"><Field label="SEO title" value={seo.title || ''} onChange={value => update('seo',{...seo,title:value})} maxLength={60} hint={`${(seo.title || '').length}/60`}/><Field label="SEO description" type="textarea" rows={4} value={seo.description || ''} onChange={value => update('seo',{...seo,description:value})} maxLength={160} hint={`${(seo.description || '').length}/160`}/><div className="listing-form-grid__wide"><Field label="Keywords" value={(seo.keywords || []).join(', ')} onChange={value => update('seo',{...seo,keywords:value.split(',').map(item => item.trim()).filter(Boolean)})} placeholder="football memory, personalized jersey, extra time"/></div><SeoSignals seo={seo} onChange={value => update('seo',value)}/></div><div className="listing-search-preview"><span>{window.location.origin}/product/{draft.handle}</span><strong>{seo.title || draft.title || 'Product title'}</strong><p>{seo.description || draft.subtitle || 'Add a concise search description for this listing.'}</p></div></div>

    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Rich product page</span><h3>Content blocks</h3><p>Build the long-form product story and insert uploaded images or video between paragraphs.</p></div><div className="listing-block-add"><button onClick={() => addBlock('heading')}>+ Heading</button><button onClick={() => addBlock('paragraph')}>+ Text</button><button onClick={() => addBlock('quote')}>+ Quote</button><button onClick={() => addBlock('image')}>+ Image</button><button onClick={() => addBlock('video')}>+ Video</button></div></div><div className="listing-blocks">{blocks.map((block,index) => <article key={block.id} className="listing-block"><div className="listing-block__rail"><GripVertical size={15}/><span>{blockLabels[block.type] || block.type}</span><button disabled={index === 0} title={index === 0 ? 'This block is already first.' : 'Move block up'} onClick={() => moveBlock(index,-1)}><ArrowUp size={13}/></button><button disabled={index === blocks.length - 1} title={index === blocks.length - 1 ? 'This block is already last.' : 'Move block down'} onClick={() => moveBlock(index,1)}><ArrowDown size={13}/></button><button onClick={() => removeBlock(block.id)} aria-label="Remove content block"><Trash2 size={13}/></button></div>{['heading','paragraph','quote'].includes(block.type) ? <textarea rows={block.type === 'heading' ? 2 : 5} value={block.content || ''} onChange={event => updateBlock(block.id,{content:event.target.value})} placeholder={`Write ${blockLabels[block.type].toLowerCase()}…`}/> : <><label><span>Choose uploaded {block.type}</span><select value={block.mediaId || ''} onChange={event => { const media=draft.media.find(item => item.id === event.target.value); updateBlock(block.id,{mediaId:event.target.value,url:media?.url || ''}) }}><option value="">Select media</option>{(draft.media || []).filter(item => item.type === block.type.toUpperCase()).map(item => <option key={item.id} value={item.id}>{item.filename || item.alt || item.id}</option>)}</select><ChevronDown size={13}/></label>{block.type === 'image' && <Field label="Image caption" value={block.content || ''} onChange={value => updateBlock(block.id,{content:value})} placeholder="Explain the value, detail or difference shown"/>}{block.url && (block.type === 'image' ? <img src={block.url} alt="Content block preview"/> : <video src={block.url} controls preload="metadata"/>)}</>}</article>)}{!blocks.length && <div className="listing-empty-inline"><FileText size={20}/><span>Add structured blocks to tell the design story beyond the short description.</span></div>}</div></div>
  </section>
}

function EditorialMediaSet({ draft, update, onNotice, dirty }) {
  const [busy, setBusy] = useState('')
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [progress, setProgress] = useState({ done:0, total:MODEL_MEDIA_SLOT_IDS.length })
  const [error, setError] = useState('')
  const media = draft.media || []
  const slotAsset = slot => media.find(item => listingMediaRole(item) === slot.id)
  const attach = (slot, generated) => update(null, current => attachGeneratedMedia(current, slot, generated.media))
  const generateOne = async slot => {
    if (!draft._persisted) { setError('Save the listing once before generating editorial media.'); return false }
    if (dirty) { setError('Save the listing first so the generator uses the current primary image.'); return false }
    setBusy(slot.id); setError('')
    try {
      const result = await requestAiListingMedia(draft, slot.id)
      attach(slot, result)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Editorial image generation failed.')
      return false
    } finally { setBusy('') }
  }
  const generateModels = async () => {
    if (!draft._persisted) { setError('Save the listing once before generating editorial media.'); return }
    if (dirty) { setError('Save the listing first so the generator uses the current primary image.'); return }
    const slots = LISTING_MEDIA_SLOTS.filter(slot => MODEL_MEDIA_SLOT_IDS.includes(slot.id) && !slotAsset(slot))
    if (!slots.length) { onNotice('All five model views are already attached.'); return }
    setError(''); setBusy('models'); setBatchGenerating(true); setProgress({ done:0, total:slots.length })
    let failures = 0
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      setBusy(slot.id)
      try { const result = await requestAiListingMedia(draft, slot.id); attach(slot, result) } catch { failures += 1 }
      setProgress({ done:index + 1, total:slots.length })
    }
    setBusy(''); setBatchGenerating(false)
    if (failures) setError(`${failures} model view${failures === 1 ? '' : 's'} failed. You can retry only the missing views.`)
    else onNotice(`${slots.length} model view${slots.length === 1 ? '' : 's'} generated. Review the set, then save the listing.`)
  }
  const guideSlot = LISTING_MEDIA_SLOTS.find(slot => slot.id === CUSTOM_GUIDE_SLOT_ID)
  const guide = guideSlot && slotAsset(guideSlot)
  return <section className="listing-editorial-set"><div className="listing-subsection__head"><div><span>Controlled image generation</span><h3>Build the product story in six frames.</h3><p>Every frame uses the exact primary listing image as reference. Five model views show value and context; one guide explains the allowed custom fields.</p></div><Sparkles size={19}/></div>{draft.image ? <div className="listing-editorial-set__reference"><img src={draft.image} alt="Primary listing reference"/><span>PRIMARY LISTING IMAGE / EXACT REFERENCE</span></div> : <p className="listing-notice is-error" role="alert">Add a primary listing image before generating editorial media.</p>}<div className="listing-editorial-set__actions"><button className="listing-primary-action" disabled={Boolean(busy) || !draft._persisted || !draft.image} title={!draft._persisted ? 'Save this listing before generating editorial media.' : !draft.image ? 'Add a primary listing image first.' : 'Generate the missing model views one at a time.'} onClick={generateModels}>{batchGenerating ? <><LoaderCircle className="is-spinning" size={15}/> Generating {progress.done}/{progress.total}</> : <><ImageIcon size={15}/> Generate 5 model views</>}</button><button className="listing-secondary-action" disabled={Boolean(busy) || !draft._persisted || !draft.image || Boolean(guide)} title={!draft._persisted ? 'Save this listing before generating editorial media.' : !draft.image ? 'Add a primary listing image first.' : guide ? 'The custom guide is already attached.' : 'Generate the customisation guide.'} onClick={() => guideSlot && generateOne(guideSlot)}>{busy === CUSTOM_GUIDE_SLOT_ID ? <><LoaderCircle className="is-spinning" size={15}/> Generating guide…</> : <><FileText size={15}/> {guide ? 'Guide attached' : 'Generate custom guide'}</>}</button></div>{error && <p className="listing-notice is-error" role="alert">{error}</p>}<div className="listing-editorial-set__grid">{LISTING_MEDIA_SLOTS.map(slot => { const asset = slotAsset(slot); const isBusy = busy === slot.id; return <article key={slot.id} className={`listing-editorial-slot ${asset ? 'is-ready' : ''}`}><div className="listing-editorial-slot__visual">{asset ? <img src={asset.url} alt={asset.alt || slot.alt}/> : <><span>{slot.group === 'model' ? 'MODEL' : 'GUIDE'}</span><strong>{slot.shortLabel}</strong></>}{isBusy && <i><LoaderCircle className="is-spinning" size={18}/></i>}<b>{asset ? 'READY' : 'EMPTY'}</b></div><div className="listing-editorial-slot__body"><strong>{slot.label}</strong><small>{asset ? asset.alt : slot.alt}</small>{asset && <button disabled={Boolean(busy)} onClick={() => generateOne(slot)} title="Regenerate this frame using the current primary image."><RefreshCw size={12}/> Regenerate</button>}</div></article>})}</div><small className="listing-editorial-set__help">Generated frames are editorial previews, not proof of a physical sample when the primary image is a 2D mockup. Review the garment, text and color before publishing; generated files are stripped of provider metadata and stay unpublished until you save them.</small></section>
}

function MediaPanel({ draft, update, dirty }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const media = draft.media || []
  const upload = async event => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    setUploading(true); setNotice('')
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadProductMedia(file,draft.id))
      update(null,current => ({ ...current, media:[...(current.media || []),...uploaded], image:current.image || uploaded.find(item => item.type === 'IMAGE')?.url || '' }))
      setNotice(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded. Save the listing to attach them permanently.`)
    } catch (error) { setNotice(`Upload failed: ${error instanceof Error ? error.message : 'Please retry.'}`) }
    finally { setUploading(false) }
  }
  const updateMedia = (id, patch) => update('media',media.map(item => item.id === id ? {...item,...patch} : item))
  const remove = item => {
    const next = media.filter(row => row.id !== item.id)
    update(null,current => ({ ...current,media:next,image:current.image === item.url ? next.find(row => row.type === 'IMAGE')?.url || '' : current.image }))
    setNotice('Removed from this listing. The stored file is retained so published references are not broken.')
  }
  const move = (index,direction) => { const target=index+direction; if(target<0||target>=media.length)return; const next=[...media]; [next[index],next[target]]=[next[target],next[index]]; update('media',next) }
  return <section className="listing-section listing-media"><div className="listing-section__heading"><div><span>Listing media library</span><h2>Show the real piece.</h2><p>Upload production photos and product video directly. The primary image is also the reference used by customer AI editing.</p></div><><input ref={inputRef} className="listing-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" multiple onChange={upload}/><button className="listing-primary-action" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="is-spinning" size={16}/> : <Upload size={16}/>} {uploading ? 'Uploading…' : 'Upload media'}</button></></div><div className="listing-media-rules"><span><ImageIcon size={15}/> Images: JPG, PNG, WebP, AVIF · up to 15 MB</span><span><Video size={15}/> Video: MP4, WebM · up to 80 MB</span><span><Lock size={15}/> Removing a tile only detaches it from this listing</span></div>{notice && <p className={notice.startsWith('Upload failed:') ? 'listing-notice is-error' : 'listing-notice'} role={notice.startsWith('Upload failed:') ? 'alert' : 'status'}>{notice}</p>}<EditorialMediaSet draft={draft} update={update} dirty={dirty} onNotice={setNotice}/><div className="listing-media-grid">{media.map((item,index) => <article key={item.id} className={`listing-media-card ${draft.image === item.url ? 'is-primary' : ''}`}><div className="listing-media-card__visual">{item.type === 'VIDEO' ? <video src={item.url} controls preload="metadata"/> : <img src={item.url} alt={item.alt || ''}/>}<span>{item.type}</span>{draft.image === item.url && <strong>PRIMARY</strong>}</div><div className="listing-media-card__body"><p>{item.filename || 'Uploaded media'}</p><Field label="Alt text" value={item.alt || ''} onChange={value => updateMedia(item.id,{alt:value})} placeholder="Describe what is visible" hint="Needed for accessibility and image search."/><div><button disabled={item.type !== 'IMAGE' || draft.image === item.url} title={item.type !== 'IMAGE' ? 'Only images can be the primary listing reference.' : draft.image === item.url ? 'This is already the primary image.' : 'Use as primary listing image'} onClick={() => update('image',item.url)}><Check size={13}/> Set primary</button><button disabled={index === 0} title={index === 0 ? 'Already first.' : 'Move earlier'} onClick={() => move(index,-1)}><ArrowLeft size={13}/></button><button disabled={index === media.length-1} title={index === media.length-1 ? 'Already last.' : 'Move later'} onClick={() => move(index,1)}><ArrowRight size={13}/></button><button onClick={() => remove(item)} aria-label="Detach media"><Trash2 size={13}/></button></div></div></article>)}{!media.length && <button className="listing-media-empty" onClick={() => inputRef.current?.click()}><Upload size={23}/><strong>Upload the first product image</strong><span>Use a real mockup or production photo. Add a short video after the image set.</span></button>}</div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Fallback reference</span><h3>Primary image URL</h3></div><Link2 size={18}/></div><Field label="Public image URL" value={draft.image || ''} onChange={value => update('image',value)} hint="Useful for an existing CDN asset. Uploading above is recommended."/></div></section>
}

function PreviewRegionEditor({ field, image, onChange }) {
  const region = normalizePreviewRegion(field.previewRegion)
  const [drawing,setDrawing] = useState(null)
  const supported = field.type !== 'photo' && field.type !== 'textarea'
  if (!supported) return <div className="listing-region-disabled"><Lock size={14}/><span>This field is for studio review only. It cannot trigger an automatic image edit.</span></div>
  const setRegion = patch => {
    const current = region || { x:0, y:0, width:1, height:1 }
    const next = { ...current, ...patch }
    next.width = Math.max(1, Math.min(100, Number(next.width) || 1))
    next.height = Math.max(1, Math.min(100, Number(next.height) || 1))
    next.x = Math.max(0, Math.min(100 - next.width, Number(next.x) || 0))
    next.y = Math.max(0, Math.min(100 - next.height, Number(next.y) || 0))
    onChange({ previewRegion:next })
  }
  const moveRegion = event => {
    if (!region) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const centerX = (event.clientX - bounds.left) / bounds.width * 100
    const centerY = (event.clientY - bounds.top) / bounds.height * 100
    setRegion({ x:centerX - region.width / 2, y:centerY - region.height / 2 })
  }
  return <div className={`listing-region-editor ${field.type === 'logo' ? 'is-logo' : ''} ${region ? 'is-enabled' : ''}`}>
    <div className="listing-region-editor__head"><div><strong>{field.type === 'logo' ? 'Approved logo slot' : 'Exact image edit area'}</strong><span>{region ? (field.type === 'logo' ? 'The original customer logo stays exact inside this rectangle. Click the image to reposition it.' : 'Only this rectangle may change. Click the image to reposition it.') : 'Preview stays disabled until a designer defines this field’s exact area.'}</span></div>{region ? <button onClick={() => onChange({previewRegion:null})}><X size={13}/> Disable</button> : <button onClick={() => setRegion({x:35,y:35,width:30,height:15})}><Plus size={13}/> Define area</button>}</div>
    {region && <div className="listing-region-editor__body">
      {image ? <figure onPointerDown={moveRegion}><img src={image} alt={`Position the ${field.label || field.key} edit area`}/><i style={{ left:`${region.x}%`, top:`${region.y}%`, width:`${region.width}%`, height:`${region.height}%` }}><span>{field.label || field.key}</span></i></figure> : <div className="listing-region-editor__missing"><ImageIcon size={19}/><span>Add a primary image before positioning this area.</span></div>}
      <div className="listing-region-coordinates">{[['x','Left'],['y','Top'],['width','Width'],['height','Height']].map(([key,label]) => <label key={key}><span>{label} %</span><input type="number" min={key === 'x' || key === 'y' ? 0 : 1} max="100" step="1" value={Math.round(region[key] * 10) / 10} onChange={event => setRegion({[key]:Number(event.target.value)})}/></label>)}</div>
    </div>}
  </div>
}

function CustomFieldsPanel({ draft, update }) {
  const fields = draft.customFields || []
  const addPreset = preset => {
    if (fields.some(field => field.key === preset.key)) return
    update('customFields',[...fields,{...preset,id:`field-${crypto.randomUUID()}`,options:preset.options || []}])
  }
  const addBlank = () => update('customFields',[...fields,{id:`field-${crypto.randomUUID()}`,key:`field${fields.length+1}`,label:'New field',type:'text',required:false,placeholder:'',maxLength:30,help:'',options:[],previewRegion:null}])
  const edit = (id,patch) => update('customFields',fields.map(field => field.id === id ? {...field,...patch} : field))
  const move = (index,direction) => { const target=index+direction; if(target<0||target>=fields.length)return; const next=[...fields]; [next[index],next[target]]=[next[target],next[index]]; update('customFields',next) }
  return <section className="listing-section listing-custom"><div className="listing-section__heading"><div><span>Customer input policy</span><h2>Lock the art. Open the memory.</h2><p>The original image is the source of truth. Add a field, then mark its exact edit rectangle on that image. Logo fields keep the original uploaded asset and can optionally receive an AI fabric finish.</p></div><button className="listing-primary-action" onClick={addBlank}><Plus size={15}/> Add custom field</button></div><div className="listing-lock-policy"><div><strong>100%</strong><span>Original design preserved</span></div><i><b style={{width:'100%'}}/></i><div><strong>LOCAL</strong><span>Only approved rectangles open</span></div></div><div className="listing-preset-strip"><span>Quick add</span>{customFieldPresets.map(preset => <button key={preset.key} disabled={fields.some(field => field.key === preset.key)} title={fields.some(field => field.key === preset.key) ? `${preset.label} is already enabled.` : `Add ${preset.label}`} onClick={() => addPreset(preset)}>+ {preset.label}</button>)}</div><div className="listing-custom-list">{fields.map((field,index) => <article key={field.id}><div className="listing-custom-list__head"><GripVertical size={15}/><strong>{field.label || field.key}</strong><span>{field.type}</span><button disabled={index === 0} title={index === 0 ? 'Already first.' : 'Move field up'} onClick={() => move(index,-1)}><ArrowUp size={13}/></button><button disabled={index === fields.length-1} title={index === fields.length-1 ? 'Already last.' : 'Move field down'} onClick={() => move(index,1)}><ArrowDown size={13}/></button><button onClick={() => update('customFields',fields.filter(item => item.id !== field.id))} aria-label={`Remove ${field.label}`}><Trash2 size={13}/></button></div><div className="listing-form-grid"><Field label="Customer label" value={field.label} onChange={value => edit(field.id,{label:value})}/><Field label="Data key" value={field.key} onChange={value => edit(field.id,{key:slugify(value,'field').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())})}/><SelectField label="Input type" value={field.type} onChange={value => edit(field.id,{type:value,previewRegion:['photo','textarea'].includes(value) ? null : field.previewRegion})}><option value="text">Short text</option><option value="number">Number</option><option value="textarea">Long note</option><option value="select">Choice list</option><option value="photo">Photo upload</option><option value="logo">Team logo</option></SelectField><Field label="Placeholder" value={field.placeholder || ''} onChange={value => edit(field.id,{placeholder:value})}/><Field label="Character limit" type="number" value={field.maxLength ?? ''} onChange={value => edit(field.id,{maxLength:value === '' ? null : Number(value)})}/><Field label="Help text" value={field.help || ''} onChange={value => edit(field.id,{help:value})}/>{field.type === 'select' && <div className="listing-form-grid__wide"><Field label="Choices, separated by commas" value={(field.options || []).join(', ')} onChange={value => edit(field.id,{options:value.split(',').map(item => item.trim()).filter(Boolean)})}/></div>}{field.type === 'logo' && <><SelectField label="Logo finish" value={field.logoTreatment || 'EXACT'} onChange={value => edit(field.id,{logoTreatment:value})}><option value="EXACT">Exact placement only</option><option value="FABRIC">Subtle fabric finish</option><option value="VINTAGE">Vintage print finish</option><option value="MONOCHROME">Monochrome finish</option></SelectField><Field label="Minimum logo pixels" type="number" value={field.minWidth ?? 800} onChange={value => edit(field.id,{minWidth:Number(value) || 800})}/><label className="listing-check listing-check--inline"><input type="checkbox" checked={field.allowAiFinish !== false} onChange={event => edit(field.id,{allowAiFinish:event.target.checked})}/><span><Sparkles size={12}/> Allow optional AI fabric finish</span></label><label className="listing-check listing-check--inline"><input type="checkbox" checked={field.requiresConsent !== false} onChange={event => edit(field.id,{requiresConsent:event.target.checked})}/><span><Lock size={12}/> Require customer logo permission</span></label></>}</div><PreviewRegionEditor field={field} image={draft.image} onChange={patch => edit(field.id,patch)}/><label className="listing-check"><input type="checkbox" checked={field.required} onChange={event => edit(field.id,{required:event.target.checked})}/><span><Check size={12}/> Require this answer before adding to bag</span></label></article>)}{!fields.length && <div className="listing-empty-inline"><Lock size={20}/><span>This product has no customer-editable fields. Add only the details supported by its artwork.</span></div>}</div></section>
}

function OrganizationPanel({ draft, update, allProducts }) {
  const [tagInput,setTagInput] = useState('')
  const tags = draft.tags || []
  const groups = [...new Set(allProducts.map(row => row.productGroup).filter(Boolean))]
  const addTags = () => { const next=tagInput.split(',').map(value=>slugify(value,'')).filter(Boolean); update('tags',[...new Set([...tags,...next])]); setTagInput('') }
  const merchant = draft.seo?.gmc || {}
  const legalReview = catalogLegalReview(draft)
  const catalogReview = draft.aiMetadata?.catalogReview || {}
  const readiness = googleMerchantReadiness(draft)
  const updateMerchant = patch => update('seo',{...(draft.seo || {}),gmc:{...merchant,...patch}})
  return <section className="listing-section listing-organization"><div className="listing-section__heading"><div><span>Catalogue routing</span><h2>Put the listing where it belongs.</h2><p>Manual tags describe the collection. Automatic filters derive sale, stock, video and customization signals from the listing itself.</p></div></div><div className="listing-form-grid"><Field label="Product type" value={draft.type || ''} onChange={value => update('type',value)} placeholder="READY TO SHIP"/><label className="listing-field"><span>Product group</span><input list="listing-groups" value={draft.productGroup || ''} onChange={event => update('productGroup',event.target.value)} placeholder="MEMORY JERSEYS"/><datalist id="listing-groups">{groups.map(group => <option key={group} value={group}/>)}</datalist><small>Products in the same group can be filtered together.</small></label><Field label="Collection / category" value={draft.taxonomy?.category || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),category:value})} placeholder="Football jerseys"/><Field label="Season / drop" value={draft.taxonomy?.season || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),season:value})} placeholder="Drop 01 / 2026"/><Field label="Audience" value={draft.taxonomy?.audience || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),audience:value})} placeholder="Unisex"/><Field label="Colour family" value={draft.taxonomy?.colorFamily || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),colorFamily:value})} placeholder="Black / acid"/></div><div className={`listing-subsection listing-legal-review ${legalReview.required && !legalReview.approved ? 'is-blocked' : 'is-approved'}`}><div className="listing-subsection__head"><div><span>CATALOGUE / RIGHTS CHECK</span><h3>{legalReview.required ? 'Verify team and brand references.' : 'No rights flag detected.'}</h3><p>{legalReview.required ? `This listing contains ${legalReview.reasons.join(' and ').toLowerCase().replaceAll('_',' ')}. Confirm the wording and source permission before publishing or sending it to search.` : 'Independent fan apparel wording is clear for the current title and tags.'}</p></div><span className="listing-merchant-status">{legalReview.required ? (legalReview.approved ? 'APPROVED' : 'REVIEW REQUIRED') : 'CLEAR'}</span></div>{legalReview.required && <div className="listing-form-grid"><SelectField label="Review decision" value={catalogReview.status || 'PENDING'} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,status:value,reviewedAt:value === 'APPROVED' ? new Date().toISOString() : null}})}><option value="PENDING">Pending review</option><option value="APPROVED">Approved by operator</option><option value="REJECTED">Rejected / revise listing</option></SelectField><Field label="Review note" value={catalogReview.note || ''} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,note:value}})} placeholder="What was verified?"/></div>}</div><div className="listing-subsection listing-merchant-subsection"><div className="listing-subsection__head"><div><span>GOOGLE MERCHANT CENTER / US</span><h3>Normalize the offer feed.</h3><p>These overrides are optional. The feed always uses the live price, stock, primary image and active SKU from the listing.</p></div><span className={`listing-merchant-status ${readiness.ready ? 'is-ready' : 'is-blocked'}`}>{readiness.ready ? 'READY' : 'NEEDS REVIEW'}</span></div><div className="listing-form-grid"><Field label="Store brand" value={merchant.brand || ''} onChange={value => updateMerchant({brand:value})} placeholder="Extra Time" hint="Use the brand shown on the garment. Do not use a league or team as the brand."/><Field label="Primary color" value={merchant.color || ''} onChange={value => updateMerchant({color:value})} placeholder="Green / gold" hint="Set the visible primary color so Google can match the image."/><SelectField label="Gender" value={merchant.gender || ''} onChange={value => updateMerchant({gender:value})}><option value="">Auto / unisex</option><option value="male">Male</option><option value="female">Female</option><option value="unisex">Unisex</option></SelectField><SelectField label="Age group" value={merchant.age_group || ''} onChange={value => updateMerchant({age_group:value})}><option value="">Auto / adult</option><option value="adult">Adult</option><option value="kids">Kids</option><option value="toddler">Toddler</option><option value="infant">Infant</option></SelectField><Field label="GTIN (only if manufacturer-issued)" value={merchant.gtin || ''} onChange={value => updateMerchant({gtin:value})} placeholder="Leave blank when unavailable"/><Field label="MPN (only if confirmed)" value={merchant.mpn || ''} onChange={value => updateMerchant({mpn:value})} placeholder="Leave blank when unavailable" hint="Only enter a manufacturer-assigned MPN you can verify. Internal SKUs are not MPNs."/><div className="listing-form-grid__wide"><Field label="Google product category" value={merchant.google_product_category || ''} onChange={value => updateMerchant({google_product_category:value})} placeholder="Apparel & Accessories > Clothing > Shirts & Tops"/><Field label="Merchant product type" value={merchant.product_type || ''} onChange={value => updateMerchant({product_type:value})} placeholder="Fan Apparel > Sports Jerseys"/></div></div>{readiness.blockers.length > 0 && <p className="listing-notice is-error">Feed blockers: {readiness.blockers.join(' · ')}</p>}{readiness.warnings.length > 0 && <p className="listing-notice">Review before submission: {readiness.warnings.join(' · ')}</p>}<small className="listing-merchant-help">Variants are grouped with one item group ID. Customer name/number/photo fields never become separate Merchant Center products.</small></div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Manual catalogue labels</span><h3>Tags</h3></div></div><div className="listing-tag-input"><input value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if(event.key === 'Enter'){event.preventDefault();addTags()} }} placeholder="memory, night-match, limited…"/><button disabled={!tagInput.trim()} title={!tagInput.trim() ? 'Enter at least one tag.' : 'Add tags'} onClick={addTags}><Plus size={14}/> Add</button></div><div className="listing-tags">{tags.map(tag => <span key={tag}>{tag}<button onClick={() => update('tags',tags.filter(item => item !== tag))} aria-label={`Remove ${tag}`}><X size={11}/></button>)}{!tags.length && <small>No manual tags yet.</small>}</div></div></section>
}

function PublishRail({ draft, update, completeness, automaticTags }) {
  const primary = draft.media?.find(item => item.url === draft.image) || draft.media?.find(item => item.type === 'IMAGE')
  return <aside className="listing-publish-rail"><div className="listing-reference"><div>{primary ? <img src={primary.url} alt={primary.alt || ''}/> : draft.image ? <img src={draft.image} alt="Primary listing reference"/> : <ImageIcon size={32}/>}</div><span>AI + STOREFRONT REFERENCE</span><strong>{draft.image ? 'Primary image ready' : 'Add a primary image'}</strong></div><div className="listing-publish-card"><span>Publishing</span><SelectField label="Listing status" value={draft.status} onChange={value => update('status',value)}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></SelectField><div className="listing-completeness"><div><strong>{completeness.percent}%</strong><span>listing complete</span></div><i><b style={{width:`${completeness.percent}%`}}/></i>{completeness.checks.map(item => <p key={item.key} className={item.done ? 'is-done' : ''}>{item.done ? <Check size={12}/> : <i/>}{item.label}</p>)}</div></div><div className="listing-auto-tags"><span>Automatic filters</span><div>{automaticTags.map(tag => <b key={tag}>{tag}</b>)}</div><p>Generated from status, product type, media, custom fields, sale price and live stock.</p></div><div className="listing-guard"><Lock size={16}/><div><strong>Artwork policy</strong><span>Customer data never becomes a SKU variation. The primary image remains the visual source of truth.</span></div></div></aside>
}

export default function ListingWorkspace({ products, onSaved, onDuplicate }) {
  const id = window.location.pathname.split('/').pop()
  const [newProduct] = useState(createProductDraft)
  const sourceProduct = products.find(product => product.id === id) || (id === 'new' ? newProduct : null)
  const [draft,setDraft] = useState(() => sourceProduct || {})
  const [active,setActive] = useState('story')
  const [saving,setSaving] = useState(false)
  const [dirty,setDirty] = useState(false)
  const [notice,setNotice] = useState('')
  useEffect(() => { if(sourceProduct && !dirty) setDraft(sourceProduct) },[sourceProduct?.id,sourceProduct?.updatedAt])
  useEffect(() => { const warn=event => { if(dirty){event.preventDefault();event.returnValue=''} }; window.addEventListener('beforeunload',warn); return()=>window.removeEventListener('beforeunload',warn) },[dirty])
  const update = (key,value) => { setDraft(current => key === null && typeof value === 'function' ? value(current) : ({...current,[key]:value})); setDirty(true) }
  const completeness = useMemo(() => productCompleteness(draft),[draft])
  const automaticTags = useMemo(() => {
    const variants=draft.variants || [], activeRows=variants.filter(row=>row.status==='ACTIVE'), total=activeRows.reduce((sum,row)=>sum+Number(row.inventory||0),0)
    const tags=[draft.status,draft.type,draft.productGroup].filter(Boolean).map(value=>slugify(value,''))
    if((draft.customFields||[]).length)tags.push('customizable'); if((draft.media||[]).some(item=>item.type==='VIDEO'))tags.push('has-video')
    if(draft.compareAt!=null&&Number(draft.compareAt)>Number(draft.price||0)||activeRows.some(row=>row.compareAt!=null&&Number(row.compareAt)>Number(row.price||0)))tags.push('sale')
    if(activeRows.length&&total===0)tags.push('out-of-stock'); else if(activeRows.length&&total<=10)tags.push('low-stock')
    return [...new Set(tags)]
  },[draft])
  const previewProduct = draft._persisted && draft.status === 'PUBLISHED' ? draft : null
  const save = async status => {
    setSaving(true); setNotice('')
    const candidate = status ? {...draft,status} : draft
    if(status) setDraft(candidate)
    try {
      const result = await saveAdminProduct(candidate)
      if(result.error){setNotice(`Not saved: ${result.error}`);return false}
      const saved=result.data || candidate
      setDraft(saved); onSaved(saved); setDirty(false)
      if(id === 'new' && result.source === 'supabase') navigate(`/admin/products/${saved.id}`)
      setNotice(result.source === 'supabase' ? (status === 'PUBLISHED' ? 'Published to Supabase.' : 'Draft saved to Supabase.') : 'Changes kept in this preview only; not published.')
      return true
    } catch(error){setNotice(`Not saved: ${error instanceof Error ? error.message : 'Please try again.'}`);return false}
    finally{setSaving(false)}
  }
  const duplicate = () => {
    const copy=duplicateProductDraft(draft,products)
    onDuplicate(copy)
    navigate(`/admin/products/${copy.id}`)
  }
  if(!sourceProduct) return <main className="admin-page"><h1>Listing not found</h1><button onClick={() => navigate('/admin/catalog')}>Back to products</button></main>
  return <main className="listing-workspace"><WorkspaceHeader draft={draft} dirty={dirty} saving={saving} previewProduct={previewProduct} onSave={save} onPublish={() => save('PUBLISHED')} onDuplicate={duplicate}/><div className="listing-workspace__body"><nav className="listing-spine" aria-label="Listing editor sections">{sections.map((section,index) => { const Icon=section.icon; const done=completeness.checks.find(item=>item.key===section.id)?.done; return <button key={section.id} className={active===section.id?'is-active':''} onClick={() => setActive(section.id)}><i>{done ? <Check size={11}/> : index+1}</i><Icon size={16}/><span><strong>{section.label}</strong><small>{section.copy}</small></span></button> })}</nav><div className="listing-workspace__editor">{active==='story'&&<StoryPanel draft={draft} update={update} dirty={dirty}/>} {active==='media'&&<MediaPanel draft={draft} update={update} dirty={dirty}/>} {active==='variants'&&<section className="listing-section"><VariantMatrix product={draft} onChange={value=>update('variants',value)} onOptionsChange={value=>update('options',value)} onProductChange={update}/></section>} {active==='custom'&&<CustomFieldsPanel draft={draft} update={update}/>} {active==='organization'&&<OrganizationPanel draft={draft} update={update} allProducts={products}/>}</div><PublishRail draft={draft} update={update} completeness={completeness} automaticTags={automaticTags}/></div><div className="listing-mobile-actions"><button disabled={saving} onClick={() => save()}><Save size={15}/>{saving?'Saving…':'Save changes'}</button><button disabled={saving||draft.status==='ARCHIVED'} onClick={() => save('PUBLISHED')}><PackageCheck size={15}/>Publish</button></div>{notice&&<div className={`listing-toast ${notice.startsWith('Not saved:')?'is-error':''}`} role={notice.startsWith('Not saved:')?'alert':'status'}>{notice.startsWith('Not saved:')?<X size={15}/>:<Check size={15}/>}<span>{notice}</span></div>}</main>
}
