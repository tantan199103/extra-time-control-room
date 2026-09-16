import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Eye, FileText,
  GripVertical, Image as ImageIcon, Layers3, Link2, ListFilter, LoaderCircle, Lock,
  MessageSquareText, PackageCheck, Plus, Save, SearchCheck, Sparkles, Trash2, Upload,
  Video, WandSparkles, X
} from 'lucide-react'
import VariantMatrix from './VariantMatrix'
import { createProductDraft, customFieldPresets, duplicateProductDraft, productCompleteness, slugify } from './lib/catalog-model'
import { requestAiListingCopy, saveAdminProduct, uploadProductMedia } from './lib/supabase'
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

function Field({ label, value, onChange, type='text', hint, placeholder, maxLength, rows=5 }) {
  return <label className="listing-field"><span>{label}</span>{type === 'textarea' ? <textarea rows={rows} maxLength={maxLength} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/> : <input type={type} maxLength={maxLength} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>} {hint && <small>{hint}</small>}</label>
}

function SelectField({ label, value, onChange, children, hint }) {
  return <label className="listing-field listing-field--select"><span>{label}</span><select value={value ?? ''} onChange={event => onChange(event.target.value)}>{children}</select><ChevronDown size={14}/>{hint && <small>{hint}</small>}</label>
}

function WorkspaceHeader({ draft, dirty, saving, previewProduct, onSave, onPublish, onDuplicate }) {
  return <header className="listing-workspace__header"><button className="listing-workspace__back" onClick={() => navigate('/admin/catalog')}><ArrowLeft size={15}/> Products</button><div className="listing-workspace__identity"><span>{draft._persisted ? 'LISTING' : 'UNSAVED DRAFT'} / {draft.sku}</span><h1>{draft.title || 'Untitled listing'}</h1></div><div className="listing-workspace__actions"><span className={`listing-dirty ${dirty ? 'is-dirty' : ''}`}><i/>{dirty ? 'Unsaved changes' : 'Up to date'}</span><button className="admin-button admin-button--outline" onClick={onDuplicate}><Copy size={14}/> Duplicate</button><button className="admin-button admin-button--outline" disabled={!previewProduct} title={previewProduct ? 'Open the current published storefront listing.' : 'Publish this listing before opening its storefront page.'} onClick={() => previewProduct && window.open(`/product/${previewProduct.handle || previewProduct.id}`, '_blank', 'noopener,noreferrer')}><Eye size={14}/> Preview</button><button className="admin-button admin-button--outline" disabled={saving} onClick={() => onSave()}><Save size={14}/>{saving ? 'Saving…' : 'Save changes'}</button><button className="admin-button admin-button--dark" disabled={saving || draft.status === 'ARCHIVED'} onClick={onPublish}><PackageCheck size={14}/> Publish</button></div></header>
}

function StoryPanel({ draft, update }) {
  const [aiOpen, setAiOpen] = useState(false)
  const [brief, setBrief] = useState({ language:'English', tone:'Editorial, direct, emotionally precise', direction:'', searchIntent:'' })
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState('')
  const [suggestion, setSuggestion] = useState(null)
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
  const applySuggestion = () => {
    if (!suggestion) return
    update(null, current => ({
      ...current,
      title:suggestion.title || current.title,
      handle:current._persisted ? current.handle : slugify(suggestion.title || current.title),
      subtitle:suggestion.subtitle || current.subtitle,
      story:suggestion.subtitle || current.story,
      description:suggestion.description || current.description,
      seo:{ ...current.seo, title:suggestion.seoTitle, description:suggestion.seoDescription, keywords:suggestion.keywords },
      tags:[...new Set([...(current.tags || []),...(suggestion.tags || [])])],
      contentBlocks:suggestion.contentBlocks?.length ? suggestion.contentBlocks : current.contentBlocks,
      aiMetadata:{ ...(current.aiMetadata || {}), copy:{ generatedAt:suggestion.generatedAt, language:suggestion.language } }
    }))
    setSuggestion(null); setAiOpen(false)
  }
  return <section className="listing-section listing-story"><div className="listing-section__heading"><div><span>Product story spine</span><h2>Make the design understandable.</h2><p>Write one source story first. Storefront copy, SEO and rich content should reinforce it rather than repeat unrelated claims.</p></div><button className="listing-ai-trigger" onClick={() => setAiOpen(value => !value)}><WandSparkles size={17}/>{aiOpen ? 'Close AI writer' : 'Write with AI'}</button></div>
    {aiOpen && <div className="listing-ai"><div className="listing-ai__intro"><Sparkles size={19}/><div><strong>AI listing writer</strong><span>The main listing image is sent as a visual reference when it has a public HTTPS URL. Suggestions never overwrite fields until you apply them.</span></div></div><div className="listing-form-grid"><SelectField label="Output language" value={brief.language} onChange={value => setBrief(current => ({...current,language:value}))}><option>English</option><option>Vietnamese</option></SelectField><Field label="Tone" value={brief.tone} onChange={value => setBrief(current => ({...current,tone:value}))}/><Field label="Search intent" value={brief.searchIntent} onChange={value => setBrief(current => ({...current,searchIntent:value}))} placeholder="personalized football jersey, match memory…"/><div className="listing-form-grid__wide"><Field label="Creative direction" type="textarea" rows={4} value={brief.direction} onChange={value => setBrief(current => ({...current,direction:value}))} placeholder="Describe the visual symbols, match, place, emotion and factual details the copy must preserve."/></div></div><button className="listing-ai__generate" disabled={generating} onClick={generate}>{generating ? <LoaderCircle className="is-spinning" size={15}/> : <Sparkles size={15}/>} {generating ? 'Reading the story…' : 'Generate title, story & SEO'}</button>{aiError && <p className="listing-ai__error" role="alert">{aiError}</p>}{suggestion && <div className="listing-ai__result"><div><span>AI DRAFT / REVIEW BEFORE APPLYING</span><button onClick={() => setSuggestion(null)} aria-label="Discard AI draft"><X size={15}/></button></div><h3>{suggestion.title}</h3><strong>{suggestion.subtitle}</strong><p>{suggestion.description}</p><dl><div><dt>SEO title</dt><dd>{suggestion.seoTitle}</dd></div><div><dt>SEO description</dt><dd>{suggestion.seoDescription}</dd></div><div><dt>Suggested tags</dt><dd>{suggestion.tags.join(' · ') || '—'}</dd></div></dl><button onClick={applySuggestion}><Check size={14}/> Apply this draft</button></div>}</div>}

    <div className="listing-form-grid listing-form-grid--story"><div className="listing-form-grid__wide"><Field label="Product title" value={draft.title} onChange={value => update('title',value)} maxLength={120} hint={`${(draft.title || '').length}/120 · Main product name shown across the storefront.`}/></div><Field label="URL handle" value={draft.handle} onChange={value => update('handle',slugify(value))} hint="Lowercase URL path; keep stable after publishing."/><Field label="Short story line" value={draft.subtitle || ''} onChange={value => update('subtitle',value)} maxLength={180} hint={`${(draft.subtitle || '').length}/180 · Used on product cards and the opening section.`}/><div className="listing-form-grid__wide"><Field label="Design story" type="textarea" rows={9} value={draft.description} onChange={value => update('description',value)} placeholder="What happened, what the visual symbols mean, and why this piece exists…" hint="Factual source narrative for customers and AI tools."/></div></div>

    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Search preview</span><h3>SEO metadata</h3></div><SearchCheck size={19}/></div><div className="listing-form-grid"><Field label="SEO title" value={seo.title || ''} onChange={value => update('seo',{...seo,title:value})} maxLength={60} hint={`${(seo.title || '').length}/60`}/><Field label="SEO description" type="textarea" rows={4} value={seo.description || ''} onChange={value => update('seo',{...seo,description:value})} maxLength={160} hint={`${(seo.description || '').length}/160`}/><div className="listing-form-grid__wide"><Field label="Keywords" value={(seo.keywords || []).join(', ')} onChange={value => update('seo',{...seo,keywords:value.split(',').map(item => item.trim()).filter(Boolean)})} placeholder="football memory, personalized jersey, extra time"/></div></div><div className="listing-search-preview"><span>{window.location.origin}/product/{draft.handle}</span><strong>{seo.title || draft.title || 'Product title'}</strong><p>{seo.description || draft.subtitle || 'Add a concise search description for this listing.'}</p></div></div>

    <div className="listing-subsection"><div className="listing-subsection__head"><div><span>Rich product page</span><h3>Content blocks</h3><p>Build the long-form product story and insert uploaded images or video between paragraphs.</p></div><div className="listing-block-add"><button onClick={() => addBlock('heading')}>+ Heading</button><button onClick={() => addBlock('paragraph')}>+ Text</button><button onClick={() => addBlock('quote')}>+ Quote</button><button onClick={() => addBlock('image')}>+ Image</button><button onClick={() => addBlock('video')}>+ Video</button></div></div><div className="listing-blocks">{blocks.map((block,index) => <article key={block.id} className="listing-block"><div className="listing-block__rail"><GripVertical size={15}/><span>{blockLabels[block.type] || block.type}</span><button disabled={index === 0} title={index === 0 ? 'This block is already first.' : 'Move block up'} onClick={() => moveBlock(index,-1)}><ArrowUp size={13}/></button><button disabled={index === blocks.length - 1} title={index === blocks.length - 1 ? 'This block is already last.' : 'Move block down'} onClick={() => moveBlock(index,1)}><ArrowDown size={13}/></button><button onClick={() => removeBlock(block.id)} aria-label="Remove content block"><Trash2 size={13}/></button></div>{['heading','paragraph','quote'].includes(block.type) ? <textarea rows={block.type === 'heading' ? 2 : 5} value={block.content || ''} onChange={event => updateBlock(block.id,{content:event.target.value})} placeholder={`Write ${blockLabels[block.type].toLowerCase()}…`}/> : <><label><span>Choose uploaded {block.type}</span><select value={block.mediaId || ''} onChange={event => { const media=draft.media.find(item => item.id === event.target.value); updateBlock(block.id,{mediaId:event.target.value,url:media?.url || ''}) }}><option value="">Select media</option>{(draft.media || []).filter(item => item.type === block.type.toUpperCase()).map(item => <option key={item.id} value={item.id}>{item.filename || item.alt || item.id}</option>)}</select><ChevronDown size={13}/></label>{block.url && (block.type === 'image' ? <img src={block.url} alt="Content block preview"/> : <video src={block.url} controls preload="metadata"/>)}</>}</article>)}{!blocks.length && <div className="listing-empty-inline"><FileText size={20}/><span>Add structured blocks to tell the design story beyond the short description.</span></div>}</div></div>
  </section>
}

function MediaPanel({ draft, update }) {
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
  return <section className="listing-section listing-media"><div className="listing-section__heading"><div><span>Listing media library</span><h2>Show the real piece.</h2><p>Upload production photos and product video directly. The primary image is also the reference used by customer AI editing.</p></div><><input ref={inputRef} className="listing-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" multiple onChange={upload}/><button className="listing-primary-action" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="is-spinning" size={16}/> : <Upload size={16}/>} {uploading ? 'Uploading…' : 'Upload media'}</button></></div><div className="listing-media-rules"><span><ImageIcon size={15}/> Images: JPG, PNG, WebP, AVIF · up to 15 MB</span><span><Video size={15}/> Video: MP4, WebM · up to 80 MB</span><span><Lock size={15}/> Removing a tile only detaches it from this listing</span></div>{notice && <p className={notice.startsWith('Upload failed:') ? 'listing-notice is-error' : 'listing-notice'} role={notice.startsWith('Upload failed:') ? 'alert' : 'status'}>{notice}</p>}<div className="listing-media-grid">{media.map((item,index) => <article key={item.id} className={`listing-media-card ${draft.image === item.url ? 'is-primary' : ''}`}><div className="listing-media-card__visual">{item.type === 'VIDEO' ? <video src={item.url} controls preload="metadata"/> : <img src={item.url} alt={item.alt || ''}/>}<span>{item.type}</span>{draft.image === item.url && <strong>PRIMARY</strong>}</div><div className="listing-media-card__body"><p>{item.filename || 'Uploaded media'}</p><Field label="Alt text" value={item.alt || ''} onChange={value => updateMedia(item.id,{alt:value})} placeholder="Describe what is visible" hint="Needed for accessibility and image search."/><div><button disabled={item.type !== 'IMAGE' || draft.image === item.url} title={item.type !== 'IMAGE' ? 'Only images can be the primary listing reference.' : draft.image === item.url ? 'This is already the primary image.' : 'Use as primary listing image'} onClick={() => update('image',item.url)}><Check size={13}/> Set primary</button><button disabled={index === 0} title={index === 0 ? 'Already first.' : 'Move earlier'} onClick={() => move(index,-1)}><ArrowLeft size={13}/></button><button disabled={index === media.length-1} title={index === media.length-1 ? 'Already last.' : 'Move later'} onClick={() => move(index,1)}><ArrowRight size={13}/></button><button onClick={() => remove(item)} aria-label="Detach media"><Trash2 size={13}/></button></div></div></article>)}{!media.length && <button className="listing-media-empty" onClick={() => inputRef.current?.click()}><Upload size={23}/><strong>Upload the first product image</strong><span>Use a real mockup or production photo. Add a short video after the image set.</span></button>}</div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Fallback reference</span><h3>Primary image URL</h3></div><Link2 size={18}/></div><Field label="Public image URL" value={draft.image || ''} onChange={value => update('image',value)} hint="Useful for an existing CDN asset. Uploading above is recommended."/></div></section>
}

function CustomFieldsPanel({ draft, update }) {
  const fields = draft.customFields || []
  const addPreset = preset => {
    if (fields.some(field => field.key === preset.key)) return
    update('customFields',[...fields,{...preset,id:`field-${crypto.randomUUID()}`,options:preset.options || []}])
  }
  const addBlank = () => update('customFields',[...fields,{id:`field-${crypto.randomUUID()}`,key:`field${fields.length+1}`,label:'New field',type:'text',required:false,placeholder:'',maxLength:30,help:'',options:[]}])
  const edit = (id,patch) => update('customFields',fields.map(field => field.id === id ? {...field,...patch} : field))
  const move = (index,direction) => { const target=index+direction; if(target<0||target>=fields.length)return; const next=[...fields]; [next[index],next[target]]=[next[target],next[index]]; update('customFields',next) }
  return <section className="listing-section listing-custom"><div className="listing-section__heading"><div><span>Customer input policy</span><h2>Lock the art. Open the memory.</h2><p>Typography, composition, texture, effects and hierarchy stay designer-controlled. Only expose information the customer can finish in about one minute.</p></div><button className="listing-primary-action" onClick={addBlank}><Plus size={15}/> Add custom field</button></div><div className="listing-lock-policy"><div><strong>70%</strong><span>Artwork fixed by designer</span></div><i><b/></i><div><strong>30%</strong><span>Customer information</span></div></div><div className="listing-preset-strip"><span>Quick add</span>{customFieldPresets.map(preset => <button key={preset.key} disabled={fields.some(field => field.key === preset.key)} title={fields.some(field => field.key === preset.key) ? `${preset.label} is already enabled.` : `Add ${preset.label}`} onClick={() => addPreset(preset)}>+ {preset.label}</button>)}</div><div className="listing-custom-list">{fields.map((field,index) => <article key={field.id}><div className="listing-custom-list__head"><GripVertical size={15}/><strong>{field.label || field.key}</strong><span>{field.type}</span><button disabled={index === 0} title={index === 0 ? 'Already first.' : 'Move field up'} onClick={() => move(index,-1)}><ArrowUp size={13}/></button><button disabled={index === fields.length-1} title={index === fields.length-1 ? 'Already last.' : 'Move field down'} onClick={() => move(index,1)}><ArrowDown size={13}/></button><button onClick={() => update('customFields',fields.filter(item => item.id !== field.id))} aria-label={`Remove ${field.label}`}><Trash2 size={13}/></button></div><div className="listing-form-grid"><Field label="Customer label" value={field.label} onChange={value => edit(field.id,{label:value})}/><Field label="Data key" value={field.key} onChange={value => edit(field.id,{key:slugify(value,'field').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())})}/><SelectField label="Input type" value={field.type} onChange={value => edit(field.id,{type:value})}><option value="text">Short text</option><option value="number">Number</option><option value="textarea">Long note</option><option value="select">Choice list</option><option value="photo">Photo upload</option></SelectField><Field label="Placeholder" value={field.placeholder || ''} onChange={value => edit(field.id,{placeholder:value})}/><Field label="Character limit" type="number" value={field.maxLength ?? ''} onChange={value => edit(field.id,{maxLength:value === '' ? null : Number(value)})}/><Field label="Help text" value={field.help || ''} onChange={value => edit(field.id,{help:value})}/>{field.type === 'select' && <div className="listing-form-grid__wide"><Field label="Choices, separated by commas" value={(field.options || []).join(', ')} onChange={value => edit(field.id,{options:value.split(',').map(item => item.trim()).filter(Boolean)})}/></div>}</div><label className="listing-check"><input type="checkbox" checked={field.required} onChange={event => edit(field.id,{required:event.target.checked})}/><span><Check size={12}/> Require this answer before adding to bag</span></label></article>)}{!fields.length && <div className="listing-empty-inline"><Lock size={20}/><span>This product has no customer-editable fields. Add only the details supported by its artwork.</span></div>}</div></section>
}

function OrganizationPanel({ draft, update, allProducts }) {
  const [tagInput,setTagInput] = useState('')
  const tags = draft.tags || []
  const groups = [...new Set(allProducts.map(row => row.productGroup).filter(Boolean))]
  const addTags = () => { const next=tagInput.split(',').map(value=>slugify(value,'')).filter(Boolean); update('tags',[...new Set([...tags,...next])]); setTagInput('') }
  return <section className="listing-section listing-organization"><div className="listing-section__heading"><div><span>Catalogue routing</span><h2>Put the listing where it belongs.</h2><p>Manual tags describe the collection. Automatic filters derive sale, stock, video and customization signals from the listing itself.</p></div></div><div className="listing-form-grid"><Field label="Product type" value={draft.type || ''} onChange={value => update('type',value)} placeholder="READY TO SHIP"/><label className="listing-field"><span>Product group</span><input list="listing-groups" value={draft.productGroup || ''} onChange={event => update('productGroup',event.target.value)} placeholder="MEMORY JERSEYS"/><datalist id="listing-groups">{groups.map(group => <option key={group} value={group}/>)}</datalist><small>Products in the same group can be filtered together.</small></label><Field label="Collection / category" value={draft.taxonomy?.category || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),category:value})} placeholder="Football jerseys"/><Field label="Season / drop" value={draft.taxonomy?.season || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),season:value})} placeholder="Drop 01 / 2026"/><Field label="Audience" value={draft.taxonomy?.audience || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),audience:value})} placeholder="Unisex"/><Field label="Colour family" value={draft.taxonomy?.colorFamily || ''} onChange={value => update('taxonomy',{...(draft.taxonomy || {}),colorFamily:value})} placeholder="Black / acid"/></div><div className="listing-subsection"><div className="listing-subsection__head"><div><span>Manual catalogue labels</span><h3>Tags</h3></div></div><div className="listing-tag-input"><input value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if(event.key === 'Enter'){event.preventDefault();addTags()} }} placeholder="memory, night-match, limited…"/><button disabled={!tagInput.trim()} title={!tagInput.trim() ? 'Enter at least one tag.' : 'Add tags'} onClick={addTags}><Plus size={14}/> Add</button></div><div className="listing-tags">{tags.map(tag => <span key={tag}>{tag}<button onClick={() => update('tags',tags.filter(item => item !== tag))} aria-label={`Remove ${tag}`}><X size={11}/></button></span>)}{!tags.length && <small>No manual tags yet.</small>}</div></div></section>
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
  return <main className="listing-workspace"><WorkspaceHeader draft={draft} dirty={dirty} saving={saving} previewProduct={previewProduct} onSave={save} onPublish={() => save('PUBLISHED')} onDuplicate={duplicate}/><div className="listing-workspace__body"><nav className="listing-spine" aria-label="Listing editor sections">{sections.map((section,index) => { const Icon=section.icon; const done=completeness.checks.find(item=>item.key===section.id)?.done; return <button key={section.id} className={active===section.id?'is-active':''} onClick={() => setActive(section.id)}><i>{done ? <Check size={11}/> : index+1}</i><Icon size={16}/><span><strong>{section.label}</strong><small>{section.copy}</small></span></button> })}</nav><div className="listing-workspace__editor">{active==='story'&&<StoryPanel draft={draft} update={update}/>} {active==='media'&&<MediaPanel draft={draft} update={update}/>} {active==='variants'&&<section className="listing-section"><VariantMatrix product={draft} onChange={value=>update('variants',value)} onOptionsChange={value=>update('options',value)} onProductChange={update}/></section>} {active==='custom'&&<CustomFieldsPanel draft={draft} update={update}/>} {active==='organization'&&<OrganizationPanel draft={draft} update={update} allProducts={products}/>}</div><PublishRail draft={draft} update={update} completeness={completeness} automaticTags={automaticTags}/></div><div className="listing-mobile-actions"><button disabled={saving} onClick={() => save()}><Save size={15}/>{saving?'Saving…':'Save changes'}</button><button disabled={saving||draft.status==='ARCHIVED'} onClick={() => save('PUBLISHED')}><PackageCheck size={15}/>Publish</button></div>{notice&&<div className={`listing-toast ${notice.startsWith('Not saved:')?'is-error':''}`} role={notice.startsWith('Not saved:')?'alert':'status'}>{notice.startsWith('Not saved:')?<X size={15}/>:<Check size={15}/>}<span>{notice}</span></div>}</main>
}
