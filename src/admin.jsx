import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminAccess from './AdminAccess'
import ListingWorkspace from './ListingWorkspace'
import PodBridgeReceiver from './PodBridgeReceiver'
import AdminMembership from './AdminMembership'
import AdminCustomizations from './AdminCustomizations'
import AdminOrders from './AdminOrders'
import { deriveAutomaticTags, duplicateProductDraft, productCompleteness } from './lib/catalog-model'
import { runAdminCatalogBulk } from './lib/admin-catalog-bulk'
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
  Trash2,
  X
} from 'lucide-react'
import { adminProducts } from './admin-data'
import { adminCollections, adminMenus, adminTheme } from './admin-builder-data'
import { AdminCollections, AdminMenus, AdminThemeStudio } from './admin-builder'
import { applyAdminCollectionAutomation, deleteAdminCollection, deleteAdminProduct, fetchAdminCollectionCatalog, fetchAdminCollections, fetchAdminCustomizations, fetchAdminMembership, fetchAdminMenus, fetchAdminOrders, fetchAdminPaymentSettings, fetchAdminProduct, fetchAdminProducts, fetchAdminTheme, fetchStorefrontNavigationIndex, previewAdminCollectionAutomation, saveAdminCollections, saveAdminMenus, saveAdminPaymentSettings, saveAdminProduct, saveAdminTheme, supabaseConfigured, uploadCollectionImage } from './lib/supabase'
import { DEFAULT_PAYMENT_SETTINGS, PAYMENT_CURRENCIES } from './lib/payment-config'
import { getMetaPixelId, setMetaPixelId } from './lib/meta-pixel'
import { resolveMenuImages } from './lib/storefront-model'
import { applyCollectionMembership } from './lib/collection-assignment'
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

function AdminShell({ active, source, notice, onRefresh, badges = {}, children }) {
  const [mobileNav, setMobileNav] = useState(false)
  const navGroups = [
    {
      id: 'main',
      label: null,
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, path: '/admin' }
      ]
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { id: 'orders', label: 'Orders', icon: PackageCheck, path: '/admin/orders', badgeKey: 'orders' },
        { id: 'customizations', label: 'Custom queue', icon: Sparkles, path: '/admin/customizations', badgeKey: 'custom' }
      ]
    },
    {
      id: 'catalog',
      label: 'Catalog',
      items: [
        { id: 'catalog', label: 'Products', icon: Shirt, path: '/admin/catalog', badgeKey: 'products' },
        { id: 'collections', label: 'Collections', icon: Boxes, path: '/admin/collections' },
        { id: 'bridge', label: 'POD Bridge', icon: Link2, path: '/admin/bridge' }
      ]
    },
    {
      id: 'growth',
      label: 'Growth',
      items: [
        { id: 'membership', label: 'Membership', icon: Ticket, path: '/admin/membership', badgeKey: 'membership' }
      ]
    },
    {
      id: 'storefront',
      label: 'Storefront',
      items: [
        { id: 'theme', label: 'Theme Studio', icon: Palette, path: '/admin/theme' },
        { id: 'menus', label: 'Menus', icon: Menu, path: '/admin/theme/menus' }
      ]
    },
    {
      id: 'system',
      label: 'System',
      items: [
        { id: 'settings', label: 'Settings', icon: Settings2, path: '/admin/settings' }
      ]
    }
  ]
  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="admin-sidebar__top"><AdminMark/><button className="admin-sidebar__close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
        <p className="admin-kicker">MERCH STUDIO / 01</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navGroups.map(group => (
            <div key={group.id} className="admin-nav__group">
              {group.label && <span className="admin-nav__heading">{group.label}</span>}
              {group.items.map(item => {
                const Icon = item.icon
                const count = item.badgeKey ? (badges[item.badgeKey] || 0) : 0
                const isActive = active === item.id
                return (
                  <button
                    key={item.id}
                    className={isActive ? 'is-active' : ''}
                    onClick={() => { go(item.path); setMobileNav(false) }}
                  >
                    <Icon size={17}/>
                    <span>{item.label}</span>
                    {count > 0 ? (
                      <span className={`admin-nav__badge admin-nav__badge--${item.badgeKey === 'custom' ? 'signal' : item.badgeKey === 'orders' ? 'acid' : 'muted'}`}>
                        {count}
                      </span>
                    ) : isActive ? (
                      <i/>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__bottom"><div className="admin-user"><span>ET</span><div><strong>Store administrator</strong><small>Authenticated admin</small></div><ChevronDown size={14}/></div><button className="admin-store-link" onClick={() => go('/')}><Eye size={15}/> View storefront <ExternalLink size={13}/></button></div>
      </aside>
      {mobileNav && <button className="admin-sidebar-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button>
          <div className="admin-breadcrumb"><span>EXTRA TIME</span><ChevronDown size={13}/><strong>{active === 'overview' ? 'OVERVIEW' : active.toUpperCase()}</strong></div>
          <div className="admin-topbar__actions">
            <button className="admin-button admin-button--dark admin-topbar__quick-btn" onClick={() => go('/admin/products/new')}>
              <Plus size={15}/> <span>New product</span>
            </button>
            <label className="admin-search"><Search size={15}/><input placeholder="Search · Coming soon" aria-label="Search admin — not available yet" disabled title="Global search is not available yet. Use the Products search field."/></label>
            <span className={`admin-source ${source === 'supabase' ? 'is-live' : ''}`}><i/>{source === 'supabase' ? 'SUPABASE LIVE' : source === 'partial' ? 'PARTIAL LIVE' : source === 'loading' ? 'CONNECTING' : 'DATA UNAVAILABLE'}</span>
            <button className="admin-icon-button" onClick={onRefresh} aria-label="Refresh data"><RefreshCw size={16}/></button>
          </div>
        </header>
        {notice && <div className="admin-banner-notice" style={{ padding: '8px 16px', background: '#f8f4dc', borderBottom: '1px solid var(--admin-line, #ddd)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{notice}</span></div>}
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

function AdminOverview({ products, catalogLoad }) {
  const overviewCopy = catalogLoad.complete
    ? `${catalogLoad.loaded} live listings loaded. Open Products to review variations, pricing and custom fields.`
    : `Loading ${catalogLoad.loaded}${catalogLoad.total != null ? ` of ${catalogLoad.total}` : ''} listings. Counts update as pages arrive.`
  const stats = [
    {label:'Published listings',value:products.filter(row=>row.status==='PUBLISHED').length,note:'From the catalogue',tone:'acid'},
    {label:'Draft listings',value:products.filter(row=>row.status==='DRAFT').length,note:'Not visible to customers',tone:'paper'},
    {label:'Active variants',value:products.reduce((count,row)=>count+(row._catalogSummary ? Number(row._variantCount || 0) : (row.variants || []).filter(variant=>variant.status==='ACTIVE').length),0),note:'Across all listings',tone:'paper'},
    {label:'Draft variants',value:products.reduce((count,row)=>count+(row._catalogSummary ? Number(row._draftVariantCount || 0) : (row.variants || []).filter(variant=>variant.status==='DRAFT').length),0),note:'Eligible rows can be activated in Products',tone:'signal'},
    {label:'Needs attention',value:products.filter(row=>productCompleteness(row).percent<100).length,note:'Missing media, SEO or routing',tone:'ink'}
  ]
  return <main className="admin-page admin-overview"><PageIntro eyebrow="Store operations" title="Your catalogue, at a glance." copy={overviewCopy} action="New product" onAction={()=>go('/admin/products/new')}/><section className="admin-stat-grid">{stats.map(item=><StatCard key={item.label} item={item}/>)}</section><section className="admin-panel admin-overview-review"><div className="admin-panel__head"><div><h2>Ready for review</h2><p>Draft or incomplete listings that need a decision.</p></div><button className="admin-text-button" onClick={()=>go('/admin/catalog')}>Open products</button></div>{products.filter(row=>row.status==='DRAFT' || productCompleteness(row).percent<100).slice(0,6).map(product=><CatalogRow product={product} key={product.id}/>)}{!products.length&&<div className="admin-empty"><Package size={24}/><strong>No listings yet</strong><span>Create the first product to start the catalogue.</span></div>}</section></main>
}

function CatalogRow({ product, onDuplicate, onDelete, selected = false, onToggle }) {
  const completeness = productCompleteness(product)
  const stock = product._catalogSummary
    ? Number(product.inventory || 0)
    : (product.variants || []).filter(row=>row.status==='ACTIVE').reduce((sum,row)=>sum+Number(row.inventory||0),0)
  const draftVariants = product._catalogSummary
    ? Number(product._draftVariantCount || 0)
    : (product.variants || []).filter(row=>row.status==='DRAFT').length
  const tags = [...new Set([...(product.tags || []),...deriveAutomaticTags(product)])]
  return <article className={`admin-catalog-row ${selected ? 'is-selected' : ''}`}>{onToggle&&<button className={`admin-catalog-row__select ${selected?'is-checked':''}`} onClick={() => onToggle(product.id)} aria-label={`${selected?'Deselect':'Select'} ${product.title || product.name}`}>{selected&&<Check size={12}/>}</button>}<button className="admin-catalog-row__open" onClick={() => go(`/admin/products/${product.id}`)} aria-label={`Edit ${product.title || product.name}`}><span className="admin-product-thumb">{product.image?<img src={product.image} alt=""/>:<Package size={19}/>}</span><span className="admin-product-name"><strong>{product.name}</strong><small>{product.sku || product.subtitle || 'No SKU'}</small><i>{draftVariants>0&&<b className="is-draft">{draftVariants} Draft variants</b>}{tags.slice(0,2).map(tag=><b key={tag}>{tag}</b>)}</i></span><span className="admin-product-type">{product.productGroup || product.type || '—'}</span><span className="admin-product-price">{money(product.price)}</span><StatusPill value={product.status}/><span className="admin-product-stock">{stock ? `${stock} units` : '—'}</span><span className="admin-product-score"><b>{completeness.percent}%</b><i><em style={{width:`${completeness.percent}%`}}/></i><small title={(product.seoBlockReasons || []).join(', ') || `SEO quality ${product.seoQualityScore || 0}/100`}>SEO {product.seoStatus || 'BLOCKED'}</small></span><ArrowRight size={16}/></button><div className="admin-catalog-row__actions">{onDuplicate&&<button className="admin-catalog-row__duplicate" onClick={() => onDuplicate(product)} title="Create an unsaved draft copy"><Copy size={14}/><span>Duplicate</span></button>}{onDelete&&<button className="admin-catalog-row__delete" onClick={() => { if(window.confirm(`Permanently delete "${product.name || product.title || product.id}"? This action cannot be undone.`)) onDelete(product.id) }} title="Permanently delete listing"><Trash2 size={14}/><span>Delete</span></button>}</div></article>
}

function AdminCatalog({ products: rows, onDuplicate, onDelete, onBulkUpdate, onCollectionAction, collections = [], catalogLoad }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [seoStatus, setSeoStatus] = useState('ALL')
  const [variantStatus, setVariantStatus] = useState('ALL')
  const [group, setGroup] = useState('ALL')
  const [tag, setTag] = useState('ALL')
  const [sort,setSort] = useState('UPDATED')
  const [selected,setSelected] = useState([])
  const [bulkAction,setBulkAction] = useState('DRAFT')
  const [bulkValue,setBulkValue] = useState('')
  const [bulkNotice,setBulkNotice] = useState('')
  const [bulkBusy,setBulkBusy] = useState(false)
  const [bulkReport,setBulkReport] = useState(null)
  const [page,setPage] = useState(1)
  const catalogReady = catalogLoad.source === 'supabase' && catalogLoad.complete
  const groups = useMemo(()=>[...new Set(rows.map(row=>row.productGroup).filter(Boolean))].sort(),[rows])
  const tags = useMemo(()=>[...new Set(rows.flatMap(row=>[...(row.tags||[]),...deriveAutomaticTags(row)]))].sort(),[rows])
  const shown = useMemo(() => rows.filter(product => `${product.name} ${product.sku} ${product.type} ${product.productGroup} ${(product.tags||[]).join(' ')} ${deriveAutomaticTags(product).join(' ')} ${(product.seoBlockReasons||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase())).filter(product => status === 'ALL' || product.status === status).filter(product => seoStatus === 'ALL' || product.seoStatus === seoStatus).filter(product => variantStatus === 'ALL' || Number(product._draftVariantCount || (product.variants || []).filter(variant => variant.status === 'DRAFT').length) > 0).filter(product => group === 'ALL' || product.productGroup === group).filter(product => tag === 'ALL' || [...(product.tags||[]),...deriveAutomaticTags(product)].includes(tag)).sort((a,b)=>sort==='TITLE'?a.name.localeCompare(b.name):sort==='STOCK'?(b.inventory||0)-(a.inventory||0):String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))), [rows, query, status, seoStatus, variantStatus, group, tag, sort])
  const pageSize = 60
  const pageCount = Math.max(1,Math.ceil(shown.length / pageSize))
  const currentPage = Math.min(page,pageCount)
  const pageRows = shown.slice((currentPage - 1) * pageSize,currentPage * pageSize)
  useEffect(()=>setPage(1),[query,status,seoStatus,variantStatus,group,tag,sort])
  const clearFilters=()=>{setQuery('');setStatus('ALL');setSeoStatus('ALL');setVariantStatus('ALL');setGroup('ALL');setTag('ALL')}
  const toggle=id=>{if(bulkBusy)return;setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}
  const toggleShown=()=>{if(!catalogReady || bulkBusy)return;setSelected(current=>shown.every(row=>current.includes(row.id))?current.filter(id=>!shown.some(row=>row.id===id)):[...new Set([...current,...shown.map(row=>row.id)])])}
  const applyBulk=async()=>{
    if(!catalogReady){setBulkNotice('Wait for the full live catalogue before making a bulk change.');return}
    if(!selected.length || bulkBusy)return
    const stock = Number(bulkValue)
    const collectionAction = ['ADD_TO_COLLECTION','REMOVE_FROM_COLLECTION','MOVE_COLLECTION'].includes(bulkAction)
    if (collectionAction && !bulkValue) { setBulkNotice('Choose a collection before applying this change.'); return }
    if(bulkAction === 'ACTIVATE_DRAFT_VARIANTS'){
      if(!Number.isSafeInteger(stock) || stock < 1 || stock > 1000000){setBulkNotice('Enter whole-number stock from 1 to 1,000,000 per Draft variation.');return}
      if(!window.confirm(`Activate priced Draft variations in ${selected.length} selected listing${selected.length === 1 ? '' : 's'} and set each activated variation to ${stock.toLocaleString()} units? Listing publish status will not change.`))return
    }
    setBulkBusy(true);setBulkReport(null);setBulkNotice(`Processing 0 of ${selected.length} listings…`)
    try{
      const result=collectionAction
        ? await onCollectionAction?.(selected,bulkAction,bulkValue)
        : await onBulkUpdate?.(selected,bulkAction,bulkAction === 'ACTIVATE_DRAFT_VARIANTS' ? stock : bulkValue,progress=>{
        setBulkNotice(`Processing ${progress.processed} of ${progress.total} listings · ${progress.updated} updated${progress.failed ? ` · ${progress.failed} failed` : ''}…`)
      })
      if(result?.cancelled){setBulkNotice('Bulk change cancelled.');return}
      if(result?.error){setBulkNotice(`Not saved: ${result.error}`);return}
      setBulkReport(result)
      setBulkNotice(collectionAction ? `${result.updated} listing${result.updated === 1 ? '' : 's'} ${bulkAction === 'ADD_TO_COLLECTION' ? 'added to' : bulkAction === 'MOVE_COLLECTION' ? 'moved to' : 'removed from'} the selected collection.` : `${result.updated} listing${result.updated === 1 ? '' : 's'} updated${bulkAction === 'ACTIVATE_DRAFT_VARIANTS' ? ` · ${result.activated} Draft variation${result.activated === 1 ? '' : 's'} activated at ${stock.toLocaleString()} units each` : ''}${result.ineligibleVariants ? ` · ${result.ineligibleVariants} unpriced Draft variations left unchanged` : ''}${result.skipped ? ` · ${result.skipped} listings skipped` : ''}${result.failures?.length ? ` · ${result.failures.length} failed` : ''}.`)
      if(!result.failures?.length)setSelected([])
    }catch(error){setBulkNotice(`Not saved: ${error instanceof Error ? error.message : 'Bulk update failed.'}`)}
    finally{setBulkBusy(false)}
  }
  return <main className="admin-page admin-catalog"><PageIntro eyebrow="CATALOG / LISTING OPERATIONS" title="THE DROP, IN ORDER." copy={`${shown.length} shown · ${rows.length}${catalogLoad.total != null ? ` of ${catalogLoad.total}` : ''} loaded${catalogLoad.complete ? '' : ' · loading catalogue…'}. Filter, select and update related listings without opening each workspace.`} action="New product" onAction={() => go('/admin/products/new')}/><div className="admin-catalog-toolbar admin-catalog-toolbar--deep"><label className="admin-search admin-search--large"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, SKU, type, group, SEO reason"/></label><label className="admin-catalog-select"><span>Storefront</span><select value={status} onChange={event=>setStatus(event.target.value)}><option>ALL</option><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>SEO gate</span><select value={seoStatus} onChange={event=>setSeoStatus(event.target.value)}><option>ALL</option><option>BLOCKED</option><option>READY</option><option>INDEXABLE</option></select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Variations</span><select value={variantStatus} onChange={event=>setVariantStatus(event.target.value)}><option value="ALL">ALL</option><option value="HAS_DRAFT">HAS DRAFT</option></select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Group</span><select value={group} onChange={event=>setGroup(event.target.value)}><option>ALL</option>{groups.map(item=><option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Tag / signal</span><select value={tag} onChange={event=>setTag(event.target.value)}><option>ALL</option>{tags.map(item=><option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label><label className="admin-catalog-select"><span>Sort</span><select value={sort} onChange={event=>setSort(event.target.value)}><option>UPDATED</option><option>TITLE</option><option>STOCK</option></select><ChevronDown size={13}/></label><button className="admin-text-button" disabled={query===''&&status==='ALL'&&seoStatus==='ALL'&&variantStatus==='ALL'&&group==='ALL'&&tag==='ALL'} title={query===''&&status==='ALL'&&seoStatus==='ALL'&&variantStatus==='ALL'&&group==='ALL'&&tag==='ALL'?'No filters are active.':'Clear every catalogue filter.'} onClick={clearFilters}>Clear filters</button></div><div className="admin-catalog-selection"><button type="button" onClick={toggleShown} disabled={!catalogReady || !shown.length || bulkBusy}>{shown.length && shown.every(row=>selected.includes(row.id)) ? `Deselect all ${shown.length} filtered listings` : `Select all ${shown.length} filtered listings`}</button><span>{selected.length} selected · selection includes every results page</span></div>{!catalogLoad.complete&&<div className="admin-banner-notice" role="status">{catalogLoad.source === 'error' ? 'Live catalogue could not load. Refresh Admin to retry.' : catalogLoad.source === 'partial' ? `Loaded ${catalogLoad.loaded}${catalogLoad.total != null ? ` of ${catalogLoad.total}` : ''} listings; a later page failed. Refresh to retry before bulk changes.` : `Loading catalogue: ${catalogLoad.loaded}${catalogLoad.total != null ? ` / ${catalogLoad.total}` : ''} listings. Bulk changes unlock after loading completes.`}</div>}{selected.length>0&&<div className="admin-bulk-bar"><strong>{selected.length} selected</strong><select value={bulkAction} disabled={bulkBusy} onChange={event=>{setBulkAction(event.target.value);setBulkValue(event.target.value==='ACTIVATE_DRAFT_VARIANTS'?'1000':'')}}><option value="PUBLISHED">Publish storefront (SEO stays gated)</option><option value="DRAFT">Move to draft</option><option value="ARCHIVED">Archive</option><option value="DELETE">Delete permanently</option><option value="ADD_TAG">Add tag</option><option value="SET_GROUP">Move to product group</option><option value="CLEAR_GROUP">Remove product group</option><option value="ADD_TO_COLLECTION">Add to collection</option><option value="REMOVE_FROM_COLLECTION">Remove from collection</option><option value="MOVE_COLLECTION">Move between collections</option><option value="ACTIVATE_DRAFT_VARIANTS">Activate priced Draft variants + set stock</option></select>{bulkAction==='ADD_TAG'&&<input value={bulkValue} disabled={bulkBusy} onChange={event=>setBulkValue(event.target.value)} placeholder="tag-name"/>}{bulkAction==='SET_GROUP'&&<select aria-label="Destination product group" value={bulkValue} disabled={bulkBusy} onChange={event=>setBulkValue(event.target.value)}><option value="">Choose product group</option>{groups.map(item=><option key={item} value={item}>{item}</option>)}</select>}{['ADD_TO_COLLECTION','REMOVE_FROM_COLLECTION','MOVE_COLLECTION'].includes(bulkAction)&&<select aria-label="Target collection" value={bulkValue} disabled={bulkBusy} onChange={event=>setBulkValue(event.target.value)}><option value="">Choose collection</option>{collections.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}{bulkAction==='ACTIVATE_DRAFT_VARIANTS'&&<label className="admin-bulk-stock">Stock per Draft variant <input type="number" min="1" max="1000000" step="1" value={bulkValue} disabled={bulkBusy} onChange={event=>setBulkValue(event.target.value)}/></label>}<button onClick={applyBulk} disabled={bulkBusy || !catalogReady || ['SET_GROUP','ADD_TO_COLLECTION','REMOVE_FROM_COLLECTION','MOVE_COLLECTION'].includes(bulkAction) && !bulkValue}>{bulkBusy?'Updating…':'Apply'}</button><button onClick={()=>setSelected([])} disabled={bulkBusy}>Clear</button><span role={bulkNotice.startsWith('Not saved:')?'alert':'status'}>{bulkNotice}</span></div>}{bulkReport?.failures?.length>0&&<details className="admin-banner-notice"><summary>{bulkReport.failures.length} listings need attention</summary>{bulkReport.failures.slice(0,20).map(item=><p key={item.id}>{item.name}: {item.error}</p>)}</details>}<section className="admin-panel admin-catalog-panel"><div className="admin-table-head admin-table-head--deep"><button className={shown.length&&shown.every(row=>selected.includes(row.id))?'is-checked':''} onClick={toggleShown} disabled={bulkBusy || !catalogReady} title={!catalogReady?'Wait for the full catalogue before selecting all.':'Select all filtered listings across every page'} aria-label="Select all filtered listings">{shown.length&&shown.every(row=>selected.includes(row.id))&&<Check size={12}/>}</button><span>PRODUCT</span><span>GROUP / TYPE</span><span>PRICE</span><span>STATUS</span><span>STOCK</span><span>READY / SEO</span><span/></div><div className="admin-catalog-list">{shown.length ? pageRows.map(product => <CatalogRow product={product} onDuplicate={onDuplicate} onDelete={onDelete} selected={selected.includes(product.id)} onToggle={toggle} key={product.id}/>) : <div className="admin-empty"><Package size={24}/><strong>No products found</strong><span>Try a different search, group or automatic signal.</span><button className="admin-text-button" onClick={clearFilters}>Reset catalogue filters</button></div>}</div></section>{shown.length>pageSize&&<nav className="admin-catalog-pagination" aria-label="Catalogue pages"><button type="button" onClick={()=>setPage(Math.max(1,currentPage-1))} disabled={currentPage===1}>Previous</button><span>Page {currentPage} of {pageCount} · {shown.length} filtered listings</span><button type="button" onClick={()=>setPage(Math.min(pageCount,currentPage+1))} disabled={currentPage===pageCount}>Next</button></nav>}<div className="admin-footnote"><span><Lock size={13}/> Custom fields are controlled per listing; design composition stays locked. SEO indexability is a separate review gate.</span><span>{shown.length ? `${(currentPage-1)*pageSize+1}–${(currentPage-1)*pageSize+pageRows.length} of ${shown.length} filtered` : `0 of ${rows.length} products`}</span></div></main>
}

function IntegrationCard({ icon: Icon, label, title, copy, status, action, onAction }) {
  return <article className="admin-integration"><div className="admin-integration__icon"><Icon size={20}/></div><div><p>{label}</p><h3>{title}</h3><span>{copy}</span></div><div className={`admin-integration__status ${status === 'CONNECTED' ? 'is-connected' : ''}`}><i/>{status}</div><button onClick={onAction}>{action}<ArrowRight size={14}/></button></article>
}

function AdminSettings() {
  const [copied, setCopied] = useState(false)
  const [pixelIdInput, setPixelIdInput] = useState(() => getMetaPixelId())
  const [pixelNotice, setPixelNotice] = useState('')
  const [feedCopied, setFeedCopied] = useState(false)
  const [payment, setPayment] = useState(DEFAULT_PAYMENT_SETTINGS)
  const [readiness, setReadiness] = useState({ ready:false, missing:[] })
  const [paymentNotice, setPaymentNotice] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(true)
  const [mappingText, setMappingText] = useState('')
  const savePixel = () => {
    setMetaPixelId(pixelIdInput)
    setPixelNotice(pixelIdInput.trim() ? `Pixel ID ${pixelIdInput.trim()} saved and active.` : 'Pixel ID cleared. Dev test mode active.')
    setTimeout(() => setPixelNotice(''), 3500)
  }
  const copyFeedUrl = async () => {
    try {
      const url = `${window.location.origin}/api/facebook-catalog-feed`
      await navigator.clipboard.writeText(url)
      setFeedCopied(true)
      setTimeout(() => setFeedCopied(false), 2200)
    } catch {}
  }
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
  return <main className="admin-page admin-settings"><PageIntro eyebrow="SETTINGS / CONNECTIONS" title="KEEP THE PIPELINE CLEAN." copy="Connect infrastructure and configure a payment provider without exposing server secrets to the browser."/><section className="admin-pixel-panel admin-panel"><div className="admin-panel__head"><div><p>MARKETING & CATALOG SYNC</p><h2>META / FACEBOOK PIXEL & CATALOG.</h2></div><StatusPill value={pixelIdInput.trim() ? 'ACTIVE' : 'TEST MODE'}/></div><div className="admin-pixel-body"><div className="admin-pixel-field"><label><span>Meta Pixel ID <small>public (15–16 digits)</small></span><input value={pixelIdInput} onChange={event => setPixelIdInput(event.target.value)} placeholder="e.g. 123456789012345"/></label><button className="admin-button admin-button--dark" onClick={savePixel}><Save size={14}/> Save Pixel ID</button></div>{pixelNotice && <p className="admin-pixel-notice" role="status">{pixelNotice}</p>}<div className="admin-pixel-feed-box"><div><span>FACEBOOK CATALOG DATA FEED URL</span><p>Paste this URL into Meta Commerce Manager (Data Sources → Scheduled Feed) to auto-synchronize products every hour.</p><code>{typeof window !== 'undefined' ? `${window.location.origin}/api/facebook-catalog-feed` : 'https://www.jersevo.com/api/facebook-catalog-feed'}</code></div><button className="admin-button admin-button--outline" onClick={copyFeedUrl}>{feedCopied ? <Check size={14}/> : <Copy size={14}/>} {feedCopied ? 'Copied' : 'Copy Feed URL'}</button></div><div className="admin-pixel-checklist"><span>SYNCHRONIZED STANDARD EVENTS</span><div className="admin-pixel-grid"><div><b>✓ PageView</b><span>Triggered on SPA page transitions</span></div><div><b>✓ ViewContent</b><span>content_ids matched to Catalog Feed</span></div><div><b>✓ AddToCart</b><span>Triggered on bag add with size & options</span></div><div><b>✓ CustomizeProduct</b><span>Triggered on name & number personalization</span></div><div><b>✓ InitiateCheckout</b><span>Triggered on checkout drawer launch</span></div><div><b>✓ Purchase</b><span>Triggered on verified PayPal order capture</span></div></div></div></div></section><section className="admin-payment-panel admin-panel"><div className="admin-panel__head"><div><p>PAYMENT PROVIDER</p><h2>PAYPAL OR PADDLE.</h2></div><StatusPill value={!payment.enabled?'DISABLED':providerUnavailable?'UNAVAILABLE':providerReady?'READY TO TEST':'NEEDS KEYS'}/></div><div className="admin-payment-body"><div className="admin-payment-choice">{['NONE','PAYPAL','PADDLE'].map(provider=><button key={provider} className={payment.provider===provider?'is-active':''} onClick={()=>setPayment(current=>({...current,provider,enabled:provider==='NONE'?false:current.enabled}))}>{provider==='NONE'?'Disabled':provider}</button>)}</div><div className="admin-payment-fields"><label><span>Environment</span><select value={payment.environment} onChange={event=>setPayment(current=>({...current,environment:event.target.value}))}><option value="sandbox">Sandbox / test</option><option value="live">Live</option></select></label><label><span>Currency</span><select value={payment.currency} onChange={event=>setPayment(current=>({...current,currency:event.target.value}))}>{PAYMENT_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label><label className="admin-payment-toggle"><span>Store provider configuration</span><input type="checkbox" checked={payment.enabled} disabled={payment.provider==='NONE'} onChange={event=>setPayment(current=>({...current,enabled:event.target.checked}))}/></label></div>{payment.provider==='PAYPAL'&&<div className="admin-payment-provider"><label><span>PayPal client ID <small>public</small></span><input value={payment.paypal.clientId} onChange={event=>setPayment(current=>({...current,paypal:{clientId:event.target.value}}))} placeholder="PayPal REST app client ID"/></label><p>Server environment must contain <code>PAYPAL_CLIENT_SECRET</code> and <code>PAYPAL_WEBHOOK_ID</code>. Checkout uses Orders v2 capture on the server.</p></div>}{payment.provider==='PADDLE'&&<div className="admin-payment-provider"><label><span>Paddle client token <small>public</small></span><input value={payment.paddle.clientToken} onChange={event=>setPayment(current=>({...current,paddle:{...current.paddle,clientToken:event.target.value}}))} placeholder="test_… or live_…"/></label><label><span>Price map JSON <small>variant or product ID → Paddle price ID</small></span><textarea value={mappingText} onChange={event=>setMappingText(event.target.value)} placeholder={'{\n  "variant-id": "pri_…"\n}'}/></label><p>Paddle remains unavailable for this physical-goods flow until a shipping-capable adapter is implemented. Saving a token does not enable checkout.</p></div>}<div className="admin-payment-status"><strong>{payment.enabled?(providerReady?'Server variables present; run a sandbox checkout test.':providerUnavailable?'Paddle checkout is unavailable for physical goods.':'Checkout remains locked.'):'No payment provider is enabled.'}</strong>{readiness.missing?.length>0&&<span>Missing: {readiness.missing.join(', ')}</span>}<small>Secrets are never stored in Supabase or returned to this page. Saving configuration does not mark any order as paid.</small></div>{paymentNotice&&<p className={paymentNotice.startsWith('Not saved')?'is-error':''} role={paymentNotice.startsWith('Not saved')?'alert':'status'}>{paymentNotice}</p>}<button className="admin-button admin-button--dark" onClick={savePayment} disabled={paymentBusy}><Save size={15}/>{paymentBusy?'Saving…':'Save payment settings'}</button></div></section><section className="admin-settings-grid"><div className="admin-settings-main"><div className="admin-panel admin-settings-panel"><div className="admin-panel__head"><div><p>DEPLOYMENT PIPELINE</p><h2>FROM IDEA TO LIVE.</h2></div><span className="admin-source admin-source--large"><i/>{supabaseConfigured ? 'CONNECTED' : 'READY TO CONNECT'}</span></div><div className="admin-integration-list"><IntegrationCard icon={Cloud} label="DATABASE / AUTH" title="Supabase" copy={supabaseConfigured ? 'Project keys detected in this environment.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.'} status={supabaseConfigured ? 'CONNECTED' : 'NOT CONNECTED'} action="Open project" onAction={() => window.open('https://supabase.com/dashboard/project/ofetusgarxcwloxxkhnr', '_blank', 'noopener,noreferrer')}/><IntegrationCard icon={GitBranch} label="SOURCE CONTROL" title="GitHub" copy="Pushes to main run the production build check." status="READY" action="Open repository" onAction={() => window.open('https://github.com/tantan199103/extra-time-control-room', '_blank', 'noopener,noreferrer')}/><IntegrationCard icon={Link2} label="DEPLOYMENT" title="Vercel" copy="SPA rewrite and build settings are included in vercel.json." status="READY" action="Open dashboard" onAction={() => window.open('https://vercel.com/tanton1s-projects/extra-time-control-room', '_blank', 'noopener,noreferrer')}/></div></div><div className="admin-panel admin-env-panel"><div className="admin-panel__head"><div><p>ENVIRONMENT</p><h2>THE KEYS STAY LOCAL.</h2></div><button className="admin-button admin-button--outline" onClick={copyEnv}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy template'}</button></div><div className="admin-env-row"><span>VITE_SUPABASE_URL</span><code>{supabaseConfigured ? 'https://••••••••.supabase.co' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><div className="admin-env-row"><span>VITE_SUPABASE_ANON_KEY</span><code>{supabaseConfigured ? 'eyJ••••••••••••••••' : 'Not set'}</code><StatusPill value={supabaseConfigured ? 'CONNECTED' : 'MISSING'}/></div><p className="admin-section-copy">Only public browser keys belong in Vite. Provider secrets and webhook secrets must be configured as server environment variables.</p></div></div><aside className="admin-settings-aside"><div className="admin-panel admin-brand-panel"><p>BRAND DEFAULTS</p><h2>THE STUDIO<br /><em>HAS A VOICE.</em></h2><label><span>Storefront name</span><input defaultValue="EXTRA TIME" disabled title="Storefront defaults are not editable yet."/></label><label><span>Default currency</span><strong>{payment.currency}</strong></label><label><span>Default artwork lock</span><strong>70% <small>designer-led</small></strong></label></div><div className="admin-panel admin-doc-panel"><Sparkles size={18}/><p>PAYMENT SAFETY</p><h3>Configuration is not confirmation.</h3><span>Only a verified provider capture or webhook creates a confirmed order. Admin fulfillment controls remain locked until then.</span></div></aside></section></main>
}

export default function AdminApp() { return <AdminAccess><AdminWorkspace/></AdminAccess> }

function AdminWorkspace() {
  const [path, setPath] = useState(window.location.pathname)
  const [productRows, setProductRows] = useState([])
  const [themeDraft, setThemeDraft] = useState(adminTheme)
  const [menuRows, setMenuRows] = useState(adminMenus)
  const [collectionRows, setCollectionRows] = useState(adminCollections)
  const [catalogNavigationRows, setCatalogNavigationRows] = useState([])
  const [collectionSource, setCollectionSource] = useState('loading')
  const [source, setSource] = useState('loading')
  const [loading, setLoading] = useState(true)
  const [loadNotice, setLoadNotice] = useState('')
  const [catalogLoad, setCatalogLoad] = useState({ source:'loading', loaded:0, total:null, complete:false })
  const [badges, setBadges] = useState({ orders: 0, custom: 0, products: 0, membership: 0 })
  const loadSequence = useRef(0)

  const updateBadges = async (currentProducts = productRows) => {
    const draftCount = (currentProducts || []).filter(row => row.status === 'DRAFT' || productCompleteness(row).percent < 100).length
    setBadges(prev => ({ ...prev, products: draftCount }))
    try {
      const [ordersRes, customRes, memRes] = await Promise.allSettled([
        fetchAdminOrders(),
        fetchAdminCustomizations('PREVIEW'),
        fetchAdminMembership()
      ])
      let unfulfilledOrders = 0
      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value?.orders)) {
        unfulfilledOrders = ordersRes.value.orders.filter(o => o.fulfillment_status === 'UNFULFILLED' || (o.payment_status === 'PAID' && o.fulfillment_status !== 'DELIVERED')).length
      }
      let pendingCustom = 0
      if (customRes.status === 'fulfilled' && Array.isArray(customRes.value?.orders)) {
        pendingCustom = customRes.value.orders.filter(r => r.status === 'PREVIEW').length
      }
      let pendingMembership = 0
      if (memRes.status === 'fulfilled' && Array.isArray(memRes.value?.data?.requests)) {
        pendingMembership = memRes.value.data.requests.filter(r => r.status === 'PENDING').length
      }
      setBadges({
        products: draftCount,
        orders: unfulfilledOrders,
        custom: pendingCustom,
        membership: pendingMembership
      })
    } catch {
      // non-blocking
    }
  }

  const loadPart = (task, fallback, label, timeoutMs = 12000) => Promise.race([
    task,
    new Promise(resolve => window.setTimeout(() => resolve({ data: fallback, source: 'preview', error: `${label} timed out. Showing the control-room fallback.` }), timeoutMs))
  ]).catch(error => ({ data: fallback, source: 'preview', error: error instanceof Error ? error.message : `${label} failed.` }))
  const load = async () => {
    const sequence = ++loadSequence.current
    setLoading(true); setLoadNotice('')
    setSource('loading')
    setCatalogLoad({ source:'loading', loaded:0, total:null, complete:false })
    setCollectionSource('loading')
    // Taxonomy landing pages are a small deploy-time index. Load them beside
    // the database requests so the 300+ generated routes never block Admin's
    // first paint or get mistaken for the 63 editorial collection records.
    fetchStorefrontNavigationIndex().then(rows => {
      if (sequence === loadSequence.current && Array.isArray(rows) && rows.length) setCatalogNavigationRows(rows)
    }).catch(() => {})
    const mergeCatalogPage = (rows, progress = {}) => {
      if (sequence !== loadSequence.current || !Array.isArray(rows)) return
      setProductRows(current => {
        if (progress.page === 0) return rows
        const byId = new Map(current.map(row => [row.id, row]))
        rows.forEach(row => byId.set(row.id, row))
        return [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      })
      setCatalogLoad(current => ({ source:'supabase', loaded:Math.max(current.loaded,Number(progress.loaded || 0)), total:progress.total ?? current.total, complete:Boolean(progress.done) }))
    }
    const catalogError = error => {
      if (sequence !== loadSequence.current) return
      const message = error instanceof Error ? error.message : String(error || 'Background catalogue request failed.')
      setCatalogLoad(current => ({ ...current, source:'partial', complete:false }))
      setLoadNotice(`Catalogue loaded partially; remaining listings could not be loaded (${message}). Click Refresh to retry.`)
    }
    try {
      // A slow catalog join must not hold the entire control room hostage.
      // Each workspace data source has its own deadline and can fall back
      // independently while the rest of Admin remains usable.
      const [productResult, themeResult, menuResult, collectionResult] = await Promise.all([
        loadPart(fetchAdminProducts({ onPage: mergeCatalogPage, onError: catalogError }), [], 'Catalog'),
        loadPart(fetchAdminTheme(), adminTheme, 'Theme'),
        loadPart(fetchAdminMenus(), adminMenus, 'Menus'),
        loadPart(fetchAdminCollections(), adminCollections, 'Collections', 30000)
      ])
      if (sequence !== loadSequence.current) return
      const products = productResult.data || []
      // The first page callback may already have received later pages while
      // Theme/Menu/Collections were loading. Do not replace it with page 1.
      if (productResult.source !== 'supabase') {
        setProductRows([])
        setCatalogLoad({ source:'error', loaded:0, total:null, complete:false })
      }
      if (themeResult.data) setThemeDraft(themeResult.data)
      const collections = collectionResult.source === 'supabase' ? collectionResult.data || [] : adminCollections
      setCollectionRows(collections)
      setCollectionSource(collectionResult.source)
      const menus = menuResult.data?.length ? menuResult.data : adminMenus
      setMenuRows(resolveMenuImages(menus, {
        products,
        collections,
        pages: themeResult.data?.pages || adminTheme.pages
      }))
      const isLive = [productResult, themeResult, menuResult, collectionResult].every(result => result.source === 'supabase' && !result.error)
      setSource(isLive ? 'supabase' : productResult.source === 'supabase' ? 'partial' : 'preview')
      if (!isLive) {
        const failures = [['Catalog',productResult],['Theme',themeResult],['Menus',menuResult],['Collections',collectionResult]].filter(([,result]) => result.error).map(([name,result]) => `${name}: ${result.error}`)
        if (failures.length) setLoadNotice(`Some Admin data is unavailable (${failures.join(' · ')}). Click Refresh to retry.`)
      }
    } catch (error) {
      console.error('Admin load error:', error)
      setProductRows([])
      setCatalogLoad({ source:'error', loaded:0, total:null, complete:false })
      setThemeDraft(adminTheme)
      setMenuRows(adminMenus)
      setCollectionRows(adminCollections)
      setCollectionSource('error')
      setSource('preview')
      setLoadNotice(`Operating in preview mode (${error instanceof Error ? error.message : 'query error'}).`)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); load(); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => { if (catalogLoad.complete) updateBadges(productRows) }, [catalogLoad.complete, productRows.length])
  const saveProduct = useCallback(product => setProductRows(current => current.some(item => item.id === product.id) ? current.map(item => item.id === product.id ? product : item) : [...current, product]), [])
  const deleteProduct = useCallback(async productId => {
    const result = await deleteAdminProduct(productId)
    if (result.error) {
      setLoadNotice(`Cannot delete listing: ${result.error}`)
      return false
    }
    setProductRows(current => current.filter(item => item.id !== productId))
    return true
  }, [])
  const duplicateProduct = async product => {
    let source = product
    if (product?._catalogSummary) {
      const result = await fetchAdminProduct(product.id)
      if (result.error || !result.data) {
        setLoadNotice(`Could not load the complete listing before duplicating: ${result.error || 'Please retry.'}`)
        return
      }
      source = result.data
    }
    const copy = duplicateProductDraft(source, productRows)
    saveProduct(copy)
    go(`/admin/products/${copy.id}`)
  }
  const bulkUpdateProducts = async (ids,action,value,onProgress) => {
    const targets=productRows.filter(product=>ids.includes(product.id))
    if(!targets.length)return {error:'Select at least one listing.'}
    if(action === 'DELETE') {
      if(!window.confirm(`Permanently delete ${targets.length} listing${targets.length === 1 ? '' : 's'}? This action cannot be undone.`)) return { cancelled:true }
      const failures = []
      const deletedIds = []
      for(const product of targets) {
        const result = await deleteAdminProduct(product.id)
        if(result.error) failures.push({ id:product.id, name:product.name || product.id, error:result.error })
        else deletedIds.push(product.id)
        onProgress?.({ processed:deletedIds.length + failures.length, total:targets.length, updated:deletedIds.length, failed:failures.length })
      }
      if(deletedIds.length) setProductRows(current => current.filter(row => !deletedIds.includes(row.id)))
      return { updated:deletedIds.length, activated:0, skipped:0, failures }
    }
    const result=await runAdminCatalogBulk(targets,action,value,{fetchProduct:fetchAdminProduct,saveProduct:saveAdminProduct,onProgress})
    if(result.data?.length){
      const byId=new Map(result.data.map(row=>[row.id,row]))
      setProductRows(current=>current.map(row=>byId.get(row.id)||row))
    }
    return result
  }
  const persistTheme = async theme => { setThemeDraft(theme); return saveAdminTheme(theme) }
  const persistMenus = async menus => { setMenuRows(menus); return saveAdminMenus(menus) }
  const persistCollections = async collections => {
    if (collectionSource !== 'supabase') return { source:'error', error:'Wait for live collections to load before saving.' }
    const result = await saveAdminCollections(collections, collectionRows)
    if (result.source === 'supabase' && !result.error) {
      const byId = new Map(collections.map(row => [row.id,row]))
      setCollectionRows(current => [...current.map(row => byId.get(row.id) || row), ...collections.filter(row => !current.some(old => old.id === row.id))])
    }
    return result
  }
  const removeCollection = async collectionId => {
    if (collectionSource !== 'supabase') return { source:'error', error:'Wait for live collections to load before deleting.' }
    const result = await deleteAdminCollection(collectionId)
    if (!result.error) {
      setCollectionRows(current => current.filter(row => row.id !== collectionId))
      // A menu can still contain a stale explicit /collection/:handle target.
      // Refreshing the menu resolver on the next load prevents it from being
      // silently redirected to an unrelated collection.
      setLoadNotice('Collection deleted. Its listings were kept in the catalogue; refresh menus if one linked to it.')
    }
    return result
  }
  const applyCollectionAutomation = async collection => {
    if (collectionSource !== 'supabase') return { source:'error', error:'Wait for live collections to load before applying automatic rules.' }
    const saved = await saveAdminCollections([collection], collectionRows)
    if (saved.error) return saved
    const applied = await applyAdminCollectionAutomation(collection.id, collection.automation)
    if (applied.error) return applied
    const refreshed = await fetchAdminCollections()
    if (refreshed.source !== 'supabase' || refreshed.error) return { source:'error', error:refreshed.error || 'Rules were applied, but collection membership could not be refreshed.' }
    setCollectionRows(refreshed.data)
    return { ...applied, collection:refreshed.data.find(row => row.id === collection.id) || collection }
  }
  const bulkCollectionAction = async (ids, action, collectionId) => {
    if (collectionSource !== 'supabase' || !catalogLoad.complete) return { error:'Wait for live collections and the full catalogue before changing membership.' }
    let changed
    try { changed = applyCollectionMembership(collectionRows, ids, action, collectionId) }
    catch (error) { return { error:error.message } }
    if (!changed.changedIds.length) return { updated:0, skipped:ids.length, failures:[] }
    const result = await persistCollections(changed.collections.filter(row => changed.changedIds.includes(row.id)))
    return result.error ? { error:result.error } : { updated:ids.length, failures:[], skipped:0 }
  }
  if (loading && !productRows.length) return <main className="admin-access"><p role="status">Loading store data…</p></main>
  const isEditor = path.startsWith('/admin/products/')
  const active = path === '/admin/bridge' ? 'bridge' : path.startsWith('/admin/orders') ? 'orders' : path.startsWith('/admin/membership') ? 'membership' : path.startsWith('/admin/customizations') ? 'customizations' : isEditor || path === '/admin/catalog' ? 'catalog' : path.startsWith('/admin/theme/menus') ? 'menus' : path.startsWith('/admin/theme') ? 'theme' : path.startsWith('/admin/collections') ? 'collections' : path === '/admin/settings' ? 'settings' : 'overview'
  let page = <AdminOverview products={productRows} catalogLoad={catalogLoad}/>
  if (path === '/admin/bridge') page = <PodBridgeReceiver products={productRows} onSaved={saveProduct}/>
  else if (path.startsWith('/admin/orders')) page = <AdminOrders/>
  else if (path === '/admin/catalog') page = <AdminCatalog products={productRows} onDuplicate={duplicateProduct} onDelete={deleteProduct} onBulkUpdate={bulkUpdateProducts} onCollectionAction={bulkCollectionAction} collections={collectionRows} catalogLoad={catalogLoad}/>
  else if (isEditor) page = <ListingWorkspace key={path} products={productRows} onSaved={saveProduct} onDuplicate={saveProduct} onDelete={deleteProduct}/>
  else if (path.startsWith('/admin/membership')) page = <AdminMembership/>
  else if (path.startsWith('/admin/customizations')) page = <AdminCustomizations/>
  else if (path === '/admin/theme') page = <AdminThemeStudio theme={themeDraft} onSave={persistTheme}/>
  else if (path === '/admin/theme/menus') page = <AdminMenus menus={menuRows} collections={collectionRows} onSave={persistMenus}/>
  else if (path === '/admin/collections') page = <AdminCollections collections={collectionRows} products={productRows} navigationRows={catalogNavigationRows} catalogLoad={catalogLoad} onSave={persistCollections} onDelete={removeCollection} loadCatalog={fetchAdminCollectionCatalog} onPreviewAutomation={previewAdminCollectionAutomation} onApplyAutomation={applyCollectionAutomation} onUploadImage={uploadCollectionImage} canEdit={collectionSource === 'supabase'}/>
  else if (path === '/admin/settings') page = <AdminSettings/>
  const displaySource = catalogLoad.source === 'partial' ? 'partial' : catalogLoad.source === 'error' ? 'preview' : source
  return <AdminShell active={active} source={displaySource} notice={loadNotice} onRefresh={load} badges={badges}>{page}</AdminShell>
}
