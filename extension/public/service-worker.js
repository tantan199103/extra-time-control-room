const PORT_NAME = 'pod-bridge-sidepanel'
const ALLOWED_WEBAPP = [/^https:\/\/extra-time-control-room\.vercel\.app\/admin(?:\/|$)/, /^http:\/\/localhost:5173\/admin(?:\/|$)/]
const isWebAppUrl = url => ALLOWED_WEBAPP.some(pattern => pattern.test(url || ''))
const ports = new Set()
const pendingCaptures = []

chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}))
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== PORT_NAME) return
  ports.add(port)
  while (pendingCaptures.length) { try { port.postMessage(pendingCaptures.shift()) } catch { break } }
  port.onDisconnect.addListener(() => ports.delete(port))
})
chrome.action.onClicked.addListener(tab => { if (tab?.id != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}) })

const broadcast = message => {
  if (!ports.size && message.type?.startsWith('CAPTURE_')) { pendingCaptures.push(message); if (pendingCaptures.length > 24) pendingCaptures.shift(); return }
  ports.forEach(port => { try { port.postMessage(message) } catch {} })
}
const allowedSender = sender => Boolean(sender?.tab?.url && (sender.tab.url.startsWith('https://chatgpt.com/') || isWebAppUrl(sender.tab.url)))

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['CAPTURE_MESSAGE', 'CAPTURE_ASSET', 'CAPTURE_ASSET_FAILED'].includes(message?.type) && sender.tab?.url?.startsWith('https://chatgpt.com/')) { broadcast(message); sendResponse({ ok: true }); return false }
  if (message?.type === 'OPEN_SIDE_PANEL' && sender.tab?.url?.startsWith('https://chatgpt.com/')) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ error: error.message }))
    return true
  }
  if (message?.type === 'PAGE_TO_BRIDGE' && isWebAppUrl(sender.tab?.url)) { broadcast({ type: 'BRIDGE_RESPONSE', payload: message.payload }); sendResponse({ ok: true }); return false }
  if (message?.type === 'FETCH_PAGE_IMAGE' && sender.tab?.url?.startsWith('https://chatgpt.com/')) {
    let parsed
    try { parsed = new URL(message.url) } catch { sendResponse({ error: 'Invalid image URL.' }); return false }
    if (!['https:', 'blob:', 'data:'].includes(parsed.protocol) || parsed.protocol === 'https:' && !/(^|\.)(chatgpt\.com|openai\.com|oaiusercontent\.com)$/.test(parsed.hostname)) { sendResponse({ error: 'Image origin is not allowed.' }); return false }
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, world: 'MAIN', args: [message.url], func: async url => {
      try { const response = await fetch(url, { credentials: 'include' }); const blob = await response.blob(); if (!['image/jpeg','image/png','image/webp','image/avif'].includes(blob.type) || blob.size > 15 * 1024 * 1024) return ''; return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob) }) } catch { return '' }
    } }).then(results => sendResponse({ dataUrl: results?.[0]?.result || '' })).catch(error => sendResponse({ error: error.message }))
    return true
  }
  if (message?.type === 'GET_WEBAPP_TABS') {
    chrome.tabs.query({}, tabs => sendResponse({ tabs: tabs.filter(tab => isWebAppUrl(tab.url)).map(tab => ({ id: tab.id, title: tab.title, url: tab.url })) }))
    return true
  }
  if (message?.type === 'OPEN_WEBAPP') {
    const nonce = String(message.nonce || crypto.randomUUID())
    chrome.tabs.query({}, tabs => {
      const existing = tabs.find(tab => isWebAppUrl(tab.url))
      if (existing?.id != null) { const origin = new URL(existing.url).origin; chrome.tabs.update(existing.id, { active: true, url: `${origin}/admin/bridge#pod-bridge=${encodeURIComponent(nonce)}` }, () => sendResponse({ tabId: existing.id, nonce })); return }
      const origin = message.origin || 'https://extra-time-control-room.vercel.app'
      chrome.tabs.create({ url: `${origin}/admin/bridge#pod-bridge=${encodeURIComponent(nonce)}`, active: true }, tab => sendResponse({ tabId: tab.id, nonce }))
    })
    return true
  }
  if (message?.type === 'SEND_ENVELOPE') {
    chrome.tabs.get(message.tabId, tab => {
      if (chrome.runtime.lastError || !isWebAppUrl(tab?.url) || message.envelope?.channel !== 'pod-bridge') { sendResponse({ error: 'The selected tab is not an allowed POD WebApp admin tab.' }); return }
      chrome.tabs.sendMessage(message.tabId, { type: 'BRIDGE_ENVELOPE', payload: message.envelope }, response => {
        if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message })
        else sendResponse(response || { ok: true })
      })
    })
    return true
  }
  if (!allowedSender(sender) && sender?.id) { sendResponse({ error: 'Untrusted extension sender.' }); return false }
  return false
})
