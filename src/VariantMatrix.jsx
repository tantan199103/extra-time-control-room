import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { generateVariantMatrix, prepareDraftVariantActivation } from './lib/catalog-model'
import './variant-matrix.css'

const cents = value => Math.round(Number(value) * 100) / 100

export default function VariantMatrix({ product, onChange, onOptionsChange, onProductChange }) {
  const [optionName, setOptionName] = useState('')
  const [optionValues, setOptionValues] = useState('')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState([])
  const [bulkScope, setBulkScope] = useState('SELECTED')
  const [bulkAction, setBulkAction] = useState('SET_PRICE')
  const [bulkValue, setBulkValue] = useState('')
  const options = product.options || []
  const variants = product.variants || []
  const visible = useMemo(() => variants.filter(row => showArchived || row.status !== 'ARCHIVED').filter(row => `${row.sku} ${Object.values(row.values || {}).join(' ')} ${row.barcode || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [variants, showArchived, query])
  const active = variants.filter(row => row.status === 'ACTIVE')
  const stock = active.reduce((sum, row) => sum + Number(row.inventory || 0), 0)
  const prices = active.map(row => Number(row.price || 0))
  const pricedDraftCount = variants.filter(row => row.status === 'DRAFT' && Number(row.price) > 0 && String(row.sku || '').trim()).length

  const saveOption = () => {
    const name = optionName.trim()
    const values = optionValues.split(',').map(value => value.trim()).filter(Boolean)
    if (!name || !values.length || new Set(values.map(value => value.toLowerCase())).size !== values.length) { setNotice('Enter a name and unique comma-separated values.'); return }
    if (options.some((option,index) => index !== editing && option.name.toLowerCase() === name.toLowerCase())) { setNotice('This option name already exists.'); return }
    if (editing === null && options.length >= 3) { setNotice('A listing supports up to 3 options.'); return }
    onOptionsChange(editing === null ? [...options,{name,values}] : options.map((option,index) => index === editing ? {...option,name,values} : option))
    setOptionName(''); setOptionValues(''); setEditing(null)
    setNotice('Options updated. Generate variants to reconcile the combinations before saving.')
  }
  const removeOption = index => {
    onOptionsChange(options.filter((_, current) => current !== index))
    setEditing(null); setOptionName(''); setOptionValues('')
    setNotice('Option removed from this draft. Generate variants to archive affected combinations.')
  }
  const generate = () => {
    try {
      const existingIds = new Set(variants.map(row => row.id))
      const next = generateVariantMatrix(product).map(row => row.status === 'DRAFT' && !existingIds.has(row.id) ? { ...row, inventory:1000 } : row)
      onChange(next)
      setSelected([])
      setNotice(`${next.filter(row => row.status !== 'ARCHIVED').length} combinations ready. New Draft rows start with 1,000 units; activate priced rows when ready.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Variants could not be generated.') }
  }
  const update = (id, key, value) => onChange(variants.map(row => row.id === id ? {...row,[key]:value} : row))
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current,id])
  const toggleVisible = () => {
    const ids = visible.map(row => row.id)
    setSelected(ids.every(id => selected.includes(id)) ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected,...ids])])
  }
  const applyBulk = () => {
    const targetIds = bulkScope === 'SELECTED' ? new Set(selected) : bulkScope === 'FILTERED' ? new Set(visible.map(row => row.id)) : new Set(active.map(row => row.id))
    if (!targetIds.size) { setNotice(bulkScope === 'SELECTED' ? 'Select at least one variation first.' : 'No variations match this scope.'); return }
    const number = Number(bulkValue)
    if (bulkAction !== 'SET_STATUS' && (bulkValue === '' || !Number.isFinite(number))) { setNotice('Enter a valid number for the bulk change.'); return }
    if (['SET_PRICE','SET_COMPARE','SET_COST','SET_STOCK'].includes(bulkAction) && number < 0) { setNotice('Bulk values cannot be negative.'); return }
    const next = variants.map(row => {
      if (!targetIds.has(row.id)) return row
      if (bulkAction === 'SET_PRICE') return {...row,price:cents(number)}
      if (bulkAction === 'ADD_PRICE') return {...row,price:Math.max(0,cents(Number(row.price || 0) + number))}
      if (bulkAction === 'PERCENT_PRICE') return {...row,price:Math.max(0,cents(Number(row.price || 0) * (1 + number / 100)))}
      if (bulkAction === 'SET_COMPARE') return {...row,compareAt:cents(number)}
      if (bulkAction === 'SET_COST') return {...row,cost:cents(number)}
      if (bulkAction === 'SET_STOCK') return {...row,inventory:Math.max(0,Math.round(number))}
      if (bulkAction === 'SET_STATUS') return {...row,status:bulkValue || 'DRAFT'}
      return row
    })
    onChange(next)
    setNotice(`Bulk change applied to ${targetIds.size} variation${targetIds.size === 1 ? '' : 's'}. Save the listing to persist it.`)
  }

  const activateDraft = () => {
    try {
      const result = prepareDraftVariantActivation(product, 1000)
      if (!result.activated) { setNotice(result.reason || 'No priced Draft variations are ready.'); return }
      onChange(result.product.variants)
      setNotice(`${result.activated} priced Draft variations set to Active with 1,000 units each${result.skipped ? `; ${result.skipped} unpriced rows stayed Draft` : ''}. Save the listing to persist this change.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Draft variations could not be activated.') }
  }

  return <section className="variant-matrix">
    <div className="variant-matrix__intro"><div><span>Sellable combinations</span><h2>Variations & pricing</h2><p>Use variations only for choices that change SKU, stock or price. Customer names and printed notes belong under Custom fields.</p></div><div className="variant-matrix__summary"><span><strong>{active.length}</strong> active</span><span><strong>{stock}</strong> units</span><span><strong>{prices.length ? `$${Math.min(...prices).toFixed(0)}–$${Math.max(...prices).toFixed(0)}` : '—'}</strong> price range</span></div></div>
    <div className="variant-matrix__defaults"><div><span>Listing defaults</span><p>New Draft combinations inherit the listing price and start with 1,000 units. They become sellable only after activation and listing publication.</p></div><label>Base SKU<input value={product.sku || ''} onChange={event=>onProductChange?.('sku',event.target.value)}/></label><label>Base price<input type="number" min="0" step="0.01" value={product.price ?? ''} onChange={event=>onProductChange?.('price',event.target.value)}/></label><label>Compare-at<input type="number" min="0" step="0.01" value={product.compareAt ?? ''} onChange={event=>onProductChange?.('compareAt',event.target.value)}/></label></div>

    <div className="variant-matrix__option-builder"><div className="variant-matrix__option-list">{options.length ? options.map((option,index) => <article key={`${option.name}-${index}`}><div><strong>{option.name}</strong><span>{option.values.join(' / ')}</span></div><button type="button" onClick={() => {setEditing(index);setOptionName(option.name);setOptionValues(option.values.join(', '))}}>Edit</button><button type="button" aria-label={`Remove ${option.name}`} onClick={() => removeOption(index)}><Trash2 size={14}/></button></article>) : <p>No options yet. Generate once to create a default variation, or add Size / Colour first.</p>}</div><div className="variant-matrix__option-form"><label>Option name<input value={optionName} onChange={event=>setOptionName(event.target.value)} placeholder="Size"/></label><label>Values, separated by commas<input value={optionValues} onChange={event=>setOptionValues(event.target.value)} placeholder="S, M, L, XL"/></label><button type="button" onClick={saveOption}>{editing === null ? 'Add option' : 'Update option'}</button><button type="button" className="variant-matrix__generate" onClick={generate}>Generate combinations</button></div></div>

    <div className="variant-matrix__bulk"><div className="variant-matrix__bulk-title"><SlidersHorizontal size={16}/><span><strong>Quick price desk</strong><small>Apply a controlled change across many rows.</small></span></div><label>Scope<select value={bulkScope} onChange={event => setBulkScope(event.target.value)}><option value="SELECTED">Selected ({selected.length})</option><option value="FILTERED">Filtered ({visible.length})</option><option value="ACTIVE">All active ({active.length})</option></select><ChevronDown size={14}/></label><label>Change<select value={bulkAction} onChange={event => { setBulkAction(event.target.value); setBulkValue(event.target.value === 'SET_STATUS' ? 'ACTIVE' : '') }}><option value="SET_PRICE">Set selling price</option><option value="ADD_PRICE">Add / subtract amount</option><option value="PERCENT_PRICE">Adjust by percent</option><option value="SET_COMPARE">Set compare-at</option><option value="SET_COST">Set unit cost</option><option value="SET_STOCK">Set stock</option><option value="SET_STATUS">Set status</option></select><ChevronDown size={14}/></label>{bulkAction === 'SET_STATUS' ? <label>Value<select value={bulkValue} onChange={event => setBulkValue(event.target.value)}><option>ACTIVE</option><option>DRAFT</option><option>ARCHIVED</option></select><ChevronDown size={14}/></label> : <label>Value<input type="number" step={bulkAction === 'SET_STOCK' ? '1' : '0.01'} value={bulkValue} onChange={event => setBulkValue(event.target.value)} placeholder={bulkAction === 'PERCENT_PRICE' ? '10 or -10' : '0.00'}/></label>}<button type="button" onClick={applyBulk}>Apply change</button></div>

    <div className="variant-matrix__draft-action"><span><strong>{pricedDraftCount} priced Draft variations</strong> can be activated together. Existing Active and Archived rows stay unchanged.</span><button type="button" onClick={activateDraft} disabled={!pricedDraftCount || product.status === 'ARCHIVED'} title={product.status === 'ARCHIVED' ? 'Restore this listing before activating variants.' : !pricedDraftCount ? 'Add a valid price to at least one Draft variation first.' : 'Set every priced Draft variation Active with 1,000 units each.'}>Activate Draft · stock 1,000</button></div>
    <div className="variant-matrix__toolbar"><label className="variant-matrix__search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search SKU, option or barcode"/></label><label className="variant-matrix__archived"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)}/> Include archived</label><span>{visible.length} shown</span></div>
    <div className="variant-matrix__table"><div className="variant-matrix__head"><button type="button" aria-label="Select all shown variations" className={visible.length && visible.every(row => selected.includes(row.id)) ? 'is-checked' : ''} onClick={toggleVisible}>{visible.length && visible.every(row => selected.includes(row.id)) && <Check size={12}/>}</button><span>Variation / SKU</span><span>Sell / compare</span><span>Cost / margin</span><span>Stock / weight</span><span>Barcode / status</span></div><div className="variant-matrix__rows">{visible.map(row => {
      const margin = Number(row.price || 0) > 0 && row.cost !== '' && row.cost != null ? Math.round((Number(row.price) - Number(row.cost || 0)) / Number(row.price) * 100) : null
      return <article key={row.id} className={selected.includes(row.id) ? 'is-selected' : ''}><button type="button" aria-label={`Select ${row.sku}`} className={selected.includes(row.id) ? 'is-checked' : ''} onClick={() => toggle(row.id)}>{selected.includes(row.id) && <Check size={12}/>}</button><div className="variant-matrix__identity"><strong>{Object.values(row.values || {}).join(' / ') || 'Default variation'}</strong><label>SKU<input value={row.sku} onChange={event=>update(row.id,'sku',event.target.value)}/></label></div><div><label>Price<input type="number" min="0" step="0.01" value={row.price} onChange={event=>update(row.id,'price',event.target.value)}/></label><label>Compare<input type="number" min="0" step="0.01" value={row.compareAt ?? ''} onChange={event=>update(row.id,'compareAt',event.target.value)}/></label></div><div><label>Cost<input type="number" min="0" step="0.01" value={row.cost ?? ''} onChange={event=>update(row.id,'cost',event.target.value)}/></label><span className="variant-matrix__margin">{margin == null ? 'Margin —' : `Margin ${margin}%`}</span></div><div><label>Stock<input type="number" min="0" step="1" value={row.inventory} onChange={event=>update(row.id,'inventory',event.target.value)}/></label><label>Weight g<input type="number" min="0" step="1" value={row.weightGrams ?? ''} onChange={event=>update(row.id,'weightGrams',event.target.value)}/></label></div><div><label>Barcode<input value={row.barcode || ''} onChange={event=>update(row.id,'barcode',event.target.value)}/></label><label>Status<select value={row.status} onChange={event=>update(row.id,'status',event.target.value)}><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select><ChevronDown size={13}/></label></div></article>
    })}</div>{!visible.length && <div className="variant-matrix__empty">{variants.length ? 'No variations match this filter.' : 'No variations yet. Add options, then generate combinations.'}</div>}</div>
    {notice && <p className="variant-matrix__notice" role="status">{notice}</p>}
  </section>
}
