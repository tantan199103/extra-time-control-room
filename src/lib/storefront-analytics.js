export const STOREFRONT_EVENTS = Object.freeze([
  'search_submitted',
  'filter_applied',
  'product_card_clicked',
  'pdp_viewed',
  'add_to_bag',
  'checkout_started',
  'purchase_completed',
  'custom_cta_clicked',
  'custom_mode_selected',
  'quick_ai_started',
  'quick_ai_variants_ready',
  'quick_ai_preflight',
  'quick_ai_handoff',
  'designer_started',
  'designer_completed',
  'designer_load_error',
  'image_load_error',
  'catalog_unavailable',
  'search_zero_results'
])

const allowedEvents = new Set(STOREFRONT_EVENTS)
const VISITOR_STORAGE_KEY = 'jersevo-analytics-visitor-v1'
const ATTRIBUTION_STORAGE_KEY = 'jersevo-analytics-attribution-v1'
const ONCE_STORAGE_PREFIX = 'jersevo-analytics-once-v1:'

let visitorType = ''
let sessionAttribution = null

function safeAnalyticsValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') return value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)
  if (Array.isArray(value)) return value.slice(0,12).map(safeAnalyticsValue).filter(item => item !== undefined && item !== '')
  return undefined
}

function classifyTraffic(source, medium, referrerHost) {
  const normalizedMedium = String(medium || '').toLowerCase()
  const normalizedSource = String(source || '').toLowerCase()
  const normalizedReferrer = String(referrerHost || '').toLowerCase()
  if (/cpc|ppc|paid|display|affiliate|retarget|remarket/.test(normalizedMedium)) return 'paid'
  if (/organic/.test(normalizedMedium) || /google|bing|yahoo|duckduckgo|baidu|yandex/.test(`${normalizedSource} ${normalizedReferrer}`)) return 'organic'
  if (normalizedSource || normalizedReferrer) return 'referral'
  return 'direct'
}

function visitorClassification() {
  if (visitorType || typeof window === 'undefined') return visitorType
  try {
    visitorType = window.localStorage?.getItem(VISITOR_STORAGE_KEY) ? 'returning' : 'new'
    window.localStorage?.setItem(VISITOR_STORAGE_KEY, '1')
  } catch {
    visitorType = 'unknown'
  }
  return visitorType
}

function attributionContext() {
  if (sessionAttribution || typeof window === 'undefined') return sessionAttribution || {}
  try {
    const stored = window.sessionStorage?.getItem(ATTRIBUTION_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object') {
        sessionAttribution = parsed
        return sessionAttribution
      }
    }
  } catch {}

  const params = new URLSearchParams(window.location?.search || '')
  const medium = params.get('utm_medium') || ''
  let source = params.get('utm_source') || ''
  const campaign = params.get('utm_campaign') || ''
  let referrerHost = ''
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname : ''
    if (referrerHost === window.location?.hostname) referrerHost = ''
  } catch {}
  if (!source && referrerHost) source = referrerHost
  sessionAttribution = {
    traffic_channel:classifyTraffic(source,medium,referrerHost),
    traffic_source:source || 'direct',
    ...(medium ? { traffic_medium:medium } : {}),
    ...(campaign ? { campaign } : {})
  }
  try { window.sessionStorage?.setItem(ATTRIBUTION_STORAGE_KEY,JSON.stringify(sessionAttribution)) } catch {}
  return sessionAttribution
}

export function storefrontAnalyticsContext() {
  if (typeof window === 'undefined') return {}
  let deviceType = Number(window.innerWidth || 0) <= 780 ? 'mobile' : 'desktop'
  try { deviceType = window.matchMedia?.('(max-width: 780px)').matches ? 'mobile' : 'desktop' } catch {}
  return {
    route:window.location?.pathname || '/',
    device_type:deviceType,
    visitor_type:visitorClassification(),
    ...attributionContext()
  }
}

export function trackStorefrontEvent(name, parameters = {}) {
  if (!allowedEvents.has(name)) return null
  const payload = { event:`jersevo_${name}` }
  Object.entries({ ...storefrontAnalyticsContext(), ...(parameters || {}) }).forEach(([key,value]) => {
    const safeKey = String(key || '').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)
    const safeValue = safeAnalyticsValue(value)
    if (safeKey && safeValue !== undefined && safeValue !== '') payload[safeKey] = safeValue
  })
  if (typeof window !== 'undefined') {
    window.dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : []
    window.dataLayer.push(payload)
    try { window.dispatchEvent(new CustomEvent('jersevo:analytics', { detail:payload })) } catch {}
  }
  return payload
}

export function trackStorefrontEventOnce(name, dedupeKey, parameters = {}) {
  if (!allowedEvents.has(name)) return null
  const safeDedupeKey = String(dedupeKey || '').replace(/[^a-zA-Z0-9:_-]+/g,'_').slice(0,160)
  if (!safeDedupeKey || typeof window === 'undefined') return trackStorefrontEvent(name,parameters)
  const storageKey = `${ONCE_STORAGE_PREFIX}${name}:${safeDedupeKey}`
  try {
    if (window.sessionStorage?.getItem(storageKey)) return null
    const payload = trackStorefrontEvent(name,parameters)
    if (payload) window.sessionStorage?.setItem(storageKey,'1')
    return payload
  } catch {
    return trackStorefrontEvent(name,parameters)
  }
}
