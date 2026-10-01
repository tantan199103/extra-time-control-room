export const VIDEO_FACTORY_DEFAULTS = Object.freeze({
  duration: 60,
  segmentDuration: 10,
  aspectRatio: '9:16',
  model: 'Omni 1.1 Flash',
  language: 'Vietnamese',
  style: 'Cinematic streetwear',
  cta: 'Available now at Jersevo'
})

const SCENE_BLUEPRINTS = Object.freeze([
  {
    id: 'scene-01',
    time: '00–10s',
    title: 'Cold open / reveal',
    caption: 'THE CAP THAT SETS THE TONE',
    voiceover: 'Không cần nói nhiều. Chỉ cần đội lên là thấy khác.',
    direction: 'Black box opening under a hard white flash, match-cut to the navy cap on an acrylic pedestal in rainy New York at blue hour. Push from street scale into a crisp embroidered NY logo hero frame.',
    camera: 'Fast push-in, match cut, macro rack focus',
    sound: 'Metal click, flash hit, bass drop',
    accent: 'Hook'
  },
  {
    id: 'scene-02',
    time: '10–20s',
    title: 'Fit test / stretch snap',
    caption: 'STRETCH SNAP. LOCK IN.',
    voiceover: 'Form ôm vừa vặn, stretch-snap dễ chỉnh.',
    direction: 'Streetwear model in a white tee and dark denim puts on the same navy New Era Yankees 9Seventy, adjusts the curved brim and touches the stretch-snap. Keep the cap and logo stable while the camera moves with the beat.',
    camera: 'Handheld close-up, whip-pan, low-angle walk',
    sound: 'Fabric pull, snap click, tight hi-hat loop',
    accent: 'Proof'
  },
  {
    id: 'scene-03',
    time: '20–30s',
    title: 'Material / logo macro',
    caption: 'NY STATE OF MIND',
    voiceover: 'Logo Yankees nổi bật trong từng góc phố.',
    direction: 'Slow 180-degree orbit around the navy crown. Rack focus from the interlocking NY embroidery to the fabric texture, ventilation details and clean curved brim. A few rain drops catch the white rim light.',
    camera: '180-degree orbit, macro, slow motion',
    sound: 'Textured clicks, filtered crowd swell',
    accent: 'Detail'
  },
  {
    id: 'scene-04',
    time: '30–40s',
    title: 'City motion',
    caption: 'BUILT FOR THE CITY',
    voiceover: 'Một chiếc mũ theo bạn qua mọi nhịp chuyển động.',
    direction: 'Model walks through a subway entrance and across a wet New York crossing wearing the same navy cap. Neon reflections skim across the brim, with a slow-motion head turn before a speed-ramp back into the beat.',
    camera: 'Low-angle tracking, speed-ramp, slow-motion turn',
    sound: 'Footsteps, passing train, bass lift',
    accent: 'Energy'
  },
  {
    id: 'scene-05',
    time: '40–50s',
    title: 'Style switch',
    caption: 'ONE CAP. THREE LOOKS.',
    voiceover: 'Một chiếc mũ, nhiều phiên bản của bạn.',
    direction: 'Three consecutive streetwear looks: white tee, navy-and-white varsity jacket, grey hoodie. Use whip transitions while the hat stays in the same position and keeps the NY logo readable.',
    camera: 'Side tracking, whip transitions, low-angle hero',
    sound: 'Three beat-synced hits, crowd chant texture',
    accent: 'Versatility'
  },
  {
    id: 'scene-06',
    time: '50–60s',
    title: 'Hero CTA',
    caption: 'AVAILABLE NOW AT JERSEVO',
    voiceover: 'New Era New York Yankees 9Seventy. Find your fit. Own the city.',
    direction: 'Deep navy studio, the cap rotates slowly on clear acrylic. White rim light traces the NY embroidery and curved brim. A hand lifts it toward the lens, leaving clean negative space above for the final caption.',
    camera: '360-degree product turn, slow push to hero',
    sound: 'Music rise, clean final hit, short tail',
    accent: 'CTA'
  }
])

function sceneTimeLabel(index, segmentDuration) {
  const start = index * Number(segmentDuration || VIDEO_FACTORY_DEFAULTS.segmentDuration)
  const end = start + Number(segmentDuration || VIDEO_FACTORY_DEFAULTS.segmentDuration)
  return `${String(start).padStart(2, '0')}–${String(end).padStart(2, '0')}s`
}

export function slugToTitle(value = '') {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
}

export function productTitleFromUrl(productUrl = '') {
  const raw = String(productUrl).trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)
    const productIndex = parts.findIndex(part => part.toLowerCase() === 'product')
    const slug = productIndex >= 0 ? parts[productIndex + 1] : parts.at(-1)
    return slugToTitle(slug || '')
  } catch {
    return slugToTitle(raw.split('/').filter(Boolean).at(-1) || raw)
  }
}

export function buildPrompt(scene, productTitle, settings = {}) {
  const aspectRatio = settings.aspectRatio || VIDEO_FACTORY_DEFAULTS.aspectRatio
  const model = settings.model || VIDEO_FACTORY_DEFAULTS.model
  const segmentDuration = settings.segmentDuration || VIDEO_FACTORY_DEFAULTS.segmentDuration
  return `${model}, ${segmentDuration}-second vertical ${aspectRatio} product ad. Product: ${productTitle}. ${scene.direction} Cinematic realism, premium navy and white palette, streetwear energy, exact product silhouette, exact embroidered logo, one cap throughout, no generated text, no watermark. ${scene.camera}. ${scene.sound}.`
}

export function buildVideoCampaign(input = {}) {
  const requestedDuration = Number(input.duration || VIDEO_FACTORY_DEFAULTS.duration)
  const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? requestedDuration
    : VIDEO_FACTORY_DEFAULTS.duration
  const requestedSegmentDuration = Number(input.segmentDuration)
  const segmentDuration = Number.isFinite(requestedSegmentDuration) && requestedSegmentDuration > 0
    ? requestedSegmentDuration
    : duration / SCENE_BLUEPRINTS.length
  const settings = { ...VIDEO_FACTORY_DEFAULTS, ...input, duration, segmentDuration }
  const productTitle = String(input.productTitle || productTitleFromUrl(input.productUrl) || 'New Era New York Yankees Performance Navy Edition 9Seventy').trim()
  const scenes = SCENE_BLUEPRINTS.map((scene, index) => ({
    ...scene,
    time: sceneTimeLabel(index, settings.segmentDuration),
    prompt: buildPrompt(scene, productTitle, settings),
    status: 'ready'
  }))
  return {
    id: `jvf-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    product: {
      url: String(input.productUrl || '').trim(),
      title: productTitle,
      category: /cap|hat|headwear/i.test(productTitle) ? 'Headwear' : 'Product',
      color: /white/i.test(productTitle) ? 'White' : 'Navy',
      features: ['Embroidered NY logo', 'Stretch snapback', 'Curved brim']
    },
    settings,
    concept: 'Own the NY State of Mind',
    scenes,
    totals: {
      sceneCount: scenes.length,
      duration: scenes.length * Number(settings.segmentDuration || 10),
      readyCount: scenes.length
    },
    voiceover: scenes.map(scene => scene.voiceover).join(' '),
    musicDirection: 'Instrumental hip-hop / trap at 100 BPM. Bass hit at every scene transition; clean final hit at 60s.'
  }
}

function padTime(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `00:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')},000`
}

export function buildCaptionSrt(campaign) {
  return (campaign?.scenes || []).map((scene, index) => {
    const start = index * Number(campaign.settings?.segmentDuration || 10)
    const end = start + Number(campaign.settings?.segmentDuration || 10)
    return `${index + 1}\n${padTime(start)} --> ${padTime(end)}\n${scene.caption}\n`
  }).join('\n')
}

export function campaignManifest(campaign) {
  return {
    project: campaign.id,
    concept: campaign.concept,
    product: campaign.product,
    settings: campaign.settings,
    scenes: campaign.scenes.map(({ id, time, title, caption, prompt, camera, sound, status }) => ({ id, time, title, caption, prompt, camera, sound, status })),
    voiceover: campaign.voiceover,
    musicDirection: campaign.musicDirection,
    totals: campaign.totals
  }
}

export const videoFactorySceneBlueprints = SCENE_BLUEPRINTS
