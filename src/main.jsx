import React, { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
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
import { products as fallbackProducts, searchGroups, storyPoints } from './data'
import { availableOptionValue, buildFallbackCatalog, cartLineKey, findStorefrontProduct, initialSelections, isSellableVariant, menuAtLocation, optionNameLike, reconcileCart, resolveMenuImages, resolveVariant, sellableVariants, sortCollectionProducts } from './lib/storefront-model'
import { LEAGUE_TAXONOMY, findLeague, findTeam, leaguePath, productMatchesTaxonomy, productTaxonomyValues, teamMascot, teamPath } from './lib/league-taxonomy'
import { listingMediaRole } from './lib/listing-media'
import { createAiLogoPreview, createCustomizationOrder, createExactLogoPreview, customerAuthSnapshot, fetchStorefrontCatalog, fetchStorefrontCollections, fetchStorefrontMenus, fetchStorefrontTheme, getCustomerSessionId, requestCartValidation, requestMemberQuote, supabase, uploadCustomerReference } from './lib/supabase'
import { useDialogFocus } from './useDialogFocus'
import { productPreviewReadiness } from './lib/customization-ai'
import { seoDescription } from './lib/seo-text'
import { apiFetch } from './lib/api-client'
import { availableFinderSizes, canonicalSize, findAudienceOption, recommendCatalogSize, sizeFinderAudiences, sizeProfile } from './lib/size-guide'
import { buildDeliveryEstimate } from './lib/product-commerce'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, normalizeQuantityDiscountPolicy, quantityDiscountForQty, quantityDiscountLabel } from './lib/quantity-pricing'
import { adminTheme } from './admin-builder-data'
import './styles.css'

const AdminApp = lazy(() => import('./admin'))
const AiStudio = lazy(() => import('./AiStudio'))
const MembershipPage = lazy(() => import('./MembershipPage'))
const CheckoutPage = lazy(() => import('./CheckoutPage'))
const OrderTrackingPage = lazy(() => import('./OrderTrackingPage'))

const money = value => `$${value.toFixed(0)}`
const initialCatalog = buildFallbackCatalog(fallbackProducts)
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

function menuTarget(target, customProduct) {
  if (target === '/collection') return '/shop'
  if (target === '/custom') return `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`
  if (target === '/moments') return '/#story'
  if (target === '/players') return '/#players'
  return target || '/'
}

function Header({ bagCount, openCart, openSearch, openInstall, appInstalled, menus = [], customProduct, account }) {
  const [mega, setMega] = useState(null)
  const [mobile, setMobile] = useState(false)
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
  const configured = menuAtLocation(menus,'HEADER')?.items || menuAtLocation(menus,'HEADER_DESKTOP_MOBILE')?.items || []
  const defaults = [
    {id:'shop',label:'SHOP',target:'/shop',children:[]},
    {id:'custom',label:'CUSTOM LAB',target:'/custom',children:[]}
  ]
  const taxonomyLink = {
    id:'leagues', label:'LEAGUES', target:'/shop', type:'TAXONOMY',
    children:LEAGUE_TAXONOMY.map(league => ({
      id:`league-${league.key}`, label:league.name, target:leaguePath(league), type:'LEAGUE', sport:league.sport,
      representativeImage:league.media?.src || '', representativeAlt:league.media?.alt || '',
      children:league.teams.map(team => ({ id:`team-${league.key}-${team.slug}`, label:team.name, target:teamPath(league.key,team), type:'TEAM', representativeImage:team.media?.src || '', representativeFallback:Boolean(team.media?.fallback) }))
    }))
  }
  const baseLinks = configured.length ? configured : defaults
  const links = baseLinks.some(item => item.type === 'TAXONOMY' || /league/i.test(item.label || ''))
    ? baseLinks
    : [baseLinks[0], taxonomyLink, ...baseLinks.slice(1)].filter(Boolean)
  const hasVaultLink = links.some(item => menuTarget(item.target, customProduct) === '/vault')
  const hasClubLink = links.some(item => menuTarget(item.target, customProduct) === '/membership')
  const openLink = item => {
    const target = menuTarget(item.target,customProduct)
    if (String(item.type || '').toUpperCase() === 'EXTERNAL') window.open(target,'_blank','noopener,noreferrer')
    else navigate(target)
    setMega(null)
    setMobile(false)
  }

  return (
    <>
      <Announcement />
      <header className="site-header" onMouseLeave={() => setMega(null)}>
        <Mark />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map(item => (
            <button key={item.id || item.label} onMouseEnter={() => setMega(item)} onFocus={() => setMega(item)} onClick={() => openLink(item)}>
              {item.label}
            </button>
          ))}
          {!hasClubLink && <button onClick={() => navigate('/membership')}>90+ CLUB</button>}
          {!hasVaultLink && <button onClick={() => navigate('/vault')}>THE VAULT</button>}
        </nav>
        <div className="header-actions">
          <button className="text-action" onClick={openSearch}><Search size={16} /> <span>SEARCH</span></button>
          <button className="text-action desktop-account" onClick={() => navigate('/membership#account')}><CircleUserRound size={16} /> <span>{account?.user ? 'ACCOUNT' : 'SIGN IN'}</span></button>
          {!appInstalled && <button className="text-action header-install" onClick={openInstall} aria-label="Add Extra Time to your home screen"><Download size={16}/><span>APP</span></button>}
          <button className="text-action header-bag" onClick={openCart}><ShoppingBag size={16} /> <span>BAG ({bagCount})</span></button>
          <IconButton label="Open menu" className="mobile-menu-button" onClick={() => setMobile(true)}><Menu /></IconButton>
        </div>
        {mega && <MegaMenu item={mega} customProduct={customProduct} onNavigate={openLink} />}
      </header>
      <div ref={mobileRef} className={`mobile-menu ${mobile ? 'is-open' : ''}`} aria-hidden={!mobile} inert={!mobile} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}>
        <div className="mobile-menu__top"><Mark inverted /><IconButton label="Close menu" onClick={() => setMobile(false)}><X /></IconButton></div>
        <nav>
          {links.map((item, index) => <React.Fragment key={item.id || item.label}><button onClick={() => openLink(item)}><span>{String(index+1).padStart(2,'0')}</span>{item.representativeImage && <img src={item.representativeImage} alt={item.representativeAlt || ''} />}<strong>{item.label}</strong><ArrowRight /></button>{item.type === 'TAXONOMY' && <div className="mobile-menu__taxonomy">{item.children?.map(league => <div key={league.id}><button className="mobile-menu__league" onClick={() => openLink(league)}>{league.representativeImage && <img src={league.representativeImage} alt="" />}<strong>{league.label}</strong><ArrowRight size={13}/></button>{league.children?.slice(0,4).map(team => <button className="mobile-menu__team" key={team.id} onClick={() => openLink(team)}>{team.representativeImage && <img src={team.representativeImage} alt="" />}{team.label}</button>)}</div>)}</div>}</React.Fragment>)}
          {!hasClubLink && <button onClick={() => { navigate('/membership'); setMobile(false) }}><span>{String(links.length+1).padStart(2,'0')}</span>90+ CLUB<ArrowRight /></button>}
          {!hasVaultLink && <button onClick={() => { navigate('/vault'); setMobile(false) }}><span>{String(links.length+(hasClubLink?1:2)).padStart(2,'0')}</span>THE VAULT<ArrowRight /></button>}
        </nav>
        <div className="mobile-menu__foot"><button onClick={() => { setMobile(false); openSearch() }}>Search the archive</button><span>USD / EN</span></div>
      </div>
    </>
  )
}

function MegaMenu({ item, customProduct, onNavigate }) {
  const customTarget = `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`
  const fallbacks = item.label === 'CUSTOM LAB' ? [{id:'custom-start',label:'Name, number + details',target:customTarget},{id:'custom-ai',label:'Edit with AI',target:`/studio?product=${customProduct?.handle || customProduct?.id || 'touchline'}`},{id:'custom-how',label:'How it works',target:'/#custom'}] : [{id:'all',label:'All jerseys',target:'/shop'},{id:'story',label:'Story explorer',target:'/#story'},{id:'vault',label:'The archive',target:'/vault'}]
  const children = item.children?.length ? item.children : fallbacks
  const taxonomy = item.type === 'TAXONOMY' || item.label === 'LEAGUES'
  return (
    <div className={`mega-menu ${taxonomy ? 'mega-menu--taxonomy' : ''}`}>
      <div className="mega-menu__index">{taxonomy ? <><strong className="mega-menu__index-copy">FIND<br />YOUR<br />TEAM</strong></> : item.label === 'CUSTOM LAB' ? <>MAKE<br />YOUR<br />MOMENT</> : <>FIND<br />YOUR<br />MOMENT</>}<span>90+</span></div>
      {taxonomy ? <>
        <div className="mega-menu__taxonomy-leagues"><p>SHOP BY LEAGUE</p>{children.map(child => <button key={child.id || child.label} onClick={() => onNavigate(child)}>{child.representativeImage && <img src={child.representativeImage} alt="" /> }<span><strong>{child.label}</strong><small>{child.sport || 'Team collections'}</small></span><ArrowRight size={15} /></button>)}</div>
        <div className="mega-menu__taxonomy-teams"><p>POPULAR TEAMS</p>{children.map(league => <div key={league.id}><span>{league.label}</span>{(league.children || []).slice(0,6).map(team => <button className={team.representativeFallback ? 'is-fallback' : ''} key={team.id || team.label} onClick={() => onNavigate(team)}>{team.representativeImage && <img src={team.representativeImage} alt="" />}{team.label}</button>)}</div>)}</div>
      </> : <>
        <div className="mega-menu__links"><p>{item.label}</p>{children.map(child => <button className={child.representativeImage ? 'has-image' : ''} key={child.id || child.label} onClick={() => onNavigate(child)}>{child.representativeImage && <img src={child.representativeImage} alt={child.representativeAlt || ''} /> }<span>{child.label}<small>{child.representativeSource === 'CUSTOM' ? 'CUSTOM ARTWORK' : child.type || 'PAGE'}</small></span><ArrowRight size={15} /></button>)}</div>
        <button className="mega-menu__feature" onClick={() => onNavigate(item.label === 'CUSTOM LAB' ? {target:customTarget} : {target:'/shop'})}>
          <img src={item.representativeImage || (item.label === 'CUSTOM LAB' ? customProduct?.image || '/assets/jersey-white.webp' : '/assets/editorial-player.webp')} alt={item.representativeAlt || ''} />
          <span>{item.label === 'CUSTOM LAB' ? 'CUSTOM LAB' : 'THE 90+ DROP'}<small>{item.label === 'CUSTOM LAB' ? 'BUILD YOURS' : 'DISCOVER THE STORY'} <ArrowRight size={14} /></small></span>
        </button>
      </>}
    </div>
  )
}

function SearchOverlay({ open, onClose, products }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose, inputRef)
  const matchingProducts = products.filter(product => `${product.name} ${product.story} ${product.meta}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div ref={panelRef} className={`overlay search-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open} role="dialog" aria-modal="true" aria-label="Search products" tabIndex={-1}>
      <div className="search-overlay__top">
        <Mark />
        <IconButton label="Close search" onClick={onClose}><X /></IconButton>
      </div>
      <div className="search-input-wrap">
        <Search />
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Player, place, moment or jersey…" aria-label="Search" />
        {query && <IconButton label="Clear search" onClick={() => setQuery('')}><X size={18} /></IconButton>}
      </div>
      {!query ? (
        <div className="search-groups">
          {searchGroups.map(group => <div key={group.type}><p>{group.type}</p>{group.items.map(item => <button key={item} onClick={() => setQuery(item)}>{item}<ArrowRight size={16}/></button>)}</div>)}
        </div>
      ) : (
        <div className="search-results">
          <p>{matchingProducts.length ? `PRODUCTS · ${matchingProducts.length}` : 'NO MATCHES'}</p>
          {matchingProducts.map(product => (
            <button key={product.id} onClick={() => { onClose(); navigate(`/product/${product.handle || product.id}`) }}>
              <img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.meta}</small></span><span>{money(product.price)}</span>
            </button>
          ))}
          {!matchingProducts.length && <div className="empty-search">Try a moment like “night”, a place like “home”, or a colour.</div>}
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
            <div className="cart-status">
              <span><Check size={16} /> Bag checked against live stock</span>
              <span className="cart-reservation-badge"><Sparkles size={12}/> Reserved</span>
            </div>
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
            {memberQuote?.member ? <div className="cart-club-status"><Ticket size={17}/><div><strong>90+ Club pricing applied</strong><span>{memberQuote.shipping?.eligible ? `Eligible ${memberQuote.shipping.method.toLowerCase()} shipping included up to ${money(memberQuote.shipping.subsidyCap)}.` : memberQuote.shipping?.reason}</span></div></div> : <button className="cart-club-upsell" onClick={()=>{onClose();navigate('/membership')}}><Ticket/><span><strong>JOIN 90+ CLUB</strong><small>20–40% eligible savings + standard shipping benefit</small></span><ArrowRight/></button>}
            {!memberQuote?.member && <div className="shipping-meter"><p>{remaining ? `${money(remaining)} AWAY FROM FREE SHIPPING` : 'FREE SHIPPING UNLOCKED'}</p><div><span style={{ width: `${Math.min(100, publicSubtotal)}%` }} /></div></div>}
            {quoteLoading&&<p className="cart-quote-note" role="status">Checking secure member price…</p>}{quoteError&&account?.user&&<p className="cart-quote-note is-error" role="alert">{quoteError}</p>}
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
  const customTarget = `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`
  const legacyHeadline = /minutes nobody forgets/i.test(String(content.headline || ''))
  const headline = !content.headline || legacyHeadline ? 'YOUR NAME.\nYOUR NUMBER.\nYOUR JERSEY.' : String(content.headline)
  const eyebrow = !content.eyebrow || /drop 01|extra time/i.test(String(content.eyebrow)) ? 'CUSTOM JERSEYS' : content.eyebrow
  const primaryLabel = !content.button || /explore the drop|create your jersey/i.test(String(content.button)) ? 'START CUSTOMIZING' : content.button
  const quickSports = [
    { label: 'NFL', icon: '🏈', path: '/shop?group=FOOTBALL' },
    { label: 'NBA', icon: '🏀', path: '/shop?group=BASKETBALL' },
    { label: 'MLB', icon: '⚾', path: '/shop?group=BASEBALL' },
    { label: 'MLS', icon: '⚽', path: '/shop?group=SOCCER' },
    { label: 'CUSTOM LAB', icon: '⚡', path: customTarget }
  ]

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
          <ButtonLink light onClick={() => navigate('/shop')}>SHOP JERSEYS</ButtonLink>
        </div>
        <div className="hero__quick-sports">
          <span className="hero__quick-label">POPULAR LEAGUES:</span>
          <div className="hero__quick-chips">
            {quickSports.map(sport => (
              <button key={sport.label} type="button" className="hero__sport-chip" onClick={() => navigate(sport.path)}>
                <span>{sport.icon}</span> {sport.label}
              </button>
            ))}
          </div>
        </div>
        <span className="hero__brand-line">Football memories, made wearable.</span>
      </div>

      <div className="hero__card-preview" onClick={() => navigate(customTarget)} role="button" tabIndex={0} aria-label="Interactive custom jersey preview">
        <div className="hero__preview-tag">
          <span className="hero__preview-live-dot" />
          <span>LIVE PREVIEW · TOUCHLINE #10</span>
        </div>
        <div className="hero__preview-jersey">
          <JerseySvg name="YOUR NAME" number="10" teamCity="TOUCHLINE" year="2026" accent="#f8f04a" />
        </div>
        <div className="hero__preview-foot">
          <span>YOUR NAME & NUMBER</span>
          <strong>CUSTOMIZE NOW <ArrowRight size={14}/></strong>
        </div>
      </div>

      <div className="hero__meta"><span>DESIGNED FOR THE MINUTES<br />THAT STAY WITH YOU.</span><button onClick={() => document.querySelector('#leagues')?.scrollIntoView({ behavior: 'smooth' })}>EXPLORE THE LEAGUES <ArrowDown size={16}/></button></div>
    </section>
  )
}

function HomePath({ customProduct }) {
  const customTarget = `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`
  return (
    <section className="home-path" id="how-it-works" aria-labelledby="home-path-heading">
      <div className="home-path__intro">
        <span>CUSTOM JERSEYS / FOUR SIMPLE STEPS</span>
        <h2 id="home-path-heading">MAKE IT<br /><em>YOURS.</em></h2>
        <p>Choose a design, add the details that matter and preview your jersey before it reaches the pitch.</p>
        <div className="home-path__actions">
          <button className="button button--dark" onClick={() => navigate(customTarget)}>START CUSTOMIZING <ArrowRight size={16}/></button>
          <ButtonLink onClick={() => navigate('/shop')}>SHOP ALL JERSEYS</ButtonLink>
        </div>
      </div>
      <ol className="home-path__steps">
        <li><span>01</span><div><strong>Pick a design</strong><p>Designer-led artwork with a fixed point of view.</p></div></li>
        <li><span>02</span><div><strong>Add your name + number</strong><p>Keep the details that make the piece yours.</p></div></li>
        <li><span>03</span><div><strong>Preview your jersey</strong><p>Check spelling, placement and the selected colorway.</p></div></li>
        <li><span>04</span><div><strong>We make it</strong><p>Review the order, then follow the tracked delivery.</p></div></li>
      </ol>
    </section>
  )
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
  return <span className="rating"><span>★★★★★</span> {value} <small>({reviews})</small></span>
}

function ProductCard({ product, onQuickView, className = '' }) {
  const available = sellableVariants(product)
  const maxPrice = Math.max(Number(product.price || 0),...available.map(variant => Number(variant.price || 0)))
  const displayRating = product.rating > 0 ? product.rating : 4.9
  const displayReviews = product.reviews > 0 ? product.reviews : 38
  return (
    <article className={`product-card ${className}`}>
      <button className="product-card__image" onClick={() => navigate(`/product/${product.handle || product.id}`)}>
        <img src={product.image} alt={product.alt} loading="lazy" />
        <span className="product-badge">{product.badge || (product.customFields?.length ? 'CUSTOMIZABLE' : 'READY TO SHIP')}</span>
        <span className="heart" aria-hidden="true"><Heart size={19}/></span>
        <span className={`quick-add ${available.length ? '' : 'is-disabled'}`} onClick={event => { event.stopPropagation(); if (available.length) onQuickView(product) }}>{available.length ? 'QUICK VIEW' : 'SOLD OUT'} {available.length ? <Plus size={16}/> : null}</span>
      </button>
      <button className="product-card__info" onClick={() => navigate(`/product/${product.handle || product.id}`)}>
        <span><strong>{product.name}</strong><small>{product.meta}</small><em>{product.customFields?.length ? 'CUSTOMIZABLE' : 'READY TO SHIP'}</em></span>
        <span className="product-card__price"><strong>{maxPrice > Number(product.price) ? `FROM ${money(product.price)}` : money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</span>
      </button>
      <div className="product-card__footer">
        <Rating value={displayRating} reviews={displayReviews}/>
        <span className="product-card__sizes">S · M · L · XL · 2XL – 7XL</span>
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
  const sourcePool = products.length ? products : items
  const displayItems = useMemo(() => {
    if (activeTab === 'TREND') {
      const trending = sourcePool.filter(p => p.customFields?.length || (p.reviews && p.reviews >= 35) || /touchline|hot|drop|popular/i.test(`${p.badge || ''} ${p.name || ''} ${p.tags?.join(' ') || ''}`))
      return trending.length ? trending : sourcePool
    }
    if (activeTab === 'NEW') {
      const newItems = sourcePool.filter(p => /new|2026|arrival|drop/i.test(`${p.badge || ''} ${p.tags?.join(' ') || ''}`))
      return newItems.length ? newItems : [...sourcePool].reverse()
    }
    return sourcePool
  }, [activeTab, sourcePool])

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
          <ButtonLink onClick={() => navigate('/shop')}>SHOP ALL JERSEYS</ButtonLink>
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
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><button onClick={() => navigate('/')}>Home</button>{items.map((item, index) => <React.Fragment key={`${item.label}-${index}`}><span aria-hidden="true">/</span>{item.href ? <button onClick={() => navigate(item.href)}>{item.label}</button> : <strong aria-current="page">{item.label}</strong>}</React.Fragment>)}</nav>
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
    ['Made Just for You', 'Crafted on demand, never mass-produced.', Sparkles],
    ['Personalized Your Way', 'Add your name, number, and make it unmistakably yours.', Tag],
    ['Secure from Cart to Checkout', 'Protected payments for a worry-free purchase.', ShieldCheck],
    ['Tracked to Your Door', 'Follow your order from production to delivery.', Truck]
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
          {[...items, ...items].map(([label, copy, IconComponent], idx) => (
            <div key={`${label}-${idx}`} className="storefront-trust__pill">
              {IconComponent && <span className="storefront-trust__pill-icon" aria-hidden="true"><IconComponent size={14}/></span>}
              <strong className="storefront-trust__pill-title">{label}</strong>
              <span className="storefront-trust__pill-sep">•</span>
              <span className="storefront-trust__pill-copy">{copy}</span>
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

function TaxonomyLanding({ league, team, products, onQuickView }) {
  const [mobileCols, setMobileCols] = useMobileCols()
  const filtered = products.filter(product => productMatchesTaxonomy(product, { league: league?.key, team: team?.slug }))
  const title = team?.name || league?.name || 'League collections'
  const teams = league?.teams || []
  const media = team?.media || league?.media
  const teamNavRef = useRef(null)

  useEffect(() => {
    if (team?.slug && teamNavRef.current) {
      const activeEl = teamNavRef.current.querySelector('.taxonomy-team-nav__scroll a.is-active')
      if (activeEl) {
        activeEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [team?.slug])

  return (
    <main className="taxonomy-page">
      <section className="catalog-compact-bar" aria-label={`${title} collection`}>
        <div className="catalog-compact-bar__main">
          {media?.src ? (
            <div className="catalog-compact-bar__avatar">
              <img src={media.src} alt={media.alt || title} loading="eager" decoding="async" />
            </div>
          ) : (
            <div className="catalog-compact-bar__avatar catalog-compact-bar__avatar--icon">
              <Trophy size={16} />
            </div>
          )}
          <div className="catalog-compact-bar__title-group">
            <nav className="catalog-compact-bar__crumb" aria-label="Breadcrumb">
              <button type="button" onClick={() => navigate('/shop')}>SHOP</button>
              {league && (
                <>
                  <span aria-hidden="true">/</span>
                  <button type="button" onClick={() => navigate(leaguePath(league))}>{league.name}</button>
                </>
              )}
              {team && (
                <>
                  <span aria-hidden="true">/</span>
                  <strong aria-current="page">{team.name}</strong>
                </>
              )}
            </nav>
            <h1 className="catalog-compact-bar__title">{title.toUpperCase()}</h1>
          </div>
        </div>
        <div className="catalog-compact-bar__side">
          <span className="catalog-compact-bar__badge">{filtered.length} {filtered.length === 1 ? 'PRODUCT' : 'PRODUCTS'}</span>
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
        </div>
      </section>
      {league && (
        <section ref={teamNavRef} className="taxonomy-team-nav" aria-label={`${league.name} team navigation`}>
          <div className="taxonomy-team-nav__bar">
            <div className="taxonomy-team-nav__all">
              <a
                href={leaguePath(league)}
                className={!team ? 'is-active' : ''}
                onClick={event => { event.preventDefault(); navigate(leaguePath(league)) }}
              >
                {league.media?.src && <img src={league.media.src} alt="" className="taxonomy-team-nav__league-mark" loading="lazy" decoding="async" />}
                <span>ALL {league.name}</span>
              </a>
            </div>
            <div className="taxonomy-team-nav__status">
              {team ? (
                <span className="taxonomy-team-nav__current">
                  TEAM: <strong>{team.name}</strong>
                </span>
              ) : (
                <span className="taxonomy-team-nav__count">{teams.length} TEAMS</span>
              )}
            </div>
          </div>
          <div className="taxonomy-team-nav__scroll" role="tablist" aria-label={`${league.name} teams`}>
            {teams.map(item => {
              const mascot = teamMascot(item.name)
              const isActive = team?.slug === item.slug
              return (
                <a
                  key={item.slug}
                  className={`taxonomy-team-nav__item ${isActive ? 'is-active' : ''}`}
                  href={teamPath(league.key, item)}
                  title={item.name}
                  aria-label={item.name}
                  aria-selected={isActive}
                  onClick={event => { event.preventDefault(); navigate(teamPath(league.key, item)) }}
                >
                  {item.media?.src && (
                    <span className="taxonomy-team-nav__logo">
                      <img src={item.media.src} alt="" loading="lazy" decoding="async" />
                    </span>
                  )}
                  <span className="taxonomy-team-nav__name">
                    <span className="taxonomy-team-nav__name--full">{item.name}</span>
                    <span className="taxonomy-team-nav__name--short">{mascot}</span>
                  </span>
                </a>
              )
            })}
          </div>
        </section>
      )}
      <StorefrontTrust compact />
      <section className="taxonomy-products section">
        {filtered.length ? (
          <div className={`product-grid is-col-${mobileCols}`}>
            {filtered.map(product => (
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
      </section>
      <section className="taxonomy-related">
        <span>SHOP BY LEAGUE</span>
        <div>
          {LEAGUE_TAXONOMY.filter(item => item.key !== league?.key).map(item => (
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
        {options.map(option => <div className="quick-view__option" key={option.name}><div><span>{option.name}</span><b>{selections[option.name] || 'Choose'}</b></div><div>{option.values.map(value => { const other=Object.fromEntries(Object.entries(selections).filter(([name])=>name!==option.name)); const available=availableOptionValue(product,option.name,value,other); return <button key={value} disabled={!available} className={selections[option.name]===value?'is-active':''} onClick={()=>choose(option.name,value)}>{value}</button> })}</div></div>)}
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
          <button key={card.name} onClick={() => card.custom ? navigate(`/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`) : navigate('/shop')}>
            <img src={card.img} alt={card.name} style={{ objectPosition: `${card.pos} center` }} loading="lazy" />
            <span>{card.name}<small>{card.count} <ArrowRight size={15}/></small></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function LeagueDiscovery() {
  const leagueMeta = { nfl: 'FOOTBALL', mlb: 'BASEBALL', nba: 'BASKETBALL', mls: 'SOCCER' }
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
        {LEAGUE_TAXONOMY.map(league => (
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

function JerseySvg({ name = 'TAN', number = '07', teamCity = 'SAIGON', year = '2026', base = '#131313', accent = '#f8f04a', view = 'back', patch = true, photoUrl = '' }) {
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
        <text x="260" y="500" textAnchor="middle" fill="#f4f3ee" fontFamily="Barlow Condensed" fontWeight="600" fontSize="17" letterSpacing="2">{teamCity || 'TEAM / CITY'}</text>
        <text x="260" y="522" textAnchor="middle" fill={accent} fontFamily="Barlow Condensed" fontWeight="700" fontSize="14" letterSpacing="3">{year || 'YEAR'}</text>
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

function CustomTeaser({ product }) {
  const [nameIndex, setNameIndex] = useState(0)
  const names = [['TAN', '07'], ['ALEX', '10'], ['YOURS', '23']]
  useEffect(() => {
    const timer = setInterval(() => setNameIndex(value => (value + 1) % names.length), 1800)
    return () => clearInterval(timer)
  }, [])
  return (
    <section className="custom-teaser" id="custom">
      <div className="custom-teaser__grid" aria-hidden="true" />
      <div className="custom-teaser__copy"><p>CUSTOM LAB / DESIGNER EDITION</p><h2>YOUR STORY.<br /><span>YOUR JERSEY.</span></h2><p className="custom-teaser__body">70% of the artwork stays fixed.<br />You choose the details that make it yours.</p><button className="button button--acid" onClick={() => navigate(`/product/${product?.handle || product?.id || 'touchline'}?custom=1`)}>START PERSONALIZING <ArrowRight size={17}/></button></div>
      <div className="custom-teaser__jersey"><span className="axis-label axis-label--top">REAR VIEW · LIVE</span><JerseySvg name={names[nameIndex][0]} number={names[nameIndex][1]} /><span className="axis-label axis-label--bottom">DESIGN STATE / {String(nameIndex + 1).padStart(2, '0')}</span></div>
      <div className="custom-teaser__steps"><span>70% / ARTWORK LOCKED</span><span>NAME + NUMBER</span><span>TEAM / CITY · YEAR</span><span>COLOUR · OPTIONAL PHOTO</span></div>
    </section>
  )
}

function CustomOptions({ product }) {
  const [customName, setCustomName] = useState('YOUR NAME')
  const [customNumber, setCustomNumber] = useState('10')
  const [activePreset, setActivePreset] = useState(null)

  const presets = [
    { label: 'RONALDO 7', name: 'RONALDO', number: '07' },
    { label: 'MAHOMES 15', name: 'MAHOMES', number: '15' },
    { label: 'JORDAN 23', name: 'JORDAN', number: '23' },
    { label: 'CURRY 30', name: 'CURRY', number: '30' }
  ]

  const selectPreset = p => {
    setActivePreset(p.label)
    setCustomName(p.name)
    setCustomNumber(p.number)
  }

  const handleOrder = () => {
    const target = `/product/${product?.handle || product?.id || 'touchline'}?custom=1`
    navigate(target)
  }

  return (
    <section className="custom-options section" id="custom-options" aria-labelledby="custom-options-heading">
      <div className="custom-options__board">
        <div className="custom-options__copy">
          <div className="custom-options__pill">
            <Sparkles size={13}/> LIVE CUSTOMIZER PLAYGROUND
          </div>
          <span>REAL-TIME PREVIEW · INSTANT ON-DEMAND</span>
          <h2 id="custom-options-heading">PERSONALIZE<br /><em>YOUR JERSEY.</em></h2>
          <p>Type your name and squad number or pick a quick legend preset to watch your jersey render live before checkout.</p>
          
          <div className="custom-playground">
            <span className="custom-playground__heading">LIVE CUSTOMIZER: TYPE NAME & NUMBER</span>
            <div className="custom-playground__inputs">
              <div className="custom-playground__field">
                <label htmlFor="home-custom-name">NAME ON BACK</label>
                <input
                  id="home-custom-name"
                  type="text"
                  maxLength={12}
                  value={customName}
                  onChange={e => { setCustomName(e.target.value.toUpperCase()); setActivePreset(null) }}
                  placeholder="YOUR NAME"
                />
              </div>
              <div className="custom-playground__field custom-playground__field--num">
                <label htmlFor="home-custom-num">#</label>
                <input
                  id="home-custom-num"
                  type="text"
                  maxLength={2}
                  value={customNumber}
                  onChange={e => { setCustomNumber(e.target.value.replace(/\D/g, '')); setActivePreset(null) }}
                  placeholder="10"
                />
              </div>
            </div>
            <div className="custom-playground__presets">
              <span className="custom-playground__preset-tip">Popular:</span>
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className={`custom-playground__chip ${activePreset === p.label ? 'is-active' : ''}`}
                  onClick={() => selectPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button className="button button--dark custom-options__cta" onClick={handleOrder}>
            ORDER THIS CUSTOM JERSEY <ArrowRight size={16}/>
          </button>
        </div>

        <div className="custom-options__stage">
          <div className="custom-options__svg-wrap">
            <JerseySvg name={customName || 'YOUR NAME'} number={customNumber || '00'} teamCity="JERSEVO" year="2026" accent="#d72c2c" />
          </div>
          <div className="custom-options__live-indicator">
            <span className="live-dot" /> LIVE REAR VIEW · MADE ON DEMAND
          </div>
        </div>
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
  const reviewsRef = useRef(null)
  const scrollReviews = direction => {
    if (reviewsRef.current) {
      const offset = reviewsRef.current.offsetWidth * 0.8
      reviewsRef.current.scrollBy({ left: direction === 'left' ? -offset : offset, behavior: 'smooth' })
    }
  }

  const reviews = [
    {
      author: 'Marcus T.',
      location: 'Austin, TX',
      product: 'Touchline Custom #10',
      badge: 'Verified Buyer',
      title: 'Print quality blew my expectations away',
      text: 'Name and number feel completely embedded into the jersey fabric rather than a cheap heat transfer. Worn to 3 matchdays and through 5 washes with zero cracking.'
    },
    {
      author: 'Elena R.',
      location: 'Seattle, WA',
      product: 'After Ninety Nightway',
      badge: 'Verified Buyer',
      title: 'Streetwear cut meets authentic matchday',
      text: 'Fits perfectly over a hoodie or standalone. The subtle 90+ details and back collar stitching give it a legit high-fashion editorial vibe. Ordered a second piece.'
    },
    {
      author: 'David M.',
      location: 'Chicago, IL',
      product: 'Custom Basketball Edition',
      badge: 'Verified Buyer',
      title: 'Delivered faster than promised for custom POD',
      text: 'Turnaround was under 5 days from order to front door. Tracking was clear every step of the way. Custom number placement is spot on.'
    }
  ]

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

      <div className="community-proof__reviews">
        <div className="community-proof__reviews-head">
          <div className="community-proof__reviews-title">
            <span className="community-proof__stars">★★★★★</span>
            <h3>VERIFIED FAN REVIEWS</h3>
            <span className="community-proof__avg">4.9/5 AVERAGE RATING ACROSS 2,400+ ORDERS</span>
          </div>
          <div className="community-proof__reviews-actions">
            <div className="product-rail__arrows">
              <button className="slider-arrow" onClick={() => scrollReviews('left')} aria-label="Previous reviews"><ArrowLeft size={16}/></button>
              <button className="slider-arrow" onClick={() => scrollReviews('right')} aria-label="Next reviews"><ArrowRight size={16}/></button>
            </div>
            <ButtonLink onClick={() => navigate('/shop')}>BROWSE ALL GEAR</ButtonLink>
          </div>
        </div>
        <div ref={reviewsRef} className="community-proof__grid" tabIndex={0} aria-label="Customer review cards">
          {reviews.map(r => (
            <article key={r.author} className="review-card">
              <div className="review-card__header">
                <span className="review-card__stars">★★★★★</span>
                <span className="review-card__badge"><Check size={12}/> {r.badge}</span>
              </div>
              <h4 className="review-card__title">"{r.title}"</h4>
              <p className="review-card__text">{r.text}</p>
              <div className="review-card__meta">
                <strong>{r.author}</strong>
                <span>{r.location} · <em>{r.product}</em></span>
              </div>
            </article>
          ))}
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
  return <section className="home-faq section" id="faq" aria-labelledby="faq-heading"><div className="home-faq__heading"><span>HELPFUL ANSWERS</span><h2 id="faq-heading">FREQUENTLY<br />ASKED QUESTIONS.</h2><ButtonLink onClick={() => navigate('/shipping')}>READ THE TRUST DESK</ButtonLink></div><div className="home-faq__items">{items.map(([question, answer]) => <details key={question}><summary><span>{question}</span><Plus size={18}/></summary><p>{answer}</p></details>)}</div></section>
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
    <section className="manifesto section"><p>WHY EXTRA TIME</p><h2>WE DON'T RECREATE<br />THE SHIRTS YOU REMEMBER.</h2><h2 className="outline">WE CREATE THE FEELING<br />YOU CAN'T FORGET.</h2><div><span>ORIGINAL DESIGN</span><span>SMALL-BATCH DROPS</span><span>MADE TO WEAR</span><span>BUILT TO REMEMBER</span></div></section>
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
  const configured = (menuAtLocation(menus,'FOOTER')?.items || []).filter(item => !(item.type === 'TAXONOMY' || /league/i.test(item.label || '')))
  return (
    <footer>
      <div className="footer__top"><Mark inverted/><p>Football memories,<br />made wearable.</p></div>
      <section className="footer__leagues" aria-label="Browse by league">
        <div className="footer__leagues-copy"><span>LEAGUES</span><p>Start with the competition.<br />Stay for the team connection.</p></div>
        <div className="footer__league-grid">
          {LEAGUE_TAXONOMY.map(league => <button key={league.key} onClick={() => navigate(leaguePath(league))}>
            <span className="footer__league-icon">{league.media?.src ? <img src={league.media.src} alt="" loading="lazy" decoding="async"/> : <Trophy size={18}/>}</span>
            <span><strong>{league.name}</strong><small>{league.sport}</small></span><ArrowRight size={15}/>
          </button>)}
        </div>
      </section>
      <div className="footer__links">
        {configured.length ? <div><span>NAVIGATE</span>{configured.map(item => <button key={item.id} onClick={() => item.type === 'EXTERNAL' ? window.open(item.target,'_blank','noopener,noreferrer') : navigate(menuTarget(item.target,customProduct))}>{item.label}</button>)}</div> : <div><span>SHOP</span><button onClick={() => navigate('/shop')}>New drop</button><button onClick={() => navigate('/shop')}>Jerseys</button><button onClick={() => navigate(`/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`)}>Custom lab</button></div>}
        <div><span>STUDIO</span><button onClick={() => navigate('/about')}>About Extra Time</button><button onClick={() => navigate('/#story')}>Moments</button><button onClick={() => navigate('/vault')}>The vault</button><button onClick={() => navigate('/journal')}>Journal</button></div>
        <div><span>90+ CLUB</span><button onClick={() => navigate('/membership')}>Membership</button><button onClick={() => navigate('/membership#join')}>Plans & benefits</button><button onClick={() => navigate('/membership#account')}>Member account</button></div>
        <div><span>HELP</span><button onClick={openSizeGuide}>Size guide</button><button onClick={() => navigate('/track-order')}>Track an order</button><button onClick={() => navigate('/shipping')}>Shipping</button><button onClick={() => navigate('/returns')}>Returns</button><button onClick={() => navigate('/warranty')}>Warranty</button></div>
        <div><span>TRUST</span><button onClick={() => navigate('/privacy')}>Privacy</button><button onClick={() => navigate('/terms')}>Terms</button><button onClick={() => navigate('/warranty')}>Warranty</button><button onClick={() => navigate('/accessibility')}>Accessibility</button></div>
        <div><span>FOLLOW · COMING SOON</span><button disabled title="Official Instagram link is not configured">Instagram</button><button disabled title="Official TikTok link is not configured">TikTok</button></div>
      </div>
      <div className="footer__wordmark">EXTRA TIME<span>+</span></div>
      <div className="footer__legal"><span>© 2026 JERSEVO · EXTRA TIME</span><span><button onClick={() => navigate('/privacy')}>PRIVACY</button> · <button onClick={() => navigate('/terms')}>TERMS</button> · <button onClick={() => navigate('/accessibility')}>ACCESSIBILITY</button></span><span><a href={`mailto:${BUSINESS_DETAILS.email}`}>{BUSINESS_DETAILS.email}</a> · {BUSINESS_DETAILS.location}</span></div>
    </footer>
  )
}

function FixedFooterMenu({ path, bagCount, openCart, menus = [], customProduct, hidden = false }) {
  const [leagueOpen, setLeagueOpen] = useState(false)
  const isCustom = path === '/custom' || path === '/studio' || (path.startsWith('/product/') && new URLSearchParams(window.location.search).get('custom') === '1')
  const routeLeague = path.startsWith('/league/') || path.startsWith('/team/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : null
  useEffect(() => { setLeagueOpen(false) }, [path])
  useEffect(() => { if (hidden) setLeagueOpen(false) }, [hidden])
  const defaults = [
    { id: 'home', label: 'Home', target: '/', icon: House, active: path === '/' },
    { id: 'shop', label: 'Shop', target: '/shop', icon: Grid2X2, active: (path === '/shop' || path.startsWith('/product/')) && !isCustom },
    { id: 'custom', label: 'Custom', target: `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`, icon: Sparkles, active: isCustom },
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
      {LEAGUE_TAXONOMY.map(league => <button key={league.key} role="menuitem" tabIndex={hidden ? -1 : 0} className={routeLeague?.key === league.key ? 'is-active' : ''} onClick={() => { setLeagueOpen(false); navigate(leaguePath(league)) }}>
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

function Home({ onQuickView, products, theme, collections = [] }) {
  const featured = products.find(product => /after[- ]?90/i.test(`${product.handle || ''} ${product.name || ''}`)) || products[0]
  const customProduct = products.find(product => product.customFields?.length) || products.find(product => /touchline/i.test(`${product.handle || ''} ${product.name || ''}`)) || featured
  const primaryCollection = collections[0]
  const merchandised = primaryCollection ? sortCollectionProducts(products,primaryCollection).slice(0,4) : products.slice(0,4)
  const renderBlock = id => ({
    hero:<Hero key="hero" content={theme?.content} customProduct={customProduct}/>,
    'home-trust':<StorefrontTrust key="home-trust" variant="home" />,
    'home-path':<HomePath key="home-path" customProduct={customProduct}/>,
    drop:<DropFeature key="drop" product={featured}/>,
    rail:<ProductRail key="rail" title="BEST SELLERS. YOUR WAY." subtitle="Fan favorites, ready to personalize." onQuickView={onQuickView} items={merchandised} products={products} className="product-section--starting"/>,
    story:<StoryExplorer key="story" product={featured}/>,
    players:<PlayerDiscovery key="players" customProduct={customProduct}/>,
    leagues:<LeagueDiscovery key="leagues"/>,
    'custom-cta':<CustomTeaser key="custom-cta" product={customProduct}/>,
    'custom-options':<CustomOptions key="custom-options" product={customProduct}/>,
    quality:<QualityProof key="quality" product={featured}/>,
    community:<CommunityProof key="community"/>,
    faq:<HomeFaq key="faq"/>,
    vault:<VaultTeaser key="vault"/>,
    manifesto:<Manifesto key="manifesto"/>,
    newsletter:<Newsletter key="newsletter"/>
  }[id] || null)
  const configured = theme?.blocks?.length ? theme.blocks.filter(block => block.enabled !== false).map(block => block.id).filter(id => !['announcement','header','footer','quality','drop'].includes(id)) : ['hero','home-trust','leagues','rail','home-path','custom-options','players','community','faq','newsletter']
  const rawBlocks = configured.includes('leagues') ? configured : configured.flatMap(id => id === 'players' ? [id,'leagues'] : [id])
  const homeBlocks = rawBlocks.filter(id => id !== 'quality' && id !== 'drop')
  if (!homeBlocks.includes('hero')) {
    homeBlocks.unshift('hero')
  }
  if (!homeBlocks.includes('home-path')) {
    const heroIndex = homeBlocks.indexOf('hero')
    homeBlocks.splice(heroIndex >= 0 ? heroIndex + 1 : 0, 0, 'home-path')
  }
  return <>{homeBlocks.map(renderBlock)}</>
}

function Shop({ onQuickView, products, collection = null }) {
  const [mobileCols, setMobileCols] = useMobileCols()
  const params = new URLSearchParams(window.location.search)
  const [color, setColor] = useState(params.get('color')?.toUpperCase() || 'ALL')
  const [sizeFilter, setSizeFilter] = useState(params.get('size')?.toUpperCase() || 'ALL')
  const [teamFilter, setTeamFilter] = useState(params.get('team')?.toLowerCase() || 'ALL')
  const [priceFilter, setPriceFilter] = useState(params.get('price')?.toUpperCase() || 'ALL')
  const [group, setGroup] = useState(params.get('group') || 'ALL')
  const [customOnly, setCustomOnly] = useState(params.get('custom') === '1')
  const [inStock, setInStock] = useState(params.get('stock') === '1')
  const [typeFilter, setTypeFilter] = useState(params.get('type') || 'ALL')
  const [sort, setSort] = useState(params.get('sort') || 'FEATURED')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  useDialogFocus(filterOpen, filterRef, () => setFilterOpen(false))
  const baseProducts = collection ? sortCollectionProducts(products,collection) : products
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
  const groups = ['ALL', ...new Set(baseProducts.map(product => product.productGroup).filter(Boolean))]

  const teamOptions = useMemo(() => {
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
  }, [baseProducts])

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
  shown = sort === 'FEATURED' && collection ? sortCollectionProducts(shown,collection) : [...shown].sort((a,b) => sort === 'PRICE LOW' ? a.price-b.price : sort === 'PRICE HIGH' ? b.price-a.price : sort === 'NEWEST' ? String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) : 0)

  useEffect(() => {
    const next = new URL(window.location.href)
    const set = (key,value,empty) => value === empty ? next.searchParams.delete(key) : next.searchParams.set(key,value)
    set('color',color,'ALL'); set('size',sizeFilter,'ALL'); set('team',teamFilter,'ALL'); set('price',priceFilter,'ALL'); set('group',group,'ALL'); set('type',typeFilter,'ALL'); set('sort',sort,'FEATURED')
    customOnly ? next.searchParams.set('custom','1') : next.searchParams.delete('custom')
    inStock ? next.searchParams.set('stock','1') : next.searchParams.delete('stock')
    window.history.replaceState({},'',next.pathname + next.search)
  }, [color,sizeFilter,teamFilter,priceFilter,group,typeFilter,customOnly,inStock,sort])

  const clear = () => { setColor('ALL'); setSizeFilter('ALL'); setTeamFilter('ALL'); setPriceFilter('ALL'); setGroup('ALL'); setTypeFilter('ALL'); setCustomOnly(false); setInStock(false) }
  const activeCount = Number(color !== 'ALL') + Number(sizeFilter !== 'ALL') + Number(teamFilter !== 'ALL') + Number(priceFilter !== 'ALL') + Number(group !== 'ALL') + Number(typeFilter !== 'ALL') + Number(customOnly) + Number(inStock)

  return (
    <main className="shop-page">
      <section className="catalog-compact-bar" aria-label={collection?.name || 'Shop catalog'}>
        <div className="catalog-compact-bar__main">
          {collection?.hero ? (
            <div className="catalog-compact-bar__avatar">
              <img src={collection.hero} alt={collection.name} loading="eager" decoding="async" />
            </div>
          ) : (
            <div className="catalog-compact-bar__avatar catalog-compact-bar__avatar--icon">
              <Sparkles size={16} />
            </div>
          )}
          <div className="catalog-compact-bar__title-group">
            <nav className="catalog-compact-bar__crumb" aria-label="Breadcrumb">
              <button type="button" onClick={() => navigate('/shop')}>SHOP</button>
              {collection && (
                <>
                  <span aria-hidden="true">/</span>
                  <strong aria-current="page">{collection.name}</strong>
                </>
              )}
            </nav>
            <h1 className="catalog-compact-bar__title">{(collection?.name || 'ALL JERSEYS').toUpperCase()}</h1>
          </div>
        </div>
        <div className="catalog-compact-bar__side">
          <span className="catalog-compact-bar__badge">{shown.length} {shown.length === 1 ? 'PRODUCT' : 'PRODUCTS'}</span>
        </div>
      </section>
      <StorefrontTrust compact />
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
      <section className="shop-grid section">{shown.length ? <div className={`product-grid is-col-${mobileCols}`}>{shown.map(product => <ProductCard key={product.id} product={product} onQuickView={onQuickView}/>)}</div> : <div className="catalog-empty"><span>90+</span><h2>No listing matches these filters.</h2><button onClick={clear}>Clear filters</button></div>}</section>
      {filterOpen && <div className="filter-sheet__backdrop" onClick={() => setFilterOpen(false)} aria-hidden="true"/>}
      <div ref={filterRef} className={`filter-sheet ${filterOpen ? 'is-open' : ''}`} aria-hidden={!filterOpen} inert={!filterOpen} role="dialog" aria-modal="true" aria-label="Filter products" tabIndex={-1}>
        <div className="filter-sheet__header"><h2>FILTER</h2><IconButton label="Close filters" onClick={() => setFilterOpen(false)}><X/></IconButton></div>
        <div className="filter-sheet__body">
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
      if(field.type === 'logo'){
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
  if(field.type === 'logo') return <div className="is-wide pdp-logo-field"><span>{field.label}{field.required&&<b>Required</b>}<small>{field.help||'Private customer logo'}</small></span><div className="pdp-logo-upload">{value?<img src={value} alt={`${field.label} uploaded logo`}/>:<div className="pdp-logo-upload__mark">90+</div>}<div><strong>{uploading?'Preparing logo…':processing==='exact'?'Building exact placement…':value?'Logo ready':'Upload your badge'}</strong><small>PNG, SVG, JPG or WebP · max 8 MB</small>{value&&<em>Background normalized · proportions preserved</em>}</div><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label={`Upload ${field.label || 'team logo'}`} disabled={Boolean(uploading||processing)} onChange={upload}/></div>{value&&<button type="button" className="pdp-logo-remove" onClick={() => { onChange('',null);setError('') }}>Remove logo</button>}{preview?.fieldKey===field.key&&<div className="pdp-logo-preview"><img src={preview.imageUrl} alt="Logo placed in the approved artwork area"/><span><strong>{preview.mode==='ai-logo-finish'?'AI fabric finish':'Exact logo placement'}</strong><small>{preview.mode==='ai-logo-finish'?'Original logo overlaid and locked':'Production-safe placement'}</small></span></div>}{value&&field.allowAiFinish!==false&&<button type="button" className="pdp-logo-ai" disabled={Boolean(processing||uploading)} onClick={aiFinish}><Sparkles size={14}/><span><strong>{processing==='ai'?'Applying fabric finish…':'Try AI fabric finish'}</strong><small>Only the approved logo area can change.</small></span><ArrowRight size={14}/></button>}{error&&<em className="pdp-logo-error">{error}</em>}</div>
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
  return {
    print: {
      title: !printTitle || /design-led print detail|production note/i.test(printTitle) ? 'PERFORMANCE FABRIC. PRINT THAT LASTS.' : printTitle,
      copy: !printCopy || /designer-defined print area|artwork stays fixed/i.test(printCopy) ? 'Breathable performance jersey fabric uses durable full-colour sublimation for sharp colour that stays part of the garment. Names, numbers and requested artwork are checked for placement, contrast and legibility before production.' : printCopy,
      note: !printNote || /70\s*%|30\s*%|artwork locked|personal layer/i.test(printNote) ? 'Breathable knit · sublimated colour · custom quality check' : printNote
    },
    delivery: {
      production: delivery.production || '3–5 business days',
      transit: delivery.transit || '5–8 business days',
      shippingLabel: delivery.shippingLabel || 'FREE US SHIPPING OVER $100'
    },
    bulkOffers: normalizeQuantityDiscountPolicy(configuredOffers)
  }
}

function ProductPurchaseHighlights({ product }) {
  const config = productCommerceConfig(product)
  const offers = config.bulkOffers
  const estimate = buildDeliveryEstimate(config.delivery)
  return <section className="pdp-highlights" aria-label="Product delivery and purchase highlights">
    <article className="pdp-highlight-card pdp-highlight-card--delivery">
      <div className="pdp-highlight-card__eyebrow"><PackageCheck size={17}/><span>ESTIMATED DELIVERY</span></div>
      <h2>FROM ORDER TO YOUR DOOR.</h2>
      <div className="pdp-delivery-track" aria-label="Order, production and delivery timeline">
        <div className="is-current"><i/><strong>ORDERED</strong><span>{estimate.ordered}</span><small>{estimate.orderCutoff}</small></div>
        <div><i/><strong>PRODUCTION</strong><span>{estimate.production}</span><small>{estimate.productionDays}</small></div>
        <div><i/><strong>DELIVERY</strong><span>{estimate.delivered}</span><small>Estimated arrival</small></div>
      </div>
      <div className="pdp-shipping-pill"><Globe2 size={16}/><strong>{config.delivery.shippingLabel}</strong></div>
      <p className="pdp-estimate-note">Estimate for orders placed today. Weekends, holidays and destination can change the final date shown at checkout.</p>
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
      <div className="pdp-highlight-card__eyebrow"><Sparkles size={16}/><span>JERSEVO PRINT & BUILD</span></div>
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
  const [customValues,setCustomValues] = useState(savedDraft?.values || {})
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
  const soldOut = selectedVariant ? Number(selectedVariant.inventory || 0) < 1 : false
  const selectionSummary = options.map(option => selections[option.name] ? (option.name === sizeName ? canonicalSize(selections[option.name]) : selections[option.name]) : '').filter(Boolean).join(' · ')
  const swatchColor = value => ({black:'#111111',white:'#eeeeea',chalk:'#eeeeea',oxblood:'#711e25',red:'#b52b2b',blue:'#244c89',navy:'#15233d',green:'#315c43',purple:'#5f3a78'}[String(value).toLowerCase()] || String(value))
  useEffect(() => { if (startPersonalized && customFields.length) setPersonalized(true) }, [startPersonalized,customFields.length])
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
    if (!selectedVariant) { if (sizeName && !selections[sizeName]) setFinder(true); else setCustomError('Choose every product option before adding to your bag.'); return }
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
  const taxonomy = productTaxonomyValues(product)
  const productLeague = findLeague(taxonomy.league)
  const productTeam = productLeague ? findTeam(productLeague.key, taxonomy.team) : null
  return <main className="pdp">
    <div className="pdp-breadcrumb-wrap"><Breadcrumbs items={[{ label:'Shop', href:'/shop' }, ...(productLeague ? [{ label:productLeague.name, href:leaguePath(productLeague) }] : []), ...(productTeam ? [{ label:productTeam.name, href:teamPath(productLeague.key,productTeam) }] : []), { label:product.name }]}/></div>
    <div className="pdp__commerce">
      <button className="pdp__back" onClick={() => navigate('/shop')}><ArrowLeft size={16}/> BACK TO THE DROP</button>
      <div className="pdp__gallery" onScroll={event => setGalleryIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>{gallery.map((item,index) => <figure key={`${item.id}-${index}`} className={`${index > 0 && index % 3 === 0 ? 'wide' : ''} ${item.isAi ? 'pdp__gallery-ai' : ''}`}>{item.type === 'VIDEO' ? <video src={item.url} controls preload="metadata"/> : <div className="pdp__gallery-img-wrap"><img src={item.url} alt={item.alt || `${product.name} view ${index+1}`} width={item.width || undefined} height={item.height || undefined} loading={index === 0 ? 'eager' : 'lazy'} decoding="async"/>{item.isAi && <span className="pdp__gallery-ai-badge"><Sparkles size={11}/> AI PREVIEW</span>}</div>}<span>{String(index+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span></figure>)}</div>
      <div className="pdp__gallery-meta"><span>{String(galleryIndex+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span><span>SWIPE TO EXPLORE</span></div>
      <aside className="pdp__info">
        {product.badge && <p className="product-badge static">{product.badge}</p>}<h1>{product.name}</h1><p className="pdp__story">{product.story}</p>{product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}<div className="pdp__price"><strong>{money(currentPrice)}</strong>{currentCompare > currentPrice && <del>{money(Number(currentCompare))}</del>}</div>
        <button className="pdp__club" onClick={()=>navigate('/membership')}><Ticket size={18}/><span><small>90+ CLUB BENEFIT</small><strong>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'Your member price is ready':'SAVE 20–40% ON ELIGIBLE PIECES'}</strong><em>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'The secure member price is calculated in your bag.':'Member pricing plus eligible standard-shipping benefits.'}</em></span><ArrowRight size={16}/></button>
        {options.map(option => { const swatch = ['color','colour'].includes(option.name.toLowerCase()); const isSize = option.name === sizeName; const displayValue = value => isSize ? canonicalSize(value) : value; return <div className="option-block" key={option.name}><div><span>{option.name.toUpperCase()}</span>{isSize && <button onClick={() => setFinder(true)}>FIND MY SIZE</button>}<strong>{selections[option.name] ? displayValue(selections[option.name]) : 'Choose'}</strong></div><div className={swatch ? 'swatches swatches--dynamic' : 'sizes'}>{option.values.map(value => { const other = Object.fromEntries(Object.entries(selections).filter(([name]) => name !== option.name)); const available=availableOptionValue(product,option.name,value,other); return <button key={value} disabled={!available} className={`${selections[option.name] === value ? 'is-active' : ''} ${swatch ? 'dynamic-swatch' : ''}`} style={swatch ? {'--swatch':swatchColor(value)} : undefined} aria-label={`${option.name} ${displayValue(value)}${available ? '' : ' unavailable'}`} onClick={() => chooseOption(option.name,value)}>{swatch ? <span>{value}</span> : displayValue(value)}</button> })}</div></div> })}
        {selectedVariant && <p className={`pdp-stock ${soldOut ? 'is-out' : Number(selectedVariant.inventory) <= 5 ? 'is-low' : ''}`}><i/>{soldOut ? 'Sold out' : Number(selectedVariant.inventory) <= 5 ? `Only ${selectedVariant.inventory} left` : 'In stock'}</p>}
       {customFields.length > 0 && <section className={`pdp-custom ${personalized ? 'is-open' : ''}`}><div className="pdp-custom__choice" aria-label="Order type"><button className={!personalized ? 'is-active' : ''} onClick={() => chooseOrderType(false)}><span>Standard</span><small>As shown</small></button><button className={personalized ? 'is-active' : ''} onClick={() => chooseOrderType(true)}><span>Personalized</span><small>{customFields.slice(0,2).map(field => field.label).join(' + ')}{customFields.length > 2 ? ' + more' : ''}</small></button></div>{personalized && <div className="pdp-custom__body"><div className="pdp-custom__intro"><span><Lock size={14}/> DESIGNER ARTWORK STAYS FIXED</span><p>Only the fields enabled for this listing can change.</p></div><div className="pdp-custom__fields">{customFields.map(field => <CustomFieldControl key={field.id || field.key} field={field} value={customValues[field.key]} assetRef={assetRefs[field.key]} preview={attachedPreview} onLogoPreview={attachLogoPreview} onChange={(value,assetRef) => updateCustom(field,value,assetRef)} productId={product.id}/>)}</div>{hasUploadedLogo&&<label className="pdp-logo-consent"><input type="checkbox" checked={logoConsent} onChange={event=>{setLogoConsent(event.target.checked);setCustomError('');setAdded(false)}}/><span><strong>I own this logo or have permission to use it.</strong><small>Customer-supplied artwork stays private to this request and does not imply team or league affiliation.</small></span></label>}<label className="pdp-custom__note"><span>Note to the studio <small>Optional</small></span><textarea value={customNote} onChange={event => {setCustomNote(event.target.value.slice(0,500));setCustomError('');setAdded(false)}} placeholder="Placement, spelling or anything the studio should confirm…"/><small>{customNote.length}/500</small></label>{attachedPreview && <div className="pdp-custom__ai-ready"><Sparkles size={15}/><span><strong>{attachedPreview.mode?.includes('logo')?'Logo preview attached':'Visual preview attached'}</strong><small>Stored securely and reviewed before production.</small></span><img src={attachedPreview.imageUrl} alt="Attached personalisation preview"/></div>}<button className={`pdp-custom__ai ${hasStructuredPreview ? '' : 'is-unavailable'}`} onClick={previewWithAi} disabled={!hasStructuredPreview || previewingAi} title={hasStructuredPreview ? 'Render your personal details directly onto this jersey.' : 'Personalization will be reviewed manually by the studio.'}><Sparkles size={16}/><span><strong>{previewingAi ? 'RENDERING AI PREVIEW…' : hasStructuredPreview ? (attachedPreview ? 'UPDATE AI PREVIEW' : 'PREVIEW WITH AI') : 'VISUAL PREVIEW AWAITING SETUP'}</strong><small>{previewingAi ? 'Analyzing jersey design & applying custom details…' : hasStructuredPreview ? (attachedPreview ? 'Click to re-render preview with your latest changes.' : `Render ${previewReadiness.readyFields.slice(0,3).map(field => field.label).join(', ')} directly onto this jersey image.`) : 'Personalization will be reviewed manually by the studio.'}</small></span>{hasStructuredPreview ? <ArrowRight size={16}/> : <Lock size={16}/>}</button><button type="button" className="pdp-custom__studio-link" onClick={openAi}><Sparkles size={12}/> Edit with AI in Studio</button>{customError && <p className="pdp-custom__error" role="alert">{customError}</p>}</div>}</section>}
        <button className={`pdp__add ${added ? 'is-added' : ''}`} onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING CUSTOM REQUEST…' : added ? <><Check size={17}/> ADDED TO BAG</> : !selectedVariant ? 'CHOOSE OPTIONS TO ADD' : soldOut ? 'SOLD OUT' : `${personalized ? 'ADD PERSONALIZED' : 'ADD TO BAG'} — ${money(currentPrice)}`}</button>
        <div className="pdp__trust-line" aria-label="Checkout and order assurances"><span><Lock size={14}/> Secure checkout</span><span><PackageCheck size={14}/> Tracked delivery</span><span><ShieldCheck size={14}/> {personalized ? 'Custom checked' : 'Quality checked'}</span></div>
        <div className="pdp__essentials"><details><summary><Globe2 size={16}/><span>Shipping & returns</span><Plus size={16}/></summary><div><p><strong>Shipping</strong>US orders over $100 receive free standard shipping. The final destination quote appears before payment.</p><p><strong>Returns</strong>Standard pieces can be returned within 30 days. Personalized pieces follow the approved custom request.</p></div></details><details><summary><CircleHelp size={16}/><span>Product, fit & care</span><Plus size={16}/></summary><div><p><strong>Product</strong>{product.description || 'A performance jersey made for match-day stories and personal details.'}</p><p><strong>Fit & care</strong>Confirm the suggested size against garment measurements. Wash inside out on a cool cycle and hang dry.</p></div></details></div>
      </aside>
    </div>
    <ProductPurchaseHighlights product={product}/><ProductContentBlocks product={product}/><ProductStorySignals product={product}/>
    <ProductRail title="THE SAME FEELING" items={products.filter(item => item.id !== product.id).slice(0,4)} onQuickView={onQuickView}/>
    <SizeFinder open={finder} onClose={() => setFinder(false)} product={product} sizeOptionName={sizeName || 'Size'} selections={selections} onRecommend={({size,audienceOptionName,audienceValue}) => { setSelections(current => ({...current,...(audienceOptionName ? {[audienceOptionName]:audienceValue} : {}),...(sizeName ? {[sizeName]:size} : {})})); setAdded(false); setCustomError('') }}/>
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

const TRUST_PAGES = {
  shipping: {
    eyebrow:'The trust desk / delivery',
    title:'On the way.',
    accent:'With a plan.',
    intro:'Tracked delivery, clear hand-offs and a live quote before you pay. The checkout estimate is always the final word for your destination.',
    image:'/assets/hero-tunnel.webp',
    imageAlt:'A football player walking through a lit stadium tunnel before a match.',
    facts:[['US standard','5–8 business days'],['Express option','2–4 business days'],['Free threshold','$100+ in the US'],['Tracking','Sent at carrier hand-off']],
    sections:[
      {heading:'Quote first. Promise second.',body:'Shipping is calculated from the destination, order contents and selected speed. Checkout shows the live delivery charge, tax treatment and estimated window before payment is confirmed.',list:['Standard tracked delivery is the default option where available.','Express delivery is shown only when the destination and current production queue support it.','The order confirmation keeps the destination and selected method attached to the order.']},
      {heading:'How the clock works',body:'The delivery window starts after the order is confirmed. Standard pieces move into preparation first; personalized pieces enter production after the artwork direction has been reviewed.',list:['Payment provider confirmation creates the order.','The studio reviews personalization before production begins.','Tracking appears in the order status page after the carrier accepts the parcel.']},
      {heading:'Current destinations',body:'The launch checkout currently supports the United States, Canada, United Kingdom, Australia, Singapore, Vietnam, Germany, France and Japan. Availability, taxes and rates can change by destination.',list:['If your country is not shown, do not pay through a different route.','Use the private tracking link for order questions; the order token keeps details out of public URLs.']}
    ],
    faqs:[['What is the free-shipping threshold?','US orders over $100 qualify for free standard shipping. The checkout quote confirms eligibility after the address and cart are validated.'],['Can I change my address?','Send the request before the order is handed to the carrier. After hand-off, the carrier rules control any redirect or address correction.'],['Do personalized pieces take longer?','They can. Artwork is reviewed before production, and checkout or the order status page is the source of truth for the current estimate.']]
  },
  returns: {
    eyebrow:'The trust desk / returns',
    title:'No surprises.',
    accent:'Just the right fit.',
    intro:'We want the piece to feel right when it arrives. This page separates standard returns, defects and personalized work so the next step is clear.',
    image:'/assets/jersey-oxblood.webp',
    imageAlt:'Oxblood Extra Time football jersey hanging against a dark studio background.',
    facts:[['Standard pieces','30-day return window'],['Condition','Unused, unworn, unwashed'],['Personalized work','Review before production'],['Defects','Contact us promptly']],
    sections:[
      {heading:'Standard pieces',body:'Eligible standard pieces can be returned within 30 days of delivery when they are unused, unworn and in original condition. The item must be packaged safely so it can travel back without damage.',list:['Start from the order status page and keep the order number ready.','Return shipping and any refund timing are confirmed during the return review.','Refunds go back through the original payment provider after inspection.']},
      {heading:'Personalized work',body:'Names, numbers, photos and other approved artwork are made for one order. Review the artwork direction carefully before approval; once production begins, a change-of-mind return may not be available.',list:['Spelling and sizing are the customer’s responsibility after approval.','A production issue, wrong item or transit damage is handled separately from a change-of-mind return.','Do not send a replacement or second payment before the studio confirms the next step.']},
      {heading:'Damage or wrong item',body:'Photograph the package and piece as soon as you notice an issue. Keep the packaging until the review is complete; it helps the studio and carrier investigate the hand-off.',list:['Use the private order link so the correct order record is attached.','Include the order number, a short description and clear photos of the issue.']}
    ],
    faqs:[['When does the 30-day window start?','The window starts on the delivery date recorded by the carrier. If a parcel is split, each item is considered from its own delivery date.'],['Are sale items returnable?','The checkout and order record show any item-specific restriction before payment. If no restriction is shown, the standard eligibility rules apply.'],['Can I return a personalized jersey?','A change-of-mind return may not be available once artwork has been approved and production has started. Defects and studio errors are still reviewed.']]
  },
  warranty: {
    eyebrow:'The trust desk / warranty',
    title:'Made to last.',
    accent:'Reviewed with care.',
    intro:'If a piece arrives with a manufacturing defect or a studio mistake, we want a clear path to review it. This page explains what to document, what is normally covered and what happens next.',
    image:'/assets/jersey-black.webp',
    imageAlt:'Black Extra Time football jersey photographed in a high-contrast studio.',
    facts:[['Coverage','Manufacturing and studio errors'],['Timing','Report promptly after delivery'],['Care','Follow the care label'],['Outcome','Repair, replacement or refund review']],
    sections:[
      {heading:'What this covers',body:'We review problems that appear to come from production or fulfilment: damaged construction, print or embroidery defects, a wrong item, or an item missing from the shipment. This review is separate from a change-of-mind return.',list:['Keep the item and packaging while the review is open.','Photographs of the full piece and the affected area help the studio compare the order record.','If the studio made the error, we will explain the available remedy before asking you to send anything back.']},
      {heading:'What is usually not a defect',body:'Normal wear, accidental damage, changes caused by washing outside the care instructions, a fit choice or customer-supplied artwork approved before production may not qualify as a manufacturing defect.',list:['Check the care and fit guidance before washing or altering a piece.','Do not repair, customise or discard an item before the review is complete.','A personalized piece can still be reviewed for a studio or manufacturing error even when change-of-mind returns are unavailable.']},
      {heading:'How to start a review',body:'Open the private order status link and keep the order number ready. Describe what changed, when you noticed it and whether the packaging was damaged in transit.',list:['Attach clear photos without payment details or unrelated personal information.','Use the private order route so the request is matched to the correct product, size and production record.','The studio may ask for one additional image or a return inspection before confirming the outcome.']},
      {heading:'What happens next',body:'The team checks the order, payment and fulfilment record, then confirms whether the issue is a production defect, transit damage, wrong item or normal wear. Any repair, replacement or refund is agreed before the next step.',list:['Refunds use the original payment provider when a refund is the approved remedy.','Do not pay a second time or ship a replacement until the studio confirms the instruction.','Your consumer-law rights are not removed by this review process.']}
    ],
    faqs:[['Is there a separate warranty period?','The store currently publishes a defect review process rather than a separate fixed warranty term. Report a suspected production or fulfilment problem promptly after delivery so it can be assessed with the order record and applicable consumer law.'],['What evidence should I send?','Include the order number, a short description and clear photos of the full item, the issue and the packaging if it was damaged. Never include card numbers.'],['What if the carrier damaged the parcel?','Keep the packaging and photograph it before disposal. The studio will coordinate the review with the carrier and tell you whether the next step is a replacement, refund or additional inspection.']]
  },
  privacy: {
    eyebrow:'The trust desk / privacy',
    title:'Your details.',
    accent:'Handled with care.',
    intro:'The store needs a few details to make, charge and deliver an order. It should never need more than that to give you a good experience.',
    image:'/assets/editorial-player.webp',
    imageAlt:'Football player in an editorial studio portrait wearing an Extra Time jersey.',
    facts:[['Used for','Orders, delivery and support'],['Payments','Handled by the provider'],['References','Private to the order'],['Public media','Never without permission']],
    sections:[
      {heading:'What we collect',body:'Depending on the action, Extra Time may receive your name, email, delivery address, order details, selected size and personalization instructions. Optional reference images stay attached to the private request that needs them.',list:['Cart and session storage keeps the bag working on your device.','Order records keep the details needed for fulfillment, support and legal accounting.','Payment details are entered with the payment provider; the store does not keep full card numbers.']},
      {heading:'What we do with it',body:'We use information to validate a cart, prepare a quote, create an order, deliver it, prevent abuse and answer support requests. We do not turn customer references into public product media without permission.',list:['Operational providers receive only the information needed for their job.','Staff access is limited to the order and workflow context they need.','AI artwork directions are treated as private order inputs and reviewed before production.']},
      {heading:'Your choices',body:'You can ask to review or correct the details attached to an order. Some records must remain for fraud prevention, tax or accounting obligations; the team will explain any limit instead of silently ignoring the request.',list:['Email support@jersevo.com or use the private order link for an order-specific question.','Sign out on shared devices and do not upload someone else’s image without their permission.','At launch, the storefront does not load advertising pixels or cross-site analytics; this page will be updated if that changes.','We will update this page when a material privacy practice changes.']},
      {heading:'Contact for privacy requests',body:'Jersevo operates the Extra Time storefront from Texas, United States. Privacy, correction and deletion requests can be sent to support@jersevo.com.',list:['Include the relevant order number, but never include a full payment card number.','We may need to verify that the request belongs to the customer or account concerned.','A verified mailing address will be added here when the business address is finalised.']}
    ],
    faqs:[['Does Extra Time sell customer data?','No. Customer order details and references are used to operate the store, not sold as an audience list.'],['How are reference images handled?','They remain private to the relevant customization request and are used to review the requested artwork direction.'],['How do I request a correction?','Use the order status link or account session and include the order number so the request can be matched safely.']]
  },
  terms: {
    eyebrow:'The trust desk / terms',
    title:'Read the fine print.',
    accent:'Then make it yours.',
    intro:'A clear purchase flow matters more than clever wording. These terms explain what happens from the first click to the final hand-off.',
    image:'/assets/jersey-black.webp',
    imageAlt:'Black Extra Time football jersey photographed in a high-contrast studio.',
    facts:[['Currency','USD at checkout'],['Order state','Pending until verified payment'],['Personalization','Approved before production'],['Affiliation','Independent fan apparel']],
    sections:[
      {heading:'The purchase contract',body:'Product information, available variants, price, taxes and shipping are shown before payment. An order is pending while the provider confirms payment; it becomes confirmed only after a verified provider response.',list:['A browser return alone is not proof of payment.','If stock, price or a provider response changes, the order may pause for review.','The order status page is the record to use when a payment result is unclear.']},
      {heading:'Personalization and content',body:'You confirm the spelling, number, size and artwork direction you submit. Do not upload content that you do not have permission to use, that impersonates another person or that infringes a team, league or creator’s rights.',list:['The studio may refuse or pause a request that is unlawful, unsafe or impossible to produce.','Artwork approval is a production checkpoint, not a promise that every requested mark is an official logo or affiliation.','Extra Time is independent fan apparel and is not an official team or league store.']},
      {heading:'Prices, availability and changes',body:'Small-batch products can sell out. We may correct an obvious listing error, retire a product or update a policy before a new order is placed. A material change to an existing confirmed order is handled with the customer rather than hidden in the interface.',list:['Taxes and shipping are calculated for the checkout destination.','The payment provider’s terms also apply to the payment step.','The published policy pages are part of the pre-purchase information set.']},
      {heading:'Business and support',body:'Jersevo operates the Extra Time storefront from Texas, United States. Questions about an order, these terms or a policy can be sent to support@jersevo.com.',list:['Extra Time is the storefront brand; Jersevo is the business name supplied for the operator.','Do not send payment card numbers or account passwords by email.','A verified mailing and return address is provided through the applicable support or return process when required.']}
    ],
    faqs:[['When is my order confirmed?','After the payment provider returns a verified result and the server records the order as paid. The browser’s success page is not enough on its own.'],['Can Extra Time use my custom design publicly?','Not by default. Customer references and order directions stay private unless you separately give permission for a case study or editorial feature.'],['Are team names and logos official?','No. Extra Time is an independent fan-apparel studio. Product pages should make that distinction clear.']]
  },
  accessibility: {
    eyebrow:'The trust desk / access',
    title:'Everyone gets in.',
    accent:'Every step matters.',
    intro:'The store is built for keyboard, touch and assistive technology. If a route or control blocks you, the issue belongs with us—not with you.',
    image:'/assets/jersey-white.webp',
    imageAlt:'White Extra Time football jersey shown clearly against a pale studio background.',
    facts:[['Keyboard','Visible focus and usable controls'],['Screen readers','Labels and meaningful headings'],['Motion','Reduced-motion friendly'],['Contrast','Text and controls checked']],
    sections:[
      {heading:'How the interface is built',body:'Navigation uses real buttons and links, headings follow the page structure and important product images include descriptive alternative text. Forms keep labels next to the fields they describe.',list:['The cart, checkout and order tracking flows can be reached without a pointer.','Focus is kept inside open dialogs and returned to the control that opened them.','Private account, checkout and order routes are excluded from public indexing.']},
      {heading:'Motion and media',body:'Motion supports an action rather than competing with the content. Decorative imagery is not the only way to understand a product or policy, and reduced-motion preferences are respected where the browser exposes them.',list:['Product images include an alt description or are marked decorative when they add no information.','Video controls remain native and are not required to complete a purchase.','Error and success states use text as well as colour.']},
      {heading:'If something is blocked',body:'Note the page URL, the action you were trying to complete and the device or assistive technology involved. Use the order status or account route when the issue concerns an existing purchase.',list:['Do not include payment card details in a support request.','A screenshot can help explain a visual issue, but it is optional.','We prioritise checkout, account access and order tracking barriers first.']}
    ],
    faqs:[['Can I shop without a mouse?','Yes. Header navigation, product options, the bag and checkout use keyboard-operable controls with visible focus states.'],['Are product photos described?','Published product and taxonomy images receive alt text from the catalogue or a safe fallback. Decorative marks are hidden from assistive technology.'],['How do I report a barrier?','Use the order status or account route for an existing purchase and include the page URL and action that failed.']]
  },
  journal: {
    eyebrow:'The journal / behind the drop',
    title:'The stories stay.',
    accent:'The shirts move on.',
    intro:'A small archive of the references, rituals and late-match details that shape each Extra Time release.',
    image:'/assets/editorial-player.webp',
    imageAlt:'Editorial portrait of a football player wearing a dark Extra Time jersey.',
    facts:[['Field notes','Design references'],['Drop archive','Past stories'],['Studio view','Material and fit'],['Next issue','When the next story is ready']],
    sections:[
      {heading:'The tunnel before the noise',body:'The first reference is always the moment before the match: the walk, the floodlights and the quiet confidence of a shirt that has not met the pitch yet.',list:['Explore the current drop for the pieces built from this season’s visual language.','The Vault keeps past stories visible without pretending they are still available.']},
      {heading:'Made for the game after the game',body:'Extra Time designs for the memory that stays after the final whistle. Names, numbers, colour and small references make a piece personal without turning it into a costume.',list:['Read the product story before choosing a standard or personalized version.','Use the size guide and care notes before adding a piece to the bag.']},
      {heading:'A living archive',body:'New entries will be published when there is a real story to tell. Until then, the shop, league pages and Vault are the most useful ways to explore the studio.',list:['Browse by league or team to find the collection route.','Join 90+ Club for early access to selected drops.']}
    ],
    faqs:[['How often is the journal updated?','When a real studio story is ready. The page will not pretend that a placeholder is a finished editorial.'],['Can I submit a story?','The studio is not accepting a public submission form yet. Keep an eye on the current drop and account updates for future releases.'],['Where can I find older releases?','The Vault keeps selected past drops as an archive; sold-out pieces are not represented as available inventory.']]
  }
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

function useRouteMetadata({ path, product, collection, league, team }) {
  useEffect(() => {
    const publicOrigin = import.meta.env.VITE_SITE_URL || 'https://www.jersevo.com'
    const storefrontBrand = 'Jersevo'
    const productTitle = product?.seo?.title || product?.name
    const collectionTitle = collection?.seo?.title || collection?.name
    const taxonomyTitle = team?.name || league?.name
    const withBrand = value => /(?:extra time|jersevo)/i.test(value || '') ? value : `${value} — ${storefrontBrand}`
    const routeMeta = {
      '/about':['About the studio — Extra Time','Meet Extra Time, an independent fan-apparel studio making small-batch football jerseys and considered personalization.'],
      '/shipping':['Shipping and delivery — Extra Time',TRUST_PAGES.shipping.intro],
      '/returns':['Returns and personalized-order policy — Extra Time',TRUST_PAGES.returns.intro],
      '/warranty':['Warranty and defect review — Extra Time',TRUST_PAGES.warranty.intro],
      '/privacy':['Privacy and customer data — Extra Time',TRUST_PAGES.privacy.intro],
      '/terms':['Store terms — Extra Time',TRUST_PAGES.terms.intro],
      '/accessibility':['Accessibility — Extra Time',TRUST_PAGES.accessibility.intro],
      '/journal':['The Journal — Extra Time',TRUST_PAGES.journal.intro]
    }[path]
    const title = product ? withBrand(productTitle) : collection ? withBrand(collectionTitle) : taxonomyTitle ? withBrand(`${taxonomyTitle} custom fan gear`) : routeMeta?.[0] || (path === '/' ? 'Custom Jerseys & Personalized Fan Gear | Jersevo' : path === '/shop' ? 'Shop the drop — Extra Time' : path === '/membership' ? '90+ Club membership — Extra Time' : path === '/vault' ? 'The Vault — Extra Time' : 'Extra Time — Football memories, made wearable')
    const rawDescription = product ? seoDescription(product?.seo?.description, product?.description || product?.story, 160) : collection ? seoDescription(collection?.seo?.description, collection?.description, 160) : (team ? `Shop ${team.name} custom fan gear and personalized jerseys with tracked US delivery.` : league ? league.description : routeMeta?.[1] || (path === '/' ? 'Design custom jerseys and personalized fan gear with your name, number and approved listing options at Jersevo.' : path === '/membership' ? 'Join 90+ Club for eligible member pricing, standard shipping benefits and early access to selected Extra Time drops.' : 'Original football memories, designer-led jerseys and considered personalization.'))
    const description = seoDescription(rawDescription, '', 160)
    const canonicalPath = path === '/moments' || path === '/players' ? '/' : path === '/' ? '/' : path
    const canonical = `${publicOrigin.replace(/\/$/, '')}${canonicalPath}`
    const privateRoute = path.startsWith('/admin') || path === '/account' || path.startsWith('/account/') || path === '/studio' || path === '/custom' || path === '/checkout' || path === '/track-order' || path.startsWith('/order/')
    const unresolvedRoute = (path.startsWith('/product/') && !product) || (path.startsWith('/collection/') && !collection) || (path.startsWith('/league/') && !league) || (path.startsWith('/team/') && (!league || !team))
    const indexable = !privateRoute && !unresolvedRoute
    const routePage = routeMeta ? TRUST_PAGES[path.slice(1)] : null
    const image = product?.image || collection?.hero || routePage?.image || `${publicOrigin}/assets/hero-tunnel.webp`
    const absoluteImage = new URL(image,publicOrigin).toString()
    document.documentElement.lang='en-US'
    document.title=indexable ? title : `${title} · Extra Time`
    setMeta('description',description); setMeta('robots',indexable ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,nofollow'); setMeta('googlebot',indexable ? 'index,follow' : 'noindex,nofollow'); setMeta('og:site_name',storefrontBrand,true); setMeta('og:locale','en_US',true); setMeta('og:title',title,true); setMeta('og:description',description,true); setMeta('og:url',canonical,true); setMeta('og:image',absoluteImage,true); setMeta('og:image:alt',product?.alt || `${title} image`,true); setMeta('og:type',product ? 'product' : 'website',true); setMeta('twitter:card','summary_large_image'); setMeta('twitter:title',title); setMeta('twitter:description',description); setMeta('twitter:image',absoluteImage)
    setLink('canonical',canonical); setLink('alternate',canonical,{hreflang:'en-US'}); setLink('alternate',canonical,{hreflang:'x-default'})
    let schema=document.getElementById('route-structured-data')
    if(indexable && (product || collection || league)){ if(!schema){schema=document.createElement('script');schema.id='route-structured-data';schema.type='application/ld+json';document.head.appendChild(schema)}
      const breadcrumb=[{'@type':'ListItem',position:1,name:'Home',item:`${publicOrigin}/`}]
      if(product){
        const canonicalProduct=`${publicOrigin}/product/${encodeURIComponent(product.handle || product.id)}`
        const taxonomy = productTaxonomyValues(product)
        const productLeague = findLeague(taxonomy.league)
        const productTeam = productLeague ? findTeam(productLeague.key, taxonomy.team) : null
        breadcrumb.push({'@type':'ListItem',position:2,name:'Shop',item:`${publicOrigin}/shop`})
        if(productLeague) breadcrumb.push({'@type':'ListItem',position:breadcrumb.length + 1,name:productLeague.name,item:`${publicOrigin}${leaguePath(productLeague)}`})
        if(productTeam) breadcrumb.push({'@type':'ListItem',position:breadcrumb.length + 1,name:productTeam.name,item:`${publicOrigin}${teamPath(productLeague.key,productTeam)}`})
        breadcrumb.push({'@type':'ListItem',position:breadcrumb.length + 1,name:product.name,item:canonicalProduct})
        const prices=(product.variants || []).map(row=>Number(row.price)).filter(value=>Number.isFinite(value) && value>0)
        const lowest=prices.length ? Math.min(...prices) : Number(product.price || 0)
        const inventory=Number(product.inventory || 0)
        const variantOffers=(product.variants || []).filter(variant => variant.status === 'ACTIVE' && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0).slice(0,80).map(variant => ({'@type':'Offer',url:`${canonicalProduct}?variant=${encodeURIComponent(variant.id)}`,priceCurrency:'USD',price:Number(variant.price).toFixed(2),sku:variant.sku,availability:`https://schema.org/${Number(variant.inventory || 0) > 0 ? 'InStock' : 'OutOfStock'}`,itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:BUSINESS_DETAILS.legalName,alternateName:BUSINESS_DETAILS.brand,url:`${publicOrigin}/`}}))
        const productSchema={'@context':'https://schema.org','@type':'Product','@id':`${canonicalProduct}#product`,name:product.name,description,image:[...new Set([product.image,...(product.media || []).map(item=>item.url)].filter(Boolean).map(item=>new URL(item,publicOrigin).toString()))],url:canonicalProduct,brand:{'@type':'Brand',name:'Extra Time'},category:'Apparel & Accessories > Clothing > Jerseys',sku:product.variants?.[0]?.sku,offers:variantOffers.length ? (variantOffers.length === 1 ? variantOffers[0] : variantOffers) : {'@type':'Offer',url:canonicalProduct,priceCurrency:'USD',price:lowest.toFixed(2),availability:`https://schema.org/${inventory>0?'InStock':'OutOfStock'}`,itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:BUSINESS_DETAILS.legalName,alternateName:BUSINESS_DETAILS.brand,url:`${publicOrigin}/`,email:BUSINESS_DETAILS.email,address:{'@type':'PostalAddress',addressRegion:'TX',addressCountry:'US'}}}}
        if(Number(product.rating)>0 && Number(product.reviews)>0) productSchema.aggregateRating={'@type':'AggregateRating',ratingValue:Number(product.rating).toFixed(1),reviewCount:Number(product.reviews)}
        schema.textContent=JSON.stringify([productSchema,{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      } else if (collection) {
        const canonicalCollection=`${publicOrigin}/collection/${encodeURIComponent(collection.handle || collection.id)}`
        breadcrumb.push({'@type':'ListItem',position:2,name:collection.name,item:canonicalCollection})
        schema.textContent=JSON.stringify([{'@context':'https://schema.org','@type':'CollectionPage',name:collection.name,description:collection.description,url:canonicalCollection,image:collection.hero ? [new URL(collection.hero,publicOrigin).toString()] : undefined,inLanguage:'en-US'},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
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
        const canonicalTaxonomy = `${publicOrigin}${team ? teamPath(league.key,team) : leaguePath(league)}`
        breadcrumb.push({'@type':'ListItem',position:2,name:'Leagues',item:`${publicOrigin}/shop`})
        if(team) breadcrumb.push({'@type':'ListItem',position:3,name:league.name,item:`${publicOrigin}${leaguePath(league)}`},{'@type':'ListItem',position:4,name:team.name,item:canonicalTaxonomy})
        else breadcrumb.push({'@type':'ListItem',position:3,name:league.name,item:canonicalTaxonomy})
        schema.textContent=JSON.stringify([{'@context':'https://schema.org','@type':'CollectionPage',name:taxonomyTitle,description,url:canonicalTaxonomy,inLanguage:'en-US',about:{'@type':'SportsOrganization',name:taxonomyTitle}},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      }
    } else schema?.remove()
  }, [path,product?.id,product?.updatedAt,collection?.id,league?.key,team?.slug])
}

function App() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search + window.location.hash)
  const path = route.split(/[?#]/)[0]
  const search = route.includes('?') ? route.split('?')[1].split('#')[0] : ''
  const [products,setProducts] = useState(() => initialCatalog)
  const [menus,setMenus] = useState([])
  const [collections,setCollections] = useState([])
  const [theme,setTheme] = useState(() => adminTheme)
  const [catalogState,setCatalogState] = useState({ loading:!path.startsWith('/admin'), source:'preview', error:null })
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
  const customProduct = products.find(product => product.customFields?.length) || products[0]
  const productSlug = path.startsWith('/product/') ? decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() || '') : ''
  const routeProduct = productSlug ? findStorefrontProduct(products,productSlug) : null
  const collectionHandle = path.startsWith('/collection/') ? decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() || '') : new URLSearchParams(search).get('collection')
  const routeCollection = collectionHandle ? collections.find(collection => collection.handle === collectionHandle || collection.id === collectionHandle) : null
  const routeLeague = path.startsWith('/league/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : path.startsWith('/team/') ? findLeague(decodeURIComponent(path.split('/')[2] || '')) : null
  const routeTeam = path.startsWith('/team/') ? findTeam(routeLeague?.key, decodeURIComponent(path.split('/')[3] || '')) : null
  useRouteMetadata({ path, product:routeProduct, collection:routeCollection, league:routeLeague, team:routeTeam })
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
    Promise.all([
      fetchStorefrontCatalog(initialCatalog),
      fetchStorefrontMenus([]),
      fetchStorefrontCollections([]),
      fetchStorefrontTheme(null)
    ]).then(([catalogResult,menuResult,collectionResult,themeResult]) => {
      if(!active)return
      setProducts(catalogResult.data || [])
      const nextCollections = collectionResult.data || []
      const nextTheme = themeResult.data || null
      setMenus(resolveMenuImages(menuResult.data || [], { products:catalogResult.data || [], collections:nextCollections, pages:nextTheme?.pages || [] }))
      setCollections(nextCollections)
      setTheme(nextTheme)
      setCatalogState({loading:false,source:catalogResult.source,error:catalogResult.error})
    }).catch(error => active && setCatalogState({loading:false,source:'preview',error:error instanceof Error ? error.message : 'Catalogue unavailable.'}))
    return () => { active=false }
  }, [path.startsWith('/admin')])
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
    if (catalogState.loading || catalogState.source !== 'supabase') return
    setCart(current => {
      const result=reconcileCart(current,products)
      if(result.issues.length)setCartNotice(result.issues.map(issue=>issue.message).join(' '))
      return result.items
    })
  }, [products,catalogState.loading,catalogState.source])
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
    if (path !== '/custom') return
    const id = new URLSearchParams(window.location.search).get('product') || 'touchline'
    const product = findStorefrontProduct(products,id) || customProduct
    if(!product)return
    const next = `/product/${product.handle || product.id}?custom=1`
    window.history.replaceState({}, '', next)
    setRoute(next)
  }, [path,products])
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
  if (!path.startsWith('/admin') && catalogState.loading && !products.length) page = <div className="route-loading"><span>90+</span><p>Loading published catalogue…</p></div>
  else if (path === '/') page = <Home onQuickView={setQuickViewProduct} products={products} theme={theme} collections={collections}/>
  else if (path === '/moments') page = <Home onQuickView={setQuickViewProduct} products={products} theme={theme} collections={collections}/>
  else if (path === '/players') page = <Home onQuickView={setQuickViewProduct} products={products} theme={theme} collections={collections}/>
  else if (path === '/shop' || path === '/collection' || path.startsWith('/collection/')) page = <Shop onQuickView={setQuickViewProduct} products={products} collection={routeCollection}/>
  else if (path.startsWith('/league/')) page = routeLeague ? <TaxonomyLanding league={routeLeague} products={products} onQuickView={setQuickViewProduct}/> : <NotFound/>
  else if (path.startsWith('/team/')) page = routeLeague && routeTeam ? <TaxonomyLanding league={routeLeague} team={routeTeam} products={products} onQuickView={setQuickViewProduct}/> : <NotFound/>
  else if (path === '/custom') {
    const customProductId = new URLSearchParams(window.location.search).get('product') || 'touchline'
    const requested = findStorefrontProduct(products,customProductId) || customProduct
    page = requested ? <ProductPage key={requested.id} product={requested} products={products} onAdd={addToCart} onQuickView={setQuickViewProduct} startPersonalized account={account}/> : <NotFound/>
  }
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
      <Header bagCount={bagCount} openCart={() => setCartOpen(true)} openSearch={() => setSearchOpen(true)} openInstall={() => setInstallOpen(true)} appInstalled={appInstalled} menus={menus} customProduct={customProduct} account={account}/>
      {catalogState.error && <div className="catalog-runtime-notice" role="status">Live catalogue is temporarily unavailable. Purchasing is paused until fresh published data is available.</div>}
      {page}
      <Footer openSizeGuide={() => setSizeGuideOpen(true)} menus={menus} customProduct={customProduct}/>
      <FixedFooterMenu path={path} bagCount={bagCount} openCart={() => setCartOpen(true)} menus={menus} customProduct={customProduct} hidden={footerActuallyHidden}/>
      <InstallAppSheet open={installOpen} onClose={() => setInstallOpen(false)} deferredPrompt={installPrompt} onInstalled={() => setAppInstalled(true)} onPromptUsed={() => setInstallPrompt(null)}/>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} products={products}/>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} updateQty={updateQty} account={account} memberQuote={memberQuote} quoteLoading={quoteLoading} quoteError={quoteError} cartNotice={cartNotice} onCheckout={openCheckout} products={products} onAdd={addToCart}/>
      <QuickView key={quickViewProduct?.id || 'closed'} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAdd={addToCart}/>
      <SizeFinder open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)}/>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
