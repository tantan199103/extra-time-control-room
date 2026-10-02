export const VIDEO_FACTORY_DEFAULTS = Object.freeze({
  duration: 60,
  segmentDuration: 10,
  aspectRatio: '9:16',
  model: 'Omni 1.1 Flash',
  language: 'Vietnamese',
  style: 'Cinematic streetwear',
  cta: 'Available now at Jersevo'
})

const HEADWEAR_SCENE_BLUEPRINTS = Object.freeze([
  {
    id: 'scene-01',
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
    title: 'Hero CTA',
    caption: 'AVAILABLE NOW AT JERSEVO',
    voiceover: 'New Era New York Yankees 9Seventy. Find your fit. Own the city.',
    direction: 'Deep navy studio, the cap rotates slowly on clear acrylic. White rim light traces the NY embroidery and curved brim. A hand lifts it toward the lens, leaving clean negative space above for the final caption.',
    camera: '360-degree product turn, slow push to hero',
    sound: 'Music rise, clean final hit, short tail',
    accent: 'CTA'
  }
])

const EYEWEAR_SCENE_BLUEPRINTS = Object.freeze([
  {
    id: 'scene-01',
    title: 'Frame reveal / first look',
    caption: 'SEE YOUR EVERYDAY DIFFERENTLY',
    voiceover: 'Một gọng kính gọn gàng, thay đổi cả thần thái.',
    direction: 'A minimal black glasses case opens under a narrow beam of light. Reveal the same modern minimalist S01010 frame on a clear acrylic stand, then push into the balanced front silhouette and clean bridge. Use the supplied product reference as the single source of truth; do not invent a logo or a new frame shape.',
    camera: 'Macro push-in, 90-degree product turn, rack focus',
    sound: 'Case click, soft glass chime, restrained bass hit',
    accent: 'Hook'
  },
  {
    id: 'scene-02',
    title: 'Fit / face harmony',
    caption: 'GỌN GÀNG. ÔM VỪA.',
    voiceover: 'Form cân đối, ôm vừa khuôn mặt, đeo lâu vẫn dễ chịu.',
    direction: 'A unisex model in a clean white shirt puts on the exact same S01010 frame. Show front, three-quarter and side profile as the bridge and temples sit naturally. Keep facial proportions realistic, keep the frame stable, and avoid exaggerated beauty retouching or face reshaping.',
    camera: 'Handheld portrait close-up, gentle orbit, natural eye-line',
    sound: 'Temple click, fabric movement, warm lo-fi pulse',
    accent: 'Fit'
  },
  {
    id: 'scene-03',
    title: 'Detail / hinge macro',
    caption: 'MINIMAL FORM. MAXIMUM DETAIL.',
    voiceover: 'Đường nét tối giản, tinh tế trong từng chi tiết.',
    direction: 'Slow macro orbit from the rim to the bridge, temple and hinge of the same S01010 frame. Show a realistic finish and precise construction without naming an unverified material. Keep both lenses clear and physically consistent; no extra decorations, no floating parts, no generated text.',
    camera: '180-degree macro orbit, shallow depth of field, slow motion',
    sound: 'Tiny mechanical clicks, airy room tone, soft synth swell',
    accent: 'Detail'
  },
  {
    id: 'scene-04',
    title: 'Lens ready / everyday',
    caption: 'READY FOR YOUR LENS',
    voiceover: 'Lắp tròng cận, viễn, loạn hoặc chống ánh sáng xanh theo nhu cầu.',
    direction: 'The exact same frame moves through a study desk, laptop session and morning commute. Show the frame ready for prescription, astigmatism or blue-light lens options without claiming a lens is already installed. Keep reflections subtle, eyes visible and the product silhouette unchanged across every transition.',
    camera: 'Match cuts, side tracking, light speed-ramp',
    sound: 'Keyboard taps, city hush, beat lift',
    accent: 'Everyday'
  },
  {
    id: 'scene-05',
    title: 'Style switch / unisex',
    caption: 'ONE FRAME. EVERY DAY.',
    voiceover: 'Nam hay nữ, đi học, đi làm hay đi phố đều hợp.',
    direction: 'Three consecutive looks with the exact same S01010 frame: relaxed studywear, smart workwear and a weekend street look. Use whip transitions while the frame remains in the same position and scale. Include varied face shapes and keep the styling simple so the eyewear stays the hero.',
    camera: 'Side tracking, whip transitions, low-angle portrait hero',
    sound: 'Three beat-synced hits, light city texture, hand clap',
    accent: 'Versatility'
  },
  {
    id: 'scene-06',
    title: 'Hero CTA / S01010',
    caption: 'S01010 · KÍNH MẮT ANNA',
    voiceover: 'S01010 — gọng kính thời trang cho nhịp sống hiện đại.',
    direction: 'Soft white and graphite studio. The same S01010 frame rotates slowly on clear acrylic while a clean rim light traces the bridge, rims and temples. A hand lifts it toward the lens, leaving negative space for the final caption. End on a crisp front hero with no invented price, discount or product claim.',
    camera: '360-degree product turn, slow push to hero, clean lock-off',
    sound: 'Music rise, glassy final hit, short tail',
    accent: 'CTA'
  }
])

const GENERIC_SCENE_BLUEPRINTS = Object.freeze([
  {
    id: 'scene-01',
    title: 'Cold open / reveal',
    caption: 'MEET YOUR NEXT EVERYDAY ESSENTIAL',
    voiceover: 'Một thiết kế gọn gàng, sẵn sàng đồng hành mỗi ngày.',
    direction: 'A minimal package opens under a controlled studio flash. Reveal the supplied product reference on a clear stand and hold a clean hero silhouette. Keep the exact product shape stable and do not invent branding.',
    camera: 'Fast push-in, match cut, macro rack focus',
    sound: 'Package click, flash hit, bass drop',
    accent: 'Hook'
  },
  {
    id: 'scene-02',
    title: 'Use / fit test',
    caption: 'MADE TO MOVE WITH YOU',
    voiceover: 'Thiết kế cân đối, dễ dùng trong nhịp sống thật.',
    direction: 'A real person picks up and uses the exact supplied product reference in a natural setting. Show scale, handling and fit without changing the product or adding unsupported features.',
    camera: 'Handheld close-up, gentle orbit, low-angle walk',
    sound: 'Material movement, tactile click, tight beat',
    accent: 'Proof'
  },
  {
    id: 'scene-03',
    title: 'Material / detail macro',
    caption: 'DETAILS THAT HOLD UP CLOSE',
    voiceover: 'Tinh tế nằm ở những chi tiết nhìn thật gần.',
    direction: 'Slow macro orbit around the exact product. Reveal realistic construction, texture and finish without naming any unverified material or performance claim.',
    camera: 'Macro orbit, shallow depth of field, slow motion',
    sound: 'Textured clicks, filtered room tone, soft swell',
    accent: 'Detail'
  },
  {
    id: 'scene-04',
    title: 'Everyday motion',
    caption: 'BUILT FOR THE RHYTHM OF REAL LIFE',
    voiceover: 'Một thiết kế theo bạn qua mọi nhịp chuyển động.',
    direction: 'The same product travels through three real-life moments with clean match cuts. Keep the product recognizable and avoid any unsupported claim about durability or performance.',
    camera: 'Tracking shot, speed-ramp, natural turn',
    sound: 'Footsteps, ambient texture, bass lift',
    accent: 'Energy'
  },
  {
    id: 'scene-05',
    title: 'Style switch',
    caption: 'ONE DESIGN. MANY DAYS.',
    voiceover: 'Một thiết kế, nhiều phiên bản của bạn.',
    direction: 'Three simple looks and locations feature the exact same product. Use whip transitions while the product remains at a consistent scale and orientation.',
    camera: 'Side tracking, whip transitions, hero close-up',
    sound: 'Three beat-synced hits, light crowd texture',
    accent: 'Versatility'
  },
  {
    id: 'scene-06',
    title: 'Hero CTA',
    caption: 'AVAILABLE NOW',
    voiceover: 'Tìm thiết kế phù hợp với nhịp sống của bạn.',
    direction: 'A quiet studio hero frame with the exact supplied product reference rotating on a clear stand. Leave clean negative space for the final caption and do not invent price, discount or logo.',
    camera: '360-degree product turn, slow push to hero',
    sound: 'Music rise, clean final hit, short tail',
    accent: 'CTA'
  }
])

const PRODUCT_PROFILES = Object.freeze({
  headwear: Object.freeze({
    type: 'headwear',
    category: 'Headwear',
    concept: 'Own the NY State of Mind',
    palette: 'premium navy and white palette, streetwear energy',
    guardrail: 'exact product silhouette, exact embroidered logo, one cap throughout',
    brandLock: 'Navy, white, chrome. Keep the cap silhouette and embroidered NY logo stable across every prompt.',
    features: ['Embroidered NY logo', 'Stretch snapback', 'Curved brim'],
    sceneBlueprints: HEADWEAR_SCENE_BLUEPRINTS,
    music: 'Instrumental hip-hop / trap at 100 BPM. Bass hit at every scene transition.'
  }),
  eyewear: Object.freeze({
    type: 'eyewear',
    category: 'Eyewear',
    concept: 'See Your Everyday Differently',
    palette: 'soft white, graphite and warm daylight editorial palette',
    guardrail: 'exact frame proportions, same eyewear throughout, realistic clear lenses, no invented logo or material',
    brandLock: 'Soft white, graphite, warm daylight. Keep the S01010 frame proportions, bridge and temples stable across every prompt.',
    features: ['Balanced minimalist frame', 'Prescription lens ready', 'Lightweight everyday fit'],
    sceneBlueprints: EYEWEAR_SCENE_BLUEPRINTS,
    music: 'Minimal future-pop / lo-fi beat at 96 BPM. A soft click marks each match cut; clean final hit at the CTA.'
  }),
  generic: Object.freeze({
    type: 'product',
    category: 'Product',
    concept: 'Make the Everyday Move',
    palette: 'clean neutral studio palette with one controlled accent',
    guardrail: 'exact product silhouette, same product throughout, no invented branding or unsupported claims',
    brandLock: 'Keep the supplied product reference, proportions and visible details stable across every prompt.',
    features: ['Exact supplied product reference', 'Everyday use case', 'Clean hero finish'],
    sceneBlueprints: GENERIC_SCENE_BLUEPRINTS,
    music: 'Modern instrumental beat at 96 BPM. One tactile transition hit per scene and a clean final CTA hit.'
  })
})

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
  if (/kinhmatanna\.com\/san-pham\/gong-kinh.*s01010/i.test(raw)) return 'Gọng kính thời trang S01010'
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/').filter(Boolean)
    const productIndex = parts.findIndex(part => ['product', 'san-pham'].includes(part.toLowerCase()))
    const slug = productIndex >= 0 ? parts[productIndex + 1] : parts.at(-1)
    return slugToTitle(slug || '')
  } catch {
    return slugToTitle(raw.split('/').filter(Boolean).at(-1) || raw)
  }
}

export function resolveVideoProductProfile({ productUrl = '', productTitle = '' } = {}) {
  const haystack = `${productUrl} ${productTitle}`.toLowerCase()
  if (/kinhmatanna|\bkinh\b|gọng|gong-kinh|eyewear|eyeglass|glasses|spectacle|frame|s01010/.test(haystack)) return PRODUCT_PROFILES.eyewear
  if (/cap|hat|headwear|snapback|9seventy|yankees/.test(haystack)) return PRODUCT_PROFILES.headwear
  return PRODUCT_PROFILES.generic
}

export const videoFactoryProductProfiles = PRODUCT_PROFILES

export function buildPrompt(scene, productTitle, settings = {}, profile = resolveVideoProductProfile({ productTitle })) {
  const aspectRatio = settings.aspectRatio || VIDEO_FACTORY_DEFAULTS.aspectRatio
  const model = settings.model || VIDEO_FACTORY_DEFAULTS.model
  const segmentDuration = settings.segmentDuration || VIDEO_FACTORY_DEFAULTS.segmentDuration
  const orientation = aspectRatio === '16:9' ? 'landscape' : aspectRatio === '1:1' ? 'square' : 'vertical'
  return `${model}, ${segmentDuration}-second ${orientation} ${aspectRatio} product ad. Product: ${productTitle}. ${scene.direction} Cinematic realism, ${profile.palette}, ${profile.guardrail}, no generated text, no watermark. ${scene.camera}. ${scene.sound}.`
}

export function buildVideoCampaign(input = {}) {
  const requestedDuration = Number(input.duration || VIDEO_FACTORY_DEFAULTS.duration)
  const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? requestedDuration
    : VIDEO_FACTORY_DEFAULTS.duration
  const requestedSegmentDuration = Number(input.segmentDuration)
  const segmentDuration = Number.isFinite(requestedSegmentDuration) && requestedSegmentDuration > 0
    ? requestedSegmentDuration
    : duration / 6
  const productTitle = String(input.productTitle || productTitleFromUrl(input.productUrl) || 'Product').trim()
  const profile = resolveVideoProductProfile({ productUrl: input.productUrl, productTitle })
  const settings = { ...VIDEO_FACTORY_DEFAULTS, ...input, duration, segmentDuration, productType: profile.type }
  const blueprints = profile.sceneBlueprints
  const scenes = blueprints.map((scene, index) => ({
    ...scene,
    time: sceneTimeLabel(index, settings.segmentDuration),
    prompt: buildPrompt(scene, productTitle, settings, profile),
    status: 'ready'
  }))
  return {
    id: `jvf-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    product: {
      url: String(input.productUrl || '').trim(),
      title: productTitle,
      profile: profile.type,
      category: profile.category,
      features: profile.features
    },
    settings,
    concept: profile.concept,
    scenes,
    totals: {
      sceneCount: scenes.length,
      duration: scenes.length * Number(settings.segmentDuration || 10),
      readyCount: 0
    },
    voiceover: scenes.map(scene => scene.voiceover).join(' '),
    musicDirection: `${profile.music} Clean final hit at ${duration}s.`
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

export const videoFactorySceneBlueprints = HEADWEAR_SCENE_BLUEPRINTS
export const videoFactoryEyewearSceneBlueprints = EYEWEAR_SCENE_BLUEPRINTS
