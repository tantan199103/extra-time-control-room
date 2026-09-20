import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Image as ImageIcon, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { fetchAdminCustomizations, updateAdminCustomization } from './lib/supabase'
import './admin-customizations.css'

const statuses = ['ALL', 'PREVIEW', 'CONFIRMED', 'RENDERING', 'READY', 'CANCELLED']
const nextActions = {
  PREVIEW: [['CONFIRMED', 'Approve'], ['CANCELLED', 'Reject']],
  CONFIRMED: [['RENDERING', 'Start production'], ['CANCELLED', 'Cancel']],
  RENDERING: [['READY', 'Mark ready'], ['CANCELLED', 'Cancel']]
}

function RequestRow({ row, selected, onSelect }) {
  return <button className={selected ? 'is-active' : ''} onClick={onSelect}>
    <span><strong>{row.payload?.listingHandle || row.product_id}</strong><small>{row.payload?.sku || row.variant_id}</small></span>
    <b>{row.status}</b><time>{new Date(row.created_at).toLocaleDateString()}</time>
  </button>
}

function AssetLink({ asset, label }) {
  return <a href={asset.url} target="_blank" rel="noreferrer"><img src={asset.url} alt={`${label} reference`} /><span>{label}<small>{asset.path}</small></span><ArrowRight size={14} /></a>
}

export default function AdminCustomizations() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  const load = async () => {
    setLoading(true); setNotice('')
    try {
      const result = await fetchAdminCustomizations(filter === 'ALL' ? '' : filter)
      const next = result.orders || []
      setRows(next); setSelectedId(current => next.some(row => row.id === current) ? current : next[0]?.id || '')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Requests could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter])
  const selected = useMemo(() => rows.find(row => row.id === selectedId) || rows[0], [rows, selectedId])
  useEffect(() => { setReviewNote(selected?.review_note || '') }, [selected?.id])
  const change = async status => {
    if (!selected) return
    setBusy(status); setNotice('')
    try {
      const result = await updateAdminCustomization(selected.id, status, reviewNote)
      setRows(current => current.map(row => row.id === selected.id ? { ...row, ...result.order } : row))
      setNotice(`Request moved to ${status.toLowerCase()}.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Status could not be updated.') }
    finally { setBusy('') }
  }
  const saveNote = async () => {
    if (!selected) return
    setBusy('note'); setNotice('')
    try {
      const result = await updateAdminCustomization(selected.id, '', reviewNote)
      setRows(current => current.map(row => row.id === selected.id ? { ...row, ...result.order } : row))
      setNotice('Internal review note saved.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Review note could not be saved.') }
    finally { setBusy('') }
  }

  const renderDetail = () => {
    if (!selected) return null
    const fields = Object.entries(selected.payload?.fields || {}).filter(([, value]) => value)
    const options = Object.entries(selected.payload?.options || {}).map(([key, value]) => `${key}: ${value}`).join(' / ') || '—'
    const references = selected.assets?.references || []
    return <section className="custom-ops__detail">
      <div className="custom-ops__head"><div><span>{selected.status}</span><h2>{selected.payload?.listingHandle || selected.product_id}</h2><small>{selected.id}</small></div><div>{(nextActions[selected.status] || []).map(([status, label]) => <button key={status} className={status === 'CANCELLED' ? 'is-danger' : ''} disabled={Boolean(busy)} onClick={() => change(status)}>{status === 'CANCELLED' ? <X size={14} /> : <Check size={14} />}{busy === status ? 'Saving…' : label}</button>)}</div></div>
      <div className="custom-ops__grid"><article><p>Customer details</p><dl>{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{/^https?:\/\//i.test(String(value)) ? 'Private asset attached' : value}</dd></div>)}</dl>{selected.payload?.note && <blockquote>{selected.payload.note}</blockquote>}</article><article><p>Request facts</p><dl><div><dt>SKU</dt><dd>{selected.payload?.sku || '—'}</dd></div><div><dt>Options</dt><dd>{options}</dd></div><div><dt>Logo permission</dt><dd>{selected.payload?.logoConsent?.accepted ? 'Confirmed' : 'Not supplied'}</dd></div><div><dt>Submitted</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div></dl></article></div>
      <div className="custom-ops__review"><label><span>Internal review note</span><textarea value={reviewNote} maxLength={2000} onChange={event => setReviewNote(event.target.value)} placeholder="Production instruction, approval context or handoff note…" /></label><button onClick={saveNote} disabled={Boolean(busy)}>{busy === 'note' ? 'Saving…' : 'Save note'}</button></div>
      <div className="custom-ops__assets"><p>Stable source assets</p><div>{references.map(asset => <AssetLink key={`${asset.key}-${asset.path}`} asset={asset} label={asset.key === 'teamLogo' ? 'Customer logo' : asset.key} />)}{selected.assets?.aiPreview && <AssetLink asset={selected.assets.aiPreview} label="Verified preview" />}{!references.length && !selected.assets?.aiPreview && <span>No stored image assets were attached.</span>}</div></div>
    </section>
  }

  return <main className="admin-page custom-ops">
    <header className="custom-ops__intro"><div><p>CUSTOM / PRODUCTION QUEUE</p><h1>FROM REQUEST<br />TO READY.</h1><span>Review stable source assets, approve the direction and move work through production without relying on expired customer links.</span></div><button onClick={load} disabled={loading}><RefreshCw className={loading ? 'is-spinning' : ''} size={15} /> Refresh</button></header>
    <nav className="custom-ops__filters" aria-label="Filter customization requests">{statuses.map(status => <button key={status} className={filter === status ? 'is-active' : ''} onClick={() => setFilter(status)}>{status}</button>)}</nav>
    {notice && <p className="custom-ops__notice" role={/could not|expired|invalid/i.test(notice) ? 'alert' : 'status'}>{notice}</p>}
    {loading ? <div className="custom-ops__empty"><LoaderCircle className="is-spinning" /><span>Loading secure requests…</span></div> : !rows.length ? <div className="custom-ops__empty"><ImageIcon /><strong>No requests in this state</strong><span>New personalized requests will appear here.</span></div> : <div className="custom-ops__workspace"><aside>{rows.map(row => <RequestRow key={row.id} row={row} selected={row.id === selected?.id} onSelect={() => setSelectedId(row.id)} />)}</aside>{renderDetail()}</div>}
  </main>
}
