import { performance } from 'node:perf_hooks'

const base = (process.argv[2] || process.env.HOSTING_URL || 'https://extra-time-control-room.vercel.app').replace(/\/$/, '')

async function probe(path) {
  const url = `${base}${path}`
  const started = performance.now()
  try {
    const response = await fetch(url, { redirect: 'follow' })
    const body = await response.arrayBuffer()
    const elapsedMs = Math.round(performance.now() - started)
    return {
      path,
      finalUrl: response.url,
      status: response.status,
      elapsedMs,
      bytes: body.byteLength,
      contentType: response.headers.get('content-type') || '',
      cacheControl: response.headers.get('cache-control') || '',
      vercelCache: response.headers.get('x-vercel-cache') || '',
      vercelId: response.headers.get('x-vercel-id') || '',
      age: response.headers.get('age') || ''
    }
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : String(error) }
  }
}

const probes = [
  await probe('/'),
  await probe('/shop'),
  await probe('/sw.js'),
  await probe('/manifest.webmanifest'),
  await probe('/api/payment-config')
]

// Discover one current hashed JS/CSS asset from the shell so this check keeps
// working after every Vite build without hard-coding a filename.
try {
  const shell = await fetch(`${base}/`, { redirect: 'follow' })
  const html = await shell.text()
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"']+\.(?:js|css))"/g)].map(match => match[1])
  for (const asset of assets.slice(0, 2)) probes.push(await probe(asset))
} catch (error) {
  probes.push({ path: '/assets/*', error: error instanceof Error ? error.message : String(error) })
}

const warnings = []
const payment = probes.find(item => item.path === '/api/payment-config')
if (payment?.contentType.includes('text/html')) warnings.push('/api/payment-config returned the SPA shell; deploy the API function instead of routing it through the catch-all rewrite.')
if (payment?.cacheControl && !payment.cacheControl.includes('no-store')) warnings.push('/api/payment-config is cacheable; payment configuration must remain no-store.')
if (probes.some(item => item.vercelCache === 'HIT' && item.path.startsWith('/api/'))) warnings.push('An API response was served from Vercel cache; verify that the route sets no-store or an explicit private policy.')

console.log(JSON.stringify({ base, generatedAt: new Date().toISOString(), probes, warnings }, null, 2))
if (warnings.length) process.exitCode = 2
