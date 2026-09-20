import sharp from 'sharp'
import { normalizePreviewRegion } from '../src/lib/customization-ai.js'

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

export function logoRegionPixels(width, height, region, padding = 0) {
  const normalized = normalizePreviewRegion(region)
  if (!normalized || !width || !height) return null
  const left = Math.floor(width * normalized.x / 100) - padding
  const top = Math.floor(height * normalized.y / 100) - padding
  const right = Math.ceil(width * (normalized.x + normalized.width) / 100) + padding
  const bottom = Math.ceil(height * (normalized.y + normalized.height) / 100) + padding
  return {
    left: clamp(left, 0, Math.max(0, width - 1)),
    top: clamp(top, 0, Math.max(0, height - 1)),
    right: clamp(right, 1, width),
    bottom: clamp(bottom, 1, height)
  }
}

async function normalizeReference(bytes) {
  if (!bytes?.length) throw Object.assign(new Error('The listing reference image is empty.'), { status:422 })
  const normalized = await sharp(bytes).rotate().png().toBuffer({ resolveWithObject:true })
  if (!normalized.info.width || !normalized.info.height) throw Object.assign(new Error('The listing reference dimensions could not be read.'), { status:422 })
  return normalized
}

async function normalizeLogo(bytes) {
  if (!bytes?.length) throw Object.assign(new Error('The uploaded logo is empty.'), { status:422 })
  let image
  try {
    image = await sharp(bytes)
      .rotate()
      .ensureAlpha()
      .trim({ background:{ r:0, g:0, b:0, alpha:0 } })
      .png()
      .toBuffer({ resolveWithObject:true })
  } catch {
    throw Object.assign(new Error('The uploaded logo could not be read.'), { status:422 })
  }
  if (!image.info.width || !image.info.height) throw Object.assign(new Error('The uploaded logo dimensions could not be read.'), { status:422 })
  return image
}

/**
 * Place the customer's original logo inside a designer-owned region. This is
 * deliberately deterministic: it is the production-safe fallback and keeps
 * every non-logo pixel from the listing image intact.
 */
export async function compositeLogo(referenceBytes, logoBytes, region, options = {}) {
  const reference = await normalizeReference(referenceBytes)
  const logo = await normalizeLogo(logoBytes)
  const slot = logoRegionPixels(reference.info.width, reference.info.height, region)
  if (!slot || slot.right <= slot.left || slot.bottom <= slot.top) {
    throw Object.assign(new Error('The listing has no usable logo area.'), { status:422 })
  }

  const inset = Math.max(1, Math.round(Math.min(slot.right - slot.left, slot.bottom - slot.top) * 0.08))
  const slotWidth = Math.max(1, slot.right - slot.left - inset * 2)
  const slotHeight = Math.max(1, slot.bottom - slot.top - inset * 2)
  const overlay = await sharp(logo.data)
    .resize({ width:slotWidth, height:slotHeight, fit:'contain', background:{ r:0, g:0, b:0, alpha:0 } })
    .png()
    .toBuffer({ resolveWithObject:true })
  const left = slot.left + Math.floor((slot.right - slot.left - overlay.info.width) / 2)
  const top = slot.top + Math.floor((slot.bottom - slot.top - overlay.info.height) / 2)
  const bytes = await sharp(reference.data)
    .composite([{ input:overlay.data, left, top, blend:'over' }])
    .png()
    .toBuffer()
  return {
    bytes,
    type:'image/png',
    dimensions:{ width:reference.info.width, height:reference.info.height },
    slot,
    logo:{ width:logo.info.width, height:logo.info.height, hasAlpha:Boolean(logo.info.hasAlpha) },
    treatment:String(options.treatment || 'EXACT').toUpperCase()
  }
}

export async function logoMetadata(bytes) {
  const logo = await normalizeLogo(bytes)
  return { width:logo.info.width, height:logo.info.height, hasAlpha:Boolean(logo.info.hasAlpha), format:logo.info.format || 'unknown' }
}
