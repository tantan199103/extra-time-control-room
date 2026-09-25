import VariantMatrix from './VariantMatrix'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Image,
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  Link2,
  Lock,
  Menu as MenuIcon,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Save,
  Search,
  Sparkles,
  Smartphone,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  Undo2,
  Redo2,
  Monitor,
  X
} from 'lucide-react'
import { adminProductOptions, themeBlocks } from './admin-builder-data'
import { menuImageProblem, menuTargetProblem, normalizeMenuLocation } from './lib/storefront-model'
import { addToCollection, applyCollectionMembership, changeCollectionMembership } from './lib/collection-assignment'
import { DEFAULT_COLLECTION_AUTOMATION, collectionAutomationHasConditions, normalizeCollectionAutomation, parseCollectionKeywords } from './lib/collection-rules'
import { ACCESSORY_FAMILY_OPTIONS, ACCESSORY_TYPE_OPTIONS, CATALOG_CATEGORY_OPTIONS, accessoryTaxonomyForProduct, catalogCategoryByHandle, productMatchesCatalogCategory } from './lib/catalog-taxonomy'
import { buildCollectionTree, collectionDescendantIds } from './lib/collection-tree'
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

function MenuItemEditor({ item, depth, collections = [], onUpdate, onMove, onDelete, onAddChild }) {
  const targetProblem = menuTargetProblem(item.target, item.type)
  const imageProblem = menuImageProblem(item)
  const hasError = (item.visible !== false && targetProblem) || imageProblem
  return <div className={`admin-menu-item admin-menu-item--depth-${Math.min(depth, 3)} ${hasError ? 'has-error' : ''}`}>
    <div className="admin-menu-item__main">
      <GripVertical size={15} className="admin-menu-drag" aria-hidden="true" />
      <div className="admin-menu-item__fields">
        <input value={item.label || ''} onChange={event => onUpdate(item.id, 'label', event.target.value)} aria-label="Menu label" placeholder="Link label" />
        <div className="admin-menu-item__link-row"><select value={String(item.type || 'PAGE').toUpperCase()} onChange={event => onUpdate(item.id, 'type', event.target.value)} aria-label="Link type"><option value="PAGE">Page</option><option value="COLLECTION">Collection</option><option value="PRODUCT">Product</option><option value="ACTION">Action</option><option value="EXTERNAL">External</option></select>{String(item.type || '').toUpperCase() === 'COLLECTION' ? <select value={item.target || ''} onChange={event => onUpdate(item.id, 'target', event.target.value)} aria-label="Menu collection"><option value="">Choose collection</option>{collections.map(collection => <option key={collection.id} value={`/collection/${collection.handle || collection.id}`}>{collection.name}</option>)}</select> : <input value={item.target || ''} onChange={event => onUpdate(item.id, 'target', event.target.value)} aria-label="Menu link" placeholder="/destination" />}</div>
        <div className="admin-menu-item__media-row"><label><span>Thumbnail</span><select value={item.imageMode || 'AUTO'} onChange={event => onUpdate(item.id, 'imageMode', event.target.value)}><option value="AUTO">Auto from linked page</option><option value="CUSTOM">Custom image</option><option value="NONE">No image</option></select></label>{item.imageMode === 'CUSTOM' && <label className="admin-menu-item__media-url"><span>Image URL</span><input value={item.imageUrl || ''} onChange={event => onUpdate(item.id, 'imageUrl', event.target.value)} placeholder="https://… or /assets/…" /></label>}<div className="admin-menu-item__thumb">{item.representativeImage ? <img src={item.representativeImage} alt={item.representativeAlt || ''} /> : <Image size={16} />}<small>{item.representativeSource || (item.imageMode === 'NONE' ? 'NONE' : 'MISSING')}</small></div></div>
        {item.imageMode !== 'NONE' && <label className="admin-menu-item__alt"><span>Thumbnail alt (optional)</span><input value={item.imageAlt || ''} onChange={event => onUpdate(item.id, 'imageAlt', event.target.value)} placeholder="Uses linked title when empty" /></label>}
        {targetProblem && item.visible !== false && <small className="admin-menu-item__error">{targetProblem}</small>}
        {imageProblem && <small className="admin-menu-item__error">{imageProblem}</small>}
      </div>
      <button className={`admin-visibility ${item.visible !== false ? 'is-on' : ''}`} onClick={() => onUpdate(item.id, 'visible', item.visible === false)}>{item.visible !== false ? 'Visible' : 'Hidden'}</button>
      <div className="admin-menu-item__actions"><button className="admin-block-icon" onClick={() => onMove(item.id, -1)} aria-label="Move link up"><ChevronUp size={13} /></button><button className="admin-block-icon" onClick={() => onMove(item.id, 1)} aria-label="Move link down"><ChevronDown size={13} /></button>{depth < 2 && <button className="admin-block-icon" onClick={() => onAddChild(item.id)} aria-label="Add child link"><Plus size={13} /></button>}<button className="admin-block-icon" onClick={() => onDelete(item.id)} aria-label="Delete link"><Trash2 size={13} /></button></div>
    </div>
    {item.children?.length > 0 && <div className="admin-menu-children">{item.children.map(child => <MenuItemEditor key={child.id} item={child} depth={depth + 1} collections={collections} onUpdate={onUpdate} onMove={onMove} onDelete={onDelete} onAddChild={onAddChild} />)}</div>}
  </div>
}

export function AdminMenus({ menus, collections = [], onSave }) {
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
  return <main className="admin-page admin-menus-page"><BuilderIntro eyebrow="STOREFRONT / NAVIGATION" title={<>MAKE IT<br /><em>FINDABLE.</em></>} copy="Build a nested menu, assign its storefront location and control whether every thumbnail follows the linked page automatically." action="Save navigation" onAction={save} /><div className="admin-menu-workspace"><aside className="admin-menu-list"><div className="admin-builder-panel-head"><span>{draftMenus.length} MENUS</span><button className="admin-text-button" onClick={addMenu}><Plus size={13} /> New menu</button></div>{draftMenus.map(menu => <button key={menu.id} className={menu.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(menu.id)}><MenuIcon size={15} /><span><strong>{menu.name}</strong><small>{normalizeMenuLocation(menu.location)} · {(menu.items || []).length} top links</small></span><Status value={menu.status} /></button>)}<div className="admin-menu-tip"><Link2 size={14} /><span><strong>Verified navigation</strong><small>Internal routes are checked before saving. Auto thumbnails follow the linked product, collection or page.</small></span></div></aside><section className="admin-menu-editor">{selected ? <><div className="admin-menu-editor__head"><div><p>MENU BUILDER / {normalizeMenuLocation(selected.location)}</p><h2>{selected.name}</h2></div><div><button className="admin-button admin-button--outline" onClick={preview}><Eye size={14} /> Preview storefront</button><button className="admin-button admin-button--dark" onClick={save}><Save size={14} /> Save</button></div></div><div className="admin-menu-location"><label className="admin-builder-field"><span>Menu name</span><input value={selected.name || ''} onChange={event => updateMenu(menu => ({ ...menu, name: event.target.value }))} /></label><label className="admin-builder-field"><span>Theme location</span><select value={normalizeMenuLocation(selected.location)} onChange={event => updateMenu(menu => ({ ...menu, location: event.target.value }))}><option value="HEADER">Header</option><option value="FOOTER">Footer</option><option value="FIXED_FOOTER_MOBILE">Fixed footer / mobile</option><option value="MOBILE_DRAWER">Mobile drawer</option></select></label><label className="admin-builder-field"><span>Publishing status</span><select value={selected.status || 'DRAFT'} onChange={event => updateMenu(menu => ({ ...menu, status: event.target.value }))}><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></label></div><div className="admin-menu-items-head"><span>LINKS / USE ARROWS TO REORDER / NESTED STRUCTURE / THUMBNAILS</span><button className="admin-text-button" onClick={addItem}><Plus size={13} /> Add top-level link</button></div><div className="admin-menu-items">{(selected.items || []).map(item => <MenuItemEditor key={item.id} item={item} depth={0} collections={collections} onUpdate={updateItem} onMove={moveItem} onDelete={deleteItem} onAddChild={addChild} />)}{!(selected.items || []).length && <div className="admin-empty"><MenuIcon size={24} /><strong>This menu is empty</strong><span>Add a top-level link to start building the tree.</span><button className="admin-text-button" onClick={addItem}>Add first link</button></div>}</div><div className="admin-menu-preview"><div className="admin-builder-panel-head"><span>STOREFRONT PREVIEW</span><button className="admin-text-button" onClick={preview}><Monitor size={13} /> Open live storefront</button></div><div className="admin-menu-preview__bar"><strong>90<sup>+</sup> EXTRA TIME</strong>{(selected.items || []).filter(item => item.visible !== false).map(item => <span key={item.id}>{item.label}</span>)}<b>BAG (0)</b></div><div className="admin-menu-preview__mobile"><Smartphone size={14} /><strong>90+</strong><span>{normalizeMenuLocation(selected.location) === 'FIXED_FOOTER_MOBILE' ? 'Quick nav' : 'Menu'}</span></div></div></> : <div className="admin-empty"><MenuIcon size={24} /><strong>No menu selected</strong><span>Create a menu to configure navigation.</span></div>}</section></div><SaveNotice notice={notice} /></main>
}

function CollectionTreeNode({ node, depth = 0, selectedId, expandedIds, onToggle, onSelect }) {
  const hasChildren = node.children?.length > 0
  const expanded = expandedIds.has(String(node.id))
  return <div className="admin-collection-tree__node">
    <div className={`admin-collection-tree__row ${selectedId === node.id ? 'is-active' : ''}`} style={{ '--tree-depth': depth }}>
      <button type="button" className="admin-collection-tree__toggle" onClick={() => hasChildren && onToggle(node.id)} disabled={!hasChildren} aria-label={hasChildren ? `${expanded ? 'Collapse' : 'Expand'} ${node.name}` : `${node.name} has no child collections`} aria-expanded={hasChildren ? expanded : undefined}>
        {hasChildren ? <ChevronDown size={13} className={expanded ? '' : 'is-collapsed'} /> : <span className="admin-collection-tree__leaf" />}
      </button>
      <button type="button" className="admin-collection-tree__select" onClick={() => onSelect(node.id)}>
        <span className={`admin-collection-list__image ${node.hero ? '' : 'is-missing'}`}>{node.hero ? <img src={node.hero} alt="" /> : <><Image size={16}/><i>NO COVER</i></>}</span>
        <span><strong>{node.name}</strong><small>{node.count ?? 0} assigned · {node.publishedCount ?? node.count ?? 0} live · {node.sort || 'Manual'}</small></span>
        <Status value={node.status}/>
      </button>
    </div>
    {hasChildren && expanded && <div className="admin-collection-tree__children">{node.children.map(child => <CollectionTreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} expandedIds={expandedIds} onToggle={onToggle} onSelect={onSelect} />)}</div>}
  </div>
}

export function AdminCollections({
  collections, products, onSave, onDelete, loadCatalog, onPreviewAutomation, onApplyAutomation, onUploadImage, canEdit = true
}) {
  const [selectedId, setSelectedId] = useState(collections[0]?.id)
  const [draftCollections, setDraftCollections] = useState(collections)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogStatus, setCatalogStatus] = useState('ALL')
  const [catalogGroup, setCatalogGroup] = useState('ALL')
  const [catalogType, setCatalogType] = useState('ALL')
  const [catalogCategory, setCatalogCategory] = useState('ALL')
  const [catalogAccessoryFamily, setCatalogAccessoryFamily] = useState('ALL')
  const [catalogAccessoryType, setCatalogAccessoryType] = useState('ALL')
  const [catalogState, setCatalogState] = useState({ rows:[], total:0, loading:true, error:'' })
  const [notice, setNotice] = useState('')
  const [dirtyIds, setDirtyIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [rulesBusy, setRulesBusy] = useState('')
  const [rulePreview, setRulePreview] = useState(null)
  const [includeText, setIncludeText] = useState(() => normalizeCollectionAutomation(collections[0]?.automation).includeKeywords.join(', '))
  const [excludeText, setExcludeText] = useState(() => normalizeCollectionAutomation(collections[0]?.automation).excludeKeywords.join(', '))
  const [expandedCollectionIds, setExpandedCollectionIds] = useState(() => new Set())
  const fileInputRef = useRef(null)
  const catalogRequest = useRef(0)
  const pageSize = 50
  const selected = draftCollections.find(collection => collection.id === selectedId) || draftCollections[0]
  const collectionTree = useMemo(() => buildCollectionTree(draftCollections), [draftCollections])
  const collectionDescendants = useMemo(() => selected ? collectionDescendantIds(draftCollections, selected.id) : new Set(), [draftCollections, selected?.id])
  const parentOptions = useMemo(() => draftCollections.filter(collection => collection.id !== selected?.id && !collectionDescendants.has(String(collection.id))).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))), [draftCollections, selected?.id, collectionDescendants])
  const automation = useMemo(() => normalizeCollectionAutomation(selected?.automation || DEFAULT_COLLECTION_AUTOMATION), [selected?.id, selected?.automation])
  const effectiveAutomation = useMemo(() => normalizeCollectionAutomation({ ...automation, includeKeywords:parseCollectionKeywords(includeText), excludeKeywords:parseCollectionKeywords(excludeText) }), [automation, includeText, excludeText])
  const fallbackProducts = loadCatalog ? null : products

  useEffect(() => {
    setDraftCollections(collections)
    setDirtyIds([])
    setExpandedCollectionIds(new Set(buildCollectionTree(collections).filter(node => node.children?.length).map(node => String(node.id))))
    if (!collections.some(collection => collection.id === selectedId)) setSelectedId(collections[0]?.id)
  }, [collections])

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedQuery(query); setCatalogPage(1) }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    setRulePreview(null)
    setIncludeText(automation.includeKeywords.join(', '))
    setExcludeText(automation.excludeKeywords.join(', '))
  }, [selectedId])

  useEffect(() => {
    const sequence = ++catalogRequest.current
    setCatalogState(current => ({ ...current, loading:true, error:'' }))
    const fallback = () => {
      const term = debouncedQuery.trim().toLowerCase()
      const matches = (fallbackProducts || []).filter(product => {
        if (catalogStatus !== 'ALL' && product.status !== catalogStatus) return false
        if (catalogGroup !== 'ALL' && product.productGroup !== catalogGroup) return false
        if (catalogType !== 'ALL' && product.type !== catalogType) return false
        if (catalogCategory !== 'ALL' || catalogAccessoryFamily !== 'ALL' || catalogAccessoryType !== 'ALL') {
          const category = catalogCategoryByHandle(catalogCategory) || { value:catalogCategory === 'ALL' ? '' : catalogCategory }
          const matches = productMatchesCatalogCategory(product, {
            ...category,
            value:catalogCategory === 'ALL' ? 'Accessories' : category.value,
            accessoryFamily:catalogAccessoryFamily === 'ALL' ? '' : catalogAccessoryFamily,
            accessoryType:catalogAccessoryType === 'ALL' ? '' : catalogAccessoryType
          })
          if (!matches) return false
        }
        return !term || `${product.name} ${product.handle} ${product.sku} ${product.type} ${product.productGroup}`.toLowerCase().includes(term)
      }).sort((a,b) => String(a.name).localeCompare(String(b.name)))
      const from = (catalogPage - 1) * pageSize
      return { data:fallbackRows(matches, from, pageSize), total:matches.length, error:null }
    }
    const task = loadCatalog
      ? loadCatalog({ page:catalogPage, pageSize, search:debouncedQuery, status:catalogStatus, productGroup:catalogGroup, productType:catalogType, category:catalogCategory, accessoryFamily:catalogAccessoryFamily, accessoryType:catalogAccessoryType })
      : Promise.resolve(fallback())
    Promise.resolve(task).then(result => {
      if (sequence !== catalogRequest.current) return
      if (result?.error) setCatalogState({ rows:[], total:0, loading:false, error:result.error })
      else setCatalogState({ rows:result?.data || [], total:Number(result?.total || 0), loading:false, error:'' })
    }).catch(error => {
      if (sequence === catalogRequest.current) setCatalogState({ rows:[], total:0, loading:false, error:error.message || 'Catalogue query failed.' })
    })
  }, [loadCatalog, fallbackProducts, debouncedQuery, catalogPage, catalogStatus, catalogGroup, catalogType, catalogCategory, catalogAccessoryFamily, catalogAccessoryType])

  const productGroups = useMemo(() => [...new Set([...(products || []).map(product => product.productGroup), ...catalogState.rows.map(product => product.productGroup), automation.productGroup].filter(Boolean))].sort(), [products, catalogState.rows, automation.productGroup])
  const productTypes = useMemo(() => [...new Set([...(products || []).map(product => product.type), ...catalogState.rows.map(product => product.type), automation.productType].filter(Boolean))].sort(), [products, catalogState.rows, automation.productType])
  const accessoryFamilies = ACCESSORY_FAMILY_OPTIONS
  const accessoryTypes = ACCESSORY_TYPE_OPTIONS.filter(option => catalogAccessoryFamily === 'ALL' || option.family === catalogAccessoryFamily)
  const totalPages = Math.max(1, Math.ceil(catalogState.total / pageSize))
  const rangeStart = catalogState.total ? (catalogPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(catalogState.total, (catalogPage - 1) * pageSize + catalogState.rows.length)
  const hasRuleConditions = collectionAutomationHasConditions(effectiveAutomation)

  const markDirty = ids => setDirtyIds(current => [...new Set([...current,...ids])])
  const updateSelected = updater => {
    if (!selected || !canEdit) return
    setDraftCollections(current => current.map(collection => collection.id === selected.id ? updater(collection) : collection))
    markDirty([selected.id])
  }
  const updateAutomation = patch => {
    updateSelected(collection => ({ ...collection, automation:normalizeCollectionAutomation({ ...automation, ...patch }) }))
    setRulePreview(null)
  }
  const updateKeywordText = (kind, value) => {
    if (kind === 'include') setIncludeText(value)
    else setExcludeText(value)
    if (selected) markDirty([selected.id])
    setRulePreview(null)
  }
  const commitKeywordText = kind => updateAutomation(kind === 'include'
    ? { includeKeywords:parseCollectionKeywords(includeText) }
    : { excludeKeywords:parseCollectionKeywords(excludeText) })
  const toggleProduct = productId => {
    if (!selected || !canEdit) return
    const result = (selected.products || []).includes(productId)
      ? changeCollectionMembership(draftCollections, productId, selected.id)
      : addToCollection(draftCollections, productId, selected.id)
    setDraftCollections(result.collections)
    markDirty(result.changedIds)
  }
  const moveProduct = (productId, destinationId) => {
    if (!selected || !destinationId || !canEdit) return
    const result = changeCollectionMembership(draftCollections, productId, selected.id, destinationId)
    setDraftCollections(result.collections)
    markDirty(result.changedIds)
  }
  const updateCurrentPage = action => {
    if (!selected || !catalogState.rows.length || !canEdit) return
    const result = applyCollectionMembership(draftCollections, catalogState.rows.map(product => product.id), action, selected.id)
    setDraftCollections(result.collections)
    markDirty(result.changedIds)
  }
  const save = async () => {
    if (!canEdit) { setNotice('Live collections are not ready. Refresh Admin and try again.'); return }
    const changed = draftCollections.filter(row => dirtyIds.includes(row.id)).map(row => row.id === selected?.id ? { ...row, automation:effectiveAutomation } : row)
    if (!changed.length) { setNotice('No collection changes to save.'); return }
    setSaving(true)
    try {
      const result = await onSave?.(changed)
      setNotice(result?.source === 'supabase' ? `${changed.length} collection${changed.length === 1 ? '' : 's'} saved.` : result?.error ? `Not saved: ${result.error}` : 'Changes kept in this preview only; not published.')
      if (result?.source === 'supabase') setDirtyIds([])
    } catch (error) { setNotice(`Not saved: ${error.message}`) }
    finally { setSaving(false) }
  }
  const uploadHero = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selected || !canEdit) return
    setUploading(true); setNotice('')
    try {
      const result = await onUploadImage?.(file, selected.id)
      if (!result?.image?.url) throw new Error('The upload did not return an image URL.')
      updateSelected(collection => ({ ...collection, hero:result.image.url }))
      setNotice('Collection image uploaded. Save changes to publish it.')
    } catch (error) { setNotice(`Not saved: ${error.message}`) }
    finally { setUploading(false) }
  }
  const previewRules = async () => {
    if (!selected || !hasRuleConditions) { setNotice('Not saved: add at least one automatic condition first.'); return }
    setRulesBusy('preview'); setNotice('')
    try {
      const result = await onPreviewAutomation?.(selected.id, effectiveAutomation, 40)
      if (result?.error || !result?.data) throw new Error(result?.error || 'No rule preview was returned.')
      setRulePreview(result.data)
      setNotice(`${result.data.matchCount || 0} listings match these rules; nothing changed yet.`)
    } catch (error) { setNotice(`Not saved: ${error.message}`) }
    finally { setRulesBusy('') }
  }
  const applyRules = async () => {
    if (!selected || !hasRuleConditions) { setNotice('Not saved: add at least one automatic condition first.'); return }
    setRulesBusy('apply'); setNotice('')
    try {
      const collection = { ...selected, automation:effectiveAutomation }
      const result = await onApplyAutomation?.(collection)
      if (result?.error || !result?.data) throw new Error(result?.error || 'Automatic assignment did not return a result.')
      setRulePreview(null)
      setNotice(`Rules applied: ${result.data.addedCount || 0} added from ${result.data.matchCount || 0} matches. Existing assignments were preserved.`)
    } catch (error) { setNotice(`Not saved: ${error.message}`) }
    finally { setRulesBusy('') }
  }
  const toggleCollection = id => setExpandedCollectionIds(current => {
    const next = new Set(current)
    const key = String(id)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const createCollection = (parentId = '') => {
    if (!canEdit) return
    const id = `collection-${Date.now()}`
    setDraftCollections(current => [...current, {
      id, name:parentId ? 'New child collection' : 'New collection', handle:id, parentId, status:'DRAFT', description:'', hero:'', products:[], count:0, publishedCount:0, _localOnly:true,
      updatedAt:'Not saved', sort:'Manual', automation:{ ...DEFAULT_COLLECTION_AUTOMATION }
    }])
    setSelectedId(id)
    if (parentId) setExpandedCollectionIds(current => new Set([...current, String(parentId)]))
    markDirty([id])
  }
  const deleteSelected = async () => {
    if (!selected || !canEdit || deleting) return
    const assigned = Number(selected.count || selected.products?.length || 0)
    const message = `Delete collection “${selected.name || selected.handle}”? ${assigned ? `${assigned} listing${assigned === 1 ? '' : 's'} will be detached, but the listings themselves will stay in the catalogue.` : 'No listings will be affected.'} This cannot be undone.`
    if (!window.confirm(message)) return
    setDeleting(true)
    setNotice('')
    try {
      const result = selected._localOnly ? { source:'local', error:null } : await onDelete?.(selected.id)
      if (result?.error) throw new Error(result.error)
      const remaining = draftCollections.filter(row => row.id !== selected.id)
      setDraftCollections(remaining)
      setDirtyIds(current => current.filter(id => id !== selected.id))
      setSelectedId(remaining[0]?.id)
      setNotice(selected._localOnly ? 'Unsaved collection removed.' : 'Collection deleted. Listings were kept safely.')
    } catch (error) {
      setNotice(`Not saved: ${error.message || 'Collection could not be deleted.'}`)
    } finally { setDeleting(false) }
  }

  const collectionStats = useMemo(() => ({
    total:draftCollections.length,
    roots:collectionTree.length,
    automated:draftCollections.filter(row => normalizeCollectionAutomation(row.automation).enabled).length,
    assigned:new Set(draftCollections.flatMap(row => row.products || [])).size
  }), [draftCollections, collectionTree])

  return <main className="admin-page admin-collections-page">
    <BuilderIntro eyebrow="COMMERCE / COLLECTIONS" title={<>CURATE THE<br /><em>DROP.</em></>} copy="Organize drops, departments and accessory families in a parent-child tree. Load and assign listings page by page." action="New collection" onAction={() => createCollection()}/>
    <section className="admin-collection-summary" aria-label="Collection overview">
      <div><strong>{collectionStats.total}</strong><span>Collections</span></div>
      <div><strong>{collectionStats.roots}</strong><span>Top level</span></div>
      <div><strong>{collectionStats.automated}</strong><span>Automatic rules</span></div>
      <div><strong>{collectionStats.assigned.toLocaleString()}</strong><span>Unique listings assigned</span></div>
    </section>
    <div className="admin-collection-workspace">
      <aside className="admin-collection-list">
        <div className="admin-builder-panel-head"><span>{draftCollections.length} COLLECTIONS</span><button className="admin-text-button" onClick={() => createCollection(selected?.id || '')} disabled={!canEdit || !selected} title={selected ? 'Create a child collection under the selected collection.' : 'Select a parent collection first.'}><Plus size={13}/> New child</button></div>
        <div className="admin-collection-tree" aria-label="Collection hierarchy">
          {collectionTree.length ? collectionTree.map(node => <CollectionTreeNode key={node.id} node={node} selectedId={selected?.id} expandedIds={expandedCollectionIds} onToggle={toggleCollection} onSelect={setSelectedId}/>) : <div className="admin-empty"><Layers3 size={22}/><strong>No collections yet</strong><span>Create a top-level collection to start the tree.</span></div>}
        </div>
        <div className="admin-collection-tree__hint"><Layers3 size={14}/><span><strong>Parent / child structure</strong><small>Use Parent collection in the editor to nest drops, leagues or Accessories families.</small></span></div>
      </aside>
      <section className="admin-collection-editor">
        {selected ? <>
          <div className="admin-collection-editor__top"><div><p>COLLECTION / {selected.handle}</p><h2>{selected.name}</h2></div><div>
            <button className="admin-button admin-button--outline" disabled={selected.status !== 'PUBLISHED'} title={selected.status === 'PUBLISHED' ? 'Open the live collection page.' : 'Publish this collection before previewing it.'} onClick={() => window.open(`/collection/${selected.handle}`,'_blank','noopener,noreferrer')}><Eye size={14}/> Preview</button>
            <button className="admin-button admin-button--danger" disabled={!canEdit || saving || deleting} onClick={deleteSelected} title="Delete this collection and detach its listings; listings are not deleted"><Trash2 size={14}/> {deleting ? 'Deleting…' : 'Delete collection'}</button>
            <button className="admin-button admin-button--dark" disabled={!canEdit || saving || !dirtyIds.length} onClick={save}><Save size={14}/> {saving ? 'Saving…' : `Save changes (${dirtyIds.length})`}</button>
          </div></div>

          <section className="admin-collection-section admin-collection-section--details">
            <div className="admin-collection-section__head"><div><span>COLLECTION DETAILS</span><h3>Set the storefront story.</h3></div><small>Name, cover, publishing and merchandising order.</small></div>
            <div className="admin-collection-form">
              <label className="admin-builder-field"><span>Collection name</span><input value={selected.name || ''} onChange={event => updateSelected(collection => ({ ...collection, name:event.target.value }))}/></label>
              <label className="admin-builder-field"><span>Handle</span><input value={selected.handle || ''} onChange={event => updateSelected(collection => ({ ...collection, handle:event.target.value.toLowerCase().replace(/\s+/g, '-') }))}/></label>
              <label className="admin-builder-field admin-builder-field--wide"><span>Description</span><textarea value={selected.description || ''} onChange={event => updateSelected(collection => ({ ...collection, description:event.target.value }))}/></label>
              <label className="admin-builder-field"><span>Status</span><select value={selected.status || 'DRAFT'} onChange={event => updateSelected(collection => ({ ...collection, status:event.target.value }))}><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select></label>
              <label className="admin-builder-field"><span>Sort products by</span><select value={selected.sort || 'Manual'} onChange={event => updateSelected(collection => ({ ...collection, sort:event.target.value }))}><option>Manual</option><option>Featured first</option><option>Newest</option><option>Best selling</option><option>Low stock</option></select></label>
              <label className="admin-builder-field"><span>Parent collection</span><select value={selected.parentId || ''} onChange={event => updateSelected(collection => ({ ...collection, parentId:event.target.value }))}><option value="">Top level</option>{parentOptions.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><small>Use this for department → family → drop nesting.</small></label>
            </div>
            <div className="admin-collection-hero">
              <div className="admin-collection-hero__preview">{selected.hero ? <img src={selected.hero} alt={`${selected.name} collection cover`}/> : <div><Image size={25}/><span>No cover image</span></div>}</div>
              <div className="admin-collection-hero__controls"><span>COLLECTION COVER</span><strong>{selected.count || 0} assigned · {selected.publishedCount ?? selected.count ?? 0} live</strong><p>JPG, PNG or WebP · up to 8 MB. Admin uploads are validated before storage.</p>
                <input ref={fileInputRef} className="admin-collection-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadHero}/>
                <div className="admin-collection-hero__actions"><button className="admin-button admin-button--outline" disabled={!canEdit || uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? <LoaderCircle className="is-spinning" size={14}/> : <Upload size={14}/>} {uploading ? 'Uploading…' : selected.hero ? 'Replace from computer' : 'Upload from computer'}</button>{selected.hero && <button className="admin-text-button" onClick={() => updateSelected(collection => ({ ...collection, hero:'' }))}>Remove</button>}</div>
                <label className="admin-builder-field admin-collection-hero__url"><span>Or use an image URL</span><input value={selected.hero || ''} onChange={event => updateSelected(collection => ({ ...collection, hero:event.target.value }))} placeholder="https://…"/></label>
              </div>
            </div>
          </section>

          <section className="admin-collection-section admin-collection-rules">
            <div className="admin-collection-section__head"><div><span>AUTOMATIC RULES</span><h3>Route the catalogue as it grows.</h3></div><label className="admin-collection-rule-toggle"><input type="checkbox" checked={automation.enabled} onChange={event => updateAutomation({ enabled:event.target.checked })}/><i/><span><strong>{automation.enabled ? 'Future routing on' : 'Future routing off'}</strong><small>When on, matching new or edited listings join automatically.</small></span></label></div>
            <div className="admin-collection-rule-grid">
              <label className="admin-builder-field admin-collection-rule-keywords"><span>Include keywords</span><textarea value={includeText} onChange={event => updateKeywordText('include',event.target.value)} onBlur={() => commitKeywordText('include')} placeholder="blue jays, fitted cap, mlb"/><small>Comma or new line. Match against the selected fields.</small></label>
              <label className="admin-builder-field admin-collection-rule-keywords"><span>Exclude keywords</span><textarea value={excludeText} onChange={event => updateKeywordText('exclude',event.target.value)} onBlur={() => commitKeywordText('exclude')} placeholder="kids, damaged, sample"/><small>Any excluded keyword blocks the match.</small></label>
              <label className="admin-builder-field"><span>Keyword match</span><select value={automation.keywordMode} onChange={event => updateAutomation({ keywordMode:event.target.value })}><option value="ANY">Any include keyword</option><option value="ALL">All include keywords</option></select></label>
              <label className="admin-builder-field"><span>Listing status</span><select value={automation.status} onChange={event => updateAutomation({ status:event.target.value })}><option value="ALL">Any status</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></label>
              <label className="admin-builder-field"><span>Product group</span><select value={automation.productGroup || ''} onChange={event => updateAutomation({ productGroup:event.target.value })}><option value="">Any group</option>{productGroups.map(group => <option key={group}>{group}</option>)}</select></label>
              <label className="admin-builder-field"><span>Product type</span><select value={automation.productType || ''} onChange={event => updateAutomation({ productType:event.target.value })}><option value="">Any type</option>{productTypes.map(type => <option key={type}>{type}</option>)}</select></label>
              <label className="admin-builder-field"><span>League (exact)</span><input value={automation.league} onChange={event => updateAutomation({ league:event.target.value })} placeholder="MLB"/></label>
              <label className="admin-builder-field"><span>Team (exact)</span><input value={automation.team} onChange={event => updateAutomation({ team:event.target.value })} placeholder="Toronto Blue Jays"/></label>
              <label className="admin-builder-field"><span>Customizable</span><select value={automation.customizable} onChange={event => updateAutomation({ customizable:event.target.value })}><option value="ANY">Any</option><option value="YES">Customizable only</option><option value="NO">Non-custom only</option></select></label>
            </div>
            <fieldset className="admin-collection-search-fields"><legend>Search keyword in</legend>{[
              ['title','Title'],['handle','Handle'],['sku','SKU'],['tags','Tags + taxonomy'],['description','Description']
            ].map(([field,label]) => <label key={field}><input type="checkbox" checked={automation.searchFields.includes(field)} onChange={event => updateAutomation({ searchFields:event.target.checked ? [...automation.searchFields,field] : automation.searchFields.filter(item => item !== field) })}/><span>{label}</span></label>)}</fieldset>
            <div className="admin-collection-rule-actions"><div><Sparkles size={15}/><span><strong>Additive by design</strong><small>Applying rules adds matches and never removes manual assignments.</small></span></div><button className="admin-button admin-button--outline" disabled={!canEdit || !hasRuleConditions || Boolean(rulesBusy)} onClick={previewRules}>{rulesBusy === 'preview' ? <LoaderCircle className="is-spinning" size={14}/> : <Eye size={14}/>} Preview matches</button><button className="admin-button admin-button--dark" disabled={!canEdit || !hasRuleConditions || Boolean(rulesBusy)} onClick={applyRules}>{rulesBusy === 'apply' ? <LoaderCircle className="is-spinning" size={14}/> : <Sparkles size={14}/>} Apply rules</button></div>
            {rulePreview && <div className="admin-collection-rule-preview"><div className="admin-collection-rule-meter"><span><strong>{rulePreview.matchCount || 0}</strong><small>matches</small></span><span><strong>{rulePreview.newCount || 0}</strong><small>new</small></span><span><strong>{rulePreview.assignedCount || 0}</strong><small>already assigned</small></span></div><div className="admin-collection-rule-sample">{(rulePreview.sample || []).slice(0,8).map(product => <div key={product.id}><span>{product.image ? <img src={product.image} alt=""/> : <Image size={14}/>}</span><p><strong>{product.title}</strong><small>{product.productGroup || 'Unassigned group'} · {product.sku || product.id}</small></p><b>{product.assigned ? 'IN COLLECTION' : 'NEW MATCH'}</b></div>)}</div></div>}
          </section>

          <section className="admin-collection-section admin-collection-products">
            <div className="admin-collection-section__head"><div><span>MANUAL PRODUCTS</span><h3>Every listing, page by page.</h3></div><small>{selected.count || 0} assigned · {catalogState.total.toLocaleString()} matching catalogue results</small></div>
            <div className="admin-collection-catalog-toolbar">
              <label className="admin-search admin-search--large"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, handle, SKU, type or group"/></label>
              <label className="admin-catalog-select"><span>Status</span><select value={catalogStatus} onChange={event => { setCatalogStatus(event.target.value); setCatalogPage(1) }}><option>ALL</option><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select></label>
              <label className="admin-catalog-select"><span>Group</span><select value={catalogGroup} onChange={event => { setCatalogGroup(event.target.value); setCatalogPage(1) }}><option>ALL</option>{productGroups.map(group => <option key={group}>{group}</option>)}</select></label>
              <label className="admin-catalog-select"><span>Type</span><select value={catalogType} onChange={event => { setCatalogType(event.target.value); setCatalogPage(1) }}><option>ALL</option>{productTypes.map(type => <option key={type}>{type}</option>)}</select></label>
              <label className="admin-catalog-select"><span>Department</span><select value={catalogCategory} onChange={event => { const value = event.target.value; setCatalogCategory(value); setCatalogAccessoryFamily(value === 'Accessories' ? catalogAccessoryFamily : 'ALL'); setCatalogAccessoryType(value === 'Accessories' ? catalogAccessoryType : 'ALL'); setCatalogPage(1) }}><option value="ALL">All departments</option>{CATALOG_CATEGORY_OPTIONS.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
              <label className="admin-catalog-select"><span>Accessory family</span><select value={catalogAccessoryFamily} disabled={catalogCategory !== 'ALL' && catalogCategory !== 'Accessories'} onChange={event => { setCatalogAccessoryFamily(event.target.value); setCatalogAccessoryType('ALL'); setCatalogCategory(event.target.value === 'ALL' && catalogCategory === 'Accessories' ? 'Accessories' : catalogCategory); setCatalogPage(1) }}><option value="ALL">All families</option>{accessoryFamilies.map(family => <option key={family.value} value={family.value}>{family.label}</option>)}</select></label>
              <label className="admin-catalog-select"><span>Accessory type</span><select value={catalogAccessoryType} disabled={catalogAccessoryFamily === 'ALL'} onChange={event => { setCatalogAccessoryType(event.target.value); setCatalogCategory('Accessories'); setCatalogPage(1) }}><option value="ALL">All types</option>{accessoryTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            </div>
            <div className="admin-collection-page-actions"><span>{catalogState.loading ? 'Loading live catalogue…' : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${catalogState.total.toLocaleString()}`}</span><div><button className="admin-text-button" disabled={!canEdit || !catalogState.rows.length || saving} onClick={() => updateCurrentPage('ADD_TO_COLLECTION')}><Check size={13}/> Add this page</button><button className="admin-text-button" disabled={!canEdit || !catalogState.rows.length || saving} onClick={() => updateCurrentPage('REMOVE_FROM_COLLECTION')}><X size={13}/> Remove this page</button></div></div>
            {catalogState.error && <div className="admin-banner-notice" role="alert">Catalogue query failed: {catalogState.error}</div>}
            <div className={`admin-assignment-list ${catalogState.loading ? 'is-loading' : ''}`}>
              {catalogState.loading ? <div className="admin-collection-loading"><LoaderCircle className="is-spinning" size={20}/><span>Loading page {catalogPage}…</span></div> : catalogState.rows.length ? catalogState.rows.map(product => {
                const checked = (selected.products || []).includes(product.id)
                const accessory = accessoryTaxonomyForProduct(product)
                const descriptor = accessory.isAccessory ? `${accessory.family} · ${accessory.type || 'Accessories'}` : (product.productGroup || product.type || 'Uncategorized')
                return <div key={product.id} className={`admin-assignment-row ${checked ? 'is-selected' : ''}`}><button type="button" disabled={!canEdit || saving} onClick={() => toggleProduct(product.id)} aria-label={checked ? `Remove ${product.name} from ${selected.name}` : `Add ${product.name} to ${selected.name}`}><span className="admin-assignment-check">{checked && <Check size={13}/>}</span>{product.image ? <img src={product.image} alt=""/> : <span className="admin-assignment-image"><Image size={14}/></span>}<span><strong>{product.name}</strong><small>{descriptor} · {product.sku || product.id} · {product.status}</small></span><b>{checked ? 'Remove' : 'Add'}</b></button>{checked && <select aria-label={`Move ${product.name} to another collection`} value="" disabled={!canEdit || saving} onChange={event => moveProduct(product.id,event.target.value)}><option value="">Move to…</option>{draftCollections.filter(row => row.id !== selected.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}</div>
              }) : <div className="admin-empty"><SlidersHorizontal size={22}/><strong>No listings found</strong><span>Clear a filter or search with a broader title, SKU, type or group.</span></div>}
            </div>
            <nav className="admin-collection-pagination" aria-label="Collection product catalogue pages"><button type="button" onClick={() => setCatalogPage(page => Math.max(1,page - 1))} disabled={catalogPage <= 1 || catalogState.loading}><ChevronLeft size={14}/> Previous</button><span>Page {catalogPage.toLocaleString()} of {totalPages.toLocaleString()}</span><button type="button" onClick={() => setCatalogPage(page => Math.min(totalPages,page + 1))} disabled={catalogPage >= totalPages || catalogState.loading}>Next <ChevronRight size={14}/></button></nav>
          </section>
        </> : <div className="admin-empty"><Image size={24}/><strong>No collection selected</strong><span>Create a collection to begin.</span></div>}
      </section>
    </div>
    <SaveNotice notice={notice}/>
  </main>
}

function fallbackRows(rows, from, pageSize) {
  return rows.slice(from, from + pageSize)
}

export function ProductVariations(props) { return <VariantMatrix {...props}/> }
