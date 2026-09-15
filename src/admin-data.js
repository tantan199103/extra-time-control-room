import { products as storefrontProducts } from './data'
import { storyTemplates, universalSlots } from './template-engine'

export const personalizationDefaults = ['NAME + NUMBER', 'TEAM / CITY', 'YEAR', 'COLOUR']

export const adminProducts = storefrontProducts.map((product, index) => ({
  ...product,
  status: index === 1 ? 'DRAFT' : index === 4 ? 'ARCHIVED' : 'PUBLISHED',
  type: index === 5 ? 'PERSONALIZED' : 'READY TO SHIP',
  template: index === 5 ? 'MY LEGACY' : '90+ / CORE',
  templateId: index === 5 ? 'legacy-v1' : 'after-90-core',
  sku: `ET-${String(index + 1).padStart(3, '0')}`,
  inventory: index === 4 ? 0 : [38, 14, 7, 24, 0, 16][index],
  updatedAt: ['Today, 09:42', 'Yesterday, 16:18', 'Sep 12, 2026', 'Sep 10, 2026', 'Aug 28, 2026', 'Aug 26, 2026'][index],
  personalization: index === 5 ? personalizationDefaults : [],
  artworkLock: index === 5 ? 70 : 100
}))

const templateCovers = {
  'venom-v1':'/assets/jersey-black.webp',
  'hometown-v1':'/assets/hero-tunnel.webp',
  'legacy-v1':'/assets/jersey-white.webp',
  'underdog-v1':'/assets/editorial-player.webp',
  'king-v1':'/assets/jersey-oxblood.webp'
}

export const adminTemplates = storyTemplates.map(template => ({
  id: template.id,
  name: template.name,
  slug: template.id,
  status: template.status === 'LIVE' ? 'LIVE' : 'DRAFT',
  version: template.version,
  lockPercent: template.artworkLock,
  cover: templateCovers[template.id] || '/assets/jersey-black.webp',
  description: template.strapline,
  locked: ['TYPOGRAPHY','COMPOSITION','TEXTURE','EFFECTS','HIERARCHY'],
  editable: template.fields.map(fieldId => universalSlots[fieldId]?.label?.toUpperCase()).filter(Boolean),
  templateDefinition: template
}))

export const adminActivity = [
  { action: 'Published', item: 'AFTER 90', detail: 'Black / Core', time: 'Today, 09:42', tone: 'live' },
  { action: 'Updated', item: 'TOUCHLINE / DESIGN 001', detail: 'Personalization rules', time: 'Yesterday, 16:18', tone: 'acid' },
  { action: 'Drafted', item: 'CHALK LINES', detail: 'Product description', time: 'Sep 12, 2026', tone: 'draft' },
  { action: 'Archived', item: 'THE WHISTLE', detail: 'Inventory reached 0', time: 'Aug 28, 2026', tone: 'muted' }
]

export const adminStats = [
  { label: 'LIVE PRODUCTS', value: '05', note: '+1 this month', tone: 'acid' },
  { label: 'DRAFTS TO REVIEW', value: '02', note: '1 needs artwork', tone: 'ink' },
  { label: 'ACTIVE TEMPLATES', value: '03', note: '70% lock enforced', tone: 'paper' },
  { label: 'CUSTOM ORDERS', value: '128', note: '+18% vs last drop', tone: 'signal' }
]
