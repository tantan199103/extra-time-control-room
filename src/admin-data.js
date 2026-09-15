import { products as storefrontProducts } from './data'

export const personalizationDefaults = ['NAME + NUMBER', 'TEAM / CITY', 'YEAR', 'COLOUR', 'OPTIONAL PHOTO']

export const adminProducts = storefrontProducts.map((product, index) => ({
  ...product,
  status: index === 1 ? 'DRAFT' : index === 4 ? 'ARCHIVED' : 'PUBLISHED',
  type: index === 5 ? 'PERSONALIZED' : 'READY TO SHIP',
  template: index === 5 ? 'TOUCHLINE / DESIGN 001' : '90+ / CORE',
  sku: `ET-${String(index + 1).padStart(3, '0')}`,
  inventory: index === 4 ? 0 : [38, 14, 7, 24, 0, 16][index],
  updatedAt: ['Today, 09:42', 'Yesterday, 16:18', 'Sep 12, 2026', 'Sep 10, 2026', 'Aug 28, 2026', 'Aug 26, 2026'][index],
  personalization: index === 5 ? personalizationDefaults : [],
  artworkLock: index === 5 ? 70 : 100
}))

export const adminTemplates = [
  {
    id: 'touchline-04',
    name: 'TOUCHLINE / DESIGN 001',
    slug: 'touchline-04',
    status: 'LIVE',
    version: 'v1.4',
    lockPercent: 70,
    cover: '/assets/jersey-white.webp',
    description: 'A fixed football memory system with a small personal layer.',
    locked: ['TYPOGRAPHY', 'COMPOSITION', 'TEXTURE', 'EFFECTS', 'HIERARCHY'],
    editable: personalizationDefaults
  },
  {
    id: 'after-90-core',
    name: '90+ / CORE',
    slug: 'after-90-core',
    status: 'LIVE',
    version: 'v2.0',
    lockPercent: 100,
    cover: '/assets/jersey-black.webp',
    description: 'The locked collection system for ready-to-ship drops.',
    locked: ['TYPOGRAPHY', 'COMPOSITION', 'TEXTURE', 'EFFECTS', 'HIERARCHY'],
    editable: []
  },
  {
    id: 'archive-white',
    name: 'ARCHIVE / CHALK',
    slug: 'archive-white',
    status: 'DRAFT',
    version: 'v0.8',
    lockPercent: 80,
    cover: '/assets/editorial-player.webp',
    description: 'A softer archive template for the next small-batch story.',
    locked: ['TYPOGRAPHY', 'COMPOSITION', 'TEXTURE', 'EFFECTS'],
    editable: ['NAME + NUMBER', 'YEAR', 'OPTIONAL PHOTO']
  }
]

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
