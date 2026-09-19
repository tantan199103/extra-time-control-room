import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AdminAccess from './AdminAccess'
import ListingWorkspace from './ListingWorkspace'
import PodBridgeReceiver from './PodBridgeReceiver'
import AdminMembership from './AdminMembership'
import AdminCustomizations from './AdminCustomizations'
import AdminOrders from './AdminOrders'
import { deriveAutomaticTags, duplicateProductDraft, productCompleteness } from './lib/catalog-model'
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  GitBranch,
  LayoutDashboard,
  Link2,
  Lock,
  Menu,
  Package,
  PackageCheck,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Shirt,
  Sparkles,
  Ticket,
  X
} from 'lucide-react'
import { adminCollections, adminMenus, adminTheme } from './admin-builder-data'
import { AdminCollections, AdminMenus, AdminThemeStudio } from './admin-builder'
import { fetchAdminCollections, fetchAdminMenus, fetchAdminPaymentSettings, fetchAdminProducts, fetchAdminTheme, saveAdminCollections, saveAdminMenus, saveAdminPaymentSettings, saveAdminProduct, saveAdminTheme, supabaseConfigured } from './lib/supabase'
import { DEFAULT_PAYMENT_SETTINGS, PAYMENT_CURRENCIES } from './lib/payment-config'
import { resolveMenuImages } from './lib/storefront-model'
import './admin-payment.css'

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
    { id: 'orders', label: 'Orders', icon: PackageCheck, path: '/admin/orders' },
    { id: 'membership', label: 'Membership', icon: Ticket, path: '/admin/membership' },
    { id: 'customizations', label: 'Custom queue', icon: Sparkles, path: '/admin/customizations' },
    { id: 'bridge', label: 'POD Bridge', icon: Link2, path: '/admin/bridge' },
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

function AdminOverview({ products }) {
  const stats = [
    {label:'Published listings',value:products.filter(row=>row.status==='PUBLISHED').length,note:'From the catalogue',tone:'acid'},
    {label:'Draft listings',value:products.filter(row=>row.status==='DRAFT').length,note:'Not visible to customers',tone:'paper'},
    {label:'Active variants',value:products.reduce((count,row)=>count+(row.variants || []).filter(variant=>variant.status==='ACTIVE').length,0),note:'Across all listings',tone:'paper'},
    {label:'Needs attention',value:products.filter(row=>productCompleteness(row).percent<100).length,note:'Missing media, SEO or routing',tone:'ink'}
  ]
  return <main className="admin-page admin-overview"><PageIntro eyebrow="Store operations" title="Your catalogue, at a glance." copy="Each listing now owns its story, media, SEO, variation pricing and customer-editable information in one workspace." action="New product" onAction={()=>go('/admin/products/new')}/><section className="admin-stat-grid">{stats.map(item=><StatCard key={item.label} item={item}/>)}</section><section className="admin-panel admin-overview-review"><div className="admin-panel__head"><div><h2>Ready for review</h2><p>Draft or incomplete listings that need a decision.</p></div><button className="admin-text-button" onClick={()=>go('/admin/catalog')}>Open products</button></div>{products.filter(row=>row.status==='DRAFT' || productCompleteness(row).percent<100).slice(0,6).map(product=><CatalogRow product={product} key={product.id}/>)}{!products.length&&<div className="admin-empty"><Package size={24}/><strong>No listings yet</strong><span>Create the first product to start the catalogue.</span></div>}</section></main>
}

function CatalogRow({ product, onDuplicate, selected = false, onToggle }) {
  const completeness = productCompleteness(product)
  const stock = (product.variants || []).filter(row=>row.status==='ACTIVE').reduce((sum,row)=>sum+Number(row.inventory||0),0)
  const tags = [...new Set([...(product.tags || []),...deriveAutomaticTags(product)])]
  return <article className={`admin-catalog-row ${selected ? 'is-selected' : ''}`}>{onToggle&&<button className={`admin-catalog-row__select ${selected?'is-checked':''}`} onClick={() => onToggle(product.id)} aria-label={`${selected?'Deselect':'Select'} ${product.title || product.name}`}>{selected&&<Check size={12}/>}</button>}<button className="admin-catalog-row__open" onClick={() => go(`/admin/products/${product.id}`)} aria-label={`Edit ${product.title || product.name}`}><span className="admin-product-thumb">{product.image?<img src={product.image} alt=""/>:<Package size={19}/>}</span><span className="admin-product-name"><strong>{product.name}</strong><small>{product.sku || product.subtitle || 'No SKU'}</small><i>{tags.slice(0,3).map(tag=><b key={tag}>{tag}</b>)}</i></span><span className="admin-product-type">{product.productGroup || product.type || '—'}</span><span className="admin-product-price">{money(product.price)}</span><StatusPill value={product.status}/><span className="admin-product-stock">{stock ? `${stock} units` : '—'}</span><span className="admin-product-score"><b>{completeness.percent}%</b><i><em style={{width:`${completeness.percent}%`}}/></i><small title={(product.seoBlockReasons || []).join(', ') || `SEO quality ${product.seoQualityScore || 0}/100`}>SEO {product.seoStatus || 'BLOCKED'}</small></span><ArrowRight size={16}/></button>{onDuplicate&&<button className="admin-catalog-row__duplicate" onClick={() => onDuplicate(product)} title="Create an unsaved draft copy"><Copy size={14}/><span>Duplicate</span></button>}</article>
}

function AdminCatalog({ products: rows, onDuplicate, onBulkUpdate }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [seoStatus, setSeoStatus] = useState('ALL')
  const [group, setGroup] = useState('ALL')
  const [tag, setTag] = useState('ALL')
  const [sort,setSort] = useState('UPDATED')
  const [selected,setSelected] = useState([])
  const [bulkAction,setBulkAction] = useState('DRAFT')
  const [bulkValue,setBulkValue] = useState('')
  const [bulkNotice,setBulkNotice] = useState('')
  const groups = useMemo(()=>[...new Set(rows.map(row=>row.productGroup).filter(Boolean))].sort(),[rows])
  const tags = useMemo(()=>[...new Set(rows.flatMap(row=>[...(row.tags||[]),...deriveAutomaticTags(row)]))].sort(),[rows])
  const shown = useMemo(() => rows.filter(product => `${product.name} ${product.sku} ${product.type} ${product.productGroup} ${(product.tags||[]).join(' ')} ${deriveAutomaticTags(product).join(' ')} ${(product.seoBlockReasons||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())).filter(product => status === 'ALL' || product.status === status).filter(product => seoStatus === 'ALL' || product.seoStatus === seoStatus).filter(product => group === 'ALL' || product.productGroup === group).filter(product => tag === 'ALL' || [...(product.tags||[]),...deriveAutomaticTags(product)].includes(tag)).sort((a,b)=>sort==='TITLE'?a.name.localeCompare(b.name):sort==='STOCK'?(b.inventory||0)-(a.inventory||0):String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))), [rows, query, status, seoStatus, group, tag, sort])
  const clearFilters=()=>{setQuery('');setStatus('ALL');setSeoStatus('ALL');setGroup('ALL');setTag('ALL')}
  const toggle=id=>setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])
  const toggleShown=()=>setSelected(current=>shown.every(row=>current.includes(row.id))?current.filter(id=>!shown.some(row=>row.id===id)):[...new Set([...current,...shown.map(row=>row.id)])])
  const applyBulk=async()=>{setBulkNotice('Saving…');const result=await onBulkUpdate?.(selected,bulkAction,bulkValue);setBulkNotice(result?.error?`Not saved: ${result.error}`:`Updated ${selected.length} listings.`);if(!result?.error)setSelected([])}
  return <main className="admin-page admin-catalog"><PageIntro eyebrow="CATALOG / LISTING OPERATIONS" title="THE DROP, IN ORDER." copy={`${shown.length} of ${rows.length} listings. Filter, select and update related listings without opening each workspace.`} action="New product" onAction={() => go('/admin/products/new')}/><div className="admin-catalog-toolbar admin-catalog-toolbar--deep"><label className="admin-search admin-search--large"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, SKU, type, group, SEO reason"/></label><label className="admin-catalog-select"><span>Storefront</span><select value={status} onChange={event=>setStatus(event.target.value)}><option>ALL</option><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>SEO gate</span><select value={seoStatus} onChange={event=>setSeoStatus(event.target.value)}><option>ALL</option><option>BLOCKED</option><option>READY</option><option>INDEXABLE</option></select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Group</span><select value={group} onChange={event=>setGroup(event.target.value)}><option>ALL</option>{groups.map(item=><option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Tag / signal</span><select value={tag} onChange={event=>setTag(event.target.value)}><option>ALL</option>{tags.map(item=><option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Sort</span><select value={sort} onChange={event=>setSort(event.target.value)}><option>UPDATED</option><option>TITLE</option><option>STOCK</option></select><ChevronDown size={13}/></label><button className="admin-text-button" disabled={query===''&&status==='ALL'&&seoStatus==='ALL'&&group==='ALL'&&tag==='ALL'} title={query===''&&status==='ALL'&&seoStatus==='ALL'&&group==='ALL'&&tag==='ALL'?'No filters are active.':'Clear every catalogue filter.'} onClick={clearFilters}>Clear filters</button></div>{selected.length>0&&<div className="admin-bulk-bar"><strong>{selected.length} selected</strong><select value={bulkAction} onChange={event=>setBulkAction(event.target.value)}><option value="PUBLISHED">Publish storefront (SEO stays gated)</option><option value="DRAFT">Move to draft</option><option value="ARCHIVED">Archive</option><option value="ADD_TAG">Add tag</option><option value="SET_GROUP">Set group</option></select>{['ADD_TAG','SET_GROUP'].includes(bulkAction)&&<input value={bulkValue} onChange={event=>setBulkValue(event.target.value)} placeholder={bulkAction==='ADD_TAG'?'tag-name':'Product group'}/>}<button onClick={applyBulk}>Apply</button><button onClick={()=>setSelected([])}>Clear</button><span role={bulkNotice.startsWith('Not saved:')?'alert':'status'}>{bulkNotice}</span></div>}<section className="admin-panel admin-catalog-panel"><div className="admin-table-head admin-table-head--deep"><button className={shown.length&&shown.every(row=>selected.includes(row.id))?'is-checked':''} onClick={toggleShown} aria-label="Select all shown listings">{shown.length&&shown.every(row=>selected.includes(row.id))&&<Check size={12}/>}</button><span>PRODUCT</span><span>GROUP / TYPE</span><span>PRICE</span><span>STATUS</span><span>STOCK</span><span>READY / SEO</span><span/></div><div className="admin-catalog-list">{shown.length ? shown.map(product => <CatalogRow product={product} onDuplicate={onDuplicate} selected={selected.includes(product.id)} onToggle={toggle} key={product.id}/>) : <div className="admin-empty"><Package size={24}/><strong>No products found</strong><span>Try a different search, group or automatic signal.</span><button className="admin-text-button" onClick={clearFilters}>Reset catalogue filters</button></div>}</div></section><div className="admin-footnote"><span><Lock size={13}/> Custom fields are controlled per listing; design composition stays locked. SEO indexability is a separate review gate.</span><span>{shown.length} of {rows.length} products</span></div></main>
}

function IntegrationCard({ icon: Icon, label, title, copy, status, action, onAction }) {
  return <article className="admin-integration"><div className="admin-integration__icon"><Icon size={20}/></div><div><p>{label}</p><h3>{title}</h3><span>{copy}</span></div><div className={`admin-integration__status ${status === 'CONNECTED' ? 'is-connected' : ''}`}><i/>{status}</div><button onClick={onAction}>{action}<ArrowRight size={14}/></button></article>
}

function AdminSettings() {
  const [copied, setCopied] = useState(false)
  const [payment, setPayment] = useState(DEFAULT_PAYMENT_SETTINGS)
  const [readiness, setReadiness] = useState({ ready:false, missing:[] })
  const [paymentNotice, setPaymentNotice] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(true)
  const [mappingText, setMappingText] = useState('')
  const copyEnv = async () => { try { await navigator.clipboard.writeText('VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n\n# PayPal server-only\nPAYPAL_CLIENT_SECRET=\nPAYPAL_WEBHOOK_ID=\n\n# Paddle server-only\nPADDLE_API_KEY=\nPADDLE_WEBHOOK_SECRET='); setCopied(true); window.setTimeout(() => setCopied(false), 2200) } catch {} }
  useEffect(() => { fetchAdminPaymentSettings().then(result => { setPayment(result.data || DEFAULT_PAYMENT_SETTINGS); setReadiness(result.readiness || {ready:false,missing:[]}); setMappingText(JSON.stringify(result.data?.paddle?.priceMap || {}, null, 2)); if(result.error)setPaymentNotice(result.error) }).finally(()=>setPaymentBusy(false)) }, [])
  const savePayment = async () => {
    setPaymentBusy(true); setPaymentNotice('Saving payment settings…')
    try {
      let priceMap={}
      if(mappingText.trim())priceMap=JSON.parse(mappingText)
      const result=await saveAdminPaymentSettings({...payment,paddle:{...payment.paddle,priceMap}})
      if(result.error){setPaymentNotice(`Not saved: ${result.error}`);return}
      setPayment(result.data);setReadiness(result.readiness);setMappingText(JSON.stringify(result.data.paddle.priceMap || {},null,2));setPaymentNotice(result.readiness?.ready?'Payment settings saved. Sandbox checkout is ready for an end-to-end provider test.':`Settings saved, but checkout stays locked: ${(result.readiness?.missing||[]).join(', ')}`)
    } catch (error) { setPaymentNotice(`Not saved: ${error instanceof SyntaxError ? 'Paddle price map must be valid JSON.' : error.message}`) }
    finally { setPaymentBusy(false) }
  }
  const providerReady=payment.enabled&&readiness.ready&&payment.provider==='PAYPAL'
  const providerUnavailable=payment.enabled&&payment.provider==='PADDLE'
  return <main className="admin-page admin-settings"><PageIntro eyebrow="SETTINGS / CONNECTIONS" title="KEEP THE PIPELINE CLEAN." copy="Connect infrastructure and configure a payment provider without exposing server secrets to the browser."/><section className="admin-payment-panel admin-panel"><div className="admin-panel__head"><div><p>PAYMENT PROVIDER</p><h2>PAYPAL OR PADDLE.</h2></div><StatusPill value={!payment.enabled?'DISABLED':providerUnavailable?'UNAVAILABLE':providerReady?'READY TO TEST':'NEEDS KEYS'}/></div><div className="admin-payment-body"><div className="admin-payment-choice">{['NONE','PAYPAL','PADDLE'].map(provider=><button key={provider} className={payment.provider===provider?'is-active':''} onClick={()=>setPayment(current=>({...current,provider,enabled:provider==='NONE'?false:current.enabled}))}>{provider==='NONE'?'Disabled':provider}</button>)}</div><div className="admin-payment-fields"><label><span>Environment</span><select value={payment.environment} onChange={event=>setPayment(current=>({...current,environment:event.target.value}))}><option value="sandbox">Sandbox / test</option><option value="live">Live</option></select></label><label><span>Currency</span><select value={payment.currency} onChange={event=>setPayment(current=>({...current,currency:event.target.value}))}>{PAYMENT_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label><label className="admin-payment-toggle"><span>Store provider configuration</span><input type="checkbox" checked={payment.enabled} disabled={payment.provider==='NONE'} onChange={event=>setPayment(current=>({...current,enabled:event.target.checked}))}/></label></div>{payment.provider==='PAYPAL'&&<div className="admin-payment-provider"><label><span>PayPal client ID <small>public</small></span><input value={payment.paypal.clientId} onChange={event=>setPayment(current=>({...current,paypal:{clientId:event.target.value}}))} placeholder="PayPal REST app client ID"/></label><p>Server environment must contain <code>PAYPAL_CLIENT_SECRET</code> and <code>PAYPAL_WEBHOOK_ID</code>. Checkout uses Orders v2 capture on the server.</p></div>}{payment.provider==='PADDLE'&&<div className="admin-payment-provider"><label><span>Paddle client token <small>public</small></span><input value={payment.paddle.clientToken} onChange={event=>setPayment(current=>({...current,paddle:{...current.paddle,clientToken:event.target.value}}))} placeholder="test_… or live_…"/></label><label><span>Price map JSON <small>variant or product ID → Paddle price ID</small></span><textarea value={mappingText} onChange={event=>setMappingText(event.target.value)} placeholder={'{\n  "variant-id": "pri_…"\n}'}/></label><p>Paddle remains unavailable for this physical-goods flow until a shipping-capable adapter is implemented. Saving a token does not enable checkout.</p></div>}<div className="admin-payment-status"><strong>{payment.enabled?(providerReady?'Server variables present; run a sandbox checkout test.':providerUnavailable?'Paddle checkout is unavailable for physical goods.':'Checkout remains locked.'):'No payment provider is enabled.'}</strong>{readiness.missing?.length>0&&<span>Missing: {readiness.missing.join(', ')}</span>}<small>Secrets are never stored in Supabase or returned to this page. Saving configuration does not mark any order as paid.</small></div>{paymentNotice&&<p className={paymentNotice.startsWith('Not saved')?'is-error':''} role={paymentNotice.startsWith('Not saved')?'alert':'status'}>{paymentNotice}</p>}<button className="admin-button admin-button--dark" onClick={savePayment} disabled={paymentBusy}><Save size={15}/>{paymentBusy?'Saving…':'Save payment settings'}</button></div></section><section className="admin-settings-grid"><div className="admin-settings-main"><div className="admin-panel admin-settings-panel"><div className="admin-panel__head"><div><p>DEPLOYMENT PIPELINE</p><h2>FROM IDEA TO LIVE.</h2></div><span className="admin-source admin-source--large"><i/>{supabaseConfigured ? 'CONNECTED' : 'READY TO CONNECT'}</span></div><div className="admin-integration-list"><IntegrationCard icon={Cloud} label="DATABASE / AUTH" title="Supabase" copy={supabaseConfigured ? 'Project keys detected in this environment.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.'} status={supabaseConfigured ? 'CONNECTED' : 'NOT CONNECTED'} action="Open project" onAction={() => window.open('https://supabase.com/dashboard/project/ofetusgarxcwloxxkhnr', '_blank', 'noopener,noreferrer')}/><IntegrationCard icon={GitBranch} label="SOURCE CONTROL" title="GitHub" copy="Pushes to main run the production build check." status="READY" action="Open repository" onAction={() => window.open('https://github.com/tantan199103/extra-time-control-room', '_blank', 'noopener,noreferrer')}/><IntegrationCard icon={Link2} label="DEPLOYMENT" title="Vercel" copy="SPA rewrite and build settings are included in vercel.json." status="READY" action="Open dashboard" onAction={() => window.open('https://vercel.com/tanton1s-projects/extra-time-control-room', '_blank', 'noopener,noreferrer')}/></div></div><div className="admin-panel admin-env-panel"><div className="admin-panel__head"><div><p>ENVIRONMENT</p><h2>THE KEYS STAY LOCAL.</h2></div><button className="admin-button admin-button--outline" onClick={copyEnv}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy template'}</button></div><div className="admin-env-row"><span>VITE_SUPABASE_URL</span><code>{supabaseConfigured ? 'https://••••••••.supabase.co' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><div className="admin-env-row"><span>VITE_SUPABASE_ANON_KEY</span><code>{supabaseConfigured ? 'eyJ••••••••••••••••' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><p className="admin-section-copy">Only public browser keys belong in Vite. Provider secrets and webhook secrets must be configured as server environment variables.</p></div></div><aside className="admin-settings-aside"><div className="admin-panel admin-brand-panel"><p>BRAND DEFAULTS</p><h2>THE STUDIO<br /><em>HAS A VOICE.</em></h2><label><span>Storefront name</span><input defaultValue="EXTRA TIME" disabled title="Storefront defaults are not editable yet."/></label><label><span>Default currency</span><strong>{payment.currency}</strong></label><label><span>Default artwork lock</span><strong>70% <small>designer-led</small></strong></label></div><div className="admin-panel admin-doc-panel"><Sparkles size={18}/><p>PAYMENT SAFETY</p><h3>Configuration is not confirmation.</h3><span>Only a verified provider capture or webhook creates a confirmed order. Admin fulfillment controls remain locked until then.</span></div></aside></section></main>
}

export default function AdminApp() { return <AdminAccess><AdminWorkspace/></AdminAccess> }

function AdminWorkspace() {
  const [path, setPath] = useState(window.location.pathname)
  const [productRows, setProductRows] = useState([])
  const [themeDraft, setThemeDraft] = useState(adminTheme)
  const [menuRows, setMenuRows] = useState(adminMenus)
  const [collectionRows, setCollectionRows] = useState(adminCollections)
  const [source, setSource] = useState('supabase')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const load = async () => {
    setLoading(true); setLoadError('')
    try {
    const [productResult, themeResult, menuResult, collectionResult] = await Promise.all([fetchAdminProducts(), fetchAdminTheme(), fetchAdminMenus(), fetchAdminCollections()])
    const failure = [productResult, themeResult, menuResult, collectionResult].find(result => result.error)
    if (failure) throw new Error(failure.error)
    setProductRows(productResult.data || [])
    if (themeResult.data) setThemeDraft(themeResult.data)
    if (menuResult.data?.length) setMenuRows(resolveMenuImages(menuResult.data, { products:productResult.data || [], collections:collectionResult.data || [], pages:themeResult.data?.pages || [] }))
    if (collectionResult.data?.length) setCollectionRows(collectionResult.data)
    setSource([productResult, themeResult, menuResult, collectionResult].every(result => result.source === 'supabase') ? 'supabase' : 'preview')
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not load Admin data.') }
    finally { setLoading(false) }
  }
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); load(); return () => window.removeEventListener('popstate', onPop) }, [])
  const saveProduct = useCallback(product => setProductRows(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product]), [])
  const duplicateProduct = product => { const copy=duplicateProductDraft(product,productRows); saveProduct(copy); go(`/admin/products/${copy.id}`) }
  const bulkUpdateProducts = async (ids,action,value) => {
    const targets=productRows.filter(product=>ids.includes(product.id))
    if(!targets.length)return {error:'Select at least one listing.'}
    if(['ADD_TAG','SET_GROUP'].includes(action)&&!value.trim())return {error:'Enter a value for the bulk change.'}
    const saved=[]
    for(const product of targets){
      const candidate=action==='ADD_TAG'?{...product,tags:[...new Set([...(product.tags||[]),value.trim().toLowerCase().replace(/\s+/g,'-')])]}:action==='SET_GROUP'?{...product,productGroup:value.trim()}:{...product,status:action}
      const result=await saveAdminProduct(candidate)
      if(result.error){if(saved.length)setProductRows(current=>current.map(row=>saved.find(item=>item.id===row.id)||row));return {error:`${product.name}: ${result.error}`}}
      saved.push(result.data)
    }
    setProductRows(current=>current.map(row=>saved.find(item=>item.id===row.id)||row))
    return {data:saved}
  }
  const persistTheme = async theme => { setThemeDraft(theme); return saveAdminTheme(theme) }
  const persistMenus = async menus => { setMenuRows(menus); return saveAdminMenus(menus) }
  const persistCollections = async collections => { setCollectionRows(collections); return saveAdminCollections(collections) }
  if (loading) return <main className="admin-access"><p role="status">Loading store data…</p></main>
  if (loadError) return <main className="admin-load-error" role="alert"><h1>Store data could not be loaded</h1><p>{loadError}</p><button onClick={load}>Retry</button></main>
  const isEditor = path.startsWith('/admin/products/')
  const active = path === '/admin/bridge' ? 'bridge' : path.startsWith('/admin/orders') ? 'orders' : path.startsWith('/admin/membership') ? 'membership' : path.startsWith('/admin/customizations') ? 'customizations' : isEditor || path === '/admin/catalog' ? 'catalog' : path.startsWith('/admin/theme/menus') ? 'menus' : path.startsWith('/admin/theme') ? 'theme' : path.startsWith('/admin/collections') ? 'collections' : path === '/admin/settings' ? 'settings' : 'overview'
  let page = <AdminOverview products={productRows}/>
  if (path === '/admin/bridge') page = <PodBridgeReceiver products={productRows} onSaved={saveProduct}/>
  else if (path.startsWith('/admin/orders')) page = <AdminOrders/>
  else if (path === '/admin/catalog') page = <AdminCatalog products={productRows} onDuplicate={duplicateProduct} onBulkUpdate={bulkUpdateProducts}/>
  else if (isEditor) page = <ListingWorkspace key={path} products={productRows} onSaved={saveProduct} onDuplicate={saveProduct}/>
  else if (path.startsWith('/admin/membership')) page = <AdminMembership/>
  else if (path.startsWith('/admin/customizations')) page = <AdminCustomizations/>
  else if (path === '/admin/theme') page = <AdminThemeStudio theme={themeDraft} onSave={persistTheme}/>
  else if (path === '/admin/theme/menus') page = <AdminMenus menus={menuRows} onSave={persistMenus}/>
  else if (path === '/admin/collections') page = <AdminCollections collections={collectionRows} products={productRows} onSave={persistCollections}/>
  else if (path === '/admin/settings') page = <AdminSettings/>
  return <AdminShell active={active} source={source} onRefresh={load}>{page}</AdminShell>
}
