import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './sidepanel.css'
import { createBridgeEnvelope, parseProductPackText, POD_BRIDGE_ACTIONS, POD_BRIDGE_LIMITS, sha256Hex, slugifyBridge } from '../src/lib/pod-bridge-contract'
import { sanitizeImagePrivacyMetadata } from '../src/lib/image-privacy'

const DB_NAME = 'pod-bridge-v1'
const STORE = 'assets'
const SESSION_KEY = 'pod-bridge-session-v1'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ALL_FIELDS = ['title', 'subtitle', 'description', 'seo', 'tags', 'taxonomy', 'customFields', 'contentBlocks']
const uuid = () => globalThis.crypto.randomUUID()

function chooseSlot(slots, assets, hint = '') {
  const available = slots.filter(slot => !assets.some(asset => asset.slotKey === slot.key))
  const words = String(hint).toLowerCase()
  const score = slot => [slot.key, slot.label, slot.kind].reduce((total, value) => total + (words.includes(String(value || '').toLowerCase()) ? 1 : 0), 0)
  return available.sort((a, b) => score(b) - score(a) || a.order - b.order)[0] || { key: `asset-${assets.length + 1}`, label: `Asset ${assets.length + 1}`, kind: 'other' }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function putBlob(id, blob) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }) }
async function getBlob(id) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
async function loadSession() { const value = await chrome.storage.local.get(SESSION_KEY); return value[SESSION_KEY] || null }

const emptySession = () => ({
  sessionId: uuid(), status: 'COLLECTING', locked: false, productId: '', updatedAt: null,
  assetHashes: {}, primarySlot: '', selectedFields: [...ALL_FIELDS],
  pack: { schemaVersion: '1.0', externalKey: '', locale: 'en', content: { title: '', subtitle: '', description: '', seo: { title: '', description: '', keywords: [] }, tags: [], taxonomy: {}, customFields: [], contentBlocks: [] }, assetSlots: [] },
  assets: [], messages: []
})

function AssetRow({ asset, slots, onChange, onRemove }) {
  const [preview, setPreview] = useState('')
  useEffect(() => { let url = ''; getBlob(asset.assetId).then(blob => { if (blob) { url = URL.createObjectURL(blob); setPreview(url) } }); return () => { if (url) URL.revokeObjectURL(url) } }, [asset.assetId])
  return <article><img src={preview} alt={asset.alt || ''}/><div><strong>{asset.label}</strong><small>{Math.round(asset.size / 1024)} KB · {asset.sha256.slice(0, 8)}</small><select value={asset.slotKey} onChange={event => { const slot = slots.find(item => item.key === event.target.value); onChange({ ...asset, slotKey: event.target.value, label: slot?.label || asset.label, kind: slot?.kind || 'other' }) }}>{slots.map(slot => <option key={slot.key} value={slot.key}>{slot.label}</option>)}{!slots.some(slot => slot.key === asset.slotKey) && <option value={asset.slotKey}>{asset.slotKey}</option>}</select><label className="primary"><input type="radio" name="primary-asset" checked={asset.primary} onChange={() => onChange({ ...asset, primary: true })}/> Primary</label></div><button onClick={onRemove} aria-label={`Remove ${asset.label}`}>×</button></article>
}

function App() {
  const [session, setSession] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [webappTab, setWebappTab] = useState(null)
  const [adapterStatus, setAdapterStatus] = useState({ state: 'not-detected', count: 0 })
  const [newSlot, setNewSlot] = useState('')
  const pending = useRef(new Map())
  const captureQueue = useRef(Promise.resolve())

  useEffect(() => {
    loadSession().then(value => setSession(value ? { ...emptySession(), ...value, selectedFields: value.selectedFields || [...ALL_FIELDS], assetHashes: value.assetHashes || {} } : emptySession()))
    const onRuntime = message => {
      if (message?.type === 'CAPTURE_MESSAGE') {
        setSession(current => {
          const next = current || emptySession()
          if (next.locked) return next
          const messageKey = message.payload?.messageKey || uuid()
          if (next.messages.some(item => item.key === messageKey)) return next
          const parsed = parseProductPackText(message.payload?.text || '')
          const pack = parsed.ok ? { ...parsed.value, source: { ...parsed.value.source, provider: 'chatgpt-web', messageKey } } : { ...next.pack, content: { ...next.pack.content, description: (next.pack.content.description ? `${next.pack.content.description}\n\n` : '') + String(message.payload?.text || '').slice(0, 5000) }, source: { provider: 'chatgpt-web', messageKey } }
          const slots = pack.assetSlots?.length ? pack.assetSlots : next.pack.assetSlots
          const merged = { ...next, pack: { ...next.pack, ...pack, content: { ...next.pack.content, ...pack.content }, assetSlots: slots }, messages: [...next.messages, { key: messageKey, parseError: parsed.ok ? '' : parsed.errors?.join(' '), text: message.payload?.text || '' }], status: 'READY', assets: [...next.assets] }
          setNotice(parsed.ok ? 'Product Pack captured.' : `${parsed.errors?.join(' ')} Plain text was kept as a draft.`)
          return merged
        })
      }
      if (message?.type === 'ADAPTER_STATUS') setAdapterStatus(message.payload || { state: 'unknown', count: 0 })
      if (message?.type === 'CAPTURE_ASSET') {
        captureQueue.current = captureQueue.current.then(async () => {
          const image = message.payload?.image || {}
          let blob
          try { blob = await (await fetch(image.dataUrl)).blob(); blob = await sanitizeImagePrivacyMetadata(blob) } catch (caught) { setNotice(caught instanceof Error ? caught.message : 'An image could not be captured. Add it manually.'); return }
          if (!IMAGE_TYPES.includes(blob.type) || blob.size > POD_BRIDGE_LIMITS.maxImageBytes) { setNotice('An image was rejected by the MIME or 15 MB limit.'); return }
          const hash = await sha256Hex(blob); const assetId = uuid(); await putBlob(assetId, blob)
          setSession(current => {
            if (!current || current.locked || current.assets.length >= POD_BRIDGE_LIMITS.maxImages || current.assets.some(asset => asset.sha256 === hash) || current.assets.reduce((sum, asset) => sum + asset.size, 0) + blob.size > POD_BRIDGE_LIMITS.maxSessionBytes) return current
            const currentSlots = current.pack.assetSlots || []
            const slot = chooseSlot(currentSlots, current.assets, `${image.alt || ''} ${image.label || ''}`)
            return { ...current, status: 'READY', assets: [...current.assets, { assetId, slotKey: slot.key, kind: slot.kind, label: slot.label, filename: image.filename || `bridge-${assetId}.webp`, mimeType: blob.type, size: blob.size, sha256: hash, primary: !current.assets.length, alt: image.alt || '', sourceMessageKey: message.payload?.messageKey || '' }] }
          })
        })
      }
      if (message?.type === 'CAPTURE_ASSET_FAILED') setNotice('An image could not be captured. Use Add images to choose the downloaded file.')
      if (message?.type === 'BRIDGE_RESPONSE') {
        const item = pending.current.get(message.payload?.requestId)
        if (!item) return
        pending.current.delete(message.payload.requestId); clearTimeout(item.timer)
        if (message.payload.action === POD_BRIDGE_ACTIONS.ERROR) item.reject(new Error(message.payload.payload?.message || 'Bridge operation failed.'))
        else item.resolve(message.payload.payload || message.payload)
      }
    }
    let disposed = false
    let port
    const connect = () => {
      if (disposed) return
      port = chrome.runtime.connect({ name: 'pod-bridge-sidepanel' })
      port.onMessage.addListener(onRuntime)
      port.onDisconnect.addListener(() => { if (!disposed) window.setTimeout(connect, 250) })
    }
    connect()
    return () => { disposed = true; port?.onMessage.removeListener(onRuntime); port?.disconnect() }
  }, [])

  useEffect(() => { if (session) chrome.storage.local.set({ [SESSION_KEY]: session }) }, [session])
  const slots = useMemo(() => session?.pack?.assetSlots || [], [session])
  if (!session) return <div className="panel-loading">Loading POD Bridge…</div>
  const updateContent = (key, value) => setSession(current => ({ ...current, pack: { ...current.pack, content: { ...current.pack.content, [key]: value } }, status: 'READY' }))
  const updatePack = (key, value) => setSession(current => ({ ...current, pack: { ...current.pack, [key]: value }, status: 'READY' }))
  const addManualFiles = async event => {
    const files = [...event.target.files].slice(0, POD_BRIDGE_LIMITS.maxImages - session.assets.length)
    const next = { ...session, assets: [...session.assets], status: 'READY' }
    const startingCount = next.assets.length
    const rejected = []
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type) || file.size > POD_BRIDGE_LIMITS.maxImageBytes) { rejected.push(`${file.name}: unsupported type or larger than 15 MB.`); continue }
      let cleanFile
      try { cleanFile = await sanitizeImagePrivacyMetadata(file) } catch (caught) { rejected.push(`${file.name}: ${caught instanceof Error ? caught.message : 'metadata cleaning failed.'}`); continue }
      if (cleanFile.size > POD_BRIDGE_LIMITS.maxImageBytes || next.assets.reduce((sum, asset) => sum + asset.size, 0) + cleanFile.size > POD_BRIDGE_LIMITS.maxSessionBytes) { rejected.push(`${file.name}: session size limit exceeded.`); continue }
      const hash = await sha256Hex(cleanFile); if (next.assets.some(asset => asset.sha256 === hash)) continue
      const assetId = uuid()
      const slot = chooseSlot(slots, next.assets, file.name)
      await putBlob(assetId, cleanFile)
      next.assets.push({ assetId, slotKey: slot.key, kind: slot.kind, label: slot.label, filename: file.name, mimeType: cleanFile.type, size: cleanFile.size, sha256: hash, primary: !next.assets.length, alt: '' })
    }
    setSession(next)
    const added = next.assets.length - startingCount
    setNotice(rejected.length ? `${added} image(s) added. ${rejected.join(' ')}` : `${added} image(s) added; privacy metadata removed where safe.`)
    event.target.value = ''
  }
  const callWorker = message => new Promise((resolve, reject) => { chrome.runtime.sendMessage(message, result => { if (chrome.runtime.lastError || result?.error) reject(new Error(chrome.runtime.lastError?.message || result.error)); else resolve(result) }) })
  const rescanChatGpt = async () => {
    try { const result = await callWorker({ type: 'RESCAN_CHATGPT' }); setAdapterStatus({ state: result.count ? 'ready' : 'no-messages', count: result.count || 0 }); setNotice(`ChatGPT scan complete: ${result.count || 0} assistant message(s).`) }
    catch (caught) { setAdapterStatus({ state: 'not-detected', count: 0 }); setNotice(caught instanceof Error ? caught.message : 'ChatGPT adapter is not available.') }
  }
  const send = async () => {
    if (!session.pack.content.title || !session.pack.externalKey) { setNotice('Add a title and external key first.'); return }
    if (!session.assets.length) { setNotice('Add at least one image, or capture a message with an image.'); return }
    if (!session.assets.some(asset => asset.primary)) { setNotice('Choose one primary image first.'); return }
    if (new Set(session.assets.map(asset => asset.slotKey)).size !== session.assets.length) { setNotice('Each active image needs a unique asset slot.'); return }
    setBusy(true); setNotice('Opening the admin bridge…')
    try {
      const opened = await callWorker({ type: 'OPEN_WEBAPP', nonce: uuid() }); setWebappTab(opened)
      const base = { sessionId: session.sessionId, nonce: opened.nonce }
      const sendEnvelope = (envelope, timeout = 15000) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.current.delete(envelope.requestId); reject(new Error('The WebApp did not acknowledge the bridge request.')) }, timeout)
        pending.current.set(envelope.requestId, { resolve, reject, timer })
        chrome.runtime.sendMessage({ type: 'SEND_ENVELOPE', tabId: opened.tabId, envelope }, result => {
          if (chrome.runtime.lastError || result?.error) { clearTimeout(timer); pending.current.delete(envelope.requestId); reject(new Error(chrome.runtime.lastError?.message || result.error)) }
        })
      })
      let ready = false
      for (let attempt = 0; attempt < 12 && !ready; attempt += 1) {
        try { const hello = await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.HELLO, {}, { ...base, requestId: `hello-${session.sessionId}-${attempt}` }), 1200); ready = hello.ready === true } catch { await new Promise(resolve => setTimeout(resolve, 500)) }
      }
      if (!ready) throw new Error('The admin bridge did not become ready. Confirm that you are signed in as an admin.')
      const sendAssets = async assets => {
        for (const asset of assets) {
          const blob = await getBlob(asset.assetId); if (!blob) throw new Error(`Local asset ${asset.label} is missing.`)
          const data = new Uint8Array(await blob.arrayBuffer()); const chunkCount = Math.ceil(data.byteLength / POD_BRIDGE_LIMITS.chunkBytes)
          for (let index = 0; index < chunkCount; index += 1) {
            let binary = ''; for (const byte of data.slice(index * POD_BRIDGE_LIMITS.chunkBytes, (index + 1) * POD_BRIDGE_LIMITS.chunkBytes)) binary += String.fromCharCode(byte)
            await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.ASSET_CHUNK, { assetId: asset.assetId, index, chunkCount, mimeType: asset.mimeType, base64: btoa(binary) }, { ...base, requestId: `chunk-${asset.assetId}-${index}` }))
          }
        }
      }
      if (session.productId) {
        const selectedPrimary = session.assets.find(asset => asset.primary)?.slotKey || ''
        const changedAssets = session.assets.filter(asset => session.assetHashes?.[asset.slotKey] !== asset.sha256 || asset.primary && session.primarySlot !== selectedPrimary)
        const changedDescriptors = changedAssets.map(asset => ({ ...asset, chunkCount: Math.ceil(asset.size / POD_BRIDGE_LIMITS.chunkBytes) }))
        const revision = session.updatedAt || 'initial'
        const patch = await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.PATCH_DRAFT, { productId: session.productId, pack: session.pack, fields: session.selectedFields, assets: changedDescriptors }, { ...base, requestId: `patch-${session.sessionId}-${revision}` }))
        let result = patch
        if (changedAssets.length) { await sendAssets(changedAssets); result = await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.COMMIT_IMPORT, {}, { ...base, requestId: `commit-${session.sessionId}-${revision}` })) }
        const kept = [...(patch.skipped || []), ...(result.skippedAssets || [])]
        setSession(current => ({ ...current, status: 'SYNCED', updatedAt: new Date().toISOString(), assetHashes: result.product?.aiMetadata?.bridge?.assetHashes || current.assetHashes, primarySlot: selectedPrimary }))
        setNotice(kept.length ? `Synced; WebApp kept ${kept.join(', ')}.` : 'Draft updated.')
      } else {
        const descriptors = session.assets.map(asset => ({ ...asset, chunkCount: Math.ceil(asset.size / POD_BRIDGE_LIMITS.chunkBytes) }))
        const begin = await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.BEGIN_IMPORT, { pack: session.pack, assets: descriptors }, { ...base, requestId: `begin-${session.sessionId}` }))
        if (begin.state === 'SYNCED' && begin.product) { setSession(current => ({ ...current, productId: begin.productId, assetHashes: begin.product.aiMetadata?.bridge?.assetHashes || {}, status: 'SYNCED', updatedAt: new Date().toISOString() })); setNotice('Existing draft recovered.'); return }
        await sendAssets(session.assets)
        const result = await sendEnvelope(createBridgeEnvelope(POD_BRIDGE_ACTIONS.COMMIT_IMPORT, {}, { ...base, requestId: `commit-${session.sessionId}` }))
        setSession(current => ({ ...current, productId: result.productId || current.productId, assetHashes: result.product?.aiMetadata?.bridge?.assetHashes || {}, primarySlot: current.assets.find(asset => asset.primary)?.slotKey || '', status: 'SYNCED', updatedAt: new Date().toISOString() })); setNotice('Draft created and opened in the WebApp.')
      }
    } catch (caught) { setSession(current => ({ ...current, status: 'ERROR' })); setNotice(caught instanceof Error ? caught.message : 'Bridge transfer failed.') }
    finally { setBusy(false) }
  }
  const addSlot = () => {
    const key = slugifyBridge(newSlot).slice(0, 48); if (!key || slots.some(slot => slot.key === key)) return
    setSession(current => ({ ...current, pack: { ...current.pack, assetSlots: [...current.pack.assetSlots, { key, label: newSlot.trim(), kind: 'other', required: false, order: current.pack.assetSlots.length + 1 }] } })); setNewSlot('')
  }
  const changeAsset = changed => setSession(current => ({ ...current, status: 'READY', assets: current.assets.map(item => item.assetId === changed.assetId ? changed : changed.primary ? { ...item, primary: false } : item) }))
  return <main className="pod-panel">
    <header><div><p>POD BRIDGE / V1</p><h1>TURN CHAT<br/><em>INTO LISTINGS.</em></h1></div><span className={`status status--${session.status.toLowerCase()}`}>{session.status}</span></header>
    <div className="panel-actions"><button onClick={() => setSession(emptySession())} disabled={busy}>Start Product</button><button onClick={() => setSession(current => ({ ...current, locked: !current.locked, status: current.locked ? 'READY' : 'LOCKED' }))} disabled={busy}>{session.locked ? 'Unlock' : 'Lock Product'}</button></div>
    <div className={`adapter-status adapter-status--${adapterStatus.state}`}><span>{adapterStatus.state === 'ready' ? `ChatGPT adapter ready · ${adapterStatus.count} assistant message(s)` : adapterStatus.state === 'no-messages' ? 'ChatGPT adapter is running; no assistant messages are visible yet.' : 'Open or refresh chatgpt.com. If no Add to POD buttons appear, reload the extension and refresh ChatGPT.'}</span><button onClick={rescanChatGpt}>Rescan</button></div>
    <label>External key<input value={session.pack.externalKey} onChange={event => updatePack('externalKey', event.target.value)} placeholder="MIL-006" disabled={session.locked}/></label>
    <label>Title<input value={session.pack.content.title} onChange={event => updateContent('title', event.target.value)} placeholder="Product title" disabled={session.locked}/></label>
    <label>Description<textarea value={session.pack.content.description} onChange={event => updateContent('description', event.target.value)} placeholder="Story and product description" disabled={session.locked}/></label>
    <label>SEO description<textarea value={session.pack.content.seo?.description || ''} onChange={event => updateContent('seo', { ...session.pack.content.seo, description: event.target.value })} placeholder="Optional SEO description" disabled={session.locked}/></label>
    {session.productId && <fieldset><legend>Fields to sync</legend>{ALL_FIELDS.map(field => <label className="check" key={field}><input type="checkbox" checked={session.selectedFields.includes(field)} onChange={() => setSession(current => ({ ...current, selectedFields: current.selectedFields.includes(field) ? current.selectedFields.filter(item => item !== field) : [...current.selectedFields, field] }))}/>{field}</label>)}</fieldset>}
    <section className="assets"><div className="section-head"><strong>Assets · {session.assets.length}/{POD_BRIDGE_LIMITS.maxImages}</strong><label className="file-button">Add images<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={addManualFiles} disabled={session.locked}/></label></div><div className="add-slot"><input value={newSlot} onChange={event => setNewSlot(event.target.value)} placeholder="New flexible slot"/><button onClick={addSlot} disabled={!newSlot.trim()}>Add slot</button></div>{session.assets.map(asset => <AssetRow key={asset.assetId} asset={asset} slots={slots} onChange={changeAsset} onRemove={() => setSession(current => { const assets = current.assets.filter(item => item.assetId !== asset.assetId); if (asset.primary && assets.length) assets[0] = { ...assets[0], primary: true }; return { ...current, assets, status: 'READY' } })}/>)}{!session.assets.length && <p className="empty">Capture an assistant message or choose images manually.</p>}</section>
    {session.messages.some(message => message.parseError) && <p className="parse-error">Some messages had invalid or missing pod-product JSON. Their plain text is preserved for manual editing.</p>}
    <p className="privacy-note">Privacy EXIF/XMP/IPTC and hidden text controls are removed. Content Credentials/C2PA are preserved.</p>
    {notice && <p className="notice" role="status">{notice}</p>}<button className="send" onClick={send} disabled={busy || session.locked}>{busy ? 'Syncing…' : session.productId ? 'Sync selected changes' : 'Send to WebApp'}</button><small className="foot">Admin tab: {webappTab ? 'connected' : 'will open on send'} · price 0 · draft only</small>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
