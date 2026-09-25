import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { filterTaassGroups, mergeExistingState } from '../scripts/import-taass-catalog.mjs'

const execFileAsync = promisify(execFile)

test('remaining catalogue scope excludes cap and jersey families, including overlapping names', () => {
  const groups = [
    { familyCode: '100001', urls: ['https://www.taass.com/club-snapback-cap/100001'] },
    { familyCode: '100002', urls: ['https://www.taass.com/club-nfl-jersey/100002'] },
    { familyCode: '100003', urls: ['https://www.taass.com/club-crew-sweater/100003'] },
    { familyCode: '100004', urls: ['https://www.taass.com/jersey-shore-blueclaws-cap/100004'] }
  ]
  assert.deepEqual(filterTaassGroups(groups, { remainingOnly: true }).map(group => group.familyCode), ['100003'])
  assert.deepEqual(filterTaassGroups(groups, { headwearOnly: true }).map(group => group.familyCode), ['100001', '100004'])
})

test('rerun preserves an existing published hat with deliberately empty customization fields', () => {
  const generated = {
    sourceSku: '500141',
    listing: {
      status: 'DRAFT',
      customFields: [{ id: 'name', key: 'name', label: 'Name', type: 'text' }],
      personalization: ['Name'],
      media: [],
      image: '',
      taxonomy: { league: 'nhl' },
      aiMetadata: {},
      variants: [{ id: 'variant-1', status: 'ACTIVE' }]
    }
  }
  const existing = {
    status: 'PUBLISHED',
    custom_fields: [],
    personalization: [],
    media: [],
    image: 'https://project.supabase.co/hat.avif',
    taxonomy: { category: 'Accessories' },
    ai_metadata: {}
  }
  const merged = mergeExistingState(generated, existing).listing
  assert.equal(merged.status, 'PUBLISHED')
  assert.deepEqual(merged.customFields, [])
  assert.deepEqual(merged.personalization, [])
  assert.equal(merged.image, existing.image)
  assert.equal(merged.taxonomy.category, 'Accessories')
})

function productHtml(origin, familyCode) {
  return `<html><head><link rel="canonical" href="${origin}/product/${familyCode}">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      productID: `source-${familyCode}`,
      sku: `SKU-${familyCode}`,
      name: `Sample fan shirt ${familyCode}`,
      description: 'Game day shirt.',
      offers: { '@type': 'Offer', price: '79.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }
    })}</script></head></html>`
}

test('write import checkpoints completed families and resumes failed families with active stock at 1:1', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'taass-import-test-'))
  const writes = []
  const collections = []
  const links = []
  let failSecond = true
  const server = createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${server.address().port}`
    const send = (status, payload, contentType = 'application/json') => {
      response.writeHead(status, { 'content-type': contentType })
      response.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
    }
    if (request.url === '/sitemap.xml') {
      send(200, `<urlset><url><loc>${origin}/product/100001</loc></url><url><loc>${origin}/product/100002</loc></url></urlset>`, 'application/xml')
    } else if (request.url?.startsWith('/product/')) {
      send(200, productHtml(origin, request.url.split('/').at(-1)), 'text/html')
    } else if (request.url?.startsWith('/rest/v1/pod_products?')) {
      send(200, [])
    } else if (request.url?.startsWith('/rest/v1/pod_collections?')) {
      if (request.method === 'GET') send(200, collections)
      else {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        collections.push(...JSON.parse(Buffer.concat(chunks).toString('utf8')))
        send(201, [])
      }
    } else if (request.url?.startsWith('/rest/v1/pod_collection_products?')) {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      links.push(...JSON.parse(Buffer.concat(chunks).toString('utf8')))
      send(201, [])
    } else if (request.url?.startsWith('/rest/v1/rpc/pod_save_listing')) {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (payload.listing.handle.includes('100002') && failSecond) send(500, { message: 'Simulated temporary save failure' })
      else {
        writes.push(payload.listing)
        send(200, { id: payload.listing.id })
      }
    } else if (request.url?.startsWith('/rest/v1/pod_catalog_imports?')) {
      send(201, [])
    } else {
      send(404, { message: `Unexpected path ${request.url}` })
    }
  })
  try {
    await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
    const origin = `http://127.0.0.1:${server.address().port}`
    const reportPath = join(temporaryDirectory, 'report.json')
    const checkpointPath = join(temporaryDirectory, 'checkpoint.json')
    const env = {
      ...process.env,
      TAASS_SOURCE_AUTHORIZED: 'true',
      TAASS_SITEMAP_URL: `${origin}/sitemap.xml`,
      TAASS_IMPORT_REPORT: reportPath,
      TAASS_IMPORT_CHECKPOINT: checkpointPath,
      TAASS_REQUEST_INTERVAL_MS: '250',
      TAASS_REQUEST_RETRIES: '0',
      TAASS_IMPORT_MEDIA: 'false',
      SUPABASE_URL: origin,
      VITE_SUPABASE_URL: origin,
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-long-enough'
    }
    const args = [resolve('scripts/import-taass-catalog.mjs'), '--write', '--all', '--batch-size', '1']
    await assert.rejects(execFileAsync(process.execPath, args, { cwd: temporaryDirectory, env }), error => error.code === 2)
    const firstReport = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(firstReport.products, 1)
    assert.equal(firstReport.processedFamilies, 1)
    assert.equal(firstReport.complete, false)

    failSecond = false
    await execFileAsync(process.execPath, args, { cwd: temporaryDirectory, env })
    const finalReport = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(finalReport.products, 2)
    assert.equal(finalReport.variants, 2)
    assert.equal(finalReport.processedFamilies, 2)
    assert.equal(finalReport.complete, true)
    assert.equal(finalReport.errors.length, 0)
    assert.equal(writes.length, 2)
    assert.ok(writes.every(listing => listing.status === 'DRAFT' && listing.inventory === 1000))
    assert.ok(writes.every(listing => listing.variants[0].status === 'ACTIVE' && listing.variants[0].price === 79.95 && listing.variants[0].inventory === 1000))
    assert.ok(writes.every(listing => listing.taxonomy.category === 'Fan Apparel'))
    assert.deepEqual(collections.map(collection => collection.handle), ['apparel'])
    assert.equal(links.length, 2)
  } finally {
    await new Promise(resolvePromise => server.close(resolvePromise))
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})
