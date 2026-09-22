import { createClient } from '@supabase/supabase-js'
import { listingMediaSlot } from '../src/lib/listing-media.js'

const json = (response, status, body) => response.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').json(body)
const FORBIDDEN_PUBLIC_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"')]+|(?:\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|fan|fun)(?:\/[^\s<>"')]+)?)|fangearsport|apikey\.(?:fun|fan)|openai|gpt-image-2|source\s*url/gi
const text = (value, limit) => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(FORBIDDEN_PUBLIC_PATTERN, '')
  .replace(/\[([^\]]+)\]\(\s*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit)
const list = (value, limit = 12) => {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return values.map(item => text(item, 100)).filter(Boolean).slice(0, limit)
}

const score = value => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null
}

const imageCount = value => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(10, Math.round(number))) : null
}

function safeImageReference(value, origin = '') {
  try {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const url = (raw.startsWith('/') && origin) ? new URL(raw, origin) : new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    if (url.username || url.password) return ''
    // The model needs a public image URL, but the browser must never be able
    // to make this endpoint forward local, file or data URLs to the provider.
    if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) return ''
    return url.toString().slice(0, 2000)
  } catch {
    return ''
  }
}

// Keep the Vercel fallback below its 60-second ceiling, while allowing the
// Cloud Run runtime (300-second request timeout) enough time for multimodal
// listing audits. K_SERVICE is injected by Cloud Run and never comes from the
// browser. The optional override is bounded so a bad setting cannot outlive
// the container request budget.
const UPSTREAM_TIMEOUT_MS = Math.min(
  240_000,
  Math.max(5_000, Number(process.env.AI_TEXT_TIMEOUT_MS || (process.env.K_SERVICE ? 240_000 : 55_000)))
)

function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError' || /aborted due to timeout|timed? out/i.test(String(error?.message || ''))
}

async function requireAdmin(request) {
  const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Admin sign-in is required.'), { status:401 })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  // Cloud Run intentionally keeps only the server-side service-role key. The
  // anon key belongs to browser clients and is not required to validate a
  // bearer session here because auth.getUser(token) verifies the supplied JWT
  // explicitly. Keep anon-key fallbacks for Vercel/local compatibility, but do
  // not make the server route fail merely because a public browser key is not
  // configured in the backend runtime.
  const authKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !authKey) throw Object.assign(new Error('Supabase server settings are missing.'), { status:503 })
  const client = createClient(url, authKey, { global:{ headers:{ Authorization:`Bearer ${token}` } }, auth:{ persistSession:false, autoRefreshToken:false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) throw Object.assign(new Error('The admin session is invalid or expired.'), { status:401 })
  if (data.user.app_metadata?.extra_time_role !== 'admin') throw Object.assign(new Error('Extra Time admin permission is required.'), { status:403 })
  return data.user
}

function extractJson(value) {
  const source = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(source) } catch {
    const match = source.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI returned an unreadable draft.')
    return JSON.parse(match[0])
  }
}

function normalizeSuggestion(raw, language) {
  const blocks = Array.isArray(raw.contentBlocks) ? raw.contentBlocks.slice(0, 12).map((block, index) => {
    const type = ['heading','paragraph','quote','image'].includes(block?.type) ? block.type : 'paragraph'
    const role = type === 'image' && listingMediaSlot(block?.mediaRole || block?.role) ? listingMediaSlot(block.mediaRole || block.role).id : ''
    return {
      id:`ai-block-${Date.now()}-${index}`,
      type,
      content:text(block?.content || block?.caption, type === 'heading' ? 140 : type === 'image' ? 180 : 1200),
      ...(role ? { mediaRole:role } : {})
    }
  }).filter(block => block.type === 'image' ? block.mediaRole : block.content) : []
  const primaryKeyword = text(raw.primaryKeyword || raw.primary_keyword, 100)
  const secondaryKeywords = list(raw.secondaryKeywords || raw.secondary_keywords, 10)
  const valueProps = list(raw.valueProps || raw.value_props, 6)
  const differentiators = list(raw.differentiators || raw.differentiatorPoints, 6)
  const imagePlan = Array.isArray(raw.imagePlan) ? raw.imagePlan.slice(0, 6).map(item => {
    const role = listingMediaSlot(item?.role || item?.mediaRole)
    return role ? { role:role.id, caption:text(item?.caption, 180) } : null
  }).filter(Boolean) : []
  const rawAudit = raw.audit && typeof raw.audit === 'object' && !Array.isArray(raw.audit) ? raw.audit : {}
  const imageGaps = (Array.isArray(rawAudit.imageGaps) ? rawAudit.imageGaps : Array.isArray(raw.imageGaps) ? raw.imageGaps : [])
    .slice(0, 8)
    .map(item => {
      const role = listingMediaSlot(item?.role || item?.mediaRole)
      return role ? { role:role.id, reason:text(item?.reason || item?.caption, 180) } : null
    })
    .filter(Boolean)
  const audit = {
    summary:text(rawAudit.summary || raw.auditSummary, 500),
    contentScore:score(rawAudit.contentScore ?? raw.contentScore),
    mediaScore:score(rawAudit.mediaScore ?? raw.mediaScore),
    issues:list(rawAudit.issues || raw.contentIssues, 8),
    imageGaps,
    reviewedImageCount:imageCount(rawAudit.reviewedImageCount)
  }
  const keywords = [...new Set([primaryKeyword, ...secondaryKeywords, ...list(raw.keywords, 15)].filter(Boolean))].slice(0, 15)
  return {
    title:text(raw.title, 120),
    subtitle:text(raw.subtitle, 180),
    description:text(raw.description || raw.story, 5000),
    seoTitle:text(raw.seoTitle, 60),
    seoDescription:text(raw.seoDescription, 160),
    primaryKeyword,
    secondaryKeywords,
    valueProps,
    differentiators,
    imagePlan,
    audit,
    keywords,
    tags:list(raw.tags, 15).map(item => item.toLowerCase().replace(/\s+/g, '-')),
    contentBlocks:blocks,
    language,
    generatedAt:new Date().toISOString()
  }
}

function safeTaxonomy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowed = ['category', 'collection', 'league', 'team', 'sport', 'audience', 'city', 'year']
  return Object.fromEntries(allowed
    .map(key => [key, text(value[key], 100)])
    .filter(([, item]) => item))
}

function safeStoryBlocks(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).map(block => ({
    type: ['heading', 'paragraph', 'quote', 'image'].includes(block?.type) ? block.type : 'paragraph',
    content: text(block?.content, 700),
    mediaRole: listingMediaSlot(block?.mediaRole) ? listingMediaSlot(block.mediaRole).id : ''
  })).filter(block => block.content || block.mediaRole)
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error:'POST listing-copy requests only.' })
  try {
    await requireAdmin(request)
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {}
    const product = body.product && typeof body.product === 'object' ? body.product : {}
    const brief = body.brief && typeof body.brief === 'object' ? body.brief : {}
    const language = ['Vietnamese','English'].includes(brief.language) ? brief.language : 'English'
    const direction = text(brief.direction, 1600)
    if (!direction && !text(product.description, 5000) && !text(product.title, 120)) return json(response, 422, { error:'Add a title, story or AI direction first.' })
    const apiKey = process.env.AI_TEXT_API_KEY || process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
    if (!apiKey) return json(response, 503, { error:'AI writing is not connected. Add AI_TEXT_API_KEY in the server environment.' })
    let base = (process.env.AI_TEXT_API_URL || process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
    if (!base) {
      base = apiKey.startsWith('sk-proj-') ? 'https://api.openai.com/v1' : 'https://api.apikey.fan/v1'
    }
    let apiUrl = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
    const configuredModel = (process.env.AI_TEXT_MODEL || '').trim()
    let model = (!configuredModel || configuredModel === 'gpt-4.1-mini') ? 'gpt-4o-mini' : configuredModel

    const host = request.headers?.['x-forwarded-host'] || request.headers?.host
    const origin = host ? `https://${String(host).split(',')[0].trim()}` : (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://www.jersevo.com')

    const media = Array.isArray(product.media) ? product.media.slice(0, 12) : []
    const mediaImages = media.map(item => {
      const url = safeImageReference(item?.url, origin)
      return url ? { url, role:text(item.role || item.mediaRole, 60), alt:text(item.alt, 240), type:text(item.type, 20) } : null
    }).filter(Boolean).filter(item => item.type === 'IMAGE' || !item.type)
    const productContext = {
      title:text(product.title,120), subtitle:text(product.subtitle,180), story:text(product.description,5000),
      productType:text(product.type,80), productGroup:text(product.productGroup,80), tags:list(product.tags),
      taxonomy:safeTaxonomy(product.taxonomy),
      existingSeo:{
        title:text(product.seo?.title,60), description:text(product.seo?.description,160),
        primaryKeyword:text(product.seo?.primaryKeyword,100),
        secondaryKeywords:list(product.seo?.secondaryKeywords,10),
        valueProps:list(product.seo?.valueProps,6), differentiators:list(product.seo?.differentiators,6)
      },
      customerEditableFields:list(product.customFields),
      mediaRoles:media.map(item => text(item.role || item.mediaRole,60)).filter(Boolean),
      mediaNotes:media.slice(0,8).map(item => ({ type:text(item.type,20), alt:text(item.alt,240), role:text(item.role || item.mediaRole,60) })),
      mediaImages,
      existingStoryBlocks:safeStoryBlocks(product.contentBlocks)
    }
    const fullAudit = String(brief.reviewMode || '').toUpperCase() === 'FULL_AUDIT'
    const system = `You are the senior product editor for Extra Time, a designer-led football apparel studio. Write specific, credible commerce copy grounded in the supplied design story and inspect every supplied product image before deciding what to say. Never invent teams, players, sponsors, materials, manufacturing claims, awards, licensing, shipping promises or reviews. Keep typography/composition/effects designer-locked; customer customization is limited to the supplied editable fields. Remove URLs, source references and AI-provider references. Write in ${language}. Return only valid JSON with keys title, subtitle, description, seoTitle, seoDescription, primaryKeyword, secondaryKeywords, keywords, tags, valueProps, differentiators, imagePlan, contentBlocks, audit. audit is an object with summary, contentScore (0-100), mediaScore (0-100), issues (array of concise fixes), reviewedImageCount and imageGaps (array of {role, reason}). imagePlan is an array of {role, caption} using only these controlled roles: model-front, model-back, model-street, model-detail, model-matchday and custom-guide. Include missing roles that would materially improve the listing; do not request duplicate images that already cover the same role unless regeneration is clearly justified. contentBlocks is an array of {type: heading|paragraph|quote|image, content, mediaRole}; image blocks must use a controlled role. Include image blocks where they genuinely explain a value, difference or distinctive design detail, not as decoration. SEO title max 60 characters, SEO description 150–160 characters, title max 90 characters. Use the primary keyword naturally once in the title or opening, use secondary keywords only where useful, and avoid keyword stuffing or generic luxury language.${fullAudit ? ' This is a full listing audit: explicitly compare the copy, SEO, custom fields, story blocks and every supplied image, then identify the highest-value missing image roles.' : ''}`
    const userText = `Current listing:\n${JSON.stringify(productContext)}\n\nCreative direction: ${direction || (fullAudit ? 'Audit the complete listing and normalize it without changing factual meaning.' : 'Refine the current story without changing factual meaning.')}\nTone: ${text(brief.tone,80) || 'Editorial, direct, emotionally precise'}\nTarget search intent: ${text(brief.searchIntent,300) || 'Football memory, personalized jersey and designer-led sportswear'}\nPrimary keyword: ${text(brief.primaryKeyword || brief.primary_keyword,100) || 'personalized football jersey'}\nSecondary keywords: ${list(brief.secondaryKeywords || brief.secondary_keywords,10).join(', ') || 'custom football jersey, football memory gift'}\nVerified value points: ${list(brief.valueProps || brief.value_props,6).join(' | ') || 'Use only facts visible in the listing.'}\nVerified differentiators: ${list(brief.differentiators,6).join(' | ') || 'Designer-locked composition with controlled personalization.'}\n${fullAudit ? 'Read every text field and every supplied image. Report what is missing or inconsistent, then create one coherent, detailed product story and a practical image plan for the highest-value missing controlled roles.' : 'Create one coherent, detailed product story. Explain the visual idea, the customer value, what is different about this design and exactly what can be personalized.'}\nUse image blocks only for controlled roles; never invent an image URL.`
    const content = [{ type:'text', text:userText }]
    // Keep the reference URL available to the vision-capable model, but never
    // copy it into public listing text or the returned suggestion.
    const referenceImage = safeImageReference(product.image, origin)
    // Always lead with the listing's primary image. It is the source of truth
    // for the artwork even when additional editorial media exists. De-dupe by
    // URL so a primary image that is also in the media array is only reviewed
    // once, while still allowing the model to inspect up to ten public images.
    const references = [...new Map([
      ...(referenceImage ? [{ url:referenceImage, role:'primary', alt:'Primary listing reference', type:'IMAGE' }] : []),
      ...mediaImages
    ].map(item => [item.url, item]).filter(([url]) => url)).values()].slice(0, 4)
    for (const image of references) content.push({ type:'image_url', image_url:{ url:image.url, detail:'low' } })
    const headers = { Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }
    let visionUsed = references.length > 0
    let upstream = await fetch(apiUrl, {
      method:'POST', headers,
      body:JSON.stringify({ model, temperature:0.65, response_format:{ type:'json_object' }, messages:[{ role:'system', content:system }, { role:'user', content }] }),
      signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    let payload = await upstream.json().catch(() => ({}))

    // 1. If 401 Unauthorized using default apikey.fan, try official OpenAI endpoint in case an official key was provided
    if (upstream.status === 401 && base.includes('apikey.fan') && !process.env.AI_TEXT_API_URL && !process.env.OPENAI_BASE_URL) {
      const openAiUrl = 'https://api.openai.com/v1/chat/completions'
      const altUpstream = await fetch(openAiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, response_format:{ type:'json_object' }, messages:[{ role:'system', content:system }, { role:'user', content }] }),
        signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      }).catch(() => null)
      if (altUpstream && (altUpstream.ok || altUpstream.status !== 401)) {
        upstream = altUpstream
        apiUrl = openAiUrl
        payload = await upstream.json().catch(() => ({}))
      }
    }

    // 2. Some OpenAI-compatible gateways do not expose response_format. Retry with the same content without it.
    if (!upstream.ok && [400,415,422].includes(upstream.status)) {
      upstream = await fetch(apiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, messages:[{ role:'system', content:system }, { role:'user', content }] }),
        signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      payload = await upstream.json().catch(() => ({}))
    }

    // 3. If model was rejected (404 or model error message) and model is not gpt-4o, try gpt-4o fallback
    if (!upstream.ok && (upstream.status === 404 || /model/i.test(String(payload.error?.message || payload.message || '')))) {
      model = 'gpt-4o'
      upstream = await fetch(apiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, messages:[{ role:'system', content:system }, { role:'user', content:visionUsed ? content : userText }] }),
        signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      payload = await upstream.json().catch(() => ({}))
    }

    // 4. If multimodal vision was rejected or failed (e.g. gateway cannot fetch Supabase image URLs),
    // fallback to text-only mode so the admin receives a complete listing copy and SEO audit rather than failing.
    if (!upstream.ok && visionUsed) {
      visionUsed = false
      upstream = await fetch(apiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, messages:[{ role:'system', content:system }, { role:'user', content:userText }] }),
        signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      payload = await upstream.json().catch(() => ({}))
    }

    if (!upstream.ok) {
      if (upstream.status === 401) {
        return json(response, 401, { error:'AI API Key is invalid or expired. Check AI_TEXT_API_KEY in Vercel or server settings.' })
      }
      if (upstream.status === 429) {
        return json(response, 429, { error:'AI provider credit quota exceeded or rate limit reached. Check your API provider balance.' })
      }
      return json(response, upstream.status, { error:payload.error?.message || payload.message || 'AI provider rejected the writing request.' })
    }

    const raw = extractJson(payload.choices?.[0]?.message?.content)
    const suggestion = normalizeSuggestion(raw, language)
    // Never trust a model-generated count; report the exact number of image
    // references that this request actually sent to the vision model.
    suggestion.audit.reviewedImageCount = visionUsed ? references.length : 0
    if (!visionUsed && references.length > 0 && !suggestion.audit.imageGaps.length) {
      suggestion.audit.imageGaps.push({ role:'primary', reason:'Image inspection unavailable from current AI provider; story and SEO audited from listing data.' })
    }
    if (!suggestion.title || !suggestion.description) return json(response, 502, { error:'AI returned an incomplete listing draft. Try a more specific direction.' })
    return json(response, 200, { suggestion, model, mode:fullAudit ? 'FULL_AUDIT' : 'COPY_DRAFT' })
  } catch (error) {
    if (isTimeoutError(error)) return json(response, 504, { error:'The AI provider took too long to finish. Retry once; if it repeats, use fewer reference images or a shorter direction.' })
    return json(response, error?.status || 500, { error:error instanceof Error ? error.message : 'AI listing copy failed.' })
  }
}
