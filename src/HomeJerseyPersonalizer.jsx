import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  RefreshCw,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Tag
} from 'lucide-react'
import { apiFetch } from './lib/api-client'
import { getCustomerSessionId } from './lib/supabase'
import { trackCustomizeProduct } from './lib/meta-pixel'

export const MAX_NAME_LENGTH = 12
export const MAX_NUMBER_LENGTH = 2

/**
 * Full canonical sizes available for jerseys (XS to 7XL)
 */
export const FULL_JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL']

/**
 * 4 Simple Steps Timeline for Custom Jersey Process
 */
export const TIMELINE_STEPS = [
  { num: '01', title: 'Pick Jersey', desc: 'NFL · MLB · NBA · MLS official cuts', icon: Shirt },
  { num: '02', title: 'Name & Number', desc: 'Enter your custom name & number', icon: Tag },
  { num: '03', title: 'AI Preview', desc: 'Instant matchday photorealistic render', icon: Sparkles },
  { num: '04', title: 'We Deliver', desc: 'Zero-crack dye-sub & tracked shipping', icon: PackageCheck }
]

/**
 * Real catalogue league listings covering the 4 major leagues: NFL, MLB, NBA, MLS.
 * Synchronized with published products in Supabase and fallback catalogue.
 */
export const CATALOGUE_LEAGUE_LISTINGS = [
  // 1. NFL - Dallas Cowboys
  {
    id: 'listing-fa785a04606049483aa3',
    productId: 'listing-fa785a04606049483aa3',
    productHandle: 'custom-dallas-cowboys-jersey-game-day',
    league: 'NFL',
    leagueKey: 'nfl',
    team: 'dallas-cowboys',
    teamName: 'Dallas Cowboys',
    teamMark: '/assets/leagues/marks/teams/nfl/dallas-cowboys.webp',
    leagueMark: '/assets/leagues/marks/nfl.webp',
    title: 'Custom Dallas Cowboys Jersey',
    subtitle: 'Popular Game Day Style',
    image: 'https://ofetusgarxcwloxxkhnr.supabase.co/storage/v1/object/public/product-media/listing-fa785a04606049483aa3/import/media-400a45a3596401125289.webp',
    alt: 'Custom Dallas Cowboys NFL game day jersey',
    price: 59.99,
    compareAt: 79.99,
    textColor: '#ffffff',
    strokeColor: '#002244',
    isDark: true,
    badge: 'BEST SELLER',
    preset: { name: 'PRESCOTT', number: '4' },
    sizes: FULL_JERSEY_SIZES
  },
  // 2. NFL - Green Bay Packers
  {
    id: 'listing-e7b7dafe5613c7e08978',
    productId: 'listing-e7b7dafe5613c7e08978',
    productHandle: 'custom-new-packers-jersey-green-2026',
    league: 'NFL',
    leagueKey: 'nfl',
    team: 'green-bay-packers',
    teamName: 'Green Bay Packers',
    teamMark: '/assets/leagues/marks/teams/nfl/green-bay-packers.webp',
    leagueMark: '/assets/leagues/marks/nfl.webp',
    title: 'Custom Green Bay Packers Jersey',
    subtitle: 'Green 2026 Fan Edition',
    image: 'https://ofetusgarxcwloxxkhnr.supabase.co/storage/v1/object/public/product-media/listing-e7b7dafe5613c7e08978/import/media-3b5328659753a7db9f85.webp',
    alt: 'Custom Green Bay Packers NFL jersey green 2026',
    price: 59.99,
    compareAt: 79.99,
    textColor: '#ffffff',
    strokeColor: '#f8f04a',
    isDark: true,
    badge: 'NEW DROP',
    preset: { name: 'LOVE', number: '10' },
    sizes: FULL_JERSEY_SIZES
  },
  // 3. NFL - Denver Broncos
  {
    id: 'listing-6d14a6e6255e642a18df',
    productId: 'listing-6d14a6e6255e642a18df',
    productHandle: 'custom-denver-broncos-jersey-name-number',
    league: 'NFL',
    leagueKey: 'nfl',
    team: 'denver-broncos',
    teamName: 'Denver Broncos',
    teamMark: '/assets/leagues/marks/teams/nfl/denver-broncos.webp',
    leagueMark: '/assets/leagues/marks/nfl.webp',
    title: 'Custom Denver Broncos Jersey',
    subtitle: 'Name Number Bold Fan Wear',
    image: 'https://ofetusgarxcwloxxkhnr.supabase.co/storage/v1/object/public/product-media/listing-6d14a6e6255e642a18df/import/media-e7f661e96614b77e694c.webp',
    alt: 'Custom Denver Broncos NFL jersey bold name number',
    price: 59.99,
    compareAt: 79.99,
    textColor: '#ffffff',
    strokeColor: '#fb4f14',
    isDark: true,
    badge: 'TRENDING',
    preset: { name: 'NIX', number: '10' },
    sizes: FULL_JERSEY_SIZES
  },
  // 4. MLB - Los Angeles Dodgers
  {
    id: 'listing-bc9823215a1a5020526b',
    productId: 'listing-bc9823215a1a5020526b',
    productHandle: 'los-angeles-dodgers-white-jersey-custom',
    league: 'MLB',
    leagueKey: 'mlb',
    team: 'los-angeles-dodgers',
    teamName: 'Los Angeles Dodgers',
    teamMark: '/assets/leagues/marks/teams/mlb/los-angeles-dodgers.webp',
    leagueMark: '/assets/leagues/marks/mlb.webp',
    title: 'Personalized LA Dodgers Baseball Jersey',
    subtitle: 'White Edition Custom Fan Wear',
    image: 'https://ofetusgarxcwloxxkhnr.supabase.co/storage/v1/object/public/product-media/listing-bc9823215a1a5020526b/import/media-53dda8f0c5ee356f4040.webp',
    alt: 'Personalized Los Angeles Dodgers white MLB baseball jersey',
    price: 59.99,
    compareAt: 79.99,
    textColor: '#005a9c',
    strokeColor: '#ef3e42',
    isDark: false,
    badge: 'FAN FAVORITE',
    preset: { name: 'OHTANI', number: '17' },
    sizes: FULL_JERSEY_SIZES
  },
  // 5. MLB - New York Yankees
  {
    id: 'listing-nyy-pinstripe-custom',
    productId: 'chalk-lines',
    productHandle: 'chalk-lines',
    league: 'MLB',
    leagueKey: 'mlb',
    team: 'new-york-yankees',
    teamName: 'New York Yankees',
    teamMark: '/assets/leagues/marks/teams/mlb/new-york-yankees.webp',
    leagueMark: '/assets/leagues/marks/mlb.webp',
    title: 'Personalized NY Yankees Baseball Jersey',
    subtitle: 'Pinstripe Custom Fan Edition',
    image: '/assets/jersey-white.webp',
    alt: 'Personalized New York Yankees MLB jersey',
    price: 64.99,
    compareAt: 84.99,
    textColor: '#003087',
    strokeColor: '#e4002b',
    isDark: false,
    badge: 'CLASSIC',
    preset: { name: 'JUDGE', number: '99' },
    sizes: FULL_JERSEY_SIZES
  },
  // 6. NBA - Los Angeles Lakers
  {
    id: 'listing-nba-lakers-custom',
    productId: 'home-end',
    productHandle: 'home-end',
    league: 'NBA',
    leagueKey: 'nba',
    team: 'los-angeles-lakers',
    teamName: 'Los Angeles Lakers',
    teamMark: '/assets/leagues/marks/teams/nba/los-angeles-lakers.webp',
    leagueMark: '/assets/leagues/marks/nba.webp',
    title: 'Custom Los Angeles Lakers Jersey',
    subtitle: 'Showtime Gold & Purple Edition',
    image: '/assets/jersey-oxblood.webp',
    alt: 'Custom Los Angeles Lakers NBA basketball jersey',
    price: 64.99,
    compareAt: 84.99,
    textColor: '#552583',
    strokeColor: '#fdb927',
    isDark: true,
    badge: 'HOT DROP',
    preset: { name: 'JAMES', number: '23' },
    sizes: FULL_JERSEY_SIZES
  },
  // 7. NBA - Atlanta Hawks
  {
    id: 'listing-nba-hawks-custom',
    productId: 'after-90',
    productHandle: 'after-90',
    league: 'NBA',
    leagueKey: 'nba',
    team: 'atlanta-hawks',
    teamName: 'Atlanta Hawks',
    teamMark: '/assets/leagues/marks/teams/nba/atlanta-hawks.webp',
    leagueMark: '/assets/leagues/marks/nba.webp',
    title: 'Custom Atlanta Hawks Jersey',
    subtitle: 'Icon Statement Edition',
    image: '/assets/jersey-black.webp',
    alt: 'Custom Atlanta Hawks NBA basketball jersey',
    price: 64.99,
    compareAt: 84.99,
    textColor: '#c8102e',
    strokeColor: '#fdb927',
    isDark: true,
    badge: 'TRENDING',
    preset: { name: 'JOHNSON', number: '1' },
    sizes: FULL_JERSEY_SIZES
  },
  // 8. MLS - Inter Miami CF
  {
    id: 'listing-mls-miami-custom',
    productId: 'the-whistle',
    productHandle: 'the-whistle',
    league: 'MLS',
    leagueKey: 'mls',
    team: 'inter-miami',
    teamName: 'Inter Miami CF',
    teamMark: '/assets/leagues/marks/teams/mls/inter-miami.webp',
    leagueMark: '/assets/leagues/marks/mls.webp',
    title: 'Custom Inter Miami CF Soccer Jersey',
    subtitle: 'The Floridian Pink & Black Kit',
    image: '/assets/hero-tunnel.webp',
    alt: 'Custom Inter Miami CF MLS soccer jersey',
    price: 69.99,
    compareAt: 89.99,
    textColor: '#f7b5cd',
    strokeColor: '#231f20',
    isDark: true,
    badge: 'MATCHDAY',
    preset: { name: 'MESSI', number: '10' },
    sizes: FULL_JERSEY_SIZES
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
  const [leagueFilter, setLeagueFilter] = useState('ALL')
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
  const [aiPreviewUrl, setAiPreviewUrl] = useState(null)
  const [aiPreviewId, setAiPreviewId] = useState(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [aiElapsed, setAiElapsed] = useState(0)
  const [aiNotice, setAiNotice] = useState('')
  const touchStartX = useRef(null)

  const filteredListings = leagueFilter === 'ALL'
    ? CATALOGUE_LEAGUE_LISTINGS
    : CATALOGUE_LEAGUE_LISTINGS.filter(item => item.league === leagueFilter)

  const activeListing = filteredListings[activeIndex] || filteredListings[0] || CATALOGUE_LEAGUE_LISTINGS[0]

  useEffect(() => {
    try {
      window.sessionStorage.setItem('jersevo_home_custom', JSON.stringify({ name, number }))
    } catch {}
  }, [name, number])

  useEffect(() => {
    let timer = null
    if (isGeneratingAi) {
      setAiElapsed(0)
      timer = setInterval(() => {
        setAiElapsed(prev => prev + 1)
      }, 1000)
    } else {
      setAiElapsed(0)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [isGeneratingAi])

  const prevSlide = () => {
    setActiveIndex(current => (current > 0 ? current - 1 : filteredListings.length - 1))
    setAiPreviewUrl(null)
    setAdded(false)
    setAiNotice('')
  }

  const nextSlide = () => {
    setActiveIndex(current => (current < filteredListings.length - 1 ? current + 1 : 0))
    setAiPreviewUrl(null)
    setAdded(false)
    setAiNotice('')
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

  /**
   * Generates or updates the custom jersey preview with AI.
   */
  const handleGenerateWithAi = async () => {
    const trimmedName = cleanName(name)
    const trimmedNumber = cleanNumber(number)
    if (!name.trim() && !number.trim()) {
      setAiNotice('Enter a name or number to render your jersey.')
      return
    }

    setIsGeneratingAi(true)
    setAiNotice('')

    try {
      const targetProductId = activeListing.productId || activeListing.productHandle
      const response = await apiFetch('/api/ai-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: getCustomerSessionId(),
          productId: targetProductId,
          values: {
            name: trimmedName,
            number: trimmedNumber
          }
        })
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'AI visual preview could not be generated.')
      }

      if (result.imageUrl) {
        setAiPreviewUrl(result.imageUrl)
        setAiPreviewId(result.previewId || null)
        setAiNotice('AI Matchday Render Ready!')
        trackCustomizeProduct(activeListing, { name: trimmedName, number: trimmedNumber })
        try {
          window.sessionStorage.setItem('extra-time-ai-preview', JSON.stringify({
            productId: targetProductId,
            previewId: result.previewId,
            imageUrl: result.imageUrl,
            values: { name: trimmedName, number: trimmedNumber }
          }))
        } catch {}
      }
    } catch (err) {
      console.warn('AI preview generation notice:', err.message)
      setAiNotice(err instanceof Error ? err.message : 'AI preview generation notice.')
    } finally {
      setIsGeneratingAi(false)
    }
  }

  const handleAddToCart = () => {
    const handle = activeListing.productHandle
    const foundProduct = (products || []).find(p => p.handle === handle || p.id === handle || p.id === activeListing.productId) || product || (products || [])[0]
    if (!foundProduct) {
      navigate(`/product/${handle}?custom=1&name=${encodeURIComponent(name)}&number=${encodeURIComponent(number)}`)
      return
    }

    const availableVariants = foundProduct.variants || []
    const matchingVariant = availableVariants.find(v => v.values?.Size === selectedSize) || availableVariants[0]

    if (typeof onAdd === 'function') {
      onAdd(
        {
          ...foundProduct,
          image: aiPreviewUrl || activeListing.image || foundProduct.image
        },
        {
          variant: matchingVariant,
          options: {
            Size: selectedSize,
            ...(matchingVariant?.values?.Colour ? { Colour: matchingVariant.values.Colour } : {})
          },
          customization: {
            fields: { name, number },
            values: { name, number },
            aiPreviewUrl: aiPreviewUrl || null,
            aiPreviewId: aiPreviewId || null,
            note: `Catalogue customized: ${activeListing.league} ${activeListing.teamName} (${name} #${number})`
          }
        }
      )
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

  const activeImage = aiPreviewUrl || activeListing.image

  return (
    <div className="home-personalizer">
      {/* 1. 4 Simple Steps Timeline with Clear Icons */}
      <div className="home-personalizer__timeline" aria-label="Custom jersey 4 simple steps">
        <div className="home-personalizer__timeline-bar">
          {TIMELINE_STEPS.map((step, idx) => {
            const Icon = step.icon
            return (
              <div key={step.num} className="home-personalizer__timeline-step">
                <div className="home-personalizer__timeline-badge">
                  <span className="home-personalizer__timeline-num">{step.num}</span>
                  {Icon && <Icon size={14} className="home-personalizer__timeline-icon" aria-hidden="true" />}
                </div>
                <div className="home-personalizer__timeline-info">
                  <strong>{step.title}</strong>
                  <small>{step.desc}</small>
                </div>
                {idx < TIMELINE_STEPS.length - 1 && (
                  <span className="home-personalizer__timeline-sep" aria-hidden="true">→</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. League Filter Tabs: ALL, NFL, MLB, NBA, MLS */}
      <div className="home-personalizer__leagues-bar" role="tablist" aria-label="Filter Leagues">
        {['ALL', 'NFL', 'MLB', 'NBA', 'MLS'].map(lg => {
          const isActive = leagueFilter === lg
          const count = lg === 'ALL'
            ? CATALOGUE_LEAGUE_LISTINGS.length
            : CATALOGUE_LEAGUE_LISTINGS.filter(item => item.league === lg).length
          return (
            <button
              key={lg}
              role="tab"
              aria-selected={isActive}
              className={`home-personalizer__league-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                setLeagueFilter(lg)
                setActiveIndex(0)
                setAiPreviewUrl(null)
                setAdded(false)
                setAiNotice('')
              }}
            >
              <span>{lg === 'ALL' ? 'ALL LEAGUES' : lg}</span>
              <small className="home-personalizer__league-count">({count})</small>
            </button>
          )
        })}
      </div>

      {/* 3. Main Stage: Product Photo Slide + Customizer Panel */}
      <div className="home-personalizer__body">
        {/* Left: Product Photo Stage */}
        <div
          className="home-personalizer__stage-wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="home-personalizer__photo-stage">
            <img
              src={activeImage}
              alt={activeListing.alt}
              className="home-personalizer__photo"
              loading="eager"
            />

            {/* AI Generating Scanning Overlay */}
            {isGeneratingAi && (
              <div className="home-personalizer__ai-loader" role="status" aria-live="polite">
                <div className="home-personalizer__ai-scanner-line" />
                <div className="home-personalizer__ai-spinner-ring">
                  <Sparkles size={28} className="animate-spin text-acid" />
                </div>
                <strong className="home-personalizer__ai-title">AI MATCHDAY STUDIO IN PROGRESS</strong>
                <span className="home-personalizer__ai-phase">
                  {aiElapsed < 6 ? 'Analyzing authentic jersey silhouette & fabric weave…'
                    : aiElapsed < 15 ? 'Synthesizing matchday typography & squad numbers…'
                    : aiElapsed < 25 ? 'Rendering dynamic lighting & seam fold curvature…'
                    : 'Finalizing high-resolution matchday preview…'}
                </span>
                <div className="home-personalizer__ai-meter">
                  <span className="home-personalizer__ai-timer">{aiElapsed}s</span>
                  <div className="home-personalizer__ai-progress-bar">
                    <div
                      className="home-personalizer__ai-progress-fill"
                      style={{ width: `${Math.min(95, Math.max(12, aiElapsed * 3))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Badges Overlay */}
            <div className="home-personalizer__badge-overlay">
              <div className="home-personalizer__pill-badge">
                <img src={activeListing.teamMark || activeListing.leagueMark} alt="" />
                <span>{activeListing.league} · {activeListing.teamName}</span>
              </div>
              <div className={`home-personalizer__live-status ${aiPreviewUrl ? 'is-ai' : ''}`}>
                {aiPreviewUrl ? (
                  <>
                    <Sparkles size={11} />
                    <span>AI MOCKUP</span>
                  </>
                ) : (
                  <>
                    <span className="live-dot" />
                    <span>CATALOGUE PHOTO</span>
                  </>
                )}
              </div>
            </div>

            {/* Slide Navigation Buttons */}
            {filteredListings.length > 1 && (
              <>
                <button
                  className="home-personalizer__slide-arrow home-personalizer__slide-arrow--prev"
                  onClick={prevSlide}
                  aria-label="Previous jersey slide"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  className="home-personalizer__slide-arrow home-personalizer__slide-arrow--next"
                  onClick={nextSlide}
                  aria-label="Next jersey slide"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}

            {/* Slide Dots */}
            {filteredListings.length > 1 && (
              <div className="home-personalizer__dots" aria-hidden="true">
                {filteredListings.map((item, idx) => (
                  <button
                    key={item.id}
                    tabIndex={-1}
                    className={`home-personalizer__dot ${idx === activeIndex ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveIndex(idx)
                      setAiPreviewUrl(null)
                      setAdded(false)
                      setAiNotice('')
                    }}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Customizer Controls Panel */}
        <div className="home-personalizer__panel">
          {/* Listing Title & Price */}
          <div className="home-personalizer__listing-head">
            <div className="home-personalizer__listing-titles">
              <span className="home-personalizer__listing-sub">{activeListing.league} · {activeListing.teamName}</span>
              <h3 className="home-personalizer__listing-name">{activeListing.title}</h3>
              <div className="home-personalizer__rating">
                <span className="home-personalizer__stars" aria-hidden="true">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={13} fill="#e5a914" stroke="#e5a914" />
                  ))}
                </span>
                <span>4.9/5 (420+ verified reviews)</span>
              </div>
            </div>
            <div className="home-personalizer__listing-pricing">
              <strong className="home-personalizer__price">${activeListing.price.toFixed(2)}</strong>
              {activeListing.compareAt && (
                <span className="home-personalizer__compare">${activeListing.compareAt.toFixed(2)}</span>
              )}
              <span className="home-personalizer__tag">MADE TO ORDER</span>
            </div>
          </div>

          {/* Form: Name & Number (Popular suggestions removed per user request) */}
          <form className="home-personalizer__controls" onSubmit={e => e.preventDefault()}>
            <div className="home-personalizer__field">
              <label htmlFor="home-jersey-name">
                NAME
              </label>
              <input
                id="home-jersey-name"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="off"
                spellCheck="false"
                onChange={e => {
                  setName(cleanName(e.target.value))
                  setAiPreviewUrl(null)
                }}
                placeholder="YOUR NAME"
              />
            </div>
            <div className="home-personalizer__field home-personalizer__field--number">
              <label htmlFor="home-jersey-number">
                NUMBER
              </label>
              <input
                id="home-jersey-number"
                value={number}
                maxLength={MAX_NUMBER_LENGTH}
                inputMode="numeric"
                autoComplete="off"
                onChange={e => {
                  setNumber(cleanNumber(e.target.value))
                  setAiPreviewUrl(null)
                }}
                placeholder="10"
              />
            </div>
          </form>

          {/* AI Render Action */}
          <div className="home-personalizer__ai-bar">
            <button
              type="button"
              className="home-personalizer__btn-ai"
              onClick={handleGenerateWithAi}
              disabled={isGeneratingAi}
              aria-label="Render Jersey"
            >
              {isGeneratingAi ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>RENDERING JERSEY...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>RENDER JERSEY</span>
                </>
              )}
            </button>
            {aiPreviewUrl && (
              <button
                type="button"
                className="home-personalizer__btn-revert"
                onClick={() => setAiPreviewUrl(null)}
                title="Return to original catalogue photo"
              >
                ORIGINAL PHOTO
              </button>
            )}
          </div>
          {aiNotice && <p className="home-personalizer__ai-notice">{aiNotice}</p>}

          {/* Full Sizes: XS to 7XL */}
          <div className="home-personalizer__sizes">
            <div className="home-personalizer__sizes-header">
              <span>CHOOSE SIZE:</span>
              <strong>{selectedSize}</strong>
            </div>
            <div className="home-personalizer__size-pills">
              {FULL_JERSEY_SIZES.map(size => {
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

          {/* Primary Action Buttons */}
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
                  <ShoppingBag size={18} /> ADD TO BAG · ${activeListing.price.toFixed(2)}
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
    </div>
  )
}
