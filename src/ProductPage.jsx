import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Globe2,
  History,
  ImageOff,
  Lock,
  PackageCheck,
  Plus,
  ShieldCheck,
  Shirt,
  Sparkles,
  Tag,
  Ticket,
  Truck
} from 'lucide-react'
import { availableOptionValue, initialSelections, isHeadwearProduct, optionNameLike, resolveVariant, storefrontImageSrcSet } from './lib/storefront-model'
import { custom3DDesignerConfig } from './lib/custom-3d'
import { findLeague, findTeam, leaguePath, productTaxonomyValues, teamPath } from './lib/league-taxonomy'
import { listingMediaRole } from './lib/listing-media'
import { createAiLogoPreview, createCustomizationOrder, createExactLogoPreview, getCustomerSessionId, uploadCustomerReference } from './lib/storefront-api'
import { productPreviewReadiness } from './lib/customization-ai'
import { apiFetch } from './lib/api-client'
import { canonicalSize, sortSizes } from './lib/size-guide'
import { buildDeliveryEstimate } from './lib/product-commerce'
import { DEFAULT_QUANTITY_DISCOUNT_POLICY, normalizeQuantityDiscountPolicy, quantityDiscountLabel } from './lib/quantity-pricing'
import { relatedProducts, usd } from './lib/product-seo'
import { trackViewContent } from './lib/meta-pixel'
import { trackStorefrontEvent } from './lib/storefront-analytics'
import { readRecentlyViewed, rememberRecentlyViewed } from './lib/recent-products'

const money = usd

function readSession(key, fallback = null) {
  try { return JSON.parse(window.sessionStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}
function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (window.location.hash) {
    requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
  } else window.scrollTo({ top: 0, behavior: 'instant' })
}

function listingDesignerTarget(product) {
  const config = custom3DDesignerConfig(product)
  const listing = product?.handle || product?.id
  if (!config || !listing) return ''
  const params = new URLSearchParams({ listing, provider:config.provider, product:config.productId })
  if (product?.designerConfig?.defaultStyleCode) params.set('style', product.designerConfig.defaultStyleCode)
  if (product?.designerConfig?.defaultDesignId) params.set('design', product.designerConfig.defaultDesignId)
  return `/custom/design?${params.toString()}`
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

/**
 * Product context is deliberately a small navigation rail, not another
 * recommendation carousel. It lets a shopper move from a specific piece to
 * the league or team catalogue while preserving the same taxonomy vocabulary
 * used in breadcrumbs and SEO links.
 */
function PdpContextTabs({ product, league, team }) {
  if (!league && !team) return null
  const contexts = [
    { id:'product', eyebrow:'Product', label:product?.name || 'Current piece', href:'#pdp-overview', active:true },
    ...(league ? [{ id:'league', eyebrow:'League', label:league.name, href:leaguePath(league), media:league.media }] : []),
    ...(team ? [{ id:'team', eyebrow:'Team', label:team.name, href:teamPath(league.key,team), media:team.media }] : [])
  ]
  return (
    <nav className="pdp-context-tabs" role="tablist" aria-label="Explore this product by league or team">
      <span className="pdp-context-tabs__label">Explore this piece</span>
      <div className="pdp-context-tabs__track">
        {contexts.map(context => (
          <a
            key={context.id}
            href={context.href}
            role="tab"
            aria-selected={context.active}
            aria-current={context.active ? 'page' : undefined}
            className={`pdp-context-tabs__tab${context.active ? ' is-active' : ''}`}
            onClick={event => {
              if (context.active) return
              event.preventDefault()
              navigate(context.href)
            }}
          >
            <span className="pdp-context-tabs__mark">
              {context.media?.src && !context.media.fallback
                ? <img src={context.media.src} alt="" loading="lazy" decoding="async" />
                : context.active
                  ? <Shirt size={16} aria-hidden="true" />
                  : <span aria-hidden="true">{context.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}</span>}
            </span>
            <span className="pdp-context-tabs__copy"><small>{context.eyebrow}</small><strong>{context.label}</strong></span>
            {!context.active && <ArrowRight size={14} aria-hidden="true" />}
          </a>
        ))}
      </div>
    </nav>
  )
}

function PdpRecentlyViewed({ items = [] }) {
  if (!items.length) return null
  return <section className="pdp-recent" aria-labelledby="pdp-recent-title">
    <div className="pdp-recent__heading"><History size={16}/><span><strong id="pdp-recent-title">Recently viewed</strong><small>Pick up where you left off</small></span></div>
    <div className="pdp-recent__track">
      {items.map(item => <a key={item.id} className="pdp-recent__item" href={`/product/${item.handle || item.id}`} onClick={event => { event.preventDefault(); navigate(event.currentTarget.getAttribute('href')) }}>
        <span className="pdp-recent__media">{item.image ? <img src={item.image} alt={item.alt || item.name} width="72" height="90" loading="lazy" decoding="async"/> : <ImageOff size={18}/>}</span>
        <span className="pdp-recent__copy"><small>{item.team || item.league || item.productGroup || 'Jersevo gear'}</small><strong>{item.name}</strong><em>{money(item.price)}</em></span>
        <ArrowRight size={13} aria-hidden="true"/>
      </a>)}
    </div>
  </section>
}

export default function ProductPage({ product, products, onAdd, onQuickView, startPersonalized = false, account, pageConfig = null, components = {} }) {
  const { Breadcrumbs, ProductRail, Rating, SizeFinder } = components
  const savedDraft = readSession(`extra-time-pdp-draft-${product.id}`, {})
  const savedAi = readSession('extra-time-ai-preview')
  const initialPreview = savedAi?.productId === product.id && (!savedAi.expiresAt || savedAi.expiresAt > Date.now()) ? savedAi : null
  const designerTarget = listingDesignerTarget(product)
  // Exact 3D listings use the designer route as their single personalization
  // surface. Keep the legacy PDP form for ordinary 2D custom products, but do
  // not render a second AI form that could produce a mismatched mockup.
  const customFields = designerTarget ? [] : (product.customFields || [])
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
  const [recentlyViewed,setRecentlyViewed] = useState([])
  const previewReadiness = productPreviewReadiness(customFields)
  // A synchronized 3D listing must never fall back to the generic AI image
  // editor: that path can redraw the garment and make name/number placement
  // drift from the production model. Its only customization entry point is
  // the exact designer route above.
  const hasStructuredPreview = !designerTarget && previewReadiness.enabled
  const pageCopy = pageConfig?.content || {}
  const taxonomy = productTaxonomyValues(product)
  const productLeague = findLeague(taxonomy.league)
  const productTeam = productLeague ? findTeam(productLeague.key, taxonomy.team) : null
  const suggestedProducts = relatedProducts(product,products,8)
  const suggestedContext = productTeam?.name || productLeague?.name || product.productGroup || 'this catalog'
  const configuredProductBlocks = pageConfig?.blocks || []
  const productEditorialBlocks = (configuredProductBlocks.length ? configuredProductBlocks : [
    { id: 'product-highlights' }, { id: 'product-story' }, { id: 'product-proof' }, { id: 'related-products' }
  ]).filter(block => block.enabled !== false && ['product-highlights', 'product-story', 'product-proof', 'related-products'].includes(block.id))
  const renderProductEditorialBlock = block => ({
    'product-highlights': <React.Fragment key={block.id}><ProductPurchaseHighlights product={product} personalized={personalized}/></React.Fragment>,
    'product-story': <ProductContentBlocks key={block.id} product={product}/>,
    'product-proof': <ProductStorySignals key={block.id} product={product}/>,
    'related-products': <ProductRail key={block.id} title="YOU MAY ALSO LIKE" subtitle={`More from ${suggestedContext}, selected by team and product type.`} items={suggestedProducts} onQuickView={onQuickView}/>
  }[block.id] || null)
  const hasUploadedLogo = customFields.some(field => field.type === 'logo' && customValues[field.key])
  const completeSelection = options.every(option => selections[option.name])
  const selectedVariant = completeSelection ? (product.variants || []).find(variant => options.every(option => variant.values?.[option.name] === selections[option.name])) : options.length ? null : product.variants?.[0]
  const displayVariant = selectedVariant || resolveVariant(product,selections) || product.variants?.find(variant => Number(variant.inventory || 0) > 0) || product.variants?.[0]
  const currentPrice = Number(displayVariant?.price ?? product.price)
  const currentCompare = displayVariant?.compareAt ?? product.compareAt
  const commerceConfig = productCommerceConfig(product)
  const bulkOffers = commerceConfig.bulkOffers || []
  const designerProvider = String(product?.designerConfig?.provider || '').toLowerCase()
  const designerLibraryLabel = designerProvider === 'owayo' ? 'matching multi-sport design library' : 'matching teamwear design library'
  const estimate = buildDeliveryEstimate(commerceConfig.delivery)
  const soldOut = selectedVariant ? Number(selectedVariant.inventory || 0) < 1 : false
  const selectionSummary = options.map(option => selections[option.name] ? (option.name === sizeName ? canonicalSize(selections[option.name]) : selections[option.name]) : '').filter(Boolean).join(' · ')
  const swatchColor = value => ({black:'#111111',white:'#eeeeea',chalk:'#eeeeea',oxblood:'#711e25',red:'#b52b2b',blue:'#244c89',navy:'#15233d',green:'#315c43',purple:'#5f3a78'}[String(value).toLowerCase()] || String(value))
  useEffect(() => { if (startPersonalized && customFields.length) setPersonalized(true) }, [startPersonalized,customFields.length])
  useEffect(() => {
    if (product) trackViewContent(product, displayVariant)
  }, [product?.id, displayVariant?.id])
  useEffect(() => {
    if (!product) return
    const taxonomy = productTaxonomyValues(product)
    trackStorefrontEvent('pdp_viewed',{
      product_id:product.id,
      handle:product.handle || product.id,
      value:Number(product.price || 0),
      currency:'USD',
      league:taxonomy.league || '',
      team:taxonomy.team || '',
      product_type:taxonomy.productType || product.type || product.productGroup || ''
    })
  }, [product?.id])
  useEffect(() => {
    const previous = readRecentlyViewed().filter(item => item.id !== String(product.id)).slice(0,8)
    setRecentlyViewed(previous)
    rememberRecentlyViewed(product)
  }, [product.id])
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
  const handleGalleryImageError = (event, item) => {
    const image = event.currentTarget
    const fallback = media.find(candidate => candidate?.url && candidate.url !== item?.url)?.url || product.image
    if (fallback && image.dataset.fallbackApplied !== 'true' && fallback !== image.src) {
      image.dataset.fallbackApplied = 'true'
      image.src = fallback
      return
    }
    image.hidden = true
    image.parentElement?.classList.add('is-image-missing')
    trackStorefrontEvent('image_load_error',{ product_id:product.id, media_id:item?.id || '', surface:'pdp_gallery' })
  }
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
  return <main className="pdp">
    <div className="pdp-breadcrumb-wrap"><Breadcrumbs items={[{ label:'Shop', href:'/shop' }, ...(productLeague ? [{ label:productLeague.name, href:leaguePath(productLeague) }] : []), ...(productTeam ? [{ label:productTeam.name, href:teamPath(productLeague.key,productTeam) }] : []), { label:product.name }]}/></div>
    <PdpContextTabs product={product} league={productLeague} team={productTeam} />
    <PdpRecentlyViewed items={recentlyViewed}/>
    <div className="pdp__commerce" id="pdp-overview">
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
                      srcSet={storefrontImageSrcSet(item.url, [480, 768, 1200, 1600]) || undefined}
                      sizes="(max-width: 780px) 100vw, 56vw"
                      alt={item.alt || `${product.name} view ${index+1}`}
                      width={item.width || undefined}
                      height={item.height || undefined}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      decoding="async"
                      onError={event => handleGalleryImageError(event, item)}
                    />
                    <span className="pdp__gallery-img-missing" aria-hidden="true"><ImageOff size={24}/><small>IMAGE UNAVAILABLE</small></span>
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
                  <img src={item.url} srcSet={storefrontImageSrcSet(item.url, [96, 160, 240]) || undefined} sizes="96px" alt="" width="96" height="120" loading="lazy" decoding="async" onError={event => { const image = event.currentTarget; if (image.dataset.fallbackApplied === 'true') { image.hidden = true; return }; image.dataset.fallbackApplied = 'true'; image.removeAttribute('srcset'); image.removeAttribute('sizes'); image.src = item.url }}/>
                )}
                {item.isAi && <span className="pdp__gallery-thumb-ai" title="AI Preview">✦</span>}
              </button>
            ))}
          </div>
        )}

        <div className="pdp__gallery-meta"><span>{String(galleryIndex+1).padStart(2,'0')} / {String(gallery.length).padStart(2,'0')}</span><span>SWIPE TO EXPLORE</span></div>
      </div>
      <aside className="pdp__info">
        {product.badge && <p className="product-badge static">{product.badge}</p>}{pageCopy.eyebrow && !product.badge && <p className="product-badge static">{pageCopy.eyebrow}</p>}<h1>{product.name}</h1><p className="pdp__story">{product.story || pageCopy.supporting}</p>{designerTarget && <button type="button" className="pdp__designer-cta" onClick={() => navigate(designerTarget)}><Sparkles size={18}/><span><strong>EDIT THIS KIT IN 3D</strong><small>Open the {designerLibraryLabel} for this listing.</small></span><ArrowRight size={17}/></button>}{product.rating > 0 && product.reviews > 0 && <Rating value={product.rating} reviews={product.reviews}/>}        <div className="pdp__price">
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
    {productEditorialBlocks.map(renderProductEditorialBlock)}
    {!headwear && <SizeFinder open={finder} onClose={() => setFinder(false)} product={product} sizeOptionName={sizeName || 'Size'} selections={selections} onRecommend={({size,audienceOptionName,audienceValue}) => { setSelections(current => ({...current,...(audienceOptionName ? {[audienceOptionName]:audienceValue} : {}),...(sizeName ? {[sizeName]:size} : {})})); setAdded(false); setCustomError('') }}/>}
    <div className="mobile-sticky-atc"><div className="mobile-sticky-atc__product"><img src={displayVariant?.image || product.image} alt=""/><span><strong>{money(currentPrice)}</strong><small>{selectedVariant ? `${selectionSummary} · ${personalized ? 'Personalized' : 'Standard'}` : 'Choose options'}</small></span></div><button onClick={add} disabled={submitting || soldOut}>{submitting ? 'SAVING…' : added ? 'ADDED' : selectedVariant ? (personalized ? 'ADD CUSTOM' : 'BUY NOW') : 'CHOOSE OPTIONS'}</button></div>
  </main>
}
