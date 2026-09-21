import VariantMatrix from './VariantMatrix'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Image,
  Layers3,
  LayoutTemplate,
  Link2,
  Lock,
  Menu as MenuIcon,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Save,
  Smartphone,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Monitor,
  X
} from 'lucide-react'
import { adminProductOptions, themeBlocks } from './admin-builder-data'
import { menuImageProblem, menuTargetProblem, normalizeMenuLocation } from './lib/storefront-model'
import './admin-builder.css'

const navigate = path => {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}

const statusClass = value => String(value || '').toLowerCase().replace(/\s+/g, '-')

function BuilderIntro({ eyebrow, title, copy, action, onAction }) {
  return <div className="admin-page-intro builder-intro"><div><p>{eyebrow}</p><h1>{title}</h1>{copy && <span>{copy}</span>}</div>{action && <button className="admin-button admin-button--dark" onClick={onAction}><Plus size={16}/>{action}</button>}</div>
}

function Status({ value }) {
  return <span className={`admin-status admin-status--${statusClass(value)}`}><i/>{value}</span>
}

function SaveNotice({ notice }) {
  if (!notice) return null
  return <div className="admin-toast" role={notice.startsWith("Not saved:") ? "alert" : "status"}>{notice.startsWith("Not saved:") ? <X size={15}/> : <Check size={15}/>}<span>{notice}</span></div>
}

export function AdminThemeStudio({ theme, onSave }) {
  const [selectedPageId, setSelectedPageId] = useState(theme.pages[0]?.id)
  const [selectedBlockId, setSelectedBlockId] = useState('hero')
  const [device, setDevice] = useState('desktop')
  const [blocks, setBlocks] = useState(theme.blocks?.length ? theme.blocks : themeBlocks)
  const [tokens, setTokens] = useState(theme.tokens)
  const [pages, setPages] = useState(theme.pages)
  const [content, setContent] = useState({ eyebrow: 'CUSTOM JERSEYS', headline: 'YOUR NAME.\nYOUR NUMBER.\nYOUR JERSEY.', supporting: 'Made for fans. Personalized with the details that make it yours.', button: 'START CUSTOMIZING', ...(theme.content || {}) })
  const [notice, setNotice] = useState('')
  const selectedPage = pages.find(page => page.id === selectedPageId) || pages[0]
  const selectedBlock = blocks.find(block => block.id === selectedBlockId) || blocks[0]
  const enabledPreviewBlocks = blocks.filter(block => block.enabled !== false && !['announcement', 'header', 'footer', 'hero'].includes(block.id))
  const previewBlockLabels = {
    'home-trust': 'Trust strip / order assurances',
    leagues: 'League discovery / crawlable routes',
    rail: 'Starting lineup / product rail',
    'home-path': 'Make it yours / four steps',
    'custom-options': 'Controlled customization / 30% personal layer',
    quality: 'Detail proof / materials and fit',
    drop: 'Featured drop / editorial commerce',
    players: 'Shop by intent',
    community: 'Community / editorial proof',
    faq: 'FAQ / objections and trust',
    newsletter: 'Newsletter capture',
    story: 'Story explorer',
    vault: 'Vault teaser',
    manifesto: 'Brand manifesto'
  }
  const updateToken = (key, value) => setTokens(current => ({ ...current, [key]: value }))
  const updateContent = (key, value) => setContent(current => ({ ...current, [key]: value }))
  const updatePage = (key, value) => setPages(current => current.map(page => page.id === selectedPage?.id ? { ...page, [key]: value } : page))
  const moveBlock = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    setBlocks(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  const save = async (status = 'DRAFT') => {
    const result = await onSave?.({ ...theme, status, tokens, blocks, pages:pages.map(page => ({ ...page, status:status === 'PUBLISHED' ? 'PUBLISHED' : page.status === 'PUBLISHED' ? 'DRAFT' : page.status })), content, updatedAt: 'Just now' })
    setNotice(result?.source === 'supabase' ? (status === 'PUBLISHED' ? 'Theme published to storefront.' : 'Draft saved. The live storefront is unchanged.') : result?.error ? `Not saved: ${result.error}` : 'Changes kept in this preview only; not published.')
    window.setTimeout(() => setNotice(''), 2200)
  }
  return <main className="admin-page admin-builder-page">
    <BuilderIntro eyebrow="STOREFRONT / THEME STUDIO" title={<>DIRECT THE<br /><em>POINT OF VIEW.</em></>} copy="Edit copy, layout and visual tokens from one controlled system. No broken CSS, no mystery spacing." action="View live storefront" onAction={() => window.open('/', '_blank')}/>
    <section className="admin-theme-toolbar">
      <div className="admin-theme-toolbar__identity"><span className="admin-theme-mark"><LayoutTemplate size={16}/></span><div><strong>{theme.name}</strong><small>Version {theme.version} · {theme.status}</small></div></div>
      <div className="admin-theme-toolbar__devices"><button className={device === 'desktop' ? 'is-active' : ''} onClick={() => setDevice('desktop')}><Monitor size={14}/> Desktop</button><button className={device === 'mobile' ? 'is-active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={14}/> Mobile</button></div>
      <div className="admin-theme-toolbar__actions"><button className="admin-icon-button" aria-label="Undo — not available yet" disabled title="Undo is not available yet."><Undo2 size={15}/></button><button className="admin-icon-button" aria-label="Redo — not available yet" disabled title="Redo is not available yet."><Redo2 size={15}/></button><button className="admin-button admin-button--outline" onClick={() => navigate('/admin/theme/menus')}><MenuIcon size={14}/> Menus</button><button className="admin-button admin-button--outline" onClick={() => save('DRAFT')}><Save size={14}/> Save draft</button><button className="admin-button admin-button--dark" onClick={() => save('PUBLISHED')}><PackageCheck size={14}/> Publish</button></div>
    </section>
    <section className="admin-theme-workspace">
      <aside className="admin-theme-pages"><div className="admin-builder-panel-head"><span>PAGES</span><button className="admin-text-button" onClick={() => { const page = { id: `page-${Date.now()}`, name: 'New page', path: '/new-page', status: 'DRAFT', sections: 0, updatedAt: 'Not saved', layout: [], representativeImage: '/assets/hero-tunnel.webp', representativeAlt: 'Page preview' }; setPages(current => [...current, page]); setSelectedPageId(page.id) }}><Plus size={13}/> Add page</button></div><div className="admin-theme-page-list">{pages.map(page => <button key={page.id} className={selectedPageId === page.id ? 'is-active' : ''} onClick={() => setSelectedPageId(page.id)}><span><strong>{page.name}</strong><small>{page.path}</small></span><Status value={page.status}/></button>)}</div>{selectedPage && <div className="admin-theme-page-media"><small>REPRESENTATIVE IMAGE</small>{(selectedPage.representativeImage || selectedPage.representative_image) && <img src={selectedPage.representativeImage || selectedPage.representative_image} alt={selectedPage.representativeAlt || selectedPage.representative_alt || ''}/>}<label className="admin-builder-field"><span>Image URL</span><input value={selectedPage.representativeImage || selectedPage.representative_image || ''} onChange={event => updatePage('representativeImage', event.target.value)} placeholder="/assets/… or https://…"/></label><label className="admin-builder-field"><span>Alt text</span><input value={selectedPage.representativeAlt || selectedPage.representative_alt || ''} onChange={event => updatePage('representativeAlt', event.target.value)} placeholder="Accessible page description"/></label><span>Menu items in Auto mode use this image.</span></div>}<div className="admin-theme-global-link"><SlidersHorizontal size={14}/><div><strong>Global styles</strong><small>Tokens used across every page</small></div><ArrowRight size={14}/></div></aside>
      <div className={`admin-theme-canvas admin-theme-canvas--${device}`}><div className="admin-canvas-bar"><span>LIVE CANVAS / {selectedPage?.name.toUpperCase()}</span><span><i/> Draft preview</span></div><div className="admin-storefront-preview"><div className="admin-preview-announcement">THE 90+ DROP IS LIVE <span>FREE SHIPPING OVER $100</span></div><div className="admin-preview-nav"><strong>90<sup>+</sup> EXTRA TIME</strong><span>SHOP　 MOMENTS　 PLAYERS　 CUSTOM LAB</span><b>BAG (0)</b></div>{selectedPage?.id === 'product' ? <div className="admin-preview-product"><div className="admin-preview-product__image"><img src="/assets/jersey-black.webp" alt="Product preview"/></div><div className="admin-preview-product__copy"><small>PERSONALIZED / VENOM</small><h3>AFTER 90</h3><strong>$89</strong><p>The minutes nobody forgets.</p><button disabled title="Visual preview only; shopping is available on the live storefront.">ADD TO BAG</button></div></div> : <div className="admin-preview-home"><div className="admin-preview-hero"><span>{content.eyebrow}</span><h3>{content.headline.toUpperCase()}</h3><p>{content.supporting}</p><button disabled title="Visual preview only; use View live storefront to browse.">{content.button.toUpperCase()} <ArrowRight size={13}/></button><img src="/assets/hero-tunnel.webp" alt="Theme hero preview"/></div><div className="admin-preview-home__sections"><div className="admin-preview-home__section-head"><span>HOMEPAGE SEQUENCE</span><strong>{enabledPreviewBlocks.length} storefront sections</strong></div>{enabledPreviewBlocks.map((block, index) => <div key={block.id} className="admin-preview-home__section"><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{previewBlockLabels[block.id] || block.type}</strong><small>{block.note}</small></span><i>{block.id === selectedBlockId ? 'EDITING' : 'READY'}</i></div>)}</div></div>}<div className="admin-preview-footer"><span>EXTRA TIME STUDIO</span><span>MADE FOR THE GAME / AFTER THE GAME</span></div></div></div>
      <aside className="admin-theme-inspector"><div className="admin-builder-panel-head"><span>INSPECTOR</span><span className="admin-inspector-mode"><Type size={13}/> {selectedBlock?.type}</span></div><div className="admin-inspector-tabs"><button className="is-active" disabled title="Content panel is already open.">Content</button><button disabled title="Design panel is not available yet.">Design · Soon</button><button disabled title="Responsive panel is not available yet.">Responsive · Soon</button></div><section className="admin-inspector-section"><div className="admin-inspector-section__head"><div><small>SELECTED SECTION</small><strong>{selectedBlock?.type}</strong></div><MoreHorizontal size={16}/></div><label className="admin-builder-field"><span>Eyebrow</span><input value={content.eyebrow} onChange={event => updateContent('eyebrow', event.target.value)}/></label><label className="admin-builder-field"><span>Headline</span><textarea value={content.headline} onChange={event => updateContent('headline', event.target.value)}/></label><label className="admin-builder-field"><span>Supporting copy</span><textarea value={content.supporting} onChange={event => updateContent('supporting', event.target.value)} /></label><label className="admin-builder-field"><span>Primary button</span><input value={content.button} onChange={event => updateContent('button', event.target.value)}/></label></section><section className="admin-inspector-section"><div className="admin-inspector-section__head"><div><small>GLOBAL TOKENS</small><strong>Visual language</strong></div><SlidersHorizontal size={15}/></div><label className="admin-builder-color"><span>Ink</span><input type="color" value={tokens.ink} onChange={event => updateToken('ink', event.target.value)}/><code>{tokens.ink}</code></label><label className="admin-builder-color"><span>Acid accent</span><input type="color" value={tokens.acid} onChange={event => updateToken('acid', event.target.value)}/><code>{tokens.acid}</code></label><label className="admin-builder-field"><span>Max content width</span><input value={tokens.maxWidth} onChange={event => updateToken('maxWidth', event.target.value)}/></label></section><section className="admin-inspector-section admin-inspector-section--quiet"><div className="admin-inspector-section__head"><div><small>SECTION ORDER</small><strong>{blocks.length} blocks on this page</strong></div><Layers3 size={15}/></div><div className="admin-block-list">{blocks.map((block, index) => <div key={block.id} className={selectedBlockId === block.id ? 'is-selected' : ''}><button className="admin-block-select" onClick={() => setSelectedBlockId(block.id)}><GripVertical size={13}/><span><strong>{block.type}</strong><small>{block.note}</small></span></button><button className="admin-block-icon" onClick={() => moveBlock(index, -1)} aria-label="Move section up"><ChevronUp size={13}/></button><button className="admin-block-icon" onClick={() => moveBlock(index, 1)} aria-label="Move section down"><ChevronDown size={13}/></button><button className="admin-block-icon" onClick={() => setBlocks(current => current.map(item => item.id === block.id ? { ...item, enabled: !item.enabled } : item))} aria-label="Toggle section">{block.enabled ? <Eye size={13}/> : <Eye size={13} opacity={.35}/>}</button></div>)}</div></section></aside>
    </section>
    <SaveNotice notice={notice}/>
  </main>
}

const updateMenuTreeItem = (items, itemId, updater) => (items || []).map(item => item.id === itemId
  ? updater(item)
  : { ...item, children: updateMenuTreeItem(item.children, itemId, updater) })

const removeMenuTreeItem = (items, itemId) => (items || []).filter(item => item.id !== itemId).map(item => ({ ...item, children: removeMenuTreeItem(item.children, itemId) }))

const moveMenuTreeItem = (items, itemId, direction) => {
  const list = [...(items || [])]
  const index = list.findIndex(item => item.id === itemId)
  if (index >= 0) {
    const target = index + direction
    if (target < 0 || target >= list.length) return list
    ;[list[index], list[target]] = [list[target], list[index]]
    return list
  }
  return list.map(item => ({ ...item, children: moveMenuTreeItem(item.children, itemId, direction) }))
}

const collectMenuTreeItems = (items, output = []) => {
  ;(items || []).forEach(item => { output.push(item); collectMenuTreeItems(item.children, output) })
  return output
}

const newMenuItem = (parent = null) => ({
  id: `menu-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  label: parent ? 'New child link' : 'New link', target: '/', type: 'PAGE', visible: true,
  imageMode: 'AUTO', imageUrl: '', imageAlt: '', representativeImage: '/assets/hero-tunnel.webp', representativeAlt: 'Navigation image', representativeSource: 'FALLBACK', children: []
})

function MenuItemEditor({ item, depth, onUpdate, onMove, onDelete, onAddChild }) {
  const targetProblem = menuTargetProblem(item.target, item.type)
  const imageProblem = menuImageProblem(item)
  const hasError = (item.visible !== false && targetProblem) || imageProblem
  return <div className={`admin-menu-item admin-menu-item--depth-${Math.min(depth, 3)} ${hasError ? 'has-error' : ''}`}>
    <div className="admin-menu-item__main">
      <GripVertical size={15} className="admin-menu-drag" aria-hidden="true" />
      <div className="admin-menu-item__fields">
        <input value={item.label || ''} onChange={event => onUpdate(item.id, 'label', event.target.value)} aria-label="Menu label" placeholder="Link label" />
        <div className="admin-menu-item__link-row"><select value={String(item.type || 'PAGE').toUpperCase()} onChange={event => onUpdate(item.id, 'type', event.target.value)} aria-label="Link type"><option value="PAGE">Page</option><option value="COLLECTION">Collection</option><option value="PRODUCT">Product</option><option value="ACTION">Action</option><option value="EXTERNAL">External</option></select><input value={item.target || ''} onChange={event => onUpdate(item.id, 'target', event.target.value)} aria-label="Menu link" placeholder="/destination" /></div>
        <div className="admin-menu-item__media-row"><label><span>Thumbnail</span><select value={item.imageMode || 'AUTO'} onChange={event => onUpdate(item.id, 'imageMode', event.target.value)}><option value="AUTO">Auto from linked page</option><option value="CUSTOM">Custom image</option><option value="NONE">No image</option></select></label>{item.imageMode === 'CUSTOM' && <label className="admin-menu-item__media-url"><span>Image URL</span><input value={item.imageUrl || ''} onChange={event => onUpdate(item.id, 'imageUrl', event.target.value)} placeholder="https://… or /assets/…" /></label>}<div className="admin-menu-item__thumb">{item.representativeImage ? <img src={item.representativeImage} alt={item.representativeAlt || ''} /> : <Image size={16} />}<small>{item.representativeSource || (item.imageMode === 'NONE' ? 'NONE' : 'MISSING')}</small></div></div>
        {item.imageMode !== 'NONE' && <label className="admin-menu-item__alt"><span>Thumbnail alt (optional)</span><input value={item.imageAlt || ''} onChange={event => onUpdate(item.id, 'imageAlt', event.target.value)} placeholder="Uses linked title when empty" /></label>}
        {targetProblem && item.visible !== false && <small className="admin-menu-item__error">{targetProblem}</small>}
        {imageProblem && <small className="admin-menu-item__error">{imageProblem}</small>}
      </div>
      <button className={`admin-visibility ${item.visible !== false ? 'is-on' : ''}`} onClick={() => onUpdate(item.id, 'visible', item.visible === false)}>{item.visible !== false ? 'Visible' : 'Hidden'}</button>
      <div className="admin-menu-item__actions"><button className="admin-block-icon" onClick={() => onMove(item.id, -1)} aria-label="Move link up"><ChevronUp size={13} /></button><button className="admin-block-icon" onClick={() => onMove(item.id, 1)} aria-label="Move link down"><ChevronDown size={13} /></button>{depth < 2 && <button className="admin-block-icon" onClick={() => onAddChild(item.id)} aria-label="Add child link"><Plus size={13} /></button>}<button className="admin-block-icon" onClick={() => onDelete(item.id)} aria-label="Delete link"><Trash2 size={13} /></button></div>
    </div>
    {item.children?.length > 0 && <div className="admin-menu-children">{item.children.map(child => <MenuItemEditor key={child.id} item={child} depth={depth + 1} onUpdate={onUpdate} onMove={onMove} onDelete={onDelete} onAddChild={onAddChild} />)}</div>}
  </div>
}

export function AdminMenus({ menus, onSave }) {
  const [selectedId, setSelectedId] = useState(menus[0]?.id)
  const [draftMenus, setDraftMenus] = useState(menus)
  const [notice, setNotice] = useState('')
  const selected = draftMenus.find(menu => menu.id === selectedId) || draftMenus[0]
  useEffect(() => {
    setDraftMenus(menus)
    if (!menus.some(menu => menu.id === selectedId)) setSelectedId(menus[0]?.id)
  }, [menus])
  const updateMenu = updater => { if (!selected) return; setDraftMenus(current => current.map(menu => menu.id === selected.id ? updater(menu) : menu)) }
  const updateItem = (itemId, key, value) => updateMenu(menu => ({ ...menu, items: updateMenuTreeItem(menu.items, itemId, item => ({ ...item, [key]: value })) }))
  const moveItem = (itemId, direction) => updateMenu(menu => ({ ...menu, items: moveMenuTreeItem(menu.items, itemId, direction) }))
  const addItem = () => updateMenu(menu => ({ ...menu, items: [...(menu.items || []), newMenuItem()] }))
  const addChild = parentId => updateMenu(menu => ({ ...menu, items: updateMenuTreeItem(menu.items, parentId, item => ({ ...item, children: [...(item.children || []), newMenuItem(item)] })) }))
  const deleteItem = itemId => updateMenu(menu => ({ ...menu, items: removeMenuTreeItem(menu.items, itemId) }))
  const addMenu = () => { const menu = { id: `menu-${Date.now()}`, name: 'New menu', location: 'MOBILE_DRAWER', status: 'DRAFT', updatedAt: 'Not saved', items: [] }; setDraftMenus(current => [...current, menu]); setSelectedId(menu.id) }
  const save = async () => {
    const allItems = draftMenus.flatMap(menu => collectMenuTreeItems(menu.items))
    const invalid = allItems.find(item => item.visible !== false && menuTargetProblem(item.target, item.type))
    if (invalid) { setNotice(`Not saved: ${invalid.label || 'Link'} — ${menuTargetProblem(invalid.target, invalid.type)}`); return }
    const invalidImage = allItems.find(item => menuImageProblem(item))
    if (invalidImage) { setNotice(`Not saved: ${invalidImage.label || 'Link'} — ${menuImageProblem(invalidImage)}`); return }
    const locations = draftMenus.filter(menu => menu.status !== 'ARCHIVED').map(menu => normalizeMenuLocation(menu.location)).filter(Boolean)
    if (new Set(locations).size !== locations.length) { setNotice('Not saved: each theme location can have one active menu.'); return }
    const result = await onSave?.(draftMenus.map(menu => ({ ...menu, location: normalizeMenuLocation(menu.location) })))
    setNotice(result?.source === 'supabase' ? 'Navigation and menu thumbnails saved.' : result?.error ? `Not saved: ${result.error}` : 'Changes kept in this preview only; not published.')
    window.setTimeout(() => setNotice(''), 2200)
  }
  const preview = () => window.open('/', '_blank', 'noopener,noreferrer')
  return <main className="admin-page admin-menus-page"><BuilderIntro eyebrow="STOREFRONT / NAVIGATION" title={<>MAKE IT<br /><em>FINDABLE.</em></>} copy="Build a nested menu, assign its storefront location and control whether every thumbnail follows the linked page automatically." action="Save navigation" onAction={save} /><div className="admin-menu-workspace"><aside className="admin-menu-list"><div className="admin-builder-panel-head"><span>{draftMenus.length} MENUS</span><button className="admin-text-button" onClick={addMenu}><Plus size={13} /> New menu</button></div>{draftMenus.map(menu => <button key={menu.id} className={menu.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(menu.id)}><MenuIcon size={15} /><span><strong>{menu.name}</strong><small>{normalizeMenuLocation(menu.location)} · {(menu.items || []).length} top links</small></span><Status value={menu.status} /></button>)}<div className="admin-menu-tip"><Link2 size={14} /><span><strong>Verified navigation</strong><small>Internal routes are checked before saving. Auto thumbnails follow the linked product, collection or page.</small></span></div></aside><section className="admin-menu-editor">{selected ? <><div className="admin-menu-editor__head"><div><p>MENU BUILDER / {normalizeMenuLocation(selected.location)}</p><h2>{selected.name}</h2></div><div><button className="admin-button admin-button--outline" onClick={preview}><Eye size={14} /> Preview storefront</button><button className="admin-button admin-button--dark" onClick={save}><Save size={14} /> Save</button></div></div><div className="admin-menu-location"><label className="admin-builder-field"><span>Menu name</span><input value={selected.name || ''} onChange={event => updateMenu(menu => ({ ...menu, name: event.target.value }))} /></label><label className="admin-builder-field"><span>Theme location</span><select value={normalizeMenuLocation(selected.location)} onChange={event => updateMenu(menu => ({ ...menu, location: event.target.value }))}><option value="HEADER">Header</option><option value="FOOTER">Footer</option><option value="FIXED_FOOTER_MOBILE">Fixed footer / mobile</option><option value="MOBILE_DRAWER">Mobile drawer</option></select></label><label className="admin-builder-field"><span>Publishing status</span><select value={selected.status || 'DRAFT'} onChange={event => updateMenu(menu => ({ ...menu, status: event.target.value }))}><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></label></div><div className="admin-menu-items-head"><span>LINKS / USE ARROWS TO REORDER / NESTED STRUCTURE / THUMBNAILS</span><button className="admin-text-button" onClick={addItem}><Plus size={13} /> Add top-level link</button></div><div className="admin-menu-items">{(selected.items || []).map(item => <MenuItemEditor key={item.id} item={item} depth={0} onUpdate={updateItem} onMove={moveItem} onDelete={deleteItem} onAddChild={addChild} />)}{!(selected.items || []).length && <div className="admin-empty"><MenuIcon size={24} /><strong>This menu is empty</strong><span>Add a top-level link to start building the tree.</span><button className="admin-text-button" onClick={addItem}>Add first link</button></div>}</div><div className="admin-menu-preview"><div className="admin-builder-panel-head"><span>STOREFRONT PREVIEW</span><button className="admin-text-button" onClick={preview}><Monitor size={13} /> Open live storefront</button></div><div className="admin-menu-preview__bar"><strong>90<sup>+</sup> EXTRA TIME</strong>{(selected.items || []).filter(item => item.visible !== false).map(item => <span key={item.id}>{item.label}</span>)}<b>BAG (0)</b></div><div className="admin-menu-preview__mobile"><Smartphone size={14} /><strong>90+</strong><span>{normalizeMenuLocation(selected.location) === 'FIXED_FOOTER_MOBILE' ? 'Quick nav' : 'Menu'}</span></div></div></> : <div className="admin-empty"><MenuIcon size={24} /><strong>No menu selected</strong><span>Create a menu to configure navigation.</span></div>}</section></div><SaveNotice notice={notice} /></main>
}

export function AdminCollections({ collections, products, onSave }) {
  const [selectedId, setSelectedId] = useState(collections[0]?.id)
  const [draftCollections, setDraftCollections] = useState(collections)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    setDraftCollections(collections)
    if (!collections.some(c => c.id === selectedId)) setSelectedId(collections[0]?.id)
  }, [collections])
  const selected = draftCollections.find(collection => collection.id === selectedId) || draftCollections[0]
  const available = useMemo(() => products.filter(product => `${product.name} ${product.type}`.toLowerCase().includes(query.toLowerCase())), [products, query])
  const updateSelected = updater => { if (!selected) return; setDraftCollections(current => current.map(collection => collection.id === selected.id ? updater(collection) : collection)) }
  const toggleProduct = productId => updateSelected(collection => { const has = collection.products.includes(productId); const nextProducts = has ? collection.products.filter(id => id !== productId) : [...collection.products, productId]; return { ...collection, products: nextProducts, count: nextProducts.length } })
  const save = async () => { const result = await onSave?.(draftCollections); setNotice(result?.source === 'supabase' ? 'Collection saved to Supabase.' : result?.error ? `Not saved: ${result.error}` : 'Changes kept in this preview only; not published.'); window.setTimeout(() => setNotice(''), 2200) }
  return <main className="admin-page admin-collections-page"><BuilderIntro eyebrow="COMMERCE / COLLECTIONS" title={<>CURATE THE<br /><em>DROP.</em></>} copy="Organize products into stories, control merchandising order and keep collection pages ready for mobile." action="New collection" onAction={() => setDraftCollections(current => [...current, { id: `collection-${Date.now()}`, name: 'NEW COLLECTION', handle: 'new-collection', status: 'DRAFT', description: '', hero: '/assets/hero-tunnel.webp', products: [], count: 0, updatedAt: 'Not saved', sort: 'Manual' }])}/><div className="admin-collection-workspace"><aside className="admin-collection-list"><div className="admin-builder-panel-head"><span>{draftCollections.length} COLLECTIONS</span><button className="admin-text-button" disabled title="Collection sorting is not available yet."><ArrowDown size={13}/> Sort · Coming soon</button></div>{draftCollections.map(collection => <button key={collection.id} className={selected?.id === collection.id ? 'is-active' : ''} onClick={() => setSelectedId(collection.id)}><img src={collection.hero} alt=""/><span><strong>{collection.name}</strong><small>{collection.count} products · {collection.sort}</small></span><Status value={collection.status}/></button>)}</aside><section className="admin-collection-editor"><div className="admin-collection-editor__top"><div><p>COLLECTION / {selected?.handle}</p><h2>{selected?.name}</h2></div><div><button className="admin-button admin-button--outline" disabled={selected?.status !== 'PUBLISHED'} title={selected?.status === 'PUBLISHED' ? 'Open the live collection page.' : 'Publish this collection before previewing it.'} onClick={() => selected && window.open(`/collection/${selected.handle}`,'_blank','noopener,noreferrer')}><Eye size={14}/> Preview</button><button className="admin-button admin-button--dark" onClick={save}><Save size={14}/> Save changes</button></div></div><div className="admin-collection-form"><label className="admin-builder-field"><span>Collection name</span><input value={selected?.name || ''} onChange={event => updateSelected(collection => ({ ...collection, name: event.target.value }))}/></label><label className="admin-builder-field"><span>Handle</span><input value={selected?.handle || ''} onChange={event => updateSelected(collection => ({ ...collection, handle: event.target.value.toLowerCase().replace(/\s+/g, '-') }))}/></label><label className="admin-builder-field admin-builder-field--wide"><span>Description</span><textarea value={selected?.description || ''} onChange={event => updateSelected(collection => ({ ...collection, description: event.target.value }))}/></label><label className="admin-builder-field"><span>Status</span><select value={selected?.status || 'DRAFT'} onChange={event => updateSelected(collection => ({ ...collection, status: event.target.value }))}><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select></label><label className="admin-builder-field"><span>Sort products by</span><select value={selected?.sort || 'Manual'} onChange={event => updateSelected(collection => ({ ...collection, sort: event.target.value }))}><option>Manual</option><option>Featured first</option><option>Newest</option><option>Best selling</option><option>Low stock</option></select></label></div><div className="admin-collection-hero"><img src={selected?.hero} alt="Collection hero"/><div><span>COLLECTION HERO</span><strong>{selected?.count || 0} products</strong><label className="admin-text-button"><Image size={13}/> Image URL<input value={selected?.hero || ''} onChange={event => updateSelected(collection => ({...collection,hero:event.target.value}))}/></label></div></div><div className="admin-collection-products"><div className="admin-menu-items-head"><span>PRODUCT ASSIGNMENT</span><span>{selected?.count || 0} selected</span></div><label className="admin-search admin-search--large"><span><SlidersHorizontal size={15}/></span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search products to add"/></label><div className="admin-assignment-list">{available.map(product => { const checked = selected?.products.includes(product.id); return <button key={product.id} className={checked ? 'is-selected' : ''} onClick={() => toggleProduct(product.id)}><span className="admin-assignment-check">{checked && <Check size={13}/>}</span><img src={product.image} alt=""/><span><strong>{product.name}</strong><small>{product.type} · {product.sku}</small></span><b>{product.price ? `$${product.price}` : '—'}</b></button> })}</div></div></section></div><SaveNotice notice={notice}/></main>
}

export function ProductVariations(props) { return <VariantMatrix {...props}/> }
