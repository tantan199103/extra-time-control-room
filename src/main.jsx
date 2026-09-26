import React, { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Download,
  Grid2X2,
  Heart,
  House,
  Lock,
  Menu,
  Minus,
  Plus,
  Ruler,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Square,
  SlidersHorizontal,
  ShieldCheck,
  Shirt,
  Star,
  Tag,
  PackageCheck,
  CircleHelp,
  Globe2,
  Ticket,
  Trophy,
  Truck,
  UsersRound,
  X
} from 'lucide-react'
import { products as fallbackProducts, storyPoints } from './data'
import { availableOptionValue, buildFallbackCatalog, cartLineKey, findStorefrontProduct, initialSelections, isHeadwearProduct, isSellableVariant, menuAtLocation, optionNameLike, reconcileCart, resolveMenuImages, resolveVariant, sellableVariants, sortCollectionProducts } from './lib/storefront-model'
import { LEAGUE_TAXONOMY, findLeague, findTeam, leaguePath, normalizeTeamSlug, productMatchesTaxonomy, productTaxonomyValues, teamPath } from './lib/league-taxonomy'
import { SHOP_COVER, leagueCover } from './lib/league-covers'
import { ACCESSORY_CATEGORY_PAGES, ALL_CATALOG_CATEGORY_PAGES, CATALOG_CATEGORY_PAGES, catalogCategoryByHandle, catalogIconForProduct, productMatchesCatalogCategory } from './lib/catalog-taxonomy'
import { discoveryIndex, discoveryMenu, matchesDiscoveryQuery, normalizeDiscoveryQuery, productSearchText } from './lib/discovery-navigation'
import { taxonomyHubCounts } from './lib/taxonomy-hub'
import CategoryIcon from './CategoryIcon'
import { CATALOG_PAGE_SIZE, catalogPagePath, pageCount, parseCatalogPagePath } from './lib/catalog-pagination'
import { routeIndexability } from './lib/route-indexability'
import { productMatchesTeamProductType, teamProductTypeCounts, teamProductTypeByHandle, teamProductTypePath } from './lib/team-product-pages'
import { resolveCollectionArtwork } from './lib/collection-artwork'
import { listingMediaRole } from './lib/listing-media'
import { createAiLogoPreview, createCustomizationOrder, createExactLogoPreview, customerAuthSnapshot, fetchStorefrontCatalogPage, fetchStorefrontCollectionPage, fetchStorefrontCollections, fetchStorefrontMenus, fetchStorefrontNavigationIndex, fetchStorefrontSearch, fetchStorefrontTheme, getCustomerSessionId, requestCartValidation, requestMemberQuote, supabase, uploadCustomerReference } from './lib/supabase'
import { useDialogFocus } from './useDialogFocus'
import { fetchStorefrontProduct } from './lib/supabase'
import { productPreviewReadiness } from './lib/customization-ai'
import { seoDescription } from './lib/seo-text'
import { productSeoMetadata, productStructuredData, relatedProducts, usd } from './lib/product-seo'
import { TRUST_PAGES } from './lib/trust-pages'
import { apiFetch } from './lib/api-client'
import { availableFinderSizes, canonicalSize, findAudienceOption, recommendCatalogSize, sizeFinderAudiences, sizeProfile, sortSizes } from './lib/size-guide'
import { buildDeliveryEstimate } from './lib/product-commerce'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, normalizeQuantityDiscountPolicy, quantityDiscountForQty, quantityDiscountLabel } from './lib/quantity-pricing'
import { adminTheme } from './admin-builder-data'
import { initMetaPixel, trackPageView, trackViewContent, trackAddToCart, trackCustomizeProduct, trackInitiateCheckout, trackSearch } from './lib/meta-pixel'
import { renderGoogleRatingBadge } from './lib/google-reviews'
import './styles.css'
import './shop-visual.css'
import './taxonomy-hubs.css'
import './custom-hub.css'

const AdminApp = lazy(() => import('./admin'))
const AiStudio = lazy(() => import('./AiStudio'))
const MembershipPage = lazy(() => import('./MembershipPage'))
const CheckoutPage = lazy(() => import('./CheckoutPage'))
const OrderTrackingPage = lazy(() => import('./OrderTrackingPage'))
const HomeJerseyPersonalizer = lazy(() => import('./HomeJerseyPersonalizer'))

const money = usd
const initialCatalog = buildFallbackCatalog(fallbackProducts)
function readProductBootstrap() {
  try {
    const data = JSON.parse(document.getElementById('jersevo-route-data')?.textContent || 'null')
    if (data?.version !== 1 || data.product?.status !== 'PUBLISHED') return null
    if (window.location.pathname !== `/product/${encodeURIComponent(data.product.handle)}`) return null
    return data
  } catch { return null }
}
const productBootstrap = readProductBootstrap()
function readFeaturedCustomProduct() {
  try {
    const product = JSON.parse(document.getElementById('jersevo-custom-product')?.textContent || 'null')
    return /^[a-z0-9-]+$/i.test(product?.handle || '') ? product : null
  } catch { return null }
}
const featuredCustomProduct = readFeaturedCustomProduct()
const BUSINESS_DETAILS = Object.freeze({
  legalName:'Jersevo',
  brand:'Extra Time',
  email:'support@jersevo.com',
  location:'Texas, United States'
})

function readSession(key, fallback = null) {
  try { return JSON.parse(window.sessionStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}

function readLocal(key, fallback = null) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function Mark({ inverted = false }) {
  return (
    <button className={`mark ${inverted ? 'mark--inverted' : ''}`} onClick={() => navigate('/') } aria-label="Extra Time home">
      <span className="mark__minute">90</span><span className="mark__plus">+</span>
      <span className="mark__name">EXTRA<br />TIME</span>
    </button>
  )
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (window.location.hash) {
    requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
  } else window.scrollTo({ top: 0, behavior: 'instant' })
}

function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`} aria-label={label} {...props}>{children}</button>
}

function Announcement() {
  return (
    <div className="announcement">
      <span>THE 90+ DROP IS LIVE</span>
      <span className="announcement__center">FREE SHIPPING OVER $100</span>
      <span>WORLDWIDE DELIVERY</span>
    </div>
  )
}

function customProductTarget(product) {
  const handle = product?.handle || product?.id
  return handle ? `/product/${encodeURIComponent(handle)}?custom=1` : '/shop'
}

function menuTarget(target, customProduct) {
  if (target === '/collection') return '/shop'
  if (/^\/collection\?type=jerseys$/i.test(String(target || ''))) return '/shop'
  if (target === '/custom') return '/custom'
  if (target === '/moments') return '/#story'
  if (target === '/players') return '/#players'
  return target || '/'
}

function Header({ bagCount, openCart, openSearch, openInstall, appInstalled, menus = [], collections = [], customProduct, account, products = [] }) {
  const [mega, setMega] = useState(null)
  const [mobile, setMobile] = useState(false)
  const [mobileSection,setMobileSection] = useState('')
  const mobileRef = useRef(null)
  useDialogFocus(mobile, mobileRef, () => setMobile(false))
  useEffect(() => {
    const closeMenus = () => { setMobile(false); setMega(null) }
    window.addEventListener('popstate', closeMenus)
    return () => window.removeEventListener('popstate', closeMenus)
  }, [])
  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', mobile)
    return () => document.body.classList.remove('mobile-menu-open')
  }, [mobile])
  const index = useMemo(() => discoveryIndex(products), [products])
  const links = useMemo(() => discoveryMenu(index,collections,products), [index,collections,products])
  const openLink = item => {
    const target = item.href || menuTarget(item.target,customProduct)
    if (String(item.type || '').toUpperCase() === 'EXTERNAL') window.open(target,'_blank','noopener,noreferrer')
    else navigate(target)
    setMega(null)
    setMobile(false)
    setMobileSection('')
  }

  return (
    <>
      <Announcement />
      <header className="site-header" onMouseLeave={() => setMega(null)} onKeyDown={event => { if (event.key === 'Escape') setMega(null) }}>
        <Mark />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map(item => <div className="desktop-nav__item" key={item.id || item.label} onMouseEnter={() => setMega(item)}>
            <a href={item.href} onFocus={() => setMega(item)} onClick={event => { event.preventDefault(); openLink(item) }}>{item.label}</a>
            <button type="button" aria-label={`Open ${item.label} menu`} aria-expanded={mega?.id === item.id} onFocus={() => setMega(item)} onClick={() => setMega(mega?.id === item.id ? null : item)}><ChevronDown size={13}/></button>
          </div>)}
        </nav>
        <div className="header-actions">
          <button className="text-action" onClick={openSearch}><Search size={16} /> <span>SEARCH</span></button>
          <button className="text-action desktop-account" onClick={() => navigate('/membership#account')}><CircleUserRound size={16} /> <span>{account?.user ? 'ACCOUNT' : 'SIGN IN'}</span></button>
          {!appInstalled && <button className="text-action header-install" onClick={openInstall} aria-label="Add Extra Time to your home screen"><Download size={16}/><span>APP</span></button>}
          <button className="text-action header-bag" onClick={openCart}><ShoppingBag size={16} /> <span>BAG ({bagCount})</span></button>
          <IconButton label="Open menu" className="mobile-menu-button" onClick={() => setMobile(true)}><Menu /></IconButton>
        </div>
        {mega && <MegaMenu item={mega} customProduct={customProduct} onNavigate={openLink} onSearch={() => { setMega(null); openSearch() }} />}
      </header>
      <div ref={mobileRef} className={`mobile-menu ${mobile ? 'is-open' : ''}`} aria-hidden={!mobile} inert={!mobile} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}>
        <div className="mobile-menu__top"><Mark inverted /><IconButton label="Close menu" onClick={() => setMobile(false)}><X /></IconButton></div>
        <nav>
          {links.map(item => <div key={item.id} className="mobile-discovery-group"><button type="button" aria-expanded={mobileSection === item.id} onClick={() => setMobileSection(current => current === item.id ? '' : item.id)}><strong>{item.label}</strong><ChevronDown size={16}/></button>{mobileSection === item.id && <div className="mobile-discovery-group__links"><a href={item.href} onClick={event => { event.preventDefault(); openLink(item) }}>Explore {item.label}</a>{item.searchTeams && <button type="button" onClick={() => { setMobile(false); openSearch() }}>Search teams and products</button>}{item.sections.flatMap(section => section.links).slice(0,14).map(link => <a key={`${link.href}-${link.label}`} href={link.href} onClick={event => { event.preventDefault(); openLink(link) }}>{link.icon && <span className="mobile-menu__category-icon"><CategoryIcon kind={link.icon} size={15}/></span>}{link.coverPending && <span className="mobile-menu__collection-placeholder" aria-hidden="true"><CategoryIcon kind="all" size={14}/></span>}{link.label}</a>)}</div>}</div>)}
        </nav>
        <div className="mobile-menu__foot"><button onClick={() => { setMobile(false); openSearch() }}>Search teams and gear</button><span>USD / EN</span></div>
      </div>
    </>
  )
}

function MegaMenu({ item, customProduct, onNavigate, onSearch }) {
  const sections = item.sections || []
  return (
    <div className="mega-menu mega-menu--discovery">
      <div className="mega-menu__index"><strong>{item.label}</strong><span>90+</span><p>{item.id === 'shop' ? 'What are you shopping for?' : item.id === 'teams' ? 'Find your team.' : item.id === 'custom' ? 'Make it yours.' : 'Choose your route.'}</p></div>
      {sections.map(section => <div className="mega-menu__discovery-section" key={section.label}><p>{section.label}</p>{section.links.slice(0,10).map(link => <a key={`${link.href}-${link.label}`} href={link.href} onClick={event => { event.preventDefault(); onNavigate(link) }}>{link.icon ? <span className="mega-menu__category-icon"><CategoryIcon kind={link.icon} size={16}/></span> : link.image ? <img src={link.image} alt="" loading="lazy"/> : link.coverPending ? <span className="mega-menu__collection-placeholder" aria-hidden="true"><CategoryIcon kind="all" size={16}/></span> : link.monogram ? <span className="mega-menu__team-monogram" aria-hidden="true">{link.monogram}</span> : <span aria-hidden="true"/>}<span><strong>{link.label}</strong>{link.detail && <small>{link.detail}</small>}{link.coverPending && <small className="mega-menu__cover-note">Cover pending</small>}</span><ArrowRight size={14}/></a>)}</div>)}
      {item.searchTeams && <button className="mega-menu__search-action" type="button" onClick={onSearch}><Search size={15}/> Search teams and products</button>}
    </div>
  )
}

function SearchOverlay({ open, onClose, products, navigationProducts = [], collections = [] }) {
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose, inputRef)
  useEffect(() => {
    if (query.trim().length >= 2) {
      const timer = setTimeout(() => trackSearch(query.trim()), 600)
      return () => clearTimeout(timer)
    }
  }, [query])
  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) { setRemoteResults([]); return undefined }
    setRemoteResults([])
    let active = true
    const timer = setTimeout(() => {
      fetchStorefrontSearch(value,12).then(result => { if (active && result.source === 'supabase') setRemoteResults(result.data || []) }).catch(() => {})
    },250)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  const index = useMemo(() => discoveryIndex(navigationProducts.length ? navigationProducts : products), [navigationProducts,products])
  const needle = normalizeDiscoveryQuery(query)
  const matches = value => normalizeDiscoveryQuery(value).includes(needle)
  const matchingProducts = needle.length >= 2 ? products.filter(product => matchesDiscoveryQuery(product,query)).slice(0,8) : []
  const displayProducts = remoteResults.length ? remoteResults.slice(0,8) : matchingProducts
  const teamMatches = needle.length >= 2 ? index.teams.filter(team => matches(`${team.name} ${team.leagueName} ${team.slug}`)).slice(0,5) : []
  const leagueMatches = needle.length >= 2 ? index.leagues.filter(league => matches(`${league.name} ${league.key} ${league.sport}`)).slice(0,4) : []
  const categoryMatches = needle.length >= 2 ? index.categories.filter(category => matches(`${category.label} ${category.handle} ${category.description}`)).slice(0,4) : []
  const collectionMatches = needle.length >= 2 ? collections.filter(item => matches(`${item.name || ''} ${item.handle || ''} ${item.description || ''}`)).slice(0,3) : []
  const resultItems = [
    ...teamMatches.map(item => ({ kind:'team', key:item.href, href:item.href })),
    ...leagueMatches.map(item => ({ kind:'league', key:item.key, href:leaguePath(item) })),
    ...categoryMatches.map(item => ({ kind:'category', key:item.handle, href:`/category/${item.handle}` })),
    ...collectionMatches.map(item => ({ kind:'collection', key:item.handle, href:`/collection/${item.handle}` })),
    ...displayProducts.map(item => ({ kind:'product', key:item.id, href:`/product/${item.handle || item.id}` }))
  ]
  const openResult = item => { onClose(); navigate(item.href) }
  const submitQuery = () => {
    const selected = activeIndex >= 0 ? resultItems[activeIndex] : null
    if (selected) return openResult(selected)
    if (needle.length >= 2) { onClose(); navigate(`/shop?search=${encodeURIComponent(query.trim())}`) }
  }
  const handleInputKeyDown = event => {
    if (event.key === 'ArrowDown' && resultItems.length) { event.preventDefault(); setActiveIndex(index => (index + 1) % resultItems.length) }
    else if (event.key === 'ArrowUp' && resultItems.length) { event.preventDefault(); setActiveIndex(index => (index - 1 + resultItems.length) % resultItems.length) }
    else if (event.key === 'Enter') { event.preventDefault(); submitQuery() }
  }
  const renderResultButton = (item, result, indexOffset) => {
    const indexValue = indexOffset
    const active = activeIndex === indexValue
    return <button key={item.key} className={active ? 'is-keyboard-active' : ''} data-search-index={indexValue} onMouseEnter={() => setActiveIndex(indexValue)} onClick={() => openResult(result)}>
      {item.media?.src && !item.media.fallback ? <img src={item.media.src} alt="" loading="lazy"/> : <span className="search-result__type" aria-hidden="true">{result.kind === 'product' ? 'GEAR' : result.kind === 'team' ? 'TEAM' : result.kind === 'league' ? 'LEAGUE' : 'SHOP'}</span>}
      <span><strong>{item.name || item.title || item.label}</strong><small>{item.leagueName || item.sport || item.description || item.productGroup || item.meta || ''}</small></span><ArrowRight size={14}/>
    </button>
  }
  return (
    <div ref={panelRef} className={`overlay search-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open} role="dialog" aria-modal="true" aria-label="Search products" tabIndex={-1}>
      <div className="search-overlay__top">
        <Mark />
        <IconButton label="Close search" onClick={onClose}><X /></IconButton>
      </div>
      <div className="search-input-wrap">
        <Search />
        <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(-1) }} onKeyDown={handleInputKeyDown} placeholder="Search teams, players, jerseys…" aria-label="Search teams, players, jerseys" autoComplete="off" />
        {query && <IconButton label="Clear search" onClick={() => setQuery('')}><X size={18} /></IconButton>}
      </div>
      {!query ? (
        <div className="search-groups">
          <div><p>START WITH</p>{['NFL teams','NBA jerseys','MLB caps','Custom jerseys'].map(item => <button key={item} onClick={() => setQuery(item)}>{item}<ArrowRight size={16}/></button>)}</div>
          <div><p>SHOP BY NEED</p>{['Jerseys','Caps','Fan apparel','Accessories'].map(item => <button key={item} onClick={() => setQuery(item)}>{item}<ArrowRight size={16}/></button>)}</div>
          <div className="search-groups__hint"><p>SEARCH TIP</p><span>Try a team, player, league or product type.</span></div>
        </div>
      ) : (
        <div className="search-results">
          {teamMatches.length > 0 && <div className="search-results__group"><p>TEAMS</p>{teamMatches.map((item,index) => renderResultButton(item,{kind:'team',...item},index))}</div>}
          {leagueMatches.length > 0 && <div className="search-results__group"><p>LEAGUES</p>{leagueMatches.map((item,index) => renderResultButton(item,{kind:'league',...item},teamMatches.length + index))}</div>}
          {categoryMatches.length > 0 && <div className="search-results__group"><p>PRODUCT TYPES</p>{categoryMatches.map((item,index) => renderResultButton(item,{kind:'category',...item},teamMatches.length + leagueMatches.length + index))}</div>}
          {collectionMatches.length > 0 && <div className="search-results__group"><p>COLLECTIONS</p>{collectionMatches.map((item,index) => renderResultButton(item,{kind:'collection',...item},teamMatches.length + leagueMatches.length + categoryMatches.length + index))}</div>}
          {displayProducts.length > 0 && <div className="search-results__group"><p>PRODUCTS</p>{displayProducts.map((item,index) => <button key={item.id} className={activeIndex === teamMatches.length + leagueMatches.length + categoryMatches.length + collectionMatches.length + index ? 'is-keyboard-active' : ''} onMouseEnter={() => setActiveIndex(teamMatches.length + leagueMatches.length + categoryMatches.length + collectionMatches.length + index)} onClick={() => openResult({ href:`/product/${item.handle || item.id}` })}><img src={item.image} alt="" loading="lazy"/><span><strong>{item.name || item.title}</strong><small>{item.meta || productSearchText(item).split(' ').slice(0,5).join(' ')}</small></span><span>{money(item.price)}</span></button>)}</div>}
          {!displayProducts.length && !teamMatches.length && !leagueMatches.length && !categoryMatches.length && !collectionMatches.length && <div className="empty-search"><strong>No exact match yet.</strong><span>Press Enter to search all gear for “{query.trim()}”.</span><button type="button" onClick={submitQuery}>Search all gear <ArrowRight size={14}/></button></div>}
        </div>
      )}
    </div>
  )
}

function CartDrawer({ open, onClose, cart, updateQty, account, memberQuote, quoteLoading, quoteError, cartNotice, onCheckout, products = [], onAdd }) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose)
  const publicSubtotal = cart.reduce((sum, item) => sum + Number(item.unitPrice ?? item.product.price) * item.qty, 0)
  const quoteMap = new Map((memberQuote?.lines || []).map(line => [line.lineKey,line]))
  const subtotal = memberQuote?.member ? Number(memberQuote.subtotal) : publicSubtotal
  const cartQuantity = cart.reduce((sum,item) => sum + Math.max(1, Number(item.qty || 1)), 0)
  const quantityTier = memberQuote?.quantityTier || quantityDiscountForQty(cartQuantity, DEFAULT_QUANTITY_DISCOUNT_POLICY)
  const quantityEstimate = Math.round(publicSubtotal * Number(quantityTier.discountPercent || 0)) / 100
  const remaining = Math.max(0, 100 - publicSubtotal)
  const upsellCandidate = useMemo(() => {
    if (!products?.length) return null
    return products.find(p => !cart.some(item => item.product.id === p.id) && sellableVariants(p).length > 0)
  }, [products, cart])
  return (
    <>
      <button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close bag backdrop" aria-hidden={!open} tabIndex={-1} />
      <aside ref={panelRef} className={`cart-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open} role="dialog" aria-modal="true" aria-label="Your bag" tabIndex={-1}>
        <div className="drawer-head"><h2>YOUR BAG <span>{cart.reduce((sum, item) => sum + item.qty, 0)}</span></h2><IconButton label="Close bag" onClick={onClose}><X /></IconButton></div>
        {!cart.length ? (
          <div className="empty-cart"><span>90+</span><h3>THE NEXT MEMORY<br />STARTS HERE.</h3><p>Your bag is empty. The archive is not.</p><button className="button button--dark" onClick={() => { onClose(); navigate('/shop') }}>EXPLORE THE DROP</button></div>
        ) : (
          <>
            <div className="cart-drawer__top-signals">
              {!memberQuote?.member && (
                <div className="shipping-meter">
                  <p>{remaining ? `${money(remaining)} AWAY FROM FREE SHIPPING` : 'FREE SHIPPING UNLOCKED'}</p>
                  <div><span style={{ width: `${Math.min(100, publicSubtotal)}%` }} /></div>
                </div>
              )}
              <div className="cart-status">
                <span><Check size={15} /> Bag checked against live stock</span>
                <span className="cart-reservation-badge"><Sparkles size={11}/> Reserved</span>
              </div>
            </div>
            <div className="cart-drawer__body">
              {cartNotice && <p className="cart-runtime-notice" role="status">{cartNotice}</p>}
              <div className="cart-items">
                {cart.map(item => { const lineKey=item.key || cartLineKey(item); const clubLine=quoteMap.get(lineKey); const publicTotal=Number(item.unitPrice ?? item.product.price)*item.qty; return <div className="cart-item" key={lineKey}>
                  <img src={item.product.image} alt="" />
                  <div><h3>{item.product.name}</h3><p>{Object.entries(item.options || {}).map(([name,value]) => `${name} ${value}`).join(' · ') || item.sku || 'Default variation'}</p>{item.customization && <div className="cart-item__custom"><span>{Object.entries(item.customization.fields || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${/^https?:\/\//i.test(String(value)) ? 'attached' : value}`).join(' · ') || 'Custom request'}</span>{item.customization.note && <small>Note: {item.customization.note}</small>}{item.customization.aiPreviewUrl && <small>Visual preview attached</small>}</div>}<div className="qty"><button onClick={() => updateQty(item, -1)} aria-label={`Decrease ${item.product.name}`}><Minus size={14} /></button><span>{item.qty}</span><button onClick={() => updateQty(item, 1)} aria-label={`Increase ${item.product.name}`}><Plus size={14} /></button></div></div>
                  <strong className={clubLine?.discount>0?'cart-member-price':''}>{clubLine?.discount>0&&<del>{money(publicTotal)}</del>}{money(clubLine?.lineTotal ?? publicTotal)}{clubLine?.discount>0&&<small>90+ CLUB</small>}</strong>
                </div>})}
              </div>
              {upsellCandidate && (
                <div className="cart-cross-sell">
                  <p>PAIR WITH YOUR ORDER</p>
                  <button type="button" onClick={() => onAdd?.(upsellCandidate)}>
                    <img src={upsellCandidate.image} alt={upsellCandidate.name} />
                    <span><strong>{upsellCandidate.name}</strong><small>{money(upsellCandidate.price)} · Quick add</small></span>
                    <Plus size={16}/>
                  </button>
                </div>
              )}
              {memberQuote?.member ? <div className="cart-club-status"><Ticket size={17}/><div><strong>90+ Club pricing applied</strong><span>{memberQuote.shipping?.eligible ? `Eligible ${memberQuote.shipping.method.toLowerCase()} shipping included up to ${money(memberQuote.shipping.subsidyCap)}.` : memberQuote.shipping?.reason}</span></div></div> : <button className="cart-club-upsell" onClick={()=>{onClose();navigate('/membership')}}><Ticket size={16}/><span><strong>JOIN 90+ CLUB</strong><small>20–40% eligible savings + standard shipping benefit</small></span><ArrowRight size={15}/></button>}
              {quoteLoading&&<p className="cart-quote-note" role="status">Checking secure member price…</p>}
              {quoteError&&account?.user&&<p className="cart-quote-note is-error" role="alert">{quoteError}</p>}
            </div>
            <div className="cart-checkout">{memberQuote?.discount>0&&<div className="cart-checkout__saving"><span>{memberQuote.quantityTier?.discountPercent > 0 && memberQuote.quantityTier.discountPercent >= Number(memberQuote.lines?.[0]?.discountPercent || 0) ? `QUANTITY SAVING · ${memberQuote.quantityTier.discountPercent}%` : '90+ CLUB SAVING'}</span><strong>−{money(memberQuote.discount)}</strong></div>}{!memberQuote?.member && quantityTier.discountPercent > 0 && <div className="cart-checkout__saving"><span>{quantityDiscountLabel(quantityTier)} quantity saving</span><strong>up to −{money(quantityEstimate)}</strong></div>}<div><span>SUBTOTAL</span><strong>{money(subtotal)}</strong></div><button onClick={onCheckout} disabled={!cart.length}>CHECKOUT <ArrowRight size={16}/></button><p id="checkout-status">Live stock and pricing are checked again before payment. Your order is only confirmed after the provider approves payment.</p></div>
          </>
        )}
      </aside>
    </>
  )
}

function ButtonLink({ children, light = false, onClick, className = '' }) {
  return <button className={`button-link ${light ? 'button-link--light' : ''} ${className}`} onClick={onClick}><span>{children}</span><ArrowRight size={17} /></button>
}

function Hero({ content = {}, customProduct }) {
  const customTarget = customProductTarget(customProduct)
  const legacyHeadline = /minutes nobody forgets/i.test(String(content.headline || ''))
  const headline = !content.headline || legacyHeadline ? 'YOUR NAME.\nYOUR NUMBER.\nYOUR JERSEY.' : String(content.headline)
  const eyebrow = !content.eyebrow || /drop 01|extra time/i.test(String(content.eyebrow)) ? 'CUSTOM JERSEYS' : content.eyebrow
  const primaryLabel = !content.button || /explore the drop|create your jersey/i.test(String(content.button)) ? 'START CUSTOMIZING' : content.button

  return (
    <section className="hero">
      <img src="/assets/hero-tunnel.webp" alt="A player entering a rain-soaked stadium from a dark tunnel" width="1672" height="941" loading="eager" fetchPriority="high" decoding="async" />
      <div className="hero__wash" />
      <div className="hero__time" aria-hidden="true">90<span>+</span></div>
      <div className="hero__content">
        <p>{eyebrow}</p>
        <h1>{headline.split(/\r?\n/).map((line, index) => <React.Fragment key={`${line}-${index}`}>{index > 0 && <br />}{line.toUpperCase()}</React.Fragment>)}</h1>
        <p className="hero__lede">{content.supporting || 'Made for fans. Personalized with the details that make it yours.'}</p>
        <div className="hero__actions">
          <button className="button button--acid hero__cta-primary" onClick={() => navigate(customTarget)}>
            <Sparkles size={16}/> {primaryLabel}
          </button>
          <ButtonLink light onClick={() => navigate('/category/custom-jerseys')}>SHOP JERSEYS</ButtonLink>
        </div>
        <span className="hero__brand-line">Jersevo · Sports memories, made wearable.</span>
      </div>

      <div className="hero__card-preview" onClick={() => navigate(customTarget)} role="button" tabIndex={0} aria-label="Interactive custom jersey preview">
        <div className="hero__preview-tag">
          <span className="hero__preview-live-dot" />
          <span>OFFICIAL CATALOGUE · GAME DAY</span>
        </div>
        <div className="hero__preview-jersey">
          <img
            src="/assets/jersey-black.webp"
            alt="Black Jersevo custom jersey preview"
            className="hero__preview-image"
            width="1080"
            height="1440"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="hero__preview-foot">
          <span>CUSTOM LAB · MADE TO ORDER</span>
          <strong>CUSTOMIZE NOW <ArrowRight size={14}/></strong>
        </div>
      </div>

      <div className="hero__meta"><span>DESIGNED FOR THE MINUTES<br />THAT STAY WITH YOU.</span><button onClick={() => document.querySelector('#leagues')?.scrollIntoView({ behavior: 'smooth' })}>EXPLORE THE LEAGUES <ArrowDown size={16}/></button></div>
    </section>
  )
}

function HomePath() {
  return null
}

function DropFeature({ product }) {
  const target = product ? `/product/${product.handle || product.id}` : '/shop'
  return (
    <section className="drop-feature section" id="drop">
      <div className="section-kicker"><span>THE DROP</span><span>01 / 04</span></div>
      <div className="drop-feature__copy">
        <h2>AFTER<br />NINETY.</h2>
        <div><p>{product?.story || 'Some games finish at the whistle. The important ones never do.'}</p><ButtonLink onClick={() => navigate(target)}>ENTER THE COLLECTION</ButtonLink></div>
      </div>
      <div className="drop-bento">
        <button className="drop-feature__media drop-bento__main" onClick={() => navigate(target)} aria-label={`Discover ${product?.name || 'the drop'}`}>
          <img src={product?.image || '/assets/editorial-player.webp'} alt={product?.alt || 'Player after a night match'} />
          <span className="media-note">DROP 01<span>ASPHALT / RAIN / 22:47</span></span>
          <span className="media-stamp">90<sup>+</sup></span>
        </button>
        <div className="drop-bento__cards">
          <div className="drop-bento__card drop-bento__card--vip" onClick={() => navigate('/membership')} role="button" tabIndex={0}>
            <div className="drop-bento__card-top">
              <span className="drop-bento__kicker"><Ticket size={16}/> 90+ CLUB PASS</span>
              <span className="drop-bento__badge">VIP PRIVILEGE</span>
            </div>
            <h3>20% OFF EVERY DROP</h3>
            <p>Free tracked priority shipping worldwide, 48-hour early drop access, and private custom queue.</p>
            <span className="drop-bento__link">JOIN THE CLUB <ArrowRight size={14}/></span>
          </div>
          <div className="drop-bento__card drop-bento__card--craft" onClick={() => navigate('/shipping')} role="button" tabIndex={0}>
            <div className="drop-bento__card-top">
              <span className="drop-bento__kicker"><ShieldCheck size={16}/> PRO ATHLETIC CRAFT</span>
              <span className="drop-bento__badge">MADE TO ORDER</span>
            </div>
            <h3>SUBLIMATED ZERO-CRACK DYE</h3>
            <p>240 GSM breathable performance jacquard knit. Numbers and typography dye-sublimated directly into fabric yarns.</p>
            <span className="drop-bento__link">VIEW CRAFT & CARE <ArrowRight size={14}/></span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Rating({ value, reviews }) {
  return (
    <span className="rating" aria-label={`${value} out of 5 stars from ${reviews} reviews`}>
      <span className="rating__stars" aria-hidden="true">
        {[...Array(5)].map((_, i) => (
          <Star key={i} size={11} fill="#e5a914" stroke="#e5a914" />
        ))}
      </span>
      <span className="rating__val">{value}</span>
      <small>({reviews})</small>
    </span>
  )
}

function ProductCard({ product, onQuickView, className = '' }) {
  const available = sellableVariants(product)
  const maxPrice = Math.max(Number(product.price || 0),...available.map(variant => Number(variant.price || 0)))
  const sizeOption = (product.options || []).find(option => /^(size|fit)$/i.test(option.name))
  return (
    <article className={`product-card ${className}`}>
      <a className="product-card__image" href={`/product/${product.handle || product.id}`} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); navigate(event.currentTarget.getAttribute('href')) } }}>
        <img src={product.image} alt={product.alt} loading="lazy" />
        <span className="product-badge">{product.badge || (product.customFields?.length ? 'CUSTOMIZABLE' : 'READY TO SHIP')}</span>
        <span className="heart" aria-hidden="true"><Heart size={19}/></span>
        <span className={`quick-add ${available.length ? '' : 'is-disabled'}`} onClick={event => { event.preventDefault(); event.stopPropagation(); if (available.length) onQuickView(product) }}>{available.length ? 'QUICK VIEW' : 'SOLD OUT'} {available.length ? <Plus size={16}/> : null}</span>
      </a>
      <a className="product-card__info" href={`/product/${product.handle || product.id}`} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); navigate(event.currentTarget.getAttribute('href')) } }}>
        <span><strong>{product.name}</strong><small className="product-card__meta"><ProductTaxonomyMarks product={product}/><span>{product.meta}</span></small><em>{product.customFields?.length ? 'CUSTOMIZABLE' : 'READY TO SHIP'}</em></span>
        <span className="product-card__price"><strong>{maxPrice > Number(product.price) ? `FROM ${money(product.price)}` : money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</span>
      </a>
      <div className="product-card__footer">
        {product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}
        {sizeOption && <span className="product-card__sizes">{sizeOption.values.join(' · ')}</span>}
      </div>
    </article>
  )
}

function ProductRail({ onQuickView, title = 'BEST SELLERS. YOUR WAY.', subtitle = 'Fan favorites, ready to personalize.', items = [], products = [], className = '' }) {
  const [activeTab, setActiveTab] = useState('ALL')
  const sliderRef = useRef(null)
  const tabs = [
    { id: 'ALL', label: '★ ALL FAVORITES' },
    { id: 'TREND', label: '✨ TREND' },
    { id: 'NEW', label: 'NEW ARRIVAL' }
  ]
  const displayItems = useMemo(() => {
    let pool = products.length ? products : items
    if (activeTab === 'TREND') {
      const trending = pool.filter(p => p.customFields?.length || (p.reviews && p.reviews >= 35) || /touchline|hot|drop|popular/i.test(`${p.badge || ''} ${p.name || ''} ${p.tags?.join(' ') || ''}`))
      pool = trending.length ? trending : pool
    } else if (activeTab === 'NEW') {
      const newItems = pool.filter(p => /new|2026|arrival|drop/i.test(`${p.badge || ''} ${p.tags?.join(' ') || ''}`))
      pool = newItems.length ? newItems : [...pool].reverse()
    }
    return pool.slice(0, 10)
  }, [activeTab, products, items])

  const scroll = direction => {
    if (sliderRef.current) {
      const offset = sliderRef.current.offsetWidth * 0.75
      sliderRef.current.scrollBy({ left: direction === 'left' ? -offset : offset, behavior: 'smooth' })
    }
  }

  return (
    <section className={`product-section section ${className}`}>
      <div className="section-title-row">
        <div>
          <h2>{title}</h2>
          <p className="product-section__subtitle">{subtitle}</p>
        </div>
        <div className="product-rail__nav">
          <div className="product-rail__arrows">
            <button className="slider-arrow" onClick={() => scroll('left')} aria-label="Previous products"><ArrowLeft size={16}/></button>
            <button className="slider-arrow" onClick={() => scroll('right')} aria-label="Next products"><ArrowRight size={16}/></button>
          </div>
          <ButtonLink onClick={() => navigate('/shop')}>SHOP ALL GEAR</ButtonLink>
        </div>
      </div>
      <div className="product-rail__tabs" role="tablist" aria-label="Starting Lineup Category Filters">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`product-rail__tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div ref={sliderRef} className="product-rail__slider" tabIndex={0} aria-label="Featured jersey collection slider">
        {displayItems.map(product => (
          <div key={product.id} className="product-rail__slide">
            <ProductCard product={product} onQuickView={onQuickView}/>
          </div>
        ))}
      </div>
    </section>
  )
}

function Breadcrumbs({ items = [] }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a>{items.map((item, index) => <React.Fragment key={`${item.label}-${index}`}><span aria-hidden="true">/</span>{item.href ? <a href={item.href}>{item.label}</a> : <strong aria-current="page">{item.label}</strong>}</React.Fragment>)}</nav>
}

function ProductTaxonomyMarks({ product }) {
  const values = productTaxonomyValues(product)
  const league = findLeague(values.league)
  const team = league ? findTeam(league.key,values.team) : null
  const leagueSrc = league?.media?.src || ''
  const teamSrc = team?.media?.src && !team.media.fallback ? team.media.src : ''
  const marks = []
  if (leagueSrc) marks.push(<img key="league" src={leagueSrc} alt="" loading="lazy" decoding="async" />)
  if (teamSrc && teamSrc !== leagueSrc) marks.push(<img key="team" src={teamSrc} alt="" loading="lazy" decoding="async" />)
  const teamName = team?.name || (values.team && values.team !== values.league ? values.team.replace(/-/g,' ') : '')
  if (!teamSrc && teamName) marks.push(<span key="team-monogram" className="product-card__team-monogram" aria-hidden="true">{teamName.split(/\s+/).map(word => word[0]).join('').slice(0,3)}</span>)
  marks.push(<CategoryIcon key="product" kind={catalogIconForProduct(product)} size={14} />)
  return <span className="product-card__taxonomy-marks" aria-label={`${league?.name || ''}${teamName ? ` · ${teamName}` : ''} · ${product.productGroup || product.type || 'Product'}`}>{marks}</span>
}

function CatalogPagination({ page, totalPages, label = 'Products' }) {
  if (totalPages <= 1) return null
  const numbers = [...new Set([1, page - 1, page, page + 1, totalPages].filter(value => value >= 1 && value <= totalPages))].sort((a, b) => a - b)
  const hrefFor = target => {
    const url = new URL(window.location.href)
    const { basePath } = parseCatalogPagePath(url.pathname)
    url.searchParams.delete('page')
    return `${catalogPagePath(basePath,target)}${url.search}`
  }
  const go = target => navigate(hrefFor(target))
  return <nav className="catalog-pagination" aria-label={`${label} pagination`}>
    <a className="catalog-pagination__previous" href={hrefFor(Math.max(1, page - 1))} aria-disabled={page === 1} onClick={event => { if (page === 1) event.preventDefault(); else { event.preventDefault(); go(page - 1) } }}><ArrowLeft size={14}/> Previous</a>
    <div className="catalog-pagination__numbers">{numbers.map((number, index) => <React.Fragment key={number}>{index > 0 && numbers[index - 1] !== number - 1 && <span aria-hidden="true">…</span>}<a href={hrefFor(number)} className={number === page ? 'is-active' : ''} aria-current={number === page ? 'page' : undefined} onClick={event => { event.preventDefault(); go(number) }}>{number}</a></React.Fragment>)}</div>
    <a className="catalog-pagination__next" href={hrefFor(Math.min(totalPages, page + 1))} aria-disabled={page === totalPages} onClick={event => { if (page === totalPages) event.preventDefault(); else { event.preventDefault(); go(page + 1) } }}>Next <ArrowRight size={14}/></a>
  </nav>
}

function useAutoCatalog({ initialProducts = [], pagination = null, basePath = '', collectionHandle = '', search = '', enabled = false }) {
  const [items,setItems] = useState(initialProducts)
  const [loadedPage,setLoadedPage] = useState(pagination?.page || 1)
  const [loadingMore,setLoadingMore] = useState(false)
  const [endReached,setEndReached] = useState(false)
  const [error,setError] = useState('')
  const sentinelRef = useRef(null)
  const inFlightRef = useRef(false)
  const resetKey = `${basePath}|${collectionHandle}|${search}|${pagination?.page || 1}`

  useEffect(() => {
    setItems(initialProducts || [])
    setLoadedPage(pagination?.page || 1)
    setEndReached(false)
    setError('')
  }, [resetKey,initialProducts])

  const total = pagination?.total == null ? null : Number(pagination.total)
  const hasMore = Boolean(enabled && !endReached && !error && (total == null || items.length < total))
  const loadMore = async () => {
    if (!hasMore || inFlightRef.current) return
    inFlightRef.current = true
    setLoadingMore(true)
    setError('')
    const nextPage = loadedPage + 1
    try {
      const result = collectionHandle
        ? await fetchStorefrontCollectionPage(collectionHandle,{ page:nextPage, pageSize:pagination?.pageSize || CATALOG_PAGE_SIZE })
        : await fetchStorefrontCatalogPage({ page:nextPage, pageSize:pagination?.pageSize || CATALOG_PAGE_SIZE, basePath, search })
      const rows = result.data || []
      if (result.source !== 'supabase') {
        setError(result.error || 'More products could not be loaded.')
      } else if (!rows.length) {
        setEndReached(true)
      } else {
        setItems(current => {
          const existing = new Set(current.map(item => item.id))
          return [...current,...rows.filter(item => !existing.has(item.id))]
        })
        setLoadedPage(nextPage)
        if (rows.length < (pagination?.pageSize || CATALOG_PAGE_SIZE)) setEndReached(true)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'More products could not be loaded.')
    } finally {
      inFlightRef.current = false
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!enabled || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore() }, { rootMargin:'900px 0px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [enabled,hasMore,loadingMore,loadedPage,resetKey])

  return { items, sentinelRef, loadingMore, hasMore, error, loadedPage, total, retry:() => setError('') }
}

function AutoCatalogSentinel({ catalog, label = 'products' }) {
  if (!catalog?.hasMore && !catalog?.loadingMore && !catalog?.error) return <div className="catalog-auto-sentinel catalog-auto-sentinel--end" aria-live="polite">You’ve reached the end of this {label}.</div>
  return <div ref={catalog?.sentinelRef} className="catalog-auto-sentinel" aria-live="polite">{catalog?.error ? <button type="button" onClick={catalog.retry}>Retry loading {label}</button> : catalog?.loadingMore ? `Loading more ${label}…` : `Scroll for more ${label}`}</div>
}

function useMobileCols() {
  const [cols, setColsState] = useState(() => {
    try {
      const saved = localStorage.getItem('jersevo_mobile_cols')
      if (saved === '1' || saved === '2') return Number(saved)
    } catch {}
    return 2
  })
  const setCols = next => {
    setColsState(next)
    try {
      localStorage.setItem('jersevo_mobile_cols', String(next))
    } catch {}
  }
  return [cols, setCols]
}

function StorefrontTrust({ compact = false, variant = 'default' }) {
  const items = variant === 'home' ? [
    ['Made Just for You', 'Crafted on demand', Sparkles],
    ['Personalized Your Way', 'Name, number & approved details', Tag],
    ['Secure from Cart to Checkout', 'Protected payment flow', ShieldCheck],
    ['Tracked to Your Door', 'Delivery updates included', Truck]
  ] : [
    ['SHIPPING', 'Free US shipping over $100', Truck],
    ['DELIVERY', 'Tracked delivery with clear updates', PackageCheck],
    ['RETURNS', '30-day standard return window', ShieldCheck],
    ['CHECKOUT', 'Secure checkout in USD', Lock]
  ]
  if (variant === 'home') {
    return (
      <section className="storefront-trust storefront-trust--home" aria-label="Storefront trust pillars">
        <div className="storefront-trust__track">
          {items.map(([label, copy, IconComponent]) => (
            <div key={label} className="storefront-trust__pill">
              {IconComponent && <span className="storefront-trust__pill-icon" aria-hidden="true"><IconComponent size={14}/></span>}
              <span className="storefront-trust__pill-text">
                <strong className="storefront-trust__pill-title">{label}</strong>
                <span className="storefront-trust__pill-copy">{copy}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    )
  }
  if (variant === 'line' || compact) {
    return (
      <aside className="storefront-trust-line" aria-label="Order assurances">
        <div className="storefront-trust-line__track">
          {items.map(([label, copy, IconComponent], idx) => (
            <React.Fragment key={label}>
              {idx > 0 && <span className="storefront-trust-line__sep" aria-hidden="true">•</span>}
              <span className="storefront-trust-line__item">
                {IconComponent && <IconComponent size={14} className="storefront-trust-line__icon" aria-hidden="true"/>}
                <strong className="storefront-trust-line__copy">{copy}</strong>
              </span>
            </React.Fragment>
          ))}
        </div>
      </aside>
    )
  }
  return (
    <section className={`storefront-trust ${compact ? 'storefront-trust--compact' : ''}`} aria-label="Order and shopping assurances">
      {items.map(([label, copy, IconComponent]) => (
        <div key={label} className="storefront-trust__item">
          {IconComponent && <span className="storefront-trust__icon" aria-hidden="true"><IconComponent size={20}/></span>}
          <div className="storefront-trust__text">
            <span>{label}</span>
            <strong>{copy}</strong>
          </div>
        </div>
      ))}
    </section>
  )
}

function TaxonomyLanding({ league, team, productType = null, products, discoveryProducts = [], onQuickView, page = 1, pagination = null, loading = false }) {
  const [mobileCols, setMobileCols] = useMobileCols()
  const [teamQuery,setTeamQuery] = useState('')
  const [showAllTeams,setShowAllTeams] = useState(false)
  const [teamSort,setTeamSort] = useState('AZ')
  const query = new URLSearchParams(window.location.search)
  const selectedGroup = query.get('group') || ''
  const selectedSort = query.get('sort') || 'FEATURED'
  const customOnly = query.get('custom') === '1'
  const path = productType ? `${teamPath(league.key,team)}/${productType.handle}` : team ? teamPath(league.key,team) : leaguePath(league)
  const catalog = useAutoCatalog({ initialProducts:products, pagination, basePath:path, search:window.location.search.slice(1), enabled:Boolean(pagination?.server && !loading) })
  const changeFacet = (key,value) => {
    const url = new URL(window.location.href)
    url.pathname = parseCatalogPagePath(url.pathname).basePath
    value ? url.searchParams.set(key,value) : url.searchParams.delete(key)
    navigate(url.pathname + url.search)
  }
  const hub = useMemo(() => taxonomyHubCounts(discoveryProducts,{ league:league?.key, team:team?.slug }), [discoveryProducts,league?.key,team?.slug])
  const resultHub = useMemo(() => taxonomyHubCounts(
    customOnly ? discoveryProducts.filter(row => row.customFields?.length) : discoveryProducts,
    { league:league?.key, team:team?.slug }
  ), [discoveryProducts,league?.key,team?.slug,customOnly])
  const facetGroups = hub.groups.slice(0,8)
  const filtered = loading ? [] : catalog.items.filter(product => productMatchesTaxonomy(product, { league:league?.key, team:team?.slug }) && (!productType || productMatchesTeamProductType(product,productType)))
  const serverPaginated = !loading && Boolean(pagination?.server)
  const totalPages = serverPaginated ? Math.max(1,Math.ceil(Number(pagination.total || 0) / CATALOG_PAGE_SIZE)) : pageCount(filtered.length)
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const pagedProducts = serverPaginated ? filtered : filtered.slice((currentPage - 1) * CATALOG_PAGE_SIZE, currentPage * CATALOG_PAGE_SIZE)
  const typeDirectoryCount = productType ? (teamProductTypeCounts(discoveryProducts,{ league:league.key, team:team.slug }).find(item => item.handle === productType.handle)?.count ?? filtered.length) : 0
  const indexedCount = selectedGroup ? (resultHub.groups.find(group => group.name === selectedGroup)?.count ?? 0) : productType ? (pagination?.total ?? typeDirectoryCount) : resultHub.total
  const resultCount = discoveryProducts.length ? indexedCount : filtered.length
  const title = productType ? `${team.name} ${productType.label}` : team?.name || league?.name || 'League collections'
  const teams = league?.teams || []
  const media = team?.media || league?.media
  const availableTeams = loading ? [] : teams.filter(item => hub.teams.get(item.slug) > 0)
  const matchedTeams = availableTeams
    .filter(item => normalizeDiscoveryQuery(item.name).includes(normalizeDiscoveryQuery(teamQuery)))
    .sort((a,b) => teamSort === 'POPULAR' ? (hub.teams.get(b.slug) || 0) - (hub.teams.get(a.slug) || 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))
  const visibleTeams = teamQuery.trim() || showAllTeams ? matchedTeams : matchedTeams.slice(0,12)
  const nearbyLeagues = LEAGUE_TAXONOMY.filter(item => item.key !== league?.key && discoveryProducts.some(row => row.taxonomy?.league === item.key)).slice(0,6)
  const teamTypePages = team ? teamProductTypeCounts(discoveryProducts,{ league:league.key, team:team.slug }) : []
  const leagueHeroKey = ['nfl','nba','mlb','nhl','mls','ncaa'].includes(league?.key) ? league.key : ''
  const leagueCoverArt = leagueCover(leagueHeroKey)
  const heroImage = leagueHeroKey ? `/assets/shop/sport-${leagueHeroKey}-v2.webp` : '/assets/shop/shop-fan-gear-banner-v2.webp'

  return (
    <main className="taxonomy-page">
      <section className={`taxonomy-hub-hero taxonomy-hub-hero--unified ${!team ? 'taxonomy-hub-hero--cover' : ''}`} aria-label={team ? team.name + ' fan gear' : league.name + ' fan gear'}>
        {!team ? (
          <div className="taxonomy-cover">
            <img className="taxonomy-cover__image" src={leagueCoverArt?.src || heroImage} alt={leagueCoverArt?.alt || `${league.name} fan gear`} width="2048" height="683" loading="eager" decoding="async" />
            <div className="taxonomy-cover__shade" aria-hidden="true" />
            <nav className="taxonomy-cover__crumb" aria-label="Breadcrumb">
              <a href="/shop" onClick={event => { event.preventDefault(); navigate('/shop') }}>Shop</a><span>/</span><strong>{league.name}</strong>
            </nav>
            <h1 id="taxonomy-products-title" className="sr-only">{league.name} fan gear</h1>
            <div className="taxonomy-cover__identity">
              <span className="taxonomy-cover__mark" aria-hidden="true">
                {media?.src && !media.fallback ? <img src={media.src} alt="" loading="eager" decoding="async"/> : <span>{league.name}</span>}
              </span>
              <span className="taxonomy-cover__identity-copy"><small>{league.sport}</small><strong>{league.name}</strong><em>{loading ? 'Loading gear…' : `${resultCount.toLocaleString('en-US')} products`}</em></span>
            </div>
          </div>
        ) : (
          <>
            <nav className="taxonomy-hub-hero__crumb" aria-label="Breadcrumb">
              <a href="/shop" onClick={event => { event.preventDefault(); navigate('/shop') }}>Shop</a>
              <span>/</span>
              <a href={leaguePath(league)} onClick={event => { event.preventDefault(); navigate(leaguePath(league)) }}>{league.name}</a>
              <span>/</span><strong>{team.name}</strong>
              {productType && <><span>/</span><strong>{productType.label}</strong></>}
            </nav>
            <div className="taxonomy-hub-hero__layout">
              <div className="taxonomy-hub-hero__copy">
                <span>{league.sport} / {league.name}</span>
                <h1 id="taxonomy-products-title">{productType ? `${team.name} ${productType.label.toLowerCase()} for game day.` : `${team.name} gear for game day.`}</h1>
                <strong className="taxonomy-hub-hero__slogan">Wear the team. Make it yours.</strong>
                <p>{productType ? productType.description : `Find current ${team.name} jerseys, headwear and fan gear—then personalize eligible styles. Fan gear for every team.`}</p>
              </div>
              <div className="taxonomy-hub-hero__visual" aria-hidden="true">
                <img className="taxonomy-hub-hero__action" src={heroImage} alt="" loading="eager" decoding="async" />
                <div className="taxonomy-hub-hero__mark">
                  {media?.src && !media.fallback ? <img src={media.src} alt="" loading="eager" decoding="async"/> : <span>{team.name.split(/\s+/).map(word => word[0]).join('').slice(0,3)}</span>}
                </div>
              </div>
            </div>
          </>
        )}
        <div className="taxonomy-control-strip__actions">
          <span className="taxonomy-control-strip__count" aria-live="polite">{loading ? '…' : `${resultCount.toLocaleString('en-US')} ${resultCount === 1 ? 'product' : 'products'}`}</span>
          <button type="button" className={`taxonomy-control-strip__custom ${customOnly ? 'is-active' : ''}`} aria-label="Show customizable products" aria-pressed={customOnly} onClick={() => changeFacet('custom',customOnly ? '' : '1')}><Sparkles size={14} aria-hidden="true"/><span>Custom</span></button>
          <label className="taxonomy-control-strip__sort"><SlidersHorizontal size={14} aria-hidden="true"/><span className="taxonomy-control-strip__sort-label">Sort</span><select value={selectedSort} aria-label="Sort products" onChange={event => changeFacet('sort',event.target.value === 'FEATURED' ? '' : event.target.value)}><option value="FEATURED">Featured</option><option value="NEWEST">Newest</option><option value="PRICE LOW">Price: low to high</option><option value="PRICE HIGH">Price: high to low</option></select></label>
          <div className="mobile-grid-toggle taxonomy-control-strip__grid" aria-label="Product grid columns"><button type="button" className={mobileCols === 1 ? 'is-active' : ''} aria-label="One product per row" onClick={() => setMobileCols(1)}><Square size={15}/></button><button type="button" className={mobileCols === 2 ? 'is-active' : ''} aria-label="Two products per row" onClick={() => setMobileCols(2)}><Grid2X2 size={15}/></button></div>
        </div>
        <div className="taxonomy-control-strip__bottom">
          <nav className="taxonomy-hub-shop__types taxonomy-control-strip__types" aria-label="Product types">
            <a href={team && productType ? teamPath(league.key,team) : path} className={!selectedGroup && !productType ? 'is-active' : undefined} aria-current={!selectedGroup && !productType ? 'page' : undefined} onClick={event => { event.preventDefault(); productType ? navigate(teamPath(league.key,team)) : changeFacet('group','') }}><CategoryIcon kind="all" size={15}/><span>{productType ? 'All team gear' : 'All gear'}</span><small>{loading ? '…' : (productType ? hub.total : hub.total).toLocaleString('en-US')}</small></a>
            {team && teamTypePages.length ? teamTypePages.map(type => <a key={type.handle} href={type.path} className={productType?.handle === type.handle ? 'is-active' : undefined} aria-current={productType?.handle === type.handle ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate(type.path) }}><CategoryIcon kind={catalogIconForProduct({productGroup:type.groups[0]})} size={15}/><span>{type.label}</span><small>{type.count.toLocaleString('en-US')}</small></a>) : !productType && facetGroups.map(group => <a key={group.name} href={path + '?group=' + encodeURIComponent(group.name)} className={selectedGroup === group.name ? 'is-active' : ''} aria-current={selectedGroup === group.name ? 'page' : undefined} onClick={event => { event.preventDefault(); changeFacet('group',group.name) }}><CategoryIcon kind={catalogIconForProduct({productGroup:group.name})} size={15}/><span>{group.name}</span><small>{group.count.toLocaleString('en-US')}</small></a>)}
          </nav>
          <div className="taxonomy-control-strip__trust"><StorefrontTrust compact /></div>
        </div>
      </section>
      {!team && <section className="taxonomy-hub-teams" aria-labelledby="taxonomy-team-browser-title">
        <div className="taxonomy-hub-teams__head">
          <div><h2 id="taxonomy-team-browser-title">Find your {league.name} team.</h2><p>Choose a team to see its current jerseys, headwear and fan gear.</p></div>
          <div className="taxonomy-hub-teams__tools"><label><Search size={16}/><span className="sr-only">Search {league.name} teams</span><input value={teamQuery} onChange={event => setTeamQuery(event.target.value)} placeholder="Search teams" /></label><label className="taxonomy-hub-teams__sort"><span className="sr-only">Sort teams</span><select value={teamSort} onChange={event => setTeamSort(event.target.value)}><option value="AZ">A → Z</option><option value="POPULAR">Most gear</option></select><ChevronDown size={14}/></label></div>
        </div>
        <div className="taxonomy-hub-teams__tabs" aria-label="Team directory view"><button type="button" className={teamSort === 'AZ' ? 'is-active' : ''} onClick={() => setTeamSort('AZ')}>A–Z</button><button type="button" className={teamSort === 'POPULAR' ? 'is-active' : ''} onClick={() => setTeamSort('POPULAR')}>Popular</button></div>
        <div className="taxonomy-hub-teams__grid">
          {visibleTeams.map(item => <a key={item.slug} href={teamPath(league.key,item)} onClick={event => { event.preventDefault(); navigate(teamPath(league.key,item)) }}>
            {item.media?.src && !item.media.fallback ? <img src={item.media.src} alt="" loading="lazy" decoding="async"/> : <span className="taxonomy-hub-teams__monogram" aria-hidden="true">{item.name.split(/\s+/).map(word => word[0]).join('').slice(0,3)}</span>}
            <span><strong>{item.name}</strong><small>{(hub.teams.get(item.slug) || 0).toLocaleString('en-US')} products</small></span><ArrowRight size={16}/>
          </a>)}
          {!matchedTeams.length && <p>{loading || !discoveryProducts.length ? 'Loading current team directory…' : 'No team matches that search. Try another name.'}</p>}
        </div>
        {!teamQuery.trim() && matchedTeams.length > 12 && <button type="button" className="taxonomy-hub-teams__more" onClick={() => setShowAllTeams(value => !value)}>{showAllTeams ? 'Show fewer teams' : 'View all ' + matchedTeams.length + ' teams'} <ArrowRight size={15}/></button>}
      </section>}
      <section className="taxonomy-products section" id="taxonomy-products" aria-labelledby="taxonomy-products-title">
        {loading ? <div className="shop-grid-loading" role="status">Loading current {title} gear…</div> : filtered.length ? (
          <div className={`product-grid is-col-${mobileCols}`}>
            {pagedProducts.map(product => (
              <ProductCard key={product.id} product={product} onQuickView={onQuickView} />
            ))}
          </div>
        ) : (
          <div className="catalog-empty">
            <span>90+</span>
            <h2>More {title} gear is on the way.</h2>
            <p>Browse the full catalog while this collection grows.</p>
            <button onClick={() => navigate('/shop')}>SHOP ALL PRODUCTS</button>
          </div>
        )}
        {!loading && <AutoCatalogSentinel catalog={catalog} label={`${title} gear`} />}
      </section>
      <section className="taxonomy-related">
        <span>SHOP BY LEAGUE</span>
        <div>
          {nearbyLeagues.map(item => (
            <a key={item.key} href={leaguePath(item)} onClick={event => { event.preventDefault(); navigate(leaguePath(item)) }}>
              {item.name}
              <ArrowRight size={15} />
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}

function CustomHub({ products = [], onQuickView }) {
  const [activeLeague, setActiveLeague] = useState('ALL')
  const customProducts = useMemo(() => products
    .filter(product => product?.customFields?.length && product.status !== 'ARCHIVED')
    .filter(product => activeLeague === 'ALL' || String(product.taxonomy?.league || '').toLowerCase() === activeLeague)
    .slice(0, 8), [products, activeLeague])
  const availableLeagues = useMemo(() => [...new Set(products
    .filter(product => product?.customFields?.length)
    .map(product => String(product.taxonomy?.league || '').toLowerCase())
    .filter(Boolean))].map(key => findLeague(key)).filter(Boolean), [products])
  const featured = customProducts[0]
  const go = href => navigate(href)
  return (
    <main className="custom-hub">
      <section className="custom-hub__hero" aria-labelledby="custom-hub-title">
        <div className="custom-hub__hero-copy">
          <nav className="custom-hub__crumb" aria-label="Breadcrumb"><a href="/shop" onClick={event => { event.preventDefault(); go('/shop') }}>Shop</a><span>/</span><strong>Custom</strong></nav>
          <p className="custom-hub__eyebrow">CUSTOM LAB / REVIEWED PERSONALIZATION</p>
          <h1 id="custom-hub-title">Put your<br /><em>moment</em> on it.</h1>
          <p className="custom-hub__lede">Choose a designer-led jersey, add the details that make it yours, and see every important field before the studio sends it to production.</p>
          <div className="custom-hub__actions"><button className="button button--acid" onClick={() => featured ? go(`/product/${featured.handle}?custom=1`) : go('/category/custom-jerseys')}>{featured ? 'CHOOSE A JERSEY' : 'BROWSE CUSTOM JERSEYS'} <ArrowRight size={16}/></button><button className="button-link" onClick={() => go('/shipping')}>HOW DELIVERY WORKS <ArrowRight size={16}/></button></div>
          <p className="custom-hub__note"><Lock size={14}/> Artwork stays fixed. Only enabled fields can change.</p>
        </div>
        <div className="custom-hub__hero-art">
          <img src={SHOP_COVER.src} alt="A football jersey ready for personal details" width="2048" height="683" loading="eager" fetchPriority="high" decoding="async" />
          <div className="custom-hub__jersey-label" aria-hidden="true"><span>NAME</span><strong>YOUR</strong><span>NUMBER</span><strong>90+</strong><i>STUDIO REVIEW</i></div>
          <span className="custom-hub__hero-stamp">EXTRA TIME / 90+</span>
        </div>
      </section>

      <section className="custom-hub__steps" aria-labelledby="custom-steps-title">
        <div className="custom-hub__section-intro"><p>THE HAND-OFF</p><h2 id="custom-steps-title">Three moves.<br /><em>One piece.</em></h2></div>
        <div className="custom-hub__step-grid">
          <article><span>01</span><Shirt size={22}/><h3>Choose the base</h3><p>Start with a published jersey and check the available size and color options.</p></article>
          <article><span>02</span><Sparkles size={22}/><h3>Add your details</h3><p>Enter a name, number or approved reference only where that listing allows it.</p></article>
          <article><span>03</span><ShieldCheck size={22}/><h3>Review before print</h3><p>The studio checks the request, then production begins with the locked artwork intact.</p></article>
        </div>
      </section>

      <section className="custom-hub__catalog" aria-labelledby="custom-catalog-title">
        <div className="custom-hub__catalog-head"><div><p>LIVE CUSTOM CATALOG</p><h2 id="custom-catalog-title">Make it yours,<br /><em>your way.</em></h2></div><a href="/category/custom-jerseys" onClick={event => { event.preventDefault(); go('/category/custom-jerseys') }}>VIEW ALL CUSTOM JERSEYS <ArrowRight size={15}/></a></div>
        {availableLeagues.length > 0 && <div className="custom-hub__league-tabs" role="tablist" aria-label="Filter custom jerseys by league"><button type="button" className={activeLeague === 'ALL' ? 'is-active' : ''} onClick={() => setActiveLeague('ALL')}>All</button>{availableLeagues.slice(0, 6).map(league => <button type="button" role="tab" aria-selected={activeLeague === league.key} className={activeLeague === league.key ? 'is-active' : ''} key={league.key} onClick={() => setActiveLeague(league.key)}>{league.name}</button>)}</div>}
        {customProducts.length ? <div className="custom-hub__product-grid">{customProducts.map(product => <ProductCard key={product.id} product={product} onQuickView={onQuickView} className="custom-hub__product-card" />)}</div> : <div className="custom-hub__empty"><Sparkles size={20}/><p>Custom pieces are being prepared. Browse the full jersey catalog and look for the <strong>Customizable</strong> badge.</p><button className="button button--dark" onClick={() => go('/category/custom-jerseys')}>BROWSE JERSEYS</button></div>}
      </section>

      <section className="custom-hub__trust"><StorefrontTrust compact /></section>
    </main>
  )
}

function QuickView({ product, onClose, onAdd }) {
  const panelRef = useRef(null)
  const open = Boolean(product)
  useDialogFocus(open,panelRef,onClose)
  const options = product?.options || []
  const [selections,setSelections] = useState(() => Object.fromEntries(options.filter(option => option.values?.length === 1).map(option => [option.name,option.values[0]])))
  if (!product) return null
  const complete = options.every(option => selections[option.name])
  const selected = complete ? (product.variants || []).find(variant => options.every(option => variant.values?.[option.name] === selections[option.name])) : options.length ? null : sellableVariants(product)[0]
  const canAdd = isSellableVariant(selected)
  const shownVariant = selected || sellableVariants(product)[0]
  const price = Number(shownVariant?.price ?? product.price)
  const choose = (name,value) => setSelections(current => ({...current,[name]:value}))
  return <div className="quick-view" aria-hidden={!open}>
    <button className="backdrop is-open" onClick={onClose} aria-label="Close quick view" tabIndex={-1}/>
    <section ref={panelRef} className="quick-view__panel" role="dialog" aria-modal="true" aria-label={`Quick view ${product.name}`} tabIndex={-1}>
      <button className="quick-view__close" onClick={onClose} aria-label="Close quick view"><X size={19}/></button>
      <figure><img src={product.image} alt={product.alt || product.name}/><figcaption>{product.badge || 'PUBLISHED PIECE'}</figcaption></figure>
      <div className="quick-view__body"><span>QUICK VIEW</span><h2>{product.name}</h2><p>{product.story || product.description}</p><strong>{money(price)}</strong>
        {options.map(option => {
          const isSize = ['size'].includes(option.name.toLowerCase())
          const values = isSize ? sortSizes(option.values) : option.values
          return (
            <div className="quick-view__option" key={option.name}>
              <div><span>{option.name}</span><b>{selections[option.name] || 'Choose'}</b></div>
              <div>{values.map(value => {
                const other=Object.fromEntries(Object.entries(selections).filter(([name])=>name!==option.name));
                const available=availableOptionValue(product,option.name,value,other);
                return <button key={value} disabled={!available} className={selections[option.name]===value?'is-active':''} onClick={()=>choose(option.name,value)}>{value}</button>
              })}</div>
            </div>
          )
        })}
        <button className="quick-view__add" disabled={!canAdd} onClick={() => { onAdd(product,{variant:selected,options:selected.values || selections}); onClose() }}>{!complete ? 'CHOOSE OPTIONS' : canAdd ? `ADD TO BAG — ${money(price)}` : 'SOLD OUT'}</button>
        <button className="quick-view__full" onClick={() => { onClose(); navigate(`/product/${product.handle || product.id}`) }}>VIEW FULL PRODUCT <ArrowRight size={14}/></button>
      </div>
    </section>
  </div>
}

function StoryExplorer({ product }) {
  const [active, setActive] = useState(storyPoints[0])
  return (
    <section className="story-explorer" id="story">
      <div className="story-explorer__head"><p>STORY EXPLORER</p><h2>MORE THAN<br />A JERSEY.</h2><span>TOUCH THE DETAILS<br />TO READ THE MEMORY.</span></div>
      <div className="story-explorer__stage">
        <span className="story-outline story-outline--one">90</span><span className="story-outline story-outline--two">+</span>
        <img src="/assets/jersey-black.webp" alt="After 90 jersey with interactive details" />
        {storyPoints.map((point, index) => <button key={point.id} className={`hotspot ${active.id === point.id ? 'is-active' : ''}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => setActive(point)}><span>0{index + 1}</span></button>)}
        <div className="story-card" key={active.id}><span>{String(storyPoints.indexOf(active) + 1).padStart(2, '0')} / 04</span><h3>{active.title}</h3><p>{active.text}</p></div>
      </div>
      <div className="story-explorer__foot"><span>{product?.name || 'THE CURRENT DROP'} / MEMORY JERSEY</span><ButtonLink light onClick={() => navigate(product ? `/product/${product.handle || product.id}` : '/shop')}>READ THE FULL STORY</ButtonLink></div>
    </section>
  )
}

function PlayerDiscovery({ customProduct }) {
  const cards = [
    { name: 'FOR YOU', count: 'PERSONAL', img: '/assets/for-you.webp', pos: '50%', custom: true },
    { name: 'FOR TWO', count: 'MATCHING', img: '/assets/for-two.webp', pos: '50%' },
    { name: 'FOR FAMILY', count: 'TOGETHER', img: '/assets/for-family.webp', pos: '50%' },
    { name: 'FOR THE SQUAD', count: 'CUSTOM', img: '/assets/for-squad.webp', pos: '50%' }
  ]
  return (
    <section className="players-section section" id="players">
      <div className="section-title-row">
        <div>
          <h2>MADE FOR<br /><em>MORE.</em></h2>
          <p className="intent-section__subtitle">A personalized jersey for game day, the gift, the family photo and every story in between.</p>
        </div>
        <ButtonLink onClick={() => navigate('/shop')}>SHOP BY INTENT</ButtonLink>
      </div>
      <div className="player-grid">
        {cards.map(card => (
          <button key={card.name} onClick={() => navigate(card.custom ? customProductTarget(customProduct) : '/shop')}>
            <img src={card.img} alt={card.name} style={{ objectPosition: `${card.pos} center` }} loading="lazy" />
            <span>{card.name}<small>{card.count} <ArrowRight size={15}/></small></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function LeagueDiscovery({ products = [] }) {
  const leagueMeta = { nfl: 'FOOTBALL', mlb: 'BASEBALL', nba: 'BASKETBALL', nhl:'HOCKEY', mls: 'SOCCER', ncaa: 'COLLEGE', epl: 'SOCCER', laliga: 'SOCCER', seriea: 'SOCCER', bundesliga: 'SOCCER', soccer: 'SOCCER' }
  const leagues = LEAGUE_TAXONOMY.filter(league => products.some(product => productMatchesTaxonomy(product,{ league:league.key })))
  return (
    <section className="league-discovery section" id="leagues">
      <div className="section-title-row">
        <div>
          <h2>CHOOSE YOUR<br /><em>LEAGUE.</em></h2>
          <p className="league-discovery__lede">Pick a league. Find your team. Make it yours.</p>
        </div>
        <ButtonLink onClick={() => navigate('/shop')}>SHOP ALL LEAGUES</ButtonLink>
      </div>
      <div className="league-discovery__grid">
        {leagues.map(league => (
          <a
            key={league.key}
            href={leaguePath(league)}
            className="league-discovery__card"
            onClick={event => { event.preventDefault(); navigate(leaguePath(league)) }}
          >
            <div className="league-discovery__media">
              {league.media && <img src={league.media.src} alt={`${league.name} league mark`} loading="lazy" decoding="async" />}
            </div>
            <div className="league-discovery__info">
              <span className="league-discovery__name">{league.name}</span>
              <small className="league-discovery__sport-name">{leagueMeta[league.key] || league.sport.toUpperCase()}</small>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}

function JerseySvg({ name = 'TAN', number = '07', teamCity = 'SAIGON', year = '2026', base = '#131313', accent = '#f8f04a', view = 'back', patch = true, photoUrl = '', showMeta = true }) {
  const uid = useId().replace(/:/g, '')
  const patternId = `jersey-grid-${uid}`
  const clipId = `shirt-clip-${uid}`
  const hasPhoto = Boolean(photoUrl)
  return (
    <svg className="jersey-svg" viewBox="0 0 520 600" role="img" aria-label={`${base} custom football jersey with ${name} number ${number}`}>
      <defs>
        <pattern id={patternId} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M 26 0 L 0 0 0 26" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2"/></pattern>
        <clipPath id={clipId}><path d="M185 70 116 101 32 181l64 91 54-35v283h220V237l54 35 64-91-84-80-69-31c-22 36-52 45-75 45s-53-9-75-45Z"/></clipPath>
      </defs>
      <path d="M185 70 116 101 32 181l64 91 54-35v283h220V237l54 35 64-91-84-80-69-31c-22 36-52 45-75 45s-53-9-75-45Z" fill={base} stroke="#f2f1e9" strokeWidth="3"/>
      <rect x="20" y="55" width="480" height="480" fill={`url(#${patternId})`} color={accent} clipPath={`url(#${clipId})`}/>
      <path d="M185 70c17 54 53 65 75 65s58-11 75-65" fill="none" stroke="#f2f1e9" strokeWidth="14"/>
      <path d="M335 75c34 120 24 291 35 445" fill="none" stroke={accent} strokeWidth="5"/>
      <path d="m32 181 64 91m392-91-64 91M150 237v283m220-283v283" fill="none" stroke="#f2f1e9" strokeWidth="3" opacity=".7"/>
      {photoUrl && <g><image href={photoUrl} x="214" y="145" width="92" height="92" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`}/><rect x="214" y="145" width="92" height="92" fill="none" stroke={accent} strokeWidth="3"/></g>}
      {view === 'back' ? <>
        <text x="260" y={hasPhoto ? 270 : 224} textAnchor="middle" fill="#f4f3ee" fontFamily="Barlow Condensed" fontWeight="700" fontSize="42" letterSpacing="3">{name || 'YOUR NAME'}</text>
        <text x="260" y={hasPhoto ? 432 : 410} textAnchor="middle" fill="#f4f3ee" stroke={accent} strokeWidth="2" paintOrder="stroke" fontFamily="Barlow Condensed" fontWeight="800" fontSize="190" letterSpacing="-8">{number || '00'}</text>
        {showMeta && <>
          <text x="260" y="500" textAnchor="middle" fill="#f4f3ee" fontFamily="Barlow Condensed" fontWeight="600" fontSize="17" letterSpacing="2">{teamCity || 'TEAM / CITY'}</text>
          <text x="260" y="522" textAnchor="middle" fill={accent} fontFamily="Barlow Condensed" fontWeight="700" fontSize="14" letterSpacing="3">{year || 'YEAR'}</text>
        </>}
      </> : <>
        <path d="M227 208h66v66h-66z" fill="none" stroke={accent} strokeWidth="3"/><path d="M243 241h34M260 224v34" stroke={accent} strokeWidth="3"/>
        <text x="260" y="320" textAnchor="middle" fill="#f4f3ee" fontFamily="Barlow Condensed" fontWeight="700" fontSize="27" letterSpacing="4">{teamCity || 'EXTRA TIME'}</text>
        <text x="260" y="345" textAnchor="middle" fill={accent} fontFamily="Barlow Condensed" fontWeight="700" fontSize="16" letterSpacing="4">{year || '2026'}</text>
      </>}
      {patch && <g transform="translate(383 170)"><circle r="31" fill="#f4f3ee"/><text y="8" textAnchor="middle" fill="#0a0a0a" fontFamily="Barlow Condensed" fontWeight="800" fontSize="24">90+</text></g>}
      <text x="344" y="493" fill={accent} fontFamily="Barlow Condensed" fontWeight="700" fontSize="37">+</text>
    </svg>
  )
}

function CustomTeaser({ product, products = [], onAdd }) {
  return (
    <section className="custom-teaser" id="custom">
      <div className="custom-teaser__grid" aria-hidden="true" />
      <div className="custom-teaser__copy"><p>CUSTOM LAB / DESIGNER EDITION</p><h2>PERSONALIZE<br /><span>YOUR JERSEY.</span></h2><p className="custom-teaser__body">The artwork stays fixed.<br />Add only the name and number that make it yours.</p><button className="button button--acid" onClick={() => navigate(customProductTarget(product))}>START PERSONALIZING <ArrowRight size={17}/></button></div>
      <div className="custom-teaser__jersey"><Suspense fallback={<div className="home-personalizer__loading">Loading live jersey listings…</div>}><HomeJerseyPersonalizer onAdd={onAdd} product={product} products={products} /></Suspense></div>
      <div className="custom-teaser__steps"><span>DESIGN / LOCKED</span><span>NAME + NUMBER</span><span>LIVE REAR VIEW</span><span>MADE ON DEMAND</span></div>
    </section>
  )
}

function CustomOptions({ product, products = [], onAdd }) {
  return (
    <section className="custom-options section" id="custom-options" aria-labelledby="custom-options-heading">
      <div className="section-title-row custom-options__head">
        <h2 id="custom-options-heading">PERSONALIZE<br /><em>YOUR JERSEY.</em></h2>
      </div>

      <div className="custom-options__stage">
        <Suspense fallback={<div className="home-personalizer__loading">Loading live jersey listings…</div>}>
          <HomeJerseyPersonalizer onAdd={onAdd} product={product} products={products} />
        </Suspense>
      </div>
    </section>
  )
}

function QualityProof({ product }) {
  const target = product ? `/product/${product.handle || product.id}` : '/shop'
  const details = [
    ['01', 'SURFACE', 'See the fabric and artwork up close.', '/assets/jersey-white.webp', '42%'],
    ['02', 'PRINT DETAIL', 'Preview the name and number placement.', '/assets/jersey-black.webp', '50%'],
    ['03', 'TRIM', 'Look at the collar and sleeve finish.', '/assets/jersey-oxblood.webp', '50%'],
    ['04', 'FIT + SIZE', 'Use the size guide before you order.', '/assets/jersey-white.webp', '62%']
  ]
  return (
    <section className="quality-proof section" id="quality" aria-labelledby="quality-heading">
      <div className="quality-proof__head"><div><span>DETAILS BEFORE DECISIONS</span><h2 id="quality-heading">BUILT TO<br /><em>BE WORN.</em></h2></div><div><p>Look closely at the piece you are choosing. Every listing keeps its own artwork language while the personal layer stays clear.</p><ButtonLink onClick={() => navigate(target)}>VIEW A JERSEY</ButtonLink></div></div>
      <div className="quality-proof__grid">{details.map(([index, label, copy, image, position]) => <button key={index} onClick={() => navigate(target)}><span className="quality-proof__image"><img src={image} alt={`${label.toLowerCase()} detail on a Jersevo jersey`} style={{ objectPosition: `center ${position}` }} /></span><span className="quality-proof__index">{index}</span><strong>{label}</strong><small>{copy}<ArrowRight size={15}/></small></button>)}</div>
      <div className="quality-proof__trust"><span>MADE TO ORDER</span><span>DESIGNER-LED ARTWORK</span><span>SIZE GUIDANCE</span><span>TRACKED DELIVERY</span></div>
    </section>
  )
}

function CommunityProof() {

  return (
    <section className="community-proof section" id="community" aria-labelledby="community-heading">
      <div className="community-proof__hero">
        <div className="community-proof__copy">
          <span>THE PIECE LEAVES THE STUDIO</span>
          <h2 id="community-heading">SEEN IN<br /><em>THE WILD.</em></h2>
          <p>From the first sketch to the first match, a jersey becomes part of the memory around it.</p>
          <div className="community-proof__facts">
            <span><strong>01</strong>DESIGNER-LED</span>
            <span><strong>02</strong>PERSONALIZED</span>
            <span><strong>03</strong>MADE FOR YOUR MOMENT</span>
          </div>
          <ButtonLink onClick={() => navigate('/shop')}>SHOP THE COLLECTION</ButtonLink>
        </div>
        <div className="community-proof__collage" aria-label="Editorial jersey photography">
          <figure className="community-proof__image community-proof__image--large">
            <img src="/assets/for-two.webp" alt="Fans wearing personalized matchday jerseys" loading="lazy" />
          </figure>
          <figure className="community-proof__image community-proof__image--small">
            <img src="/assets/seen-in-wild.webp" alt="Passionate player on city court wearing personalized jersey" loading="lazy" />
          </figure>
          <span className="community-proof__stamp">MORE THAN<br />A JERSEY.</span>
        </div>
      </div>

    </section>
  )
}

function HomeFaq() {
  const items = [
    ['What can I personalize?', 'Each listing shows the fields it supports. Most custom pieces use name, number, team or city, year, color and an optional photo; typography and composition stay locked to the design.'],
    ['Can I preview before checkout?', 'Yes. Start from the product page, add the available details and review the visual preview before you add the piece to your bag.'],
    ['How do I follow my order?', 'After checkout, use the order-status link to see the latest payment, fulfillment and delivery updates.'],
    ['Can I return a personalized piece?', 'Review the return policy before ordering. Standard and personalized pieces can have different eligibility rules, so the product and policy pages are the source of truth.']
  ]
  return <section className="home-faq section" id="faq" aria-labelledby="faq-heading"><div className="home-faq__heading"><span>HELPFUL ANSWERS</span><h2 id="faq-heading">FREQUENTLY<br />ASKED <em>QUESTIONS.</em></h2><ButtonLink onClick={() => navigate('/shipping')}>READ THE TRUST DESK</ButtonLink></div><div className="home-faq__items">{items.map(([question, answer]) => <details key={question}><summary><span>{question}</span><Plus size={18}/></summary><p>{answer}</p></details>)}</div></section>
}

function VaultTeaser() {
  return (
    <section className="vault-teaser">
      <div><p>THE VAULT / SOLD OUT STORIES</p><h2>EVERY DROP<br />LEAVES A MARK.</h2><ButtonLink light onClick={() => navigate('/vault')}>ENTER THE VAULT</ButtonLink></div>
      <div className="vault-list">
        {[['2025', 'THE LONG WALK', 'SOLD OUT FOREVER'], ['2024', 'HOME AFTER DARK', 'STORY ARCHIVED'], ['2023', 'FIRST TOUCH', 'SOLD OUT FOREVER']].map(row => <button key={row[1]} onClick={() => navigate('/vault')}><span>{row[0]}</span><strong>{row[1]}</strong><small>{row[2]}</small><ArrowRight/></button>)}
      </div>
    </section>
  )
}

function Manifesto() {
  return (
    <section className="manifesto section"><p>WHY JERSEVO</p><h2>WE DON'T RECREATE<br />THE SHIRTS YOU REMEMBER.</h2><h2 className="outline">WE CREATE THE FEELING<br />YOU CAN'T FORGET.</h2><div><span>ORIGINAL DESIGN</span><span>SMALL-BATCH DROPS</span><span>MADE TO WEAR</span><span>BUILT TO REMEMBER</span></div></section>
  )
}

function Newsletter() {
  const [email,setEmail] = useState('')
  const [consent,setConsent] = useState(false)
  const [status,setStatus] = useState({ state:'idle', message:'' })
  const submit = async event => {
    event.preventDefault()
    if (!consent) { setStatus({state:'error',message:'Please confirm that you want Extra Time email updates.'}); return }
    setStatus({state:'loading',message:'Joining the list…'})
    try {
      const response = await apiFetch('/api/newsletter-subscribe',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,consent,source:'storefront-newsletter',company:''}) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Email registration is temporarily unavailable.')
      setStatus({state:'success',message:'You are on the early-access list. We will email you when early access opens.'})
      setEmail(''); setConsent(false)
    } catch (error) { setStatus({state:'error',message:error instanceof Error ? error.message : 'Email registration failed.'}) }
  }
  return (
    <section className="newsletter">
      <span className="newsletter__number">90<sup>+</sup></span>
      <div><p>NEXT DROP / EARLY ACCESS</p><h2>BE THERE<br />BEFORE THE<br />WHISTLE.</h2></div>
      <form onSubmit={submit} aria-label="Join the Extra Time early-access list">
        <label htmlFor="newsletter-email">EMAIL ADDRESS</label>
        <div><input id="newsletter-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required/><button aria-label="Join early access" disabled={status.state === 'loading'}><ArrowRight size={20}/></button></div>
        <label className="newsletter__consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I agree to receive Extra Time product and early-access emails. I can unsubscribe at any time.</span></label>
        <p className={status.state === 'error' ? 'is-error' : ''} role={status.state === 'error' ? 'alert' : 'status'}>{status.message || 'Only launch and drop updates. Your email is not sold to advertisers.'}</p>
      </form>
    </section>
  )
}

function Footer({ openSizeGuide, menus = [], customProduct }) {
  const configured = (menuAtLocation(menus,'FOOTER')?.items || [])
    .filter(item => item.visible !== false && !(item.type === 'TAXONOMY' || /league/i.test(item.label || '')))
    .slice(0, 4)
  const configuredTargets = new Set(configured.map(item => menuTarget(item.target,customProduct)))
  const compactGroups = [
    { label:'SHOP', links:[
      { label:'Shop all gear', target:'/shop' },
      { label:'Custom jerseys', target:'/custom' },
      { label:'90+ Club', target:'/membership' }
    ] },
    { label:'STUDIO', links:[
      { label:'About Extra Time', target:'/about' },
      { label:'Moments', target:'/#story' },
      { label:'The vault', target:'/vault' }
    ] },
    { label:'HELP', links:[
      { label:'Size guide', action:'size' },
      { label:'Track an order', target:'/track-order' },
      { label:'Shipping & returns', target:'/shipping', targets:['/shipping','/returns'] },
      { label:'Warranty', target:'/warranty' }
    ] },
  ].map(group => ({
    ...group,
    links:group.links.filter(link => {
      const targets = link.targets || (link.target ? [link.target] : [])
      return !targets.some(target => configuredTargets.has(target))
    })
  }))
  const openFooterLink = item => {
    if (item.action === 'size') return openSizeGuide()
    if (item.type === 'EXTERNAL') return window.open(item.target,'_blank','noopener,noreferrer')
    return navigate(item.target)
  }
  return (
    <footer>
      <div className="footer__top"><Mark inverted/><p>Football memories,<br />made wearable.</p></div>
      <div className="footer__links">
        {configured.length > 0 && <div><span>NAVIGATE</span>{configured.map(item => <button key={item.id} onClick={() => openFooterLink({ ...item, target:menuTarget(item.target,customProduct) })}>{item.label}</button>)}</div>}
        {compactGroups.filter(group => group.links.length > 0).map(group => <div key={group.label}><span>{group.label}</span>{group.links.map(item => <button key={item.label} onClick={() => openFooterLink(item)}>{item.label}</button>)}</div>)}
      </div>
      <div className="footer__wordmark">EXTRA TIME<span>+</span></div>
      <div className="footer__legal"><span>© 2026 JERSEVO · EXTRA TIME</span><span><button onClick={() => navigate('/privacy')}>PRIVACY</button> · <button onClick={() => navigate('/terms')}>TERMS</button> · <button onClick={() => navigate('/accessibility')}>ACCESSIBILITY</button></span><span><a href={`mailto:${BUSINESS_DETAILS.email}`}>{BUSINESS_DETAILS.email}</a> · {BUSINESS_DETAILS.location}</span></div>
    </footer>
  )
}

function FixedFooterMenu({ path, bagCount, openCart, menus = [], customProduct, products = [], hidden = false }) {
  const [leagueOpen, setLeagueOpen] = useState(false)
  const isCustom = path === '/custom' || path === '/studio' || (path.startsWith('/product/') && new URLSearchParams(window.location.search).get('custom') === '1')
  const routeLeague = path.startsWith('/league/') || path.startsWith('/team/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : null
  const visibleLeagues = LEAGUE_TAXONOMY.filter(league => products.some(product => productMatchesTaxonomy(product,{ league:league.key })))
  useEffect(() => { setLeagueOpen(false) }, [path])
  useEffect(() => { if (hidden) setLeagueOpen(false) }, [hidden])
  const defaults = [
    { id: 'home', label: 'Home', target: '/', icon: House, active: path === '/' },
    { id: 'shop', label: 'Shop', target: '/shop', icon: Grid2X2, active: (path === '/shop' || path.startsWith('/product/')) && !isCustom },
    { id: 'custom', label: 'Custom', target: '/custom', icon: Sparkles, active: isCustom },
    { id: 'leagues', label: 'Leagues', target: '#leagues', icon: Trophy, active: Boolean(routeLeague) || leagueOpen },
  ]
  const configured = menuAtLocation(menus,'FIXED_FOOTER_MOBILE')?.items || []
  const configuredItems = configured.filter(item => item.target !== '#bag').map(item => { const target=menuTarget(item.target,customProduct); const Icon=/league/i.test(`${item.label} ${target}`) ? Trophy : /club|member/i.test(`${item.label} ${target}`) ? Ticket : /custom|studio/i.test(`${item.label} ${target}`) ? Sparkles : target === '/' ? House : Grid2X2; return {...item,target,icon:Icon,active:/league/i.test(`${item.label} ${target}`) ? Boolean(routeLeague) || leagueOpen : target === '/' ? path === '/' : target.includes('custom=1') ? isCustom : path === target || (target === '/shop' && path.startsWith('/product/') && !isCustom)} })
  const leagueItem = { id:'leagues', label:'Leagues', target:'#leagues', icon:Trophy, active:Boolean(routeLeague) || leagueOpen }
  const items = configuredItems.length
    ? (configuredItems.some(item => item.id === 'leagues' || /league/i.test(`${item.label} ${item.target}`)) ? configuredItems : (() => { const clubIndex = configuredItems.findIndex(item => /club|member/i.test(`${item.label} ${item.target}`)); if (clubIndex >= 0) return configuredItems.map((item,index) => index === clubIndex ? leagueItem : item); return [...configuredItems.slice(0,3), leagueItem].slice(0,4) })())
    : defaults
  const openLeagueMenu = () => setLeagueOpen(current => !current)
  return <div className={`fixed-footer-stack ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
    {leagueOpen && <div className="fixed-league-panel" role="menu" aria-label="League categories">
      {visibleLeagues.map(league => <button key={league.key} role="menuitem" tabIndex={hidden ? -1 : 0} className={routeLeague?.key === league.key ? 'is-active' : ''} onClick={() => { setLeagueOpen(false); navigate(leaguePath(league)) }}>
        <span className="fixed-league-panel__icon">{league.media?.src ? <img src={league.media.src} alt="" loading="lazy" decoding="async"/> : <Trophy size={16}/>}</span><span><strong>{league.name}</strong><small>{league.sport}</small></span><ArrowRight size={14}/>
      </button>)}
    </div>}
    <nav className="fixed-footer-menu" aria-label="Quick navigation" aria-hidden={hidden}>
      {items.map(item => { const Icon = item.icon; const isLeague = item.id === 'leagues' || /league/i.test(`${item.label} ${item.target}`); const isPrimary = /custom|studio/i.test(`${item.id} ${item.label} ${item.target}`); return <button key={item.id} tabIndex={hidden ? -1 : 0} className={`${item.active ? 'is-active' : ''} ${isPrimary ? 'is-primary' : ''}`} aria-current={item.active && !isLeague ? 'page' : undefined} aria-expanded={isLeague ? leagueOpen : undefined} onClick={() => isLeague ? openLeagueMenu() : navigate(item.target)}><Icon size={18}/><span>{item.label}</span></button> })}
      <button tabIndex={hidden ? -1 : 0} className="fixed-footer-menu__bag" onClick={openCart} aria-label={`Open bag with ${bagCount} items`}><ShoppingBag size={18}/><span>Bag</span><b>{bagCount}</b></button>
    </nav>
  </div>
}

function InstallAppSheet({ open, onClose, deferredPrompt, onInstalled, onPromptUsed }) {
  const [copied, setCopied] = useState(false)
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose)
  const isiOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice?.outcome === 'accepted') onInstalled()
    onPromptUsed()
    onClose()
  }
  const share = async () => {
    const shareData = { title:'Extra Time', text:'Football memories, made wearable.', url:window.location.href }
    try {
      if (window.navigator.share) await window.navigator.share(shareData)
      else {
        await window.navigator.clipboard.writeText(window.location.href)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {}
  }
  return <div className={`install-sheet ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
    <button className="backdrop" onClick={onClose} aria-label="Close app install guide" tabIndex={-1}/>
    <section ref={panelRef} className="install-sheet__panel" role="dialog" aria-modal="true" aria-label="Add Extra Time to home screen" tabIndex={-1}>
      <div className="install-sheet__head"><span><b>90<sup>+</sup></b> APP MODE</span><IconButton label="Close" onClick={onClose}><X/></IconButton></div>
      <div className="install-sheet__body"><Download size={24}/><h2>Add Extra Time<br/>to your home screen</h2><p>Open it like an app with less browser chrome and faster access to your bag and custom orders.</p></div>
      {deferredPrompt ? <button className="install-sheet__primary" onClick={install}><Download size={16}/> ADD TO HOME SCREEN</button> : <div className="install-sheet__steps">
        <div><strong>1</strong><span>{isiOS ? 'Tap Share in Safari' : 'Open your browser menu'}</span></div>
        <div><strong>2</strong><span>Choose “Add to Home Screen” or “Install app”</span></div>
      </div>}
      <button className="install-sheet__share" onClick={share}><Share2 size={15}/>{copied ? 'LINK COPIED' : 'SHARE THIS PAGE'}</button>
      <small>The browser controls its address bar. Installed app mode is the cleanest full-screen experience available.</small>
    </section>
  </div>
}

function Home({ onQuickView, products, navigationProducts = [], theme, collections = [], onAdd }) {
  const featured = products.find(product => /after[- ]?90/i.test(`${product.handle || ''} ${product.name || ''}`)) || products[0]
  const customProduct = products.find(product => product.customFields?.length) || featuredCustomProduct || featured
  const primaryCollection = collections[0]
  const merchandised = primaryCollection ? sortCollectionProducts(products,primaryCollection).slice(0,10) : products.slice(0,10)
  const renderBlock = id => ({
    hero:<Hero key="hero" content={theme?.content} customProduct={customProduct}/>,
    'home-trust':<StorefrontTrust key="home-trust" variant="home" />,
    'home-path':<HomePath key="home-path" customProduct={customProduct}/>,
    drop:<DropFeature key="drop" product={featured}/>,
    rail:<ProductRail key="rail" title={<>BEST SELLERS.<br /><em>YOUR WAY.</em></>} subtitle="Fan favorites, ready to personalize." onQuickView={onQuickView} items={merchandised} products={products} className="product-section--starting"/>,
    story:<StoryExplorer key="story" product={featured}/>,
    players:<PlayerDiscovery key="players" customProduct={customProduct}/>,
    leagues:<LeagueDiscovery key="leagues" products={navigationProducts.length ? navigationProducts : products}/>,
    'custom-cta':<CustomTeaser key="custom-cta" product={customProduct} products={products} onAdd={onAdd}/>,
    'custom-options':<CustomOptions key="custom-options" product={customProduct} products={products} onAdd={onAdd}/>,
    quality:<QualityProof key="quality" product={featured}/>,
    community:<CommunityProof key="community"/>,
    faq:<HomeFaq key="faq"/>,
    vault:<VaultTeaser key="vault"/>,
    manifesto:<Manifesto key="manifesto"/>,
    newsletter:<Newsletter key="newsletter"/>
  }[id] || null)
  const configured = theme?.blocks?.length ? theme.blocks.filter(block => block.enabled !== false).map(block => block.id).filter(id => !['announcement','header','footer','quality','drop','home-path'].includes(id)) : ['hero','home-trust','leagues','rail','custom-options','players','community','faq','newsletter']
  const rawBlocks = configured.includes('leagues') ? configured : configured.flatMap(id => id === 'players' ? [id,'leagues'] : [id])
  // Keep the public homepage focused on discovery, personalization and trust.
  // The richer editorial modules remain available in the codebase/admin, but
  // they no longer delay the primary shopping path with duplicate imagery.
  const homeBlocks = rawBlocks.filter(id => !['quality','drop','home-path','players','community'].includes(id))
  if (!homeBlocks.includes('hero')) {
    homeBlocks.unshift('hero')
  }
  const categoryRows = navigationProducts.length ? navigationProducts : products
  const visibleCategories = CATALOG_CATEGORY_PAGES.filter(category => categoryRows.some(product => productMatchesCatalogCategory(product,category)))
  return <main className="home-page">{homeBlocks.map(renderBlock)}<nav className="home-category-index section" aria-label="Browse jersey and fan gear categories"><div><span>FIND YOUR PIECE</span><h2>SHOP BY<br />CATEGORY.</h2></div><div>{visibleCategories.map(category => <a key={category.handle} href={`/category/${category.handle}`} onClick={event => { event.preventDefault(); navigate(`/category/${category.handle}`) }}><span className="home-category-index__icon"><CategoryIcon kind={category.icon} size={22}/></span><span className="home-category-index__label">{category.label}</span><ArrowRight size={16}/></a>)}</div></nav></main>
}

function CollectionCover({ item, count, products = [] }) {
  const name = item?.name || item?.title || item?.handle || 'Collection'
  const candidate = [item?.hero, item?.hero_image].map(value => String(value || '').trim()).find(Boolean) || ''
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [candidate])
  const artwork = resolveCollectionArtwork(item, products, { ignoreExplicit:failed })
  const cover = artwork.src
  const countLabel = count ? `${count} ${count === 1 ? 'listing' : 'listings'}` : 'Coming soon'
  return <span className={`discovery-landing__collection-media${cover ? '' : ' is-pending'}`} data-cover-state={cover ? 'ready' : 'pending'}>
    {cover ? <img src={cover} alt={artwork.alt || `${name} collection`} loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <span className="discovery-landing__collection-placeholder" role="img" aria-label={`${name} collection icon`}><CategoryIcon kind={artwork.icon || 'all'} size={44}/><strong>{artwork.source === 'CATEGORY_ICON' ? 'Collection mark' : 'Collection artwork'}</strong><small>Logo or category icon</small></span>}
    <i className={cover ? '' : 'is-pending'}>{cover ? countLabel : `${countLabel} · icon`}</i>
  </span>
}

function CollectionAvatar({ collection, products = [] }) {
  const candidate = String(collection?.hero || collection?.hero_image || '').trim()
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [candidate])
  const artwork = resolveCollectionArtwork(collection, products, { ignoreExplicit:failed })
  if (artwork.src) return <div className="catalog-compact-bar__avatar"><img src={artwork.src} alt={artwork.alt || `${collection?.name || 'Collection'} mark`} loading="eager" decoding="async" onError={() => setFailed(true)}/></div>
  return <div className="catalog-compact-bar__avatar catalog-compact-bar__avatar--icon" title={artwork.alt || 'Collection mark'}><CategoryIcon kind={artwork.icon || 'all'} size={19}/></div>
}

function DiscoveryLanding({ kind, discovery, collections = [], products = [], onSearch }) {
  const leagues = discovery?.leagues || []
  const teams = discovery?.teams || []
  const groups = [...new Set(leagues.map(league => league.sport))]
  // The API already restricts this list to published collections. Empty
  // shells are kept addressable for editorial links, but are not shown in the
  // browse directory until they have at least one public listing.
  const curated = collections
    .filter(item => item?.handle)
    .filter(item => Number(item.publishedCount ?? item.count ?? item.products?.length ?? 0) > 0)
    .sort((a,b) => String(a.name || a.handle).localeCompare(String(b.name || b.handle)))
  const titles = {
    sports:['Choose a sport.', 'Follow your league into the teams and gear that matter to you.'],
    teams:['Find your team.', 'Search by club or browse the teams with published gear.'],
    collections:['Explore collections.', 'Curated edits appear here as they are released.']
  }
  const [title,description] = titles[kind]
  const [query,setQuery] = useState('')
  const [selectedLeague,setSelectedLeague] = useState('')
  const visibleTeams = teams.filter(team => !selectedLeague || team.leagueKey === selectedLeague).filter(team => `${team.name} ${team.leagueName}`.toLowerCase().includes(query.toLowerCase())).slice(0,80)
  return <main className="discovery-landing">
    <div className="discovery-landing__hero"><nav className="catalog-compact-bar__crumb" aria-label="Breadcrumb"><a href="/shop">Shop</a><span>/</span><strong>{kind}</strong></nav><h1>{title}</h1><p>{description}</p>{kind === 'teams' && <label className="discovery-landing__search"><Search size={17}/><span className="sr-only">Search teams</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search team or league" /></label>}</div>
    {kind === 'sports' && <div className="discovery-landing__groups">{groups.map(sport => <section key={sport}><h2>{sport}</h2><div>{leagues.filter(league => league.sport === sport).map(league => <a key={league.key} href={leaguePath(league)} onClick={event => { event.preventDefault(); navigate(leaguePath(league)) }}>{league.media?.src && <img src={league.media.src} alt="" loading="lazy"/>}<span>{league.name}</span><ArrowRight size={17}/></a>)}</div></section>)}</div>}
    {kind === 'teams' && <><div className="discovery-landing__league-tabs" aria-label="Browse teams by league"><button className={!selectedLeague ? 'is-active' : ''} onClick={() => setSelectedLeague('')}>All teams</button>{leagues.map(league => <button key={league.key} className={selectedLeague === league.key ? 'is-active' : ''} onClick={() => setSelectedLeague(league.key)}>{league.name}</button>)}</div><div className="discovery-landing__teams">{visibleTeams.map(team => <a key={team.href} href={team.href} onClick={event => { event.preventDefault(); navigate(team.href) }}>{team.media?.src && <img src={team.media.src} alt="" loading="lazy"/>}<span><strong>{team.name}</strong><small>{team.leagueName}</small></span><ArrowRight size={15}/></a>)}{!visibleTeams.length && <p>No team matches that search. Try a league or a shorter name.</p>}</div></>}
    {kind === 'collections' && <div className="discovery-landing__collections">{curated.length ? curated.map(item => {
      const count = Number(item.publishedCount ?? item.count ?? item.products?.length ?? 0)
      return <a key={item.handle} className="discovery-landing__collection-card" href={'/collection/' + item.handle} onClick={event => { event.preventDefault(); navigate('/collection/' + item.handle) }}>
        <CollectionCover item={item} count={count} products={products}/>
        <span className="discovery-landing__collection-copy"><strong>{item.name || item.handle}</strong>{item.description && <small>{item.description}</small>}</span><ArrowRight size={17}/>
      </a>
    }) : <div><p>No editorial collections are published yet. Browse the live catalog by sport, team or product type.</p><a href="/shop" onClick={event => { event.preventDefault(); navigate('/shop') }}>Browse all gear <ArrowRight size={15}/></a></div>}</div>}
  </main>
}

function Shop({ onQuickView, products, collection = null, category = null, page = 1, pagination = null, discovery = null, onSearch, loading = false }) {
  const [mobileCols, setMobileCols] = useMobileCols()
  const params = new URLSearchParams(window.location.search)
  const pageSize = CATALOG_PAGE_SIZE
  const [color, setColor] = useState(params.get('color')?.toUpperCase() || 'ALL')
  const [sizeFilter, setSizeFilter] = useState(params.get('size')?.toUpperCase() || 'ALL')
  const [teamFilter, setTeamFilter] = useState(params.get('team')?.toLowerCase() || 'ALL')
  const [priceFilter, setPriceFilter] = useState(params.get('price')?.toUpperCase() || 'ALL')
  const [group, setGroup] = useState(params.get('group') || 'ALL')
  const [customOnly, setCustomOnly] = useState(params.get('custom') === '1')
  const [inStock, setInStock] = useState(params.get('stock') === '1')
  const [typeFilter, setTypeFilter] = useState(params.get('type') || 'ALL')
  const [sort, setSort] = useState(params.get('sort') || 'FEATURED')
  const searchQuery = params.get('search') || params.get('q') || ''
  const sportFilter = params.get('sport') || ''
  const leagueFilter = params.get('league') || ''
  const brandFilter = params.get('brand') || ''
  const sports = [...new Set((discovery?.leagues || []).map(item => item.sport))]
  const availableLeagues = (discovery?.leagues || []).filter(item => !sportFilter || item.sport.toLowerCase() === sportFilter.toLowerCase())
  const brands = discovery?.brands || []
  const setDiscoveryFacet = (key,value) => {
    const url = new URL(window.location.href)
    value ? url.searchParams.set(key,value) : url.searchParams.delete(key)
    if (key === 'sport') { url.searchParams.delete('league'); url.searchParams.delete('team') }
    if (key === 'league') url.searchParams.delete('team')
    navigate(url.pathname + url.search)
  }
  const CatalogHeading = !category && !collection && page === 1 ? 'h2' : 'h1'
  const routeBasePath = parseCatalogPagePath(window.location.pathname).basePath
  const autoCatalog = useAutoCatalog({ initialProducts:products, pagination, basePath:routeBasePath, collectionHandle:collection?.handle || '', search:window.location.search.slice(1), enabled:Boolean(pagination?.server && !loading) })
  const catalogProducts = autoCatalog.items
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  const filterStateRef = useRef([color,sizeFilter,teamFilter,priceFilter,group,customOnly,inStock,typeFilter,sort].join('|'))
  useDialogFocus(filterOpen, filterRef, () => setFilterOpen(false))
  const routeProducts = category
    ? catalogProducts.filter(product => productMatchesCatalogCategory(product, category))
    : collection ? (pagination?.server ? catalogProducts : sortCollectionProducts(catalogProducts,collection)) : catalogProducts
  const baseProducts = searchQuery.trim().length >= 2
    ? routeProducts.filter(product => matchesDiscoveryQuery(product, searchQuery))
    : routeProducts
  const productColours = product => {
    const name = optionNameLike(product,['color','colour'])
    return name ? [...new Set(product.variants.flatMap(variant => variant.values?.[name] || []))] : [product.color].filter(Boolean)
  }
  const productSizes = product => {
    const name = optionNameLike(product,['size'])
    return name ? [...new Set(product.variants.filter(v => Number(v.inventory || 0) > 0).flatMap(variant => variant.values?.[name] || []))] : []
  }
  const colours = ['ALL', ...new Set(baseProducts.flatMap(productColours).map(value => String(value).toUpperCase()))]
  const sizes = ['ALL', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
  const groups = ['ALL', ...(discovery?.productGroups?.length ? discovery.productGroups : [...new Set(baseProducts.map(product => product.productGroup).filter(Boolean))])]

  const teamOptions = useMemo(() => {
    if (discovery?.teams?.length) {
      if (!leagueFilter && !sportFilter) return []
      const allowed = new Set(availableLeagues.map(item => item.key))
      return discovery.teams.filter(item => !leagueFilter || item.leagueKey === leagueFilter).filter(item => !sportFilter || allowed.has(item.leagueKey)).map(item => ({ slug:item.slug, label:item.name }))
    }
    const map = new Map()
    baseProducts.forEach(p => {
      const vals = productTaxonomyValues(p)
      const t = vals.team || p.team || p.taxonomy?.team || p.teamCity
      if (t) {
        const slug = String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const label = String(t).replace(/-/g, ' ').toUpperCase()
        if (!map.has(slug)) map.set(slug, { slug, label, count: 0 })
        map.get(slug).count += 1
      }
    })
    LEAGUE_TAXONOMY.forEach(league => {
      league.teams.forEach(team => {
        const count = baseProducts.filter(p => productMatchesTaxonomy(p, { team: team.slug })).length
        if (count > 0 && !map.has(team.slug)) {
          map.set(team.slug, { slug: team.slug, label: team.name, count })
        }
      })
    })
    return Array.from(map.values())
  }, [baseProducts,discovery,leagueFilter,sportFilter])

  const PRICE_OPTIONS = [
    { id: 'ALL', label: 'ALL PRICES', test: () => true },
    { id: 'UNDER_90', label: 'UNDER $90', test: p => Number(p.price || 0) < 90 },
    { id: '90_100', label: '$90 – $100', test: p => Number(p.price || 0) >= 90 && Number(p.price || 0) <= 100 },
    { id: 'OVER_100', label: 'OVER $100', test: p => Number(p.price || 0) > 100 }
  ]

  let shown = baseProducts.filter(product => {
    if (color !== 'ALL' && !productColours(product).some(value => String(value).toUpperCase() === color)) return false
    if (sizeFilter !== 'ALL' && !productSizes(product).some(value => canonicalSize(value).toUpperCase() === sizeFilter)) return false
    if (teamFilter !== 'ALL') {
      const matches = productMatchesTaxonomy(product, { team: teamFilter }) ||
        String(product.team || '').toLowerCase() === teamFilter ||
        String(product.taxonomy?.team || '').toLowerCase() === teamFilter ||
        String(product.teamCity || '').toLowerCase().includes(teamFilter) ||
        String(product.name || '').toLowerCase().includes(teamFilter.replace(/-/g, ' '))
      if (!matches) return false
    }
    if (priceFilter !== 'ALL') {
      const matchPrice = PRICE_OPTIONS.find(opt => opt.id === priceFilter)?.test(product)
      if (!matchPrice) return false
    }
    if (group !== 'ALL' && product.productGroup !== group) return false
    if (typeFilter !== 'ALL' && !String(product.type || '').toLowerCase().includes(typeFilter.toLowerCase())) return false
    if (customOnly && !product.customFields?.length) return false
    if (inStock && !(product.variants || []).some(variant => Number(variant.inventory || 0) > 0)) return false
    return true
  })
  shown = sort === 'FEATURED' && collection && !pagination?.server ? sortCollectionProducts(shown,collection) : [...shown].sort((a,b) => sort === 'PRICE LOW' ? a.price-b.price : sort === 'PRICE HIGH' ? b.price-a.price : sort === 'NEWEST' ? String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) : 0)
  const serverPaginated = Boolean(autoCatalog.hasMore || autoCatalog.loadedPage > 1 || pagination?.server)
  const totalPages = serverPaginated ? Math.max(1,Math.ceil(Number(pagination?.total || 0) / pageSize)) : Math.max(1, Math.ceil(shown.length / pageSize))
  const currentPage = Math.max(1, Math.min(page, totalPages))
  const pagedProducts = serverPaginated ? shown : shown.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const clientFiltered = sizeFilter !== 'ALL' || inStock
  const resultCount = clientFiltered ? shown.length : serverPaginated ? Number(pagination?.total || shown.length) : shown.length

  useEffect(() => {
    const next = new URL(window.location.href)
    const fingerprint = [color,sizeFilter,teamFilter,priceFilter,group,customOnly,inStock,typeFilter,sort].join('|')
    const changed = fingerprint !== filterStateRef.current
    filterStateRef.current = fingerprint
    const set = (key,value,empty) => value === empty ? next.searchParams.delete(key) : next.searchParams.set(key,value)
    set('color',color,'ALL'); set('size',sizeFilter,'ALL'); set('team',teamFilter,'ALL'); set('price',priceFilter,'ALL'); set('group',group,'ALL'); set('type',typeFilter,'ALL'); set('sort',sort,'FEATURED')
    customOnly ? next.searchParams.set('custom','1') : next.searchParams.delete('custom')
    inStock ? next.searchParams.set('stock','1') : next.searchParams.delete('stock')
    if (changed && page > 1) next.pathname = parseCatalogPagePath(next.pathname).basePath
    window.history.replaceState({},'',next.pathname + next.search)
    if (changed) window.dispatchEvent(new PopStateEvent('popstate'))
  }, [color,sizeFilter,teamFilter,priceFilter,group,typeFilter,customOnly,inStock,sort])

  const clear = () => { setColor('ALL'); setSizeFilter('ALL'); setTeamFilter('ALL'); setPriceFilter('ALL'); setGroup('ALL'); setTypeFilter('ALL'); setCustomOnly(false); setInStock(false); const url = new URL(window.location.href); ['sport','league','brand','search','q'].forEach(key => url.searchParams.delete(key)); navigate(url.pathname + url.search) }
  const activeCount = Number(color !== 'ALL') + Number(sizeFilter !== 'ALL') + Number(teamFilter !== 'ALL') + Number(priceFilter !== 'ALL') + Number(group !== 'ALL') + Number(typeFilter !== 'ALL') + Number(customOnly) + Number(inStock) + Number(Boolean(sportFilter)) + Number(Boolean(leagueFilter)) + Number(Boolean(brandFilter)) + Number(searchQuery.trim().length >= 2)
  const isRootShop = !category && !collection && page === 1
  const filterBar = (
    <div className="filter-bar">
      <div className="desktop-filters">
        <button type="button" className="shop-all-filters" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={14}/> ALL FILTERS{activeCount ? ` · ${activeCount}` : ''}</button>
        <label className="catalog-select">SPORT<select value={sportFilter} onChange={event => setDiscoveryFacet('sport',event.target.value)}><option value="">ALL SPORTS</option>{sports.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={13}/></label>
        <label className="catalog-select">LEAGUE<select value={leagueFilter} onChange={event => setDiscoveryFacet('league',event.target.value)}><option value="">ALL LEAGUES</option>{availableLeagues.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select><ChevronDown size={13}/></label>
        {teamOptions.length > 0 && <label className="catalog-select">TEAM<select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="ALL">ALL TEAMS</option>{teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}</select><ChevronDown size={13}/></label>}
        <label className="catalog-select">PRODUCT<select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item} value={item}>{item === 'ALL' ? 'ALL PRODUCTS' : item}</option>)}</select><ChevronDown size={13}/></label>
        <button className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}><Sparkles size={13}/> CUSTOM</button>
      </div>
      <button className="mobile-filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/> FILTER{activeCount ? ` · ${activeCount}` : ''}</button>
      <div className="mobile-grid-toggle" aria-label="Display mode">
        <button type="button" className={`grid-toggle-btn ${mobileCols === 1 ? 'is-active' : ''}`} onClick={() => setMobileCols(1)} aria-label="1 product per row" title="1 Column"><Square size={15} /></button>
        <button type="button" className={`grid-toggle-btn ${mobileCols === 2 ? 'is-active' : ''}`} onClick={() => setMobileCols(2)} aria-label="2 products per row" title="2 Columns"><Grid2X2 size={15} /></button>
      </div>
      <label>SORT <select value={sort} onChange={event => setSort(event.target.value)}><option>FEATURED</option><option>NEWEST</option><option>PRICE LOW</option><option>PRICE HIGH</option></select><ChevronDown size={15}/></label>
    </div>
  )
  const activeFilterMarkup = activeCount > 0 && <div className={`active-filters${isRootShop ? ' active-filters--unified' : ''}`}>
    {searchQuery.trim().length >= 2 && <button onClick={() => { const url = new URL(window.location.href); url.searchParams.delete('search'); url.searchParams.delete('q'); navigate(url.pathname + url.search) }}>SEARCH: {searchQuery.trim()} <X size={12}/></button>}
    {sportFilter && <button onClick={() => setDiscoveryFacet('sport','')}>SPORT: {sportFilter} <X size={12}/></button>}
    {leagueFilter && <button onClick={() => setDiscoveryFacet('league','')}>LEAGUE: {availableLeagues.find(item => item.key === leagueFilter)?.name || leagueFilter} <X size={12}/></button>}
    {brandFilter && <button onClick={() => setDiscoveryFacet('brand','')}>BRAND: {brandFilter} <X size={12}/></button>}
    {color !== 'ALL' && <button onClick={() => setColor('ALL')}>{color} <X size={12}/></button>}
    {sizeFilter !== 'ALL' && <button onClick={() => setSizeFilter('ALL')}>SIZE: {sizeFilter} <X size={12}/></button>}
    {teamFilter !== 'ALL' && <button onClick={() => setTeamFilter('ALL')}>TEAM: {teamOptions.find(t => t.slug === teamFilter)?.label || teamFilter.toUpperCase()} <X size={12}/></button>}
    {priceFilter !== 'ALL' && <button onClick={() => setPriceFilter('ALL')}>PRICE: {PRICE_OPTIONS.find(o => o.id === priceFilter)?.label || priceFilter} <X size={12}/></button>}
    {group !== 'ALL' && <button onClick={() => setGroup('ALL')}>{group} <X size={12}/></button>}
    {typeFilter !== 'ALL' && <button onClick={() => setTypeFilter('ALL')}>{typeFilter} <X size={12}/></button>}
    {customOnly && <button onClick={() => setCustomOnly(false)}>CUSTOM <X size={12}/></button>}
    {inStock && <button onClick={() => setInStock(false)}>IN STOCK <X size={12}/></button>}
    <button onClick={clear}>CLEAR ALL</button>
  </div>

  // Accessories use a deliberate two-level browse path. The landing page
  // exposes the eight departments; each department exposes only its own
  // product types. On a type route, keep the department link visible so a
  // shopper can move back up without reopening the full mega menu.
  const accessoryBrowseLinks = (() => {
    if (!category) return []
    if (category.handle === 'accessories') {
      return ACCESSORY_CATEGORY_PAGES.filter(item => item.level === 'family')
    }
    if (!category.accessoryFamily) return []
    const familyPage = ACCESSORY_CATEGORY_PAGES.find(item => item.level === 'family' && item.accessoryFamily === category.accessoryFamily)
    const typePages = ACCESSORY_CATEGORY_PAGES.filter(item => item.level === 'type' && item.accessoryFamily === category.accessoryFamily && item.handle !== category.handle)
    return [familyPage, ...typePages].filter(Boolean)
  })()
  const accessoryBrowseLabel = category?.handle === 'accessories'
    ? 'Browse by department'
    : category?.accessoryType
      ? `More ${category.accessoryFamily}`
      : 'Browse this department'

  return (
    <main className="shop-page">
      <div className={`shop-catalog-shell${isRootShop ? ' shop-catalog-shell--root' : ''}`}>
      {isRootShop && <ShopDiscoveryHub discovery={discovery} onSearch={onSearch} searchValue={searchQuery} total={activeCount ? resultCount : (pagination?.total ?? discovery?.total ?? catalogProducts.length)} controls={filterBar} activeFilters={activeFilterMarkup} />}
      {!isRootShop && <section className="catalog-compact-bar" id="all-products" aria-label={category?.label || collection?.name || 'Shop catalog'}>
        <div className="catalog-compact-bar__main">
          {collection ? <CollectionAvatar collection={collection} products={catalogProducts}/> : <div className="catalog-compact-bar__avatar catalog-compact-bar__avatar--icon"><CategoryIcon kind={category?.icon || 'all'} size={19} /></div>}
          <div className="catalog-compact-bar__title-group">
            <nav className="catalog-compact-bar__crumb" aria-label="Breadcrumb">
              <button type="button" onClick={() => navigate('/shop')}>SHOP</button>
              {(collection || category) && (
                <>
                  <span aria-hidden="true">/</span>
                  <strong aria-current="page">{category?.label || collection.name}</strong>
                </>
              )}
            </nav>
            <CatalogHeading className="catalog-compact-bar__title">{(category?.label || collection?.name || 'ALL GEAR').toUpperCase()}</CatalogHeading>
          </div>
        </div>
        <div className="catalog-compact-bar__side">
          <span className="catalog-compact-bar__badge">{loading && !products.length ? 'Loading products…' : `${resultCount} ${resultCount === 1 ? 'PRODUCT' : 'PRODUCTS'}`}</span>
        </div>
      </section>}
      {!isRootShop && category && <section className={`category-intro section${accessoryBrowseLinks.length ? ' category-intro--accessories' : ''}`}><p>{category.description}</p>{accessoryBrowseLinks.length ? <div className="category-intro__browse"><span>{accessoryBrowseLabel}</span><nav aria-label={accessoryBrowseLabel}>{accessoryBrowseLinks.map(item => <a key={item.handle} href={`/category/${item.handle}`} onClick={event => { event.preventDefault(); navigate(`/category/${item.handle}`) }}><CategoryIcon kind={item.icon} size={15}/>{item.label}<ArrowRight size={13}/></a>)}</nav></div> : <nav aria-label="Related product categories">{CATALOG_CATEGORY_PAGES.filter(item => item.handle !== category.handle && products.some(product => productMatchesCatalogCategory(product,item))).slice(0,5).map(item => <a key={item.handle} href={`/category/${item.handle}`} onClick={event => { event.preventDefault(); navigate(`/category/${item.handle}`) }}><CategoryIcon kind={item.icon} size={15}/>{item.label}<ArrowRight size={13}/></a>)}</nav>}</section>}
      {!isRootShop && <div className="shop-catalog-shell__trust"><StorefrontTrust compact /></div>}
      <div className={`shop-layout${isRootShop ? ' shop-layout--root' : ''}`}>
      {!isRootShop && <aside className="shop-sidebar" aria-label="Filter products"><h2>Filter gear</h2><p>Choose a sport, then narrow to a league and team.</p><label>Sport<select value={sportFilter} onChange={event => setDiscoveryFacet('sport',event.target.value)}><option value="">All sports</option>{sports.map(sport => <option key={sport} value={sport}>{sport}</option>)}</select></label><label>League<select value={leagueFilter} onChange={event => setDiscoveryFacet('league',event.target.value)}><option value="">All leagues</option>{availableLeagues.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label>Team<select value={teamFilter === 'ALL' ? '' : teamFilter} disabled={!teamOptions.length} onChange={event => setTeamFilter(event.target.value || 'ALL')}><option value="">{teamOptions.length ? 'All teams' : 'Choose a sport first'}</option>{teamOptions.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label><label>Product type<select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item} value={item}>{item === 'ALL' ? 'All product types' : item}</option>)}</select></label><label>Brand<select value={brandFilter} onChange={event => setDiscoveryFacet('brand',event.target.value)}><option value="">All brands</option>{brands.map(brand => <option key={brand}>{brand}</option>)}</select></label><label>Price<select value={priceFilter} onChange={event => setPriceFilter(event.target.value)}>{PRICE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button type="button" className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}>Customizable {customOnly ? '✓' : ''}</button><button type="button" className="shop-sidebar__clear" onClick={clear}>Clear filters</button></aside>}
      <div className="shop-layout__results">
      {!isRootShop && <>
      <div className="filter-bar">
        <div className="desktop-filters">
          <span>FILTER</span>
          {colours.slice(0,5).map(item => <button key={item} className={color === item ? 'is-active' : ''} onClick={() => setColor(item)}>{item}</button>)}
          <label className="catalog-select">SIZE<select value={sizeFilter} onChange={event => setSizeFilter(event.target.value)}>{sizes.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label>
          {teamOptions.length > 0 && <label className="catalog-select">TEAM<select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="ALL">ALL TEAMS</option>{teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}</select><ChevronDown size={13}/></label>}
          <label className="catalog-select">PRICE<select value={priceFilter} onChange={event => setPriceFilter(event.target.value)}>{PRICE_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select><ChevronDown size={13}/></label>
          <label className="catalog-select">GROUP<select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label>
          <label className="catalog-select">TYPE<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="ALL">ALL</option><option value="PERSONALIZED">PERSONALIZED</option><option value="READY">READY TO SHIP</option></select><ChevronDown size={13}/></label>
          <button className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}>CUSTOM</button>
          <button className={inStock ? 'is-active' : ''} onClick={() => setInStock(value => !value)}>IN STOCK</button>
        </div>
        <button className="mobile-filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/> FILTER{activeCount ? ` · ${activeCount}` : ''}</button>
        <div className="mobile-grid-toggle" aria-label="Display mode">
          <button
            type="button"
            className={`grid-toggle-btn ${mobileCols === 1 ? 'is-active' : ''}`}
            onClick={() => setMobileCols(1)}
            aria-label="1 product per row"
            title="1 Column"
          >
            <Square size={15} />
          </button>
          <button
            type="button"
            className={`grid-toggle-btn ${mobileCols === 2 ? 'is-active' : ''}`}
            onClick={() => setMobileCols(2)}
            aria-label="2 products per row"
            title="2 Columns"
          >
            <Grid2X2 size={15} />
          </button>
        </div>
        <label>SORT <select value={sort} onChange={event => setSort(event.target.value)}><option>FEATURED</option><option>NEWEST</option><option>PRICE LOW</option><option>PRICE HIGH</option></select><ChevronDown size={15}/></label>
      </div>
      {activeCount > 0 && <div className="active-filters">
        {color !== 'ALL' && <button onClick={() => setColor('ALL')}>{color} <X size={12}/></button>}
        {sizeFilter !== 'ALL' && <button onClick={() => setSizeFilter('ALL')}>SIZE: {sizeFilter} <X size={12}/></button>}
        {teamFilter !== 'ALL' && <button onClick={() => setTeamFilter('ALL')}>TEAM: {teamOptions.find(t => t.slug === teamFilter)?.label || teamFilter.toUpperCase()} <X size={12}/></button>}
        {priceFilter !== 'ALL' && <button onClick={() => setPriceFilter('ALL')}>PRICE: {PRICE_OPTIONS.find(o => o.id === priceFilter)?.label || priceFilter} <X size={12}/></button>}
        {group !== 'ALL' && <button onClick={() => setGroup('ALL')}>{group} <X size={12}/></button>}
        {typeFilter !== 'ALL' && <button onClick={() => setTypeFilter('ALL')}>{typeFilter} <X size={12}/></button>}
        {customOnly && <button onClick={() => setCustomOnly(false)}>CUSTOM <X size={12}/></button>}
        {inStock && <button onClick={() => setInStock(false)}>IN STOCK <X size={12}/></button>}
        <button onClick={clear}>CLEAR ALL</button>
      </div>}
      </>}
      <section className="shop-grid section">{loading && !shown.length ? <div className="shop-grid-loading" role="status">Loading current gear…</div> : <>{shown.length ? <div className={`product-grid is-col-${mobileCols}`}>{pagedProducts.map(product => <ProductCard key={product.id} product={product} onQuickView={onQuickView}/>)}</div> : !autoCatalog.hasMore && <div className="catalog-empty"><span>90+</span><h2>No listing matches these filters.</h2><button onClick={clear}>Clear filters</button></div>}<AutoCatalogSentinel catalog={autoCatalog} label={category?.label || collection?.name || 'gear'}/></>}</section>
      </div></div>
      </div>
      {filterOpen && <div className="filter-sheet__backdrop" onClick={() => setFilterOpen(false)} aria-hidden="true"/>}
      <div ref={filterRef} className={`filter-sheet ${filterOpen ? 'is-open' : ''}`} aria-hidden={!filterOpen} inert={!filterOpen} role="dialog" aria-modal="true" aria-label="Filter products" tabIndex={-1}>
        <div className="filter-sheet__header"><h2>FILTER</h2><IconButton label="Close filters" onClick={() => setFilterOpen(false)}><X/></IconButton></div>
        <div className="filter-sheet__body">
          <p>SPORT</p><label className="filter-sheet__select"><select value={sportFilter} onChange={event => setDiscoveryFacet('sport',event.target.value)}><option value="">ALL SPORTS</option>{sports.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>
          <p>LEAGUE</p><label className="filter-sheet__select"><select value={leagueFilter} onChange={event => setDiscoveryFacet('league',event.target.value)}><option value="">ALL LEAGUES</option>{availableLeagues.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select><ChevronDown size={14}/></label>
          {teamOptions.length > 0 && <><p>TEAM</p><label className="filter-sheet__select"><select value={teamFilter === 'ALL' ? '' : teamFilter} onChange={event => setTeamFilter(event.target.value || 'ALL')}><option value="">ALL TEAMS</option>{teamOptions.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select><ChevronDown size={14}/></label></>}
          <p>BRAND</p><label className="filter-sheet__select"><select value={brandFilter} onChange={event => setDiscoveryFacet('brand',event.target.value)}><option value="">ALL BRANDS</option>{brands.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>
          <p>COLOUR</p>
          <div className="filter-sheet__colours">{colours.map(item => <button key={item} className={color === item ? 'is-active' : ''} onClick={() => setColor(item)}>{item}<span>{item === 'ALL' ? baseProducts.length : baseProducts.filter(product => productColours(product).some(value => String(value).toUpperCase() === item)).length}</span></button>)}</div>
          <p>SIZE</p>
          <div className="filter-sheet__sizes">{sizes.map(item => <button key={item} type="button" className={sizeFilter === item ? 'is-active' : ''} onClick={() => setSizeFilter(item)}><strong>{item}</strong><span>{item === 'ALL' ? baseProducts.length : baseProducts.filter(product => productSizes(product).some(v => canonicalSize(v).toUpperCase() === item)).length}</span></button>)}</div>
          {teamOptions.length > 0 && <><p>TEAM / CLUB</p><label className="filter-sheet__select"><select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="ALL">ALL TEAMS</option>{teamOptions.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}</select><ChevronDown size={14}/></label></>}
          <p>PRICE RANGE</p>
          <div className="filter-sheet__prices">{PRICE_OPTIONS.map(opt => <button key={opt.id} type="button" className={priceFilter === opt.id ? 'is-active' : ''} onClick={() => setPriceFilter(opt.id)}><span>{opt.label}</span><small>{opt.id === 'ALL' ? baseProducts.length : baseProducts.filter(opt.test).length}</small></button>)}</div>
          <p>PRODUCT GROUP</p>
          <label className="filter-sheet__select"><select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label>
          <p>PRODUCT TYPE</p>
          <label className="filter-sheet__select"><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="ALL">ALL</option><option value="PERSONALIZED">PERSONALIZED</option><option value="READY">READY TO SHIP</option></select><ChevronDown size={14}/></label>
          <div className="filter-sheet__toggles">
            <button className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}>CUSTOMIZABLE <span>{customOnly ? 'ON' : 'OFF'}</span></button>
            <button className={inStock ? 'is-active' : ''} onClick={() => setInStock(value => !value)}>IN STOCK <span>{inStock ? 'ON' : 'OFF'}</span></button>
          </div>
        </div>
        <div className="filter-sheet__footer"><button className="button button--dark" onClick={() => setFilterOpen(false)}>SHOW {shown.length} PRODUCTS</button></div>
      </div>
      <Newsletter/>
    </main>
  )
}

function SizeFinder({ open, onClose, onRecommend, product = null, sizeOptionName = 'Size', selections = {} }) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose)
  const audienceOption = useMemo(() => findAudienceOption(product), [product])
  const audiences = useMemo(() => sizeFinderAudiences(product), [product])
  const initialAudience = audienceOption && selections[audienceOption.name]
    ? selections[audienceOption.name]
    : audiences[0]?.value || 'Adult / Unisex'
  const initialProfile = sizeProfile(initialAudience)
  const [audience, setAudience] = useState(initialAudience)
  const [height, setHeight] = useState(initialProfile.defaultHeight)
  const [weight, setWeight] = useState(initialProfile.defaultWeight)
  const [fit, setFit] = useState('RELAXED')
  const profile = sizeProfile(audience)
  const availableSizes = useMemo(() => availableFinderSizes(product, {
    sizeOptionName,
    selections,
    audienceOptionName:audienceOption?.name || '',
    audienceValue:audience
  }), [product,sizeOptionName,selections,audienceOption?.name,audience])
  const recommendation = recommendCatalogSize({ audience, heightCm:height, weightKg:weight, fit, availableSizes })
  useEffect(() => {
    if (!open) return
    const value = audienceOption && selections[audienceOption.name] ? selections[audienceOption.name] : audiences[0]?.value || 'Adult / Unisex'
    const nextProfile = sizeProfile(value)
    setAudience(value)
    setHeight(nextProfile.defaultHeight)
    setWeight(nextProfile.defaultWeight)
    setFit('RELAXED')
  }, [open,product?.id,audienceOption?.name])
  const chooseAudience = value => {
    const nextProfile = sizeProfile(value)
    setAudience(value)
    setHeight(nextProfile.defaultHeight)
    setWeight(nextProfile.defaultWeight)
  }
  const apply = () => {
    if (!recommendation) return
    onRecommend?.({ size:recommendation, audienceOptionName:audienceOption?.name || '', audienceValue:audience })
    onClose()
  }
  return (
    <div className={`size-modal ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}><button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close size finder" tabIndex={-1}/><div ref={panelRef} className="size-modal__panel" role="dialog" aria-modal="true" aria-label="Find my size" tabIndex={-1}><div className="drawer-head"><h2>FIND MY SIZE</h2><IconButton label="Close" onClick={onClose}><X/></IconButton></div><div className="size-finder__intro"><Ruler size={17}/><p>Start with height and weight, then confirm against the garment measurements. We only suggest sizes available for this variation.</p></div>{audiences.length > 1 && <div className="size-audience"><span><UsersRound size={14}/> WHO IS IT FOR?</span><div>{audiences.map(item => <button key={item.value} className={audience === item.value ? 'is-active' : ''} onClick={() => chooseAudience(item.value)}>{item.label}</button>)}</div></div>}<label>HEIGHT <strong>{height} CM</strong><input type="range" min={profile.minHeight} max={profile.maxHeight} value={height} onChange={event => setHeight(Number(event.target.value))}/></label><label>WEIGHT <strong>{weight} KG</strong><input type="range" min={profile.minWeight} max={profile.maxWeight} value={weight} onChange={event => setWeight(Number(event.target.value))}/></label><div className="fit-toggle"><span>PREFERRED FIT</span>{['ATHLETIC', 'RELAXED'].map(item => <button className={fit === item ? 'is-active' : ''} key={item} onClick={() => setFit(item)}>{item}</button>)}</div><div className="size-result"><span>SUGGESTED STARTING SIZE</span><strong>{recommendation ? canonicalSize(recommendation) : '—'}</strong><p>{recommendation ? `${profile.label} · ${height} cm / ${weight} kg · ${fit.toLowerCase()} fit.` : 'No in-stock size matches the options selected on this product.'}</p><small>{availableSizes.length ? `Available now: ${availableSizes.map(canonicalSize).join(' · ')}` : 'Change the wearer or another variation to see available sizes.'}</small></div>{onRecommend ? <button className="button button--dark" disabled={!recommendation} onClick={apply}>{recommendation ? `CHOOSE SIZE ${canonicalSize(recommendation)}` : 'NO SIZE AVAILABLE'}</button> : <button className="button button--dark" onClick={onClose}>CLOSE GUIDE</button>}</div></div>
  )
}

function CustomFieldControl({ field, value, assetRef, onChange, productId, preview, onLogoPreview }) {
  const [uploading,setUploading] = useState(false)
  const [processing,setProcessing] = useState('')
  const [error,setError] = useState('')
  const common = { value:value || '', onChange:event => onChange(event.target.value), placeholder:field.placeholder || '', maxLength:field.maxLength || undefined, required:field.required }
  const upload = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try {
      const result = await uploadCustomerReference(file,productId,field.key,field.type)
      onChange(result.imageUrl,result.storage)
      if(field.type === 'logo' && !field.studioReviewRequired){
        setProcessing('exact')
        const exact = await createExactLogoPreview({productId,fieldKey:field.key,assetRef:result.storage,treatment:field.logoTreatment || 'EXACT'})
        onLogoPreview?.(exact,field)
      }
    }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Upload failed.') }
    finally { setUploading(false);setProcessing('');event.target.value='' }
  }
  const aiFinish = async event => {
    event.preventDefault()
    if(!assetRef){setError('Upload a logo first.');return}
    setProcessing('ai');setError('')
    try { const result=await createAiLogoPreview({productId,fieldKey:field.key,assetRef,treatment:field.logoTreatment === 'EXACT' ? 'FABRIC' : field.logoTreatment});onLogoPreview?.(result,field) }
    catch(caught){setError(caught instanceof Error?caught.message:'AI logo finish failed. The exact placement is still available.')}
    finally{setProcessing('')}
  }
  if(field.type === 'logo') return <div className="is-wide pdp-logo-field"><span>{field.label}{field.required&&<b>Required</b>}<small>{field.help||'Private customer logo'}</small></span><div className="pdp-logo-upload">{value?<img src={value} alt={`${field.label} uploaded logo`}/>:<div className="pdp-logo-upload__mark">90+</div>}<div><strong>{uploading?'Preparing logo…':processing==='exact'?'Building exact placement…':value?'Logo ready':'Upload your badge'}</strong><small>PNG, SVG, JPG or WebP · max 8 MB</small>{value&&<em>Background normalized · proportions preserved</em>}</div><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={`Upload ${field.label || 'team logo'}`} disabled={Boolean(uploading||processing)} onChange={upload}/></div>{field.studioReviewRequired&&<div className="pdp-logo-review-note"><Lock size={13}/><span>Studio review required. Placement will be confirmed before production.</span></div>}{value&&<button type="button" className="pdp-logo-remove" onClick={() => { onChange('',null);setError('') }}>Remove logo</button>}{preview?.fieldKey===field.key&&<div className="pdp-logo-preview"><img src={preview.imageUrl} alt="Logo placed in the approved artwork area"/><span><strong>{preview.mode==='ai-logo-finish'?'AI fabric finish':'Exact logo placement'}</strong><small>{preview.mode==='ai-logo-finish'?'Original logo overlaid and locked':'Production-safe placement'}</small></span></div>}{value&&field.allowAiFinish!==false&&!field.studioReviewRequired&&<button type="button" className="pdp-logo-ai" disabled={Boolean(processing||uploading)} onClick={aiFinish}><Sparkles size={14}/><span><strong>{processing==='ai'?'Applying fabric finish…':'Try AI fabric finish'}</strong><small>Only the approved logo area can change.</small></span><ArrowRight size={14}/></button>}{error&&<em className="pdp-logo-error">{error}</em>}</div>
  return <label className={field.type === 'textarea' || field.type === 'photo' ? 'is-wide' : ''}><span>{field.label}{field.required && <b>Required</b>}<small>{field.maxLength ? `${(value || '').length}/${field.maxLength}` : field.help || 'Customer detail'}</small></span>{field.type === 'textarea' ? <textarea {...common}/> : field.type === 'select' ? <select {...common}><option value="">Choose…</option>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select> : field.type === 'photo' ? <div className="pdp-custom__photo">{value && <img src={value} alt={`${field.label} reference`}/>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/><strong>{uploading ? 'Uploading reference…' : value ? 'Replace photo' : 'Upload photo'}</strong><small>JPG, PNG or WebP · max 2 MB</small>{error && <em>{error}</em>}</div> : <input {...common} type="text" inputMode={field.type === 'number' ? 'numeric' : 'text'}/>}</label>
}

function productCommerceConfig(product) {
  const source = product?.commerce || product?.merchandising || {}
  const delivery = product?.delivery || source.delivery || {}
  const print = product?.printTechnology || source.printTechnology || {}
  const printTitle = String(print.title || '')
  const printCopy = String(print.copy || '')
  const printNote = String(print.note || '')
  const configuredOffers = Array.isArray(product?.bulkOffers)
    ? product.bulkOffers
    : Array.isArray(source.bulkOffers)
      ? source.bulkOffers
      : DEFAULT_QUANTITY_DISCOUNT_POLICY
  const headwear = isHeadwearProduct(product)
  return {
    print: {
      title: headwear ? 'SEE EVERY ANGLE. CHOOSE YOUR FIT.' : !printTitle || /design-led print detail|production note/i.test(printTitle) ? 'PERFORMANCE FABRIC. PRINT THAT LASTS.' : printTitle,
      copy: headwear ? 'Use the product gallery to review the visible color and design. Choose from the fit or size options listed for this hat before checkout.' : !printCopy || /designer-defined print area|artwork stays fixed/i.test(printCopy) ? 'Breathable performance jersey fabric uses durable full-colour sublimation for sharp colour that stays part of the garment. Names, numbers and requested artwork are checked for placement, contrast and legibility before production.' : printCopy,
      note: headwear ? 'Product photos · listed fit options · checkout confirmation' : !printNote || /70\s*%|30\s*%|artwork locked|personal layer/i.test(printNote) ? 'Breathable knit · sublimated colour · custom quality check' : printNote
    },
    delivery: {
      production: delivery.production || '3–5 business days',
      transit: delivery.transit || '5–8 business days',
      shippingLabel: delivery.shippingLabel || 'FREE US SHIPPING OVER $100'
    },
    bulkOffers: normalizeQuantityDiscountPolicy(configuredOffers)
  }
}

function ProductPurchaseHighlights({ product, personalized = false }) {
  const config = productCommerceConfig(product)
  const offers = config.bulkOffers
  const estimate = buildDeliveryEstimate(config.delivery)
  const headwear = isHeadwearProduct(product)
  return <section className="pdp-highlights" id="pdp-highlights" aria-label="Product delivery and purchase highlights">
    <article className="pdp-highlight-card pdp-highlight-card--delivery" id="pdp-delivery-timeline">
      <div className="pdp-highlight-card__eyebrow">
        <PackageCheck size={17}/>
        <span>{headwear ? 'SHIPPING & DELIVERY' : 'ESTIMATED DELIVERY'}</span>
        <span className={`pdp-highlight-badge ${personalized ? 'is-personalized' : ''}`}>
          {headwear ? 'HEADWEAR' : personalized ? 'CUSTOM ARTWORK' : 'STANDARD JERSEY'}
        </span>
      </div>
      <h2>{headwear ? 'CONFIRM THE DETAILS AT CHECKOUT.' : 'FROM ORDER TO YOUR DOOR.'}</h2>
      {headwear ? <p className="pdp-estimate-note">Shipping options, charges and the delivery estimate are confirmed for your address at checkout. Tracking is available after the carrier accepts the order.</p> : <><div className="pdp-delivery-track" aria-label="Order, production and delivery timeline">
        <div className="is-current"><i/><strong>ORDERED</strong><span>{estimate.ordered}</span><small>{estimate.orderCutoff}</small></div>
        <div className={personalized ? 'is-active-step' : ''}><i/><strong>{personalized ? 'CUSTOM CRAFT' : 'PRODUCTION'}</strong><span>{estimate.production}</span><small>{personalized ? 'Studio review & print' : estimate.productionDays}</small></div>
        <div><i/><strong>DELIVERY</strong><span>{estimate.delivered}</span><small>Estimated arrival</small></div>
      </div>
      <div className="pdp-shipping-pill"><Globe2 size={16}/><strong>{config.delivery.shippingLabel}</strong></div>
      <p className="pdp-estimate-note">{personalized ? 'Timeline includes custom name & number review by the studio. Orders placed today start processing immediately.' : 'Estimate for orders placed today. Weekends, holidays and destination can change the final date shown at checkout.'}</p></>}
    </article>
    <article className="pdp-highlight-card pdp-highlight-card--bundle pdp-highlight-card--featured">
      <div className="pdp-highlight-card__eyebrow"><Tag size={17}/><span>QUANTITY SAVINGS</span></div>
      <h2>ADD A PIECE.<br/>KEEP MORE.</h2>
      <p className="pdp-highlight-card__lead">Add another eligible piece and the best tier is applied automatically at checkout. Member pricing is still protected; benefits do not stack into an unsafe price.</p>
      {offers.length ? (
        <div className="pdp-bundle-grid">{offers.slice(0, 4).map(offer => <div key={`${offer.minQty}-${offer.discountPercent}`} className={offer.featured ? 'is-featured' : ''}><span>{quantityDiscountLabel(offer)}</span><strong>{offer.discountPercent}% off</strong></div>)}</div>
      ) : (
        <a className="pdp-team-quote" href="mailto:support@jersevo.com?subject=Team%20order%20quote"><span><strong>GET TEAM PRICING</strong><small>Availability and the final group price are confirmed before checkout.</small></span><ArrowRight size={16}/></a>
      )}
    </article>
    <article className="pdp-highlight-card pdp-highlight-card--dark">
      <div className="pdp-highlight-card__eyebrow"><Sparkles size={16}/><span>{headwear ? 'PRODUCT DETAILS' : 'JERSEVO PRINT & BUILD'}</span></div>
      <h2>{config.print.title}</h2>
      <p>{config.print.copy}</p>
      <span className="pdp-highlight-card__note">{config.print.note}</span>
    </article>
  </section>
}

function ProductContentBlocks({ product }) {
  if (!product.contentBlocks?.length) return <section className="pdp-editorial-fallback"><img src={product.image} alt={product.alt}/><details><summary><Sparkles size={16}/><span><small>THE DESIGN STORY</small><strong>{product.subtitle || product.name}</strong></span><Plus/></summary><p>{product.description || product.story}</p></details></section>
  const media = new Map((product.media || []).map(item => [item.id,item]))
  const mediaRoles = new Map((product.media || []).map(item => [listingMediaRole(item),item]).filter(([role]) => role))
  return <section className="pdp-content"><details className="pdp-content__details"><summary><Sparkles size={16}/><span><small>PRODUCT STORY</small><strong>{product.name}</strong></span><Plus/></summary><div className="pdp-content__body">{product.contentBlocks.map(block => {
    const asset = media.get(block.mediaId) || mediaRoles.get(block.mediaRole)
    const url = block.url || asset?.url
    if (block.type === 'heading') return <h2 key={block.id}>{block.content}</h2>
    if (block.type === 'paragraph') return <p key={block.id}>{block.content}</p>
    if (block.type === 'quote') return <blockquote key={block.id}>{block.content}</blockquote>
    if (block.type === 'image' && url) return <figure key={block.id}><img src={url} alt={asset?.alt || `${product.name} story detail`}/>{block.content && <figcaption>{block.content}</figcaption>}</figure>
    if (block.type === 'video' && url) return <video key={block.id} src={url} controls preload="metadata"/>
    return null
  })}</div></details></section>
}

function ProductStorySignals({ product }) {
  const seo = product.seo || {}
  const valueProps = Array.isArray(seo.valueProps) ? seo.valueProps.filter(Boolean).slice(0, 6) : []
  const differentiators = Array.isArray(seo.differentiators) ? seo.differentiators.filter(Boolean).slice(0, 6) : []
  if (!valueProps.length && !differentiators.length) return null
  return <section className="pdp-story-signals"><details><summary><ShieldCheck size={16}/><span><small>PRODUCT PROOF</small><strong>Value in the details</strong></span><Plus/></summary><div className="pdp-story-signals__groups">{valueProps.length > 0 && <div><span>VALUE / WHAT YOU RECEIVE</span>{valueProps.map((item, index) => <article key={`value-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><p>{item}</p></article>)}</div>}{differentiators.length > 0 && <div><span>DIFFERENCE / WHAT MAKES IT DISTINCT</span>{differentiators.map((item, index) => <article key={`difference-${index}`}><b>{String(index + 1).padStart(2, '0')}</b><p>{item}</p></article>)}</div>}</div></details></section>
}

function ProductPage({ product, products, onAdd, onQuickView, startPersonalized = false, account }) {
  const savedDraft = readSession(`extra-time-pdp-draft-${product.id}`, {})
  const savedAi = readSession('extra-time-ai-preview')
  const initialPreview = savedAi?.productId === product.id && (!savedAi.expiresAt || savedAi.expiresAt > Date.now()) ? savedAi : null
  const customFields = product.customFields || []
  const options = product.options || []
  const sizeName = optionNameLike(product,['size'])
  const headwear = isHeadwearProduct(product)
  const customIntent = Boolean(customFields.length && (startPersonalized || new URLSearchParams(window.location.search).get('custom') === '1' || initialPreview))
  const initial = { ...(savedDraft?.selections || {}) }
  // Merchant Center links each size/color offer to the same PDP with a stable
  // variant query parameter. Resolve it before the saved browser draft so a
  // shopper arriving from a product listing sees the advertised variation.
  const requestedVariantId = new URLSearchParams(window.location.search).get('variant')
  const requestedVariant = requestedVariantId ? (product.variants || []).find(variant => String(variant.id) === requestedVariantId) : null
  if (sizeName && savedDraft?.size) initial[sizeName] = savedDraft.size
  if (requestedVariant?.values) Object.assign(initial, requestedVariant.values)
  const [selections,setSelections] = useState(() => {
    const next = initialSelections(product,initial)
    options.forEach(option => { if (option.values.length === 1) next[option.name] = option.values[0] })
    if (customIntent) {
      // Entering from the Custom shortcut should never leave the save CTA
      // waiting on an empty size/colour state. Preserve compatible saved
      // choices, then complete them from the first in-stock combination.
      const available = (product.variants || []).filter(variant => variant.status === 'ACTIVE' && Number(variant.inventory || 0) > 0)
      const matching = available.find(variant => Object.entries(next).every(([name,value]) => variant.values?.[name] === value)) || available[0]
      if (matching?.values) Object.assign(next, matching.values)
    }
    return next
  })
  const [galleryIndex,setGalleryIndex] = useState(0)
  const [finder,setFinder] = useState(false)
  const [attachedPreview,setAttachedPreview] = useState(initialPreview)
  const [personalized,setPersonalized] = useState(customIntent)
  const [customValues,setCustomValues] = useState(() => {
    const initialValues = { ...(savedDraft?.values || {}) }
    const searchParams = new URLSearchParams(window.location.search)
    const urlName = searchParams.get('name')
    const urlNumber = searchParams.get('number')
    let homeCustom = {}
    try { homeCustom = JSON.parse(window.sessionStorage.getItem('jersevo_home_custom') || '{}') } catch {}
    const finalName = urlName || (!initialValues.name ? homeCustom.name : null)
    const finalNumber = urlNumber || (!initialValues.number ? homeCustom.number : null)
    if (finalName) initialValues.name = String(finalName).toUpperCase().slice(0, 12)
    if (finalNumber) initialValues.number = String(finalNumber).replace(/\D/g, '').slice(0, 2)
    return initialValues
  })
  const [assetRefs,setAssetRefs] = useState(savedDraft?.assetRefs || {})
  const [customNote,setCustomNote] = useState(savedDraft?.note || '')
  const [requestKey,setRequestKey] = useState(savedDraft?.requestKey || `request_${globalThis.crypto.randomUUID().replace(/-/g,'')}`)
  const [customError,setCustomError] = useState('')
  const [submitting,setSubmitting] = useState(false)
  const [added,setAdded] = useState(false)
  const [logoConsent,setLogoConsent] = useState(Boolean(savedDraft?.logoConsent))
  const previewReadiness = productPreviewReadiness(customFields)
  const hasStructuredPreview = previewReadiness.enabled
  const hasUploadedLogo = customFields.some(field => field.type === 'logo' && customValues[field.key])
  const completeSelection = options.every(option => selections[option.name])
  const selectedVariant = completeSelection ? (product.variants || []).find(variant => options.every(option => variant.values?.[option.name] === selections[option.name])) : options.length ? null : product.variants?.[0]
  const displayVariant = selectedVariant || resolveVariant(product,selections) || product.variants?.find(variant => Number(variant.inventory || 0) > 0) || product.variants?.[0]
  const currentPrice = Number(displayVariant?.price ?? product.price)
  const currentCompare = displayVariant?.compareAt ?? product.compareAt
  const commerceConfig = productCommerceConfig(product)
  const bulkOffers = commerceConfig.bulkOffers || []
  const estimate = buildDeliveryEstimate(commerceConfig.delivery)
  const soldOut = selectedVariant ? Number(selectedVariant.inventory || 0) < 1 : false
  const selectionSummary = options.map(option => selections[option.name] ? (option.name === sizeName ? canonicalSize(selections[option.name]) : selections[option.name]) : '').filter(Boolean).join(' · ')
  const swatchColor = value => ({black:'#111111',white:'#eeeeea',chalk:'#eeeeea',oxblood:'#711e25',red:'#b52b2b',blue:'#244c89',navy:'#15233d',green:'#315c43',purple:'#5f3a78'}[String(value).toLowerCase()] || String(value))
  useEffect(() => { if (startPersonalized && customFields.length) setPersonalized(true) }, [startPersonalized,customFields.length])
  useEffect(() => {
    if (product) trackViewContent(product, displayVariant)
  }, [product?.id, displayVariant?.id])
  useEffect(() => {
    try { window.sessionStorage.setItem(`extra-time-pdp-draft-${product.id}`, JSON.stringify({ values:customValues,assetRefs,note:customNote,selections,requestKey,logoConsent })) } catch {}
  }, [product.id,customValues,assetRefs,customNote,selections,requestKey,logoConsent])
  const chooseOrderType = enabled => {
    setPersonalized(enabled); setCustomError(''); setAdded(false)
    const url = new URL(window.location.href)
    enabled ? url.searchParams.set('custom','1') : url.searchParams.delete('custom')
    window.history.replaceState({},'',url.pathname + url.search + url.hash)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  const chooseOption = (name,value) => { setSelections(current => ({...current,[name]:value})); setAdded(false); setCustomError('') }
  const updateCustom = (field,rawValue,assetRef = null) => {
    const value = field.type === 'number' ? String(rawValue).replace(/\D/g,'') : String(rawValue)
    setCustomValues(current => ({...current,[field.key]:['photo','logo'].includes(field.type) ? value : value.slice(0,field.maxLength || 500)})); setCustomError(''); setAdded(false)
    if(['photo','logo'].includes(field.type))setAssetRefs(current => assetRef ? {...current,[field.key]:assetRef} : Object.fromEntries(Object.entries(current).filter(([key])=>key!==field.key)))
    if(field.type === 'logo'){
      setLogoConsent(false)
      setAttachedPreview(current => current?.fieldKey === field.key ? null : current)
    }
  }
  const attachLogoPreview=(result,field)=>{const preview={productId:product.id,fieldKey:field.key,previewId:result.previewId,imageUrl:result.imageUrl,storage:result.storage,prompt:result.direction||`${field.label}: verified customer logo`,mode:result.mode,expiresAt:Date.now()+Number(result.expiresIn||86400)*1000};setAttachedPreview(preview);setGalleryIndex(0);setAdded(false);try{window.sessionStorage.setItem('extra-time-ai-preview',JSON.stringify(preview))}catch{}}
  const openAi = () => {
    try {
      window.sessionStorage.setItem(`extra-time-pdp-draft-${product.id}`, JSON.stringify({
        values: customValues,
        assetRefs,
        note: customNote,
        selections,
        requestKey,
        logoConsent
      }))
    } catch {}
    navigate(`/studio?product=${product.handle || product.id}`)
  }
  const [previewingAi, setPreviewingAi] = useState(false)
  const previewWithAi = async () => {
    const hasValues = Object.values(customValues).some(v => String(v || '').trim())
    if (!hasValues) {
      setCustomError('Add a player name, number or custom detail first.')
      return
    }
    setPreviewingAi(true); setCustomError('')
    try {
      const response = await apiFetch('/api/ai-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getCustomerSessionId(),
          productId: product.id,
          values: customValues
        })
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Visual preview generation failed.')
      const preview = {
        productId: product.id,
        previewId: body.previewId,
        imageUrl: body.imageUrl,
        storage: body.storage,
        prompt: body.direction || body.summary || Object.entries(customValues).map(([k,v]) => `${k}: ${v}`).join('; '),
        mode: 'exact-image-edit',
        values: customValues,
        expiresAt: Date.now() + Number(body.expiresIn || 86400) * 1000
      }
      setAttachedPreview(preview)
      setGalleryIndex(0)
      setAdded(false)
      try {
        window.sessionStorage.setItem('extra-time-ai-preview', JSON.stringify(preview))
        window.sessionStorage.setItem(`extra-time-pdp-draft-${product.id}`, JSON.stringify({
          values: customValues, assetRefs, note: customNote, selections, requestKey, logoConsent
        }))
      } catch {}
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Visual preview generation failed.')
    } finally {
      setPreviewingAi(false)
    }
  }
  const add = async () => {
    if (!selectedVariant) { if (!headwear && sizeName && !selections[sizeName]) setFinder(true); else setCustomError('Choose every product option before adding to your bag.'); return }
    if (soldOut) { setCustomError('This variation is sold out. Choose another option.'); return }
    if (!personalized) { onAdd(product,{variant:selectedVariant,options:selections}); setAdded(true); return }
    const missing = customFields.filter(field => field.required && !String(customValues[field.key] || '').trim())
    if (missing.length) { setCustomError(`Complete: ${missing.map(field => field.label).join(', ')}.`); return }
    const fields = Object.fromEntries(customFields.map(field => [field.key,String(customValues[field.key] || '').trim()]))
    const hasLogo=customFields.some(field=>field.type==='logo'&&fields[field.key])
    if(hasLogo&&!logoConsent){setCustomError('Confirm that you own or have permission to use the uploaded logo.');return}
    if (!Object.values(fields).some(Boolean) && !customNote.trim() && !attachedPreview) { setCustomError('Add at least one detail, a studio note, or a visual preview.'); return }
    setSubmitting(true); setCustomError('')
    let requestId = null
    try {
      const result = await createCustomizationOrder({ sessionId:getCustomerSessionId(),idempotencyKey:requestKey,productId:product.id,variantId:selectedVariant.id,fields,assetRefs,note:customNote.trim(),aiPreviewId:attachedPreview?.previewId || null,aiPreviewUrl:attachedPreview?.imageUrl || null,aiPrompt:attachedPreview?.prompt || null,logoConsent })
      requestId = result?.data?.id || null
    } catch(caught) {
      setCustomError(caught instanceof Error ? caught.message : 'The custom request could not be saved. Please retry.')
      setSubmitting(false)
      return
    }
    const customization = { requestId, fields, note:customNote.trim(), aiPreviewUrl:attachedPreview?.imageUrl || null, aiPrompt:attachedPreview?.prompt || null, hasLogo, logoConsent }
    onAdd({...product,image:attachedPreview?.imageUrl || displayVariant?.image || product.image},{variant:selectedVariant,options:selections,customization})
    setAdded(true)
    setRequestKey(`request_${globalThis.crypto.randomUUID().replace(/-/g,'')}`)
    setSubmitting(false)
  }
  const media = (product.media?.length ? product.media : [{id:'primary',type:'IMAGE',url:product.image,alt:product.alt}]).filter(item => item.url)
  const gallery = attachedPreview
    ? [{id:attachedPreview.previewId || 'custom-preview',type:'IMAGE',url:attachedPreview.imageUrl,alt:`${product.name} personalized preview`,isAi:true},...media]
    : media
  const galleryRef = useRef(null)
  const scrollGalleryTo = (index) => {
    if (galleryRef.current) {
      const width = galleryRef.current.clientWidth || 1
      galleryRef.current.scrollTo({ left: index * width, behavior: 'smooth' })
      setGalleryIndex(index)
    }
  }
  const prevImage = (e) => {
    e?.stopPropagation?.()
    const target = galleryIndex > 0 ? galleryIndex - 1 : gallery.length - 1
    scrollGalleryTo(target)
  }
  const nextImage = (e) => {
    e?.stopPropagation?.()
    const target = galleryIndex < gallery.length - 1 ? galleryIndex + 1 : 0
    scrollGalleryTo(target)
  }
  useEffect(() => {
    setGalleryIndex(0)
    if (galleryRef.current) {
      galleryRef.current.scrollTo({ left: 0, behavior: 'auto' })
    }
  }, [product.id, attachedPreview?.imageUrl])
  const taxonomy = productTaxonomyValues(product)
  const productLeague = findLeague(taxonomy.league)
  const productTeam = productLeague ? findTeam(productLeague.key, taxonomy.team) : null
  return <main className="pdp">
    <div className="pdp-breadcrumb-wrap"><Breadcrumbs items={[{ label:'Shop', href:'/shop' }, ...(productLeague ? [{ label:productLeague.name, href:leaguePath(productLeague) }] : []), ...(productTeam ? [{ label:productTeam.name, href:teamPath(productLeague.key,productTeam) }] : []), { label:product.name }]}/></div>
    <div className="pdp__commerce">
      <div className="pdp__gallery-wrapper">
        <button className="pdp__back" onClick={() => navigate('/shop')}><ArrowLeft size={15}/> BACK TO THE DROP</button>
        <div className="pdp__gallery-stage">
          <div
            ref={galleryRef}
            className="pdp__gallery"
            tabIndex={0}
            aria-label={`${product.name} gallery`}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft') prevImage(event)
              else if (event.key === 'ArrowRight') nextImage(event)
            }}
            onScroll={event => {
              const width = event.currentTarget.clientWidth || 1
              const idx = Math.round(event.currentTarget.scrollLeft / width)
              if (idx !== galleryIndex && idx >= 0 && idx < gallery.length) {
                setGalleryIndex(idx)
              }
            }}
          >
            {gallery.map((item,index) => (
              <figure key={`${item.id}-${index}`} className={item.isAi ? 'pdp__gallery-ai' : ''}>
                {item.type === 'VIDEO' ? (
                  <video src={item.url} controls preload="metadata"/>
                ) : (
                  <div className="pdp__gallery-img-wrap">
                    <img
                      src={item.url}
                      alt={item.alt || `${product.name} view ${index+1}`}
                      width={item.width || undefined}
                      height={item.height || undefined}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      decoding="async"
                    />
                    {item.isAi && <span className="pdp__gallery-ai-badge"><Sparkles size={11}/> AI PREVIEW</span>}
                  </div>
                )}
                <span className="pdp__gallery-slide-tag">{String(index+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span>
              </figure>
            ))}
          </div>

          {gallery.length > 1 && (
            <>
              <button
                type="button"
                className="pdp__gallery-arrow pdp__gallery-arrow--prev"
                onClick={prevImage}
                aria-label="Previous product image"
              >
                <ChevronLeft size={20}/>
              </button>
              <button
                type="button"
                className="pdp__gallery-arrow pdp__gallery-arrow--next"
                onClick={nextImage}
                aria-label="Next product image"
              >
                <ChevronRight size={20}/>
              </button>
            </>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="pdp__gallery-thumbs" role="tablist" aria-label="Product image thumbnails">
            {gallery.map((item,index) => (
              <button
                key={`thumb-${item.id}-${index}`}
                type="button"
                role="tab"
                aria-selected={galleryIndex === index}
                aria-label={`View image ${index + 1}`}
                className={`pdp__gallery-thumb ${galleryIndex === index ? 'is-active' : ''}`}
                onClick={() => scrollGalleryTo(index)}
              >
                {item.type === 'VIDEO' ? (
                  <span className="pdp__gallery-thumb-video">▶</span>
                ) : (
                  <img src={item.url} alt="" loading="lazy"/>
                )}
                {item.isAi && <span className="pdp__gallery-thumb-ai" title="AI Preview">✦</span>}
              </button>
            ))}
          </div>
        )}

        <div className="pdp__gallery-meta"><span>{String(galleryIndex+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span><span>SWIPE TO EXPLORE</span></div>
      </div>
      <aside className="pdp__info">
        {product.badge && <p className="product-badge static">{product.badge}</p>}<h1>{product.name}</h1><p className="pdp__story">{product.story}</p>{product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}        <div className="pdp__price">
          <strong>{money(currentPrice)}</strong>
          {currentCompare > currentPrice && (
            <>
              <del>{money(Number(currentCompare))}</del>
              <span className="pdp__discount-tag">SAVE {Math.round((1 - currentPrice / Number(currentCompare)) * 100)}%</span>
            </>
          )}
        </div>
        {bulkOffers.length > 0 && (
          <div className="pdp__discounts-row" aria-label="Volume discounts">
            <span className="pdp__discounts-title"><Tag size={13}/> BULK SAVINGS:</span>
            <div className="pdp__discounts-items">
              {bulkOffers.slice(0, 4).map(offer => (
                <span key={`${offer.minQty}-${offer.discountPercent}`} className={`pdp__discount-chip ${offer.featured ? 'is-featured' : ''}`}>
                  {quantityDiscountLabel(offer)}: <b>-{offer.discountPercent}%</b>
                </span>
              ))}
            </div>
          </div>
        )}
        <button className="pdp__club" onClick={()=>navigate('/membership')}><Ticket size={18}/><span><small>90+ CLUB BENEFIT</small><strong>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'Your member price is ready':'SAVE 20–40% ON ELIGIBLE PIECES'}</strong><em>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'The secure member price is calculated in your bag.':'Member pricing plus eligible standard-shipping benefits.'}</em></span><ArrowRight size={16}/></button>
        {options.map(option => { const swatch = ['color','colour'].includes(option.name.toLowerCase()); const isSize = option.name === sizeName; const displayValue = value => isSize ? canonicalSize(value) : value; const values = isSize ? sortSizes(option.values) : option.values; return <div className="option-block" key={option.name}><div><span>{option.name.toUpperCase()}</span>{isSize && !headwear && <button onClick={() => setFinder(true)}>FIND MY SIZE</button>}<strong>{selections[option.name] ? displayValue(selections[option.name]) : 'Choose'}</strong></div><div className={swatch ? 'swatches swatches--dynamic' : 'sizes'}>{values.map(value => { const other = Object.fromEntries(Object.entries(selections).filter(([name]) => name !== option.name)); const available=availableOptionValue(product,option.name,value,other); return <button key={value} disabled={!available} className={`${selections[option.name] === value ? 'is-active' : ''} ${swatch ? 'dynamic-swatch' : ''}`} style={swatch ? {'--swatch':swatchColor(value)} : undefined} aria-label={`${option.name} ${displayValue(value)}${available ? '' : ' unavailable'}`} onClick={() => chooseOption(option.name,value)}>{swatch ? <span>{value}</span> : displayValue(value)}</button> })}</div></div> })}
        {selectedVariant && <p className={`pdp-stock ${soldOut ? 'is-out' : Number(selectedVariant.inventory) <= 5 ? 'is-low' : ''}`}><i/>{soldOut ? 'Sold out' : Number(selectedVariant.inventory) <= 5 ? `Only ${selectedVariant.inventory} left` : 'In stock'}</p>}
       {customFields.length > 0 && <section className={`pdp-custom ${personalized ? 'is-open' : ''}`}><div className="pdp-custom__choice" aria-label="Order type"><button type="button" className={`pdp-custom__choice-btn pdp-custom__choice-btn--standard ${!personalized ? 'is-active' : ''}`} onClick={() => chooseOrderType(false)}><span className="pdp-custom__choice-title">Standard</span><small className="pdp-custom__choice-sub">Clean blank jersey as shown</small></button><button type="button" className={`pdp-custom__choice-btn pdp-custom__choice-btn--personalized ${personalized ? 'is-active' : ''}`} onClick={() => chooseOrderType(true)}><span className="pdp-custom__choice-badge"><Sparkles size={10}/> POPULAR CHOICE</span><span className="pdp-custom__choice-title"><Sparkles size={14} className="pdp-custom__choice-sparkle"/> Personalized</span><small className="pdp-custom__choice-sub">{customFields.slice(0,2).map(field => field.label).join(' + ')}{customFields.length > 2 ? ' + more' : ''} (Free)</small></button></div>{personalized && <div className="pdp-custom__body"><div className="pdp-custom__intro"><span><Lock size={14}/> DESIGNER ARTWORK STAYS FIXED</span><p>Only the fields enabled for this listing can change.</p></div><div className="pdp-custom__fields">{customFields.map(field => <CustomFieldControl key={field.id || field.key} field={field} value={customValues[field.key]} assetRef={assetRefs[field.key]} preview={attachedPreview} onLogoPreview={attachLogoPreview} onChange={(value,assetRef) => updateCustom(field,value,assetRef)} productId={product.id}/>)}</div>{hasUploadedLogo&&<label className="pdp-logo-consent"><input type="checkbox" checked={logoConsent} onChange={event=>{setLogoConsent(event.target.checked);setCustomError('');setAdded(false)}}/><span><strong>I own this logo or have permission to use it.</strong><small>Customer-supplied artwork stays private to this request and does not imply team or league affiliation.</small></span></label>}<label className="pdp-custom__note"><span>Note to the studio <small>Optional</small></span><textarea value={customNote} onChange={event => {setCustomNote(event.target.value.slice(0,500));setCustomError('');setAdded(false)}} placeholder="Placement, spelling or anything the studio should confirm…"/><small>{customNote.length}/500</small></label>{attachedPreview && <div className="pdp-custom__ai-ready"><Sparkles size={15}/><span><strong>{attachedPreview.mode?.includes('logo')?'Logo preview attached':'Visual preview attached'}</strong><small>Stored securely and reviewed before production.</small></span><img src={attachedPreview.imageUrl} alt="Attached personalisation preview"/></div>}<button className={`pdp-custom__ai ${hasStructuredPreview ? '' : 'is-unavailable'}`} onClick={previewWithAi} disabled={!hasStructuredPreview || previewingAi} title={hasStructuredPreview ? 'Render your personal details directly onto this jersey.' : 'Personalization will be reviewed manually by the studio.'}><Sparkles size={18} className="pdp-custom__ai-icon"/><span><strong>{previewingAi ? 'RENDERING CUSTOM JERSEY…' : hasStructuredPreview ? (attachedPreview ? 'UPDATE & REVIEW CUSTOM JERSEY' : 'REVIEW WITH CUSTOM JERSEY') : 'VISUAL PREVIEW AWAITING SETUP'}</strong><small>{previewingAi ? 'Analyzing jersey design & applying custom details…' : hasStructuredPreview ? (attachedPreview ? 'Click to re-render preview with your latest changes.' : 'Instant AI mockup · See your customized name & number on this jersey live') : 'Personalization will be reviewed manually by the studio.'}</small></span><span className="pdp-custom__ai-action">{hasStructuredPreview ? <ArrowRight size={17}/> : <Lock size={16}/>}</span></button><button type="button" className="pdp-custom__studio-link" onClick={openAi}><Sparkles size={12}/> Edit with AI in Studio</button>{customError && <p className="pdp-custom__error" role="alert">{customError}</p>}</div>}</section>}
        <button className={`pdp__add ${added ? 'is-added' : ''}`} onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING CUSTOM REQUEST…' : added ? <><Check size={17}/> ADDED TO BAG</> : !selectedVariant ? 'CHOOSE OPTIONS TO ADD' : soldOut ? 'SOLD OUT' : `${personalized ? 'ADD PERSONALIZED' : 'ADD TO BAG'} — ${money(currentPrice)}`}</button>
        <div className="pdp__trust-line" aria-label="Checkout and order assurances"><span><Lock size={14}/> Secure checkout</span><span><PackageCheck size={14}/> Tracked delivery</span><span><ShieldCheck size={14}/> {personalized ? 'Custom checked' : 'Quality checked'}</span></div>
        {headwear ? <div className="pdp-delivery-badge" aria-label="Delivery information"><div className="pdp-delivery-badge__top"><div className="pdp-delivery-badge__title"><Truck size={15} className="pdp-delivery-badge__icon"/><span>DELIVERY ESTIMATE AT CHECKOUT</span></div></div><div className="pdp-delivery-badge__details"><span>Shipping options and timing are confirmed before payment.</span></div></div> : <div className="pdp-delivery-badge" aria-label="Estimated delivery timing">
          <div className="pdp-delivery-badge__top">
            <div className="pdp-delivery-badge__title">
              <Truck size={15} className="pdp-delivery-badge__icon" />
              <span>ESTIMATED ARRIVAL: <strong>{estimate.delivered}</strong></span>
            </div>
            <a
              href="#pdp-delivery-timeline"
              className="pdp-delivery-badge__link"
              onClick={e => {
                const target = document.getElementById('pdp-delivery-timeline')
                if (target) {
                  e.preventDefault()
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
            >
              <span>Timeline</span>
              <ArrowDown size={11} />
            </a>
          </div>
          <div className="pdp-delivery-badge__details">
            <span className="pdp-delivery-badge__mode">
              <i className="pdp-delivery-badge__pulse" />
              {personalized ? (
                <>Personalized: Custom craft in <strong>{estimate.productionDays}</strong></>
              ) : (
                <>Standard: Dispatch in <strong>{estimate.productionDays}</strong></>
              )}
            </span>
            <span className="pdp-delivery-badge__shipping">
              <Globe2 size={11} /> {commerceConfig.delivery.shippingLabel}
            </span>
          </div>
        </div>}
        <div className="pdp__essentials"><details><summary><Globe2 size={16}/><span>Shipping & returns</span><Plus size={16}/></summary><div><p><strong>Shipping</strong>US orders over $100 receive free standard shipping. The final destination quote appears before payment.</p><p><strong>Returns</strong>Standard pieces can be returned within 30 days. Personalized pieces follow the approved custom request.</p></div></details><details><summary><CircleHelp size={16}/><span>Product, fit & care</span><Plus size={16}/></summary><div><p><strong>Product</strong>{product.description || (headwear ? 'Review product photos and listed details.' : 'A performance jersey made for match-day stories and personal details.')}</p><p><strong>Fit & care</strong>{headwear ? 'Choose a listed fit or size option and follow the care label supplied with the product.' : 'Confirm the suggested size against garment measurements. Wash inside out on a cool cycle and hang dry.'}</p></div></details></div>
      </aside>
    </div>
    <ProductPurchaseHighlights product={product} personalized={personalized}/><ProductContentBlocks product={product}/><ProductStorySignals product={product}/>
    <ProductRail title="MORE FROM THIS COLLECTION" subtitle="Explore related teams and styles." items={relatedProducts(product,products,8)} onQuickView={onQuickView}/>
    {!headwear && <SizeFinder open={finder} onClose={() => setFinder(false)} product={product} sizeOptionName={sizeName || 'Size'} selections={selections} onRecommend={({size,audienceOptionName,audienceValue}) => { setSelections(current => ({...current,...(audienceOptionName ? {[audienceOptionName]:audienceValue} : {}),...(sizeName ? {[sizeName]:size} : {})})); setAdded(false); setCustomError('') }}/>}
    <div className="mobile-sticky-atc"><div className="mobile-sticky-atc__product"><img src={displayVariant?.image || product.image} alt=""/><span><strong>{money(currentPrice)}</strong><small>{selectedVariant ? `${selectionSummary} · ${personalized ? 'Personalized' : 'Standard'}` : 'Choose options'}</small></span></div><button onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING…' : added ? 'ADDED' : selectedVariant ? (personalized ? 'ADD CUSTOM' : 'BUY NOW') : 'CHOOSE OPTIONS'}</button></div>
  </main>
}

function VaultPage() {
  const archives = [
    ['2025', 'THE LONG WALK', 'A jersey about leaving the tunnel for the last time.', '/assets/hero-tunnel.webp'],
    ['2024', 'HOME AFTER DARK', 'Made from the sound of a wet five-a-side court.', '/assets/editorial-player.webp'],
    ['2023', 'FIRST TOUCH', 'Our first study of football memory.', '/assets/jersey-white.webp']
  ]
  return (
    <main className="vault-page">
      <section className="vault-page__hero"><p>THE ARCHIVE / 2023—2026</p><h1>THE<br />VAULT.</h1><span>Every drop leaves a story.<br />Some never return.</span></section>
      <section className="vault-page__list">{archives.map((item,index) => <article key={item[0]}><span>{item[0]}</span><img src={item[3]} alt=""/><div><p>SOLD OUT FOREVER / 0{index+1}</p><h2>{item[1]}</h2><span>{item[2]}</span><ButtonLink light onClick={() => navigate('/shop')}>EXPLORE CURRENT DROP</ButtonLink></div></article>)}</section>
      <Newsletter/>
    </main>
  )
}


function AboutPage() {
  return <main className="about-page">
    <div className="about-breadcrumb-wrap"><Breadcrumbs items={[{ label:'About the studio' }]}/></div><section className="about-hero"><div className="about-hero__copy"><span>EXTRA TIME / THE STUDIO</span><h1>Football memories,<br /><em>made wearable.</em></h1><p>Extra Time is an independent fan-apparel studio for the moments that stay after the final whistle. We build small-batch jerseys, considered personalization and stories with a point of view.</p><div className="about-hero__actions"><button className="button button--acid" onClick={() => navigate('/shop')}>SHOP THE DROP <ArrowRight size={16}/></button><button className="button-link" onClick={() => navigate('/shipping')}>READ THE TRUST DESK <ArrowRight size={16}/></button></div></div><figure className="about-hero__media"><img src="/assets/hero-tunnel.webp" alt="Football player walking through a lit stadium tunnel before a match." loading="eager" fetchPriority="high" decoding="async"/><figcaption><span>FIELD NOTE / 001</span><strong>The moment before the noise.</strong></figcaption></figure></section>
    <section className="about-principles"><div><span>WHAT WE KEEP</span><h2>THE DETAIL<br />AFTER 90.</h2></div><div className="about-principles__grid"><article><b>01</b><h3>Designed, not copied</h3><p>We start from a feeling, a place or a piece of match-day memory. The result is fan apparel with its own language.</p></article><article><b>02</b><h3>Small batches, clear stock</h3><p>Published inventory is real. When a story leaves the shop, the Vault keeps the record without pretending it is still for sale.</p></article><article><b>03</b><h3>Personal, with a checkpoint</h3><p>Names, numbers and references are reviewed before production. You see the important details before they become permanent.</p></article></div></section>
    <section className="about-split"><div className="about-split__media"><img src="/assets/editorial-player.webp" alt="Editorial football portrait in an Extra Time jersey."/><span>STUDIO VIEW / 90+</span></div><div className="about-split__copy"><span>THE WORKFLOW</span><h2>ONE PIECE.<br /><em>ONE MEMORY.</em></h2><p>Choose a published piece, follow the fit and care notes, then add only the details that make it yours. Checkout keeps the price, delivery estimate and payment status visible at every step.</p><ul><li><Check size={15}/> Secure provider checkout; no full card number stored by the store.</li><li><Check size={15}/> Tracked delivery with a private order status link.</li><li><Check size={15}/> Artwork review before a personalized order enters production.</li></ul><button className="button button--dark" onClick={() => navigate('/custom')}>ENTER CUSTOM LAB <ArrowRight size={16}/></button></div></section>
    <section className="about-business"><span>THE OPERATOR</span><div><strong>{BUSINESS_DETAILS.legalName}</strong><p>{BUSINESS_DETAILS.legalName} operates the {BUSINESS_DETAILS.brand} storefront from {BUSINESS_DETAILS.location}. For orders, privacy or policy questions, email <a href={`mailto:${BUSINESS_DETAILS.email}`}>{BUSINESS_DETAILS.email}</a>.</p></div></section><section className="about-not-affiliated"><Globe2 size={20}/><div><span>INDEPENDENT BY DESIGN</span><h2>FOR SUPPORTERS.<br />NOT AN OFFICIAL TEAM STORE.</h2><p>Extra Time makes independent fan apparel. Team and league references describe the collection route and supporter culture; they do not imply endorsement or affiliation.</p></div></section>
  </main>
}

function PolicyPage({ type }) {
  const page = TRUST_PAGES[type] || TRUST_PAGES.shipping
  const [openFaq,setOpenFaq] = useState(0)
  useEffect(() => setOpenFaq(0), [type])
  const policyLinks = [['shipping','Shipping'],['returns','Returns'],['privacy','Privacy'],['terms','Terms'],['accessibility','Accessibility']]
  return <main className={`policy-page policy-page--${type}`}>
    <div className="policy-breadcrumb-wrap"><Breadcrumbs items={[{ label:'Trust desk', href:'/shipping' }, { label:page.title.replace('.', '') }]}/></div><section className="policy-hero"><div className="policy-hero__copy"><span>{page.eyebrow}</span><h1>{page.title}<br /><em>{page.accent}</em></h1><p>{page.intro}</p><div className="policy-hero__actions"><button className="button button--dark" onClick={() => navigate('/shop')}>SHOP THE DROP <ArrowRight size={16}/></button><button className="button-link" onClick={() => navigate('/track-order')}>TRACK AN ORDER <ArrowRight size={16}/></button></div></div><figure className="policy-hero__media"><img src={page.image} alt={page.imageAlt} loading="eager" fetchPriority="high" decoding="async"/><figcaption><span>EXTRA TIME / TRUST DESK</span><strong>Clear answers before you commit.</strong></figcaption></figure></section>
    <section className="policy-facts" aria-label={`${page.title} at a glance`}>{page.facts.map(([label,value],index) => <div key={label}><span>{String(index + 1).padStart(2,'0')}</span><strong>{label}</strong><small>{value}</small></div>)}</section><section className="policy-contact" aria-label="Jersevo business contact"><span>BUSINESS CONTACT</span><div><strong>{BUSINESS_DETAILS.legalName}</strong><p>Operator of {BUSINESS_DETAILS.brand} · {BUSINESS_DETAILS.location}</p></div><a href={`mailto:${BUSINESS_DETAILS.email}`}>{BUSINESS_DETAILS.email}<ArrowRight size={15}/></a></section>
    <section className="policy-layout"><aside className="policy-rail"><div><span>IN THIS DESK</span>{policyLinks.map(([key,label]) => <button key={key} className={type === key ? 'is-active' : ''} onClick={() => navigate(`/${key}`)}>{label}<ArrowRight size={14}/></button>)}<button className={type === 'warranty' ? 'is-active' : ''} onClick={() => navigate('/warranty')}>Warranty<ArrowRight size={14}/></button><button className={type === 'journal' ? 'is-active' : ''} onClick={() => navigate('/journal')}>Journal<ArrowRight size={14}/></button></div><div className="policy-rail__note"><ShieldCheck size={18}/><strong>Built for a confident checkout.</strong><span>Payment is verified server-side, private order links protect status details and publishing never happens by accident.</span></div></aside><article className="policy-article"><div className="policy-article__intro"><span>{type === 'journal' ? 'READ THE STORY' : 'READ BEFORE YOU ORDER'}</span><h2>{type === 'journal' ? 'The useful version of the story.' : 'The short version first.'}</h2><p>{type === 'privacy' ? 'A privacy page should tell you what happens to your details, not bury the answer under legal fog.' : type === 'terms' ? 'These are the operating rules for product, payment and personalization. If a detail matters to the order, it appears before payment.' : type === 'warranty' ? 'A warranty page should separate a production problem from normal wear and give you a safe next action.' : 'Use the sections below to find the decision that matters to you.'}</p></div>{page.sections.map(section => <section className="policy-section" key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p><ul>{section.list.map(item => <li key={item}><Check size={15}/><span>{item}</span></li>)}</ul></section>)}<section className="policy-faq"><div className="policy-faq__heading"><CircleHelp size={19}/><div><span>QUICK ANSWERS</span><h3>Still deciding?</h3></div></div>{page.faqs.map(([question,answer],index) => <div className={`policy-faq__item ${openFaq === index ? 'is-open' : ''}`} key={question}><button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}><span>{question}</span><ChevronDown size={16}/></button>{openFaq === index && <p>{answer}</p>}</div>)}</section><div className="policy-article__footer"><PackageCheck size={18}/><span>Need order-specific help? Use the private tracking link, then return to the <button onClick={() => navigate('/shop')}>current drop</button>.</span></div></article></section>
    <StorefrontTrust compact/>
  </main>
}

function NotFound() {
  return <main className="not-found"><span>90+</span><h1>FULL TIME.</h1><p>That page has left the pitch.</p><button className="button button--dark" onClick={() => navigate('/')}>BACK TO HOME</button></main>
}

function setMeta(name, content, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`
  let node = document.head.querySelector(selector)
  if (!node) { node=document.createElement('meta'); node.setAttribute(property ? 'property' : 'name',name); document.head.appendChild(node) }
  node.setAttribute('content',content)
}

function setLink(rel, href, extra = {}) {
  const selector = `link[rel="${rel}"]${extra.hreflang ? `[hreflang="${extra.hreflang}"]` : ''}`
  let node = document.head.querySelector(selector)
  if (!node) { node=document.createElement('link'); node.rel=rel; if (extra.hreflang) node.hreflang=extra.hreflang; document.head.appendChild(node) }
  node.href=href
  return node
}

function useRouteMetadata({ path, page = 1, paginated = false, search = '', product, collection, category, league, team, productType = null, hasTeamProductTypeSegment = false, products = [], catalogTotal = null, collectionCount = 0, loading = false, unavailable = false }) {
  useEffect(() => {
    // Preserve authoritative initial HTML while the browser refreshes data.
    if (loading || unavailable) return
    const publicOrigin = import.meta.env.VITE_SITE_URL || 'https://www.jersevo.com'
    const storefrontBrand = 'Jersevo'
    const pdpMetadata = product ? productSeoMetadata(product,publicOrigin) : null
    const productTitle = pdpMetadata?.title
    const collectionTitle = collection?.seo?.title || collection?.name
    const taxonomyTitle = productType && team ? `${team.name} ${productType.label}` : team?.name || league?.name
    const withBrand = value => /(?:extra time|jersevo)/i.test(value || '') ? value : `${value} — ${storefrontBrand}`
    const routeMeta = {
      '/about':['About the studio — Extra Time','Meet Extra Time, an independent fan-apparel studio making small-batch football jerseys and considered personalization.'],
      '/shipping':['Shipping and delivery — Extra Time',TRUST_PAGES.shipping.intro],
      '/returns':['Returns and personalized-order policy — Extra Time',TRUST_PAGES.returns.intro],
      '/warranty':['Warranty and defect review — Extra Time',TRUST_PAGES.warranty.intro],
      '/privacy':['Privacy and customer data — Extra Time',TRUST_PAGES.privacy.intro],
      '/terms':['Store terms — Extra Time',TRUST_PAGES.terms.intro],
      '/accessibility':['Accessibility — Extra Time',TRUST_PAGES.accessibility.intro],
      '/journal':['The Journal — Extra Time',TRUST_PAGES.journal.intro],
      '/sports':['Shop sports and leagues | Jersevo','Explore football, baseball, basketball, hockey, soccer and college fan gear by league and team.'],
      '/teams':['Find your team | Jersevo','Find your team across the NFL, MLB, NBA, NHL, MLS and college sports, then browse current fan gear.'],
      '/collections':['Shop collections | Jersevo','Explore currently published Jersevo collections and shop fan gear by sport, team and product type.'],
      '/custom':['Custom jerseys and personalized fan gear | Jersevo','Choose a designer-led jersey, add your name or number, and send the important details through a reviewed personalization flow.']
    }[path]
    const title = product ? withBrand(productTitle) : collection ? withBrand(collectionTitle) : category ? withBrand(category.label) : taxonomyTitle ? withBrand(`${taxonomyTitle} fan gear`) : routeMeta?.[0] || (path === '/' ? 'Custom Jerseys & Personalized Fan Gear | Jersevo' : path === '/shop' ? 'Shop fan gear by sport, team and product | Jersevo' : path === '/sports' ? 'Shop sports and leagues | Jersevo' : path === '/teams' ? 'Find your team | Jersevo' : path === '/collections' ? 'Shop collections | Jersevo' : path === '/membership' ? '90+ Club membership — Extra Time' : path === '/vault' ? 'The Vault — Extra Time' : 'Extra Time — Football memories, made wearable')
    const rawDescription = product ? seoDescription(product?.seo?.description, product?.description || product?.story, 160) : collection ? seoDescription(collection?.seo?.description, collection?.description, 160) : category ? category.description : (productType && team ? `Shop ${team.name} ${productType.label.toLowerCase()} with current photos, available options and tracked US delivery.` : team ? `Shop ${team.name} fan gear, including available jerseys, caps and apparel, with tracked US delivery.` : league ? league.description : routeMeta?.[1] || (path === '/' ? 'Design custom jerseys and personalized fan gear with your name, number and approved listing options at Jersevo.' : path === '/shop' ? 'Shop Jersevo fan gear by league, team and product type, including caps, apparel and personalized jerseys available in the US.' : path === '/sports' ? 'Browse football, baseball, basketball, hockey, soccer and college fan gear by league and team at Jersevo.' : path === '/teams' ? 'Find your team across the NFL, MLB, NBA, NHL, MLS and college sports, then browse current fan gear.' : path === '/collections' ? 'Explore currently published Jersevo collections and shop fan gear by sport, team and product type.' : path === '/membership' ? 'Join 90+ Club for eligible member pricing, standard shipping benefits and early access to selected Extra Time drops.' : 'Original football memories, designer-led jerseys and considered personalization.'))
    const description = pdpMetadata?.description || seoDescription(rawDescription, '', 160)
    const canonicalPath = path === '/moments' || path === '/players' ? '/' : path === '/' ? '/' : path
    const catalogRoute = path === '/shop' || path.startsWith('/category/') || path.startsWith('/collection/') || path.startsWith('/collections/') || path.startsWith('/league/') || path.startsWith('/team/')
    const query = new URLSearchParams(search)
    const requestPath = catalogRoute ? catalogPagePath(canonicalPath,page) : canonicalPath
    const requestIndexability = routeIndexability({ pathname:requestPath, search })
    const canonical = pdpMetadata?.canonical || `${publicOrigin.replace(/\/$/, '')}${requestIndexability.canonicalPath}`
    const privateRoute = path.startsWith('/admin') || path === '/account' || path.startsWith('/account/') || path === '/studio' || path === '/checkout' || path === '/track-order' || path.startsWith('/order/')
    const unresolvedRoute = (path.startsWith('/product/') && !product) || ((path.startsWith('/collection/') || path.startsWith('/collections/')) && !collection) || (path.startsWith('/category/') && !category) || (path.startsWith('/league/') && !league) || (path.startsWith('/team/') && (!league || !team || (hasTeamProductTypeSegment && !productType)))
    const indexableProducts = products.filter(item => String(item.seoStatus || item.seo?.status || '').toUpperCase() === 'INDEXABLE')
    const catalogCount = Number.isFinite(Number(catalogTotal)) && catalogTotal != null
      ? Number(catalogTotal)
      : category ? indexableProducts.filter(item => productMatchesCatalogCategory(item,category)).length : collection ? indexableProducts.filter(item => (collection.products || []).includes(item.id)).length : productType && team ? indexableProducts.filter(item => productMatchesTaxonomy(item,{ league:league?.key, team:team.slug }) && productMatchesTeamProductType(item,productType)).length : team ? indexableProducts.filter(item => productMatchesTaxonomy(item,{ league:league?.key, team:team.slug })).length : league ? indexableProducts.filter(item => productMatchesTaxonomy(item,{ league:league.key })).length : indexableProducts.length
    // Card requests intentionally avoid a fragile server-side count. When a
    // route is hydrated from a page-sized response, do not turn an otherwise
    // valid static landing into noindex merely because the upper bound is not
    // known yet; the static generator and canonical path remain authoritative.
    const pageValid = !catalogRoute || !query.has('page') && (!paginated || (catalogTotal == null ? products.length > 0 : page >= 2 && page <= pageCount(catalogCount)))
    const queryNoindex = requestIndexability.noindex
    const productIndexable = !product || pdpMetadata.indexable
    const collectionIndexable = !collection || String(collection.seo?.status || '').toUpperCase() === 'INDEXABLE' && catalogCount >= 6
    const knownPublicRoute = ['/', '/shop', '/custom', '/sports', '/teams', '/collections', '/collection', '/about', '/membership', '/shipping', '/returns', '/warranty', '/privacy', '/terms', '/accessibility'].includes(path) || Boolean(product || collection || category || league)
    const indexable = knownPublicRoute && (path !== '/collections' || collectionCount > 0) && !privateRoute && !unresolvedRoute && !queryNoindex && pageValid && productIndexable && collectionIndexable && (!category && !league || catalogCount >= 6)
    const routePage = routeMeta ? TRUST_PAGES[path.slice(1)] : null
    const pageTitle = catalogRoute && page > 1 ? `${title} · Page ${page}` : title
    // Keep social previews aligned with the campaign art visible in the
    // storefront.  League landing pages use their dedicated panorama while
    // team/product pages retain their more specific image when available.
    const routeCover = path === '/shop'
      ? SHOP_COVER.src
      : path.startsWith('/league/') && !team
        ? leagueCover(league?.key)?.src
        : null
    const image = product?.image || collection?.hero || routeCover || routePage?.image || `${publicOrigin}/assets/hero-tunnel.webp`
    const absoluteImage = new URL(image,publicOrigin).toString()
    document.documentElement.lang='en-US'
    document.title=pageTitle
    const blockedRobots = queryNoindex ? 'noindex,follow' : 'noindex,nofollow'
    setMeta('description',description); setMeta('robots',indexable ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : blockedRobots); setMeta('googlebot',indexable ? 'index,follow' : blockedRobots); setMeta('og:site_name',storefrontBrand,true); setMeta('og:locale','en_US',true); setMeta('og:title',pageTitle,true); setMeta('og:description',description,true); setMeta('og:url',canonical,true); setMeta('og:image',absoluteImage,true); setMeta('og:image:alt',product?.alt || `${pageTitle} image`,true); setMeta('og:type',product ? 'product' : 'website',true); setMeta('twitter:card','summary_large_image'); setMeta('twitter:title',pageTitle); setMeta('twitter:description',description); setMeta('twitter:image',absoluteImage)
    setLink('canonical',canonical); setLink('alternate',canonical,{hreflang:'en-US'}); setLink('alternate',canonical,{hreflang:'x-default'})
    let schema=document.getElementById('route-structured-data')
    if(indexable && (product || collection || category || league || routeMeta)){ if(!schema){schema=document.createElement('script');schema.id='route-structured-data';schema.type='application/ld+json';document.head.appendChild(schema)}
      const breadcrumb=[{'@type':'ListItem',position:1,name:'Home',item:`${publicOrigin}/`}]
      if(product){
        schema.textContent=JSON.stringify(productStructuredData(product,publicOrigin))
      } else if (collection || category) {
        const canonicalCollection=collection ? `${publicOrigin}/collection/${encodeURIComponent(collection.handle || collection.id)}` : ''
        const categoryCanonical = category ? `${publicOrigin}/category/${category.handle}` : canonicalCollection
        const pageName = category?.label || collection.name
        const pageDescription = category?.description || collection.description
        breadcrumb.push({'@type':'ListItem',position:2,name:'Shop',item:`${publicOrigin}/shop`},{'@type':'ListItem',position:3,name:pageName,item:categoryCanonical})
        schema.textContent=JSON.stringify([{'@context':'https://schema.org','@type':'CollectionPage',name:pageName,description:pageDescription,url:categoryCanonical,image:collection?.hero ? [new URL(collection.hero,publicOrigin).toString()] : undefined,inLanguage:'en-US'},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      } else if (routeMeta) {
        const routePageSchema = {
          '@context':'https://schema.org',
          '@type':'WebPage',
          name:title,
          description,
          url:canonical,
          image:absoluteImage,
          inLanguage:'en-US',
          isPartOf:{ '@type':'WebSite', url:`${publicOrigin}/`, name:'Extra Time' },
          publisher:{ '@type':'Organization', name:BUSINESS_DETAILS.legalName, alternateName:BUSINESS_DETAILS.brand, email:BUSINESS_DETAILS.email, address:{ '@type':'PostalAddress', addressRegion:'TX', addressCountry:'US' } }
        }
        const routeBreadcrumb=[
          {'@type':'ListItem',position:1,name:'Home',item:`${publicOrigin}/`},
          {'@type':'ListItem',position:2,name:title.replace(/\s+—\s+Extra Time$/i,'') || 'Trust desk',item:canonical}
        ]
        schema.textContent=JSON.stringify([routePageSchema,{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:routeBreadcrumb}])
      } else {
        const canonicalTaxonomyPath = productType && team ? teamProductTypePath(league.key,team,productType) : team ? teamPath(league.key,team) : leaguePath(league)
        const canonicalTaxonomy = `${publicOrigin}${canonicalTaxonomyPath}`
        breadcrumb.push({'@type':'ListItem',position:2,name:'Leagues',item:`${publicOrigin}/shop`})
        if(team) {
          breadcrumb.push({'@type':'ListItem',position:3,name:league.name,item:`${publicOrigin}${leaguePath(league)}`},{'@type':'ListItem',position:4,name:team.name,item:`${publicOrigin}${teamPath(league.key,team)}`})
          if (productType) breadcrumb.push({'@type':'ListItem',position:5,name:productType.label,item:canonicalTaxonomy})
        }
        else breadcrumb.push({'@type':'ListItem',position:3,name:league.name,item:canonicalTaxonomy})
        schema.textContent=JSON.stringify([{'@context':'https://schema.org','@type':'CollectionPage',name:taxonomyTitle,description,url:canonicalTaxonomy,inLanguage:'en-US',numberOfItems:catalogCount,about:{'@type':'SportsOrganization',name:team?.name || taxonomyTitle}},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      }
    } else schema?.remove()
  }, [path,page,paginated,search,product?.id,product?.updatedAt,collection?.id,category?.handle,league?.key,team?.slug,productType?.handle,hasTeamProductTypeSegment,products,catalogTotal,collectionCount,loading,unavailable])
}

function ShopDiscoveryHub({ discovery, onSearch, searchValue = '', total, controls = null, activeFilters = null }) {
  // The compact navigation index arrives independently from the first
  // catalogue page.  Render the same six/eight/six directory slots before it
  // arrives so the shop does not jump vertically on mobile.  Once the index is
  // available these placeholders are replaced with live counts/media.
  const fallbackLeagues = LEAGUE_TAXONOMY.slice(0, 6)
  const fallbackTeams = fallbackLeagues.flatMap(league => league.teams
    .slice(0, 2)
    .map(team => ({ ...team, leagueKey: league.key, leagueName: league.name, count: 0, href: teamPath(league.key, team) })))
  const leagues = discovery?.leagues?.length ? discovery.leagues : fallbackLeagues
  const categories = discovery?.categories?.length ? discovery.categories : ALL_CATALOG_CATEGORY_PAGES
  const teams = discovery?.teams?.length ? discovery.teams : fallbackTeams
  const sportOrder = ['nfl','nba','mlb','nhl','mls','ncaa']
  const sportCards = sportOrder.map(key => leagues.find(item => item.key === key)).filter(Boolean)
  const productOrder = ['caps','football-jerseys','baseball-jerseys','knit-hats','fan-apparel','custom-jerseys','accessories','collectibles']
  const productCards = productOrder.map(handle => categories.find(item => item.handle === handle)).filter(Boolean)
  const teamOrder = ['nfl/dallas-cowboys','nba/los-angeles-lakers','mlb/new-york-yankees','nhl/boston-bruins','nhl/chicago-blackhawks','mlb/los-angeles-dodgers','mlb/boston-red-sox','nhl/new-york-rangers']
  const featuredTeams = teamOrder.map(key => teams.find(team => key === team.leagueKey + '/' + team.slug)).filter(Boolean)
  const teamCards = [...featuredTeams,...teams.filter(team => !featuredTeams.some(featured => featured.href === team.href))].slice(0,6)
  const totalLabel = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total).toLocaleString('en-US') : 'Live'
  const [searchInput, setSearchInput] = useState(searchValue || '')
  useEffect(() => { setSearchInput(searchValue || '') }, [searchValue])
  const submitSearch = event => {
    event.preventDefault()
    const value = searchInput.trim()
    if (!value) { onSearch?.(); return }
    navigate(`/shop?search=${encodeURIComponent(value)}`)
  }
  return <section id="all-products" className="shop-visual shop-visual--unified" aria-labelledby="shop-discovery-title">
    <div className="shop-cover">
      <img className="shop-cover__image" src={SHOP_COVER.src} alt={SHOP_COVER.alt} width="2048" height="749" loading="eager" decoding="async" />
      <div className="shop-cover__shade" aria-hidden="true" />
      <h1 id="shop-discovery-title" className="sr-only">Find your team. Find your gear.</h1>
      <div className="shop-cover__tools">
        <form className="shop-visual__hero-search" onSubmit={submitSearch} role="search">
          <Search size={18}/><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search teams, players, jerseys…" aria-label="Search teams, players, jerseys" autoComplete="off" />
          {searchInput.trim() ? <button type="submit" aria-label="Search catalog"><ArrowRight size={17}/></button> : <button type="button" onClick={onSearch} aria-label="Open full search"><ArrowRight size={17}/></button>}
        </form>
        <span className="shop-cover__count">{totalLabel} products{searchValue ? ` · matches for “${searchValue}”` : ''}</span>
      </div>
      <nav className="shop-cover__leagues shop-visual__sport-grid" aria-label="Jump to a league">
        <span className="shop-cover__leagues-label">JUMP TO LEAGUE</span>
        {sportCards.map(league => <a key={league.key} href={leaguePath(league)} aria-label={`Shop ${league.name} gear`} onClick={event => { event.preventDefault(); navigate(leaguePath(league)) }}>{league.media?.src && <img src={league.media.src} alt="" decoding="async"/>}<span>{league.name}</span><ArrowRight size={13}/></a>)}
      </nav>
    </div>
    <div className="shop-visual__unified-links" aria-label="Shop shortcuts">
      <div className="shop-visual__link-row">
        <span className="shop-visual__row-label">PRODUCTS</span>
        <nav className="shop-visual__product-grid" aria-label="Shop by product">
          {productCards.map(category => <a key={category.handle} href={'/category/' + category.handle} onClick={event => { event.preventDefault(); navigate('/category/' + category.handle) }}><CategoryIcon kind={category.icon} size={19}/><span><strong>{category.label}</strong></span><ArrowRight size={14}/></a>)}
        </nav>
      </div>
      <div className="shop-visual__link-row">
        <span className="shop-visual__row-label">TEAMS</span>
        <nav className="shop-visual__team-grid" aria-label="Popular teams">
          {teamCards.map(team => <a key={team.href} href={team.href} onClick={event => { event.preventDefault(); navigate(team.href) }}>{team.media?.src && !team.media.fallback ? <img src={team.media.src} alt="" loading="lazy" decoding="async"/> : <span className="shop-visual__team-monogram" aria-hidden="true">{team.name.split(/\s+/).map(word => word[0]).join('').slice(0,3).toUpperCase()}</span>}<span><strong>{team.name}</strong><small>{team.leagueName}</small></span></a>)}
        </nav>
      </div>
    </div>
    <div className="shop-visual__unified-controls">
      <div className="shop-visual__trust"><span><Truck size={16}/> Free US shipping over $100</span><span><ShieldCheck size={16}/> Secure checkout</span><span><PackageCheck size={16}/> Reviewed customization</span></div>
      {controls}
    </div>
    {activeFilters}
  </section>
}

function App() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search + window.location.hash)
  const rawPath = route.split(/[?#]/)[0]
  const { basePath:path, page:catalogPage, paginated } = parseCatalogPagePath(rawPath)
  const search = route.includes('?') ? route.split('?')[1].split('#')[0] : ''
  const customRoute = path === '/custom'
  const catalogRequestKey = `${path}:${catalogPage}:${search}`
  const [products,setProducts] = useState(() => productBootstrap ? [productBootstrap.product,...(productBootstrap.related || [])] : (import.meta.env.DEV ? initialCatalog : []))
  const [menus,setMenus] = useState([])
  const [navigationProducts,setNavigationProducts] = useState([])
  const [navigationLoading,setNavigationLoading] = useState(true)
  const [collections,setCollections] = useState([])
  const [theme,setTheme] = useState(() => adminTheme)
  const [catalogState,setCatalogState] = useState({ loading:!path.startsWith('/admin'), source:'preview', error:null, scope:productBootstrap ? 'single' : 'none', routeKey:'' })
  const [catalogMeta,setCatalogMeta] = useState({ total:null, page:1, pageSize:CATALOG_PAGE_SIZE, server:false })
  const [catalogRefresh,setCatalogRefresh] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [cart, setCart] = useState(() => readLocal('extra-time-cart-v2', []))
  const [cartNotice,setCartNotice] = useState('')
  const [quickViewProduct,setQuickViewProduct] = useState(null)
  const [account,setAccount] = useState({user:null,membership:null,requests:[],error:null})
  const [memberQuote,setMemberQuote] = useState(null)
  const [quoteLoading,setQuoteLoading] = useState(false)
  const [quoteError,setQuoteError] = useState('')
  const [footerHidden, setFooterHidden] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [appInstalled, setAppInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const lastScrollY = useRef(window.scrollY)
  const customProduct = products.find(product => product.customFields?.length) || featuredCustomProduct
  const productSlug = path.startsWith('/product/') ? decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() || '') : ''
  const routeProduct = productSlug ? findStorefrontProduct(products,productSlug) : null
  const collectionHandle = path.startsWith('/collection/') || path.startsWith('/collections/') ? decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() || '') : new URLSearchParams(search).get('collection')
  const routeCollection = collectionHandle ? collections.find(collection => collection.handle === collectionHandle || collection.id === collectionHandle) : null
  const routeCategory = /^\/category\/[a-z0-9-]+$/.test(path) ? catalogCategoryByHandle(decodeURIComponent(path.split('/')[2] || '')) : null
  const routeLeague = path.startsWith('/league/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : path.startsWith('/team/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : null
  const routeTeam = path.startsWith('/team/') ? findTeam(routeLeague?.key, decodeURIComponent(path.split('/')[3] || '')) : null
  const routeProductType = path.startsWith('/team/') ? teamProductTypeByHandle(decodeURIComponent(path.split('/')[4] || '')) : null
  const hasTeamProductTypeSegment = path.startsWith('/team/') && Boolean(path.split('/')[4])
  useRouteMetadata({ path, page:catalogPage, paginated, search, product:routeProduct, collection:routeCollection, category:routeCategory, league:routeLeague, team:routeTeam, productType:routeProductType, hasTeamProductTypeSegment, products, catalogTotal:catalogMeta.total, collectionCount:collections.length, loading:catalogState.loading, unavailable:catalogState.source === 'unavailable' })
  useEffect(() => {
    // Vercel performs the same redirect before serving production HTML. Keep
    // client-side navigation and local development on the identical URL shape.
    const decision = routeIndexability({ pathname:rawPath, search })
    if (!decision.redirectPath) return
    const nextRoute = `${decision.redirectPath}${window.location.hash || ''}`
    window.history.replaceState({}, '', nextRoute)
    setRoute(nextRoute)
  }, [rawPath,search])
  useEffect(() => {
    initMetaPixel()
  }, [])
  useEffect(() => {
    let active = true
    setNavigationLoading(true)
    fetchStorefrontNavigationIndex().then(rows => {
      if (active && Array.isArray(rows)) setNavigationProducts(rows)
    }).catch(()=>{}).finally(() => { if (active) setNavigationLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    trackPageView(path)
  }, [path])
  useEffect(() => {
    if (quickViewProduct) {
      trackViewContent(quickViewProduct)
    }
  }, [quickViewProduct?.id])
  useEffect(() => {
    const aliases = { '/moments': 'story', '/players': 'players' }
    const anchor = aliases[path]
    if (!anchor) return
    const target = `/#${anchor}`
    window.history.replaceState({}, '', target)
    setRoute(target)
    window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }))
  }, [path])
  useEffect(() => {
    if (path.startsWith('/admin')) return
    let active=true
    setCatalogState(current => ({...current,loading:true}))
    let catalogRows = []
    let featuredRows = []
    let catalogLive = false
    let chromeResults = null
    const applyChrome = () => {
      if (!active || !chromeResults) return
      const [menuResult,collectionResult,themeResult] = chromeResults
      const nextCollections = collectionResult.data || []
      const nextTheme = themeResult.data || null
      setMenus(resolveMenuImages(menuResult.data || [], { products:catalogRows, collections:nextCollections, pages:nextTheme?.pages || [] }))
      setCollections(nextCollections)
      setTheme(nextTheme)
    }
    const homeRoute = path === '/' || path === '/moments' || path === '/players'
    const discoveryRoute = path === '/sports' || path === '/teams' || path === '/collections'
    const catalogRequest = discoveryRoute
      ? Promise.resolve({ data:[], source:'navigation', error:null, total:null })
      : productSlug
      ? fetchStorefrontProduct(productSlug)
      : collectionHandle ? fetchStorefrontCollectionPage(collectionHandle,{ page:catalogPage, pageSize:CATALOG_PAGE_SIZE }) : fetchStorefrontCatalogPage({ page:catalogPage, pageSize:homeRoute ? 12 : CATALOG_PAGE_SIZE, basePath:customRoute ? '/category/custom-jerseys' : path, search, includeCount:!homeRoute })
    Promise.all([
      fetchStorefrontMenus([]),
      fetchStorefrontCollections([],collectionHandle || ''),
      fetchStorefrontTheme(null)
    ]).then(results => { chromeResults = results; applyChrome() }).catch(() => {})
    catalogRequest.then(catalogResult => {
      if(!active)return
      const catalogUsable = catalogResult.source === 'supabase' || catalogResult.source === 'cache'
      catalogLive = catalogUsable
      catalogRows = [...(catalogResult.data || [])]
      if (catalogLive) for (const row of featuredRows) if (!catalogRows.some(item => item.id === row.id)) catalogRows.push(row)
      if (catalogLive) {
        setProducts(catalogRows)
        if (catalogResult.collection) {
          setCollections(current => {
            const incoming = catalogResult.collection
            const match = current.find(row => row.handle === incoming.handle || row.id === incoming.id)
            if (!match) return [...current, incoming]
            // Keep a full membership map returned by the chrome query when it
            // is available; the page result is still enough to render when
            // that secondary request is unavailable or times out.
            return current.map(row => row === match
              ? { ...incoming, ...row, productLinks:row.productLinks?.length ? row.productLinks : incoming.productLinks, products:row.products?.length ? row.products : incoming.products, pageScoped:row.productLinks?.length ? false : incoming.pageScoped }
              : row)
          })
        }
      } else if (!productSlug) setProducts([])
      setCatalogMeta({ total:catalogResult.total ?? null, page:catalogResult.page || catalogPage, pageSize:catalogResult.pageSize || CATALOG_PAGE_SIZE, server:Boolean(catalogUsable && !productSlug) })
      applyChrome()
      setCatalogState({loading:false,source:catalogResult.source,error:catalogResult.error,scope:catalogUsable ? (productSlug ? 'single' : 'page') : 'none',routeKey:catalogRequestKey})
    }).catch(error => {
      if (!active) return
      catalogLive = false
      if (!productSlug) setProducts([])
      setCatalogMeta({ total:null, page:catalogPage, pageSize:CATALOG_PAGE_SIZE, server:false })
      setCatalogState({loading:false,source:'unavailable',error:error instanceof Error ? error.message : 'Catalogue unavailable.',scope:'none',routeKey:catalogRequestKey})
    })
    if (homeRoute && featuredCustomProduct?.handle) {
      fetchStorefrontProduct(featuredCustomProduct.handle,{ includeRelated:false }).then(result => {
        if (!active || result.source !== 'supabase' || !result.data?.length) return
        featuredRows = result.data.slice(0,1)
        if (!catalogLive) return
        const extra = featuredRows.filter(row => !catalogRows.some(item => item.id === row.id))
        if (!extra.length) return
        catalogRows = [...catalogRows,...extra]
        setProducts(current => [...current,...extra.filter(row => !current.some(item => item.id === row.id))])
        applyChrome()
      }).catch(() => {})
    }
    return () => { active=false }
  }, [path.startsWith('/admin'),productSlug,path,catalogPage,search,catalogRefresh])
  useEffect(() => {
    const tokens=theme?.tokens || {}
    const safeColor=value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : null
    const assignments=[['--ink',safeColor(tokens.ink)],['--chalk',safeColor(tokens.chalk)],['--acid',safeColor(tokens.acid)],['--signal',safeColor(tokens.signal)],['--max',/^\d{2,4}px$/.test(tokens.maxWidth || '') ? tokens.maxWidth : null]]
    assignments.forEach(([key,value]) => value && document.documentElement.style.setProperty(key,value))
  }, [theme])
  useEffect(() => { try { window.localStorage.setItem('extra-time-cart-v2',JSON.stringify(cart)) } catch {} }, [cart])
  useEffect(() => {
    if (!supabase || path.startsWith('/admin')) return
    let active=true
    const refresh=()=>customerAuthSnapshot().then(snapshot=>{if(active)setAccount(snapshot)}).catch(error=>active&&setAccount({user:null,membership:null,requests:[],error:error instanceof Error?error.message:'Account unavailable.'}))
    refresh()
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{window.setTimeout(refresh,0)})
    return()=>{active=false;subscription.unsubscribe()}
  }, [path.startsWith('/admin')])
  useEffect(()=>{
    let active=true
    if(!account.user||!cart.length){setMemberQuote(null);setQuoteError('');setQuoteLoading(false);return()=>{active=false}}
    setQuoteLoading(true);setQuoteError('')
    requestMemberQuote(cart).then(result=>{if(active)setMemberQuote(result)}).catch(error=>{if(active){setMemberQuote(null);setQuoteError(error instanceof Error?error.message:'Member price unavailable.')}}).finally(()=>{if(active)setQuoteLoading(false)})
    return()=>{active=false}
  },[cart,account.user?.id,account.membership?.updated_at])
  useEffect(()=>{
    if(!supabase || !cart.length || catalogState.loading || path.startsWith('/admin'))return
    let active=true
    requestCartValidation(cart).then(result=>{
      if(!active)return
      const live=new Map((result.lines||[]).map(line=>[line.lineKey,line]))
      setCart(current=>current.flatMap(item=>{
        const line=live.get(item.key || `${item.product.id}:${item.variantId}`)
        if(!line?.available){setCartNotice(`${item.product.name} is no longer available and was removed from your bag.`);return []}
        if(line.qty!==item.qty)setCartNotice(`${item.product.name} quantity was adjusted to live stock.`)
        return [{...item,qty:line.qty,sku:line.sku,unitPrice:line.unitPrice}]
      }))
    }).catch(()=>{})
    return()=>{active=false}
  },[cart.length,catalogState.loading,path])
  useEffect(() => {
    if (catalogState.loading || catalogState.source !== 'supabase' || productSlug) return
    setCart(current => {
      const result=reconcileCart(current,products)
      if(result.issues.length)setCartNotice(result.issues.map(issue=>issue.message).join(' '))
      return result.items
    })
  }, [products,catalogState.loading,catalogState.source,productSlug])
  useEffect(() => {
    const onPop = () => {
      setRoute(window.location.pathname + window.location.search + window.location.hash)
      setSearchOpen(false)
      setCartOpen(false)
      setInstallOpen(false)
      setSizeGuideOpen(false)
      setQuickViewProduct(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    document.body.classList.toggle('no-scroll', searchOpen || cartOpen || installOpen || sizeGuideOpen || Boolean(quickViewProduct))
    return () => document.body.classList.remove('no-scroll')
  }, [searchOpen, cartOpen, installOpen, sizeGuideOpen, quickViewProduct])
  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return
    if (import.meta.env.DEV) {
      window.navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .catch(() => {})
      return
    }
    window.navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  useEffect(() => {
    // The rating iframe is a third-party widget and can add layout/paint work
    // to every route.  Keep it on decision/checkout surfaces where trust helps
    // conversion; discovery pages stay quiet and fast.
    if (!(path === '/checkout' || path.startsWith('/product/'))) return
    const supportsIdle = typeof window.requestIdleCallback === 'function'
    const cancel = supportsIdle
      ? window.requestIdleCallback(() => renderGoogleRatingBadge({ position: 'BOTTOM_RIGHT' }))
      : window.setTimeout(() => renderGoogleRatingBadge({ position: 'BOTTOM_RIGHT' }), 1800)
    return () => {
      if (supportsIdle && window.cancelIdleCallback) window.cancelIdleCallback(cancel)
      else window.clearTimeout(cancel)
    }
  }, [path])
  useEffect(() => {
    const captureInstall = event => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const installed = () => {
      setInstallPrompt(null)
      setAppInstalled(true)
      setInstallOpen(false)
    }
    window.addEventListener('beforeinstallprompt', captureInstall)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstall)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 780px)')
    let settleTimer
    const onScroll = () => {
      if (!mobile.matches) { setFooterHidden(false); return }
      const currentY = Math.max(0, window.scrollY)
      const delta = currentY - lastScrollY.current
      if (currentY < 28 || delta < -4) setFooterHidden(false)
      else if (currentY > 96 && delta > 4) setFooterHidden(true)
      lastScrollY.current = currentY
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => setFooterHidden(false), 700)
    }
    lastScrollY.current = window.scrollY
    setFooterHidden(false)
    window.addEventListener('scroll', onScroll, { passive:true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(settleTimer)
    }
  }, [route])
  const footerActuallyHidden = footerHidden && !searchOpen && !cartOpen && !installOpen && !sizeGuideOpen && !quickViewProduct
  useEffect(() => {
    document.documentElement.classList.toggle('footer-nav-hidden', footerActuallyHidden)
    return () => document.documentElement.classList.remove('footer-nav-hidden')
  }, [footerActuallyHidden])
  if (path.startsWith('/admin')) return <Suspense fallback={<div className="admin-loading"><span>90<sup>+</sup></span><p>Opening control room…</p></div>}><AdminApp /></Suspense>
  const addToCart = (product, selection = {}) => {
    const variant = selection.variant || sellableVariants(product)[0]
    if(!isSellableVariant(variant)){setCartNotice(`${product.name} is sold out or no longer available.`);return}
    const line = {
      product:{ id:product.id,handle:product.handle,name:product.name,image:product.image,alt:product.alt,color:product.color,price:product.price },
      variantId:variant.id,
      sku:variant.sku,
      options:selection.options || variant.values || {},
      customization:selection.customization || null,
      unitPrice:Number(variant.price ?? product.price),
      qty:1
    }
    line.key=cartLineKey(line)
    setCart(current => {
      const found = current.find(item => (item.key || cartLineKey(item)) === line.key)
      if(found && found.qty >= Number(variant.inventory)){setCartNotice(`Only ${variant.inventory} of ${product.name} are currently available.`);return current}
      setCartNotice('')
      return found ? current.map(item => item === found ? {...item,qty:item.qty+1} : item) : [...current,line]
    })
    setCartOpen(true)
    trackAddToCart(line)
    if (line.customization) {
      trackCustomizeProduct(product, line.customization.fields || {})
    }
  }
  const clearCart = () => {
    setCart([])
    setMemberQuote(null)
    try { window.localStorage.removeItem('extra-time-cart-v2') } catch {}
  }
  const completeCheckout = (lineKeys) => {
    const keys = Array.isArray(lineKeys) ? new Set(lineKeys) : null
    // A tracking link opened on another device must never clear a shopper's
    // current bag. Checkout itself always supplies the purchased line keys.
    if (!keys?.size) return
    setCart(current => current.filter(item => !keys.has(item.key || `${item.product.id}:${item.variantId}`)))
    setMemberQuote(null)
  }
  const openCheckout = () => {
    if (!cart.length) { setCartNotice('Your bag is empty.'); return }
    const total = cart.reduce((sum, item) => sum + Number(item.unitPrice ?? item.product?.price ?? 0) * Number(item.qty || 1), 0)
    trackInitiateCheckout(cart, total)
    setCartOpen(false)
    navigate('/checkout')
  }
  const updateQty = (target, delta) => setCart(current => current.map(item => {
    if((item.key || cartLineKey(item)) !== (target.key || cartLineKey(target)))return item
    const product=products.find(row=>row.id===item.product.id)
    const variant=product?.variants?.find(row=>row.id===item.variantId)
    const desired=item.qty+delta
    if(delta>0 && (!isSellableVariant(variant) || desired>Number(variant.inventory||0))){setCartNotice(`Only ${Number(variant?.inventory||0)} of ${item.product.name} are currently available.`);return item}
    setCartNotice('')
    return {...item,qty:desired}
  }).filter(item => item.qty > 0))
  const bagCount = cart.reduce((sum, item) => sum + item.qty, 0)
  let page
  const catalogRoute = path === '/' || path === '/shop' || path === '/collection' || path.startsWith('/collection/') || path.startsWith('/collections/') || path.startsWith('/category/') || path.startsWith('/league/') || path.startsWith('/team/')
  const taxonomyRoute = path.startsWith('/league/') || path.startsWith('/team/')
  const taxonomyLoading = catalogState.loading || catalogState.routeKey !== catalogRequestKey
  if (!taxonomyRoute && !path.startsWith('/admin') && catalogState.loading && path !== '/' && path !== '/shop' && (!products.length || catalogRoute && catalogState.scope !== 'page')) page = <div className="route-loading"><span>90+</span><p>Loading published catalogue…</p></div>
  else if (path === '/') page = <Home onQuickView={setQuickViewProduct} products={products} navigationProducts={navigationProducts} theme={theme} collections={collections} onAdd={addToCart}/>
  else if (path === '/moments') page = <Home onQuickView={setQuickViewProduct} products={products} navigationProducts={navigationProducts} theme={theme} collections={collections} onAdd={addToCart}/>
  else if (path === '/players') page = <Home onQuickView={setQuickViewProduct} products={products} navigationProducts={navigationProducts} theme={theme} collections={collections} onAdd={addToCart}/>
  else if (path === '/sports' || path === '/teams' || path === '/collections') page = <DiscoveryLanding kind={path.slice(1)} discovery={discoveryIndex(navigationProducts.length ? navigationProducts : products)} collections={collections} products={products} onSearch={() => setSearchOpen(true)}/>
  else if (path === '/custom') page = <CustomHub products={products} onQuickView={setQuickViewProduct}/>
  else if (path === '/shop' || path === '/collection' || path.startsWith('/collection/') || path.startsWith('/collections/')) page = <Shop key={`${path}:${catalogPage}:${search}`} page={catalogPage} pagination={catalogMeta} onQuickView={setQuickViewProduct} products={products} collection={routeCollection} discovery={discoveryIndex(navigationProducts.length ? navigationProducts : products)} onSearch={() => setSearchOpen(true)} loading={catalogState.loading || catalogState.routeKey !== catalogRequestKey}/>
  else if (path.startsWith('/category/')) page = routeCategory ? <Shop key={`${routeCategory.handle}:${catalogPage}:${search}`} page={catalogPage} pagination={catalogMeta} onQuickView={setQuickViewProduct} products={products} category={routeCategory} loading={catalogState.loading || catalogState.routeKey !== catalogRequestKey}/> : <NotFound/>
  else if (path.startsWith('/league/')) page = routeLeague ? <TaxonomyLanding key={`${routeLeague.key}:${catalogPage}:${search}`} league={routeLeague} page={catalogPage} pagination={catalogMeta} products={products} discoveryProducts={navigationProducts.length ? navigationProducts : products} loading={taxonomyLoading || navigationLoading} onQuickView={setQuickViewProduct}/> : <NotFound/>
  else if (path.startsWith('/team/')) page = routeLeague && routeTeam && (!hasTeamProductTypeSegment || routeProductType) ? <TaxonomyLanding key={`${routeTeam.slug}:${routeProductType?.handle || 'all'}:${catalogPage}:${search}`} league={routeLeague} team={routeTeam} productType={routeProductType} page={catalogPage} pagination={catalogMeta} products={products} discoveryProducts={navigationProducts.length ? navigationProducts : products} loading={taxonomyLoading || navigationLoading} onQuickView={setQuickViewProduct}/> : <NotFound/>
  else if (path === '/studio') page = <Suspense fallback={<div className="admin-loading"><span>90<sup>+</sup></span><p>Opening AI edit…</p></div>}><AiStudio key={search} products={products}/></Suspense>
  else if (path === '/membership' || path === '/account/membership') page = <Suspense fallback={<div className="route-loading"><span>90+</span><p>Opening the club…</p></div>}><MembershipPage account={account} onAccountChange={setAccount}/></Suspense>
  else if (path === '/checkout') page = <Suspense fallback={<div className="route-loading"><span>90+</span><p>Opening secure checkout…</p></div>}><CheckoutPage cart={cart} account={account} onNavigate={navigate} onClearCart={clearCart} onPaymentConfirmed={completeCheckout} initialRoute={route}/></Suspense>
  else if (path === '/track-order') page = <Suspense fallback={<div className="route-loading"><span>90+</span><p>Opening order status…</p></div>}><OrderTrackingPage onNavigate={navigate} onPaymentConfirmed={completeCheckout}/></Suspense>
  else if (path.startsWith('/order/')) { const orderPublicId = decodeURIComponent(path.split('/').slice(2).join('/')); const trackingToken = new URLSearchParams(search).get('token') || ''; page = <Suspense fallback={<div className="route-loading"><span>90+</span><p>Opening order status…</p></div>}><OrderTrackingPage onNavigate={navigate} onPaymentConfirmed={completeCheckout} initialPublicId={orderPublicId} initialToken={trackingToken}/></Suspense> }
  else if (path === '/vault') page = (!theme?.pages?.length || theme.pages.some(page => page.path === '/vault' && page.status === 'PUBLISHED')) ? <VaultPage/> : <NotFound/>
  else if (path === '/about') page = <AboutPage/>
  else if (['/privacy','/terms','/accessibility','/shipping','/returns','/warranty','/journal'].includes(path)) page=<PolicyPage type={path.slice(1)}/>
  else if (path.startsWith('/product/')) page = routeProduct ? <ProductPage key={routeProduct.id} product={routeProduct} products={products} onAdd={addToCart} onQuickView={setQuickViewProduct} startPersonalized={new URLSearchParams(search).get('custom') === '1'} account={account}/> : catalogState.loading ? <div className="route-loading"><span>90+</span><p>Loading published listing…</p></div> : <NotFound/>
  else page = <NotFound/>
  return (
    <>
      <Header bagCount={bagCount} openCart={() => setCartOpen(true)} openSearch={() => setSearchOpen(true)} openInstall={() => setInstallOpen(true)} appInstalled={appInstalled} menus={menus} collections={collections} customProduct={customProduct} account={account} products={navigationProducts.length ? navigationProducts : products}/>
      {catalogState.error && path !== '/' && <div className={`catalog-runtime-notice ${catalogState.source === 'cache' ? 'is-cached' : ''}`} role="status"><span>{catalogState.source === 'cache' ? 'Showing recently loaded products while the live catalogue reconnects. Price and stock are checked again at checkout.' : 'The catalogue connection was interrupted. Refresh the product list to continue.'}</span><button type="button" onClick={() => setCatalogRefresh(value => value + 1)}>Refresh products</button></div>}
      {page}
      <Footer openSizeGuide={() => setSizeGuideOpen(true)} menus={menus} customProduct={customProduct}/>
      <FixedFooterMenu path={path} bagCount={bagCount} openCart={() => setCartOpen(true)} menus={menus} customProduct={customProduct} products={navigationProducts.length ? navigationProducts : products} hidden={footerActuallyHidden}/>
      <InstallAppSheet open={installOpen} onClose={() => setInstallOpen(false)} deferredPrompt={installPrompt} onInstalled={() => setAppInstalled(true)} onPromptUsed={() => setInstallPrompt(null)}/>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} products={products} navigationProducts={navigationProducts} collections={collections}/>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} updateQty={updateQty} account={account} memberQuote={memberQuote} quoteLoading={quoteLoading} quoteError={quoteError} cartNotice={cartNotice} onCheckout={openCheckout} products={products} onAdd={addToCart}/>
      <QuickView key={quickViewProduct?.id || 'closed'} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAdd={addToCart}/>
      <SizeFinder open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)}/>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
