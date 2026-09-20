import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const backendDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(backendDir, '../..')
const port = Number(process.env.PORT || 8787)
const maxBodyBytes = Math.max(1, Number(process.env.BACKEND_MAX_BODY_BYTES || 20 * 1024 * 1024))
const rateWindowMs = Math.max(10_000, Number(process.env.BACKEND_RATE_WINDOW_MS || 60_000))
const rateLimit = Math.max(10, Number(process.env.BACKEND_RATE_LIMIT || 180))
const requestCounters = new Map()

const routeModules = new Map([
  ['/api/customer-upload', 'customer-upload.js'],
  ['/api/logo-preview', 'logo-preview.js'],
  ['/api/ai-logo-preview', 'ai-logo-preview.js'],
  ['/api/ai-preview', 'ai-preview.js'],
  ['/api/ai-listing-copy', 'ai-listing-copy.js'],
  ['/api/ai-listing-media', 'ai-listing-media.js'],
  ['/api/customization-order', 'customization-order.js'],
  ['/api/admin-customizations', 'admin-customizations.js'],
  ['/api/admin-orders', 'admin-orders.js'],
  ['/api/admin-payment-settings', 'admin-payment-settings.js'],
  // These light routes can move back behind Supabase Edge once the production
  // project has its functions provisioned. Keep them on this runtime meanwhile
  // so storefront validation and membership never fall through to a stale
  // Vercel function or an unprovisioned Edge endpoint.
  ['/api/cart-validate', 'cart-validate.js'],
  ['/api/member-quote', 'member-quote.js'],
  ['/api/membership-enroll', 'membership-enroll.js'],
  // Signed checkout quotes stay beside creation and capture so all three use
  // the same inventory, signing secret and payment configuration.
  ['/api/checkout-quote', 'checkout-quote.js'],
  ['/api/checkout-create', 'checkout-create.js'],
  ['/api/payment-capture', 'payment-capture.js'],
  ['/api/payment-cancel', 'payment-cancel.js'],
  ['/api/payment-webhook', 'payment-webhook.js'],
  ['/api/order-track', 'order-track.js'],
  ['/api/render-artwork', 'render-artwork.js'],
  ['/api/payment-config', 'payment-config.js'],
  // Public, read-only Google Merchant Center source. The handler still uses
  // the server-only Supabase key so draft and blocked catalogue rows never
  // leak into the feed.
  ['/api/google-merchant-feed', 'google-merchant-feed.js'],
  ['/api/newsletter-subscribe', 'newsletter-subscribe.js']
])

const loadedHandlers = new Map()

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

function setCors(nodeResponse, request) {
  const origin = headerValue(request.headers, 'origin')
  const allowlist = allowedOrigins()
  if (!origin) return true
  if (!allowlist.length || !allowlist.includes(String(origin).replace(/\/$/, ''))) return false
  nodeResponse.setHeader('Access-Control-Allow-Origin', origin)
  nodeResponse.setHeader('Vary', 'Origin')
  nodeResponse.setHeader('Access-Control-Allow-Credentials', 'true')
  nodeResponse.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Client-Version, X-Request-Id')
  nodeResponse.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS')
  return true
}

function clientAddress(request) {
  const forwarded = headerValue(request.headers, 'x-forwarded-for')
  if (process.env.TRUST_PROXY === 'true' && forwarded) return String(forwarded).split(',')[0].trim()
  return request.socket?.remoteAddress || 'unknown'
}

function rateAllowed(request, pathname) {
  const now = Date.now()
  const bucket = Math.floor(now / rateWindowMs)
  const limit = pathname === '/api/payment-webhook' ? rateLimit * 3 : rateLimit
  const key = `${clientAddress(request)}|${bucket}|${pathname}`
  const count = (requestCounters.get(key) || 0) + 1
  requestCounters.set(key, count)
  if (requestCounters.size > 5_000) {
    for (const candidate of requestCounters.keys()) {
      const candidateBucket = Number(candidate.split('|')[1])
      if (candidateBucket < bucket - 1) requestCounters.delete(candidate)
    }
  }
  return { allowed: count <= limit, retryAfter: Math.max(1, Math.ceil((rateWindowMs - (now % rateWindowMs)) / 1000)) }
}

function readiness() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CHECKOUT_SIGNING_SECRET', 'ALLOWED_ORIGINS', 'SITE_URL']
  const missing = required.filter(name => !String(process.env[name] || '').trim())
  return {
    ready: missing.length === 0,
    missing,
    capabilities:{
      aiImage:Boolean(String(process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || '').trim()),
      aiText:Boolean(String(process.env.AI_TEXT_API_KEY || '').trim()),
      paypal:Boolean(String(process.env.PAYPAL_CLIENT_SECRET || '').trim())
    }
  }
}

function responseAdapter(nodeResponse) {
  let statusCode = 200
  let settled = false
  const adapter = {
    status(code) { statusCode = Number(code) || 200; return adapter },
    setHeader(name, value) { nodeResponse.setHeader(name, value); return adapter },
    json(body) {
      if (settled) return adapter
      settled = true
      nodeResponse.statusCode = statusCode
      if (!nodeResponse.hasHeader('Content-Type')) nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
      nodeResponse.end(JSON.stringify(body ?? {}))
      return adapter
    },
    send(body = '') {
      if (settled) return adapter
      settled = true
      nodeResponse.statusCode = statusCode
      nodeResponse.end(body)
      return adapter
    },
    get headersSent() { return settled || nodeResponse.headersSent }
  }
  return adapter
}

function readRequestBody(nodeRequest) {
  return new Promise((resolveBody, reject) => {
    let received = 0
    const chunks = []
    nodeRequest.on('data', chunk => {
      received += chunk.length
      if (received > maxBodyBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }))
        nodeRequest.destroy()
        return
      }
      chunks.push(chunk)
    })
    nodeRequest.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    nodeRequest.on('error', reject)
  })
}

async function getHandler(pathname) {
  if (!routeModules.has(pathname)) return null
  if (!loadedHandlers.has(pathname)) {
    const filename = routeModules.get(pathname)
    const module = await import(pathToFileURL(resolve(projectRoot, 'api', filename)).href)
    loadedHandlers.set(pathname, module.default)
  }
  return loadedHandlers.get(pathname)
}

async function handle(nodeRequest, nodeResponse) {
  const url = new URL(nodeRequest.url || '/', `http://${nodeRequest.headers.host || 'localhost'}`)
  nodeResponse.setHeader('X-Content-Type-Options', 'nosniff')
  nodeResponse.setHeader('Referrer-Policy', 'no-referrer')
  nodeResponse.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/health') {
    nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
    nodeResponse.setHeader('Cache-Control', 'no-store')
    nodeResponse.statusCode = 200
    nodeResponse.end(JSON.stringify({ ok: true, service: 'jersevo-api', version: 'hybrid-v1' }))
    return
  }
  if (url.pathname === '/ready') {
    const state = readiness()
    nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
    nodeResponse.statusCode = state.ready ? 200 : 503
    nodeResponse.end(JSON.stringify({ ok: state.ready, service: 'jersevo-api', missing: state.missing, capabilities:state.capabilities }))
    return
  }

  if (!setCors(nodeResponse, nodeRequest)) {
    nodeResponse.statusCode = 403
    nodeResponse.end(JSON.stringify({ error: 'Origin is not allowed.' }))
    return
  }
  if (nodeRequest.method === 'OPTIONS') {
    nodeResponse.statusCode = 204
    nodeResponse.end()
    return
  }

  const quota = rateAllowed(nodeRequest, url.pathname)
  if (!quota.allowed) {
    nodeResponse.statusCode = 429
    nodeResponse.setHeader('Retry-After', String(quota.retryAfter))
    nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
    nodeResponse.end(JSON.stringify({ error: 'Too many requests. Try again shortly.' }))
    return
  }

  const handler = await getHandler(url.pathname)
  if (!handler) {
    nodeResponse.statusCode = 404
    nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
    nodeResponse.end(JSON.stringify({ error: 'API route not found.' }))
    return
  }

  let rawBody = ''
  try {
    rawBody = await readRequestBody(nodeRequest)
  } catch (error) {
    nodeResponse.statusCode = Number(error.status) || 413
    nodeResponse.setHeader('Content-Type', 'application/json; charset=utf-8')
    nodeResponse.end(JSON.stringify({ error: error.message || 'Request body could not be read.' }))
    return
  }

  const request = {
    method: nodeRequest.method,
    headers: nodeRequest.headers,
    body: rawBody,
    rawBody,
    query: Object.fromEntries(url.searchParams.entries()),
    url: url.toString()
  }
  const response = responseAdapter(nodeResponse)
  try {
    await handler(request, response)
    if (!response.headersSent) response.status(204).send('')
  } catch (error) {
    // Most legacy handlers already convert failures through handleApiError.
    // This guard prevents an unhandled rejection from taking down the process.
    if (!response.headersSent) response.status(Number(error?.status) || 500).json({ error: error?.message || 'Request failed.' })
  }
}

const server = http.createServer((request, response) => {
  handle(request, response).catch(error => {
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: error?.message || 'Internal server error.' }))
    }
  })
})

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Jersevo hybrid API listening on :${port}`)
  })
}

export { getHandler, rateAllowed, readiness, routeModules, responseAdapter, server, setCors }
