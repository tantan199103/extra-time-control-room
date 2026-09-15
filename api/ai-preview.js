import { products } from '../src/data.js'

const json = (response, status, body) => response.status(status).setHeader('Content-Type', 'application/json').json(body)
const listingReferences = { venom:'/assets/venom-mockup-front.webp' }

function getListing(productId) {
  if (productId === 'venom') return { id:'venom', name:'VENOM', story:'Pressure becomes identity.', image:listingReferences.venom, customFields:['name','number','teamCity','year','color'] }
  return products.find(item => item.id === productId) || products.find(item => item.id === 'touchline') || products[0]
}

function getOrigin(request) {
  const forwarded = request.headers?.['x-forwarded-host'] || request.headers?.host || 'localhost:5173'
  const protocol = request.headers?.['x-forwarded-proto'] || (forwarded.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${forwarded}`
}

async function fetchReference(request, listing) {
  const referenceUrl = new URL(listing.image, getOrigin(request)).toString()
  const referenceResponse = await fetch(referenceUrl)
  if (!referenceResponse.ok) throw new Error(`Listing reference could not be loaded (${referenceResponse.status}).`)
  const bytes = await referenceResponse.arrayBuffer()
  const contentType = referenceResponse.headers.get('content-type') || 'image/webp'
  return { blob:new Blob([bytes], { type:contentType }), url:referenceUrl }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error:'POST AI preview requests only.' })
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {}
    const listing = getListing(String(body.productId || ''))
    const prompt = String(body.prompt || '').trim().slice(0, 1200)
    if (!prompt) return json(response, 422, { error:'Write a prompt first.' })
    const apiKey = process.env.AI_IMAGE_API_KEY || process.env.OPENAI_API_KEY
    const apiUrl = process.env.AI_IMAGE_API_URL || `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/images/edits`
    const model = process.env.AI_IMAGE_MODEL || 'gpt-image-2'
    if (!apiKey) return json(response, 503, { error:'AI preview is not connected. Add AI_IMAGE_API_KEY in the server environment.' })
    const reference = await fetchReference(request, listing)
    const guardedPrompt = `Use the attached listing image as the exact reference for ${listing.name}. Preserve the jersey silhouette, camera angle, background, logos, texture, seams, lighting and overall identity unless the customer explicitly asks for a change. Do not invent sponsors or brands. This is a visual preview only, not a production print file. Customer request: ${prompt}`
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', guardedPrompt)
    form.append('image[]', reference.blob, `${listing.id}-listing-reference.webp`)
    form.append('size', 'auto')
    form.append('quality', process.env.AI_IMAGE_QUALITY || 'medium')
    const upstream = await fetch(apiUrl, { method:'POST', headers:{ Authorization:`Bearer ${apiKey}` }, body:form })
    const result = await upstream.json().catch(() => ({}))
    if (!upstream.ok) return json(response, upstream.status, { error:result.error?.message || result.message || 'AI provider rejected the preview request.' })
    const generated = result.data?.[0]
    const imageUrl = generated?.b64_json ? `data:image/png;base64,${generated.b64_json}` : generated?.url
    if (!imageUrl) return json(response, 502, { error:'AI provider returned no preview image.' })
    return json(response, 200, { productId:listing.id, model, imageUrl, referenceUrl:reference.url, prompt })
  } catch (error) {
    return json(response, 500, { error:error instanceof Error ? error.message : 'AI preview failed.' })
  }
}
