import { createClient } from '@supabase/supabase-js'
import { LEAGUE_TAXONOMY, leaguePath, teamPath } from '../src/lib/league-taxonomy.js'

const escapeXml = value => String(value).replace(/[<>&'"]/g, character => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[character]))

export default async function handler(request,response) {
  if(request.method !== 'GET') return response.status(405).send('Method not allowed')
  const configuredOrigin = process.env.SITE_URL || 'https://www.jersevo.com'
  const origin = new URL(configuredOrigin).origin
  const urls=[
    {path:'/',priority:'1.0'},
    {path:'/shop',priority:'0.9'},
    {path:'/about',priority:'0.7'},
    {path:'/membership',priority:'0.7'},
    {path:'/vault',priority:'0.6'},
    {path:'/journal',priority:'0.5'},
    {path:'/shipping',priority:'0.5'},
    {path:'/returns',priority:'0.5'},
    {path:'/warranty',priority:'0.5'},
    {path:'/privacy',priority:'0.4'},
    {path:'/terms',priority:'0.4'},
    {path:'/accessibility',priority:'0.3'}
  ]
  for(const league of LEAGUE_TAXONOMY){
    urls.push({path:leaguePath(league),priority:'0.7'})
    for(const team of league.teams) urls.push({path:teamPath(league.key,team),priority:'0.6'})
  }
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
  const unique = [...new Map(urls.map(item => [item.path, item])).values()]
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(item=>`  <url><loc>${escapeXml(origin+item.path)}</loc>${item.lastmod?`<lastmod>${escapeXml(new Date(item.lastmod).toISOString())}</lastmod>`:''}<changefreq>${item.changefreq || (item.path.startsWith('/product/') ? 'weekly' : 'monthly')}</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`
  response.setHeader('Content-Type','application/xml; charset=utf-8')
  response.setHeader('X-Robots-Tag','noindex')
  response.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400')
  return response.status(200).send(body)
}
