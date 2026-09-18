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
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  SlidersHorizontal,
  Ticket,
  X
} from 'lucide-react'
import { products as fallbackProducts, searchGroups, storyPoints } from './data'
import { availableOptionValue, buildFallbackCatalog, cartLineKey, findStorefrontProduct, initialSelections, isSellableVariant, menuAtLocation, optionNameLike, reconcileCart, resolveVariant, sellableVariants, sortCollectionProducts } from './lib/storefront-model'
import { createCustomizationOrder, customerAuthSnapshot, fetchStorefrontCatalog, fetchStorefrontCollections, fetchStorefrontMenus, fetchStorefrontTheme, getCustomerSessionId, requestCartValidation, requestMemberQuote, supabase, uploadCustomerReference } from './lib/supabase'
import { useDialogFocus } from './useDialogFocus'
import MembershipPage from './MembershipPage'
import './styles.css'

const AdminApp = lazy(() => import('./admin'))
const AiStudio = lazy(() => import('./AiStudio'))

const money = value => `$${value.toFixed(0)}`
const initialCatalog = buildFallbackCatalog(fallbackProducts)

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
  const configured = menuAtLocation(menus,'HEADER')?.items || menuAtLocation(menus,'HEADER_DESKTOP_MOBILE')?.items || []
  const links = configured.length ? configured : [
    {id:'shop',label:'SHOP',target:'/shop',children:[]},
    {id:'moments',label:'MOMENTS',target:'/#story',children:[]},
    {id:'players',label:'PLAYERS',target:'/#players',children:[]},
    {id:'custom',label:'CUSTOM LAB',target:'/custom',children:[]}
  ]
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
          <button className="text-action" onClick={openCart}><ShoppingBag size={16} /> <span>BAG ({bagCount})</span></button>
          <IconButton label="Open menu" className="mobile-menu-button" onClick={() => setMobile(true)}><Menu /></IconButton>
        </div>
        {mega && <MegaMenu item={mega} customProduct={customProduct} onNavigate={openLink} />}
      </header>
      <div ref={mobileRef} className={`mobile-menu ${mobile ? 'is-open' : ''}`} aria-hidden={!mobile} inert={!mobile} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}>
        <div className="mobile-menu__top"><Mark inverted /><IconButton label="Close menu" onClick={() => setMobile(false)}><X /></IconButton></div>
        <nav>
          {links.map((item, index) => <button key={item.id || item.label} onClick={() => openLink(item)}><span>{String(index+1).padStart(2,'0')}</span>{item.label}<ArrowRight /></button>)}
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
  return (
    <div className="mega-menu">
      <div className="mega-menu__index">{item.label === 'CUSTOM LAB' ? 'MAKE' : 'FIND'}<br />YOUR<br />MOMENT<span>90+</span></div>
      <div className="mega-menu__links">
        <p>{item.label}</p>
        {children.map(child => <button key={child.id || child.label} onClick={() => onNavigate(child)}>{child.label}<ArrowRight size={15} /></button>)}
      </div>
      <button className="mega-menu__feature" onClick={() => onNavigate(item.label === 'CUSTOM LAB' ? {target:customTarget} : {target:'/shop'})}>
        <img src={item.label === 'CUSTOM LAB' ? customProduct?.image || '/assets/jersey-white.webp' : '/assets/editorial-player.webp'} alt="" />
        <span>{item.label === 'CUSTOM LAB' ? 'CUSTOM LAB' : 'THE 90+ DROP'}<small>{item.label === 'CUSTOM LAB' ? 'BUILD YOURS' : 'DISCOVER THE STORY'} <ArrowRight size={14} /></small></span>
      </button>
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

function CartDrawer({ open, onClose, cart, updateQty, account, memberQuote, quoteLoading, quoteError, cartNotice }) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose)
  const publicSubtotal = cart.reduce((sum, item) => sum + Number(item.unitPrice ?? item.product.price) * item.qty, 0)
  const quoteMap = new Map((memberQuote?.lines || []).map(line => [line.lineKey,line]))
  const subtotal = memberQuote?.member ? Number(memberQuote.subtotal) : publicSubtotal
  const remaining = Math.max(0, 100 - publicSubtotal)
  return (
    <>
      <button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close bag backdrop" aria-hidden={!open} tabIndex={-1} />
      <aside ref={panelRef} className={`cart-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open} role="dialog" aria-modal="true" aria-label="Your bag" tabIndex={-1}>
        <div className="drawer-head"><h2>YOUR BAG <span>{cart.reduce((sum, item) => sum + item.qty, 0)}</span></h2><IconButton label="Close bag" onClick={onClose}><X /></IconButton></div>
        {!cart.length ? (
          <div className="empty-cart"><span>90+</span><h3>THE NEXT MEMORY<br />STARTS HERE.</h3><p>Your bag is empty. The archive is not.</p><button className="button button--dark" onClick={() => { onClose(); navigate('/shop') }}>EXPLORE THE DROP</button></div>
        ) : (
          <>
            <div className="cart-status"><Check size={16} /> Bag checked against live stock</div>
            {cartNotice && <p className="cart-runtime-notice" role="status">{cartNotice}</p>}
            <div className="cart-items">
              {cart.map(item => { const lineKey=item.key || cartLineKey(item); const clubLine=quoteMap.get(lineKey); const publicTotal=Number(item.unitPrice ?? item.product.price)*item.qty; return <div className="cart-item" key={lineKey}>
                <img src={item.product.image} alt="" />
                <div><h3>{item.product.name}</h3><p>{Object.entries(item.options || {}).map(([name,value]) => `${name} ${value}`).join(' · ') || item.sku || 'Default variation'}</p>{item.customization && <div className="cart-item__custom"><span>{Object.entries(item.customization.fields || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Custom request'}</span>{item.customization.note && <small>Note: {item.customization.note}</small>}{item.customization.aiPreviewUrl && <small>AI direction attached</small>}</div>}<div className="qty"><button onClick={() => updateQty(item, -1)} aria-label={`Decrease ${item.product.name}`}><Minus size={14} /></button><span>{item.qty}</span><button onClick={() => updateQty(item, 1)} aria-label={`Increase ${item.product.name}`}><Plus size={14} /></button></div></div>
                <strong className={clubLine?.discount>0?'cart-member-price':''}>{clubLine?.discount>0&&<del>{money(publicTotal)}</del>}{money(clubLine?.lineTotal ?? publicTotal)}{clubLine?.discount>0&&<small>90+ CLUB</small>}</strong>
              </div>})}
            </div>
            {memberQuote?.member ? <div className="cart-club-status"><Ticket size={17}/><div><strong>90+ Club pricing applied</strong><span>{memberQuote.shipping?.eligible ? `Eligible ${memberQuote.shipping.method.toLowerCase()} shipping included up to ${money(memberQuote.shipping.subsidyCap)}.` : memberQuote.shipping?.reason}</span></div></div> : <button className="cart-club-upsell" onClick={()=>{onClose();navigate('/membership')}}><Ticket/><span><strong>JOIN 90+ CLUB</strong><small>20–40% eligible savings + standard shipping benefit</small></span><ArrowRight/></button>}
            {!memberQuote?.member && <div className="shipping-meter"><p>{remaining ? `${money(remaining)} AWAY FROM FREE SHIPPING` : 'FREE SHIPPING UNLOCKED'}</p><div><span style={{ width: `${Math.min(100, publicSubtotal)}%` }} /></div></div>}
            {quoteLoading&&<p className="cart-quote-note" role="status">Checking secure member price…</p>}{quoteError&&account?.user&&<p className="cart-quote-note is-error" role="alert">{quoteError}</p>}
            <div className="cart-checkout">{memberQuote?.discount>0&&<div className="cart-checkout__saving"><span>90+ CLUB SAVING</span><strong>−{money(memberQuote.discount)}</strong></div>}<div><span>SUBTOTAL</span><strong>{money(subtotal)}</strong></div><button disabled aria-describedby="checkout-status">CHECKOUT NOT AVAILABLE YET</button><p id="checkout-status">Checkout is not connected. No payment or purchase has been made.</p></div>
          </>
        )}
      </aside>
    </>
  )
}

function ButtonLink({ children, light = false, onClick, className = '' }) {
  return <button className={`button-link ${light ? 'button-link--light' : ''} ${className}`} onClick={onClick}><span>{children}</span><ArrowRight size={17} /></button>
}

function Hero({ content = {} }) {
  return (
    <section className="hero">
      <img src="/assets/hero-tunnel.webp" alt="A player entering a rain-soaked stadium from a dark tunnel" />
      <div className="hero__wash" />
      <div className="hero__time" aria-hidden="true">90<span>+</span></div>
      <div className="hero__content">
        <p>{content.eyebrow || 'THE 90+ COLLECTION · DROP 01'}</p>
        <h1>{content.headline ? content.headline.toUpperCase() : <>EVERY JERSEY<br />HOLDS A MEMORY.<br /><span>MAKE YOURS.</span></>}</h1>
        <div className="hero__actions"><button className="button button--light" onClick={() => navigate('/shop')}>{content.button || 'SHOP THE DROP'}</button><ButtonLink light onClick={() => document.querySelector('#story')?.scrollIntoView({ behavior: 'smooth' })}>DISCOVER THE STORY</ButtonLink></div>
      </div>
      <div className="hero__meta"><span>DESIGNED FOR THE MINUTES<br />THAT STAY WITH YOU.</span><button onClick={() => document.querySelector('#drop')?.scrollIntoView({ behavior: 'smooth' })}>SCROLL TO KICK OFF <ArrowDown size={16}/></button></div>
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
      <button className="drop-feature__media" onClick={() => navigate(target)} aria-label={`Discover ${product?.name || 'the drop'}`}>
        <img src={product?.image || '/assets/editorial-player.webp'} alt={product?.alt || 'Player after a night match'} />
        <span className="media-note">DROP 01<span>ASPHALT / RAIN / 22:47</span></span>
        <span className="media-stamp">90<sup>+</sup></span>
      </button>
    </section>
  )
}

function Rating({ value, reviews }) {
  return <span className="rating"><span>★★★★★</span> {value} <small>({reviews})</small></span>
}

function ProductCard({ product, onQuickView }) {
  const available = sellableVariants(product)
  const maxPrice = Math.max(Number(product.price || 0),...available.map(variant => Number(variant.price || 0)))
  return (
    <article className="product-card">
      <button className="product-card__image" onClick={() => navigate(`/product/${product.handle || product.id}`)}>
        <img src={product.image} alt={product.alt} loading="lazy" />
        <span className="product-badge">{product.badge}</span>
        <span className="heart" aria-hidden="true"><Heart size={19}/></span>
        <span className={`quick-add ${available.length ? '' : 'is-disabled'}`} onClick={event => { event.stopPropagation(); if (available.length) onQuickView(product) }}>{available.length ? 'QUICK VIEW' : 'SOLD OUT'} {available.length ? <Plus size={16}/> : null}</span>
      </button>
      <button className="product-card__info" onClick={() => navigate(`/product/${product.handle || product.id}`)}>
        <span><strong>{product.name}</strong><small>{product.meta}</small></span>
        <span className="product-card__price"><strong>{maxPrice > Number(product.price) ? `FROM ${money(product.price)}` : money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</span>
      </button>
      {product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}
    </article>
  )
}

function ProductRail({ onQuickView, title = 'THE DROP', items = [] }) {
  return (
    <section className="product-section section">
      <div className="section-title-row"><h2>{title}</h2><ButtonLink onClick={() => navigate('/shop')}>SHOP ALL</ButtonLink></div>
      <div className="product-grid">{items.map(product => <ProductCard key={product.id} product={product} onQuickView={onQuickView}/>)}</div>
    </section>
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
    { name: 'THE CAPTAIN', count: 12, img: '/assets/hero-tunnel.webp', pos: '68%' },
    { name: 'THE PLAYMAKER', count: 9, img: '/assets/editorial-player.webp', pos: '50%' },
    { name: 'YOUR NAME', count: '∞', img: '/assets/jersey-white.webp', pos: '50%' }
  ]
  return (
    <section className="players-section section" id="players">
      <div className="section-title-row"><h2>WHO DO YOU<br />PLAY FOR?</h2><p>Find a shirt by the role you remember,<br />not just the name on the back.</p></div>
      <div className="player-grid">{cards.map((card, index) => <button key={card.name} onClick={() => index === 2 ? navigate(`/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`) : navigate('/shop')}><img src={card.img} alt="" style={{ objectPosition: `${card.pos} center` }}/><span>{card.name}<small>{card.count} {card.count === '∞' ? 'POSSIBILITIES' : 'STORIES'} <ArrowRight size={15}/></small></span></button>)}</div>
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
  return (
    <section className="newsletter">
      <span className="newsletter__number">90<sup>+</sup></span>
      <div><p>NEXT DROP / EARLY ACCESS</p><h2>BE THERE<br />BEFORE THE<br />WHISTLE.</h2></div>
      <div className="newsletter__success"><Lock/><strong>EARLY ACCESS OPENS SOON.</strong><span>Email registration is not connected yet. Explore the current drop while we get it ready.</span><button className="button-link" onClick={() => navigate('/shop')}>SHOP THE DROP <ArrowRight size={17}/></button></div>
    </section>
  )
}

function Footer({ openSizeGuide, menus = [], customProduct }) {
  const configured = menuAtLocation(menus,'FOOTER')?.items || []
  return (
    <footer>
      <div className="footer__top"><Mark inverted/><p>Football memories,<br />made wearable.</p></div>
      <div className="footer__links">
        {configured.length ? <div><span>NAVIGATE</span>{configured.map(item => <button key={item.id} onClick={() => item.type === 'EXTERNAL' ? window.open(item.target,'_blank','noopener,noreferrer') : navigate(menuTarget(item.target,customProduct))}>{item.label}</button>)}</div> : <div><span>SHOP</span><button onClick={() => navigate('/shop')}>New drop</button><button onClick={() => navigate('/shop')}>Jerseys</button><button onClick={() => navigate(`/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`)}>Custom lab</button></div>}
        <div><span>STORIES</span><button onClick={() => navigate('/#story')}>Moments</button><button onClick={() => navigate('/vault')}>The vault</button><button onClick={() => navigate('/#custom')}>How custom works</button></div>
        <div><span>90+ CLUB</span><button onClick={() => navigate('/membership')}>Membership</button><button onClick={() => navigate('/membership#join')}>Plans & benefits</button><button onClick={() => navigate('/membership#account')}>Member account</button></div>
        <div><span>HELP</span><button onClick={openSizeGuide}>Size guide</button><button disabled title="Shipping policy page has not been published">Shipping · soon</button><button disabled title="Returns policy page has not been published">Returns · soon</button></div>
        <div><span>FOLLOW · COMING SOON</span><button disabled title="Official Instagram link is not configured">Instagram</button><button disabled title="Official TikTok link is not configured">TikTok</button><button disabled title="The journal has not been published">Journal</button></div>
      </div>
      <div className="footer__wordmark">EXTRA TIME<span>+</span></div>
      <div className="footer__legal"><span>© 2026 EXTRA TIME STUDIO</span><span><button onClick={() => navigate('/privacy')}>PRIVACY</button> · <button onClick={() => navigate('/terms')}>TERMS</button> · <button onClick={() => navigate('/accessibility')}>ACCESSIBILITY</button></span><span>MADE FOR THE GAME AFTER THE GAME.</span></div>
    </footer>
  )
}

function FixedFooterMenu({ path, bagCount, openCart, menus = [], customProduct, hidden = false }) {
  const isCustom = path === '/custom' || path === '/studio' || (path.startsWith('/product/') && new URLSearchParams(window.location.search).get('custom') === '1')
  const defaults = [
    { id: 'home', label: 'Home', target: '/', icon: House, active: path === '/' },
    { id: 'shop', label: 'Shop', target: '/shop', icon: Grid2X2, active: (path === '/shop' || path.startsWith('/product/')) && !isCustom },
    { id: 'custom', label: 'Custom', target: `/product/${customProduct?.handle || customProduct?.id || 'touchline'}?custom=1`, icon: Sparkles, active: isCustom },
    { id: 'club', label: 'Club', target: '/membership', icon: Ticket, active: path === '/membership' }
  ]
  const configured = menuAtLocation(menus,'FIXED_FOOTER_MOBILE')?.items || []
  const items = configured.length ? configured.filter(item => item.target !== '#bag').map(item => { const target=menuTarget(item.target,customProduct); const Icon=/club|member/i.test(`${item.label} ${target}`) ? Ticket : /custom|studio/i.test(`${item.label} ${target}`) ? Sparkles : target === '/' ? House : Grid2X2; return {...item,target,icon:Icon,active:target === '/' ? path === '/' : target.includes('custom=1') ? isCustom : path === target || (target === '/shop' && path.startsWith('/product/') && !isCustom)} }) : defaults
  return <nav className={`fixed-footer-menu ${hidden ? 'is-hidden' : ''}`} aria-label="Quick navigation" aria-hidden={hidden}>
    {items.map(item => { const Icon = item.icon; return <button key={item.id} tabIndex={hidden ? -1 : 0} className={item.active ? 'is-active' : ''} aria-current={item.active ? 'page' : undefined} onClick={() => navigate(item.target)}><Icon size={18}/><span>{item.label}</span></button> })}
    <button tabIndex={hidden ? -1 : 0} className="fixed-footer-menu__bag" onClick={openCart} aria-label={`Open bag with ${bagCount} items`}><ShoppingBag size={18}/><span>Bag</span><b>{bagCount}</b></button>
  </nav>
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
  const featured = products[0]
  const customProduct = products.find(product => product.customFields?.length) || featured
  const primaryCollection = collections[0]
  const merchandised = primaryCollection ? sortCollectionProducts(products,primaryCollection).slice(0,4) : products.slice(0,4)
  const renderBlock = id => ({
    hero:<Hero key="hero" content={theme?.content}/>,
    drop:<DropFeature key="drop" product={featured}/>,
    rail:<ProductRail key="rail" onQuickView={onQuickView} items={merchandised}/>,
    story:<StoryExplorer key="story" product={featured}/>,
    players:<PlayerDiscovery key="players" customProduct={customProduct}/>,
    'custom-cta':<CustomTeaser key="custom-cta" product={customProduct}/>,
    vault:<VaultTeaser key="vault"/>,
    manifesto:<Manifesto key="manifesto"/>,
    newsletter:<Newsletter key="newsletter"/>
  }[id] || null)
  const configured = theme?.blocks?.length ? theme.blocks.filter(block => block.enabled !== false).map(block => block.id).filter(id => !['announcement','header','footer'].includes(id)) : ['hero','drop','rail','story','players','custom-cta','vault','manifesto','newsletter']
  return <>{configured.map(renderBlock)}</>
}

function Shop({ onQuickView, products, collection = null }) {
  const params = new URLSearchParams(window.location.search)
  const [color, setColor] = useState(params.get('color')?.toUpperCase() || 'ALL')
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
  const colours = ['ALL', ...new Set(baseProducts.flatMap(productColours).map(value => String(value).toUpperCase()))]
  const groups = ['ALL', ...new Set(baseProducts.map(product => product.productGroup).filter(Boolean))]
  let shown = baseProducts.filter(product => {
    if (color !== 'ALL' && !productColours(product).some(value => String(value).toUpperCase() === color)) return false
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
    set('color',color,'ALL'); set('group',group,'ALL'); set('type',typeFilter,'ALL'); set('sort',sort,'FEATURED')
    customOnly ? next.searchParams.set('custom','1') : next.searchParams.delete('custom')
    inStock ? next.searchParams.set('stock','1') : next.searchParams.delete('stock')
    window.history.replaceState({},'',next.pathname + next.search)
  }, [color,group,typeFilter,customOnly,inStock,sort])
  const clear = () => { setColor('ALL'); setGroup('ALL'); setTypeFilter('ALL'); setCustomOnly(false); setInStock(false) }
  const activeCount = Number(color !== 'ALL') + Number(group !== 'ALL') + Number(typeFilter !== 'ALL') + Number(customOnly) + Number(inStock)
  return (
    <main className="shop-page">
      <section className="collection-hero" style={collection?.hero ? { '--collection-image':`url(${collection.hero})` } : undefined}><p>{collection ? 'CURATED COLLECTION' : 'DROP 01 · LIVE NOW'}</p><h1>{(collection?.name || 'THE 90+ COLLECTION').toUpperCase()}</h1><div><p>{collection?.description || 'Original jerseys built from the minutes football gives us back.'}</p><span>{shown.length} PRODUCTS</span></div></section>
      <div className="filter-bar">
        <div className="desktop-filters"><span>FILTER</span>{colours.slice(0,5).map(item => <button key={item} className={color === item ? 'is-active' : ''} onClick={() => setColor(item)}>{item}</button>)}<label className="catalog-select">GROUP<select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={13}/></label><label className="catalog-select">TYPE<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="ALL">ALL</option><option value="PERSONALIZED">PERSONALIZED</option><option value="READY">READY TO SHIP</option></select><ChevronDown size={13}/></label><button className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}>CUSTOM</button><button className={inStock ? 'is-active' : ''} onClick={() => setInStock(value => !value)}>IN STOCK</button></div>
        <button className="mobile-filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/> FILTER{activeCount ? ` · ${activeCount}` : ''}</button>
        <label>SORT <select value={sort} onChange={event => setSort(event.target.value)}><option>FEATURED</option><option>NEWEST</option><option>PRICE LOW</option><option>PRICE HIGH</option></select><ChevronDown size={15}/></label>
      </div>
      {activeCount > 0 && <div className="active-filters">{color !== 'ALL' && <button onClick={() => setColor('ALL')}>{color} <X size={12}/></button>}{group !== 'ALL' && <button onClick={() => setGroup('ALL')}>{group} <X size={12}/></button>}{typeFilter !== 'ALL' && <button onClick={() => setTypeFilter('ALL')}>{typeFilter} <X size={12}/></button>}{customOnly && <button onClick={() => setCustomOnly(false)}>CUSTOM <X size={12}/></button>}{inStock && <button onClick={() => setInStock(false)}>IN STOCK <X size={12}/></button>}<button onClick={clear}>CLEAR ALL</button></div>}
      <section className="shop-grid section">{shown.length ? <div className="product-grid">{shown.map(product => <ProductCard key={product.id} product={product} onQuickView={onQuickView}/>)}</div> : <div className="catalog-empty"><span>90+</span><h2>No listing matches these filters.</h2><button onClick={clear}>Clear filters</button></div>}</section>
      <div ref={filterRef} className={`filter-sheet ${filterOpen ? 'is-open' : ''}`} aria-hidden={!filterOpen} inert={!filterOpen} role="dialog" aria-modal="true" aria-label="Filter products" tabIndex={-1}><div><h2>FILTER</h2><IconButton label="Close filters" onClick={() => setFilterOpen(false)}><X/></IconButton></div><p>COLOUR</p>{colours.map(item => <button key={item} className={color === item ? 'is-active' : ''} onClick={() => setColor(item)}>{item}<span>{item === 'ALL' ? baseProducts.length : baseProducts.filter(product => productColours(product).some(value => String(value).toUpperCase() === item)).length}</span></button>)}<p>PRODUCT GROUP</p><label className="filter-sheet__select"><select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14}/></label><p>PRODUCT TYPE</p><label className="filter-sheet__select"><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="ALL">ALL</option><option value="PERSONALIZED">PERSONALIZED</option><option value="READY">READY TO SHIP</option></select><ChevronDown size={14}/></label><button className={customOnly ? 'is-active' : ''} onClick={() => setCustomOnly(value => !value)}>CUSTOMIZABLE <span>{customOnly ? 'ON' : 'OFF'}</span></button><button className={inStock ? 'is-active' : ''} onClick={() => setInStock(value => !value)}>IN STOCK <span>{inStock ? 'ON' : 'OFF'}</span></button><button className="button button--dark" onClick={() => setFilterOpen(false)}>SHOW {shown.length} PRODUCTS</button></div>
      <Newsletter/>
    </main>
  )
}

function SizeFinder({ open, onClose, onRecommend }) {
  const panelRef = useRef(null)
  useDialogFocus(open, panelRef, onClose)
  const [height, setHeight] = useState(175)
  const [weight, setWeight] = useState(72)
  const [fit, setFit] = useState('RELAXED')
  const getSize = () => weight < 60 ? 'S' : weight < 76 ? (fit === 'RELAXED' ? 'L' : 'M') : weight < 90 ? (fit === 'RELAXED' ? 'XL' : 'L') : 'XXL'
  return (
    <div className={`size-modal ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}><button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close size finder" tabIndex={-1}/><div ref={panelRef} className="size-modal__panel" role="dialog" aria-modal="true" aria-label="Find my size" tabIndex={-1}><div className="drawer-head"><h2>FIND MY SIZE</h2><IconButton label="Close" onClick={onClose}><X/></IconButton></div><p>Approximate guidance only. Check the product measurements before ordering.</p><label>HEIGHT <strong>{height} CM</strong><input type="range" min="150" max="200" value={height} onChange={event => setHeight(Number(event.target.value))}/></label><label>WEIGHT <strong>{weight} KG</strong><input type="range" min="45" max="110" value={weight} onChange={event => setWeight(Number(event.target.value))}/></label><div className="fit-toggle"><span>PREFERRED FIT</span>{['ATHLETIC', 'RELAXED'].map(item => <button className={fit === item ? 'is-active' : ''} key={item} onClick={() => setFit(item)}>{item}</button>)}</div><div className="size-result"><span>WE RECOMMEND</span><strong>{getSize()}</strong><p>For {height} cm / {weight} kg in a {fit.toLowerCase()} fit.</p></div><button className="button button--dark" onClick={() => { onRecommend?.(getSize()); onClose() }}>{onRecommend ? `CHOOSE SIZE ${getSize()}` : 'DONE'}</button></div></div>
  )
}

function CustomFieldControl({ field, value, onChange, productId }) {
  const [uploading,setUploading] = useState(false)
  const [error,setError] = useState('')
  const common = { value:value || '', onChange:event => onChange(event.target.value), placeholder:field.placeholder || '', maxLength:field.maxLength || undefined, required:field.required }
  const upload = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    try { const result = await uploadCustomerReference(file,productId,field.key); onChange(result.imageUrl,result.storage) }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Upload failed.') }
    finally { setUploading(false); event.target.value='' }
  }
  return <label className={field.type === 'textarea' || field.type === 'photo' ? 'is-wide' : ''}><span>{field.label}{field.required && <b>Required</b>}<small>{field.help || 'Customer detail'}</small></span>{field.type === 'textarea' ? <textarea {...common}/> : field.type === 'select' ? <select {...common}><option value="">Choose…</option>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select> : field.type === 'photo' ? <div className="pdp-custom__photo">{value && <img src={value} alt={`${field.label} reference`}/>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/><strong>{uploading ? 'Uploading reference…' : value ? 'Replace photo' : 'Upload photo'}</strong><small>JPG, PNG or WebP · max 2 MB</small>{error && <em>{error}</em>}</div> : <input {...common} type="text" inputMode={field.type === 'number' ? 'numeric' : 'text'}/>}</label>
}

function ProductContentBlocks({ product }) {
  if (!product.contentBlocks?.length) return <section className="pdp-editorial-fallback"><img src={product.image} alt={product.alt}/><div><span>THE DESIGN STORY</span><h2>{product.subtitle || product.name}</h2><p>{product.description || product.story}</p></div></section>
  const media = new Map((product.media || []).map(item => [item.id,item]))
  return <section className="pdp-content"><div className="pdp-content__label">PRODUCT STORY / {product.name}</div>{product.contentBlocks.map(block => {
    const asset = media.get(block.mediaId)
    const url = block.url || asset?.url
    if (block.type === 'heading') return <h2 key={block.id}>{block.content}</h2>
    if (block.type === 'paragraph') return <p key={block.id}>{block.content}</p>
    if (block.type === 'quote') return <blockquote key={block.id}>{block.content}</blockquote>
    if (block.type === 'image' && url) return <figure key={block.id}><img src={url} alt={asset?.alt || `${product.name} story detail`}/></figure>
    if (block.type === 'video' && url) return <video key={block.id} src={url} controls preload="metadata"/>
    return null
  })}</section>
}

function ProductPage({ product, products, onAdd, onQuickView, startPersonalized = false, account }) {
  const savedDraft = readSession(`extra-time-pdp-draft-${product.id}`, {})
  const savedAi = readSession('extra-time-ai-preview')
  const aiPreview = savedAi?.productId === product.id && (!savedAi.expiresAt || savedAi.expiresAt > Date.now()) ? savedAi : null
  const customFields = product.customFields || []
  const options = product.options || []
  const sizeName = optionNameLike(product,['size'])
  const initial = { ...(savedDraft?.selections || {}) }
  if (sizeName && savedDraft?.size) initial[sizeName] = savedDraft.size
  const [selections,setSelections] = useState(() => {
    const next = initialSelections(product,initial)
    options.forEach(option => { if (option.values.length === 1) next[option.name] = option.values[0] })
    return next
  })
  const [galleryIndex,setGalleryIndex] = useState(0)
  const [finder,setFinder] = useState(false)
  const [personalized,setPersonalized] = useState(Boolean(customFields.length && (startPersonalized || new URLSearchParams(window.location.search).get('custom') === '1' || aiPreview)))
  const [customValues,setCustomValues] = useState(savedDraft?.values || {})
  const [assetRefs,setAssetRefs] = useState(savedDraft?.assetRefs || {})
  const [customNote,setCustomNote] = useState(savedDraft?.note || '')
  const [requestKey,setRequestKey] = useState(savedDraft?.requestKey || `request_${globalThis.crypto.randomUUID().replace(/-/g,'')}`)
  const [customError,setCustomError] = useState('')
  const [submitting,setSubmitting] = useState(false)
  const [added,setAdded] = useState(false)
  const completeSelection = options.every(option => selections[option.name])
  const selectedVariant = completeSelection ? (product.variants || []).find(variant => options.every(option => variant.values?.[option.name] === selections[option.name])) : options.length ? null : product.variants?.[0]
  const displayVariant = selectedVariant || resolveVariant(product,selections) || product.variants?.find(variant => Number(variant.inventory || 0) > 0) || product.variants?.[0]
  const currentPrice = Number(displayVariant?.price ?? product.price)
  const currentCompare = displayVariant?.compareAt ?? product.compareAt
  const soldOut = selectedVariant ? Number(selectedVariant.inventory || 0) < 1 : false
  const swatchColor = value => ({black:'#111111',white:'#eeeeea',chalk:'#eeeeea',oxblood:'#711e25',red:'#b52b2b',blue:'#244c89',navy:'#15233d',green:'#315c43',purple:'#5f3a78'}[String(value).toLowerCase()] || String(value))
  useEffect(() => { if (startPersonalized && customFields.length) setPersonalized(true) }, [startPersonalized,customFields.length])
  useEffect(() => {
    try { window.sessionStorage.setItem(`extra-time-pdp-draft-${product.id}`, JSON.stringify({ values:customValues,assetRefs,note:customNote,selections,requestKey })) } catch {}
  }, [product.id,customValues,assetRefs,customNote,selections,requestKey])
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
    setCustomValues(current => ({...current,[field.key]:field.type === 'photo' ? value : value.slice(0,field.maxLength || 500)})); setCustomError(''); setAdded(false)
    if(field.type === 'photo')setAssetRefs(current => assetRef ? {...current,[field.key]:assetRef} : Object.fromEntries(Object.entries(current).filter(([key])=>key!==field.key)))
  }
  const openAi = () => { navigate(`/studio?product=${product.handle || product.id}`) }
  const add = async () => {
    if (!selectedVariant) { if (sizeName && !selections[sizeName]) setFinder(true); else setCustomError('Choose every product option before adding to your bag.'); return }
    if (soldOut) { setCustomError('This variation is sold out. Choose another option.'); return }
    if (!personalized) { onAdd(product,{variant:selectedVariant,options:selections}); setAdded(true); return }
    const missing = customFields.filter(field => field.required && !String(customValues[field.key] || '').trim())
    if (missing.length) { setCustomError(`Complete: ${missing.map(field => field.label).join(', ')}.`); return }
    const fields = Object.fromEntries(customFields.map(field => [field.key,String(customValues[field.key] || '').trim()]))
    if (!Object.values(fields).some(Boolean) && !customNote.trim() && !aiPreview) { setCustomError('Add at least one detail, a studio note, or an AI direction.'); return }
    setSubmitting(true); setCustomError('')
    try {
      const result = await createCustomizationOrder({ sessionId:getCustomerSessionId(),idempotencyKey:requestKey,productId:product.id,variantId:selectedVariant.id,fields,assetRefs,note:customNote.trim(),aiPreviewId:aiPreview?.previewId || null,aiPreviewUrl:aiPreview?.imageUrl || null,aiPrompt:aiPreview?.prompt || null })
      const customization = { requestId:result.data.id, fields, note:customNote.trim(), aiPreviewUrl:aiPreview?.imageUrl || null, aiPrompt:aiPreview?.prompt || null }
      onAdd({...product,image:aiPreview?.imageUrl || displayVariant?.image || product.image},{variant:selectedVariant,options:selections,customization})
      setAdded(true)
      setRequestKey(`request_${globalThis.crypto.randomUUID().replace(/-/g,'')}`)
    } catch(caught) { setCustomError(caught instanceof Error ? caught.message : 'The custom request could not be saved.') }
    finally { setSubmitting(false) }
  }
  const media = (product.media?.length ? product.media : [{id:'primary',type:'IMAGE',url:product.image,alt:product.alt}]).filter(item => item.url)
  const gallery = aiPreview ? [{id:'ai-preview',type:'IMAGE',url:aiPreview.imageUrl,alt:'Attached AI direction'},...media] : media
  return <main className="pdp">
    <div className="pdp__commerce">
      <button className="pdp__back" onClick={() => navigate('/shop')}><ArrowLeft size={16}/> BACK TO THE DROP</button>
      <div className="pdp__gallery" onScroll={event => setGalleryIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>{gallery.map((item,index) => <figure key={`${item.id}-${index}`} className={index > 0 && index % 3 === 0 ? 'wide' : ''}>{item.type === 'VIDEO' ? <video src={item.url} controls preload="metadata"/> : <img src={item.url} alt={item.alt || `${product.name} view ${index+1}`}/>}<span>{String(index+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span></figure>)}</div>
      <div className="pdp__gallery-meta"><span>{String(galleryIndex+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span><span>SWIPE TO EXPLORE</span></div>
      <aside className="pdp__info">
        {product.badge && <p className="product-badge static">{product.badge}</p>}<h1>{product.name}</h1><p className="pdp__story">{product.story}</p>{product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}<div className="pdp__price"><strong>{money(currentPrice)}</strong>{currentCompare > currentPrice && <del>{money(Number(currentCompare))}</del>}</div><button className="pdp__club" onClick={()=>navigate('/membership')}><Ticket size={16}/><span><strong>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'90+ Club member pricing':'Members save 20–40% on eligible pieces'}</strong><small>{['ACTIVE','TRIALING'].includes(account?.membership?.status)?'Your secure price is calculated in the bag.':'See the season pass and shipping benefit.'}</small></span><ArrowRight size={16}/></button>
        {options.map(option => { const swatch = ['color','colour'].includes(option.name.toLowerCase()); return <div className="option-block" key={option.name}><div><span>{option.name.toUpperCase()}</span>{option.name === sizeName && <button onClick={() => setFinder(true)}>FIND MY SIZE</button>}<strong>{selections[option.name] || 'Choose'}</strong></div><div className={swatch ? 'swatches swatches--dynamic' : 'sizes'}>{option.values.map(value => { const other = Object.fromEntries(Object.entries(selections).filter(([name]) => name !== option.name)); const available=availableOptionValue(product,option.name,value,other); return <button key={value} disabled={!available} className={`${selections[option.name] === value ? 'is-active' : ''} ${swatch ? 'dynamic-swatch' : ''}`} style={swatch ? {'--swatch':swatchColor(value)} : undefined} aria-label={`${option.name} ${value}${available ? '' : ' unavailable'}`} onClick={() => chooseOption(option.name,value)}>{swatch ? <span>{value}</span> : value}</button> })}</div></div> })}
        {selectedVariant && <p className={`pdp-stock ${soldOut ? 'is-out' : Number(selectedVariant.inventory) <= 5 ? 'is-low' : ''}`}>{soldOut ? 'Sold out' : Number(selectedVariant.inventory) <= 5 ? `Only ${selectedVariant.inventory} left` : 'In stock'} · {selectedVariant.sku}</p>}
        {customFields.length > 0 && <section className={`pdp-custom ${personalized ? 'is-open' : ''}`}><div className="pdp-custom__choice" aria-label="Order type"><button className={!personalized ? 'is-active' : ''} onClick={() => chooseOrderType(false)}><span>Standard</span><small>As shown</small></button><button className={personalized ? 'is-active' : ''} onClick={() => chooseOrderType(true)}><span>Personalized</span><small>{customFields.slice(0,2).map(field => field.label).join(' + ')}{customFields.length > 2 ? ' + more' : ''}</small></button></div>{personalized && <div className="pdp-custom__body"><div className="pdp-custom__intro"><span><Lock size={14}/> DESIGNER ARTWORK STAYS FIXED</span><p>Only the fields enabled for this listing can change.</p></div><div className="pdp-custom__fields">{customFields.map(field => <CustomFieldControl key={field.id || field.key} field={field} value={customValues[field.key]} onChange={(value,assetRef) => updateCustom(field,value,assetRef)} productId={product.id}/>)}</div><label className="pdp-custom__note"><span>Note to the studio <small>Optional</small></span><textarea value={customNote} onChange={event => {setCustomNote(event.target.value.slice(0,500));setCustomError('');setAdded(false)}} placeholder="Placement, spelling or anything the studio should confirm…"/><small>{customNote.length}/500</small></label>{aiPreview && <div className="pdp-custom__ai-ready"><Sparkles size={15}/><span><strong>AI direction attached</strong><small>Stored securely and reviewed before production.</small></span><img src={aiPreview.imageUrl} alt="Attached AI direction"/></div>}<button className="pdp-custom__ai" onClick={openAi}><Sparkles size={16}/><span><strong>Edit more with AI</strong><small>Create one coordinated direction from this exact listing image.</small></span><ArrowRight size={16}/></button>{customError && <p className="pdp-custom__error" role="alert">{customError}</p>}</div>}</section>}
        <div className="pdp__decision"><span><i/> {personalized ? 'Made to order' : 'Published stock'}</span><strong>{personalized ? 'Artwork confirmed before production' : soldOut ? 'Choose another variation' : 'Ready to ship'}</strong><small>Tracked delivery · Final artwork review · 14-day standard returns</small></div>
        <button className={`pdp__add ${added ? 'is-added' : ''}`} onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING CUSTOM REQUEST…' : added ? <><Check size={17}/> ADDED TO BAG</> : !selectedVariant ? 'CHOOSE OPTIONS TO ADD' : soldOut ? 'SOLD OUT' : `${personalized ? 'ADD PERSONALIZED' : 'ADD TO BAG'} — ${money(currentPrice)}`}</button>
        <div className="pdp__promises"><span><Check size={16}/> Tracked delivery</span><span><Check size={16}/> Artwork review</span><span><Check size={16}/> Secure request</span></div><details><summary>THE PRODUCT <Plus/></summary><p>{product.description || 'Original football artwork made for everyday wear.'}</p></details><details><summary>SHIPPING & RETURNS <Plus/></summary><p>Production timing is confirmed before checkout. Standard pieces can be returned within 14 days; personalized work is reviewed before production.</p></details>
      </aside>
    </div>
    <ProductContentBlocks product={product}/>
    <ProductRail title="THE SAME FEELING" items={products.filter(item => item.id !== product.id).slice(0,4)} onQuickView={onQuickView}/>
    <SizeFinder open={finder} onClose={() => setFinder(false)} onRecommend={value => sizeName && chooseOption(sizeName,value)}/>
    <div className="mobile-sticky-atc"><span><strong>{money(currentPrice)}</strong>{selectedVariant ? `${Object.values(selections).join(' · ')} · ${personalized ? 'Personalized' : 'Standard'}` : 'Choose options'}</span><button onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING…' : added ? 'ADDED' : selectedVariant ? (personalized ? 'ADD CUSTOM' : 'ADD TO BAG') : 'CHOOSE OPTIONS'}</button></div>
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

function PolicyPage({ type }) {
  const content = {
    privacy:['Privacy','We collect only the details needed to prepare orders, respond to requests and operate the store. Customer references and AI previews are stored for a limited review period and are never used as public product media without permission.'],
    terms:['Terms','Product availability, production timing and final pricing are confirmed before payment. Personalized work enters production only after the customer has approved the artwork direction.'],
    accessibility:['Accessibility','Extra Time is designed for keyboard, touch and assistive-technology use. If any part of the store prevents access, contact the studio with the page and action you were trying to complete.'],
    shipping:['Shipping','Standard delivery timing, eligible destinations and production windows are confirmed before payment. The live rate and destination rules will be shown during checkout.'],
    returns:['Returns','Standard pieces can be returned within 14 days in unused condition. Personalized work is reviewed before production and may be excluded after artwork approval.'],
    journal:['Journal','The Extra Time journal is being assembled from the stories behind each drop. Visit the current collection while new entries are prepared.']
  }[type]
  return <main className="policy-page"><span>EXTRA TIME / STORE POLICY</span><h1>{content[0]}</h1><p>{content[1]}</p><h2>What to expect</h2><p>Clear product information, visible order states and a human review before personalized production. Full operational contact and policy details will be added before checkout is enabled.</p><button className="button button--dark" onClick={() => navigate('/shop')}>BACK TO THE DROP</button></main>
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

function useRouteMetadata({ path, product, collection }) {
  useEffect(() => {
    const publicOrigin = import.meta.env.VITE_SITE_URL || 'https://www.jersevo.com'
    const productTitle = product?.seo?.title || product?.name
    const collectionTitle = collection?.seo?.title || collection?.name
    const withBrand = value => /extra time/i.test(value || '') ? value : `${value} — Extra Time`
    const title = product ? withBrand(productTitle) : collection ? withBrand(collectionTitle) : path === '/shop' ? 'Shop the drop — Extra Time' : path === '/membership' ? '90+ Club membership — Extra Time' : path === '/vault' ? 'The Vault — Extra Time' : 'Extra Time — Football memories, made wearable'
    const description = product?.seo?.description || product?.description || product?.story || collection?.seo?.description || collection?.description || (path === '/membership' ? 'Join 90+ Club for eligible member pricing, standard shipping benefits and early access to selected Extra Time drops.' : 'Original football memories, designer-led jerseys and considered personalization.')
    const canonicalPath = path === '/moments' || path === '/players' ? '/' : path === '/' ? '/' : path
    const canonical = `${publicOrigin.replace(/\/$/, '')}${canonicalPath}`
    const privateRoute = path.startsWith('/admin') || path === '/account' || path.startsWith('/account/') || path === '/studio' || path === '/custom'
    const unresolvedRoute = (path.startsWith('/product/') && !product) || (path.startsWith('/collection/') && !collection)
    const indexable = !privateRoute && !unresolvedRoute
    const image = product?.image || collection?.hero || `${publicOrigin}/assets/hero-tunnel.webp`
    const absoluteImage = new URL(image,publicOrigin).toString()
    document.documentElement.lang='en-US'
    document.title=indexable ? title : `${title} · Extra Time`
    setMeta('description',description.slice(0,180)); setMeta('robots',indexable ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,nofollow'); setMeta('googlebot',indexable ? 'index,follow' : 'noindex,nofollow'); setMeta('og:site_name','Extra Time',true); setMeta('og:locale','en_US',true); setMeta('og:title',title,true); setMeta('og:description',description.slice(0,200),true); setMeta('og:url',canonical,true); setMeta('og:image',absoluteImage,true); setMeta('og:image:alt',product?.alt || `${title} image`,true); setMeta('og:type',product ? 'product' : 'website',true); setMeta('twitter:card','summary_large_image'); setMeta('twitter:title',title); setMeta('twitter:description',description.slice(0,200)); setMeta('twitter:image',absoluteImage)
    setLink('canonical',canonical); setLink('alternate',canonical,{hreflang:'en-US'}); setLink('alternate',canonical,{hreflang:'x-default'})
    let schema=document.getElementById('route-structured-data')
    if(indexable && (product || collection)){ if(!schema){schema=document.createElement('script');schema.id='route-structured-data';schema.type='application/ld+json';document.head.appendChild(schema)}
      const breadcrumb=[{'@type':'ListItem',position:1,name:'Home',item:`${publicOrigin}/`}]
      if(product){
        const canonicalProduct=`${publicOrigin}/product/${encodeURIComponent(product.handle || product.id)}`
        breadcrumb.push({'@type':'ListItem',position:2,name:'Shop',item:`${publicOrigin}/shop`},{'@type':'ListItem',position:3,name:product.name,item:canonicalProduct})
        const prices=(product.variants || []).map(row=>Number(row.price)).filter(value=>Number.isFinite(value) && value>0)
        const lowest=prices.length ? Math.min(...prices) : Number(product.price || 0)
        const inventory=Number(product.inventory || 0)
        const productSchema={'@context':'https://schema.org','@type':'Product','@id':`${canonicalProduct}#product`,name:product.name,description,image:[...new Set([product.image,...(product.media || []).map(item=>item.url)].filter(Boolean).map(item=>new URL(item,publicOrigin).toString()))],url:canonicalProduct,brand:{'@type':'Brand',name:'Extra Time'},category:'Apparel & Accessories > Clothing > Jerseys',sku:product.variants?.[0]?.sku,offers:{'@type':'Offer',url:canonicalProduct,priceCurrency:'USD',price:lowest.toFixed(2),availability:`https://schema.org/${inventory>0?'InStock':'OutOfStock'}`,itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:'Extra Time',url:`${publicOrigin}/`}}}
        if(Number(product.rating)>0 && Number(product.reviews)>0) productSchema.aggregateRating={'@type':'AggregateRating',ratingValue:Number(product.rating).toFixed(1),reviewCount:Number(product.reviews)}
        schema.textContent=JSON.stringify([productSchema,{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      } else {
        const canonicalCollection=`${publicOrigin}/collection/${encodeURIComponent(collection.handle || collection.id)}`
        breadcrumb.push({'@type':'ListItem',position:2,name:collection.name,item:canonicalCollection})
        schema.textContent=JSON.stringify([{'@context':'https://schema.org','@type':'CollectionPage',name:collection.name,description:collection.description,url:canonicalCollection,image:collection.hero ? [new URL(collection.hero,publicOrigin).toString()] : undefined,inLanguage:'en-US'},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumb}])
      }
    } else schema?.remove()
  }, [path,product?.id,product?.updatedAt,collection?.id])
}

function App() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search + window.location.hash)
  const path = route.split(/[?#]/)[0]
  const search = route.includes('?') ? route.split('?')[1].split('#')[0] : ''
  const [products,setProducts] = useState(() => import.meta.env.DEV ? initialCatalog : [])
  const [menus,setMenus] = useState([])
  const [collections,setCollections] = useState([])
  const [theme,setTheme] = useState(null)
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
  const productSlug = path.startsWith('/product/') ? decodeURIComponent(path.split('/').pop()) : ''
  const routeProduct = productSlug ? findStorefrontProduct(products,productSlug) : null
  const collectionHandle = path.startsWith('/collection/') ? decodeURIComponent(path.split('/').pop()) : new URLSearchParams(search).get('collection')
  const routeCollection = collectionHandle ? collections.find(collection => collection.handle === collectionHandle || collection.id === collectionHandle) : null
  useRouteMetadata({ path, product:routeProduct, collection:routeCollection })
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
      setMenus(menuResult.data || [])
      setCollections(collectionResult.data || [])
      setTheme(themeResult.data || null)
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
  else if (path === '/custom') {
    const customProductId = new URLSearchParams(window.location.search).get('product') || 'touchline'
    const requested = findStorefrontProduct(products,customProductId) || customProduct
    page = requested ? <ProductPage key={requested.id} product={requested} products={products} onAdd={addToCart} onQuickView={setQuickViewProduct} startPersonalized account={account}/> : <NotFound/>
  }
  else if (path === '/studio') page = <Suspense fallback={<div className="admin-loading"><span>90<sup>+</sup></span><p>Opening AI edit…</p></div>}><AiStudio key={search} products={products}/></Suspense>
  else if (path === '/membership' || path === '/account/membership') page = <MembershipPage account={account} onAccountChange={setAccount}/>
  else if (path === '/vault') page = (!theme?.pages?.length || theme.pages.some(page => page.path === '/vault' && page.status === 'PUBLISHED')) ? <VaultPage/> : <NotFound/>
  else if (['/privacy','/terms','/accessibility','/shipping','/returns','/journal'].includes(path)) page=<PolicyPage type={path.slice(1)}/>
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
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} updateQty={updateQty} account={account} memberQuote={memberQuote} quoteLoading={quoteLoading} quoteError={quoteError} cartNotice={cartNotice}/>
      <QuickView key={quickViewProduct?.id || 'closed'} product={quickViewProduct} onClose={() => setQuickViewProduct(null)} onAdd={addToCart}/>
      <SizeFinder open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)}/>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
