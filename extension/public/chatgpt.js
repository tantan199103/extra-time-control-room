(function () {
  const CONTROL = 'data-pod-bridge-control'
  const READY = 'data-pod-bridge-ready'
  const ASSISTANT = '[data-message-author-role="assistant"]'
  let scanScheduled = false
  let lastReported = -1

  const send = message => new Promise(resolve => {
    try { chrome.runtime.sendMessage(message, result => resolve(result || {})) } catch { resolve({}) }
  })

  const assistantEntries = () => [...document.querySelectorAll(ASSISTANT)].map(root => {
    const turn = root.closest('[data-testid^="conversation-turn-"]') || root.closest('article') || root
    return { root, turn }
  }).filter((entry, index, rows) => rows.findIndex(row => row.turn === entry.turn) === index)

  const messageKey = ({ root, turn }, index) => turn.getAttribute('data-testid') || turn.getAttribute('data-message-id') || root.getAttribute('data-message-id') || `assistant-${index}-${location.pathname}`

  const messageText = root => {
    const clone = root.cloneNode(true)
    clone.querySelectorAll(`[${CONTROL}], button[aria-label*="copy" i], button[aria-label*="feedback" i]`).forEach(item => item.remove())
    return clone.innerText?.replace(/\n{3,}/g, '\n\n').trim() || ''
  }

  const messageImages = root => [...root.querySelectorAll('img')].filter(image => {
    const source = image.currentSrc || image.src || ''
    if (!source || image.closest('[data-testid*="avatar" i]')) return false
    const width = Number(image.naturalWidth || image.width || 0)
    const height = Number(image.naturalHeight || image.height || 0)
    return /oaiusercontent|blob:|\/image/i.test(source) || width >= 96 || height >= 96
  }).filter((image, index, rows) => rows.findIndex(item => (item.currentSrc || item.src) === (image.currentSrc || image.src)) === index)

  const captureImage = async (image, index) => {
    const url = image.currentSrc || image.src
    if (!url) return null
    let dataUrl = ''
    try {
      const response = await fetch(url, { credentials: 'include' })
      const blob = await response.blob()
      if (['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(blob.type) && blob.size <= 15 * 1024 * 1024) dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob) })
    } catch {}
    if (!dataUrl) dataUrl = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'FETCH_PAGE_IMAGE', url }, result => resolve(result?.dataUrl || '')))
    const caption = image.closest('figure')?.querySelector('figcaption')?.innerText?.trim() || image.parentElement?.getAttribute('aria-label') || ''
    return { url, dataUrl, alt: image.alt || '', label: caption || image.alt || `Image ${index + 1}`, filename: url.split('/').pop()?.split('?')[0] || `chatgpt-${index + 1}.webp` }
  }

  const capture = async (entry, index, button) => {
    button.disabled = true
    button.textContent = 'Adding…'
    await send({ type: 'OPEN_SIDE_PANEL' })
    await new Promise(resolve => window.setTimeout(resolve, 250))
    const key = messageKey(entry, index)
    await send({ type: 'CAPTURE_MESSAGE', payload: { messageKey: key, text: messageText(entry.root) } })
    const images = messageImages(entry.root)
    for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      const image = await captureImage(images[imageIndex], imageIndex)
      await send({ type: image?.dataUrl ? 'CAPTURE_ASSET' : 'CAPTURE_ASSET_FAILED', payload: { messageKey: key, image } })
    }
    button.textContent = images.length ? `Added · ${images.length} image${images.length === 1 ? '' : 's'}` : 'Added to POD'
    window.setTimeout(() => { button.textContent = 'Add to POD'; button.disabled = false }, 1400)
  }

  const addButton = (entry, index) => {
    if (entry.turn.hasAttribute(READY)) return
    entry.turn.setAttribute(READY, '1')
    const host = document.createElement('div')
    host.setAttribute(CONTROL, '1')
    host.style.cssText = 'display:flex;justify-content:flex-end;margin:6px 0;position:relative;z-index:3'
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Add to POD'
    button.setAttribute(CONTROL, '1')
    button.setAttribute('aria-label', 'Add this assistant message to POD Bridge')
    button.style.cssText = 'all:initial;box-sizing:border-box;padding:6px 10px;border:1px solid #777;border-radius:7px;background:#fff;color:#202020;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)'
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); capture(entry, index, button).catch(() => { button.textContent = 'Capture failed'; button.disabled = false }) })
    host.append(button)
    const actionBar = entry.turn.querySelector('[data-testid*="message-actions"], [aria-label*="message actions" i]')
    if (actionBar?.parentElement) actionBar.parentElement.append(host)
    else entry.root.append(host)
  }

  const report = entries => {
    if (entries.length === lastReported) return
    lastReported = entries.length
    send({ type: 'ADAPTER_STATUS', payload: { state: entries.length ? 'ready' : 'no-messages', count: entries.length, url: location.href } })
  }

  const scan = (force = false) => {
    if (force) {
      document.querySelectorAll(`[${CONTROL}]`).forEach(node => node.remove())
      document.querySelectorAll(`[${READY}]`).forEach(node => node.removeAttribute(READY))
    }
    const entries = assistantEntries()
    entries.forEach(addButton)
    report(entries)
    return entries.length
  }

  const scheduleScan = () => {
    if (scanScheduled) return
    scanScheduled = true
    window.requestAnimationFrame(() => { scanScheduled = false; scan() })
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'POD_BRIDGE_RESCAN') return false
    const count = scan(true)
    respond({ ok: true, count })
    return false
  })
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true })
  scan()
})()
