import React, { useEffect, useMemo, useState } from 'react'
import AdminAccess from './AdminAccess'
import { createProductDraft } from './lib/catalog-model'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  FilePlus2,
  GitBranch,
  Image,
  LayoutDashboard,
  Link2,
  Lock,
  Menu,
  MoreHorizontal,
  Package,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shirt,
  Sparkles,
  Upload,
  WandSparkles,
  X
} from 'lucide-react'
import { adminActivity, adminProducts, adminStats, adminTemplates, personalizationDefaults } from './admin-data'
import { adminCollections, adminMenus, adminTheme } from './admin-builder-data'
import { products as storefrontProducts } from './data'
import { AdminCollections, AdminMenus, AdminThemeStudio, ProductVariations } from './admin-builder'
import { fetchAdminCollections, fetchAdminMenus, fetchAdminProducts, fetchAdminTemplates, fetchAdminTheme, saveAdminCollections, saveAdminMenus, saveAdminProduct, saveAdminTemplate, saveAdminTheme, supabaseConfigured } from './lib/supabase'

const go = path => {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}

const money = value => `$${Number(value || 0).toFixed(0)}`

function AdminMark() {
  return <button className="admin-mark" onClick={() => go('/admin')} aria-label="Admin home"><span>90<sup>+</sup></span><strong>EXTRA<br />TIME</strong><small>CONTROL ROOM</small></button>
}

function AdminShell({ active, children, source, onRefresh }) {
  const [mobileNav, setMobileNav] = useState(false)
  const items = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/admin' },
    { id: 'theme', label: 'Theme Studio', icon: Palette, path: '/admin/theme' },
    { id: 'menus', label: 'Menus', icon: Menu, path: '/admin/theme/menus' },
    { id: 'collections', label: 'Collections', icon: Boxes, path: '/admin/collections' },
    { id: 'catalog', label: 'Products', icon: Shirt, path: '/admin/catalog' },
    { id: 'templates', label: 'Templates', icon: WandSparkles, path: '/admin/templates' },
    { id: 'settings', label: 'Settings', icon: Settings2, path: '/admin/settings' }
  ]
  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="admin-sidebar__top"><AdminMark/><button className="admin-sidebar__close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
        <p className="admin-kicker">MERCH STUDIO / 01</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {items.map(item => { const Icon = item.icon; return <button key={item.id} className={active === item.id ? 'is-active' : ''} onClick={() => { go(item.path); setMobileNav(false) }}><Icon size={17}/><span>{item.label}</span>{active === item.id && <i/>}</button> })}
        </nav>
        <div className="admin-sidebar__bottom"><div className="admin-user"><span>ET</span><div><strong>Store administrator</strong><small>Authenticated admin</small></div><ChevronDown size={14}/></div><button className="admin-store-link" onClick={() => go('/')}><Eye size={15}/> View storefront <ExternalLink size={13}/></button></div>
      </aside>
      {mobileNav && <button className="admin-sidebar-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
      <div className="admin-main">
        <header className="admin-topbar"><button className="admin-mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="admin-breadcrumb"><span>EXTRA TIME</span><ChevronDown size={13}/><strong>{active === 'overview' ? 'OVERVIEW' : active.toUpperCase()}</strong></div><div className="admin-topbar__actions"><label className="admin-search"><Search size={15}/><input placeholder="Search · Coming soon" aria-label="Search admin — not available yet" disabled title="Global search is not available yet. Use the Products search field."/></label><span className={`admin-source ${source === 'supabase' ? 'is-live' : ''}`}><i/>{source === 'supabase' ? 'SUPABASE LIVE' : 'PREVIEW DATA'}</span><button className="admin-icon-button" onClick={onRefresh} aria-label="Refresh data"><RefreshCw size={16}/></button></div></header>
        {children}
      </div>
    </div>
  )
}

function PageIntro({ eyebrow, title, copy, action, onAction, actionDisabled = false, actionTitle }) {
  return <div className="admin-page-intro"><div><p>{eyebrow}</p><h1>{title}</h1>{copy && <span>{copy}</span>}</div>{action && <button className="admin-button admin-button--dark" onClick={onAction} disabled={actionDisabled} title={actionTitle}><Plus size={16}/>{action}</button>}</div>
}

function StatusPill({ value }) {
  return <span className={`admin-status admin-status--${String(value).toLowerCase()}`}><i/>{value}</span>
}

function StatCard({ item }) {
  return <article className={`admin-stat admin-stat--${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>
}

function AdminOverview({ products, templates }) {
  const stats = [
    {label:'Published listings',value:products.filter(row=>row.status==='PUBLISHED').length,note:'From the catalogue',tone:'acid'},
    {label:'Draft listings',value:products.filter(row=>row.status==='DRAFT').length,note:'Not visible to customers',tone:'paper'},
    {label:'Active variants',value:products.reduce((count,row)=>count+(row.variants || []).filter(variant=>variant.status==='ACTIVE').length,0),note:'Across all listings',tone:'paper'},
    {label:'Live templates',value:templates.filter(row=>row.status==='LIVE').length,note:'From the template library',tone:'ink'}
  ]
  return <main className="admin-page admin-overview"><PageIntro eyebrow="Store operations" title="Your catalogue, at a glance." copy="Real database counts. Customer requests and production queues arrive in the next delivery stage." action="New product" onAction={()=>go('/admin/products/new')}/><section className="admin-stat-grid">{stats.map(item=><StatCard key={item.label} item={item}/>)}</section><section className="admin-panel"><div className="admin-panel__head"><div><h2>Ready for review</h2><p>Draft listings and products without an active variant.</p></div><button className="admin-text-button" onClick={()=>go('/admin/catalog')}>Open products</button></div>{products.filter(row=>row.status==='DRAFT' || !(row.variants || []).some(variant=>variant.status==='ACTIVE')).map(product=><CatalogRow product={product} key={product.id}/>)}</section></main>
}

function CatalogRow({ product }) {
  return <button className="admin-catalog-row" onClick={() => go(`/admin/products/${product.id}`)}><span className="admin-product-thumb"><img src={product.image} alt=""/></span><span className="admin-product-name"><strong>{product.name}</strong><small>{product.meta}</small></span><span className="admin-product-type">{product.type}</span><span className="admin-product-price">{money(product.price)}</span><StatusPill value={product.status}/><span className="admin-product-stock">{product.inventory === 0 ? '—' : `${product.inventory} units`}</span><span className="admin-product-date">{product.updatedAt}</span><ArrowRight size={16}/></button>
}

function AdminCatalog({ products: rows }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const shown = useMemo(() => rows.filter(product => `${product.name} ${product.meta} ${product.type}`.toLowerCase().includes(query.toLowerCase())).filter(product => filter === 'ALL' || product.status === filter), [rows, query, filter])
  return <main className="admin-page admin-catalog"><PageIntro eyebrow="CATALOG / ALL PRODUCTS" title="THE DROP, IN ORDER." copy={`${shown.length} products in this workspace.`} action="New product" onAction={() => go('/admin/products/new')}/><div className="admin-catalog-toolbar"><label className="admin-search admin-search--large"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by product name, type or story"/></label><div className="admin-filter-tabs">{['ALL','PUBLISHED','DRAFT','ARCHIVED'].map(item => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}<small>{item === 'ALL' ? rows.length : rows.filter(row => row.status === item).length}</small></button>)}</div><button className="admin-button admin-button--outline" disabled title="Catalog import is not available yet. Add a product individually."><Upload size={15}/> Import · Coming soon</button></div><section className="admin-panel admin-catalog-panel"><div className="admin-table-head"><span>PRODUCT</span><span>TYPE</span><span>PRICE</span><span>STATUS</span><span>STOCK</span><span>UPDATED</span><span/></div><div className="admin-catalog-list">{shown.length ? shown.map(product => <CatalogRow product={product} key={product.id}/>) : <div className="admin-empty"><Package size={24}/><strong>No products found</strong><span>Try a different search or status filter.</span></div>}</div></section><div className="admin-footnote"><span><Lock size={13}/> Personalization rules are controlled by templates.</span><span>{shown.length} of {rows.length} products</span></div></main>
}

function ProductPreview({ product, template }) {
  return <div className="admin-product-preview"><div className="admin-preview-top"><span>LIVE PREVIEW / {product.sku}</span><span><i/> {product.status}</span></div><div className="admin-preview-art"><div className="admin-preview-grid"/><img src={product.image} alt={`${product.name} preview`}/><span className="admin-preview-stamp">{product.artworkLock}%<small>LOCKED</small></span></div><div className="admin-preview-caption"><div><p>{template?.name || product.template}</p><h2>{product.name}</h2><span>{product.story}</span></div><div className="admin-preview-price"><strong>{money(product.price)}</strong><small>{product.color}</small></div></div><div className="admin-preview-cards"><div><span>DROP</span><strong>01 / 90+</strong></div><div><span>SHIP</span><strong>{product.status === 'ARCHIVED' ? 'ARCHIVED' : '48 HOURS'}</strong></div><div><span>VARIANTS</span><strong>XS — XXL</strong></div></div></div>
}

function Field({ label, value, onChange, type = 'text', hint, placeholder, readOnly = false }) {
  return <label className="admin-field"><span>{label}</span>{type === 'textarea' ? <textarea value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/> : <input type={type} readOnly={readOnly} value={value ?? ''} onChange={readOnly ? undefined : event => onChange(event.target.value)} placeholder={placeholder}/>} {hint && <small>{hint}</small>}</label>
}

function AdminProductEditor({ products: rows, templates, onSaved }) {
  const id = window.location.pathname.split('/').pop()
  const [newProduct] = useState(createProductDraft)
  const sourceProduct = rows.find(product => product.id === id) || (id === 'new' ? newProduct : null)
  const [draft, setDraft] = useState(() => sourceProduct || {})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (sourceProduct) setDraft(sourceProduct) }, [sourceProduct?.id, sourceProduct?.updatedAt])
  const template = templates.find(item => item.id === draft.templateId)
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  const previewProduct = storefrontProducts.find(product => product.id === draft.id)
  const save = async () => {
    setSaving(true)
    setNotice('')
    try {
      const result = await saveAdminProduct(draft)
      if (result.error) {
        setNotice(`Not saved: ${result.error}`)
        return
      }
      const saved = result.data || { ...draft, name: draft.title, story: draft.description }
      setDraft(saved)
      onSaved(saved)
      if (id === 'new' && result.source === 'supabase') go(`/admin/products/${saved.id}`)
      setNotice(result.source === 'supabase' ? 'Saved to Supabase.' : 'Changes kept in this preview only; not published.')
    } catch (error) {
      setNotice(`Not saved: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }
  if (!sourceProduct) return <main className="admin-page"><h1>Listing not found</h1><button onClick={() => go('/admin/catalog')}>Back to products</button></main>
  return <main className="admin-page admin-editor"><div className="admin-editor-top"><button className="admin-back" onClick={() => go('/admin/catalog')}><ArrowLeft size={16}/> Catalog</button><div><span className="admin-draft-label">PRODUCT / {draft.sku}</span><h1>{draft.title || 'New product'}</h1></div><div className="admin-editor-actions"><button className="admin-button admin-button--outline" disabled={!previewProduct} title={previewProduct ? "Open the current live listing; unsaved edits are not included." : "A live listing preview is not available yet for this product."} onClick={() => go(`/product/${previewProduct.id}`)}><Eye size={15}/>{previewProduct ? "View live listing" : "Preview · Coming soon"}</button><button className="admin-button admin-button--dark" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</button></div></div><div className="admin-editor-grid"><ProductPreview product={{...draft, name: draft.title || draft.name, story: draft.description || draft.story}} template={template}/><aside className="admin-inspector"><div className="admin-inspector__head"><div><p>PRODUCT DETAILS</p><h2>MAKE THE SYSTEM SELL.</h2></div><StatusPill value={draft.status}/></div><section className="admin-form-section"><div className="admin-form-section__head"><span>01</span><h3>IDENTITY</h3></div><Field label="Product title" value={draft.title} onChange={value => update('title', value)} hint="Shown across the storefront."/><Field label="Handle" value={draft.handle} onChange={value => update('handle', value.toLowerCase().replace(/\s+/g,'-'))} hint="Used in the product URL."/><Field label="Primary image URL" value={draft.image} onChange={value => update('image', value)} hint="Use the listing’s approved main image."/><Field label="Story line" type="textarea" value={draft.description} onChange={value => update('description', value)} placeholder="What is the feeling behind this piece?"/></section><section className="admin-form-section"><div className="admin-form-section__head"><span>02</span><h3>PRICE & STOCK</h3></div><div className="admin-form-row"><Field label="Price" type="number" value={draft.price} onChange={value => update('price', value)}/><Field label="Compare at" type="number" value={draft.compareAt} onChange={value => update('compareAt', value)}/></div><div className="admin-form-row"><Field label="Inventory" type="number" value={(draft.variants || []).filter(row => row.status === 'ACTIVE').reduce((sum,row) => sum + Number(row.inventory || 0),0)} readOnly hint="Total stock from active variants."/><Field label="SKU" value={draft.sku} onChange={value => update('sku', value)}/></div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>03</span><h3>PUBLISHING</h3></div><label className="admin-select-field"><span>Status</span><select value={draft.status} onChange={event => update('status', event.target.value)}><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={15}/></label><label className="admin-select-field"><span>Template</span><select value={template?.id || ''} onChange={event => { const next = templates.find(item => item.id === event.target.value); update('templateId', next?.id || null); update('templateVersion', next?.version || null); update('template', next?.name || ''); update('artworkLock', next?.lockPercent ?? 100); update('personalization', next?.editable || []) }}><option value="">Select template</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15}/></label></section><section className="admin-form-section admin-lock-section"><div className="admin-form-section__head"><span>04</span><h3>PERSONALIZATION POLICY</h3><Lock size={15}/></div><div className="admin-lock-meter"><div><strong>{draft.artworkLock}%</strong><span>artwork locked</span></div><div className="admin-lock-meter__bar"><i style={{width:`${draft.artworkLock}%`}}/></div></div><p>Designer controls the visual signature. Customer fields stay limited to the selected template.</p><div className="admin-token-list">{(draft.personalization?.length ? draft.personalization : personalizationDefaults).map(item => <span key={item}><Check size={12}/>{item}</span>)}</div><button className="admin-text-button" onClick={() => go('/admin/templates')}><Pencil size={13}/> Edit in template builder</button></section><ProductVariations key={`${draft.id}-${draft.updatedAt || 'new'}`} product={draft} onChange={variants => update('variants', variants)} onOptionsChange={options => update('options', options)}/><div className="admin-save-mobile"><button className="admin-button admin-button--dark" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</button></div>{notice && <div className="admin-toast" role={notice.startsWith("Not saved:") ? "alert" : "status"}>{notice.startsWith("Not saved:") ? <X size={15}/> : <Check size={15}/>}<span>{notice}</span></div>}</aside></div></main>
}

function TemplateCard({ template, active, onClick }) {
  return <button className={`admin-template-card ${active ? 'is-active' : ''}`} onClick={onClick}><div className="admin-template-card__image"><img src={template.cover} alt=""/><span>{template.lockPercent}%<small>LOCKED</small></span></div><div className="admin-template-card__body"><div><strong>{template.name}</strong><StatusPill value={template.status}/></div><span>{template.description}</span><small>{template.version} · {template.editable.length} editable slots</small></div></button>
}

function AdminTemplates({ templates: rows, onSaved }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id)
  const [notice, setNotice] = useState('')
  const selected = rows.find(template => template.id === selectedId) || rows[0]
  const updateSelected = (key, value) => onSaved({ ...selected, [key]: value }, true)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    setNotice('')
    try {
      const result = await saveAdminTemplate(selected)
      if (result.error) {
        setNotice(`Not saved: ${result.error}`)
        return
      }
      setNotice(result.source === 'supabase' ? 'Template synced to Supabase.' : 'Changes kept in this preview only; not published.')
    } catch (error) {
      setNotice(`Not saved: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setSaving(false)
    }
  }
  return <main className="admin-page admin-templates"><PageIntro eyebrow="TEMPLATES / ARTWORK SYSTEMS" title="LOCK THE POINT OF VIEW." copy="Decide what stays yours, then expose only the details worth remembering." action="New template · Coming soon" actionDisabled actionTitle="Creating templates is not available yet. Existing templates can be edited."/><div className="admin-template-workspace"><section className="admin-template-list"><div className="admin-list-head"><span>{rows.length} SYSTEMS</span><button className="admin-text-button" disabled title="Template sorting is not available yet."><ArrowDown size={14}/> Sort · Coming soon</button></div>{rows.map(template => <TemplateCard key={template.id} template={template} active={selected?.id === template.id} onClick={() => setSelectedId(template.id)}/>)}</section>{selected ? <aside className="admin-template-inspector"><div className="admin-inspector__head"><div><p>TEMPLATE BUILDER / {selected.version}</p><h2>{selected.name}</h2></div><StatusPill value={selected.status}/></div><div className="admin-template-controls"><label className="admin-select-field"><span>Publishing</span><select value={selected.status} onChange={event => updateSelected('status', event.target.value)}><option>LIVE</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={15}/></label><label className="admin-range-field"><span>Artwork lock <strong>{selected.lockPercent}%</strong></span><input type="range" min="50" max="100" step="1" value={selected.lockPercent} onChange={event => updateSelected('lockPercent', Number(event.target.value))}/></label></div><div className="admin-template-hero"><img src={selected.cover} alt=""/><div><span>ARTWORK RATIO</span><strong>{selected.lockPercent}<small>%</small></strong><p>fixed by designer</p></div></div><section className="admin-form-section"><div className="admin-form-section__head"><span>01</span><h3>LOCKED LAYERS</h3><Lock size={15}/></div><p className="admin-section-copy">These layers are never exposed to the customer. They are the reason the product still feels authored.</p><div className="admin-layer-list">{['TYPOGRAPHY','COMPOSITION','TEXTURE','EFFECTS','HIERARCHY'].map(layer => <div key={layer}><span><Lock size={13}/>{layer}</span><b>LOCKED</b></div>)}</div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>02</span><h3>EDITABLE SLOTS</h3></div><p className="admin-section-copy">Keep the personalization surface small enough to finish in one minute.</p><div className="admin-slot-list">{personalizationDefaults.map(slot => { const enabled = selected.editable.includes(slot); return <button key={slot} className={enabled ? 'is-enabled' : ''} onClick={() => updateSelected('editable', enabled ? selected.editable.filter(item => item !== slot) : [...selected.editable, slot])}><span>{slot}</span><i>{enabled && <Check size={13}/>}</i></button> })}</div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>03</span><h3>VERSION NOTE</h3></div><Field label="Description" type="textarea" value={selected.description} onChange={value => updateSelected('description', value)}/></section><div className="admin-template-actions"><button className="admin-button admin-button--dark" onClick={save} disabled={saving}><Save size={15}/>{saving ? "Saving…" : "Save template"}</button><button className="admin-button admin-button--outline" onClick={() => go('/product/touchline?custom=1')}><Eye size={15}/> View custom example</button></div>{notice && <div className="admin-toast" role={notice.startsWith("Not saved:") ? "alert" : "status"}>{notice.startsWith("Not saved:") ? <X size={15}/> : <Check size={15}/>}<span>{notice}</span></div>}</aside> : <div className="admin-empty admin-empty--large"><FilePlus2 size={28}/><strong>Start a new system</strong><span>Give the next drop a fixed point of view.</span></div>}</div></main>
}

function IntegrationCard({ icon: Icon, label, title, copy, status, action, onAction }) {
  return <article className="admin-integration"><div className="admin-integration__icon"><Icon size={20}/></div><div><p>{label}</p><h3>{title}</h3><span>{copy}</span></div><div className={`admin-integration__status ${status === 'CONNECTED' ? 'is-connected' : ''}`}><i/>{status}</div><button onClick={onAction}>{action}<ArrowRight size={14}/></button></article>
}

function AdminSettings() {
  const [copied, setCopied] = useState(false)
  const copyEnv = async () => { try { await navigator.clipboard.writeText('VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY='); setCopied(true); window.setTimeout(() => setCopied(false), 2200) } catch {} }
  return <main className="admin-page admin-settings"><PageIntro eyebrow="SETTINGS / CONNECTIONS" title="KEEP THE PIPELINE CLEAN." copy="Connect the studio to Supabase, GitHub and Vercel without leaking production secrets."/><section className="admin-settings-grid"><div className="admin-settings-main"><div className="admin-panel admin-settings-panel"><div className="admin-panel__head"><div><p>DEPLOYMENT PIPELINE</p><h2>FROM IDEA TO LIVE.</h2></div><span className="admin-source admin-source--large"><i/>{supabaseConfigured ? 'CONNECTED' : 'READY TO CONNECT'}</span></div><div className="admin-integration-list"><IntegrationCard icon={Cloud} label="DATABASE / AUTH" title="Supabase" copy={supabaseConfigured ? 'Project keys detected in this environment.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.'} status={supabaseConfigured ? 'CONNECTED' : 'NOT CONNECTED'} action="Connection guide" onAction={() => window.open('https://supabase.com/docs', '_blank', 'noopener,noreferrer')}/><IntegrationCard icon={GitBranch} label="SOURCE CONTROL" title="GitHub" copy="Pushes to main run the production build check." status="READY" action="Open repository" onAction={() => window.open('https://github.com', '_blank')}/><IntegrationCard icon={Link2} label="DEPLOYMENT" title="Vercel" copy="SPA rewrite and build settings are included in vercel.json." status="READY" action="Open dashboard" onAction={() => window.open('https://vercel.com', '_blank')}/></div></div><div className="admin-panel admin-env-panel"><div className="admin-panel__head"><div><p>ENVIRONMENT</p><h2>THE KEYS STAY LOCAL.</h2></div><button className="admin-button admin-button--outline" onClick={copyEnv}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy template'}</button></div><div className="admin-env-row"><span>VITE_SUPABASE_URL</span><code>{supabaseConfigured ? 'https://••••••••.supabase.co' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><div className="admin-env-row"><span>VITE_SUPABASE_ANON_KEY</span><code>{supabaseConfigured ? 'eyJ••••••••••••••••' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><p className="admin-section-copy">The anon key is safe for the browser when Row Level Security is enabled. Never expose a service-role key in Vite.</p></div></div><aside className="admin-settings-aside"><div className="admin-panel admin-brand-panel"><p>BRAND DEFAULTS</p><h2>THE STUDIO<br /><em>HAS A VOICE.</em></h2><label><span>Storefront name</span><input defaultValue="EXTRA TIME" disabled title="Storefront defaults are not editable yet."/></label><label><span>Default currency</span><select defaultValue="USD / $" disabled title="Currency settings are not editable yet."><option>USD / $</option><option>EUR / €</option><option>GBP / £</option></select><ChevronDown size={15}/></label><label><span>Default artwork lock</span><strong>70% <small>designer-led</small></strong></label><button className="admin-button admin-button--dark" disabled title="Saving storefront defaults is not available yet."><Save size={15}/> Save defaults · Coming soon</button></div><div className="admin-panel admin-doc-panel"><Sparkles size={18}/><p>BUILD NOTES</p><h3>Read the handoff before you ship.</h3><span>Schema, RLS policies, CI workflow and Vercel rewrite are documented in the repo.</span><button className="admin-text-button" onClick={() => window.open('https://supabase.com/docs', '_blank')}>Supabase docs <ExternalLink size={13}/></button></div></aside></section></main>
}

export default function AdminApp() { return <AdminAccess><AdminWorkspace/></AdminAccess> }

function AdminWorkspace() {
  const [path, setPath] = useState(window.location.pathname)
  const [productRows, setProductRows] = useState([])
  const [templateRows, setTemplateRows] = useState([])
  const [themeDraft, setThemeDraft] = useState(adminTheme)
  const [menuRows, setMenuRows] = useState(adminMenus)
  const [collectionRows, setCollectionRows] = useState(adminCollections)
  const [source, setSource] = useState('supabase')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const load = async () => {
    setLoading(true); setLoadError('')
    try {
    const [productResult, templateResult, themeResult, menuResult, collectionResult] = await Promise.all([fetchAdminProducts(), fetchAdminTemplates(), fetchAdminTheme(), fetchAdminMenus(), fetchAdminCollections()])
    const failure = [productResult, templateResult, themeResult, menuResult, collectionResult].find(result => result.error)
    if (failure) throw new Error(failure.error)
    setProductRows(productResult.data || [])
    setTemplateRows(templateResult.data || [])
    if (themeResult.data) setThemeDraft(themeResult.data)
    if (menuResult.data?.length) setMenuRows(menuResult.data)
    if (collectionResult.data?.length) setCollectionRows(collectionResult.data)
    setSource([productResult, templateResult, themeResult, menuResult, collectionResult].every(result => result.source === 'supabase') ? 'supabase' : 'preview')
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load Admin data.') }
    finally { setLoading(false) }
  }
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); load(); return () => window.removeEventListener('popstate', onPop) }, [])
  const saveProduct = product => setProductRows(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product])
  const saveTemplate = (template, silent = false) => { setTemplateRows(current => current.map(item => item.id === template.id ? template : item)); return template }
  const persistTheme = async theme => { setThemeDraft(theme); return saveAdminTheme(theme) }
  const persistMenus = async menus => { setMenuRows(menus); return saveAdminMenus(menus) }
  const persistCollections = async collections => { setCollectionRows(collections); return saveAdminCollections(collections) }
  if (loading) return <main className="admin-access"><p role="status">Loading store data…</p></main>
  if (loadError) return <main className="admin-load-error" role="alert"><h1>Store data could not be loaded</h1><p>{loadError}</p><button onClick={load}>Retry</button></main>
  const isEditor = path.startsWith('/admin/products/')
  const active = isEditor || path === '/admin/catalog' ? 'catalog' : path.startsWith('/admin/theme/menus') ? 'menus' : path.startsWith('/admin/theme') ? 'theme' : path.startsWith('/admin/collections') ? 'collections' : path === '/admin/templates' ? 'templates' : path === '/admin/settings' ? 'settings' : 'overview'
  let page = <AdminOverview products={productRows} templates={templateRows}/>
  if (path === '/admin/catalog') page = <AdminCatalog products={productRows}/>
  else if (isEditor) page = <AdminProductEditor key={path} products={productRows} templates={templateRows} onSaved={saveProduct}/>
  else if (path === '/admin/theme') page = <AdminThemeStudio theme={themeDraft} onSave={persistTheme}/>
  else if (path === '/admin/theme/menus') page = <AdminMenus menus={menuRows} onSave={persistMenus}/>
  else if (path === '/admin/collections') page = <AdminCollections collections={collectionRows} products={productRows} onSave={persistCollections}/>
  else if (path === '/admin/templates') page = <AdminTemplates templates={templateRows} onSaved={saveTemplate}/>
  else if (path === '/admin/settings') page = <AdminSettings/>
  return <AdminShell active={active} source={source} onRefresh={load}>{page}</AdminShell>
}
