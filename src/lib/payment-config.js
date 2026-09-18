export const PAYMENT_PROVIDERS = ['NONE', 'PAYPAL', 'PADDLE']
export const PAYMENT_ENVIRONMENTS = ['sandbox', 'live']
export const PAYMENT_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD']

const text = (value, max = 240) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)

export const DEFAULT_PAYMENT_SETTINGS = Object.freeze({
  schemaVersion: '1.0',
  enabled: false,
  provider: 'NONE',
  environment: 'sandbox',
  currency: 'USD',
  paypal: { clientId: '' },
  paddle: { clientToken: '', priceMap: {} }
})

export function normalizePaymentSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const provider = PAYMENT_PROVIDERS.includes(String(source.provider || '').toUpperCase()) ? String(source.provider).toUpperCase() : 'NONE'
  const environment = PAYMENT_ENVIRONMENTS.includes(String(source.environment || '').toLowerCase()) ? String(source.environment).toLowerCase() : 'sandbox'
  const currency = PAYMENT_CURRENCIES.includes(String(source.currency || '').toUpperCase()) ? String(source.currency).toUpperCase() : 'USD'
  const priceMapSource = source.paddle?.priceMap && typeof source.paddle.priceMap === 'object' && !Array.isArray(source.paddle.priceMap) ? source.paddle.priceMap : {}
  const priceMap = Object.fromEntries(Object.entries(priceMapSource).slice(0, 500).map(([key, value]) => [text(key, 180), text(value, 180)]).filter(([key, value]) => key && /^pri_[a-zA-Z0-9_-]+$/.test(value)))
  return {
    schemaVersion: '1.0',
    enabled: Boolean(source.enabled) && provider !== 'NONE',
    provider,
    environment,
    currency,
    paypal: { clientId: text(source.paypal?.clientId, 240) },
    paddle: { clientToken: text(source.paddle?.clientToken, 240), priceMap }
  }
}

export function validatePaymentSettings(input = {}) {
  const settings = normalizePaymentSettings(input)
  const errors = []
  if (!PAYMENT_PROVIDERS.includes(settings.provider)) errors.push('Choose PayPal, Paddle or disabled.')
  if (!PAYMENT_ENVIRONMENTS.includes(settings.environment)) errors.push('Choose sandbox or live mode.')
  if (!PAYMENT_CURRENCIES.includes(settings.currency)) errors.push('Choose a supported store currency.')
  if (settings.provider === 'PAYPAL' && settings.enabled && !settings.paypal.clientId) errors.push('PayPal client ID is required when PayPal is enabled.')
  if (settings.provider === 'PADDLE' && settings.enabled && !settings.paddle.clientToken) errors.push('Paddle client token is required when Paddle is enabled.')
  if (settings.provider === 'PADDLE' && settings.enabled && !Object.keys(settings.paddle.priceMap).length) errors.push('Paddle needs at least one price ID mapping before checkout can be enabled.')
  return { settings, errors, ok: errors.length === 0 }
}

export function paymentServerReadiness(settings, env = {}) {
  const normalized = normalizePaymentSettings(settings)
  if (!normalized.enabled || normalized.provider === 'NONE') return { ready: false, missing: ['Enable a payment provider.'] }
  if (normalized.provider === 'PAYPAL') {
    const missing = ['PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'].filter(key => !text(env[key], 500))
    return { ready: missing.length === 0, missing }
  }
  const missing = ['PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET'].filter(key => !text(env[key], 500))
  return { ready: missing.length === 0, missing }
}

export function paymentPublicConfig(settings = {}) {
  const normalized = normalizePaymentSettings(settings)
  return {
    enabled: normalized.enabled,
    provider: normalized.provider,
    environment: normalized.environment,
    currency: normalized.currency,
    publicKey: normalized.provider === 'PAYPAL' ? normalized.paypal.clientId : normalized.provider === 'PADDLE' ? normalized.paddle.clientToken : '',
    priceMap: normalized.provider === 'PADDLE' ? normalized.paddle.priceMap : {}
  }
}
