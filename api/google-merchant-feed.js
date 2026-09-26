import { handleApiError, sendJson } from './_security.js'

// The full catalogue is generated during the deploy build and served by the
// CDN. Keeping the expensive Supabase read out of this request prevents the
// old 1,000-row PostgREST cap and keeps Google/Facebook fetches deterministic.
const STATIC_FEED_PATH = '/feeds/google-merchant.xml.gz'
const STATIC_TSV_PATH = '/feeds/google-merchant.tsv.gz'
const STATIC_REPORT_PATH = '/feeds/google-merchant-report.json'

function queryFormat(request) {
  const fromQuery = request?.query?.format
  if (fromQuery) return String(fromQuery).toLowerCase()
  try { return new URL(request?.url || 'http://localhost').searchParams.get('format')?.toLowerCase() || 'xml' }
  catch { return 'xml' }
}

function isFacebookRequest(request) {
  return String(request?.url || '').toLowerCase().includes('facebook')
}

function siteOrigin(request) {
  const host = request?.headers?.['x-forwarded-host'] || request?.headers?.host
  const protocol = request?.headers?.['x-forwarded-proto'] || 'https'
  const trustedHost = /(?:^|\.)jersevo\.com(?::\d+)?$/i.test(String(host || ''))
    || /(?:^|\.)vercel\.app(?::\d+)?$/i.test(String(host || ''))
  if (trustedHost) return `${protocol}://${host}`
  const configured = process.env.SITE_URL || process.env.VITE_SITE_URL
  if (configured) return new URL(configured).origin
  return 'https://www.jersevo.com'
}

function redirectStatic(response, path) {
  response.setHeader('Location', path)
  response.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
  response.setHeader('X-Robots-Tag', 'noindex, nofollow')
  return response.status(307).end()
}

async function readStaticReport(request) {
  const url = `${siteOrigin(request)}${STATIC_REPORT_PATH}`
  const result = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
  if (!result.ok) throw Object.assign(new Error('The static Merchant feed has not been generated for this deployment.'), { status: 503 })
  const payload = await result.json()
  if (!payload?.completeness?.complete) throw Object.assign(new Error('The Merchant feed completeness guard has not passed.'), { status: 503 })
  return payload
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'GET Merchant feeds only.' })
  try {
    const format = queryFormat(request)
    const facebook = isFacebookRequest(request)
    if (format === 'json') {
      const report = await readStaticReport(request)
      return sendJson(response, 200, {
        ...report,
        feedUrl: `${siteOrigin(request)}/api/${facebook ? 'facebook-catalog-feed' : 'google-merchant-feed'}`,
        formats: ['xml', 'tsv']
      })
    }
    return redirectStatic(response, format === 'tsv' ? STATIC_TSV_PATH : STATIC_FEED_PATH)
  } catch (error) {
    return handleApiError(response, error, 'Merchant feed is unavailable.')
  }
}

export const MERCHANT_FEED_PATHS = Object.freeze({
  xml: STATIC_FEED_PATH,
  tsv: STATIC_TSV_PATH,
  report: STATIC_REPORT_PATH
})
