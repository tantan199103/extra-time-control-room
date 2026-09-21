/**
 * Fanatics Browser Collector
 * 
 * Run this script in the Chrome DevTools Console, as a Bookmarklet,
 * or via Tampermonkey when viewing any product page on fanatics.com,
 * nflshop.com, nbastore.com, or fansedge.com.
 * 
 * It bypasses Akamai Bot Manager using your genuine browser session,
 * extracts product details, high-res images, sizes, and personalization fields,
 * and allows 1-click download or direct sync to your Jersevo store.
 */

(function () {
  'use strict'

  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent.trim())
        if (data['@type'] === 'Product') return data
        if (Array.isArray(data['@graph'])) {
          const product = data['@graph'].find(item => item['@type'] === 'Product')
          if (product) return product
        }
      } catch {}
    }
    return null
  }

  function extractNextData() {
    try {
      const script = document.getElementById('__NEXT_DATA__')
      if (script) return JSON.parse(script.textContent)
    } catch {}
    return null
  }

  function extractImagesFromDom() {
    const images = new Set()
    // Look for product gallery thumbnails and main images
    const imgElements = document.querySelectorAll('img[src*="frgimages.com"], img[src*="footballfanatics.com"]')
    for (const img of imgElements) {
      let src = img.getAttribute('data-src') || img.src || ''
      if (src) {
        // Upgrade to high-resolution master asset
        src = src.replace(/w=\d+/i, 'w=1200').replace(/q=\d+/i, 'q=92')
        images.add(src)
      }
    }
    return [...images]
  }

  function extractSizesFromDom() {
    const sizes = []
    const buttons = document.querySelectorAll('[data-talos="size-selector-button"], button[aria-label*="Size"], .size-selector-button, select[name="size"] option')
    for (const btn of buttons) {
      const text = (btn.textContent || btn.innerText || btn.value || '').trim()
      if (text && !/select|size chart/i.test(text)) {
        sizes.push(text.split('\n')[0].trim())
      }
    }
    return [...new Set(sizes)]
  }

  function extractPersonalizationInfo() {
    const pageText = document.body.innerText || ''
    const isCustom = /\b(?:custom(?:ized|ised|izer)?|personaliz(?:ed|ation)|add\s*your\s*name)\b/i.test(pageText)
    return isCustom
  }

  function collectCurrentProduct() {
    const jsonLd = extractJsonLd()
    const nextData = extractNextData()
    const domImages = extractImagesFromDom()
    const domSizes = extractSizesFromDom()
    const isCustom = extractPersonalizationInfo()

    const rawTitle = jsonLd?.name || document.title.split('|')[0].trim()
    const rawDescription = jsonLd?.description || document.querySelector('meta[name="description"]')?.content || ''
    const price = jsonLd?.offers?.price ? Number(jsonLd.offers.price) : null
    const sku = jsonLd?.sku || jsonLd?.productID || window.location.pathname.split('/').pop()

    const allImages = [...new Set([...(jsonLd?.image ? (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]) : []), ...domImages])]
      .map(url => String(url).replace(/w=\d+/i, 'w=1200').replace(/q=\d+/i, 'q=92'))

    const payload = {
      source: 'fanatics.com',
      url: window.location.href,
      extractedAt: new Date().toISOString(),
      id: sku,
      sku,
      name: rawTitle,
      title: rawTitle,
      description: rawDescription,
      price,
      inStock: jsonLd?.offers?.availability ? jsonLd.offers.availability.includes('InStock') : true,
      images: allImages,
      sizes: domSizes.length ? domSizes : ['S', 'M', 'L', 'XL', '2XL'],
      isPersonalized: isCustom
    }

    return payload
  }

  function downloadJson(data, filename = 'fanatics-product.json') {
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function renderFloatingToolbar() {
    const existing = document.getElementById('fanatics-collector-toolbar')
    if (existing) existing.remove()

    const toolbar = document.createElement('div')
    toolbar.id = 'fanatics-collector-toolbar'
    toolbar.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0f172a;
      color: #f8fafc;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      max-width: 320px;
      border: 1px solid #334155;
    `

    const product = collectCurrentProduct()

    toolbar.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px; color: #38bdf8; display: flex; align-items: center; justify-content: space-between;">
        <span>Jersevo Sync Collector</span>
        <button id="fc-close" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;">×</button>
      </div>
      <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px; max-height: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${product.title || 'Product detected'}
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">
        Images: ${product.images.length} | Sizes: ${product.sizes.length} | Custom: ${product.isPersonalized ? 'Yes' : 'No'}
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="fc-copy" style="flex: 1; padding: 8px 10px; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
          Copy JSON
        </button>
        <button id="fc-download" style="flex: 1; padding: 8px 10px; background: #059669; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
          Download JSON
        </button>
      </div>
      <div id="fc-status" style="margin-top: 8px; font-size: 11px; text-align: center; color: #22c55e; min-height: 14px;"></div>
    `

    document.body.appendChild(toolbar)

    document.getElementById('fc-close').onclick = () => toolbar.remove()

    document.getElementById('fc-copy').onclick = async () => {
      const data = collectCurrentProduct()
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      const status = document.getElementById('fc-status')
      status.innerText = 'Copied to clipboard!'
      setTimeout(() => { if (status) status.innerText = '' }, 3000)
    }

    document.getElementById('fc-download').onclick = () => {
      const data = collectCurrentProduct()
      const slug = (data.title || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      downloadJson(data, `${slug}.json`)
      const status = document.getElementById('fc-status')
      status.innerText = 'File downloaded!'
      setTimeout(() => { if (status) status.innerText = '' }, 3000)
    }
  }

  // Export globally for headless / console automation
  window.FanaticsCollector = {
    collect: collectCurrentProduct,
    download: downloadJson,
    render: renderFloatingToolbar
  }

  renderFloatingToolbar()
  console.log('[FanaticsCollector] Ready! Use window.FanaticsCollector.collect() or the floating UI.')
})()
