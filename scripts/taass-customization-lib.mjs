import { normalizeCustomFields } from '../src/lib/catalog-model.js'

export const TAASS_CUSTOM_COPY = 'Personalization is available by request. Add an optional name, number, or customer-supplied logo and our studio will review placement and feasibility before production. The product shown is the standard version; no artwork is changed without confirmation.'
const TAASS_CUSTOM_MARKER = 'TAASS_STUDIO_CUSTOM_REQUEST_V1'

export function planTaassCustomization(row = {}) {
  const existing = Array.isArray(row.custom_fields) ? row.custom_fields : []
  const keys = new Set(existing.map(field => field?.key))
  const fields = [...existing]
  const definitions = [
    { id:`${row.id}-name`, key:'name', label:'Name', type:'text', required:false, placeholder:'YOUR NAME', maxLength:14,
      help:'Optional name request. Studio confirms whether this product can carry it.', studioReviewRequired:true },
    { id:`${row.id}-number`, key:'number', label:'Number', type:'number', required:false, placeholder:'00', maxLength:2,
      help:'Optional number request. Studio confirms placement and availability.', studioReviewRequired:true },
    { id:`${row.id}-team-logo`, key:'teamLogo', label:'Your logo', type:'logo', required:false, placeholder:'', maxLength:null,
      help:'Upload a logo you own or may use. Studio confirms whether and where it can be applied.',
      studioReviewRequired:true, previewRegion:null, logoTreatment:'EXACT', allowAiFinish:false, requiresConsent:true, minWidth:800 }
  ]
  for (const definition of definitions) if (!keys.has(definition.key)) fields.push(definition)
  const customFields = [...existing, ...normalizeCustomFields(fields.slice(existing.length))]
  const description = String(row.description || '').trim()
  const nextDescription = description.includes(TAASS_CUSTOM_COPY) ? description : `${description}${description ? ' ' : ''}${TAASS_CUSTOM_COPY}`
  const blocks = Array.isArray(row.content_blocks) ? row.content_blocks : []
  const hasBlock = blocks.some(block => block?.id === TAASS_CUSTOM_MARKER || String(block?.content || '').includes(TAASS_CUSTOM_COPY))
  const contentBlocks = hasBlock ? blocks : [...blocks, { id:TAASS_CUSTOM_MARKER, type:'paragraph', content:TAASS_CUSTOM_COPY }]
  const tags = Array.isArray(row.tags) ? row.tags : []
  const nextTags = tags.some(tag => String(tag).toLowerCase() === 'customizable') ? tags : [...tags, 'customizable']
  const personalization = customFields.map(field => field.label)
  const typeChanged = String(row.type || '').toUpperCase() !== 'PERSONALIZED'
  return {
    customFields, description:nextDescription, contentBlocks, tags:nextTags, personalization,
    type:'PERSONALIZED', typeChanged,
    changed: JSON.stringify(customFields) !== JSON.stringify(existing)
      || nextDescription !== description || !hasBlock || nextTags.length !== tags.length
      || JSON.stringify(personalization) !== JSON.stringify(row.personalization || []) || typeChanged,
    addedKeys:definitions.filter(field => !keys.has(field.key)).map(field => field.key)
  }
}
