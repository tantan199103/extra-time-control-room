import { performance } from 'node:perf_hooks'

const base = (process.argv[2] || process.env.GMC_FEED_URL || 'https://www.jersevo.com/api/google-merchant-feed').replace(/\/$/, '')

async function fetchReport() {
  const started = performance.now()
  const response = await fetch(`${base}${base.includes('?') ? '&' : '?'}format=json`, { redirect:'follow' })
  const payload = await response.json().catch(() => ({}))
  return { response, payload, elapsedMs:Math.round(performance.now() - started) }
}

async function fetchFeed(format = 'xml') {
  const url = `${base}${base.includes('?') ? '&' : '?'}format=${format}`
  const response = await fetch(url, { redirect:'follow' })
  const body = await response.text()
  return { response, body }
}

try {
  const reportResult = await fetchReport()
  const report = reportResult.payload
  const xmlResult = await fetchFeed('xml')
  const checks = {
    reportStatus:reportResult.response.status,
    xmlStatus:xmlResult.response.status,
    xmlContentType:xmlResult.response.headers.get('content-type') || '',
    xmlHasRss:/<rss\b[^>]*xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/i.test(xmlResult.body),
    xmlItemCount:(xmlResult.body.match(/<item>/g) || []).length,
    rejectedItems:Number(report.rejectedItems || 0),
    acceptedItems:Number(report.acceptedItems || 0),
    candidateProducts:Number(report.candidateProducts || 0),
    elapsedMs:reportResult.elapsedMs
  }
  console.log(JSON.stringify({ base, checks, reasonCounts:report.reasonCounts || {}, warningCounts:report.warningCounts || {} }, null, 2))
  if (reportResult.response.status !== 200 || xmlResult.response.status !== 200 || !checks.xmlHasRss) process.exitCode = 2
  if (checks.xmlItemCount !== checks.acceptedItems) process.exitCode = 2
  if (checks.rejectedItems > 0) process.exitCode = 2
} catch (error) {
  console.error(JSON.stringify({ base, error:error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 2
}

