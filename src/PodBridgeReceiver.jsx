import React, { useEffect, useRef, useState } from 'react'
import { applyBridgeContentPatch, bridgeMediaItem, createBridgeDraft, finalizeBridgeMetadata } from './lib/pod-bridge-sync'
import { POD_BRIDGE_ACTIONS, POD_BRIDGE_LIMITS, createBridgeEnvelope, dataUrlToBlob, isBridgeEnvelope, sha256Hex, validateBridgeAssets, validateProductPack } from './lib/pod-bridge-contract'
import { sanitizeImagePrivacyMetadata } from './lib/image-privacy'
import { saveAdminProduct, uploadBridgeMedia } from './lib/supabase'

const PAGE_CHANNEL = 'pod-bridge-response'

const hashNonce = () => {
  const match = window.location.hash.match(/(?:^#|&)pod-bridge=([^&]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const safePost = (nonce, action, payload, requestId = undefined) => {
  window.postMessage({ ...createBridgeEnvelope(action, payload, { nonce, requestId }), channel: PAGE_CHANNEL }, window.location.origin)
}

const asBlob = payload => {
  if (payload?.dataUrl) return dataUrlToBlob(payload.dataUrl)
  const bytes = Uint8Array.from(atob(payload?.base64 || ''), char => char.charCodeAt(0))
  return new Blob([bytes], { type: payload?.mimeType || 'application/octet-stream' })
}

export default function PodBridgeReceiver({ products = [], onSaved }) {
  const nonce = useRef(hashNonce())
  const productsRef = useRef(products)
  const imports = useRef(new Map())
  const [status, setStatus] = useState('Waiting for POD Bridge…')
  const [error, setError] = useState('')
  const [lastProductId, setLastProductId] = useState('')

  useEffect(() => { productsRef.current = products }, [products])

  useEffect(() => {
    if (!nonce.current) {
      setStatus('Standing by for POD Bridge. Open the POD Bridge Side Panel or Chrome Extension to transfer product packs.')
      return undefined
    }
    const fail = (event, envelope, message) => {
      setError(message)
      safePost(nonce.current, POD_BRIDGE_ACTIONS.ERROR, { code: 'BRIDGE_ERROR', message }, envelope?.requestId)
    }
    const save = async product => {
      const result = await saveAdminProduct(product)
      if (result.error) throw new Error(result.error)
      onSaved?.(result.data)
      productsRef.current = [...productsRef.current.filter(row => row.id !== result.data.id), result.data]
      return result.data
    }
    const commit = async (envelope, current) => {
      const descriptors = current.assets || []
      const validation = validateBridgeAssets(descriptors)
      if (!validation.ok) throw new Error(validation.errors.join(' '))
      let product = current.product
      if (product.status !== 'DRAFT') throw new Error('POD Bridge can only update draft listings.')
      const media = [...(product.media || [])]
      const seenSlots = new Set()
      const skippedAssets = []
      for (const asset of descriptors) {
        if (!asset.assetId || !asset.sha256 || seenSlots.has(asset.slotKey)) continue
        seenSlots.add(asset.slotKey)
        const part = current.chunks.get(asset.assetId)
        if (!part || part.size !== asset.chunkCount || [...part.keys()].some(index => !part.has(index))) throw new Error(`Asset ${asset.slotKey || asset.assetId} is incomplete. Retry the transfer.`)
        const base64 = [...part.keys()].sort((a, b) => a - b).map(index => part.get(index)).join('')
        const transferred = asBlob({ base64, mimeType: asset.mimeType })
        const blob = await sanitizeImagePrivacyMetadata(transferred)
        if (blob.size !== Number(asset.size)) throw new Error(`Asset ${asset.slotKey || asset.assetId} was not privacy-sanitized before transfer.`)
        const actualHash = await sha256Hex(blob)
        if (actualHash.toLowerCase() !== String(asset.sha256).toLowerCase()) throw new Error(`Asset ${asset.slotKey || asset.assetId} failed its SHA-256 check.`)
        const existingIndex = media.findIndex(row => row.bridge?.slotKey === asset.slotKey)
        const expectedHash = product.aiMetadata?.bridge?.assetHashes?.[asset.slotKey]
        const activeHash = existingIndex >= 0 ? media[existingIndex].bridge?.sourceHash : ''
        if (current.mode === 'patch' && expectedHash && activeHash !== expectedHash) { skippedAssets.push(asset.slotKey); continue }
        if (activeHash === actualHash) { if (asset.primary) product.image = media[existingIndex]?.url || product.image; continue }
        const uploaded = await uploadBridgeMedia(blob, product.id, actualHash, { alt: asset.alt || asset.label, filename: asset.filename })
        const item = bridgeMediaItem({ asset: { ...asset, sha256: actualHash }, publicUrl: uploaded.url, path: uploaded.path })
        if (existingIndex >= 0) media[existingIndex] = { ...media[existingIndex], ...item, id: media[existingIndex].id }
        else media.push(item)
        if (asset.primary || (!product.image && asset.kind === 'hero')) product.image = uploaded.url
      }
      product.media = media
      product.aiMetadata = await finalizeBridgeMetadata(product, current.pack, { operationId: envelope.requestId, assetHashes: Object.fromEntries(media.filter(item => item.bridge?.slotKey).map(item => [item.bridge.slotKey, item.bridge.sourceHash])), state: 'SYNCED' })
      product._persisted = true
      const saved = await save(product)
      imports.current.delete(envelope.sessionId)
      setLastProductId(saved.id)
      setStatus(`Synced ${saved.title || saved.name}`)
      safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'COMMIT_IMPORT', productId: saved.id, product: saved, skippedAssets, state: 'SYNCED' }, envelope.requestId)
      window.setTimeout(() => { window.history.pushState({}, '', `/admin/products/${saved.id}`); window.dispatchEvent(new PopStateEvent('popstate')) }, 250)
    }
    const onMessage = async event => {
      if (event.origin !== window.location.origin || event.source !== window) return
      const envelope = event.data
      if (!isBridgeEnvelope(envelope) || envelope.channel !== 'pod-bridge') return
      if (envelope.nonce !== nonce.current) return fail(event, envelope, 'Invalid bridge nonce.')
      try {
        if (envelope.action === POD_BRIDGE_ACTIONS.HELLO) {
          safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'HELLO', ready: true, admin: true }, envelope.requestId)
          return
        }
        if (envelope.action === POD_BRIDGE_ACTIONS.BEGIN_IMPORT) {
          const validation = validateProductPack(envelope.payload?.pack)
          if (!validation.ok) throw new Error(validation.errors.join(' '))
          const descriptors = Array.isArray(envelope.payload?.assets) ? envelope.payload.assets : []
          const assetValidation = validateBridgeAssets(descriptors)
          if (!assetValidation.ok) throw new Error(assetValidation.errors.join(' '))
          const existing = productsRef.current.find(row => row.aiMetadata?.bridge?.sessionId === envelope.sessionId)
          if (existing && existing.status !== 'DRAFT') throw new Error('The interrupted bridge listing is no longer a draft.')
          if (existing?.aiMetadata?.bridge?.state === 'SYNCED') {
            safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'BEGIN_IMPORT', productId: existing.id, product: existing, state: 'SYNCED', replay: true }, envelope.requestId)
            return
          }
          const { draft, pack } = existing ? { draft: existing, pack: validation.value } : await createBridgeDraft(validation.value, productsRef.current)
          draft.aiMetadata = { ...(draft.aiMetadata || {}), bridge: { ...(draft.aiMetadata?.bridge || {}), sessionId: envelope.sessionId, recentOperations: [...new Set([...(draft.aiMetadata?.bridge?.recentOperations || []), envelope.requestId])].slice(-20), state: 'RECEIVING' } }
          const saved = existing || await save(draft)
          imports.current.set(envelope.sessionId, { product: saved, pack, assets: descriptors, chunks: new Map(), mode: 'create' })
          setError(''); setStatus(`Receiving ${saved.title || saved.name}`)
          safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'BEGIN_IMPORT', productId: saved.id, state: 'RECEIVING' }, envelope.requestId)
          return
        }
        if (envelope.action === POD_BRIDGE_ACTIONS.ASSET_CHUNK) {
          const current = imports.current.get(envelope.sessionId)
          if (!current) throw new Error('No active bridge import for this session.')
          const payload = envelope.payload || {}
          if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= payload.chunkCount || payload.chunkCount > 32) throw new Error('Invalid asset chunk index.')
          if (String(payload.base64 || '').length > POD_BRIDGE_LIMITS.chunkBytes * 2) throw new Error('Asset chunk exceeds the bridge limit.')
          if (!current.chunks.has(payload.assetId)) current.chunks.set(payload.assetId, new Map())
          current.chunks.get(payload.assetId).set(payload.index, payload.base64)
          safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'ASSET_CHUNK', assetId: payload.assetId, index: payload.index }, envelope.requestId)
          return
        }
        if (envelope.action === POD_BRIDGE_ACTIONS.COMMIT_IMPORT) {
          const current = imports.current.get(envelope.sessionId)
          if (!current) {
            const replay = productsRef.current.find(row => row.aiMetadata?.bridge?.recentOperations?.includes(envelope.requestId))
            if (replay) { safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'COMMIT_IMPORT', productId: replay.id, product: replay, state: 'SYNCED', replay: true }, envelope.requestId); return }
            throw new Error('No active bridge import for this session.')
          }
          await commit(envelope, current)
          return
        }
        if (envelope.action === POD_BRIDGE_ACTIONS.PATCH_DRAFT) {
          const payload = envelope.payload || {}
          const validation = validateProductPack(payload.pack)
          if (!validation.ok) throw new Error(validation.errors.join(' '))
          const patchAssets = Array.isArray(payload.assets) ? payload.assets : []
          const assetValidation = validateBridgeAssets(patchAssets)
          if (!assetValidation.ok) throw new Error(assetValidation.errors.join(' '))
          const existing = productsRef.current.find(row => row.id === payload.productId)
          if (!existing) throw new Error('The target listing is no longer available.')
          if (existing.status !== 'DRAFT') throw new Error('POD Bridge can only update draft listings.')
          if (existing.aiMetadata?.bridge?.recentOperations?.includes(envelope.requestId)) { safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'PATCH_DRAFT', productId: existing.id, product: existing, skipped: [], state: 'SYNCED', replay: true }, envelope.requestId); return }
          const { next, skipped, pack } = await applyBridgeContentPatch(existing, validation.value, { webAppWins: true })
          const selected = Array.isArray(payload.fields) && payload.fields.length ? new Set(payload.fields) : null
          const candidate = selected ? { ...existing, ...Object.fromEntries([...selected].filter(key => key in next).map(key => [key, next[key]])) } : next
          candidate.name = candidate.title
          candidate.story = candidate.subtitle
          candidate.personalization = (candidate.customFields || []).map(field => field.label)
          candidate.status = 'DRAFT'
          candidate.aiMetadata = await finalizeBridgeMetadata(candidate, pack, { operationId: patchAssets.length ? null : envelope.requestId, assetHashes: existing.aiMetadata?.bridge?.assetHashes || {}, state: patchAssets.length ? 'RECEIVING' : 'SYNCED' })
          candidate._persisted = true
          const saved = await save(candidate)
          setLastProductId(saved.id); setStatus(`Patched ${saved.title || saved.name}`)
          if (patchAssets.length) imports.current.set(envelope.sessionId, { product: saved, pack, assets: patchAssets, chunks: new Map(), mode: 'patch' })
          safePost(nonce.current, POD_BRIDGE_ACTIONS.ACK, { stage: 'PATCH_DRAFT', productId: saved.id, skipped: selected ? skipped.filter(key => selected.has(key)) : skipped, state: patchAssets.length ? 'RECEIVING' : 'SYNCED', product: saved }, envelope.requestId)
          return
        }
        throw new Error(`Unsupported bridge action: ${envelope.action}`)
      } catch (caught) {
        fail(event, envelope, caught instanceof Error ? caught.message : 'Bridge operation failed.')
      }
    }
    window.addEventListener('message', onMessage)
    safePost(nonce.current, POD_BRIDGE_ACTIONS.HELLO, { stage: 'RECEIVER_READY' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return <main className="admin-page pod-bridge-receiver"><div className="admin-page-intro"><div><p>POD BRIDGE / RECEIVER</p><h1>READY TO RECEIVE.</h1><span>Keep this admin tab open while the Side Panel sends a Product Pack. Listings always land as drafts.</span></div><span className="admin-status admin-status--draft"><i/>{error ? 'ERROR' : nonce.current ? 'LISTENING' : 'STANDBY'}</span></div><section className="admin-panel pod-bridge-receiver__panel"><strong>{error || status}</strong>{lastProductId && <a className="admin-text-button" href={`/admin/products/${lastProductId}`}>Open listing workspace →</a>}<small>Nonce handshake: {nonce.current ? 'active' : 'waiting for extension'} · publish is disabled by design.</small></section></main>
}
