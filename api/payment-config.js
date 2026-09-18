import { handleApiError, sendJson, serverSupabase } from './_security.js'
import { normalizePaymentSettings, paymentPublicConfig } from '../src/lib/payment-config.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'GET payment configuration only.' })
  try {
    const client = serverSupabase()
    const { data, error } = await client.from('pod_store_settings').select('value').eq('key', 'payment').maybeSingle()
    if (error) throw error
    return sendJson(response, 200, paymentPublicConfig(normalizePaymentSettings(data?.value || {})))
  } catch (error) {
    return handleApiError(response, error, 'Payment configuration is unavailable.')
  }
}
