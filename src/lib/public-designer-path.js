/**
 * Canonical public paths for designer assets.
 *
 * Legacy provider aliases may still exist in private catalogue rows while a
 * deployment is being migrated. They must never be copied into SEO bootstrap
 * HTML or customer-facing links. Provenance stays in the private import/audit
 * records; this helper only normalizes a public route.
 */

const LEGACY_DESIGNER_PATH = /^\/designer\/(?:owayo|boombah)(?=\/|$)/i

export function canonicalDesignerPath(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
    .replace(/^\/designer\/owayo(?=\/|$)/i, '/designer/studio')
    .replace(/^\/designer\/boombah(?=\/|$)/i, '/designer/teamwear')
}

export function isLegacyDesignerPath(value = '') {
  return LEGACY_DESIGNER_PATH.test(String(value || '').trim())
}

export function canonicalDesignerProvider(value = '') {
  return /^(?:teamwear|boombah)$/i.test(String(value || '').trim()) ? 'teamwear' : 'studio'
}
