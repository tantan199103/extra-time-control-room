import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

test('Vercel functions use a bounded US primary without unsupported failover', async () => {
  assert.deepEqual(config.regions, ['iad1'])
  assert.equal('functionFailoverRegions' in config, false, 'passive failover requires an Enterprise plan')
  for (const [pattern, settings] of Object.entries(config.functions)) {
    assert.ok(settings.maxDuration > 0 && settings.maxDuration <= 60, `${pattern} must have a bounded duration`)
    await access(new URL(`../${pattern}`, import.meta.url))
  }
  assert.deepEqual(config.functions, {
    'api/sitemap.js': { maxDuration: 15 },
    'api/google-merchant-feed.js': { maxDuration: 15 },
    'api/ai-listing-copy.js': { maxDuration: 60 },
    'api/ai-listing-media.js': { maxDuration: 60 },
    'api/newsletter-subscribe.js': { maxDuration: 15 },
    'api/ai-preview.js': { maxDuration: 60 },
    'api/customization-order.js': { maxDuration: 30 }
  }, 'SEO/feed stay on Vercel while AI listing tools and the remaining application API routes use Cloud Run')
  assert.ok(config.rewrites.some(rule => rule.source === '/api/google-merchant-feed' && rule.destination === '/api/google-merchant-feed.js'))
  assert.ok(config.rewrites.some(rule => rule.source === '/api/newsletter-subscribe' && rule.destination === '/api/newsletter-subscribe.js'))
  assert.ok(config.rewrites.some(rule => rule.source === '/api/customization-order' && rule.destination === '/api/customization-order.js'))
})

test('static assets are cacheable while API responses remain no-store', async () => {
  const assetPolicy = config.headers.find(rule => rule.source === '/assets/(.*)')
  assert.match(assetPolicy.headers.find(header => header.key === 'Cache-Control').value, /stale-while-revalidate/)
  const security = await readFile(new URL('../api/_security.js', import.meta.url), 'utf8')
  assert.match(security, /setHeader\('Cache-Control', 'no-store'\)/)
})

test('AI upstream timeouts keep Vercel bounded and allow the Cloud Run budget', async () => {
  const preview = await readFile(new URL('../api/ai-preview.js', import.meta.url), 'utf8')
  const copy = await readFile(new URL('../api/ai-listing-copy.js', import.meta.url), 'utf8')
  const media = await readFile(new URL('../api/ai-listing-media.js', import.meta.url), 'utf8')
  assert.match(preview, /AbortSignal\.timeout\(55000\)/)
  assert.match(copy, /process\.env\.K_SERVICE \? 240_000 : 55_000/)
  assert.match(media, /process\.env\.K_SERVICE \? 240_000 : 55_000/)
  assert.match(copy, /The AI provider took too long to finish/)
  assert.match(media, /The AI image provider took too long to finish/)
})
