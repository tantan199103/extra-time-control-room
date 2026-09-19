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

const UPSTREAM_TIMEOUT_MS = 55000

async function requireAdmin(request) {
  const token = String(request.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw Object.assign(new Error('Admin sign-in is required.'), { status:401 })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw Object.assign(new Error('Supabase server settings are missing.'), { status:503 })
  const client = createClient(url, anonKey, { global:{ headers:{ Authorization:`Bearer ${token}` } }, auth:{ persistSession:false, autoRefreshToken:false } })
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
    const base = (process.env.AI_TEXT_API_URL || process.env.OPENAI_BASE_URL || 'https://api.apikey.fan/v1').replace(/\/$/, '')
    const apiUrl = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
    const model = process.env.AI_TEXT_MODEL || 'gpt-4.1-mini'
    if (!apiKey) return json(response, 503, { error:'AI writing is not connected. Add AI_TEXT_API_KEY in the server environment.' })

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
      mediaRoles:Array.isArray(product.media) ? product.media.slice(0,12).map(item => text(item.role || item.mediaRole,60)).filter(Boolean) : [],
      mediaNotes:Array.isArray(product.media) ? product.media.slice(0,8).map(item => ({ type:text(item.type,20), alt:text(item.alt,240), role:text(item.role || item.mediaRole,60) })) : [],
      existingStoryBlocks:safeStoryBlocks(product.contentBlocks)
    }
    const system = `You are the senior product editor for Extra Time, a designer-led football apparel studio. Write specific, credible commerce copy grounded in the supplied design story. Never invent teams, players, sponsors, materials, manufacturing claims, awards, licensing, shipping promises or reviews. Keep typography/composition/effects designer-locked; customer customization is limited to the supplied editable fields. Remove URLs, source references and AI-provider references. Write in ${language}. Return only valid JSON with keys title, subtitle, description, seoTitle, seoDescription, primaryKeyword, secondaryKeywords, keywords, tags, valueProps, differentiators, imagePlan, contentBlocks. imagePlan is an array of {role, caption} using only supplied media roles; use model-detail for a verified design detail, model-street or model-matchday for context/value, and custom-guide for the personalization explanation when those roles exist. contentBlocks is an array of {type: heading|paragraph|quote|image, content, mediaRole}; image blocks must use an existing media role. Include image blocks where they genuinely explain a value, difference or distinctive design detail, not as decoration. SEO title max 60 characters, SEO description 150–160 characters, title max 90 characters. Use the primary keyword naturally once in the title or opening, use secondary keywords only where useful, and avoid keyword stuffing or generic luxury language.`
    const userText = `Current listing:\n${JSON.stringify(productContext)}\n\nCreative direction: ${direction || 'Refine the current story without changing factual meaning.'}\nTone: ${text(brief.tone,80) || 'Editorial, direct, emotionally precise'}\nTarget search intent: ${text(brief.searchIntent,300) || 'Football memory, personalized jersey and designer-led sportswear'}\nPrimary keyword: ${text(brief.primaryKeyword || brief.primary_keyword,100) || 'personalized football jersey'}\nSecondary keywords: ${list(brief.secondaryKeywords || brief.secondary_keywords,10).join(', ') || 'custom football jersey, football memory gift'}\nVerified value points: ${list(brief.valueProps || brief.value_props,6).join(' | ') || 'Use only facts visible in the listing.'}\nVerified differentiators: ${list(brief.differentiators,6).join(' | ') || 'Designer-locked composition with controlled personalization.'}\nCreate one coherent, detailed product story. Explain the visual idea, the customer value, what is different about this design and exactly what can be personalized. Use image blocks only for existing media roles; never invent an image URL.`
    const content = [{ type:'text', text:userText }]
    // Keep the reference URL available to the vision-capable model, but never
    // copy it into public listing text or the returned suggestion.
    const referenceImage = String(product.image || '').trim().slice(0, 2000)
    if (/^https:\/\//i.test(referenceImage)) content.push({ type:'image_url', image_url:{ url:referenceImage, detail:'low' } })
    const headers = { Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }
    let upstream = await fetch(apiUrl, {
      method:'POST', headers,
      body:JSON.stringify({ model, temperature:0.65, response_format:{ type:'json_object' }, messages:[{ role:'system', content:system }, { role:'user', content }] }),
      signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
    let payload = await upstream.json().catch(() => ({}))
    // Some OpenAI-compatible gateways do not expose response_format or vision on
    // every text model. Retry once with the same guarded brief as plain text.
    if (!upstream.ok && [400,415,422].includes(upstream.status)) {
      upstream = await fetch(apiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, messages:[{ role:'system', content:system }, { role:'user', content:userText }] }),
        signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      })
      payload = await upstream.json().catch(() => ({}))
    }
    if (!upstream.ok) return json(response, upstream.status, { error:payload.error?.message || payload.message || 'AI provider rejected the writing request.' })
    const raw = extractJson(payload.choices?.[0]?.message?.content)
    const suggestion = normalizeSuggestion(raw, language)
    if (!suggestion.title || !suggestion.description) return json(response, 502, { error:'AI returned an incomplete listing draft. Try a more specific direction.' })
    return json(response, 200, { suggestion, model })
  } catch (error) {
    return json(response, error?.status || 500, { error:error instanceof Error ? error.message : 'AI listing copy failed.' })
  }
}
