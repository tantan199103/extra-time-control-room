(function () {
  const allowed = location.origin === 'http://localhost:5173' || location.origin === 'https://extra-time-control-room.vercel.app'
  if (!allowed) return
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'BRIDGE_ENVELOPE') window.postMessage(message.payload, location.origin)
  })
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'pod-bridge-response') return
    chrome.runtime.sendMessage({ type: 'PAGE_TO_BRIDGE', payload: event.data })
  })
})()
