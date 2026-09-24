// The authoritative sitemap is generated atomically with the deployable HTML.
// Keep the legacy API URL working without advertising unbuilt database routes.
export default function handler(request,response) {
  if (!['GET','HEAD'].includes(request.method)) return response.status(405).send('Method not allowed')
  response.setHeader('Location','https://www.jersevo.com/sitemap.xml')
  response.setHeader('X-Robots-Tag','noindex')
  return response.status(308).send('')
}
