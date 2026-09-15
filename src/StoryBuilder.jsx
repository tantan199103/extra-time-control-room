import React, { useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Lock, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { buildCustomizationPayload, cityPresets, fieldGroups, getCity, getTemplate, renderTemplateSvg, resolveCustomization, storyTemplates, svgDataUrl, universalSlots, validateCustomization } from './template-engine'
import { requestArtworkRender } from './lib/supabase'
import { fetchRuntimeTemplates } from './lib/supabase'

function ArtworkPreview({ template, values, view, showGuides = false }) {
  const src = useMemo(() => svgDataUrl(renderTemplateSvg(template, values, view, { showGuides })), [template, values, view, showGuides])
  const data = resolveCustomization(template, values)
  return <img src={src} alt={`${template.name} ${view} preview for ${data.name} ${data.number}`}/>
}

function BuilderField({ fieldId, template, values, update, error }) {
  const field = universalSlots[fieldId]
  if (!field) return null
  const value = values[field.key] ?? ''
  if (field.type === 'swatch') {
    const options = field.key === 'metal'
      ? [{ id:'gold', label:'Antique Gold', primary:'#C2A46D', secondary:'#C2A46D' },{ id:'silver', label:'Silver', primary:'#BFC2C4', secondary:'#BFC2C4' },{ id:'gunmetal', label:'Gunmetal', primary:'#70747A', secondary:'#70747A' }]
      : template.palettes
    return <div className="engine-field engine-field--swatch"><div><span>{field.label}</span><small>{options.find(option => option.id === value)?.label || 'Template preset'}</small></div><div className="engine-swatches">{options.map(option => <button key={option.id} className={value === option.id ? 'is-active' : ''} onClick={() => update(field.key, option.id)} aria-label={option.label}><i style={{background:option.primary}}/><b style={{background:option.secondary}}/>{value === option.id && <Check size={12}/>}</button>)}</div></div>
  }
  if (field.type === 'city') return <label className="engine-field"><span>{field.label}</span><div className="engine-select"><select value={value} onChange={event => update(field.key,event.target.value)}>{cityPresets.map(city => <option key={city.id} value={city.id}>{city.city} / {city.region}</option>)}</select><ChevronDown size={15}/></div>{error && <em>{error}</em>}</label>
  if (field.type === 'select') return <label className="engine-field"><span>{field.label}</span><div className="engine-select"><select value={value} onChange={event => update(field.key,event.target.value)}>{field.options.map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={15}/></div>{error && <em>{error}</em>}</label>
  const isNumber = field.type === 'number' || field.type === 'year'
  return <label className="engine-field"><span>{field.label}<small>{field.maxChars ? `${String(value).length}/${field.maxChars}` : ''}</small></span><input value={value} inputMode={isNumber ? 'numeric' : 'text'} maxLength={field.maxChars} placeholder={field.placeholder} onChange={event => update(field.key,isNumber ? event.target.value.replace(/\D/g,'').slice(0,field.maxChars) : event.target.value.toUpperCase())}/>{error && <em>{error}</em>}</label>
}

function DerivedCity({ cityId }) {
  const city = getCity(cityId)
  return <div className="engine-derived"><div className="engine-derived__head"><MapPin size={15}/><div><span>City preset applied</span><strong>{city.city} / {city.code}</strong></div></div><div className="engine-derived__grid"><span>COORDINATES<strong>{city.lat}<br/>{city.lng}</strong></span><span>PALETTE<strong><i style={{background:city.primary}}/><i style={{background:city.secondary}}/></strong></span><span>SIGNATURE<strong>{city.signature}</strong></span><span>SYMBOLS<strong>{city.icons.join(' / ')}</strong></span></div><p>Known city data is filled by the engine. The customer never types it twice.</p></div>
}

export default function StoryBuilder({ onAdd }) {
  const [templates, setTemplates] = useState(storyTemplates)
  const [templateId, setTemplateId] = useState('hometown-v1')
  const template = templates.find(item => item.id === templateId) || templates[0] || getTemplate(templateId)
  const [valuesByTemplate, setValuesByTemplate] = useState(() => Object.fromEntries(storyTemplates.map(item => [item.id,{...item.defaults}])))
  const [view, setView] = useState('back')
  const [size, setSize] = useState('M')
  const [errors, setErrors] = useState({})
  const [confirmed, setConfirmed] = useState(false)
  React.useEffect(() => { let active = true; fetchRuntimeTemplates().then(result => { if (!active || !result.data?.length) return; setTemplates(result.data); setValuesByTemplate(current => Object.fromEntries(result.data.map(item => [item.id, current[item.id] || {...item.defaults}]))) }).catch(() => {}); return () => { active = false } }, [])
  const values = valuesByTemplate[template.id] || template.defaults
  const resolved = resolveCustomization(template, values)
  const update = (key,value) => { setValuesByTemplate(current => ({...current,[template.id]:{...current[template.id], [key]:value}})); setErrors(current => ({...current,[key]:null})); setConfirmed(false) }
  const selectTemplate = id => { setTemplateId(id); setView('back'); setErrors({}); setConfirmed(false) }
  const groups = fieldGroups.map(group => ({...group, fields:template.fields.filter(fieldId => universalSlots[fieldId]?.group === group.id)})).filter(group => group.fields.length)
  const add = () => {
    const nextErrors = validateCustomization(template, values)
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    const payload = buildCustomizationPayload(template, values)
    setConfirmed(true)
    requestArtworkRender(payload).catch(() => {})
    onAdd({ id:`custom-${template.id}`, name:`${template.name} / ${resolved.name} ${resolved.number}`, story:template.strapline, price:119, color:resolved.primary, image:svgDataUrl(renderTemplateSvg(template,values,'back')), customization:{...payload, commerce:{size}}, templateVersion:template.version }, size)
  }
  return <main className="engine-page">
    <section className="engine-choose"><div><span>BUILD YOUR STORY</span><h1>ONE ENGINE.<br/>FIVE POINTS OF VIEW.</h1><p>Choose the story system first. Every question after this is defined by that template.</p></div><div className="engine-template-strip">{storyTemplates.map(item => <button key={item.id} className={template.id === item.id ? 'is-active' : ''} onClick={() => selectTemplate(item.id)}><small>{item.status === 'DRAFT' ? 'EARLY ACCESS' : `V${item.version}`}</small><strong>{item.name}</strong><span>{item.strapline}</span><i>{item.artworkLock}% fixed</i></button>)}</div></section>
    <section className="engine-builder">
      <div className="engine-stage">
        <div className="engine-stage__top"><span>LIVE ARTWORK PROOF</span><span><i/> DETERMINISTIC ENGINE</span></div>
        <div className="engine-stage__canvas"><div className="engine-grid"/><ArtworkPreview template={template} values={values} view={view}/><div className="engine-stage__ratio"><strong>{template.artworkLock}%</strong><span>DESIGNER<br/>LOCKED</span></div></div>
        <div className="engine-stage__bottom"><div className="engine-view-switch"><button className={view === 'front' ? 'is-active' : ''} onClick={() => setView('front')}>FRONT</button><button className={view === 'back' ? 'is-active' : ''} onClick={() => setView('back')}>BACK</button></div><div><span>TEMPLATE</span><strong>{template.id} / V{template.version}</strong></div><div><span>OUTPUT</span><strong>3000 × 3600</strong></div></div>
      </div>
      <aside className="engine-form">
        <div className="engine-form__intro"><span><Sparkles size={14}/> {template.name}</span><h2>MAKE THE<br/>STORY YOURS.</h2><p>You provide the memory. The template protects the composition.</p></div>
        <div className="engine-lock-policy"><Lock size={15}/><div><strong>{template.artworkLock}% artwork is fixed</strong><span>Typography, placement, pattern, texture and hierarchy stay locked.</span></div></div>
        {groups.map((group,index) => <section className="engine-form-group" key={group.id}><div className="engine-form-group__head"><span>{String(index+1).padStart(2,'0')}</span><div><h3>{group.title}</h3><p>{group.copy}</p></div></div>{group.fields.map(fieldId => <BuilderField key={fieldId} fieldId={fieldId} template={template} values={values} update={update} error={errors[universalSlots[fieldId].key]}/>) }{group.id === 'roots' && template.fields.includes('city') && <DerivedCity cityId={values.cityId}/>}</section>)}
        <div className="engine-order"><div className="engine-order__proof"><ShieldCheck size={17}/><span><strong>Production-safe payload</strong>Template version and derived values travel with the order.</span></div><div className="engine-order__size"><span>SIZE TO ORDER</span><div>{['XS','S','M','L','XL','XXL'].map(item => <button key={item} className={size === item ? 'is-active' : ''} onClick={() => setSize(item)}>{item}</button>)}</div></div><div className="engine-order__summary"><span>{resolved.name} / {resolved.number}<small>{template.name} · V{template.version} · {size}</small></span><strong>$119</strong></div><button onClick={add}>{confirmed ? <><Check size={16}/> ARTWORK LOCKED</> : <>LOCK ARTWORK & ADD TO BAG <ArrowRight size={16}/></>}</button></div>
      </aside>
    </section>
    <section className="engine-truth"><div><span>SOURCE OF TRUTH</span><h2>THE PREVIEW IS FAST.<br/>THE ORDER IS EXACT.</h2></div><div className="engine-truth__flow"><article><strong>01</strong><h3>Form state</h3><p>Only fields allowed by the selected template exist.</p></article><article><strong>02</strong><h3>Template version</h3><p>Normalized slots and safe zones determine the artwork.</p></article><article><strong>03</strong><h3>Server render</h3><p>The same payload is rebuilt at print resolution.</p></article><article><strong>04</strong><h3>Production order</h3><p>Master files and inputs stay attached for reproduction.</p></article></div></section>
  </main>
}
