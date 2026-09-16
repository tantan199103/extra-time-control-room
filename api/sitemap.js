import { createClient } from '@supabase/supabase-js'

const escapeXml = value => String(value).replace(/[<>&'"]/g, character => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[character]))

export default async function handler(request,response) {
  if(request.method !== 'GET') return response.status(405).send('Method not allowed')
  const origin=(process.env.SITE_URL || 'https://extra-time-control-room.vercel.app').replace(/\/$/,'')
  const urls=[{path:'/',priority:'1.0'},{path:'/shop',priority:'0.9'},{path:'/vault',priority:'0.6'}]
  const supabaseUrl=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if(supabaseUrl && key){
    const client=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}})
    const [{data:products},{data:collections}]=await Promise.all([
      client.from('pod_products').select('handle,updated_at').eq('status','PUBLISHED'),
      client.from('pod_collections').select('handle,updated_at').eq('status','PUBLISHED')
    ])
    for(const product of products || []) urls.push({path:`/product/${encodeURIComponent(product.handle)}`,lastmod:product.updated_at,priority:'0.8'})
    for(const collection of collections || []) urls.push({path:`/collection/${encodeURIComponent(collection.handle)}`,lastmod:collection.updated_at,priority:'0.7'})
  }
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item=>`  <url><loc>${escapeXml(origin+item.path)}</loc>${item.lastmod?`<lastmod>${escapeXml(new Date(item.lastmod).toISOString())}</lastmod>`:''}<priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`
  response.setHeader('Content-Type','application/xml; charset=utf-8')
  response.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400')
  return response.status(200).send(body)
}
