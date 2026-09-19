import { createClient } from '@supabase/supabase-js'
import { LEAGUE_TAXONOMY, leaguePath, teamPath, normalizeTeamSlug } from '../src/lib/league-taxonomy.js'

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
  const supabaseUrl=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if(supabaseUrl && key){
    const client=createClient(supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false}})
    let products = []
    let productQuery = await client.from('pod_products').select('handle,updated_at,title,description,taxonomy,tags,seo_status,seo').eq('status','PUBLISHED').eq('seo_status','INDEXABLE').limit(5000)
    // Keep the endpoint resilient while a project is applying the gate
    // migration. Never fall back to all published rows after the column exists.
    if (productQuery.error) {
      const legacy = await client.from('pod_products').select('handle,updated_at,title,description,taxonomy,tags,seo').eq('status','PUBLISHED').limit(5000)
      products = (legacy.data || []).filter(row => String(row.seo?.status || '').toUpperCase() === 'INDEXABLE')
    } else products = productQuery.data || []
    const collectionQuery = await client.from('pod_collections').select('handle,updated_at,seo').eq('status','PUBLISHED').limit(1000)
    const collections = (collectionQuery.data || []).filter(row => String(row.seo?.status || '').toUpperCase() === 'INDEXABLE')
    for(const product of products) urls.push({path:`/product/${encodeURIComponent(product.handle)}`,lastmod:product.updated_at,priority:'0.8'})
    for(const collection of collections) urls.push({path:`/collection/${encodeURIComponent(collection.handle)}`,lastmod:collection.updated_at,priority:'0.7'})

    // Taxonomy pages are useful only when they lead to a real, indexable
    // catalogue. Empty and near-empty landing pages stay reachable in the UI
    // but are intentionally omitted from the XML sitemap.
    const counts = new Map()
    for (const product of products) {
      const league = String(product.taxonomy?.league || '').toLowerCase()
      if (!league) continue
      counts.set(`league:${league}`, (counts.get(`league:${league}`) || 0) + 1)
      const team = normalizeTeamSlug(league, product.taxonomy?.team || '')
      if (team) counts.set(`team:${league}/${team}`, (counts.get(`team:${league}/${team}`) || 0) + 1)
    }
    for(const league of LEAGUE_TAXONOMY){
      if ((counts.get(`league:${league.key}`) || 0) >= 6) urls.push({path:leaguePath(league),priority:'0.7'})
      for(const team of league.teams) {
        if ((counts.get(`team:${league.key}/${team.slug}`) || 0) >= 6) urls.push({path:teamPath(league.key,team),priority:'0.6'})
      }
    }
  }
  const unique = [...new Map(urls.map(item => [item.path, item])).values()]
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(item=>`  <url><loc>${escapeXml(origin+item.path)}</loc>${item.lastmod?`<lastmod>${escapeXml(new Date(item.lastmod).toISOString())}</lastmod>`:''}<changefreq>${item.changefreq || (item.path.startsWith('/product/') ? 'weekly' : 'monthly')}</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`
  response.setHeader('Content-Type','application/xml; charset=utf-8')
  response.setHeader('X-Robots-Tag','noindex')
  response.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400')
  return response.status(200).send(body)
}
