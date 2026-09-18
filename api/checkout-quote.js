import { buildCheckoutQuote } from './_checkout.js'
import { consumeQuota, customerSession, enforceSameOrigin, handleApiError, readBody, requestIdentity, sendJson, serverSupabase } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST checkout quote requests only.' })
  try {
    enforceSameOrigin(request)
    const body = readBody(request, 60000)
    const client = serverSupabase()
    const sessionId = customerSession(body)
    await consumeQuota(client, 'checkout-quote', requestIdentity(request, sessionId))
    await client.rpc('pod_expire_pending_orders').catch(() => {})
    const quote = await buildCheckoutQuote(request, body, client)
    return sendJson(response, 200, { quote })
  } catch (error) {
    return handleApiError(response, error, 'Checkout quote could not be calculated.')
  }
}
