import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Sparkles,
  Star
} from 'lucide-react'

export const MAX_NAME_LENGTH = 12
export const MAX_NUMBER_LENGTH = 2

export const LEAGUE_LISTINGS = [
  {
    id: 'mls-touchline',
    league: 'MLS',
    leagueName: 'Major League Soccer',
    leagueMark: '/assets/leagues/marks/mls.webp',
    title: 'TOUCHLINE 04 PRO',
    subtitle: 'Matchday Custom Rear View',
    image: '/assets/venom-mockup-back.webp',
    alt: 'MLS Matchday custom jersey rear view photo',
    productHandle: 'touchline',
    price: 109,
    compareAt: 130,
    textColor: '#f4f3ee',
    strokeColor: '#f8f04a',
    isDark: true,
    badge: 'LIVE REAR VIEW',
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
  {
    id: 'nfl-after-90',
    league: 'NFL',
    leagueName: 'National Football League',
    leagueMark: '/assets/leagues/marks/nfl.webp',
    title: 'AFTER 90 NIGHTWAY',
    subtitle: 'Night Game Gridiron Cut',
    image: '/assets/jersey-black.webp',
    alt: 'NFL Night Game black matchday jersey photo',
    productHandle: 'after-90',
    price: 89,
    compareAt: 110,
    textColor: '#f4f3ee',
    strokeColor: '#22c55e',
    isDark: true,
    badge: 'BEST SELLER',
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
  {
    id: 'nba-home-end',
    league: 'NBA',
    leagueName: 'National Basketball Association',
    leagueMark: '/assets/leagues/marks/nba.webp',
    title: 'HOME END TERRACE',
    subtitle: 'Hardwood Oxblood Edition',
    image: '/assets/jersey-oxblood.webp',
    alt: 'NBA Hardwood oxblood jersey photo',
    productHandle: 'home-end',
    price: 95,
    compareAt: 115,
    textColor: '#f4f3ee',
    strokeColor: '#f8f04a',
    isDark: true,
    badge: 'LOW STOCK',
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
  {
    id: 'mlb-chalk-lines',
    league: 'MLB',
    leagueName: 'Major League Baseball',
    leagueMark: '/assets/leagues/marks/mlb.webp',
    title: 'CHALK LINES DIAMOND',
    subtitle: 'Tactics Diamond Edition',
    image: '/assets/jersey-white.webp',
    alt: 'MLB Chalk Lines diamond white jersey photo',
    productHandle: 'chalk-lines',
    price: 92,
    compareAt: 110,
    textColor: '#141414',
    strokeColor: '#d72c2c',
    isDark: false,
    badge: 'NEW DROP',
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  }
]

export function cleanName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9À-Ỹ -]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH)
}

export function cleanNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(0, MAX_NUMBER_LENGTH)
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function HomeJerseyPersonalizer({ onAdd, product, products = [] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [name, setName] = useState(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem('jersevo_home_custom') || '{}')
      if (saved.name) return cleanName(saved.name)
    } catch {}
    return 'MARTA'
  })
  const [number, setNumber] = useState(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem('jersevo_home_custom') || '{}')
      if (saved.number) return cleanNumber(saved.number)
    } catch {}
    return '10'
  })
  const [selectedSize, setSelectedSize] = useState('L')
  const [added, setAdded] = useState(false)
  const touchStartX = useRef(null)

  const activeListing = LEAGUE_LISTINGS[activeIndex] || LEAGUE_LISTINGS[0]

  useEffect(() => {
    try {
      window.sessionStorage.setItem('jersevo_home_custom', JSON.stringify({ name, number }))
    } catch {}
  }, [name, number])

  const prevSlide = () => {
    setActiveIndex(current => (current > 0 ? current - 1 : LEAGUE_LISTINGS.length - 1))
    setAdded(false)
  }

  const nextSlide = () => {
    setActiveIndex(current => (current < LEAGUE_LISTINGS.length - 1 ? current + 1 : 0))
    setAdded(false)
  }

  const handleTouchStart = e => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = e => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (diff > 45) nextSlide()
    else if (diff < -45) prevSlide()
    touchStartX.current = null
  }

  const handlePreset = (presetName, presetNum) => {
    setName(cleanName(presetName))
    setNumber(cleanNumber(presetNum))
  }

  const handleAddToCart = () => {
    const handle = activeListing.productHandle
    const foundProduct = (products || []).find(p => p.handle === handle || p.id === handle) || product || (products || [])[0]
    if (!foundProduct) {
      navigate(`/product/${handle}?custom=1&name=${encodeURIComponent(name)}&number=${encodeURIComponent(number)}`)
      return
    }

    const availableVariants = foundProduct.variants || []
    const matchingVariant = availableVariants.find(v => v.values?.Size === selectedSize) || availableVariants[0]

    if (typeof onAdd === 'function') {
      onAdd(foundProduct, {
        variant: matchingVariant,
        options: {
          Size: selectedSize,
          ...(matchingVariant?.values?.Colour ? { Colour: matchingVariant.values.Colour } : {})
        },
        customization: {
          fields: { name, number },
          values: { name, number },
          note: `Personalized on homepage: ${activeListing.league} ${activeListing.title}`
        }
      })
      setAdded(true)
      window.setTimeout(() => setAdded(false), 2400)
    } else {
      navigate(`/product/${foundProduct.handle || foundProduct.id || handle}?custom=1&name=${encodeURIComponent(name)}&number=${encodeURIComponent(number)}`)
    }
  }

  const handleViewDetails = () => {
    const handle = activeListing.productHandle
    let customQuery = ''
    if (name) customQuery += `&name=${encodeURIComponent(name)}`
    if (number) customQuery += `&number=${encodeURIComponent(number)}`
    navigate(`/product/${handle}?custom=1${customQuery}`)
  }

  const displayName = name || 'YOUR NAME'
  const displayNumber = number || '00'

  return (
    <div className="home-personalizer">
      {/* 1. League Tabs Selector */}
      <div className="home-personalizer__leagues-bar" role="tablist" aria-label="Select League Jersey">
        {LEAGUE_LISTINGS.map((listing, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={listing.id}
              role="tab"
              aria-selected={isActive}
              className={`home-personalizer__league-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => { setActiveIndex(index); setAdded(false) }}
            >
              <img src={listing.leagueMark} alt={`${listing.league} mark`} className="home-personalizer__league-mark" />
              <span>{listing.league}</span>
            </button>
          )
        })}
      </div>

      {/* 2. Real Listing Photo Stage with Slide & Live Jersey Decal Overlay */}
      <div
        className="home-personalizer__stage-wrap"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <span className="axis-label axis-label--top">LIVE REAR VIEW · MADE ON DEMAND</span>

        <div className="home-personalizer__photo-stage">
          <img
            src={activeListing.image}
            alt={activeListing.alt}
            className="home-personalizer__photo"
            loading="eager"
          />

          {/* Authentic Athletic Jersey Overlay */}
          <div className={`home-personalizer__decal-overlay ${activeListing.isDark ? 'is-dark' : 'is-light'}`}>
            <div className="home-personalizer__decal-nameplate">
              <span
                className="home-personalizer__jersey-name"
                style={{
                  color: activeListing.textColor,
                  fontSize: `clamp(14px, ${Math.max(16, Math.min(32, 280 / Math.max(displayName.length, 6)))}px, 34px)`
                }}
              >
                {displayName}
              </span>
            </div>
            <div className="home-personalizer__decal-number">
              <span
                className="home-personalizer__jersey-number"
                style={{
                  color: activeListing.textColor,
                  WebkitTextStroke: `2px ${activeListing.strokeColor}`
                }}
              >
                {displayNumber}
              </span>
            </div>
          </div>

          {/* Photo Stage Badges */}
          <div className="home-personalizer__badge-overlay">
            <div className="home-personalizer__pill-badge">
              <img src={activeListing.leagueMark} alt="" />
              <span>{activeListing.league} · {activeListing.badge}</span>
            </div>
            <div className="home-personalizer__live-status">
              <span className="live-dot" />
              <span>LIVE MOCKUP</span>
            </div>
          </div>

          {/* Slide Navigation Buttons */}
          <button
            className="home-personalizer__slide-arrow home-personalizer__slide-arrow--prev"
            onClick={prevSlide}
            aria-label="Previous league jersey slide"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="home-personalizer__slide-arrow home-personalizer__slide-arrow--next"
            onClick={nextSlide}
            aria-label="Next league jersey slide"
          >
            <ChevronRight size={20} />
          </button>

          {/* Slide Dots */}
          <div className="home-personalizer__dots" aria-hidden="true">
            {LEAGUE_LISTINGS.map((item, idx) => (
              <button
                key={item.id}
                tabIndex={-1}
                className={`home-personalizer__dot ${idx === activeIndex ? 'is-active' : ''}`}
                onClick={() => { setActiveIndex(idx); setAdded(false) }}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        <span className="axis-label axis-label--bottom">REAL LISTING PHOTO · INSTANT ON-DEMAND</span>
      </div>

      {/* 3. PDP-Like Interactive Customizer Controls */}
      <div className="home-personalizer__panel">
        {/* Listing Title & Price row */}
        <div className="home-personalizer__listing-head">
          <div className="home-personalizer__listing-titles">
            <span className="home-personalizer__listing-sub">{activeListing.subtitle}</span>
            <h3 className="home-personalizer__listing-name">{activeListing.title}</h3>
            <div className="home-personalizer__rating">
              <span className="home-personalizer__stars" aria-hidden="true">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={13} fill="#e5a914" stroke="#e5a914" />
                ))}
              </span>
              <span>4.9 (420+ fans)</span>
            </div>
          </div>
          <div className="home-personalizer__listing-pricing">
            <strong className="home-personalizer__price">${activeListing.price}</strong>
            {activeListing.compareAt && (
              <span className="home-personalizer__compare">${activeListing.compareAt}</span>
            )}
            <span className="home-personalizer__tag">MADE TO ORDER</span>
          </div>
        </div>

        {/* Inputs: Name & Number */}
        <form className="home-personalizer__controls" onSubmit={e => e.preventDefault()}>
          <div className="home-personalizer__field">
            <label htmlFor="home-jersey-name">
              NAME <span>MAX {MAX_NAME_LENGTH}</span>
            </label>
            <input
              id="home-jersey-name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              spellCheck="false"
              onChange={e => setName(cleanName(e.target.value))}
              placeholder="YOUR NAME"
            />
          </div>
          <div className="home-personalizer__field home-personalizer__field--number">
            <label htmlFor="home-jersey-number">
              NUMBER <span>00–99</span>
            </label>
            <input
              id="home-jersey-number"
              value={number}
              maxLength={MAX_NUMBER_LENGTH}
              inputMode="numeric"
              autoComplete="off"
              onChange={e => setNumber(cleanNumber(e.target.value))}
              placeholder="07"
            />
          </div>
        </form>

        {/* Presets Row */}
        <div className="home-personalizer__presets">
          <span className="home-personalizer__preset-tip">Popular:</span>
          <button type="button" className="home-personalizer__chip" onClick={() => handlePreset('MARTA', '10')}>MARTA 10</button>
          <button type="button" className="home-personalizer__chip" onClick={() => handlePreset('MESSI', '10')}>MESSI 10</button>
          <button type="button" className="home-personalizer__chip" onClick={() => handlePreset('BRADY', '12')}>BRADY 12</button>
          <button type="button" className="home-personalizer__chip" onClick={() => handlePreset('JORDAN', '23')}>JORDAN 23</button>
        </div>

        {/* Size Selection Pills */}
        <div className="home-personalizer__sizes">
          <div className="home-personalizer__sizes-header">
            <span>CHOOSE SIZE:</span>
            <strong>{selectedSize}</strong>
          </div>
          <div className="home-personalizer__size-pills">
            {activeListing.sizes.map(size => {
              const isSelected = size === selectedSize
              return (
                <button
                  key={size}
                  type="button"
                  className={`home-personalizer__size-pill ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSize(size)}
                >
                  {size}
                </button>
              )
            })}
          </div>
        </div>

        {/* Action Buttons: ADD TO BAG & VIEW DETAILS */}
        <div className="home-personalizer__actions">
          <button
            type="button"
            className={`button button--acid home-personalizer__btn-add ${added ? 'is-added' : ''}`}
            onClick={handleAddToCart}
          >
            {added ? (
              <>
                <Check size={18} /> ADDED TO BAG!
              </>
            ) : (
              <>
                <ShoppingBag size={18} /> ADD TO BAG · ${activeListing.price}
              </>
            )}
          </button>
          <button
            type="button"
            className="button button--dark home-personalizer__btn-pdp"
            onClick={handleViewDetails}
          >
            <span>PDP DETAILS</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
