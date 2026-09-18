import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('initial HTML exposes US indexable metadata and canonical site signals', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /<html lang="en-US">/)
  assert.match(html, /name="robots" content="index,follow/)
  assert.match(html, /rel="canonical" href="https:\/\/www\.jersevo\.com\//)
  assert.match(html, /hreflang="en-US"/)
  assert.match(html, /application\/ld\+json/)
  assert.match(html, /"areaServed".*United States/s)
})

test('robots and sitemap use the canonical production host', async () => {
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8')
  const sitemap = await readFile(new URL('../api/sitemap.js', import.meta.url), 'utf8')
  assert.match(robots, /Sitemap: https:\/\/www\.jersevo\.com\/sitemap\.xml/)
  assert.match(sitemap, /https:\/\/www\.jersevo\.com/)
  assert.match(sitemap, /X-Robots-Tag/)
})

test('SEO build creates initial HTML for product pages and protects private routes', async () => {
  const generator = await readFile(new URL('../scripts/generate-seo-pages.mjs', import.meta.url), 'utf8')
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.match(generator, /Product/)
  assert.match(generator, /Generated \$\{products\.length\} product pages/)
  assert.equal(vercel.headers.find(rule => rule.source === '/admin').headers[0].value, 'noindex, nofollow')
  assert.equal(vercel.headers.find(rule => rule.source === '/account/(.*)').headers[0].value, 'noindex, nofollow')
})

test('client route metadata marks unavailable and private routes noindex', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
  assert.match(main, /unresolvedRoute/)
  assert.match(main, /noindex,nofollow/)
  assert.match(main, /VITE_SITE_URL \|\| 'https:\/\/www\.jersevo\.com'/)
  assert.match(main, /AggregateRating/)
})
