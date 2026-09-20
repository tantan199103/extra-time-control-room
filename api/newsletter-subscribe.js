import { createHash } from 'node:crypto'
import { consumeQuota, enforceSameOrigin, handleApiError, readBody, safeText, sendJson, serverSupabase } from './_security.js'

function normalizeEmail(value) {
  const email = safeText(value, 240).toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status:422 })
  return email
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error:'POST newsletter subscriptions only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 4000)
    // Honeypot values are never stored; bots receive a generic success.
    const email = normalizeEmail(body.email)
    if (safeText(body.company, 80)) return sendJson(response, 200, { ok:true })
    if (body.consent !== true) throw Object.assign(new Error('Confirm email updates before joining the list.'), { status:422 })
    const client = serverSupabase()
    const identity = createHash('sha256').update(email).digest('hex')
    await consumeQuota(client, 'newsletter-subscribe', identity)
    const { error } = await client.from('pod_newsletter_subscribers').upsert({
      email, source:safeText(body.source || 'storefront', 80), consent_at:new Date().toISOString(), status:'SUBSCRIBED'
    }, { onConflict:'email' })
    if (error) throw error
    return sendJson(response, 200, { ok:true })
  } catch (error) { return handleApiError(response, error, 'Newsletter subscription failed.') }
}
