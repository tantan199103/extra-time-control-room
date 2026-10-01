import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Film,
  Link2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  WandSparkles
} from 'lucide-react'
import { buildCaptionSrt, buildVideoCampaign, campaignManifest, VIDEO_FACTORY_DEFAULTS } from './lib/video-factory'
import './video-factory.css'

const FLOW_SCENE_URL = 'https://flow.google.com/project/41b27fd7-bc46-439c-8e82-8cabbbd0b90b/scene/02408c4b-c546-404e-843f-c1bd23e4c772'
const DEFAULT_PRODUCT_URL = 'https://www.jersevo.com/product/new-era-new-york-yankees-performance-navy-edition-9seventy-stretch-snapback-hat-tz-adc37c'

function safeRead() {
  try { return JSON.parse(window.localStorage.getItem('jersevo-video-factory-campaign') || 'null') } catch { return null }
}

function saveCampaign(campaign) {
  try { window.localStorage.setItem('jersevo-video-factory-campaign', JSON.stringify(campaign)) } catch {}
}

function downloadText(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

function statusLabel(status) {
  if (status === 'done') return 'Ready'
  if (status === 'queued') return 'Queued'
  return 'Prompt ready'
}

function StatusPill({ status }) {
  return <span className={`vf-status vf-status--${status}`}><i />{statusLabel(status)}</span>
}

function ProductArt() {
  return <div className="vf-product-art" aria-label="Navy New York Yankees cap visual">
    <div className="vf-product-art__glow" />
    <div className="vf-product-art__cap">
      <span className="vf-product-art__logo">NY</span>
      <span className="vf-product-art__brim" />
      <span className="vf-product-art__stitch">NEW ERA</span>
    </div>
    <span className="vf-product-art__stamp">NAVY / 9SEVENTY</span>
  </div>
}

function SectionLabel({ icon: Icon, children }) {
  return <div className="vf-section-label"><Icon size={14} strokeWidth={1.7}/><span>{children}</span></div>
}

export default function VideoFactory() {
  const stored = useMemo(() => safeRead(), [])
  const [productUrl, setProductUrl] = useState(stored?.product?.url || DEFAULT_PRODUCT_URL)
  const [duration, setDuration] = useState(String(stored?.settings?.duration || VIDEO_FACTORY_DEFAULTS.duration))
  const [aspectRatio, setAspectRatio] = useState(stored?.settings?.aspectRatio || VIDEO_FACTORY_DEFAULTS.aspectRatio)
  const [model, setModel] = useState(stored?.settings?.model || VIDEO_FACTORY_DEFAULTS.model)
  const [style, setStyle] = useState(stored?.settings?.style || VIDEO_FACTORY_DEFAULTS.style)
  const [campaign, setCampaign] = useState(stored)
  const [activeScene, setActiveScene] = useState(stored?.scenes?.[0]?.id || 'scene-01')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (campaign) saveCampaign(campaign)
  }, [campaign])

  const readyCount = campaign?.scenes?.filter(scene => scene.status === 'done').length || 0
  const progress = campaign ? Math.round((readyCount / campaign.scenes.length) * 100) : 0
  const selectedScene = campaign?.scenes?.find(scene => scene.id === activeScene) || campaign?.scenes?.[0]

  const generateCampaign = () => {
    setBusy(true)
    setNotice('Building the brief, prompts and six-scene edit map…')
    window.setTimeout(() => {
      const next = buildVideoCampaign({
        productUrl,
        duration: Number(duration) || 60,
        segmentDuration: Math.round((Number(duration) || 60) / 6),
        aspectRatio,
        model,
        style
      })
      setCampaign(next)
      setActiveScene(next.scenes[0].id)
      setNotice('Campaign ready. Review a scene, then send the prompt to Flow.')
      setBusy(false)
    }, 450)
  }

  const markSceneDone = sceneId => {
    setCampaign(current => current ? {
      ...current,
      scenes: current.scenes.map(scene => scene.id === sceneId ? { ...scene, status: scene.status === 'done' ? 'ready' : 'done' } : scene),
      totals: { ...current.totals, readyCount: current.scenes.filter(scene => scene.id === sceneId ? scene.status !== 'done' : scene.status === 'done').length }
    } : current)
    setNotice('Scene status updated.')
  }

  const copyPrompts = async () => {
    if (!campaign) return
    const text = campaign.scenes.map(scene => `${scene.time} · ${scene.title}\n${scene.prompt}`).join('\n\n')
    try { await navigator.clipboard.writeText(text); setNotice('Prompt pack copied to clipboard.') } catch { setNotice('Clipboard is unavailable. Download the manifest instead.') }
  }

  const exportManifest = () => {
    if (!campaign) return
    downloadText(`${campaign.id}-manifest.json`, JSON.stringify(campaignManifest(campaign), null, 2))
    downloadText(`${campaign.id}-captions.srt`, buildCaptionSrt(campaign), 'text/plain')
    setNotice('Manifest and captions downloaded.')
  }

  const resetCampaign = () => {
    setCampaign(null)
    setNotice('Ready for a new product.')
    try { window.localStorage.removeItem('jersevo-video-factory-campaign') } catch {}
  }

  return <main className="vf-page">
    <section className="vf-hero">
      <div className="vf-hero__copy">
        <div className="vf-kicker"><Clapperboard size={15}/> JERSEVO VIDEO FACTORY / MVP</div>
        <h1>TURN A PRODUCT<br/><em>INTO A MOMENT.</em></h1>
        <p>A compact production desk for 9:16 campaigns. Feed it a product page, get a six-scene Omni prompt pack and an edit map ready for Flow.</p>
        <div className="vf-hero__meta"><span><strong>06</strong> scenes</span><span><strong>{duration === '60' ? '10s' : '5s'}</strong> per beat</span><span><strong>{aspectRatio}</strong> native</span></div>
      </div>
      <div className="vf-hero__visual"><ProductArt/><span className="vf-hero__visual-note">CURRENT TEMPLATE / NY YANKEES NAVY 9SEVENTY</span></div>
    </section>

    <section className="vf-workspace">
      <aside className="vf-brief-panel">
        <SectionLabel icon={Link2}>01 / PRODUCT BRIEF</SectionLabel>
        <label className="vf-field vf-field--wide"><span>Product page URL</span><input value={productUrl} onChange={event => setProductUrl(event.target.value)} placeholder="https://…" /></label>
        <div className="vf-field-grid">
          <label className="vf-field"><span>Duration</span><select value={duration} onChange={event => setDuration(event.target.value)}><option value="60">60 seconds</option><option value="30">30 seconds</option></select></label>
          <label className="vf-field"><span>Aspect ratio</span><select value={aspectRatio} onChange={event => setAspectRatio(event.target.value)}><option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option><option value="16:9">16:9 landscape</option></select></label>
        </div>
        <div className="vf-field-grid">
          <label className="vf-field"><span>Generation model</span><select value={model} onChange={event => setModel(event.target.value)}><option>Omni 1.1 Flash</option><option>Veo 3.1 - Fast</option></select></label>
          <label className="vf-field"><span>Visual language</span><select value={style} onChange={event => setStyle(event.target.value)}><option>Cinematic streetwear</option><option>Clean product studio</option><option>Raw handheld city</option></select></label>
        </div>
        <div className="vf-brief-note"><Sparkles size={16}/><span><strong>Brand lock</strong><small>Navy, white, chrome. Product silhouette and embroidered NY logo stay stable across every prompt.</small></span></div>
        <button className="vf-primary-button" onClick={generateCampaign} disabled={busy}><WandSparkles size={16}/>{busy ? 'BUILDING CAMPAIGN…' : campaign ? 'REBUILD CAMPAIGN' : 'BUILD CAMPAIGN'}<ChevronRight size={16}/></button>
        {campaign && <button className="vf-quiet-button" onClick={resetCampaign}><RefreshCw size={14}/> Start a different product</button>}
      </aside>

      <section className="vf-board">
        <div className="vf-board__head"><div><SectionLabel icon={Film}>02 / PRODUCTION BOARD</SectionLabel><h2>{campaign ? campaign.concept : 'Your campaign is waiting.'}</h2><p>{campaign ? `${campaign.product.title} · ${campaign.totals.duration}s · ${campaign.settings.model}` : 'Build a brief to reveal the production timeline.'}</p></div>{campaign && <div className="vf-board__actions"><button onClick={copyPrompts} title="Copy all prompts"><Copy size={15}/> Copy prompts</button><button onClick={exportManifest} title="Download manifest and captions"><Download size={15}/> Export pack</button><a href={FLOW_SCENE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open Flow</a></div>}</div>
        {campaign ? <>
          <div className="vf-progress"><div><span>Production readiness</span><strong>{readyCount}/{campaign.scenes.length} scenes marked ready</strong></div><div className="vf-progress__track"><i style={{ width: `${Math.max(progress, 5)}%` }}/></div></div>
          <div className="vf-scene-list">
            {campaign.scenes.map((scene, index) => <article key={scene.id} className={`vf-scene ${activeScene === scene.id ? 'is-active' : ''}`} onClick={() => setActiveScene(scene.id)}>
              <div className="vf-scene__index">{String(index + 1).padStart(2, '0')}</div>
              <div className="vf-scene__main"><div className="vf-scene__top"><span>{scene.time}</span><StatusPill status={scene.status}/></div><h3>{scene.title}</h3><p>{scene.caption}</p></div>
              <button className="vf-scene__toggle" onClick={event => { event.stopPropagation(); markSceneDone(scene.id) }} aria-label={`Mark ${scene.title} ready`}><Check size={15}/></button>
            </article>)}
          </div>
        </> : <div className="vf-empty"><div className="vf-empty__mark"><Play size={22}/></div><strong>One URL in. Six scenes out.</strong><p>Start with the Jersevo product page already loaded above. The factory will keep the product facts visible while it writes the creative direction.</p></div>}
      </section>
    </section>

    {campaign && selectedScene && <section className="vf-detail">
      <div className="vf-detail__rail"><SectionLabel icon={SlidersHorizontal}>03 / SCENE DETAIL</SectionLabel><span className="vf-detail__eyebrow">{selectedScene.accent} / {selectedScene.time}</span><h2>{selectedScene.title}</h2><p>{selectedScene.voiceover}</p><div className="vf-detail__specs"><span><Clock3 size={14}/><b>{campaign.settings.segmentDuration}s</b> duration</span><span><Film size={14}/><b>{selectedScene.camera}</b></span><span><Sparkles size={14}/><b>{selectedScene.sound}</b></span></div></div>
      <div className="vf-prompt"><div className="vf-prompt__head"><span>OMNI PROMPT</span><button onClick={() => { navigator.clipboard?.writeText(selectedScene.prompt); setNotice('Scene prompt copied.') }}><Copy size={14}/> Copy</button></div><pre>{selectedScene.prompt}</pre><div className="vf-prompt__footer"><span>Caption overlay</span><strong>{selectedScene.caption}</strong></div></div>
    </section>}

    <footer className="vf-footer"><span><CheckCircle2 size={15}/> Flow-ready production system</span><span>{notice || 'Prompts are designed for a human review before generation.'}</span><span>JERSEVO / 2026</span></footer>
  </main>
}
