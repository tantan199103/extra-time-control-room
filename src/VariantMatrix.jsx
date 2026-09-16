import React, { useState } from 'react'
import { generateVariantMatrix } from './lib/catalog-model'
import './variant-matrix.css'

export default function VariantMatrix({ product, onChange, onOptionsChange }) {
  const [optionName, setOptionName] = useState('')
  const [optionValues, setOptionValues] = useState('')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const options = product.options || []
  const variants = product.variants || []
  const saveOption = () => {
    const name=optionName.trim(), values=optionValues.split(',').map(value=>value.trim()).filter(Boolean)
    if (!name || !values.length || new Set(values.map(value=>value.toLowerCase())).size !== values.length) { setNotice('Enter a name and unique comma-separated values.'); return }
    if (options.some((option,index)=>index!==editing && option.name.toLowerCase()===name.toLowerCase())) { setNotice('This option name already exists.'); return }
    if (editing===null && options.length>=3) { setNotice('A listing supports up to 3 options.'); return }
    onOptionsChange(editing===null ? [...options,{name,values}] : options.map((option,index)=>index===editing ? {...option,name,values} : option))
    setOptionName(''); setOptionValues(''); setEditing(null)
    setNotice('Options updated. Generate variants to reconcile the combinations before saving.')
  }
  const generate = () => {
    try { const next=generateVariantMatrix(product); onChange(next); setNotice(`${next.filter(row=>row.status!=='ARCHIVED').length} combinations ready. New variants are drafts; existing prices and SKUs are preserved.`) }
    catch (error) { setNotice(error.message) }
  }
  const update = (id,key,value) => onChange(variants.map(row=>row.id===id ? {...row,[key]:value} : row))
  const applyPrice = () => {
    if (bulkPrice==='' || !Number.isFinite(Number(bulkPrice)) || Number(bulkPrice)<0) { setNotice('Enter a valid non-negative price.'); return }
    onChange(variants.map(row=>row.status==='ACTIVE' ? {...row,price:Number(bulkPrice)} : row))
    setNotice('Price applied to active variants in this draft. Save the listing to persist it.')
  }
  return <section className="variant-matrix">
    <h3>Options & variants</h3><p>Size and garment colour are variants. Customer names, numbers and notes stay in personalization.</p>
    <div className="variant-matrix__options">{options.map((option,index)=><div key={index}><strong>{option.name}</strong><span>{option.values.join(' · ')}</span><button type="button" onClick={()=>{setEditing(index);setOptionName(option.name);setOptionValues(option.values.join(', '))}}>Edit</button><button type="button" onClick={()=>{onOptionsChange(options.filter((_,i)=>i!==index));setEditing(null);setOptionName('');setOptionValues('');setNotice('Option removed from draft. Generate variants to archive affected combinations.')}}>Remove</button></div>)}</div>
    <div className="variant-matrix__option-form"><label>Option name<input value={optionName} onChange={event=>setOptionName(event.target.value)} placeholder="Size"/></label><label>Values, separated by commas<input value={optionValues} onChange={event=>setOptionValues(event.target.value)} placeholder="S, M, L, XL"/></label><button type="button" onClick={saveOption}>{editing===null ? 'Add option' : 'Update option'}</button></div>
    <button className="variant-matrix__generate" type="button" onClick={generate}>Generate missing combinations</button>
    <div className="variant-matrix__bulk"><label>Price for active variants<input type="number" min="0" step="0.01" value={bulkPrice} onChange={event=>setBulkPrice(event.target.value)}/></label><button type="button" onClick={applyPrice}>Apply price</button></div>
    <label className="variant-matrix__archived"><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/> Show archived variants</label>
    <div className="variant-matrix__rows">{variants.filter(row=>showArchived || row.status!=='ARCHIVED').map(row=><article key={row.id}>
      <strong>{Object.values(row.values || {}).join(' / ') || 'Default variant'}</strong>
      <label>SKU<input value={row.sku} onChange={event=>update(row.id,'sku',event.target.value)}/></label>
      <label>Price<input type="number" min="0" step="0.01" value={row.price} onChange={event=>update(row.id,'price',event.target.value)}/></label>
      <label>Stock<input type="number" min="0" step="1" value={row.inventory} onChange={event=>update(row.id,'inventory',event.target.value)}/></label>
      <label>Status<select value={row.status} onChange={event=>update(row.id,'status',event.target.value)}><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select></label>
    </article>)}</div>
    {!variants.length && <p>No variants yet. Add options, then generate combinations. With no options, generate one default variant.</p>}
    {notice && <p className="variant-matrix__notice" role="status">{notice}</p>}
  </section>
}
