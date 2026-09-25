import { catalogLegalReview, seoReviewGate, validateListing } from '../src/lib/catalog-model.js'
import { sanitizeTaassPublicText } from './taass-import-lib.mjs'

const HEADWEAR_URL = /(?:^|[-/])(?:cap|caps|hat|hats|beanie|beanies|skully|skullies|[a-z]*muetze|[a-z]*mütze|[a-z]*kappe|snapback|fitted|trucker|visor|headwear)(?:[-/]|$)/i
const HEADWEAR_TEXT = /\b(?:caps?|hats?|beanies?|skull(?:y|ies)|visors?|headwear|snapbacks?|fitted caps?|trucker caps?)\b/i

export function isTaassHeadwearUrl(url) {
  try { return HEADWEAR_URL.test(new URL(url).pathname) } catch { return false }
}

export function isTaassHeadwearListing(listing = {}) {
  const group = String(listing.productGroup || listing.product_group || '').trim()
  const title = String(listing.title || listing.name || '').trim()
  if (HEADWEAR_TEXT.test(group)) return true
  if (/\b(?:jerseys?|trikots?|shirts?|t-?shirts?|hoodies?|jackets?|sweaters?|trading cards?|collectibles?)\b/i.test(group)) return false
  if (/\b(?:key[ -]?chains?|key[ -]?rings?)\b/i.test(title)) return false
  return HEADWEAR_TEXT.test(title)
}

function humanize(value) {
  return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase()).trim()
}

function fitOptions(listing) {
  const options = Array.isArray(listing.options) ? listing.options : []
  return options.map(option => `${option.name}: ${(option.values || []).join(', ')}`).filter(Boolean).join('; ')
}

function seoTitle(listing) {
  const title = sanitizeTaassPublicText(listing.title)
  const suffix = ' | Jersevo'
  const available = 60 - suffix.length
  const lead = title.length > available ? title.slice(0, available + 1).replace(/\s+\S*$/, '').trim() : title
  const result = `${lead || 'Fan Headwear'}${suffix}`
  return result.length >= 30 ? result : `${lead || 'Fan Headwear'} | Sports Hats at Jersevo`.slice(0, 60)
}

function seoDescription(listing) {
  const title = sanitizeTaassPublicText(listing.title)
  const league = humanize(listing.taxonomy?.league)
  const group = sanitizeTaassPublicText(listing.productGroup || 'headwear').toLowerCase()
  const parts = [
    `Explore ${title} at Jersevo.`,
    `View all product photos, listed options, price and availability for this ${league ? `${league} ` : ''}${group}.`,
    'Check the details before ordering.'
  ]
  let result = parts.join(' ')
  if (result.length > 160) result = result.slice(0, 160).replace(/\s+\S*$/, '').replace(/[,:;\s]+$/, '')
  if (result.length < 120) result = `${result} Compare the available fit and size information on this listing.`
  if (result.length > 160) result = result.slice(0, 160).replace(/\s+\S*$/, '').replace(/[,:;\s]+$/, '')
  return result
}

export function prepareTaassHeadwearPublication(item, now = new Date().toISOString(), { approveRights = false } = {}) {
  const original = item?.listing || item
  const listing = {
    ...original,
    type: 'READY TO SHIP',
    customFields: [],
    personalization: []
  }
  if (!isTaassHeadwearListing(listing)) return { item, publishable: false, blockers: ['NOT_HEADWEAR'] }
  const legal = catalogLegalReview(listing)
  if (legal.required && !legal.approved && !approveRights) return { item, publishable: false, blockers: ['RIGHTS_REVIEW_REQUIRED'] }
  const title = sanitizeTaassPublicText(listing.title)
  const group = sanitizeTaassPublicText(listing.productGroup || 'headwear').toLowerCase()
  const sourceCopy = sanitizeTaassPublicText(listing.description)
  const team = humanize(listing.taxonomy?.team)
  const league = humanize(listing.taxonomy?.league)
  const details = [
    `${title} is listed in the ${group} selection${league ? ` for ${league} supporters` : ''}${team ? ` following ${team}` : ''}.`,
    sourceCopy,
    `Review the ${listing.media?.length || 0} product photos for the visible color, shape and design details.`,
    fitOptions(listing) ? `Available options on this listing: ${fitOptions(listing)}.` : 'This listing has no size or fit option to choose.',
    'Check the displayed price and availability before placing an order.'
  ].filter(Boolean)
  const description = details.join(' ').replace(/\s+/g, ' ').trim()
  const seo = {
    ...(listing.seo || {}),
    title: seoTitle(listing),
    description: seoDescription(listing),
    primaryKeyword: `${team || league || 'sports'} ${group}`.toLowerCase(),
    status: 'INDEXABLE'
  }
  const candidate = {
    ...listing,
    status: 'PUBLISHED',
    description,
    subtitle: description.slice(0, 180),
    seo,
    seoStatus: 'INDEXABLE',
    seoReviewedAt: now,
    seoPublishedAt: now,
    aiMetadata: approveRights && legal.required && !legal.approved
      ? {
          ...(listing.aiMetadata || {}),
          catalogReview: {
            ...(listing.aiMetadata?.catalogReview || {}),
            status: 'APPROVED',
            note: 'Operator confirmed rights to sell and use names/images for TAASS headwear.',
            reviewedAt: now
          }
        }
      : listing.aiMetadata
  }
  const gate = seoReviewGate(candidate)
  const blockers = [...new Set([...gate.blockers, ...validateListing(candidate)])]
  if (blockers.length) return { item, publishable: false, blockers }
  candidate.seo = { ...seo, quality_score: gate.quality, block_reasons: [] }
  candidate.seoQualityScore = gate.quality
  candidate.seoBlockReasons = []
  return {
    item: item?.listing ? { ...item, listing: candidate } : candidate,
    publishable: true,
    blockers: []
  }
}
