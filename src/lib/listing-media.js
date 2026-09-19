// Controlled editorial image roles for a listing. These roles keep generated
// media useful for a product page without turning the admin into an open-ended
// image studio. The server uses the same identifiers to build guarded prompts.

export const LISTING_MEDIA_SLOTS = Object.freeze([
  {
    id: 'model-front',
    label: 'Model / front',
    shortLabel: 'Front model',
    group: 'model',
    kind: 'MODEL',
    alt: 'Editorial model wearing the listing from the front',
    prompt: 'Create a realistic editorial e-commerce photograph of a single adult model wearing the exact referenced garment from a clean front three-quarter angle. Keep the garment cut, locked artwork, colors, seams, typography and proportions unchanged. Use a restrained matchday setting with soft directional light, no readable brands, no extra text and no additional products.'
  },
  {
    id: 'model-back',
    label: 'Model / back',
    shortLabel: 'Back model',
    group: 'model',
    kind: 'MODEL',
    alt: 'Editorial model wearing the listing from the back',
    prompt: 'Create a realistic editorial e-commerce photograph of a single adult model wearing the exact referenced garment from the back. Preserve the garment silhouette, locked artwork, name and number areas, color, seams and proportions. Keep the camera calm and useful for inspecting the back print; no invented logos, sponsors, readable extra text or additional products.'
  },
  {
    id: 'model-street',
    label: 'Model / street',
    shortLabel: 'Street model',
    group: 'model',
    kind: 'MODEL',
    alt: 'Editorial street-style model wearing the listing',
    prompt: 'Create a realistic street-style editorial photograph of one adult model wearing the exact referenced garment. Keep the locked design, cut, color, typography and print placement unchanged. Use a quiet city edge or stadium approach as the context, with the garment clearly dominant; no invented team marks, sponsors, extra text or products.'
  },
  {
    id: 'model-detail',
    label: 'Model / detail',
    shortLabel: 'Detail model',
    group: 'model',
    kind: 'MODEL',
    alt: 'Close editorial detail of the listing worn on a model',
    prompt: 'Create a realistic close editorial detail of the exact referenced garment being worn by an adult model. Show the material, locked print, seam and texture detail at a useful scale while keeping the artwork unchanged. Do not invent fabric claims, logos, sponsors, text or accessories.'
  },
  {
    id: 'model-matchday',
    label: 'Model / matchday',
    shortLabel: 'Matchday model',
    group: 'model',
    kind: 'MODEL',
    alt: 'Matchday editorial model wearing the listing',
    prompt: 'Create a realistic matchday editorial photograph of one adult model wearing the exact referenced garment near a quiet stadium tunnel or terrace. Keep the garment and all designer-locked artwork exactly recognizable and dominant. Avoid crowds with readable faces, invented team marks, sponsors, extra text, props or other products.'
  },
  {
    id: 'custom-guide',
    label: 'Custom guide',
    shortLabel: 'Custom guide',
    group: 'guide',
    kind: 'GUIDE',
    alt: 'Visual guide showing the listing personalization fields',
    prompt: 'Create a clean, premium instructional product graphic using the exact referenced garment as the visual anchor. Explain the allowed personalization fields with a simple numbered layout and short labels only: NAME, NUMBER, TEAM / CITY, YEAR, COLOR and optional PHOTO, using only the fields supplied by the listing. Keep the garment artwork unchanged, avoid invented logos or claims, use high contrast, generous spacing and no prices.'
  }
])

export const MODEL_MEDIA_SLOT_IDS = Object.freeze(
  LISTING_MEDIA_SLOTS.filter(slot => slot.group === 'model').map(slot => slot.id)
)

export const CUSTOM_GUIDE_SLOT_ID = 'custom-guide'

export function listingMediaSlot(id) {
  return LISTING_MEDIA_SLOTS.find(slot => slot.id === id) || null
}

export function listingMediaRole(item) {
  return String(item?.role || item?.mediaRole || '').trim().toLowerCase()
}
