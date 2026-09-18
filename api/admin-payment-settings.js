import { enforceSameOrigin, handleApiError, readBody, requireAdmin, safeText, sendJson, serverSupabase } from './_security.js'
import { normalizePaymentSettings, paymentServerReadiness, validatePaymentSettings } from '../src/lib/payment-config.js'

const settingsKey = 'payment'

async function readSettings(client) {
  const { data, error } = await client.from('pod_store_settings').select('key,value,updated_at').eq('key', settingsKey).maybeSingle()
  if (error) throw error
  return normalizePaymentSettings(data?.value || {})
}

function readiness(settings) {
  return paymentServerReadiness(settings, process.env)
}

export default async function handler(request, response) {
  try {
    enforceSameOrigin(request)
    const client = serverSupabase()
    const admin = await requireAdmin(request, client)
    if (request.method === 'GET') {
      const settings = await readSettings(client)
      return sendJson(response, 200, { settings, readiness: readiness(settings) })
    }
    if (request.method !== 'PUT' && request.method !== 'PATCH') return sendJson(response, 405, { error: 'GET or PUT payment settings only.' })
    const body = readBody(request, 12000)
    const validation = validatePaymentSettings(body.settings || body)
    if (!validation.ok) throw Object.assign(new Error(validation.errors.join(' ')), { status: 422 })
    const value = validation.settings
    const { data, error } = await client.from('pod_store_settings').upsert({ key: settingsKey, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key,value,updated_at').single()
    if (error) throw error
    await client.from('pod_audit_logs').insert({ actor_id: admin.id, entity_type: 'store-settings', entity_id: settingsKey, action: 'PAYMENT_SETTINGS_UPDATE', snapshot: { ...value, paypal: { clientId: value.paypal.clientId ? '[configured]' : '' }, paddle: { clientToken: value.paddle.clientToken ? '[configured]' : '', priceMap: Object.keys(value.paddle.priceMap).length } } })
    return sendJson(response, 200, { settings: normalizePaymentSettings(data.value), readiness: readiness(data.value) })
  } catch (error) {
    return handleApiError(response, error, 'Payment settings could not be saved.')
  }
}
