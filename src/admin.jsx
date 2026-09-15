import React, { useEffect, useMemo, useState } from 'react'
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
        <div className="admin-sidebar__bottom"><div className="admin-user"><span>TT</span><div><strong>TAN TON</strong><small>OWNER / ADMIN</small></div><ChevronDown size={14}/></div><button className="admin-store-link" onClick={() => go('/')}><Eye size={15}/> View storefront <ExternalLink size={13}/></button></div>
      </aside>
      {mobileNav && <button className="admin-sidebar-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
      <div className="admin-main">
        <header className="admin-topbar"><button className="admin-mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="admin-breadcrumb"><span>EXTRA TIME</span><ChevronDown size={13}/><strong>{active === 'overview' ? 'OVERVIEW' : active.toUpperCase()}</strong></div><div className="admin-topbar__actions"><label className="admin-search"><Search size={15}/><input placeholder="Search catalog" aria-label="Search admin"/></label><span className={`admin-source ${source === 'supabase' ? 'is-live' : ''}`}><i/>{source === 'supabase' ? 'SUPABASE LIVE' : 'PREVIEW DATA'}</span><button className="admin-icon-button" onClick={onRefresh} aria-label="Refresh data"><RefreshCw size={16}/></button></div></header>
        {children}
      </div>
    </div>
  )
}

function PageIntro({ eyebrow, title, copy, action, onAction }) {
  return <div className="admin-page-intro"><div><p>{eyebrow}</p><h1>{title}</h1>{copy && <span>{copy}</span>}</div>{action && <button className="admin-button admin-button--dark" onClick={onAction}><Plus size={16}/>{action}</button>}</div>
}

function StatusPill({ value }) {
  return <span className={`admin-status admin-status--${String(value).toLowerCase()}`}><i/>{value}</span>
}

function StatCard({ item }) {
  return <article className={`admin-stat admin-stat--${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>
}

function AdminOverview() {
  return <main className="admin-page admin-overview"><PageIntro eyebrow="CONTROL ROOM / WELCOME BACK" title={<>MAKE THE<br /><em>DROP</em> MOVE.</>} copy="Keep the storefront sharp: products, templates and the system behind every custom jersey." action="New product" onAction={() => go('/admin/products/new')}/><section className="admin-stat-grid">{adminStats.map(item => <StatCard key={item.label} item={item}/>)}</section><section className="admin-overview-grid"><article className="admin-panel admin-pulse"><div className="admin-panel__head"><div><p>STOREFRONT PULSE</p><h2>READY FOR THE NEXT WHISTLE.</h2></div><span className="admin-live-dot"><i/> LIVE</span></div><div className="admin-pulse__line"><div><strong>94%</strong><span>catalog health</span></div><div className="admin-bars">{[35,48,42,66,58,81,74,92,84,96,88,100].map((height,index) => <i key={index} style={{height:`${height}%`}} className={index > 8 ? 'is-hot' : ''}/>)}</div></div><div className="admin-pulse__footer"><span>Vercel production</span><strong>extra-time-store.vercel.app</strong><span>Last deploy 18m ago</span></div></article><article className="admin-panel admin-next"><div className="admin-panel__head"><div><p>UP NEXT</p><h2>THE 90+ DROP</h2></div><ArrowRight size={19}/></div><img src="/assets/hero-tunnel.webp" alt="The 90+ drop preview"/><div><span>CAMPAIGN / DROP 01</span><strong>6 products · 3 stories · 1 feeling</strong><button onClick={() => go('/admin/catalog')}>Open catalog <ArrowRight size={15}/></button></div></article></section><section className="admin-panel admin-activity"><div className="admin-panel__head"><div><p>RECENT ACTIVITY</p><h2>THE LAST TOUCHES.</h2></div><button className="admin-text-button" onClick={() => go('/admin/catalog')}>View all <ArrowRight size={14}/></button></div><div className="admin-activity__table">{adminActivity.map(row => <div className="admin-activity__row" key={`${row.action}-${row.item}`}><span className={`admin-activity__marker admin-activity__marker--${row.tone}`}><i/></span><strong>{row.action}</strong><b>{row.item}</b><span>{row.detail}</span><time>{row.time}</time><MoreHorizontal size={17}/></div>)}</div></section></main>
}

function CatalogRow({ product }) {
  return <button className="admin-catalog-row" onClick={() => go(`/admin/products/${product.id}`)}><span className="admin-product-thumb"><img src={product.image} alt=""/></span><span className="admin-product-name"><strong>{product.name}</strong><small>{product.meta}</small></span><span className="admin-product-type">{product.type}</span><span className="admin-product-price">{money(product.price)}</span><StatusPill value={product.status}/><span className="admin-product-stock">{product.inventory === 0 ? '—' : `${product.inventory} units`}</span><span className="admin-product-date">{product.updatedAt}</span><ArrowRight size={16}/></button>
}

function AdminCatalog({ products: rows }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('ALL')
  const shown = useMemo(() => rows.filter(product => `${product.name} ${product.meta} ${product.type}`.toLowerCase().includes(query.toLowerCase())).filter(product => filter === 'ALL' || product.status === filter), [rows, query, filter])
  return <main className="admin-page admin-catalog"><PageIntro eyebrow="CATALOG / ALL PRODUCTS" title="THE DROP, IN ORDER." copy={`${shown.length} products in this workspace.`} action="New product" onAction={() => go('/admin/products/new')}/><div className="admin-catalog-toolbar"><label className="admin-search admin-search--large"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by product name, type or story"/></label><div className="admin-filter-tabs">{['ALL','PUBLISHED','DRAFT','ARCHIVED'].map(item => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}<small>{item === 'ALL' ? rows.length : rows.filter(row => row.status === item).length}</small></button>)}</div><button className="admin-button admin-button--outline"><Upload size={15}/> Import</button></div><section className="admin-panel admin-catalog-panel"><div className="admin-table-head"><span>PRODUCT</span><span>TYPE</span><span>PRICE</span><span>STATUS</span><span>STOCK</span><span>UPDATED</span><span/></div><div className="admin-catalog-list">{shown.length ? shown.map(product => <CatalogRow product={product} key={product.id}/>) : <div className="admin-empty"><Package size={24}/><strong>No products found</strong><span>Try a different search or status filter.</span></div>}</div></section><div className="admin-footnote"><span><Lock size={13}/> Personalization rules are controlled by templates.</span><span>{shown.length} of {rows.length} products</span></div></main>
}

function ProductPreview({ product, template }) {
  return <div className="admin-product-preview"><div className="admin-preview-top"><span>LIVE PREVIEW / {product.sku}</span><span><i/> {product.status}</span></div><div className="admin-preview-art"><div className="admin-preview-grid"/><img src={product.image} alt={`${product.name} preview`}/><span className="admin-preview-stamp">{product.artworkLock}%<small>LOCKED</small></span></div><div className="admin-preview-caption"><div><p>{template?.name || product.template}</p><h2>{product.name}</h2><span>{product.story}</span></div><div className="admin-preview-price"><strong>{money(product.price)}</strong><small>{product.color}</small></div></div><div className="admin-preview-cards"><div><span>DROP</span><strong>01 / 90+</strong></div><div><span>SHIP</span><strong>{product.status === 'ARCHIVED' ? 'ARCHIVED' : '48 HOURS'}</strong></div><div><span>VARIANTS</span><strong>XS — XXL</strong></div></div></div>
}

function Field({ label, value, onChange, type = 'text', hint, placeholder }) {
  return <label className="admin-field"><span>{label}</span>{type === 'textarea' ? <textarea value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/> : <input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder}/>} {hint && <small>{hint}</small>}</label>
}

function AdminProductEditor({ products: rows, templates, onSaved }) {
  const id = window.location.pathname.split('/').pop()
  const sourceProduct = rows.find(product => product.id === id) || (id === 'new' ? { id:'new-product', name:'UNTITLED DROP', story:'A new story waiting for a point of view.', meta:'New product · Draft', price:89, compareAt:'', badge:'NEW DROP', rating:0, reviews:0, color:'Black', image:'/assets/jersey-black.webp', status:'DRAFT', type:'READY TO SHIP', template:'VENOM', sku:'ET-NEW', inventory:0, updatedAt:'Not saved', personalization:[], artworkLock:74 } : rows[0])
  const [draft, setDraft] = useState(() => ({ ...sourceProduct, title: sourceProduct.title || sourceProduct.name, handle: sourceProduct.handle || sourceProduct.id, description: sourceProduct.description || sourceProduct.story, compareAt: sourceProduct.compareAt || '' }))
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (sourceProduct) setDraft({ ...sourceProduct, title: sourceProduct.title || sourceProduct.name, handle: sourceProduct.handle || sourceProduct.id, description: sourceProduct.description || sourceProduct.story, compareAt: sourceProduct.compareAt || '' }) }, [sourceProduct?.id])
  const template = templates.find(item => item.id === draft.templateId) || templates.find(item => item.name === draft.template) || templates[0]
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  const save = async () => { setSaving(true); const result = await saveAdminProduct(draft); setSaving(false); setNotice(result.source === 'supabase' ? 'Saved to Supabase.' : 'Saved in preview mode.'); onSaved({ ...draft, name: draft.title, story: draft.description }); window.setTimeout(() => setNotice(''), 2400) }
  return <main className="admin-page admin-editor"><div className="admin-editor-top"><button className="admin-back" onClick={() => go('/admin/catalog')}><ArrowLeft size={16}/> Catalog</button><div><span className="admin-draft-label">PRODUCT / {draft.sku}</span><h1>{draft.title || 'New product'}</h1></div><div className="admin-editor-actions"><button className="admin-button admin-button--outline" onClick={() => go(`/product/${draft.id}`)}><Eye size={15}/> Preview</button><button className="admin-button admin-button--dark" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</button></div></div><div className="admin-editor-grid"><ProductPreview product={{...draft, name: draft.title || draft.name, story: draft.description || draft.story}} template={template}/><aside className="admin-inspector"><div className="admin-inspector__head"><div><p>PRODUCT DETAILS</p><h2>MAKE THE SYSTEM SELL.</h2></div><StatusPill value={draft.status}/></div><section className="admin-form-section"><div className="admin-form-section__head"><span>01</span><h3>IDENTITY</h3></div><Field label="Product title" value={draft.title} onChange={value => update('title', value)} hint="Shown across the storefront."/><Field label="Handle" value={draft.handle} onChange={value => update('handle', value.toLowerCase().replace(/\s+/g,'-'))} hint="Used in the product URL."/><Field label="Story line" type="textarea" value={draft.description} onChange={value => update('description', value)} placeholder="What is the feeling behind this piece?"/></section><section className="admin-form-section"><div className="admin-form-section__head"><span>02</span><h3>PRICE & STOCK</h3></div><div className="admin-form-row"><Field label="Price" type="number" value={draft.price} onChange={value => update('price', value)}/><Field label="Compare at" type="number" value={draft.compareAt} onChange={value => update('compareAt', value)}/></div><div className="admin-form-row"><Field label="Inventory" type="number" value={draft.inventory} onChange={value => update('inventory', value)}/><Field label="SKU" value={draft.sku} onChange={value => update('sku', value)}/></div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>03</span><h3>PUBLISHING</h3></div><label className="admin-select-field"><span>Status</span><select value={draft.status} onChange={event => update('status', event.target.value)}><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={15}/></label><label className="admin-select-field"><span>Template</span><select value={template?.id || ''} onChange={event => { const next = templates.find(item => item.id === event.target.value); update('templateId', next.id); update('template', next.name); update('artworkLock', next.lockPercent); update('personalization', next.editable) }}><option value="">Select template</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15}/></label></section><section className="admin-form-section admin-lock-section"><div className="admin-form-section__head"><span>04</span><h3>PERSONALIZATION POLICY</h3><Lock size={15}/></div><div className="admin-lock-meter"><div><strong>{draft.artworkLock}%</strong><span>artwork locked</span></div><div className="admin-lock-meter__bar"><i style={{width:`${draft.artworkLock}%`}}/></div></div><p>Designer controls the visual signature. Customer fields stay limited to the selected template.</p><div className="admin-token-list">{(draft.personalization?.length ? draft.personalization : personalizationDefaults).map(item => <span key={item}><Check size={12}/>{item}</span>)}</div><button className="admin-text-button" onClick={() => go('/admin/templates')}><Pencil size={13}/> Edit in template builder</button></section><ProductVariations product={draft} onChange={variants => update('variants', variants)} onOptionsChange={options => update('options', options)}/><div className="admin-save-mobile"><button className="admin-button admin-button--dark" onClick={save} disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</button></div>{notice && <div className="admin-toast"><Check size={15}/>{notice}</div>}</aside></div></main>
}

function TemplateCard({ template, active, onClick }) {
  return <button className={`admin-template-card ${active ? 'is-active' : ''}`} onClick={onClick}><div className="admin-template-card__image"><img src={template.cover} alt=""/><span>{template.lockPercent}%<small>LOCKED</small></span></div><div className="admin-template-card__body"><div><strong>{template.name}</strong><StatusPill value={template.status}/></div><span>{template.description}</span><small>{template.version} · {template.editable.length} editable slots</small></div></button>
}

function AdminTemplates({ templates: rows, onSaved }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id)
  const [notice, setNotice] = useState('')
  const selected = rows.find(template => template.id === selectedId) || rows[0]
  const updateSelected = (key, value) => onSaved({ ...selected, [key]: value }, true)
  const save = async () => { const result = await saveAdminTemplate(selected); setNotice(result.source === 'supabase' ? 'Template synced to Supabase.' : 'Template saved in preview mode.'); window.setTimeout(() => setNotice(''), 2400) }
  return <main className="admin-page admin-templates"><PageIntro eyebrow="TEMPLATES / ARTWORK SYSTEMS" title="LOCK THE POINT OF VIEW." copy="Decide what stays yours, then expose only the details worth remembering." action="New template" onAction={() => setSelectedId(null)}/><div className="admin-template-workspace"><section className="admin-template-list"><div className="admin-list-head"><span>{rows.length} SYSTEMS</span><button className="admin-text-button"><ArrowDown size={14}/> Sort by updated</button></div>{rows.map(template => <TemplateCard key={template.id} template={template} active={selected?.id === template.id} onClick={() => setSelectedId(template.id)}/>)}</section>{selected ? <aside className="admin-template-inspector"><div className="admin-inspector__head"><div><p>TEMPLATE BUILDER / {selected.version}</p><h2>{selected.name}</h2></div><StatusPill value={selected.status}/></div><div className="admin-template-controls"><label className="admin-select-field"><span>Publishing</span><select value={selected.status} onChange={event => updateSelected('status', event.target.value)}><option>LIVE</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={15}/></label><label className="admin-range-field"><span>Artwork lock <strong>{selected.lockPercent}%</strong></span><input type="range" min="50" max="100" step="1" value={selected.lockPercent} onChange={event => updateSelected('lockPercent', Number(event.target.value))}/></label></div><div className="admin-template-hero"><img src={selected.cover} alt=""/><div><span>ARTWORK RATIO</span><strong>{selected.lockPercent}<small>%</small></strong><p>fixed by designer</p></div></div><section className="admin-form-section"><div className="admin-form-section__head"><span>01</span><h3>LOCKED LAYERS</h3><Lock size={15}/></div><p className="admin-section-copy">These layers are never exposed to the customer. They are the reason the product still feels authored.</p><div className="admin-layer-list">{['TYPOGRAPHY','COMPOSITION','TEXTURE','EFFECTS','HIERARCHY'].map(layer => <div key={layer}><span><Lock size={13}/>{layer}</span><b>LOCKED</b></div>)}</div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>02</span><h3>EDITABLE SLOTS</h3></div><p className="admin-section-copy">Keep the personalization surface small enough to finish in one minute.</p><div className="admin-slot-list">{personalizationDefaults.map(slot => { const enabled = selected.editable.includes(slot); return <button key={slot} className={enabled ? 'is-enabled' : ''} onClick={() => updateSelected('editable', enabled ? selected.editable.filter(item => item !== slot) : [...selected.editable, slot])}><span>{slot}</span><i>{enabled && <Check size={13}/>}</i></button> })}</div></section><section className="admin-form-section"><div className="admin-form-section__head"><span>03</span><h3>VERSION NOTE</h3></div><Field label="Description" type="textarea" value={selected.description} onChange={value => updateSelected('description', value)}/></section><div className="admin-template-actions"><button className="admin-button admin-button--dark" onClick={save}><Save size={15}/> Save template</button><button className="admin-button admin-button--outline" onClick={() => go('/custom')}><Eye size={15}/> Preview customer form</button></div>{notice && <div className="admin-toast"><Check size={15}/>{notice}</div>}</aside> : <div className="admin-empty admin-empty--large"><FilePlus2 size={28}/><strong>Start a new system</strong><span>Give the next drop a fixed point of view.</span></div>}</div></main>
}

function IntegrationCard({ icon: Icon, label, title, copy, status, action, onAction }) {
  return <article className="admin-integration"><div className="admin-integration__icon"><Icon size={20}/></div><div><p>{label}</p><h3>{title}</h3><span>{copy}</span></div><div className={`admin-integration__status ${status === 'CONNECTED' ? 'is-connected' : ''}`}><i/>{status}</div><button onClick={onAction}>{action}<ArrowRight size={14}/></button></article>
}

function AdminSettings() {
  const [copied, setCopied] = useState(false)
  const copyEnv = async () => { try { await navigator.clipboard.writeText('VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY='); setCopied(true); window.setTimeout(() => setCopied(false), 2200) } catch {} }
  return <main className="admin-page admin-settings"><PageIntro eyebrow="SETTINGS / CONNECTIONS" title="KEEP THE PIPELINE CLEAN." copy="Connect the studio to Supabase, GitHub and Vercel without leaking production secrets."/><section className="admin-settings-grid"><div className="admin-settings-main"><div className="admin-panel admin-settings-panel"><div className="admin-panel__head"><div><p>DEPLOYMENT PIPELINE</p><h2>FROM IDEA TO LIVE.</h2></div><span className="admin-source admin-source--large"><i/>{supabaseConfigured ? 'CONNECTED' : 'READY TO CONNECT'}</span></div><div className="admin-integration-list"><IntegrationCard icon={Cloud} label="DATABASE / AUTH" title="Supabase" copy={supabaseConfigured ? 'Project keys detected in this environment.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.'} status={supabaseConfigured ? 'CONNECTED' : 'NOT CONNECTED'} action="Connection guide" onAction={() => go('/admin/settings#supabase')}/><IntegrationCard icon={GitBranch} label="SOURCE CONTROL" title="GitHub" copy="Pushes to main run the production build check." status="READY" action="Open repository" onAction={() => window.open('https://github.com', '_blank')}/><IntegrationCard icon={Link2} label="DEPLOYMENT" title="Vercel" copy="SPA rewrite and build settings are included in vercel.json." status="READY" action="Open dashboard" onAction={() => window.open('https://vercel.com', '_blank')}/></div></div><div className="admin-panel admin-env-panel"><div className="admin-panel__head"><div><p>ENVIRONMENT</p><h2>THE KEYS STAY LOCAL.</h2></div><button className="admin-button admin-button--outline" onClick={copyEnv}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy template'}</button></div><div className="admin-env-row"><span>VITE_SUPABASE_URL</span><code>{supabaseConfigured ? 'https://••••••••.supabase.co' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><div className="admin-env-row"><span>VITE_SUPABASE_ANON_KEY</span><code>{supabaseConfigured ? 'eyJ••••••••••••••••' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><p className="admin-section-copy">The anon key is safe for the browser when Row Level Security is enabled. Never expose a service-role key in Vite.</p></div></div><aside className="admin-settings-aside"><div className="admin-panel admin-brand-panel"><p>BRAND DEFAULTS</p><h2>THE STUDIO<br /><em>HAS A VOICE.</em></h2><label><span>Storefront name</span><input defaultValue="EXTRA TIME"/></label><label><span>Default currency</span><select defaultValue="USD"><option>USD / $</option><option>EUR / €</option><option>GBP / £</option></select><ChevronDown size={15}/></label><label><span>Default artwork lock</span><strong>70% <small>designer-led</small></strong></label><button className="admin-button admin-button--dark"><Save size={15}/> Save defaults</button></div><div className="admin-panel admin-doc-panel"><Sparkles size={18}/><p>BUILD NOTES</p><h3>Read the handoff before you ship.</h3><span>Schema, RLS policies, CI workflow and Vercel rewrite are documented in the repo.</span><button className="admin-text-button" onClick={() => window.open('https://supabase.com/docs', '_blank')}>Supabase docs <ExternalLink size={13}/></button></div></aside></section></main>
}

export default function AdminApp() {
  const [path, setPath] = useState(window.location.pathname)
  const [productRows, setProductRows] = useState(adminProducts)
  const [templateRows, setTemplateRows] = useState(adminTemplates)
  const [themeDraft, setThemeDraft] = useState(adminTheme)
  const [menuRows, setMenuRows] = useState(adminMenus)
  const [collectionRows, setCollectionRows] = useState(adminCollections)
  const [source, setSource] = useState('preview')
  const load = async () => {
    const [productResult, templateResult, themeResult, menuResult, collectionResult] = await Promise.all([fetchAdminProducts(), fetchAdminTemplates(), fetchAdminTheme(), fetchAdminMenus(), fetchAdminCollections()])
    if (productResult.data?.length) setProductRows(productResult.data.map(row => ({ ...row, name: row.name || row.title, story: row.story || row.subtitle || row.description, compareAt: row.compare_at ?? row.compareAt, artworkLock: row.artwork_lock ?? row.artworkLock, template: row.template || row.template_id, updatedAt: row.updated_at || row.updatedAt, variants: (row.pod_product_variants || []).map(variant => ({ ...variant, values: variant.option_values || {}, compareAt: variant.compare_at })), options: (row.pod_product_options || []).sort((a, b) => a.sort_order - b.sort_order).map(option => ({ name: option.name, values: (option.pod_product_option_values || []).sort((a, b) => a.sort_order - b.sort_order).map(value => value.label) })) })))
    if (templateResult.data?.length) setTemplateRows(templateResult.data.map(row => ({ ...row, lockPercent: row.lock_percent ?? row.artwork_lock_percent ?? row.lockPercent, editable: row.editable_slots || row.editable || [], locked: row.locked_layers || row.locked || [] })))
    if (themeResult.data) setThemeDraft(themeResult.data)
    if (menuResult.data?.length) setMenuRows(menuResult.data)
    if (collectionResult.data?.length) setCollectionRows(collectionResult.data)
    setSource([productResult, templateResult, themeResult, menuResult, collectionResult].every(result => result.source === 'supabase') ? 'supabase' : 'preview')
  }
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); load(); return () => window.removeEventListener('popstate', onPop) }, [])
  const saveProduct = product => setProductRows(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product])
  const saveTemplate = (template, silent = false) => { setTemplateRows(current => current.map(item => item.id === template.id ? template : item)); return template }
  const persistTheme = async theme => { setThemeDraft(theme); return saveAdminTheme(theme) }
  const persistMenus = async menus => { setMenuRows(menus); return saveAdminMenus(menus) }
  const persistCollections = async collections => { setCollectionRows(collections); return saveAdminCollections(collections) }
  const isEditor = path.startsWith('/admin/products/')
  const active = isEditor || path === '/admin/catalog' ? 'catalog' : path.startsWith('/admin/theme/menus') ? 'menus' : path.startsWith('/admin/theme') ? 'theme' : path.startsWith('/admin/collections') ? 'collections' : path === '/admin/templates' ? 'templates' : path === '/admin/settings' ? 'settings' : 'overview'
  let page = <AdminOverview/>
  if (path === '/admin/catalog') page = <AdminCatalog products={productRows}/>
  else if (isEditor) page = <AdminProductEditor products={productRows} templates={templateRows} onSaved={saveProduct}/>
  else if (path === '/admin/theme') page = <AdminThemeStudio theme={themeDraft} onSave={persistTheme}/>
  else if (path === '/admin/theme/menus') page = <AdminMenus menus={menuRows} onSave={persistMenus}/>
  else if (path === '/admin/collections') page = <AdminCollections collections={collectionRows} products={productRows} onSave={persistCollections}/>
  else if (path === '/admin/templates') page = <AdminTemplates templates={templateRows} onSaved={saveTemplate}/>
  else if (path === '/admin/settings') page = <AdminSettings/>
  return <AdminShell active={active} source={source} onRefresh={load}>{page}</AdminShell>
}
