import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { isTaassJerseyListing, isTaassJerseyUrl, withTaassCatalogCategory } from '../scripts/taass-catalog-routing.mjs'
import { prepareTaassJerseyListing } from '../scripts/taass-import-lib.mjs'

const execFileAsync = promisify(execFile)

test('jersey scope excludes team names and collectibles that contain jersey', () => {
  assert.equal(isTaassJerseyUrl('https://www.taass.com/new-jersey-devils-trucker-cap/100001'), false)
  assert.equal(isTaassJerseyUrl('https://www.taass.com/nba-trikot/100002'), true)
  assert.equal(isTaassJerseyListing(withTaassCatalogCategory({ title: 'NBA Swingman Jersey', productGroup: 'Jerseys', taxonomy: { league: 'nba' } })), true)
  assert.equal(isTaassJerseyListing(withTaassCatalogCategory({ title: 'Signed Jersey Trading Card', productGroup: 'Trading Cards', taxonomy: { league: 'nba' } })), false)
})

test('1:1 jersey pricing rejects source currencies other than EUR', () => {
  const item = { sourceSku: '123456', listing: { variants: [{ price: 49.9, inventory: 0 }] }, sourceVariants: [{ currency: 'USD', price: 49.9 }] }
  assert.throws(() => prepareTaassJerseyListing(item), /expected EUR/)
})

test('jersey sync imports priced drafts with 1000 stock per active variant', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'taass-jersey-sync-'))
  const writes = []
  const collections = []
  const server = createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${server.address().port}`
    const send = (status, value, type = 'application/json') => {
      response.writeHead(status, { 'content-type': type })
      response.end(typeof value === 'string' ? value : JSON.stringify(value))
    }
    const path = new URL(request.url, origin).pathname
    if (path === '/sitemap.xml') {
      send(200, `<urlset><url><loc>${origin}/nfl-trikot/100001</loc></url><url><loc>${origin}/new-jersey-devils-cap/100002</loc></url><url><loc>${origin}/signed-jersey-card/100003</loc></url></urlset>`, 'application/xml')
    } else if (/^\/(?:nfl-trikot|signed-jersey-card)\/10000[13]$/.test(path)) {
      const jersey = path.includes('nfl-trikot')
      const title = jersey ? 'Houston Texans NFL Jersey' : 'Signed Jersey Card'
      const category = jersey ? 'Jerseys' : 'Trading Cards'
      send(200, `<html><head><link rel="canonical" href="${origin}${path}"><script type="application/ld+json">${JSON.stringify({
        '@type': 'Product', productID: path, sku: path, name: title, description: `<p>${title}</p>`,
        offers: { '@type': 'Offer', price: '79.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }
      })}</script></head><body><table><tr class="properties-row"><th class="properties-label">Sport:</th><td class="properties-value">NFL</td></tr><tr class="properties-row"><th class="properties-label">Product category:</th><td class="properties-value">${category}</td></tr></table></body></html>`, 'text/html')
    } else if (path === '/rest/v1/pod_products') {
      send(200, writes.map(row => ({ id: row.id, status: row.status, updated_at: '2026-09-23T00:00:00Z' })))
    } else if (path === '/rest/v1/pod_collections') {
      if (request.method === 'GET') send(200, collections)
      else {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        collections.push(...JSON.parse(Buffer.concat(chunks).toString('utf8')))
        send(201, [])
      }
    } else if (path === '/rest/v1/pod_collection_products' || path === '/rest/v1/pod_catalog_imports') {
      send(201, [])
    } else if (path === '/rest/v1/rpc/pod_save_listing') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      writes.push(payload.listing)
      send(200, { id: payload.listing.id })
    } else {
      send(404, { message: `Unexpected path ${path}` })
    }
  })

  try {
    await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
    const origin = `http://127.0.0.1:${server.address().port}`
    const reportPath = join(temporaryDirectory, 'report.json')
    const env = {
      ...process.env,
      TAASS_SOURCE_AUTHORIZED: 'true',
      TAASS_SITEMAP_URL: `${origin}/sitemap.xml`,
      TAASS_IMPORT_REPORT: reportPath,
      TAASS_IMPORT_CHECKPOINT: join(temporaryDirectory, 'checkpoint.json'),
      TAASS_REQUEST_INTERVAL_MS: '250',
      TAASS_REQUEST_RETRIES: '0',
      TAASS_IMPORT_MEDIA: 'false',
      TAASS_DEFAULT_INVENTORY: '2500',
      SUPABASE_URL: origin,
      VITE_SUPABASE_URL: origin,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-long-enough'
    }
    const args = [resolve('scripts/import-taass-catalog.mjs'), '--write', '--jersey-only', '--all']
    await execFileAsync(process.execPath, args, { cwd: temporaryDirectory, env })
    const first = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(first.scope, 'JERSEYS')
    assert.equal(first.products, 1)
    assert.equal(first.skippedNonJersey, 1)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].status, 'DRAFT')
    assert.equal(writes[0].price, 79.95)
    assert.equal(writes[0].inventory, 1000)
    assert.equal(writes[0].variants[0].status, 'ACTIVE')
    assert.equal(writes[0].variants[0].price, 79.95)
    assert.equal(writes[0].variants[0].inventory, 1000)
    assert.equal(writes[0].seo_status, 'BLOCKED')

    await execFileAsync(process.execPath, args, { cwd: temporaryDirectory, env })
    const second = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(second.updatedExisting, 1)
    assert.equal(writes.length, 2)
  } finally {
    await new Promise(resolvePromise => server.close(resolvePromise))
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})
