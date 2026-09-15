import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { buildCustomizationPayload, getTemplate, renderTemplateSvg, validateCustomization } from '../src/template-engine.js'

const json = (response, status, body) => response.status(status).setHeader('Content-Type', 'application/json').json(body)

export default async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'POST artwork payloads only.' })
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {}
    const template = getTemplate(body.templateId)
    const values = body.values || body.customization || {}
    const errors = validateCustomization(template, values)
    if (Object.keys(errors).length) return json(response, 422, { error: 'Customization needs attention.', fields: errors })
    const payload = buildCustomizationPayload(template, values)
    const renderId = body.renderId || `render-${Date.now()}`
    const [front, back] = await Promise.all(['front', 'back'].map(view => sharp(Buffer.from(renderTemplateSvg(template, values, view, { width:3000, height:3600 }))).png({ compressionLevel:9 }).toBuffer()))
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let files = {
      front: `data:image/png;base64,${front.toString('base64')}`,
      back: `data:image/png;base64,${back.toString('base64')}`
    }
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey)
      const bucket = process.env.SUPABASE_ARTWORK_BUCKET || 'artwork'
      const uploads = await Promise.all([
        supabase.storage.from(bucket).upload(`${renderId}/front.png`, front, { contentType:'image/png', upsert:true }),
        supabase.storage.from(bucket).upload(`${renderId}/back.png`, back, { contentType:'image/png', upsert:true })
      ])
      const uploadError = uploads.find(item => item.error)?.error
      if (uploadError) return json(response, 502, { error: uploadError.message })
      files = {
        front: supabase.storage.from(bucket).getPublicUrl(`${renderId}/front.png`).data.publicUrl,
        back: supabase.storage.from(bucket).getPublicUrl(`${renderId}/back.png`).data.publicUrl
      }
      await supabase.from('render_jobs').upsert({ id:renderId, template_id:template.id, template_version:template.version, payload, status:'COMPLETED', front_url:files.front, back_url:files.back, completed_at:new Date().toISOString() })
    }
    return json(response, 200, { renderId, templateId:template.id, templateVersion:template.version, payload, ...files })
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : 'Artwork render failed.' })
  }
}
