import { createClient } from '@supabase/supabase-js'

const json = (response, status, body) => response.status(status).setHeader('Content-Type', 'application/json').json(body)
const text = (value, limit) => String(value || '').trim().slice(0, limit)
const list = (value, limit = 12) => Array.isArray(value) ? value.map(item => text(item, 80)).filter(Boolean).slice(0, limit) : []

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
  const blocks = Array.isArray(raw.contentBlocks) ? raw.contentBlocks.slice(0, 8).map((block, index) => ({
    id:`ai-block-${Date.now()}-${index}`,
    type:['heading','paragraph','quote'].includes(block?.type) ? block.type : 'paragraph',
    content:text(block?.content, block?.type === 'heading' ? 140 : 900)
  })).filter(block => block.content) : []
  return {
    title:text(raw.title, 120),
    subtitle:text(raw.subtitle, 180),
    description:text(raw.description || raw.story, 5000),
    seoTitle:text(raw.seoTitle, 70),
    seoDescription:text(raw.seoDescription, 170),
    keywords:list(raw.keywords, 15),
    tags:list(raw.tags, 15).map(item => item.toLowerCase().replace(/\s+/g, '-')),
    contentBlocks:blocks,
    language,
    generatedAt:new Date().toISOString()
  }
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
      customerEditableFields:list(product.customFields), mediaNotes:Array.isArray(product.media) ? product.media.slice(0,8).map(item => ({ type:text(item.type,20), alt:text(item.alt,240) })) : []
    }
    const system = `You are the senior product editor for Extra Time, a designer-led football apparel studio. Write specific, credible commerce copy grounded in the supplied design story. Never invent teams, players, sponsors, materials, manufacturing claims, awards or licensing. Keep typography/composition/effects designer-locked; customer customization is limited to the supplied editable fields. Write in ${language}. Return only valid JSON with keys title, subtitle, description, seoTitle, seoDescription, keywords, tags, contentBlocks. contentBlocks is an array of {type: heading|paragraph|quote, content}. SEO title max 60 characters, SEO description 150–160 characters, title max 90 characters. Avoid keyword stuffing and generic luxury language.`
    const userText = `Current listing:\n${JSON.stringify(productContext)}\n\nCreative direction: ${direction || 'Refine the current story without changing factual meaning.'}\nTone: ${text(brief.tone,80) || 'Editorial, direct, emotionally precise'}\nTarget search intent: ${text(brief.searchIntent,300) || 'Football memory, personalized jersey and designer-led sportswear'}\nCreate one coherent draft. The long description should tell the story behind the visual design and explain what can be personalized.`
    const content = [{ type:'text', text:userText }]
    const referenceImage = text(product.image, 2000)
    if (/^https:\/\//i.test(referenceImage)) content.push({ type:'image_url', image_url:{ url:referenceImage, detail:'low' } })
    const headers = { Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' }
    let upstream = await fetch(apiUrl, {
      method:'POST', headers,
      body:JSON.stringify({ model, temperature:0.65, response_format:{ type:'json_object' }, messages:[{ role:'system', content:system }, { role:'user', content }] })
    })
    let payload = await upstream.json().catch(() => ({}))
    // Some OpenAI-compatible gateways do not expose response_format or vision on
    // every text model. Retry once with the same guarded brief as plain text.
    if (!upstream.ok && [400,415,422].includes(upstream.status)) {
      upstream = await fetch(apiUrl, {
        method:'POST', headers,
        body:JSON.stringify({ model, temperature:0.65, messages:[{ role:'system', content:system }, { role:'user', content:userText }] })
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
