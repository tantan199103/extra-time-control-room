import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star
} from 'lucide-react'
import { apiFetch } from './lib/api-client'
import { getCustomerSessionId } from './lib/supabase'

export const MAX_NAME_LENGTH = 12
export const MAX_NUMBER_LENGTH = 2

/**
 * Real catalogue league listings synchronized with published products in Supabase.
 * NFL (Cowboys, Packers, Broncos) and MLB (Dodgers).
 */
export const CATALOGUE_LEAGUE_LISTINGS = [
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
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
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
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
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
    sizes: ['S', 'M', 'L', 'XL', '2XL']
  },
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
  const [aiPreviewUrl, setAiPreviewUrl] = useState(null)
  const [aiPreviewId, setAiPreviewId] = useState(null)
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const [aiElapsed, setAiElapsed] = useState(0)
  const [aiNotice, setAiNotice] = useState('')
  const touchStartX = useRef(null)

  const activeListing = CATALOGUE_LEAGUE_LISTINGS[activeIndex] || CATALOGUE_LEAGUE_LISTINGS[0]

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
    setActiveIndex(current => (current > 0 ? current - 1 : CATALOGUE_LEAGUE_LISTINGS.length - 1))
    setAiPreviewUrl(null)
    setAdded(false)
    setAiNotice('')
  }

  const nextSlide = () => {
    setActiveIndex(current => (current < CATALOGUE_LEAGUE_LISTINGS.length - 1 ? current + 1 : 0))
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

  const handlePreset = (presetName, presetNum) => {
    setName(cleanName(presetName))
    setNumber(cleanNumber(presetNum))
    setAiPreviewUrl(null)
    setAiNotice(`Selected ${presetName} #${presetNum}. Click RENDER WITH AI to generate.`)
  }

  /**
   * Generates or updates the custom jersey preview with AI.
   * Calls /api/ai-preview on the server to render the customer's custom name & number.
   */
  const handleGenerateWithAi = async () => {
    const trimmedName = cleanName(name)
    const trimmedNumber = cleanNumber(number)
    if (!trimmedName && !trimmedNumber) {
      setAiNotice('Enter a name or number to render with AI.')
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
      {/* 1. Real Catalogue League & Team Selector Tabs */}
      <div className="home-personalizer__leagues-bar" role="tablist" aria-label="Select Catalogue Jersey">
        {CATALOGUE_LEAGUE_LISTINGS.map((listing, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={listing.id}
              role="tab"
              aria-selected={isActive}
              className={`home-personalizer__league-tab ${isActive ? 'is-active' : ''}`}
              onClick={() => {
                setActiveIndex(index)
                setAiPreviewUrl(null)
                setAdded(false)
                setAiNotice('')
              }}
            >
              <img src={listing.teamMark || listing.leagueMark} alt="" className="home-personalizer__league-mark" />
              <span>{listing.league} · {listing.teamName.split(' ').pop()}</span>
            </button>
          )
        })}
      </div>

      {/* 2. Main Two-Column Stage: Left Photo + Right Controls */}
      <div className="home-personalizer__body">
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

          {/* Photo Stage Badges */}
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
            {CATALOGUE_LEAGUE_LISTINGS.map((item, idx) => (
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
        </div>
      </div>

      {/* 3. PDP-Like Interactive Customizer Controls */}
      <div className="home-personalizer__panel">
        {/* Listing Title & Price row */}
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
              onChange={e => {
                setName(cleanName(e.target.value))
                setAiPreviewUrl(null)
              }}
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
              onChange={e => {
                setNumber(cleanNumber(e.target.value))
                setAiPreviewUrl(null)
              }}
              placeholder="07"
            />
          </div>
        </form>

        {/* Presets Row with Catalogue Stars */}
        <div className="home-personalizer__presets">
          <span className="home-personalizer__preset-tip">Popular:</span>
          {CATALOGUE_LEAGUE_LISTINGS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`home-personalizer__chip ${activeListing.id === item.id ? 'is-active' : ''}`}
              onClick={() => handlePreset(item.preset.name, item.preset.number)}
            >
              {item.preset.name} {item.preset.number}
            </button>
          ))}
        </div>

        {/* AI Action Trigger */}
        <div className="home-personalizer__ai-bar">
          <button
            type="button"
            className="home-personalizer__btn-ai"
            onClick={handleGenerateWithAi}
            disabled={isGeneratingAi}
          >
            {isGeneratingAi ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>RENDERING WITH AI...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>RENDER WITH AI</span>
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
