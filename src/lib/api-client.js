/**
 * Runtime API routing for the hybrid deployment.
 *
 * The browser never receives a server secret.  It only gets public origins:
 * - VITE_SUPABASE_FUNCTIONS_URL (https://<project>.supabase.co/functions/v1)
 * - VITE_BACKEND_URL (https://api.example.com)
 *
 * When either origin is absent, the original same-origin /api route remains
 * available.  That makes local development and a staged rollback predictable.
 */

const viteEnv = import.meta.env || {}

export const EDGE_FUNCTION_ROUTES = Object.freeze(new Set([
  '/api/cart-validate',
  '/api/member-quote',
  '/api/membership-enroll'
]))

export const NODE_BACKEND_ROUTES = Object.freeze(new Set([
  '/api/customer-upload',
  '/api/ai-preview',
  '/api/ai-listing-copy',
  '/api/customization-order',
  '/api/admin-customizations',
  '/api/admin-orders',
  '/api/admin-payment-settings',
  // Keep the signed checkout quote on the same Node runtime as checkout
  // creation and capture. This avoids stale Edge deployments producing a
  // different price/session result from the payment runtime.
  '/api/checkout-quote',
  '/api/checkout-create',
  '/api/payment-capture',
  '/api/payment-cancel',
  '/api/payment-webhook',
  '/api/order-track',
  '/api/render-artwork',
  '/api/payment-config',
  '/api/google-merchant-feed'
]))

function cleanOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function routePath(path) {
  try {
    return new URL(path, 'http://pod-bridge.local').pathname
  } catch {
    return String(path || '').split('?')[0]
  }
}

export function resolveApiTarget(path, config = {}) {
  const rawPath = String(path || '')
  if (!rawPath) throw new Error('An API path is required.')
  const parsed = new URL(rawPath, 'http://pod-bridge.local')
  const pathname = parsed.pathname
  const edgeOrigin = cleanOrigin(config.edgeOrigin ?? viteEnv.VITE_SUPABASE_FUNCTIONS_URL)
  const backendOrigin = cleanOrigin(config.backendOrigin ?? viteEnv.VITE_BACKEND_URL)

  if (EDGE_FUNCTION_ROUTES.has(pathname) && edgeOrigin) {
    const functionName = pathname.replace(/^\/api\//, '')
    return `${edgeOrigin}/${functionName}${parsed.search}`
  }
  if (NODE_BACKEND_ROUTES.has(pathname) && backendOrigin) {
    return `${backendOrigin}${pathname}${parsed.search}`
  }
  return rawPath
}

export function apiUrl(path) {
  return resolveApiTarget(path)
}

export async function apiFetch(path, options = {}) {
  const target = resolveApiTarget(path)
  const headers = new Headers(options.headers || {})
  // Helpful for backend logs and safe to expose.  Do not add auth or secrets.
  if (!headers.has('X-Client-Version')) headers.set('X-Client-Version', 'pod-storefront-hybrid-v1')
  // Supabase Edge Functions use the public anon JWT as their gateway
  // credential. Customer/admin access tokens, when present in options, always
  // win and are never replaced by this public fallback.
  if (isEdgeRoute(path) && viteEnv.VITE_SUPABASE_ANON_KEY) {
    if (!headers.has('apikey')) headers.set('apikey', viteEnv.VITE_SUPABASE_ANON_KEY)
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${viteEnv.VITE_SUPABASE_ANON_KEY}`)
  }
  return fetch(target, { ...options, headers })
}

export function apiRouteInfo() {
  return {
    edgeOrigin: cleanOrigin(viteEnv.VITE_SUPABASE_FUNCTIONS_URL),
    backendOrigin: cleanOrigin(viteEnv.VITE_BACKEND_URL),
    edgeRoutes: [...EDGE_FUNCTION_ROUTES],
    backendRoutes: [...NODE_BACKEND_ROUTES]
  }
}

// Kept small and pure so routing can be checked in Node without a browser.
export function isEdgeRoute(path) { return EDGE_FUNCTION_ROUTES.has(routePath(path)) }
export function isNodeBackendRoute(path) { return NODE_BACKEND_ROUTES.has(routePath(path)) }
