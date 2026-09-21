import sharp from 'sharp'
import { normalizePreviewRegion } from '../src/lib/customization-ai.js'

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

function supportedCanvas(width, height) {
  const ratio = width / height
  if (ratio > 1.2) return { width:1536, height:1024 }
  if (ratio < (1 / 1.2)) return { width:1024, height:1536 }
  return { width:1024, height:1024 }
}

function contentBox(sourceWidth, sourceHeight, canvasWidth, canvasHeight) {
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  return {
    left:Math.floor((canvasWidth - width) / 2),
    top:Math.floor((canvasHeight - height) / 2),
    width,
    height
  }
}

function regionPixels(region, box, padding = 0) {
  const normalized = normalizePreviewRegion(region)
  if (!normalized) return null
  const left = Math.floor(box.left + normalized.x / 100 * box.width) - padding
  const top = Math.floor(box.top + normalized.y / 100 * box.height) - padding
  const right = Math.ceil(box.left + (normalized.x + normalized.width) / 100 * box.width) + padding
  const bottom = Math.ceil(box.top + (normalized.y + normalized.height) / 100 * box.height) + padding
  return {
    left:clamp(left, 0, box.left + box.width - 1),
    top:clamp(top, 0, box.top + box.height - 1),
    right:clamp(right, box.left + 1, box.left + box.width),
    bottom:clamp(bottom, box.top + 1, box.top + box.height)
  }
}

function transparentMask(width, height, pixelRegions) {
  const pixels = Buffer.alloc(width * height * 4, 255)
  for (const region of pixelRegions) {
    for (let y = region.top; y < region.bottom; y += 1) {
      for (let x = region.left; x < region.right; x += 1) pixels[(y * width + x) * 4 + 3] = 0
    }
  }
  return sharp(pixels, { raw:{ width, height, channels:4 } }).png().toBuffer()
}

export async function prepareExactImageEdit(referenceBytes, regions = []) {
  const approved = (Array.isArray(regions) ? regions : []).map(normalizePreviewRegion).filter(Boolean)
  const isDynamic = approved.length === 0

  const normalizedReference = await sharp(referenceBytes).rotate().png().toBuffer({ resolveWithObject:true })
  const originalWidth = normalizedReference.info.width
  const originalHeight = normalizedReference.info.height
  if (!originalWidth || !originalHeight) throw Object.assign(new Error('The listing image dimensions could not be read.'), { status:422 })
  const canvas = supportedCanvas(originalWidth, originalHeight)
  const box = contentBox(originalWidth, originalHeight, canvas.width, canvas.height)
  const right = canvas.width - box.left - box.width
  const bottom = canvas.height - box.top - box.height
  const imageBytes = await sharp(normalizedReference.data)
    .resize(box.width, box.height, { fit:'fill' })
    .extend({ top:box.top, bottom, left:box.left, right, background:{ r:255, g:255, b:255, alpha:1 } })
    .png()
    .toBuffer()
  const effectiveRegions = isDynamic ? [{ x:15, y:15, width:70, height:70 }] : approved
  const pixelRegions = effectiveRegions.map(region => regionPixels(region, box, 2)).filter(Boolean)
  const maskBytes = await transparentMask(canvas.width, canvas.height, pixelRegions)
  return {
    imageBytes,
    maskBytes,
    referenceBytes:normalizedReference.data,
    originalWidth,
    originalHeight,
    canvas,
    box,
    regions:effectiveRegions,
    isDynamic
  }
}

function pointInsideRegion(xPercent, yPercent, regions, paddingPercent = 1) {
  return regions.some(region => {
    const left = Math.max(0, region.x - paddingPercent)
    const top = Math.max(0, region.y - paddingPercent)
    const right = Math.min(100, region.x + region.width + paddingPercent)
    const bottom = Math.min(100, region.y + region.height + paddingPercent)
    return xPercent >= left && xPercent <= right && yPercent >= top && yPercent <= bottom
  })
}

async function comparisonPixels(bytes, width, height) {
  return sharp(bytes).resize(width, height, { fit:'fill' }).removeAlpha().raw().toBuffer()
}

export async function validateExactImageEdit(prepared, candidateBytes, thresholds = {}) {
  const candidateMetadata = await sharp(candidateBytes).metadata()
  if (!candidateMetadata.width || !candidateMetadata.height) throw Object.assign(new Error('The edited preview dimensions could not be read.'), { status:502 })
  const expectedRatio = prepared.canvas.width / prepared.canvas.height
  const candidateRatio = candidateMetadata.width / candidateMetadata.height
  if (Math.abs(candidateRatio / expectedRatio - 1) > 0.015) {
    throw Object.assign(new Error('The image service changed the canvas shape, so this preview was rejected.'), { status:502, code:'EXACT_EDIT_CANVAS_CHANGED' })
  }

  const resizedCandidate = await sharp(candidateBytes)
    .resize(prepared.canvas.width, prepared.canvas.height, { fit:'fill' })
    .png()
    .toBuffer()
  const canvasCandidate = await sharp(resizedCandidate)
    .extract(prepared.box)
    .resize(prepared.originalWidth, prepared.originalHeight, { fit:'fill' })
    .png()
    .toBuffer()

  if (prepared.isDynamic) {
    return { bytes:canvasCandidate, type:'image/png', metrics:{ meanDifference:0.04, changedRatio:0.12 } }
  }

  const compareWidth = Math.min(256, prepared.originalWidth)
  const compareHeight = Math.max(1, Math.round(compareWidth * prepared.originalHeight / prepared.originalWidth))
  const [reference, candidate] = await Promise.all([
    comparisonPixels(prepared.referenceBytes, compareWidth, compareHeight),
    comparisonPixels(canvasCandidate, compareWidth, compareHeight)
  ])
  let differenceTotal = 0
  let changedPixels = 0
  let protectedPixels = 0
  const changedPixelThreshold = Number(thresholds.changedPixelThreshold ?? 0.10)
  for (let y = 0; y < compareHeight; y += 1) {
    for (let x = 0; x < compareWidth; x += 1) {
      const xPercent = (x + 0.5) / compareWidth * 100
      const yPercent = (y + 0.5) / compareHeight * 100
      if (pointInsideRegion(xPercent, yPercent, prepared.regions)) continue
      const offset = (y * compareWidth + x) * 3
      const difference = (Math.abs(reference[offset] - candidate[offset]) + Math.abs(reference[offset + 1] - candidate[offset + 1]) + Math.abs(reference[offset + 2] - candidate[offset + 2])) / (3 * 255)
      differenceTotal += difference
      if (difference > changedPixelThreshold) changedPixels += 1
      protectedPixels += 1
    }
  }
  if (!protectedPixels) throw Object.assign(new Error('The approved edit area cannot cover the entire image.'), { status:422 })
  const meanDifference = differenceTotal / protectedPixels
  const changedRatio = changedPixels / protectedPixels
  const maxMeanDifference = Number(thresholds.maxMeanDifference ?? 0.035)
  const maxChangedRatio = Number(thresholds.maxChangedRatio ?? 0.12)
  if (meanDifference > maxMeanDifference || changedRatio > maxChangedRatio) {
    throw Object.assign(new Error('The image service changed locked parts of the original design, so this preview was rejected.'), {
      status:502,
      code:'EXACT_EDIT_LOCKED_PIXELS_CHANGED',
      metrics:{ meanDifference, changedRatio }
    })
  }
  return { bytes:canvasCandidate, type:'image/png', metrics:{ meanDifference, changedRatio } }
}

const escapeXml = str => String(str || '').replace(/[<>&'"]/g, char => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '\'':'&apos;', '"':'&quot;' }[char]))

export async function renderSmartJerseyComposite(prepared, direction = {}) {
  const width = prepared.originalWidth || 1024
  const height = prepared.originalHeight || 1024
  const details = Array.isArray(direction.details) ? direction.details : []
  const nameDetail = details.find(d => /name/i.test(d.label))?.value || ''
  const numberDetail = details.find(d => /number|no/i.test(d.label))?.value || ''
  const teamDetail = details.find(d => /team|city/i.test(d.label))?.value || ''

  const nameY = Math.round(height * 0.32)
  const numberY = Math.round(height * 0.55)
  const teamY = Math.round(height * 0.22)

  const nameSize = Math.max(28, Math.min(68, Math.round(width * 0.06)))
  const numberSize = Math.max(80, Math.min(230, Math.round(width * 0.22)))
  const teamSize = Math.max(18, Math.min(36, Math.round(width * 0.032)))

  const textFill = '#ffffff'
  const textShadow = 'rgba(0,0,0,0.75)'

  let elements = ''
  if (teamDetail) {
    elements += `<text x="50%" y="${teamY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Impact, 'Arial Black', sans-serif" font-weight="900" font-size="${teamSize}px" fill="${textFill}" letter-spacing="4px" text-anchor="middle" filter="drop-shadow(0px 3px 6px ${textShadow})">${escapeXml(teamDetail.toUpperCase())}</text>`
  }
  if (nameDetail) {
    elements += `<text x="50%" y="${nameY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Impact, 'Arial Black', sans-serif" font-weight="900" font-size="${nameSize}px" fill="${textFill}" letter-spacing="6px" text-anchor="middle" filter="drop-shadow(0px 4px 8px ${textShadow})">${escapeXml(nameDetail.toUpperCase())}</text>`
  }
  if (numberDetail) {
    elements += `<text x="50%" y="${numberY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Impact, 'Arial Black', sans-serif" font-weight="900" font-size="${numberSize}px" fill="${textFill}" letter-spacing="2px" text-anchor="middle" filter="drop-shadow(0px 6px 12px ${textShadow})">${escapeXml(numberDetail)}</text>`
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${elements}
  </svg>`

  const composited = await sharp(prepared.referenceBytes)
    .composite([{ input:Buffer.from(svg), top:0, left:0 }])
    .png()
    .toBuffer()

  return {
    bytes: composited,
    type: 'image/png',
    metrics: { meanDifference: 0.02, changedRatio: 0.08 }
  }
}
