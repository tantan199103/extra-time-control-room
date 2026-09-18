import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export function sendJson(response, status, body) {
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  return response.status(status).json(body)
}

export function readBody(request, maxBytes = 24000) {
  const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw Object.assign(new Error('Request is too large.'), { status:413 })
  try { return typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {} }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status:400 }) }
}

export function rawRequestBody(request) {
  const raw = request?.rawBody ?? request?.body
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (typeof raw === 'string') return raw
  return null
}

export function enforceSameOrigin(request) {
  const origin = request.headers?.origin
  if (!origin) return
  const host = request.headers?.['x-forwarded-host'] || request.headers?.host
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean)
  try {
    const normalizedOrigin = new URL(origin).origin.replace(/\/$/, '')
    if (allowedOrigins.length) {
      if (!allowedOrigins.includes(normalizedOrigin)) throw new Error('origin-not-allowlisted')
      return
    }
    if (!host || new URL(origin).host !== host) throw new Error('mismatch')
  } catch {
    throw Object.assign(new Error('Cross-origin requests are not allowed.'), { status:403 })
  }
}

export function serverSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw Object.assign(new Error('Secure Supabase server access is not configured.'), { status:503 })
  return createClient(url, key, { auth:{ persistSession:false, autoRefreshToken:false } })
}

export async function requireAdmin(request, client = serverSupabase()) {
  const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i,'')
  if (!token) throw Object.assign(new Error('Admin sign-in is required.'),{status:401})
  const {data,error}=await client.auth.getUser(token)
  if(error||!data?.user)throw Object.assign(new Error('The admin session is invalid or expired.'),{status:401})
  if(data.user.app_metadata?.extra_time_role!=='admin')throw Object.assign(new Error('Extra Time admin permission is required.'),{status:403})
  return data.user
}

export function customerSession(body) {
  const sessionId = String(body?.sessionId || '')
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) throw Object.assign(new Error('A valid customer session is required. Refresh the page and try again.'), { status:422 })
  return sessionId
}

export function requestIdentity(request, sessionId) {
  const forwarded = String(request.headers?.['x-forwarded-for'] || request.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim()
  return createHash('sha256').update(`${forwarded}|${sessionId}`).digest('hex')
}

export async function consumeQuota(client, action, identityHash) {
  const { data, error } = await client.rpc('pod_consume_api_quota', { requested_action:action, requested_identity_hash:identityHash })
  if (error) throw Object.assign(new Error('Request protection is not ready. Apply the storefront runtime migration.'), { status:503 })
  if (!data?.allowed) {
    const retryAfter = Math.max(1, Number(data?.retry_after_seconds || 3600))
    const error = Object.assign(new Error(`Too many ${action === 'ai-preview' ? 'AI previews' : action === 'cart-validate' ? 'cart checks' : 'requests'}. Try again later.`), { status:429, retryAfter })
    throw error
  }
  return data
}

export function handleApiError(response, error, fallback = 'Request failed.') {
  if (error?.retryAfter) response.setHeader('Retry-After', String(error.retryAfter))
  return sendJson(response, Number(error?.status) || 500, { error:error instanceof Error ? error.message : fallback })
}

export function safeText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength)
}
