#!/usr/bin/env node

/**
 * Fully Automated Fanatics Crawler & Catalog Synchronizer
 * 
 * Bypasses Akamai Bot Manager automatically by driving local Chrome via Chrome DevTools Protocol (CDP).
 * Accepts any Fanatics Product URL or Category URL, crawls product details, sanitizes metadata,
 * strips EXIF/IPTC from images, uploads to Supabase Storage, and saves listings to Supabase Database.
 * 
 * Usage:
 *   node scripts/auto-sync-fanatics.mjs --url "https://www.fanatics.com/..." [--limit 10] [--write] [--media]
 *   npm run sync:fanatics -- --url "https://www.fanatics.com/..." --limit 5 --write --media
 */

import cp from 'node:child_process'
import fs from 'node:fs'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import {
  normalizeFanaticsProduct,
  hydrateListingMedia,
  PRIMARY_FANATICS_HOST
} from './fanatics-import-lib.mjs'
import {
  saveListingsToDatabase,
  saveAuditRecords
} from './import-fanatics-catalog.mjs'

for (const envFile of ['.env.local', '.env', '.env.fangear.import']) {
  if (fs.existsSync(envFile)) {
    try {
      const content = fs.readFileSync(envFile, 'utf8')
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(?:["']?)(.*?)(?:["']?)\s*$/)
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2]
        }
      }
    } catch {}
  }
}

const rawSupabaseUrl = String(process.env.SUPABASE_URL || '').trim()
const supabaseUrl = /^https?:\/\//i.test(rawSupabaseUrl) ? rawSupabaseUrl : (process.env.VITE_SUPABASE_URL || 'https://ofetusgarxcwloxxkhnr.supabase.co')
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const outputPath = process.env.FANATICS_IMPORT_REPORT || resolve('artifacts', 'fanatics-import-report.json')

function hasArg(name) { return process.argv.includes(name) }
function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const targetUrl = argValue('--url', '')
const limit = Math.max(1, Number(argValue('--limit', 10)) || 10)
const dryRun = !hasArg('--write')
const includeMedia = hasArg('--media') || (hasArg('--write') && String(process.env.FANATICS_IMPORT_MEDIA || 'true').toLowerCase() !== 'false')

function usage() {
  console.log(`\nAutomated Fanatics Crawler & Store Synchronizer\n\n` +
    `  node scripts/auto-sync-fanatics.mjs --url <fanatics-url> [--limit <n>] [--write] [--media]\n\n` +
    `Options:\n` +
    `  --url <url>     Fanatics Category URL or Product URL.\n` +
    `  --limit <n>     Maximum number of products to crawl if a category URL is provided (default: 10).\n` +
    `  --write         Save draft listings to Supabase (requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).\n` +
    `  --media         Download high-res images, strip EXIF metadata, and upload to 'product-media' bucket.\n` +
    `  --dry-run       Crawl and normalize without writing to Supabase (default).\n`)
}

if (hasArg('--help') || hasArg('-h')) {
  usage()
  process.exit(0)
}

if (!targetUrl) {
  usage()
  console.error('Error: Please provide a Fanatics URL with --url "<url>"\n')
  process.exit(1)
}

function findBrowserExecutable() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ]
  for (const path of candidates) {
    if (path && fs.existsSync(path)) return path
  }
  throw new Error('Google Chrome or Microsoft Edge was not found on this system.')
}

class ChromeController {
  constructor(port = 9660) {
    this.port = port
    this.proc = null
    this.tempDir = resolve(process.env.TEMP || '.', `chrome-fanatics-${Date.now()}`)
    this.ws = null
    this.msgId = 1
  }

  async start() {
    const exe = findBrowserExecutable()
    console.log(`Starting browser engine: ${exe}`)
    this.proc = cp.spawn(exe, [
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.tempDir}`,
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ], { stdio: 'ignore' })

    // Wait for CDP endpoint to become ready
    let ready = false
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300))
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/list`)
        if (res.ok) { ready = true; break }
      } catch {}
    }
    if (!ready) throw new Error('Could not connect to browser CDP port.')

    const listRes = await fetch(`http://127.0.0.1:${this.port}/json/list`)
    const tabs = await listRes.json()
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0]
    if (!pageTab?.webSocketDebuggerUrl) throw new Error('No debugger WebSocket found for page tab.')

    this.ws = new WebSocket(pageTab.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })

    await this.send('Page.enable')
    await this.send('Runtime.enable')
    console.log('Browser engine connected successfully.')
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++
      const handler = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data.id === id) {
            this.ws.removeEventListener('message', handler)
            if (data.error) reject(new Error(data.error.message))
            else resolve(data.result)
          }
        } catch (err) {
          this.ws.removeEventListener('message', handler)
          reject(err)
        }
      }
      this.ws.addEventListener('message', handler)
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async navigate(url, waitMs = 4000) {
    await this.send('Page.navigate', { url })
    await new Promise(r => setTimeout(r, waitMs))
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    return res.result?.value
  }

  async close() {
    try { if (this.ws) this.ws.close() } catch {}
    try { if (this.proc) this.proc.kill() } catch {}
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true })
      }
    } catch {}
    console.log('Browser engine closed.')
  }
}

async function extractProductFromCurrentPage(browser) {
  return await browser.evaluate(`(() => {
    // 1. Extract Schema.org JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    let jsonLd = null
    for (const s of scripts) {
      try {
        const d = JSON.parse(s.textContent.trim())
        if (d['@type'] === 'Product') { jsonLd = d; break; }
        if (Array.isArray(d['@graph'])) {
          const found = d['@graph'].find(item => item['@type'] === 'Product')
          if (found) { jsonLd = found; break; }
        }
      } catch {}
    }

    // 2. Extract DOM Sizes
    const sizes = []
    const buttons = document.querySelectorAll('[data-talos="size-selector-button"], button[aria-label*="Size"], .size-selector-button, select[name="size"] option')
    for (const btn of buttons) {
      const text = (btn.textContent || btn.innerText || btn.value || '').trim()
      if (text && !/select|size chart/i.test(text)) {
        sizes.push(text.split('\\n')[0].trim())
      }
    }
    const uniqueSizes = [...new Set(sizes)]

    // 3. Extract DOM Images (high-resolution)
    const domImages = Array.from(document.querySelectorAll('img[src*="frgimages.com"], img[src*="footballfanatics.com"]'))
      .map(img => img.getAttribute('data-src') || img.src || '')
      .filter(Boolean)
      .map(url => url.replace(/w=\\d+/i, 'w=1200').replace(/q=\\d+/i, 'q=92'))

    const jsonImages = jsonLd?.image ? (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]) : []
    const allImages = [...new Set([...jsonImages, ...domImages])]
      .map(url => String(url).replace(/w=\\d+/i, 'w=1200').replace(/q=\\d+/i, 'q=92'))

    // 4. Extract Title & Description
    const rawTitle = jsonLd?.name || document.title.split('|')[0].trim()
    const description = jsonLd?.description || document.querySelector('meta[name="description"]')?.content || ''
    const price = jsonLd?.offers?.price ? Number(jsonLd.offers.price) : null
    const sku = jsonLd?.sku || jsonLd?.productID || window.location.pathname.split('/').pop()

    const isPersonalized = /\b(?:custom(?:ized|ised|izer)?|personaliz(?:ed|ation)|add\s*your\s*name)\b/i.test(document.body.innerText || '')

    return {
      source: 'fanatics.com',
      url: window.location.href,
      id: sku,
      sku,
      name: rawTitle,
      title: rawTitle,
      description,
      price,
      inStock: jsonLd?.offers?.availability ? jsonLd.offers.availability.includes('InStock') : true,
      images: allImages,
      sizes: uniqueSizes.length ? uniqueSizes : ['S', 'M', 'L', 'XL', '2XL'],
      isPersonalized
    }
  })()`)
}

async function extractCategoryProductUrls(browser, maxCount) {
  // Scroll down to trigger lazy loading of product cards
  console.log('Hydrating catalog grid (scrolling)...')
  await browser.evaluate('window.scrollTo(0, 1500)')
  await new Promise(r => setTimeout(r, 2500))
  await browser.evaluate('window.scrollTo(0, 3000)')
  await new Promise(r => setTimeout(r, 2500))
  await browser.evaluate('window.scrollTo(0, 4500)')
  await new Promise(r => setTimeout(r, 2500))

  return await browser.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.product-card, [data-talos*="productCard"], [class*="product-card"], [class*="ProductCard"]'))
    const cardLinks = cards.flatMap(card => {
      const a = card.querySelector('a[href]')
      return a ? [a.href] : []
    })
    const allAnchors = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h => !h.includes('#') && (/\\+p-\\d+/i.test(h) || /\\/p-\\d+/i.test(h) || h.includes('/product/')))
    const unique = [...new Set([...cardLinks, ...allAnchors])].filter(h => !h.includes('#') && (/\\+p-\\d+/i.test(h) || /\\/p-\\d+/i.test(h) || h.includes('/product/')))
    return unique.slice(0, ${maxCount})
  })()`)
}

export async function runAutoSync({
  url = targetUrl,
  maxProducts = limit,
  isDryRun = dryRun,
  withMedia = includeMedia
} = {}) {
  console.log(`\n======================================================`)
  console.log(`   AUTOMATED FANATICS SYNC: ${url}`)
  console.log(`   Limit: ${maxProducts} products | Mode: ${isDryRun ? 'DRY_RUN' : 'WRITE'} | Media: ${withMedia ? 'ON' : 'OFF'}`)
  console.log(`======================================================\n`)

  const browser = new ChromeController(9661)
  const rawProducts = []
  const errors = []

  try {
    await browser.start()
    console.log(`Navigating to: ${url}`)
    await browser.navigate(url, 5000)

    let isSingleProduct = false
    try {
      const parsedPath = new URL(url).pathname
      isSingleProduct = /\+p-\d+/i.test(parsedPath) || /\/p-\d+/i.test(parsedPath) || /\/product\//i.test(parsedPath)
    } catch {
      isSingleProduct = url.includes('+p-') || url.includes('/product/')
    }
    
    if (isSingleProduct) {
      console.log('Detected single Product Detail Page. Extracting...')
      const product = await extractProductFromCurrentPage(browser)
      if (product?.title) rawProducts.push(product)
      else throw new Error('Could not extract product data from page.')
    } else {
      console.log('Detected Category/Listing Page. Scanning product cards...')
      const productUrls = await extractCategoryProductUrls(browser, maxProducts)
      console.log(`Found ${productUrls.length} products to crawl.`)

      for (let i = 0; i < productUrls.length; i++) {
        const prodUrl = productUrls[i]
        console.log(`[${i + 1}/${productUrls.length}] Crawling: ${prodUrl}`)
        try {
          await browser.navigate(prodUrl, 3500)
          const product = await extractProductFromCurrentPage(browser)
          if (product?.title) {
            rawProducts.push(product)
            console.log(`   ✔ Extracted: "${product.title}" (${product.images.length} images, ${product.sizes.length} sizes)`)
          }
        } catch (err) {
          console.warn(`   ✖ Error crawling ${prodUrl}:`, err.message)
          errors.push({ url: prodUrl, error: err.message })
        }
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`\nCrawling complete. Total products extracted: ${rawProducts.length}`)
  const rawBackupPath = resolve('artifacts', 'fanatics-raw-products.json')
  await mkdir(resolve(rawBackupPath, '..'), { recursive: true })
  await writeFile(rawBackupPath, JSON.stringify(rawProducts, null, 2), 'utf8')
  console.log(`Saved raw extracted products to: ${rawBackupPath}`)

  // 2. Normalization & Sanitization
  console.log('\nRunning Data Sanitizer (stripping Fanatics branding, generating clean SKUs)...')
  const usedHandles = new Set()
  const usedSkus = new Set()
  let normalizedItems = rawProducts.map(raw => {
    try {
      return normalizeFanaticsProduct(raw, { usedHandles, usedSkus })
    } catch (err) {
      errors.push({ item: raw.name || raw.title, error: err.message })
      return null
    }
  }).filter(Boolean)

  console.log(`Normalized ${normalizedItems.length} products into clean Jersevo listing models.`)

  // 3. Supabase Integration (Media Upload & Database Save)
  let client = null
  let importedCount = 0

  if (!isDryRun) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Write mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
    }
    client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  if (withMedia && client) {
    console.log('\nDownloading high-res images, stripping EXIF/IPTC metadata, and uploading to product-media bucket...')
    for (let index = 0; index < normalizedItems.length; index++) {
      process.stdout.write(`Uploading media for product ${index + 1}/${normalizedItems.length}... `)
      normalizedItems[index] = await hydrateListingMedia(client, normalizedItems[index], { errors })
      console.log('Done.')
    }
  }

  if (!isDryRun && client) {
    console.log('\nSaving listings to Supabase Database (status: DRAFT)...')
    const saveResult = await saveListingsToDatabase(client, normalizedItems, errors)
    importedCount = saveResult.count
    await saveAuditRecords(client, normalizedItems, saveResult.importedIds)
    console.log(`Successfully saved ${importedCount} listings to Supabase!`)
  }

  // 4. Generate Report
  const report = {
    generatedAt: new Date().toISOString(),
    sourceUrl: url,
    mode: isDryRun ? 'DRY_RUN' : 'WRITE',
    crawledCount: rawProducts.length,
    normalizedCount: normalizedItems.length,
    importedListings: importedCount,
    mediaHydrated: withMedia && Boolean(client),
    errors,
    items: normalizedItems.map(item => ({
      id: item.listing.id,
      handle: item.listing.handle,
      title: item.listing.title,
      price: item.listing.price,
      sku: item.listing.sku,
      image: item.listing.image,
      isPersonalized: item.listing.customFields.length > 0,
      variantsCount: item.listing.variants.length
    }))
  }

  await mkdir(resolve(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')

  console.log(`\n======================================================`)
  console.log(`✔ AUTOMATED SYNC COMPLETED`)
  console.log(`  Mode: ${report.mode}`)
  console.log(`  Products Processed: ${report.normalizedCount}`)
  console.log(`  Imported to Database: ${report.importedListings}`)
  console.log(`  Errors: ${report.errors.length}`)
  console.log(`  Report: ${outputPath}`)
  console.log(`======================================================\n`)

  return report
}

const isMain = process.argv[1] && new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname.endsWith('/auto-sync-fanatics.mjs')
if (isMain) {
  runAutoSync().catch(err => {
    console.error(`\nAuto sync failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
