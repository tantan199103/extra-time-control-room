import React, { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleUserRound,
  Copy,
  Heart,
  Lock,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react'
import { products, searchGroups, storyPoints } from './data'
import './styles.css'

const AdminApp = lazy(() => import('./admin'))

const money = value => `$${value.toFixed(0)}`

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
  window.scrollTo({ top: 0, behavior: 'instant' })
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

function Header({ bagCount, openCart, openSearch }) {
  const [mega, setMega] = useState(null)
  const [mobile, setMobile] = useState(false)
  const links = ['SHOP', 'MOMENTS', 'PLAYERS', 'CUSTOM LAB']
  const openLink = label => {
    if (label === 'SHOP') navigate('/shop')
    else if (label === 'CUSTOM LAB') navigate('/custom')
    else {
      navigate('/')
      const target = label === 'MOMENTS' ? '#story' : '#players'
      window.setTimeout(() => document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' }), 30)
    }
    setMega(null)
    setMobile(false)
  }

  return (
    <>
      <Announcement />
      <header className="site-header" onMouseLeave={() => setMega(null)}>
        <Mark />
        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map(link => (
            <button key={link} onMouseEnter={() => setMega(link)} onFocus={() => setMega(link)} onClick={() => openLink(link)}>
              {link}
            </button>
          ))}
          <button onClick={() => navigate('/vault')}>THE VAULT</button>
        </nav>
        <div className="header-actions">
          <button className="text-action" onClick={openSearch}><Search size={16} /> <span>SEARCH</span></button>
          <button className="text-action desktop-account"><CircleUserRound size={16} /> <span>ACCOUNT</span></button>
          <button className="text-action" onClick={openCart}><ShoppingBag size={16} /> <span>BAG ({bagCount})</span></button>
          <IconButton label="Open menu" className="mobile-menu-button" onClick={() => setMobile(true)}><Menu /></IconButton>
        </div>
        {mega && <MegaMenu active={mega} onNavigate={openLink} />}
      </header>
      <div className={`mobile-menu ${mobile ? 'is-open' : ''}`} aria-hidden={!mobile}>
        <div className="mobile-menu__top"><Mark inverted /><IconButton label="Close menu" onClick={() => setMobile(false)}><X /></IconButton></div>
        <nav>
          {links.map((link, index) => <button key={link} onClick={() => openLink(link)}><span>0{index + 1}</span>{link}<ArrowRight /></button>)}
          <button onClick={() => { navigate('/vault'); setMobile(false) }}><span>05</span>THE VAULT<ArrowRight /></button>
        </nav>
        <div className="mobile-menu__foot"><button onClick={() => { setMobile(false); openSearch() }}>Search the archive</button><span>USD / EN</span></div>
      </div>
    </>
  )
}

function MegaMenu({ active, onNavigate }) {
  const menus = {
    SHOP: ['New drop', 'Best sellers', 'Jerseys', 'T-shirts', 'Last chance'],
    MOMENTS: ['Extra time', 'Final whistle', 'Homecoming', 'Night games', 'View all stories'],
    PLAYERS: ['The No. 9', 'The playmaker', 'The captain', 'The keeper', 'Your player'],
    'CUSTOM LAB': ['Create a jersey', 'Name & number', 'Team order', 'Saved designs', 'How it works']
  }
  return (
    <div className="mega-menu">
      <div className="mega-menu__index">{active === 'CUSTOM LAB' ? 'MAKE' : 'FIND'}<br />YOUR<br />MOMENT<span>90+</span></div>
      <div className="mega-menu__links">
        <p>{active}</p>
        {menus[active].map(item => <button key={item} onClick={() => onNavigate(active)}>{item}<ArrowRight size={15} /></button>)}
      </div>
      <button className="mega-menu__feature" onClick={() => active === 'CUSTOM LAB' ? navigate('/custom') : navigate('/product/after-90')}>
        <img src={active === 'CUSTOM LAB' ? '/assets/jersey-white.webp' : '/assets/editorial-player.webp'} alt="" />
        <span>{active === 'CUSTOM LAB' ? 'CUSTOM LAB' : 'THE 90+ DROP'}<small>{active === 'CUSTOM LAB' ? 'BUILD YOURS' : 'DISCOVER THE STORY'} <ArrowRight size={14} /></small></span>
      </button>
    </div>
  )
}

function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])
  const matchingProducts = products.filter(product => `${product.name} ${product.story} ${product.meta}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className={`overlay search-overlay ${open ? 'is-open' : ''}`} aria-hidden={!open}>
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
            <button key={product.id} onClick={() => { onClose(); navigate(`/product/${product.id}`) }}>
              <img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.meta}</small></span><span>{money(product.price)}</span>
            </button>
          ))}
          {!matchingProducts.length && <div className="empty-search">Try a moment like “night”, a place like “home”, or a colour.</div>}
        </div>
      )}
    </div>
  )
}

function CartDrawer({ open, onClose, cart, updateQty }) {
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)
  const remaining = Math.max(0, 100 - subtotal)
  return (
    <>
      <button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close bag" />
      <aside className={`cart-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="drawer-head"><h2>YOUR BAG <span>{cart.reduce((sum, item) => sum + item.qty, 0)}</span></h2><IconButton label="Close bag" onClick={onClose}><X /></IconButton></div>
        {!cart.length ? (
          <div className="empty-cart"><span>90+</span><h3>THE NEXT MEMORY<br />STARTS HERE.</h3><p>Your bag is empty. The archive is not.</p><button className="button button--dark" onClick={() => { onClose(); navigate('/shop') }}>EXPLORE THE DROP</button></div>
        ) : (
          <>
            <div className="cart-status"><Check size={16} /> Added to your bag</div>
            <div className="cart-items">
              {cart.map(item => <div className="cart-item" key={`${item.product.id}-${item.size}`}>
                <img src={item.product.image} alt="" />
                <div><h3>{item.product.name}</h3><p>Size {item.size}</p><div className="qty"><button onClick={() => updateQty(item, -1)}><Minus size={14} /></button><span>{item.qty}</span><button onClick={() => updateQty(item, 1)}><Plus size={14} /></button></div></div>
                <strong>{money(item.product.price * item.qty)}</strong>
              </div>)}
            </div>
            <div className="shipping-meter">
              <p>{remaining ? `${money(remaining)} AWAY FROM FREE SHIPPING` : 'FREE SHIPPING UNLOCKED'}</p>
              <div><span style={{ width: `${Math.min(100, subtotal)}%` }} /></div>
            </div>
            <div className="cart-cross-sell"><p>COMPLETE THE LOOK</p><button><img src="/assets/jersey-white.webp" alt=""/><span>CHALK SHORTS<small>+$54</small></span><Plus size={18}/></button></div>
            <div className="cart-checkout"><div><span>SUBTOTAL</span><strong>{money(subtotal)}</strong></div><button>CHECKOUT — {money(subtotal)}</button><p>Secure checkout · Easy returns</p></div>
          </>
        )}
      </aside>
    </>
  )
}

function ButtonLink({ children, light = false, onClick, className = '' }) {
  return <button className={`button-link ${light ? 'button-link--light' : ''} ${className}`} onClick={onClick}><span>{children}</span><ArrowRight size={17} /></button>
}

function Hero() {
  return (
    <section className="hero">
      <img src="/assets/hero-tunnel.webp" alt="A player entering a rain-soaked stadium from a dark tunnel" />
      <div className="hero__wash" />
      <div className="hero__time" aria-hidden="true">90<span>+</span></div>
      <div className="hero__content">
        <p>THE 90+ COLLECTION · DROP 01</p>
        <h1>EVERY JERSEY<br />HOLDS A MEMORY.<br /><span>MAKE YOURS.</span></h1>
        <div className="hero__actions"><button className="button button--light" onClick={() => navigate('/shop')}>SHOP THE DROP</button><ButtonLink light onClick={() => document.querySelector('#story')?.scrollIntoView({ behavior: 'smooth' })}>DISCOVER THE STORY</ButtonLink></div>
      </div>
      <div className="hero__meta"><span>DESIGNED FOR THE MINUTES<br />THAT STAY WITH YOU.</span><button onClick={() => document.querySelector('#drop')?.scrollIntoView({ behavior: 'smooth' })}>SCROLL TO KICK OFF <ArrowDown size={16}/></button></div>
    </section>
  )
}

function DropFeature() {
  return (
    <section className="drop-feature section" id="drop">
      <div className="section-kicker"><span>THE DROP</span><span>01 / 04</span></div>
      <div className="drop-feature__copy">
        <h2>AFTER<br />NINETY.</h2>
        <div><p>Some games finish at the whistle.<br />The important ones never do.</p><ButtonLink onClick={() => navigate('/product/after-90')}>ENTER THE COLLECTION</ButtonLink></div>
      </div>
      <button className="drop-feature__media" onClick={() => navigate('/product/after-90')} aria-label="Discover After 90">
        <img src="/assets/editorial-player.webp" alt="Player after a night match" />
        <span className="media-note">DROP 01<span>ASPHALT / RAIN / 22:47</span></span>
        <span className="media-stamp">90<sup>+</sup></span>
      </button>
    </section>
  )
}

function Rating({ value, reviews }) {
  return <span className="rating"><span>★★★★★</span> {value} <small>({reviews})</small></span>
}

function ProductCard({ product, onAdd }) {
  return (
    <article className="product-card">
      <button className="product-card__image" onClick={() => navigate(`/product/${product.id}`)}>
        <img src={product.image} alt={product.alt} loading="lazy" />
        <span className="product-badge">{product.badge}</span>
        <span className="heart"><Heart size={19}/></span>
        <span className="quick-add" onClick={event => { event.stopPropagation(); onAdd(product, 'M') }}>QUICK ADD · M <Plus size={16}/></span>
      </button>
      <button className="product-card__info" onClick={() => navigate(`/product/${product.id}`)}>
        <span><strong>{product.name}</strong><small>{product.meta}</small></span>
        <span className="product-card__price"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</span>
      </button>
      <Rating value={product.rating} reviews={product.reviews}/>
    </article>
  )
}

function ProductRail({ onAdd, title = 'THE DROP', items = products.slice(0, 4) }) {
  return (
    <section className="product-section section">
      <div className="section-title-row"><h2>{title}</h2><ButtonLink onClick={() => navigate('/shop')}>SHOP ALL</ButtonLink></div>
      <div className="product-grid">{items.map(product => <ProductCard key={product.id} product={product} onAdd={onAdd}/>)}</div>
    </section>
  )
}

function StoryExplorer() {
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
      <div className="story-explorer__foot"><span>AFTER 90 / MEMORY JERSEY 01</span><ButtonLink light onClick={() => navigate('/product/after-90')}>READ THE FULL STORY</ButtonLink></div>
    </section>
  )
}

function PlayerDiscovery() {
  const cards = [
    { name: 'THE CAPTAIN', count: 12, img: '/assets/hero-tunnel.webp', pos: '68%' },
    { name: 'THE PLAYMAKER', count: 9, img: '/assets/editorial-player.webp', pos: '50%' },
    { name: 'YOUR NAME', count: '∞', img: '/assets/jersey-white.webp', pos: '50%' }
  ]
  return (
    <section className="players-section section" id="players">
      <div className="section-title-row"><h2>WHO DO YOU<br />PLAY FOR?</h2><p>Find a shirt by the role you remember,<br />not just the name on the back.</p></div>
      <div className="player-grid">{cards.map((card, index) => <button key={card.name} onClick={() => index === 2 ? navigate('/custom') : navigate('/shop')}><img src={card.img} alt="" style={{ objectPosition: `${card.pos} center` }}/><span>{card.name}<small>{card.count} {card.count === '∞' ? 'POSSIBILITIES' : 'STORIES'} <ArrowRight size={15}/></small></span></button>)}</div>
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

function CustomTeaser() {
  const [nameIndex, setNameIndex] = useState(0)
  const names = [['TAN', '07'], ['ALEX', '10'], ['YOURS', '23']]
  useEffect(() => {
    const timer = setInterval(() => setNameIndex(value => (value + 1) % names.length), 1800)
    return () => clearInterval(timer)
  }, [])
  return (
    <section className="custom-teaser" id="custom">
      <div className="custom-teaser__grid" aria-hidden="true" />
      <div className="custom-teaser__copy"><p>CUSTOM LAB / DESIGNER EDITION</p><h2>YOUR STORY.<br /><span>YOUR JERSEY.</span></h2><p className="custom-teaser__body">70% of the artwork stays fixed.<br />You choose the details that make it yours.</p><button className="button button--acid" onClick={() => navigate('/custom')}>START PERSONALIZING <ArrowRight size={17}/></button></div>
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
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const submit = event => { event.preventDefault(); if (email.includes('@')) setDone(true) }
  return (
    <section className="newsletter">
      <span className="newsletter__number">90<sup>+</sup></span>
      <div><p>NEXT DROP / EARLY ACCESS</p><h2>BE THERE<br />BEFORE THE<br />WHISTLE.</h2></div>
      {done ? <div className="newsletter__success"><Check/><strong>YOU'RE ON THE TEAM.</strong><span>Watch your inbox before the next drop.</span></div> : <form onSubmit={submit}><label htmlFor="email">EMAIL ADDRESS</label><div><input id="email" type="email" placeholder="you@email.com" value={email} onChange={event => setEmail(event.target.value)} required/><button aria-label="Join early access"><ArrowRight/></button></div><p>Drop alerts only. No weekly noise.</p></form>}
    </section>
  )
}

function Footer() {
  return (
    <footer>
      <div className="footer__top"><Mark inverted/><p>Football memories,<br />made wearable.</p></div>
      <div className="footer__links"><div><span>SHOP</span><button onClick={() => navigate('/shop')}>New drop</button><button onClick={() => navigate('/shop')}>Jerseys</button><button onClick={() => navigate('/custom')}>Custom lab</button></div><div><span>STORIES</span><button>Moments</button><button onClick={() => navigate('/vault')}>The vault</button><button>Our process</button></div><div><span>HELP</span><button>Size guide</button><button>Shipping</button><button>Returns</button></div><div><span>FOLLOW</span><button>Instagram</button><button>TikTok</button><button>Journal</button></div></div>
      <div className="footer__wordmark">EXTRA TIME<span>+</span></div>
      <div className="footer__legal"><span>© 2026 EXTRA TIME STUDIO</span><span>PRIVACY · TERMS · ACCESSIBILITY</span><span>MADE FOR THE GAME AFTER THE GAME.</span></div>
    </footer>
  )
}

function Home({ onAdd }) {
  return <><Hero/><DropFeature/><ProductRail onAdd={onAdd}/><StoryExplorer/><PlayerDiscovery/><CustomTeaser/><VaultTeaser/><Manifesto/><Newsletter/></>
}

function Shop({ onAdd }) {
  const [filter, setFilter] = useState('ALL')
  const [sort, setSort] = useState('FEATURED')
  const [filterOpen, setFilterOpen] = useState(false)
  let shown = filter === 'ALL' ? products : products.filter(product => product.color.toUpperCase() === filter)
  shown = [...shown].sort((a, b) => sort === 'PRICE LOW' ? a.price - b.price : sort === 'PRICE HIGH' ? b.price - a.price : 0)
  return (
    <main className="shop-page">
      <section className="collection-hero"><p>DROP 01 · LIVE NOW</p><h1>THE 90+<br />COLLECTION</h1><div><p>Six original jerseys built from the<br />minutes football gives us back.</p><span>{shown.length} PRODUCTS</span></div></section>
      <div className="filter-bar">
        <div className="desktop-filters"><span>FILTER</span>{['ALL', 'BLACK', 'WHITE', 'OXBLOOD'].map(item => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
        <button className="mobile-filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/> FILTER · {filter}</button>
        <label>SORT <select value={sort} onChange={event => setSort(event.target.value)}><option>FEATURED</option><option>PRICE LOW</option><option>PRICE HIGH</option></select><ChevronDown size={15}/></label>
      </div>
      <section className="shop-grid section"><div className="product-grid">{shown.map(product => <ProductCard key={product.id} product={product} onAdd={onAdd}/>)}</div></section>
      <div className={`filter-sheet ${filterOpen ? 'is-open' : ''}`}><div><h2>FILTER</h2><IconButton label="Close filters" onClick={() => setFilterOpen(false)}><X/></IconButton></div><p>COLOUR</p>{['ALL', 'BLACK', 'WHITE', 'OXBLOOD'].map(item => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}<span>{item === 'ALL' ? products.length : products.filter(product => product.color.toUpperCase() === item).length}</span></button>)}<button className="button button--dark" onClick={() => setFilterOpen(false)}>SHOW {shown.length} PRODUCTS</button></div>
      <Newsletter/>
    </main>
  )
}

function SizeFinder({ open, onClose, onRecommend }) {
  const [height, setHeight] = useState(175)
  const [weight, setWeight] = useState(72)
  const [fit, setFit] = useState('RELAXED')
  const getSize = () => weight < 60 ? 'S' : weight < 76 ? (fit === 'RELAXED' ? 'L' : 'M') : weight < 90 ? (fit === 'RELAXED' ? 'XL' : 'L') : 'XXL'
  return (
    <div className={`size-modal ${open ? 'is-open' : ''}`} aria-hidden={!open}><button className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-label="Close size finder"/><div className="size-modal__panel"><div className="drawer-head"><h2>FIND MY SIZE</h2><IconButton label="Close" onClick={onClose}><X/></IconButton></div><p>Two measurements. One clearer choice.</p><label>HEIGHT <strong>{height} CM</strong><input type="range" min="150" max="200" value={height} onChange={event => setHeight(Number(event.target.value))}/></label><label>WEIGHT <strong>{weight} KG</strong><input type="range" min="45" max="110" value={weight} onChange={event => setWeight(Number(event.target.value))}/></label><div className="fit-toggle"><span>PREFERRED FIT</span>{['ATHLETIC', 'RELAXED'].map(item => <button className={fit === item ? 'is-active' : ''} key={item} onClick={() => setFit(item)}>{item}</button>)}</div><div className="size-result"><span>WE RECOMMEND</span><strong>{getSize()}</strong><p>For {height} cm / {weight} kg in a {fit.toLowerCase()} fit.</p></div><button className="button button--dark" onClick={() => { onRecommend(getSize()); onClose() }}>CHOOSE SIZE {getSize()}</button></div></div>
  )
}

function ProductPage({ product, onAdd }) {
  const [size, setSize] = useState('')
  const [selectedColor, setSelectedColor] = useState(product.color)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [finder, setFinder] = useState(false)
  const [activeStory, setActiveStory] = useState(storyPoints[0])
  const colorImages = { Black: '/assets/jersey-black.webp', White: '/assets/jersey-white.webp', Oxblood: '/assets/jersey-oxblood.webp' }
  const add = () => { if (!size) { setFinder(true); return } onAdd({ ...product, color: selectedColor, image: colorImages[selectedColor] || product.image }, size) }
  const gallery = [colorImages[selectedColor] || product.image, '/assets/editorial-player.webp', '/assets/jersey-black.webp', '/assets/hero-tunnel.webp']
  return (
    <main className="pdp">
      <div className="pdp__commerce">
        <button className="pdp__back" onClick={() => navigate('/shop')}><ArrowLeft size={16}/> BACK TO THE DROP</button>
        <div className="pdp__gallery" onScroll={event => setGalleryIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>{gallery.map((img, index) => <figure key={`${img}-${index}`} className={index === 3 ? 'wide' : ''}><img src={img} alt={`${product.name} view ${index + 1}`}/><span>{String(index + 1).padStart(2, '0')} / 04</span></figure>)}</div>
        <div className="pdp__gallery-meta"><span>{String(galleryIndex + 1).padStart(2, '0')} / 04</span><span>SWIPE TO EXPLORE</span></div>
        <aside className="pdp__info">
          <p className="product-badge static">{product.badge}</p>
          <h1>{product.name}</h1>
          <p className="pdp__story">{product.story}</p>
          <Rating value={product.rating} reviews={product.reviews}/>
          <div className="pdp__price"><strong>{money(product.price)}</strong>{product.compareAt && <del>{money(product.compareAt)}</del>}</div>
          <div className="option-block"><div><span>COLOUR</span><strong>{selectedColor}</strong></div><div className="swatches"><button className={`black ${selectedColor === 'Black' ? 'is-active' : ''}`} aria-label="Black" onClick={() => setSelectedColor('Black')}/><button className={`chalk ${selectedColor === 'White' ? 'is-active' : ''}`} aria-label="Chalk" onClick={() => setSelectedColor('White')}/><button className={`oxblood ${selectedColor === 'Oxblood' ? 'is-active' : ''}`} aria-label="Oxblood" onClick={() => setSelectedColor('Oxblood')}/></div></div>
          <div className="option-block"><div><span>SIZE</span><button onClick={() => setFinder(true)}>FIND MY SIZE</button></div><div className="sizes">{['XS','S','M','L','XL','XXL'].map(item => <button className={size === item ? 'is-active' : ''} onClick={() => setSize(item)} key={item}>{item}</button>)}</div><p className="model-size">Model is 180 cm / 74 kg and wears M.</p></div>
          <button className="pdp__personalize" onClick={() => navigate('/custom')}><span><small>MAKE IT YOURS</small><strong>ADD NAME + NUMBER</strong><em>Artwork stays fixed. Your details make the difference.</em></span><ArrowRight size={18}/></button>
          <button className="pdp__add" onClick={add}>{size ? `ADD TO BAG — ${money(product.price)}` : 'SELECT SIZE TO ADD'}</button>
          <div className="pdp__promises"><span><Check size={16}/> Ships in 48 hours</span><span><Check size={16}/> 14-day returns</span><span><Check size={16}/> Secure checkout</span></div>
          <details><summary>THE PRODUCT <Plus/></summary><p>Heavyweight recycled knit, engineered for everyday wear. Original artwork with embroidered details and a ribbed collar.</p></details>
          <details><summary>SHIPPING & RETURNS <Plus/></summary><p>Worldwide tracked shipping. Easy returns within 14 days of delivery.</p></details>
        </aside>
      </div>
      <section className="pdp-story">
        <div className="pdp-story__intro"><p>WHY THIS JERSEY EXISTS</p><h2>THE GAME ENDS.<br /><span>THE FEELING DOESN'T.</span></h2><p>After 90 takes the details around a night match—the concrete, floodlights, wet lines and noise—and turns them into something you can keep.</p></div>
        <div className="pdp-story__explore"><div className="pdp-story__image"><img src="/assets/jersey-black.webp" alt="After 90 detail"/>{storyPoints.map((point, index) => <button key={point.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} className={activeStory.id === point.id ? 'is-active' : ''} onClick={() => setActiveStory(point)}>0{index + 1}</button>)}</div><div className="pdp-story__text"><span>{String(storyPoints.indexOf(activeStory)+1).padStart(2,'0')} / 04</span><h3>{activeStory.title}</h3><p>{activeStory.text}</p></div></div>
      </section>
      <section className="timeline"><p>THE 90 MINUTES / RECONSTRUCTED</p><div>{[['00′','THE WALK IN'],['45′','THE HALF-LIGHT'],['89′','THE WAIT'],['90+','THE MEMORY']].map((item,index) => <div key={item[0]} className={index === 3 ? 'active' : ''}><strong>{item[0]}</strong><span>{item[1]}</span></div>)}</div></section>
      <ProductRail title="THE SAME FEELING" items={products.filter(item => item.id !== product.id).slice(0,4)} onAdd={onAdd}/>
      <SizeFinder open={finder} onClose={() => setFinder(false)} onRecommend={setSize}/>
      <div className="mobile-sticky-atc"><span><strong>{money(product.price)}</strong>{size || 'Select size'}</span><button onClick={add}>{size ? 'ADD TO BAG' : 'CHOOSE SIZE'}</button></div>
    </main>
  )
}

function CustomLab({ onAdd }) {
  const [state, setState] = useState(() => {
    const params = new URLSearchParams(location.search)
    return {
      base: params.get('base') ? `#${params.get('base')}` : '#111111',
      accent: params.get('accent') ? `#${params.get('accent')}` : '#F8F04A',
      name: (params.get('name') || 'TAN').slice(0, 12).toUpperCase(),
      number: (params.get('number') || '07').replace(/\D/g, '').slice(0, 2),
      teamCity: (params.get('team') || 'SAIGON').slice(0, 14).toUpperCase(),
      year: (params.get('year') || '2026').replace(/\D/g, '').slice(0, 4),
      photoUrl: '',
      size: 'M',
      view: 'back'
    }
  })
  const [saved, setSaved] = useState(false)
  const update = (key, value) => setState(current => ({ ...current, [key]: value }))
  const [personalizeOpen, setPersonalizeOpen] = useState(true)
  const fileRef = useRef(null)
  const colors = [['#111111','#F8F04A','NIGHT / FLOODLIGHT'],['#F1F0E9','#111111','CHALK / INK'],['#711E25','#F8F04A','OXBLOOD / SIGNAL']]
  const share = async () => {
    const params = new URLSearchParams({ name: state.name, number: state.number, team: state.teamCity, year: state.year, base: state.base.slice(1), accent: state.accent.slice(1) })
    const url = `${location.origin}/custom?${params.toString()}`
    try { await navigator.clipboard.writeText(url); setSaved(true); setTimeout(() => setSaved(false), 2200) } catch { setSaved(true) }
  }
  const handlePhoto = event => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update('photoUrl', reader.result)
    reader.readAsDataURL(file)
  }
  const customProduct = { ...products[5], name: `${state.name || 'YOUR'} · ${state.number || '00'}`, price: 109 }
  return (
    <main className="lab-page">
      <section className="lab">
        <div className="lab__preview">
          <div className="lab__preview-head"><span>CUSTOM LAB / DESIGN 001</span><span>ARTWORK LOCKED <Lock size={12}/></span></div>
          <div className="lab__canvas-grid" />
          <div className="lab__measure lab__measure--v"><span>600 MM</span></div><div className="lab__measure lab__measure--h"><span>520 MM</span></div>
          <JerseySvg {...state}/>
          <div className="lab__view"><button className={state.view === 'front' ? 'is-active' : ''} onClick={() => update('view','front')}>FRONT</button><button className={state.view === 'back' ? 'is-active' : ''} onClick={() => update('view','back')}>BACK</button></div>
          <div className="lab__lock-note"><Lock size={13}/> 70% DESIGN SYSTEM LOCKED</div>
        </div>
        <aside className="lab__controls">
          <div className="lab__title"><span><Sparkles size={16}/> CUSTOM LAB / DESIGNER EDITION</span><h1>MAKE IT<br />PERSONAL.</h1><p>The artwork is the point of view.<br />You add the memory.</p><div className="lab-ratio"><span><b style={{width:'70%'}}/>70% artwork</span><span><b style={{width:'30%'}}/>30% your details</span></div></div>
          <div className="lab-option lab-option--locked"><div className="lab-option__head"><span>01</span><h2>ARTWORK SYSTEM</h2><Lock size={15}/></div><p>Composition, typography, texture, effects and hierarchy are locked by the designer. Every jersey keeps the same visual signature.</p><button onClick={() => setPersonalizeOpen(value => !value)}>{personalizeOpen ? 'HIDE PERSONALIZATION' : 'EDIT PERSONALIZATION'}<ChevronDown size={15} className={personalizeOpen ? 'rotate' : ''}/></button></div>
          {personalizeOpen && <div className="lab-personalization"><div className="lab-option"><div className="lab-option__head"><span>02</span><h2>NAME + NUMBER</h2></div><label>NAME<input maxLength="12" value={state.name} onChange={event => update('name', event.target.value.toUpperCase().replace(/[^A-Z ]/g,''))} placeholder="YOUR NAME"/></label><label>NUMBER<input maxLength="2" inputMode="numeric" value={state.number} onChange={event => update('number', event.target.value.replace(/\D/g,''))} placeholder="00"/></label></div>
          <div className="lab-option"><div className="lab-option__head"><span>03</span><h2>TEAM / CITY</h2></div><input aria-label="Team or city" className="lab-wide-input" maxLength="14" value={state.teamCity} onChange={event => update('teamCity', event.target.value.toUpperCase().replace(/[^A-Z0-9 /-]/g,''))} placeholder="TEAM OR CITY"/><div className="lab-suggestions">{['SAIGON','LONDON','HOME END','YOUR TEAM'].map(item => <button className={state.teamCity === item ? 'is-active' : ''} key={item} onClick={() => update('teamCity', item)}>{item}</button>)}</div></div>
          <div className="lab-option"><div className="lab-option__head"><span>04</span><h2>YEAR</h2></div><div className="year-picker">{['1998','2010','2026','YOUR YEAR'].map(item => <button className={state.year === item ? 'is-active' : ''} key={item} onClick={() => update('year', item === 'YOUR YEAR' ? '' : item)}>{item}</button>)}</div>{state.year === '' && <input aria-label="Year" className="lab-wide-input" maxLength="4" inputMode="numeric" value={state.year} onChange={event => update('year', event.target.value.replace(/\D/g,''))} placeholder="YYYY"/>}</div>
          <div className="lab-option"><div className="lab-option__head"><span>05</span><h2>COLOUR</h2></div><div className="lab-colors">{colors.map(([base,accent,label]) => <button key={base} className={state.base === base ? 'is-active' : ''} onClick={() => setState(current => ({...current, base, accent}))}><i style={{background:base}}><b style={{background:accent}}/></i><span>{label}</span><Check size={16}/></button>)}</div></div>
          <div className="lab-option"><div className="lab-option__head"><span>06</span><h2>OPTIONAL PHOTO</h2><span className="optional">OPTIONAL</span></div><input ref={fileRef} onChange={handlePhoto} type="file" accept="image/*" hidden/><button className={`photo-upload ${state.photoUrl ? 'has-photo' : ''}`} onClick={() => fileRef.current?.click()}>{state.photoUrl ? <><img src={state.photoUrl} alt="Uploaded personal reference"/><span>REPLACE PHOTO</span></> : <><Plus size={16}/><span>ADD A SMALL PERSONAL REFERENCE</span></>}</button><p className="field-help">One image, cropped into the fixed artwork frame. We never change the layout.</p></div>
          <div className="lab-option"><div className="lab-option__head"><span>07</span><h2>SIZE TO ORDER</h2></div><div className="sizes">{['XS','S','M','L','XL','XXL'].map(item => <button className={state.size === item ? 'is-active' : ''} onClick={() => update('size', item)} key={item}>{item}</button>)}</div></div></div>}
          <div className="lab__summary"><div><span>DESIGNER EDITION / {state.name || 'YOUR NAME'} {state.number || '00'}</span><strong>$109</strong></div><button onClick={() => onAdd(customProduct, state.size)}>ADD TO BAG</button><button className="lab__share" onClick={share}>{saved ? <><Check/> LINK COPIED</> : <><Copy/> SHARE DESIGN</>}</button><p>Artwork locked · Personalization preview · Ships in 7–10 days</p></div>
        </aside>
      </section>
      <section className="custom-story"><p>YOUR LEGACY / SAVED IN THE DETAILS</p><h2>{state.name || 'YOUR NAME'}<br /><span>{state.number || '00'}</span></h2><p>Made for your moment.<br />Nobody else's.</p></section>
    </main>
  )
}

function VaultPage() {
  return (
    <main className="vault-page"><section className="vault-page__hero"><p>THE ARCHIVE / 2023—2026</p><h1>THE<br />VAULT.</h1><span>Every drop leaves a story.<br />Some never return.</span></section><section className="vault-page__list">{[['2025','THE LONG WALK','A jersey about leaving the tunnel for the last time.','/assets/hero-tunnel.webp'],['2024','HOME AFTER DARK','Made from the sound of a wet five-a-side court.','/assets/editorial-player.webp'],['2023','FIRST TOUCH','Our first study of football memory.','/assets/jersey-white.webp']].map((item,index) => <article key={item[0]}><span>{item[0]}</span><img src={item[3]} alt=""/><div><p>SOLD OUT FOREVER / 0{index+1}</p><h2>{item[1]}</h2><span>{item[2]}</span><ButtonLink light>VIEW THE STORY</ButtonLink></div></article>)}</section><Newsletter/></main>
  )
}

function NotFound() {
  return <main className="not-found"><span>90+</span><h1>FULL TIME.</h1><p>That page has left the pitch.</p><button className="button button--dark" onClick={() => navigate('/')}>BACK TO HOME</button></main>
}

function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [cart, setCart] = useState([])
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => { document.body.classList.toggle('no-scroll', searchOpen || cartOpen) }, [searchOpen, cartOpen])
  if (path.startsWith('/admin')) return <Suspense fallback={<div className="admin-loading"><span>90<sup>+</sup></span><p>Opening control room…</p></div>}><AdminApp /></Suspense>
  const addToCart = (product, size = 'M') => {
    setCart(current => {
      const found = current.find(item => item.product.id === product.id && item.size === size)
      return found ? current.map(item => item === found ? {...item, qty:item.qty+1} : item) : [...current, { product, size, qty: 1 }]
    })
    setCartOpen(true)
  }
  const updateQty = (target, delta) => setCart(current => current.map(item => item === target ? {...item, qty:item.qty+delta} : item).filter(item => item.qty > 0))
  const bagCount = cart.reduce((sum, item) => sum + item.qty, 0)
  let page
  if (path === '/') page = <Home onAdd={addToCart}/>
  else if (path === '/shop') page = <Shop onAdd={addToCart}/>
  else if (path === '/custom') page = <CustomLab onAdd={addToCart}/>
  else if (path === '/vault') page = <VaultPage/>
  else if (path.startsWith('/product/')) {
    const product = products.find(item => item.id === path.split('/').pop()) || products[0]
    page = <ProductPage product={product} onAdd={addToCart}/>
  } else page = <NotFound/>
  return (
    <>
      <Header bagCount={bagCount} openCart={() => setCartOpen(true)} openSearch={() => setSearchOpen(true)}/>
      {page}
      <Footer/>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)}/>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} updateQty={updateQty}/>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
