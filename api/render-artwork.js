import { sendJson } from './_security.js'

export default async function handler(request, response) {
  response.setHeader('Allow', 'POST')
  return sendJson(response, 410, {
    error:'The legacy template renderer has been retired. Use listing-owned media, variations and custom fields.'
  })
}
