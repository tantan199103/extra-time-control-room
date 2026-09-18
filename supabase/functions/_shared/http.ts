import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const defaultHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
  'Vary': 'Origin'
}

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean)
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  const allowlist = allowedOrigins()
  if (origin && allowlist.length && !allowlist.includes(origin.replace(/\/$/, ''))) return null
  return { ...defaultHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) }
}

export function json(request: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  const headers = corsHeaders(request)
  if (!headers) return new Response(JSON.stringify({ error: 'Origin is not allowed.' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } })
}

export function options(request: Request) {
  const headers = corsHeaders(request)
  return new Response(null, { status: headers ? 204 : 403, headers: headers || { 'Content-Type': 'application/json' } })
}

export async function readJson(request: Request, maxBytes = 100_000) {
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
  try { return raw ? JSON.parse(raw) : {} } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }) }
}

export function serviceSupabase(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw Object.assign(new Error('Supabase Edge Function server access is not configured.'), { status: 503 })
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function requireCustomer(request: Request, client: SupabaseClient) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Sign in to continue.'), { status: 401 })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('Your customer session is invalid or expired.'), { status: 401 })
  return data.user
}

export function safeText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, maxLength)
}

export async function identityHash(request: Request, sessionId: string) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown'
  const bytes = new TextEncoder().encode(`${forwarded.split(',')[0].trim()}|${sessionId}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function consumeQuota(client: SupabaseClient, request: Request, action: string, sessionId: string) {
  const { data, error } = await client.rpc('pod_consume_api_quota', { requested_action: action, requested_identity_hash: await identityHash(request, sessionId) })
  if (error) throw Object.assign(new Error('Request protection is not ready. Apply the storefront runtime migration.'), { status: 503 })
  if (!data?.allowed) throw Object.assign(new Error('Too many requests. Try again later.'), { status: 429 })
}

export function withError(request: Request, error: any, fallback = 'Request failed.') {
  return json(request, { error: error?.message || fallback }, Number(error?.status) || 500, error?.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {})
}

export async function proxyToNode(request: Request, pathname: string) {
  const base = String(Deno.env.get('NODE_BACKEND_URL') || '').replace(/\/$/, '')
  if (!base) throw Object.assign(new Error('Node backend is not connected for this Edge Function.'), { status: 503 })
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
  const upstreamHeaders = new Headers(request.headers)
  // Host and content-length belong to the Edge runtime's outbound request;
  // forwarding them can make a proxy reject a perfectly valid body.
  upstreamHeaders.delete('host')
  upstreamHeaders.delete('content-length')
  const upstream = await fetch(`${base}${pathname}`, {
    method: request.method,
    headers: upstreamHeaders,
    body
  })
  const text = await upstream.text()
  const responseHeaders = corsHeaders(request) || { 'Content-Type': 'application/json' }
  responseHeaders['Content-Type'] = upstream.headers.get('content-type') || 'application/json'
  responseHeaders['Cache-Control'] = 'no-store'
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) responseHeaders['Retry-After'] = retryAfter
  return new Response(text, { status: upstream.status, headers: responseHeaders })
}
