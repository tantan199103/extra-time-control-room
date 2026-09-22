/**
 * Google Customer Reviews (GCR) Integration Helper
 * Merchant ID: 5856459864 (jersevo)
 * Supports Google Customer Reviews Survey Opt-in & Rating Badge
 * Compliant with Google Merchant Center official specifications.
 */

export const DEFAULT_GOOGLE_MERCHANT_ID = 5856459864
export const GCR_PLATFORM_SCRIPT_URL = 'https://apis.google.com/js/platform.js?onload=renderOptIn'
const OPTIN_SESSION_PREFIX = 'gcr_optin_shown_'

/**
 * Resolves the Google Merchant ID from env or default
 */
export function getGoogleMerchantId() {
  if (typeof window !== 'undefined') {
    if (window.__EXTRA_TIME_GCR_MERCHANT_ID__) {
      const parsed = Number(window.__EXTRA_TIME_GCR_MERCHANT_ID__)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MERCHANT_ID) {
      const parsed = Number(import.meta.env.VITE_GOOGLE_MERCHANT_ID)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return DEFAULT_GOOGLE_MERCHANT_ID
}

/**
 * Formats a Date object or timestamp into ISO 'YYYY-MM-DD'
 * If no date provided or invalid, adds `transitDays` (default 10) to now.
 */
export function formatEstimatedDeliveryDate(dateInput, transitDays = 10) {
  let targetDate = null
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    targetDate = new Date(dateInput)
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim()
  } else if (dateInput) {
    const parsed = new Date(dateInput)
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed
    }
  }

  if (!targetDate) {
    targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + Math.max(1, transitDays))
  }

  const year = targetDate.getFullYear()
  const month = String(targetDate.getMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a country string into an ISO 3166-1 alpha-2 2-letter uppercase code
 */
export function formatDeliveryCountry(country) {
  const code = String(country || 'US').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(code)) return code
  if (code === 'USA' || code === 'UNITED STATES') return 'US'
  if (code === 'CANADA') return 'CA'
  if (code === 'UNITED KINGDOM' || code === 'UK') return 'GB'
  if (code === 'AUSTRALIA') return 'AU'
  return 'US'
}

/**
 * Loads the Google Platform script safely if not already present
 */
export function loadGooglePlatformScript() {
  if (typeof window === 'undefined') return Promise.resolve(false)

  if (window.gapi) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="apis.google.com/js/platform.js"]')
    if (existing) {
      if (window.gapi) {
        resolve(true)
        return
      }
      const prevOnload = existing.onload
      existing.onload = (event) => {
        if (typeof prevOnload === 'function') prevOnload(event)
        resolve(true)
      }
      return
    }

    const script = document.createElement('script')
    script.src = GCR_PLATFORM_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve(true)
    script.onerror = () => {
      console.warn('[Google Customer Reviews] Failed to load platform script.')
      resolve(false)
    }
    document.head.appendChild(script)
  })
}

/**
 * Renders the Google Customer Reviews Survey Opt-In modal/dialog
 * Triggers only on confirmed/paid orders and prevents duplicate survey prompts.
 */
export function renderGoogleSurveyOptIn({
  merchantId = getGoogleMerchantId(),
  orderId,
  email,
  country = 'US',
  estimatedDeliveryDate = null,
  orderDate = null,
  products = [],
  optInStyle = 'CENTER_DIALOG'
}) {
  if (typeof window === 'undefined') {
    return { success: false, reason: 'SSR_ENVIRONMENT' }
  }

  const cleanOrderId = String(orderId || '').trim()
  const cleanEmail = String(email || '').trim()

  if (!cleanOrderId || !cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, reason: 'MISSING_ORDER_OR_EMAIL', orderId: cleanOrderId, email: cleanEmail }
  }

  // Deduplication check per session to avoid re-triggering on page refresh
  try {
    if (sessionStorage.getItem(OPTIN_SESSION_PREFIX + cleanOrderId)) {
      return { success: true, deduplicated: true, orderId: cleanOrderId }
    }
  } catch {}

  const deliveryCountry = formatDeliveryCountry(country)
  const deliveryDate = formatEstimatedDeliveryDate(
    estimatedDeliveryDate || (orderDate ? (() => {
      const d = new Date(orderDate)
      d.setDate(d.getDate() + 12)
      return d
    })() : null)
  )

  const payload = {
    merchant_id: Number(merchantId) || DEFAULT_GOOGLE_MERCHANT_ID,
    order_id: cleanOrderId,
    email: cleanEmail,
    delivery_country: deliveryCountry,
    estimated_delivery_date: deliveryDate,
    opt_in_style: optInStyle
  }

  if (Array.isArray(products) && products.length > 0) {
    const validProducts = products
      .map(p => typeof p === 'string' ? { gtin: p } : (p?.gtin ? { gtin: String(p.gtin) } : null))
      .filter(Boolean)
    if (validProducts.length > 0) {
      payload.products = validProducts
    }
  }

  // Register trigger function for window.renderOptIn callback
  window.__triggerGoogleSurveyOptIn = function() {
    if (!window.gapi?.load) return
    try {
      window.gapi.load('surveyoptin', function() {
        if (window.gapi?.surveyoptin?.render) {
          window.gapi.surveyoptin.render(payload)
          try {
            sessionStorage.setItem(OPTIN_SESSION_PREFIX + cleanOrderId, 'true')
          } catch {}
        }
      })
    } catch (err) {
      console.warn('[Google Customer Reviews] Survey render error:', err)
    }
  }

  // If gapi is already present, trigger immediately
  if (window.gapi && typeof window.gapi.load === 'function') {
    window.__triggerGoogleSurveyOptIn()
  } else {
    loadGooglePlatformScript().then(() => {
      if (typeof window.__triggerGoogleSurveyOptIn === 'function') {
        window.__triggerGoogleSurveyOptIn()
      }
    })
  }

  return { success: true, payload }
}

/**
 * Renders the Google Customer Reviews Badge (rating badge)
 */
export function renderGoogleRatingBadge({
  merchantId = getGoogleMerchantId(),
  position = 'BOTTOM_RIGHT',
  container = null
} = {}) {
  if (typeof window === 'undefined') {
    return { success: false, reason: 'SSR_ENVIRONMENT' }
  }

  if (window.__GCR_BADGE_RENDERED__) {
    return { success: true, deduplicated: true }
  }

  const triggerBadge = () => {
    if (!window.gapi?.load) return
    try {
      let targetContainer = container
      if (!targetContainer) {
        let wrapper = document.getElementById('gcr-badge-container')
        if (!wrapper) {
          wrapper = document.createElement('div')
          wrapper.id = 'gcr-badge-container'
          wrapper.className = 'gcr-badge-container'
          document.body.appendChild(wrapper)
        }
        targetContainer = wrapper
      }

      window.gapi.load('ratingbadge', function() {
        if (window.gapi?.ratingbadge?.render) {
          window.gapi.ratingbadge.render(targetContainer, {
            merchant_id: Number(merchantId) || DEFAULT_GOOGLE_MERCHANT_ID,
            position: position
          })
          window.__GCR_BADGE_RENDERED__ = true
        }
      })
    } catch (err) {
      console.warn('[Google Customer Reviews] Badge render error:', err)
    }
  }

  if (window.gapi && typeof window.gapi.load === 'function') {
    triggerBadge()
  } else {
    loadGooglePlatformScript().then(() => {
      triggerBadge()
    })
  }

  return { success: true }
}

// Global hook registration
if (typeof window !== 'undefined') {
  window.renderOptIn = function() {
    if (typeof window.__triggerGoogleSurveyOptIn === 'function') {
      window.__triggerGoogleSurveyOptIn()
    }
  }
}
