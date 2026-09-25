import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ClipboardCheck, Copy, Eye, FileText,
  GripVertical, Image as ImageIcon, Layers3, Link2, ListFilter, LoaderCircle, Lock,
  MessageSquareText, PackageCheck, Plus, Save, SearchCheck, Sparkles, Trash2, Upload,
  Video, WandSparkles, X, RefreshCw
} from 'lucide-react'
import VariantMatrix from './VariantMatrix'
import { catalogLegalReview, createProductDraft, customFieldPresets, duplicateProductDraft, productCompleteness, seoReviewGate, slugify } from './lib/catalog-model'
import { googleMerchantReadiness } from './lib/google-merchant'
import { deleteAdminProduct, fetchAdminProduct, requestAiListingCopy, requestAiListingMedia, requestAiListingReview, saveAdminProduct, uploadProductMedia, supabase } from './lib/supabase'
import { CUSTOM_GUIDE_SLOT_ID, LISTING_MEDIA_SLOTS, MODEL_MEDIA_SLOT_IDS, listingMediaRole, listingMediaSlot } from './lib/listing-media'
import { normalizePreviewRegion } from './lib/customization-ai'
import { ACCESSORY_FAMILY_OPTIONS, ACCESSORY_TYPE_OPTIONS, CATALOG_CATEGORY_OPTIONS, SEASON_DROP_OPTIONS, accessoryTaxonomyForProduct } from './lib/catalog-taxonomy'
import { adminProducts } from './admin-data'
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

function WorkspaceHeader({ draft, dirty, saving, deleting, previewProduct, onSave, onPublish, onDuplicate, onDelete }) {
  return <header className="listing-workspace__header"><button className="listing-workspace__back" onClick={() => navigate('/admin/catalog')}><ArrowLeft size={15}/> Products</button><div className="listing-workspace__identity"><span>{draft._persisted ? 'LISTING' : 'UNSAVED DRAFT'} / {draft.sku}</span><h1>{draft.title || 'Untitled listing'}</h1></div><div className="listing-workspace__actions"><span className={`listing-dirty ${dirty ? 'is-dirty' : ''}`}><i/>{dirty ? 'Unsaved changes' : 'Up to date'}</span><button className="admin-button admin-button--danger" disabled={saving || deleting} title="Permanently delete this listing" onClick={onDelete}><Trash2 size={14}/> {deleting ? 'Deleting…' : 'Delete'}</button><button className="admin-button admin-button--outline" onClick={onDuplicate}><Copy size={14}/> Duplicate</button><button className="admin-button admin-button--outline" disabled={!previewProduct} title={previewProduct ? 'Open the current published storefront listing.' : 'Publish this listing before opening its storefront page.'} onClick={() => previewProduct && window.open(`/product/${previewProduct.handle || previewProduct.id}`, '_blank', 'noopener,noreferrer')}><Eye size={14}/> Preview</button><button className="admin-button admin-button--outline" disabled={saving || deleting} onClick={() => onSave()}><Save size={14}/>{saving ? 'Saving…' : 'Save changes'}</button><button className="admin-button admin-button--dark" disabled={saving || deleting || draft.status === 'ARCHIVED'} onClick={onPublish}><PackageCheck size={14}/> Publish</button></div></header>
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

const seoBlockerLabels = {
  PUBLISH_LISTING_FIRST:'Publish the listing first',
  PRIMARY_IMAGE_REQUIRED:'Add a primary image',
  TITLE_REQUIRED:'Add a product title',
  DESCRIPTION_160_CHARACTERS:'Write at least 160 characters of description',
  SEO_TITLE_30_60_CHARACTERS:'SEO title must be 30–60 characters',
  SEO_DESCRIPTION_120_CHARACTERS:'SEO description must be at least 120 characters',
  MEDIA_IMAGE_REQUIRED:'Attach at least one product image',
  ALT_TEXT_REQUIRED_ON_EVERY_IMAGE:'Add alt text to every product image',
  PRICED_IN_STOCK_VARIANT_REQUIRED:'Add a priced, in-stock active variant',
  RIGHTS_REVIEW_REQUIRED:'Review rights and affiliation language'
}

function SeoReviewGatePanel({ draft, update }) {
  const gate = seoReviewGate(draft)
  const status = String(draft.seoStatus || 'BLOCKED').toUpperCase()
  const review = draft.aiMetadata?.seoReview || {}
  const setStatus = nextStatus => {
    if (nextStatus === 'INDEXABLE' && !gate.ready) return
    update(null, current => ({
      ...current,
      seoStatus:nextStatus,
      seoQualityScore:gate.quality,
      seoBlockReasons:gate.blockers,
      aiMetadata:{ ...(current.aiMetadata || {}), seoReview:{ ...(current.aiMetadata?.seoReview || {}), status:nextStatus, reviewedAt:new Date().toISOString() } }
    }))
  }
  return <div className={`listing-subsection listing-seo-gate ${gate.ready ? 'is-ready' : 'is-blocked'}`}>
    <div className="listing-subsection__head"><div><span>INDEXING CONTROL</span><h3>SEO review gate</h3><p>A published, technically complete listing can enter the sitemap. A long SEO description and an unreviewed rights flag do not block indexing; Merchant Center applies separate policies.</p></div><span className={`listing-merchant-status ${gate.ready ? 'is-ready' : 'is-blocked'}`}>{status}</span></div>
    <div className="listing-seo-gate__summary"><strong>{gate.quality}/100</strong><span>{gate.ready ? 'Ready to approve for indexing' : `${gate.blockers.length} blocker${gate.blockers.length === 1 ? '' : 's'} before indexing`}</span></div>
    {gate.blockers.length > 0 && <div className="listing-seo-gate__issues"><span>Resolve these before approving</span>{gate.blockers.map(reason => <p key={reason}><i/> {seoBlockerLabels[reason] || reason}</p>)}</div>}
    {gate.warnings.length > 0 && <p className="listing-notice">Recommendations: {gate.warnings.map(reason => reason.replaceAll('_',' ').toLowerCase()).join(' · ')}</p>}
    <div className="listing-seo-gate__actions"><button type="button" className={status === 'BLOCKED' ? 'is-active' : ''} onClick={() => setStatus('BLOCKED')}>Blocked</button><button type="button" className={status === 'READY' ? 'is-active' : ''} onClick={() => setStatus('READY')}>Ready for review</button><button type="button" className={status === 'INDEXABLE' ? 'is-active' : ''} disabled={!gate.ready} title={!gate.ready ? 'Resolve every blocker first.' : 'Allow this published listing into search feeds.'} onClick={() => setStatus('INDEXABLE')}>Approve for indexing</button></div>
    {review.reviewedAt && <small className="listing-seo-gate__reviewed">Last reviewed {new Date(review.reviewedAt).toLocaleString()}</small>}
  </div>
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
  const runReview = async (options = {}) => {
    setReviewing(true); setReviewError(''); setReviewSuggestion(null); setAiOpen(true)
    try {
      const result = await requestAiListingReview(draft, { ...brief, ...options, direction:brief.direction || 'Read the complete listing, normalize the copy and identify the highest-value missing image roles.' })
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
  return <section className="listing-section listing-story"><div className="listing-section__heading"><div><span>Product story spine</span><h2>Make the design understandable.</h2><p>Write one source story first. Storefront copy, SEO and rich content should reinforce it rather than repeat unrelated claims.</p></div><div className="listing-ai-actions"><button className="listing-ai-audit-trigger" disabled={reviewing} onClick={() => runReview()}><ClipboardCheck size={16}/>{reviewing ? 'Reading listing…' : 'Review entire listing'}</button><button className="listing-ai-trigger" onClick={() => setAiOpen(value => !value)}><WandSparkles size={17}/>{aiOpen ? 'Close AI writer' : 'Write with AI'}</button></div></div>
    {aiOpen && <div className="listing-ai"><div className="listing-ai__intro"><Sparkles size={19}/><div><strong>{reviewSuggestion ? 'Full listing audit' : 'AI listing writer'}</strong><span>{reviewSuggestion ? 'AI inspected the current copy, SEO fields, story blocks and supplied product images. Nothing is saved until you apply it.' : 'The listing text and public product images are sent as a visual reference. Suggestions never overwrite fields until you apply them.'}</span></div></div>{!reviewSuggestion && <><AiBriefFields brief={brief} setBrief={setBrief}/><button className="listing-ai__generate" disabled={generating} onClick={generate}>{generating ? <LoaderCircle className="is-spinning" size={15}/> : <Sparkles size={15}/>} {generating ? 'Reading the story…' : 'Generate title, story & SEO'}</button>{aiError && <p className="listing-ai__error" role="alert">{aiError}</p>}{suggestion && <div className="listing-ai__result"><div><span>AI DRAFT / REVIEW BEFORE APPLYING</span><button onClick={() => setSuggestion(null)} aria-label="Discard AI draft"><X size={15}/></button></div><h3>{suggestion.title}</h3><strong>{suggestion.subtitle}</strong><p>{suggestion.description}</p><AiSuggestionDetails suggestion={suggestion}/><button onClick={() => applySuggestion()}><Check size={14}/> Apply this draft</button></div>}</>}{reviewing && <div className="listing-ai__loading"><LoaderCircle className="is-spinning" size={16}/> Reading all listing text and images…</div>}{reviewError && <div className="listing-ai__error" role="alert" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}><span>{reviewError}</span><button type="button" className="admin-button admin-button--outline" style={{ padding:'4px 8px', fontSize:12, whiteSpace:'nowrap', background:'rgba(255,255,255,0.1)' }} onClick={() => runReview({ skipVision: true })}>Retry (fast text audit)</button></div>}{reviewSuggestion && <div className="listing-ai__result listing-ai__result--audit"><div><span>FULL AUDIT / REVIEW BEFORE APPLYING</span><button onClick={() => setReviewSuggestion(null)} aria-label="Discard full listing audit"><X size={15}/></button></div><AiAuditSummary suggestion={reviewSuggestion}/><h3>{reviewSuggestion.title}</h3><strong>{reviewSuggestion.subtitle}</strong><p>{reviewSuggestion.description}</p><AiSuggestionDetails suggestion={reviewSuggestion}/><div className="listing-ai__result-actions"><button onClick={() => applySuggestion(reviewSuggestion)}><Check size={14}/> Apply content draft</button><button className="listing-secondary-action" disabled={generatingReviewMedia || !reviewPlans.length} title={!reviewPlans.length ? 'The audit did not identify a missing controlled image role.' : !draft._persisted ? 'Save the listing before generating images.' : dirty ? 'Save the listing before generating images.' : 'Generate the recommended missing images.'} onClick={generateReviewMedia}>{generatingReviewMedia ? <><LoaderCircle className="is-spinning" size={14}/> Creating {reviewMediaProgress.done}/{reviewMediaProgress.total}</> : <><ImageIcon size={14}/> Generate {reviewPlans.length ? `${reviewPlans.length} missing image${reviewPlans.length === 1 ? '' : 's'}` : 'recommended images'}</>}</button></div></div>}</div>}

    <div className="listing-form-grid listing-form-grid--story"><div className="listing-form-grid__wide"><Field label="Product title" value={draft.title} onChange={value => update('title',value)} maxLength={120} hint={`${(draft.title || '').length}/120 · Main product name shown across the storefront.`}/></div><Field label="URL handle" value={draft.handle} onChange={value => update('handle',slugify(value))} hint="Lowercase URL path; keep stable after publishing."/><Field label="Short story line" value={draft.subtitle || ''} onChange={value => update('subtitle',value)} maxLength={180} hint={`${(draft.subtitle || '').length}/180 · Used on product cards and the opening section.`}/><div className="listing-form-grid__wide"><Field label="Design story" type="textarea" rows={9} value={draft.description} onChange={value => update('description',value)} placeholder="What happened, what the visual symbols mean, and why this piece exists…" hint="Factual source narrative for customers and AI tools."/></div></div>

    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Search preview</span><h3>SEO metadata</h3></div><SearchCheck size={19}/></div><div className="listing-form-grid"><Field label="SEO title" value={seo.title || ''} onChange={value => update('seo',{...seo,title:value})} maxLength={60} hint={`${(seo.title || '').length}/60`}/><Field label="SEO description" type="textarea" rows={4} value={seo.description || ''} onChange={value => update('seo',{...seo,description:value})} hint={`${(seo.description || '').length} characters · write an accurate, useful summary`}/><div className="listing-form-grid__wide"><Field label="Keywords" value={(seo.keywords || []).join(', ')} onChange={value => update('seo',{...seo,keywords:value.split(',').map(item => item.trim()).filter(Boolean)})} placeholder="football memory, personalized jersey, extra time"/></div><SeoSignals seo={seo} onChange={value => update('seo',value)}/></div><div className="listing-search-preview"><span>{window.location.origin}/product/{draft.handle}</span><strong>{seo.title || draft.title || 'Product title'}</strong><p>{seo.description || draft.subtitle || 'Add a concise search description for this listing.'}</p></div></div>

    <SeoReviewGatePanel draft={draft} update={update}/>
    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Rich product page</span><h3>Content blocks</h3><p>Build the long-form product story and insert uploaded images or video between paragraphs.</p></div><div className="listing-block-add"><button onClick={() => addBlock('heading')}>+ Heading</button><button onClick={() => addBlock('paragraph')}>+ Text</button><button onClick={() => addBlock('quote')}>+ Quote</button><button onClick={() => addBlock('image')}>+ Image</button><button onClick={() => addBlock('video')}>+ Video</button></div></div><div className="listing-blocks">{blocks.map((block,index) => <article key={block.id} className="listing-block"><div className="listing-block__rail"><GripVertical size={15}/><span>{blockLabels[block.type] || block.type}</span><button disabled={index === 0} title={index === 0 ? 'This block is already first.' : 'Move block up'} onClick={() => moveBlock(index,-1)}><ArrowUp size={13}/></button><button disabled={index === blocks.length - 1} title={index === blocks.length - 1 ? 'This block is already last.' : 'Move block down'} onClick={() => moveBlock(index,1)}><ArrowDown size={13}/></button><button onClick={() => removeBlock(block.id)} aria-label="Remove content block"><Trash2 size={13}/></button></div>{['heading','paragraph','quote'].includes(block.type) ? <textarea rows={block.type === 'heading' ? 2 : 5} value={block.content || ''} onChange={event => updateBlock(block.id,{content:event.target.value})} placeholder={`Write ${blockLabels[block.type].toLowerCase()}…`}/> : <><label><span>Choose uploaded {block.type}</span><select value={block.mediaId || ''} onChange={event => { const media=draft.media.find(item => item.id === event.target.value); updateBlock(block.id,{mediaId:event.target.value,url:media?.url || ''}) }}><option value="">Select media</option>{(draft.media || []).filter(item => item.type === block.type.toUpperCase()).map(item => <option key={item.id} value={item.id}>{item.filename || item.alt || item.id}</option>)}</select><ChevronDown size={13}/></label>{block.type === 'image' && <Field label="Image caption" value={block.content || ''} onChange={value => updateBlock(block.id,{content:value})} placeholder="Explain the value, detail or difference shown"/>}{block.url && (block.type === 'image' ? <img src={block.url} alt={draft.media.find(item => item.id === block.mediaId)?.alt || draft.title || 'Product story image'}/> : <video src={block.url} controls preload="metadata"/>)}</>}</article>)}{!blocks.length && <div className="listing-empty-inline"><FileText size={20}/><span>Add structured blocks to tell the design story beyond the short description.</span></div>}</div></div>
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

function MediaCard({ item, index, draft, update, updateMedia, move, remove, media }) {
  const [dim, setDim] = useState(null)
  return (
    <article className={`listing-media-card ${draft.image === item.url ? 'is-primary' : ''}`}>
      <div className="listing-media-card__visual">
        {item.type === 'VIDEO' ? (
          <video src={item.url} controls preload="metadata" />
        ) : (
          <img
            src={item.url}
            alt={item.alt || ''}
            onLoad={e => {
              if (e.target.naturalWidth && e.target.naturalHeight) {
                setDim({ width: e.target.naturalWidth, height: e.target.naturalHeight })
              }
            }}
          />
        )}
        <span>{item.type}</span>
        {dim && <span className="listing-media-dimensions">{dim.width} × {dim.height}</span>}
        {draft.image === item.url && <strong>PRIMARY</strong>}
      </div>
      <div className="listing-media-card__body">
        <p title={item.filename || 'Uploaded media'}>
          {item.filename || 'Uploaded media'}
          {dim ? ` · ${dim.width}×${dim.height}` : ''}
        </p>
        <Field
          label="Alt text"
          value={item.alt || ''}
          onChange={value => updateMedia(item.id, { alt: value })}
          placeholder="Describe what is visible"
          hint="Needed for accessibility and image search."
        />
        <div>
          <button
            disabled={item.type !== 'IMAGE' || draft.image === item.url}
            title={
              item.type !== 'IMAGE'
                ? 'Only images can be the primary listing reference.'
                : draft.image === item.url
                  ? 'This is already the primary image.'
                  : 'Use as primary listing image'
            }
            onClick={() => update('image', item.url)}
          >
            <Check size={13} /> Set primary
          </button>
          <button
            type="button"
            title="Open original image in new tab"
            onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
          >
            <Eye size={13} />
          </button>
          <button
            disabled={index === 0}
            title={index === 0 ? 'Already first.' : 'Move earlier'}
            onClick={() => move(index, -1)}
          >
            <ArrowLeft size={13} />
          </button>
          <button
            disabled={index === media.length - 1}
            title={index === media.length - 1 ? 'Already last.' : 'Move later'}
            onClick={() => move(index, 1)}
          >
            <ArrowRight size={13} />
          </button>
          <button onClick={() => remove(item)} aria-label="Detach media">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  )
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
  return <section className="listing-section listing-media"><div className="listing-section__heading"><div><span>Listing media library</span><h2>Show the real piece.</h2><p>Upload production photos and product video directly. The primary image is also the reference used by customer AI editing.</p></div><><input ref={inputRef} className="listing-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" multiple onChange={upload}/><button className="listing-primary-action" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="is-spinning" size={16}/> : <Upload size={16}/>} {uploading ? 'Uploading…' : 'Upload media'}</button></></div><div className="listing-media-rules"><span><ImageIcon size={15}/> Images: JPG, PNG, WebP, AVIF · up to 15 MB</span><span><Video size={15}/> Video: MP4, WebM · up to 80 MB</span><span><Lock size={15}/> Removing a tile only detaches it from this listing</span></div>{notice && <p className={notice.startsWith('Upload failed:') ? 'listing-notice is-error' : 'listing-notice'} role={notice.startsWith('Upload failed:') ? 'alert' : 'status'}>{notice}</p>}<EditorialMediaSet draft={draft} update={update} dirty={dirty} onNotice={setNotice}/><div className="listing-media-grid">{media.map((item,index) => <MediaCard key={item.id} item={item} index={index} draft={draft} update={update} updateMedia={updateMedia} move={move} remove={remove} media={media} />)}{!media.length && <button className="listing-media-empty" onClick={() => inputRef.current?.click()}><Upload size={23}/><strong>Upload the first product image</strong><span>Use a real mockup or production photo. Add a short video after the image set.</span></button>}</div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Fallback reference</span><h3>Primary image URL</h3></div><Link2 size={18}/></div><Field label="Public image URL" value={draft.image || ''} onChange={value => update('image',value)} hint="Useful for an existing CDN asset. Uploading above is recommended."/></div></section>
}

function PreviewRegionEditor({ field, image, onChange }) {
  const region = normalizePreviewRegion(field.previewRegion)
  const [drawing,setDrawing] = useState(null)
  const [drawMode,setDrawMode] = useState(false)
  const figureRef = useRef(null)
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
  const pointFromEvent = event => {
    const bounds = figureRef.current?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) return null
    return {
      x:Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
      y:Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100))
    }
  }
  const beginDrawing = event => {
    if (!image || (!drawMode && !region) || event.button !== 0) return
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrawing({ startX:point.x, startY:point.y, x:point.x, y:point.y, width:0, height:0 })
    event.preventDefault()
  }
  const updateDrawing = event => {
    if (!drawing) return
    const point = pointFromEvent(event)
    if (!point) return
    const x = Math.min(drawing.startX, point.x)
    const y = Math.min(drawing.startY, point.y)
    setDrawing({ ...drawing, x, y, width:Math.abs(point.x - drawing.startX), height:Math.abs(point.y - drawing.startY) })
  }
  const finishDrawing = event => {
    if (!drawing) return
    const point = pointFromEvent(event) || { x:drawing.x + drawing.width, y:drawing.y + drawing.height }
    const x = Math.min(drawing.startX, point.x)
    const y = Math.min(drawing.startY, point.y)
    const width = Math.abs(point.x - drawing.startX)
    const height = Math.abs(point.y - drawing.startY)
    setDrawing(null)
    if (width < 1 || height < 1) return
    setDrawMode(false)
    onChange({ previewRegion:{ x, y, width:Math.min(width,100 - x), height:Math.min(height,100 - y) } })
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  return <div className={`listing-region-editor ${field.type === 'logo' ? 'is-logo' : ''} ${region ? 'is-enabled' : ''}`}>
    <div className="listing-region-editor__head"><div><strong>{field.type === 'logo' ? 'Approved logo slot' : 'Exact image edit area'}</strong><span>{region ? (field.type === 'logo' ? 'Drag across the image to redraw the exact logo rectangle. The original artwork stays locked outside it.' : 'Drag across the image to redraw the only rectangle where this field may change.') : drawMode ? 'Drag from one corner to the other. Nothing is saved until a rectangle is drawn.' : 'Preview stays disabled until a designer draws this field’s exact area on the source image.'}</span></div>{region ? <button onClick={() => { setDrawMode(false); onChange({previewRegion:null}) }}><X size={13}/> Disable</button> : drawMode ? <button onClick={() => setDrawMode(false)}><X size={13}/> Cancel</button> : <button disabled={!image} title={!image ? 'Add a primary image before defining an edit area.' : 'Draw the exact editable area on the source image.'} onClick={() => image && setDrawMode(true)}><Plus size={13}/> Draw area</button>}</div>
    {(region || drawMode) && <div className="listing-region-editor__body">
      {image ? <figure ref={figureRef} onPointerDown={beginDrawing} onPointerMove={updateDrawing} onPointerUp={finishDrawing} onPointerCancel={() => setDrawing(null)} onDragStart={event => event.preventDefault()}><img src={image} alt={`Draw the ${field.label || field.key} edit area`}/>{(drawing || region) && <i style={{ left:`${(drawing || region).x}%`, top:`${(drawing || region).y}%`, width:`${(drawing || region).width}%`, height:`${(drawing || region).height}%` }}><span>{field.label || field.key}</span></i>}</figure> : <div className="listing-region-editor__missing"><ImageIcon size={19}/><span>Add a primary image before positioning this area.</span></div>}
      {region && <div className="listing-region-coordinates">{[['x','Left'],['y','Top'],['width','Width'],['height','Height']].map(([key,label]) => <label key={key}><span>{label} %</span><input type="number" min={key === 'x' || key === 'y' ? 0 : 1} max="100" step="1" value={Math.round(region[key] * 10) / 10} onChange={event => setRegion({[key]:Number(event.target.value)})}/></label>)}</div>}
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

function LegacyOrganizationPanel({ draft, update, allProducts }) {
  const [tagInput,setTagInput] = useState('')
  const tags = draft.tags || []
  const groups = [...new Set(allProducts.map(row => row.productGroup).filter(Boolean))]
  const existingCategories = [...new Set(allProducts.map(row => row.taxonomy?.category).filter(Boolean))]
  const existingSeasons = [...new Set(allProducts.map(row => row.taxonomy?.season).filter(Boolean))]
  const categoryOptions = [...CATALOG_CATEGORY_OPTIONS, ...existingCategories.filter(value => !CATALOG_CATEGORY_OPTIONS.some(option => option.value === value)).map(value => ({ value, label:`Existing value · ${value}` }))]
  const seasonOptions = [...SEASON_DROP_OPTIONS, ...existingSeasons.filter(value => !SEASON_DROP_OPTIONS.some(option => option.value === value)).map(value => ({ value, label:`Existing value · ${value}` }))]
  const addTags = () => { const next=tagInput.split(',').map(value=>slugify(value,'')).filter(Boolean); update('tags',[...new Set([...tags,...next])]); setTagInput('') }
  const merchant = draft.seo?.gmc || {}
  const legalReview = catalogLegalReview(draft)
  const catalogReview = draft.aiMetadata?.catalogReview || {}
  const readiness = googleMerchantReadiness(draft)
  const updateMerchant = patch => update('seo',{...(draft.seo || {}),gmc:{...merchant,...patch}})
  return <section className="listing-section listing-organization"><div className="listing-section__heading"><div><span>Catalogue routing</span><h2>Put the listing where it belongs.</h2><p>Manual tags describe the collection. Automatic filters derive sale, stock, video and customization signals from the listing itself.</p></div></div><div className="listing-form-grid"><Field label="Product type" value={draft.type || ''} onChange={value => update('type',value)} placeholder="READY TO SHIP"/><label className="listing-field"><span>Product group</span><input list="listing-groups" value={draft.productGroup || ''} onChange={event => update('productGroup',event.target.value)} placeholder="MEMORY JERSEYS"/><datalist id="listing-groups">{groups.map(group => <option key={group} value={group}/>)}</datalist><small>Products in the same group can be filtered together.</small></label><Field label="Collection / category" value={draft.taxonomy?.category || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),category:value})} placeholder="Football jerseys"/><Field label="Season / drop" value={draft.taxonomy?.season || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),season:value})} placeholder="Drop 01 / 2026"/><Field label="Audience" value={draft.taxonomy?.audience || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),audience:value})} placeholder="Unisex"/><Field label="Colour family" value={draft.taxonomy?.colorFamily || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),colorFamily:value})} placeholder="Black / acid"/></div><div className={`listing-subsection listing-legal-review ${legalReview.required && !legalReview.approved ? 'is-blocked' : 'is-approved'}`}><div className="listing-subsection__head"><div><span>CATALOGUE / RIGHTS CHECK</span><h3>{legalReview.required ? 'Verify brand and trademark references.' : 'No rights flag detected.'}</h3><p>{legalReview.required ? `This listing contains ${legalReview.reasons.join(' and ').toLowerCase().replaceAll('_',' ')}. Review the wording and permissions separately. This warning does not block publication or indexing.` : 'Independent fan apparel wording is clear for the current title, tags and brand.'}</p></div><span className="listing-merchant-status">{legalReview.required ? (legalReview.approved ? 'APPROVED' : 'REVIEW REQUIRED') : 'CLEAR'}</span></div>{legalReview.required && <div className="listing-form-grid"><SelectField label="Review decision" value={catalogReview.status || 'PENDING'} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,status:value,reviewedAt:value === 'APPROVED' ? new Date().toISOString() : null}})}><option value="PENDING">Pending review</option><option value="APPROVED">Approved by operator</option><option value="REJECTED">Rejected / revise listing</option></SelectField><Field label="Review note" value={catalogReview.note || ''} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,note:value}})} placeholder="What was verified?"/></div>}</div><div className="listing-subsection listing-merchant-subsection"><div className="listing-subsection__head"><div><span>GOOGLE MERCHANT CENTER / US</span><h3>Normalize the offer feed.</h3><p>These overrides are optional. The feed always uses the live price, stock, primary image and active SKU from the listing.</p></div><span className={`listing-merchant-status ${readiness.ready ? 'is-ready' : 'is-blocked'}`}>{readiness.ready ? 'READY' : 'NEEDS REVIEW'}</span></div><div className="listing-form-grid"><Field label="Store brand" value={merchant.brand || ''} onChange={value => updateMerchant({brand:value})} placeholder="Extra Time" hint="Use the brand shown on the garment. Do not use a league or team as the brand."/><Field label="Primary color" value={merchant.color || ''} onChange={value => updateMerchant({color:value})} placeholder="Green / gold" hint="Set the visible primary color so Google can match the image."/><SelectField label="Gender" value={merchant.gender || ''} onChange={value => updateMerchant({gender:value})}><option value="">Auto / unisex</option><option value="male">Male</option><option value="female">Female</option><option value="unisex">Unisex</option></SelectField><SelectField label="Age group" value={merchant.age_group || ''} onChange={value => updateMerchant({age_group:value})}><option value="">Auto / adult</option><option value="adult">Adult</option><option value="kids">Kids</option><option value="toddler">Toddler</option><option value="infant">Infant</option></SelectField><Field label="GTIN (only if manufacturer-issued)" value={merchant.gtin || ''} onChange={value => updateMerchant({gtin:value})} placeholder="Leave blank when unavailable"/><Field label="MPN (only if confirmed)" value={merchant.mpn || ''} onChange={value => updateMerchant({mpn:value})} placeholder="Leave blank when unavailable" hint="Only enter a manufacturer-assigned MPN you can verify. Internal SKUs are not MPNs."/><div className="listing-form-grid__wide"><Field label="Google product category" value={merchant.google_product_category || ''} onChange={value => updateMerchant({google_product_category:value})} placeholder="Apparel & Accessories > Clothing > Shirts & Tops"/><Field label="Merchant product type" value={merchant.product_type || ''} onChange={value => updateMerchant({product_type:value})} placeholder="Fan Apparel > Sports Jerseys"/></div></div>{readiness.blockers.length > 0 && <p className="listing-notice is-error">Feed blockers: {readiness.blockers.join(' · ')}</p>}{readiness.warnings.length > 0 && <p className="listing-notice">Review before submission: {readiness.warnings.join(' · ')}</p>}<small className="listing-merchant-help">Variants are grouped with one item group ID. Customer name/number/photo fields never become separate Merchant Center products.</small></div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Manual catalogue labels</span><h3>Tags</h3></div></div><div className="listing-tag-input"><input value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if(event.key === 'Enter'){event.preventDefault();addTags()} }} placeholder="memory, night-match, limited…"/><button disabled={!tagInput.trim()} title={!tagInput.trim() ? 'Enter at least one tag.' : 'Add tags'} onClick={addTags}><Plus size={14}/> Add</button></div><div className="listing-tags">{tags.map(tag => <span key={tag}>{tag}<button onClick={() => update('tags',tags.filter(item => item !== tag))} aria-label={`Remove ${tag}`}><X size={11}/></button></span>)}{!tags.length && <small>No manual tags yet.</small>}</div></div></section>
}

function OrganizationPanelLegacy({ draft, update, allProducts }) {
  const [tagInput,setTagInput] = useState('')
  const tags = draft.tags || []
  const groups = [...new Set(allProducts.map(row => row.productGroup).filter(Boolean))]
  const categoryOptions = [...CATALOG_CATEGORY_OPTIONS, ...[...new Set(allProducts.map(row => row.taxonomy?.category).filter(Boolean))].filter(value => !CATALOG_CATEGORY_OPTIONS.some(option => option.value === value)).map(value => ({ value, label:`Existing value · ${value}` }))]
  const seasonOptions = [...SEASON_DROP_OPTIONS, ...[...new Set(allProducts.map(row => row.taxonomy?.season).filter(Boolean))].filter(value => !SEASON_DROP_OPTIONS.some(option => option.value === value)).map(value => ({ value, label:`Existing value · ${value}` }))]
  const taxonomy = draft.taxonomy || {}
  const updateTaxonomy = patch => update('taxonomy',{...taxonomy,...patch})
  const addTags = () => { const next=tagInput.split(',').map(value => slugify(value,'')).filter(Boolean); update('tags',[...new Set([...tags,...next])]); setTagInput('') }
  const merchant = draft.seo?.gmc || {}
  const updateMerchant = patch => update('seo',{...(draft.seo || {}),gmc:{...merchant,...patch}})
  const legalReview = catalogLegalReview(draft)
  const catalogReview = draft.aiMetadata?.catalogReview || {}
  const readiness = googleMerchantReadiness(draft)
  return <section className="listing-section listing-organization"><div className="listing-section__heading"><div><span>Catalogue routing</span><h2>Put the listing where it belongs.</h2><p>Category and season are controlled lists so collection filters, SEO and feeds stay consistent. Existing legacy values remain visible and marked instead of being erased.</p></div></div><div className="listing-form-grid"><Field label="Product type" value={draft.type || ''} onChange={value => update('type',value)} placeholder="READY TO SHIP"/><label className="listing-field"><span>Product group</span><input list="listing-groups-controlled" value={draft.productGroup || ''} onChange={event => update('productGroup',event.target.value)} placeholder="MEMORY JERSEYS"/><datalist id="listing-groups-controlled">{groups.map(group => <option key={group} value={group}/>)}</datalist><small>Products in the same group can be filtered together.</small></label><SelectField label="Collection / category" value={taxonomy.category || ''} onChange={value => updateTaxonomy({category:value})} hint="Choose a controlled category; no free text is accepted here."><option value="">Choose category…</option>{categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField><SelectField label="Season / drop" value={taxonomy.season || ''} onChange={value => updateTaxonomy({season:value})} hint="Choose a configured drop or Evergreen."><option value="">Choose season / drop…</option>{seasonOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField><Field label="Audience" value={taxonomy.audience || ''} onChange={value => updateTaxonomy({audience:value})} placeholder="Unisex"/><Field label="Colour family" value={taxonomy.colorFamily || ''} onChange={value => updateTaxonomy({colorFamily:value})} placeholder="Black / acid"/></div><div className={`listing-subsection listing-legal-review ${legalReview.required && !legalReview.approved ? 'is-blocked' : 'is-approved'}`}><div className="listing-subsection__head"><div><span>CATALOGUE / RIGHTS CHECK</span><h3>{legalReview.required ? 'Verify brand and trademark references.' : 'No rights flag detected.'}</h3><p>{legalReview.required ? `This listing contains ${legalReview.reasons.join(' and ').toLowerCase().replaceAll('_',' ')}. Review the wording and permissions separately. This warning does not block publication or indexing.` : 'Independent fan apparel wording is clear for the current title, tags and brand.'}</p></div><span className="listing-merchant-status">{legalReview.required ? (legalReview.approved ? 'APPROVED' : 'REVIEW REQUIRED') : 'CLEAR'}</span></div>{legalReview.required && <div className="listing-form-grid"><SelectField label="Review decision" value={catalogReview.status || 'PENDING'} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,status:value,reviewedAt:value === 'APPROVED' ? new Date().toISOString() : null}})}><option value="PENDING">Pending review</option><option value="APPROVED">Approved by operator</option><option value="REJECTED">Rejected / revise listing</option></SelectField><Field label="Review note" value={catalogReview.note || ''} onChange={value => update('aiMetadata',{...(draft.aiMetadata || {}),catalogReview:{...catalogReview,note:value}})} placeholder="What was verified?"/></div>}</div><div className="listing-subsection listing-merchant-subsection"><div className="listing-subsection__head"><div><span>GOOGLE MERCHANT CENTER / US</span><h3>Normalize the offer feed.</h3><p>Overrides are optional. The feed always uses the live price, stock, primary image and active SKU.</p></div><span className={`listing-merchant-status ${readiness.ready ? 'is-ready' : 'is-blocked'}`}>{readiness.ready ? 'READY' : 'NEEDS REVIEW'}</span></div><div className="listing-form-grid"><Field label="Store brand" value={merchant.brand || ''} onChange={value => updateMerchant({brand:value})} placeholder="Jersevo"/><Field label="Primary color" value={merchant.color || ''} onChange={value => updateMerchant({color:value})} placeholder="Green / gold"/><SelectField label="Gender" value={merchant.gender || ''} onChange={value => updateMerchant({gender:value})}><option value="">Auto / unisex</option><option value="male">Male</option><option value="female">Female</option><option value="unisex">Unisex</option></SelectField><SelectField label="Age group" value={merchant.age_group || ''} onChange={value => updateMerchant({age_group:value})}><option value="">Auto / adult</option><option value="adult">Adult</option><option value="kids">Kids</option><option value="toddler">Toddler</option><option value="infant">Infant</option></SelectField><Field label="GTIN (only if manufacturer-issued)" value={merchant.gtin || ''} onChange={value => updateMerchant({gtin:value})} placeholder="Leave blank when unavailable"/><Field label="MPN (only if confirmed)" value={merchant.mpn || ''} onChange={value => updateMerchant({mpn:value})} placeholder="Leave blank when unavailable"/><div className="listing-form-grid__wide"><Field label="Google product category" value={merchant.google_product_category || ''} onChange={value => updateMerchant({google_product_category:value})} placeholder="Apparel & Accessories > Clothing > Shirts & Tops"/><Field label="Merchant product type" value={merchant.product_type || ''} onChange={value => updateMerchant({product_type:value})} placeholder="Fan Apparel > Sports Jerseys"/></div></div>{readiness.blockers.length > 0 && <p className="listing-notice is-error">Feed blockers: {readiness.blockers.join(' · ')}</p>}{readiness.warnings.length > 0 && <p className="listing-notice">Review before submission: {readiness.warnings.join(' · ')}</p>}<small className="listing-merchant-help">Personalization fields do not become separate Merchant Center products.</small></div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Manual catalogue labels</span><h3>Tags</h3></div></div><div className="listing-tag-input"><input value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if(event.key === 'Enter'){event.preventDefault();addTags()} }} placeholder="memory, night-match, limited…"/><button disabled={!tagInput.trim()} onClick={addTags}><Plus size={14}/> Add</button></div><div className="listing-tags">{tags.map(tag => <span key={tag}>{tag}<button onClick={() => update('tags',tags.filter(item => item !== tag))} aria-label={`Remove ${tag}`}><X size={11}/></button></span>)}{!tags.length && <small>No manual tags yet.</small>}</div></div></section>
}

function AccessoryRoutingPanel({ draft, update }) {
  const taxonomy = draft.taxonomy || {}
  const inferred = accessoryTaxonomyForProduct(draft)
  const enabled = taxonomy.category === 'Accessories' || inferred.isAccessory
  if (!enabled) return null
  const family = taxonomy.accessoryCategory || inferred.family || ''
  const currentType = taxonomy.accessoryType || inferred.type || ''
  const types = ACCESSORY_TYPE_OPTIONS.filter(option => !family || option.family === family)
  const setTaxonomy = patch => update('taxonomy',{ ...taxonomy, ...patch })
  const setFamily = value => {
    const nextTypes = ACCESSORY_TYPE_OPTIONS.filter(option => option.family === value)
    setTaxonomy({ accessoryCategory:value, accessoryType:nextTypes.some(option => option.value === currentType) ? currentType : '' })
  }
  return <section className="listing-section listing-accessory-routing"><div className="listing-section__heading"><div><span>Accessories / browse structure</span><h2>Make every accessory easy to find.</h2><p>Choose a broad department and an optional product type. Existing listings are inferred from their group and title, so older products stay visible while you refine them.</p></div></div><div className="listing-form-grid"><SelectField label="Accessory department" value={family} onChange={setFamily} hint="First-level navigation used on the Accessories landing page."><option value="">Choose department…</option>{ACCESSORY_FAMILY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField><SelectField label="Accessory type" value={currentType} onChange={value => setTaxonomy({ accessoryType:value })} hint="Optional second-level filter for a more precise catalogue."><option value="">Choose type…</option>{types.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField></div></section>
}

function OrganizationPanel({ draft, update, allProducts }) {
  return <><OrganizationPanelLegacy draft={draft} update={update} allProducts={allProducts}/><AccessoryRoutingPanel draft={draft} update={update}/></>
}

function PublishRail({ draft, update, completeness, automaticTags }) {
  const primary = draft.media?.find(item => item.url === draft.image) || draft.media?.find(item => item.type === 'IMAGE')
  const [refDim, setRefDim] = useState(null)
  return (
    <aside className="listing-publish-rail">
      <div className="listing-reference">
        <div>
          {primary ? (
            <img
              src={primary.url}
              alt={primary.alt || ''}
              onLoad={e => {
                if (e.target.naturalWidth && e.target.naturalHeight) {
                  setRefDim({ width: e.target.naturalWidth, height: e.target.naturalHeight })
                }
              }}
            />
          ) : draft.image ? (
            <img
              src={draft.image}
              alt="Primary listing reference"
              onLoad={e => {
                if (e.target.naturalWidth && e.target.naturalHeight) {
                  setRefDim({ width: e.target.naturalWidth, height: e.target.naturalHeight })
                }
              }}
            />
          ) : (
            <ImageIcon size={32} />
          )}
        </div>
        <span>AI + STOREFRONT REFERENCE</span>
        <strong>
          {draft.image
            ? `Primary image ready${refDim ? ` · ${refDim.width}×${refDim.height}` : ''}`
            : 'Add a primary image'}
        </strong>
      </div>
      <div className="listing-publish-card">
        <span>Publishing</span>
        <SelectField label="Listing status" value={draft.status} onChange={value => update('status', value)}>
          <option>DRAFT</option>
          <option>PUBLISHED</option>
          <option>ARCHIVED</option>
        </SelectField>
        <div className="listing-completeness">
          <div>
            <strong>{completeness.percent}%</strong>
            <span>listing complete</span>
          </div>
          <i><b style={{ width: `${completeness.percent}%` }} /></i>
          {completeness.checks.map(item => (
            <p key={item.key} className={item.done ? 'is-done' : ''}>
              {item.done ? <Check size={12} /> : <i />}
              {item.label}
            </p>
          ))}
        </div>
        {(() => {
          const legalReview = catalogLegalReview(draft)
          if (!legalReview.required) return null
          return (
            <div style={{ marginTop: 12, padding: 10, background: legalReview.approved ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.12)', border: `1px solid ${legalReview.approved ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: legalReview.approved ? '#4ade80' : '#f87171' }}>
                  {legalReview.approved ? '✓ RIGHTS REVIEWED' : '⚠ RIGHTS REVIEW ADVISED'}
                </span>
              </div>
              <p style={{ fontSize: 12, margin: '4px 0 8px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
                {legalReview.approved ? 'Verified by operator.' : `Referenced: ${legalReview.reasons.join(', ')}. This warning does not block publication or indexing.`}
              </p>
              {!legalReview.approved ? (
                <button
                  type="button"
                  className="admin-button admin-button--outline"
                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', justifyContent: 'center', background: 'rgba(255,255,255,0.1)' }}
                  onClick={() => {
                    update('aiMetadata', {
                      ...(draft.aiMetadata || {}),
                      catalogReview: {
                        ...(draft.aiMetadata?.catalogReview || {}),
                        status: 'APPROVED',
                        reviewedAt: new Date().toISOString()
                      }
                    })
                  }}
                >
                  Duyệt bản quyền (Approve)
                </button>
              ) : (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  onClick={() => {
                    update('aiMetadata', {
                      ...(draft.aiMetadata || {}),
                      catalogReview: {
                        ...(draft.aiMetadata?.catalogReview || {}),
                        status: 'PENDING',
                        reviewedAt: null
                      }
                    })
                  }}
                >
                  Hủy duyệt (Revoke)
                </button>
              )}
            </div>
          )
        })()}
      </div>
      <div className="listing-auto-tags">
        <span>Automatic filters</span>
        <div>{automaticTags.map(tag => <b key={tag}>{tag}</b>)}</div>
        <p>Generated from status, product type, media, custom fields, sale price and live stock.</p>
      </div>
      <div className="listing-guard">
        <Lock size={16} />
        <div>
          <strong>Artwork policy</strong>
          <span>Customer data never becomes a SKU variation. The primary image remains the visual source of truth.</span>
        </div>
      </div>
    </aside>
  )
}

export default function ListingWorkspace({ products, onSaved, onDuplicate, onDelete }) {
  const id = window.location.pathname.split('/').pop()
  const [newProduct] = useState(createProductDraft)
  const sourceProduct = products.find(product => product.id === id) || (id === 'new' ? newProduct : adminProducts.find(product => product.id === id) || null)
  const [fetchedProduct, setFetchedProduct] = useState(null)
  const [fetching, setFetching] = useState(id !== 'new' && Boolean(sourceProduct?._catalogSummary || !sourceProduct))
  const effectiveProduct = fetchedProduct || sourceProduct
  const [draft,setDraft] = useState(() => effectiveProduct || {})
  const [active,setActive] = useState('story')
  const [saving,setSaving] = useState(false)
  const [deleting,setDeleting] = useState(false)
  const [dirty,setDirty] = useState(false)
  const [notice,setNotice] = useState('')

  useEffect(() => {
    if ((sourceProduct && !sourceProduct._catalogSummary) || id === 'new' || !supabase) return
    let activeReq = true
    setFetching(true)
    const runQuery = async () => {
      try {
        if (!activeReq) return
        const result = await fetchAdminProduct(id)
        if (result.data) {
          setFetchedProduct(result.data)
          if (!dirty) setDraft(result.data)
        }
      } catch (err) {
        console.warn('ListingWorkspace fetch exception:', err)
      } finally {
        if (activeReq) setFetching(false)
      }
    }
    runQuery()
    return () => { activeReq = false }
  }, [id, sourceProduct])

  useEffect(() => { if(effectiveProduct && !dirty) setDraft(effectiveProduct) },[effectiveProduct?.id,effectiveProduct?.updatedAt])
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
  const removeListing = async () => {
    if (!window.confirm(`Permanently delete "${draft.title || draft.name || draft.id}"? This action cannot be undone.`)) return
    setDeleting(true)
    setNotice('')
    try {
      const result = await deleteAdminProduct(draft.id)
      if (result.error) {
        setNotice(`Not saved: ${result.error}`)
        return
      }
      onDelete?.(draft.id)
      navigate('/admin/catalog')
    } catch (err) {
      setNotice(`Not saved: ${err instanceof Error ? err.message : 'Delete failed.'}`)
    } finally {
      setDeleting(false)
    }
  }
  if(fetching) return <main className="admin-page"><p role="status">Loading listing…</p></main>
  if(!effectiveProduct) return <main className="admin-page"><h1>Listing not found</h1><button onClick={() => navigate('/admin/catalog')}>Back to products</button></main>
  return <main className="listing-workspace"><WorkspaceHeader draft={draft} dirty={dirty} saving={saving} deleting={deleting} previewProduct={previewProduct} onSave={save} onPublish={() => save('PUBLISHED')} onDuplicate={duplicate} onDelete={removeListing}/><div className="listing-workspace__body"><nav className="listing-spine" aria-label="Listing editor sections">{sections.map((section,index) => { const Icon=section.icon; const done=completeness.checks.find(item=>item.key===section.id)?.done; return <button key={section.id} className={active===section.id?'is-active':''} onClick={() => setActive(section.id)}><i>{done ? <Check size={11}/> : index+1}</i><Icon size={16}/><span><strong>{section.label}</strong><small>{section.copy}</small></span></button> })}</nav><div className="listing-workspace__editor">{active==='story'&&<StoryPanel draft={draft} update={update} dirty={dirty}/>} {active==='media'&&<MediaPanel draft={draft} update={update} dirty={dirty}/>} {active==='variants'&&<section className="listing-section"><VariantMatrix product={draft} onChange={value=>update('variants',value)} onOptionsChange={value=>update('options',value)} onProductChange={update}/></section>} {active==='custom'&&<CustomFieldsPanel draft={draft} update={update}/>} {active==='organization'&&<OrganizationPanel draft={draft} update={update} allProducts={products}/>}</div><PublishRail draft={draft} update={update} completeness={completeness} automaticTags={automaticTags}/></div><div className="listing-mobile-actions"><button disabled={saving || deleting} onClick={() => save()}><Save size={15}/>{saving?'Saving…':'Save changes'}</button><button disabled={saving || deleting || draft.status==='ARCHIVED'} onClick={() => save('PUBLISHED')}><PackageCheck size={15}/>Publish</button><button className="listing-mobile-delete" disabled={saving || deleting} title="Permanently delete listing" onClick={removeListing}><Trash2 size={15}/>Delete</button></div>{notice&&<div className={`listing-toast ${notice.startsWith('Not saved:')?'is-error':''}`} role={notice.startsWith('Not saved:')?'alert':'status'}>{notice.startsWith('Not saved:')?<X size={15}/>:<Check size={15}/>}<span>{notice}</span>{notice.includes('Rights and affiliation review required')&&<button type="button" style={{ marginLeft: 12, padding: '4px 10px', background: '#f8f04a', color: '#0a0a0a', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }} onClick={async () => { update('aiMetadata', { ...(draft.aiMetadata || {}), catalogReview: { ...(draft.aiMetadata?.catalogReview || {}), status: 'APPROVED', reviewedAt: new Date().toISOString() } }); setNotice('Rights review marked as Approved. Saving listing now…'); setTimeout(() => save(), 100); }}>Duyệt & Lưu ngay ⚡</button>}</div>}</main>
}
