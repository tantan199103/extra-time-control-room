(function () {
  const injected = 'data-pod-bridge-button'
  const messageSelector = '[data-message-author-role="assistant"]'
  const textOf = node => { const clone = node.cloneNode(true); clone.querySelectorAll('[data-pod-bridge-control]').forEach(item => item.remove()); return clone.innerText?.trim() || '' }
  const parseImage = async (image, index) => {
    const url = image.currentSrc || image.src
    if (!url) return null
    let dataUrl = ''
    try {
      const response = await fetch(url, { credentials: 'include' }); const blob = await response.blob()
      if (['image/jpeg','image/png','image/webp','image/avif'].includes(blob.type) && blob.size <= 15 * 1024 * 1024) dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob) })
    } catch {}
    if (!dataUrl) dataUrl = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'FETCH_PAGE_IMAGE', url }, result => resolve(result?.dataUrl || '')))
    const caption = image.closest('figure')?.querySelector('figcaption')?.innerText?.trim() || ''
    return { url, dataUrl, alt: image.alt || '', label: caption || image.alt || `Image ${index + 1}`, filename: url.split('/').pop()?.split('?')[0] || `chatgpt-${index + 1}.webp` }
  }
  const addButton = node => {
    if (node.hasAttribute(injected)) return
    node.setAttribute(injected, '1')
    const button = document.createElement('button')
    button.textContent = 'Add to POD'; button.type = 'button'; button.setAttribute('data-pod-bridge-control', '1'); button.style.cssText = 'margin:8px 0;padding:5px 9px;border:1px solid #777;border-radius:6px;background:#fff;color:#222;font-size:12px;cursor:pointer;z-index:2;position:relative'
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation(); button.disabled = true; button.textContent = 'Adding…'
      await new Promise(resolve => chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }, resolve))
      await new Promise(resolve => window.setTimeout(resolve, 200))
      const messageKey = node.getAttribute('data-message-id') || `message-${Date.now()}`
      await new Promise(resolve => chrome.runtime.sendMessage({ type: 'CAPTURE_MESSAGE', payload: { messageKey, text: textOf(node) } }, resolve))
      const images = [...node.querySelectorAll('img')]
      for (let index = 0; index < images.length; index += 1) {
        const image = await parseImage(images[index], index)
        await new Promise(resolve => chrome.runtime.sendMessage({ type: image?.dataUrl ? 'CAPTURE_ASSET' : 'CAPTURE_ASSET_FAILED', payload: { messageKey, image } }, resolve))
      }
      button.textContent = 'Added to POD'; window.setTimeout(() => { button.textContent = 'Add to POD'; button.disabled = false }, 900)
    })
    node.prepend(button)
  }
  const scan = () => document.querySelectorAll(messageSelector).forEach(addButton)
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); scan()
})()
