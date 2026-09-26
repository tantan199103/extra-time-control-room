export const adminTheme = {
  id: 'extra-time-v1',
  name: 'EXTRA TIME / STORE KIT',
  version: 'v1.3',
  status: 'PUBLISHED',
  updatedAt: 'Today, 10:12',
  tokens: {
    ink: '#0A0A0A',
    chalk: '#F4F3EE',
    acid: '#F8F04A',
    signal: '#D72C2C',
    maxWidth: '1440px',
    radius: '0px'
  },
  pages: [
    { id: 'home', name: 'Home', path: '/', status: 'PUBLISHED', sections: 7, updatedAt: 'Today, 10:12', layout: [{ id: 'hero', type: 'Custom jersey hero', enabled: true }, { id: 'home-trust', type: 'Home trust strip', enabled: true }, { id: 'leagues', type: 'League discovery', enabled: true }, { id: 'rail', type: 'Starting lineup', enabled: true }, { id: 'custom-options', type: 'Customization options', enabled: true }, { id: 'faq', type: 'Homepage FAQ', enabled: true }, { id: 'category-index', type: 'Category index', enabled: true }], representativeImage: '/assets/hero-tunnel.webp', representativeAlt: 'Jersevo custom jersey storefront hero' },
    { id: 'collection', name: 'Collection', path: '/collection', status: 'PUBLISHED', sections: 4, updatedAt: 'Yesterday, 18:42', layout: [{ id: 'collection-hero', enabled: true }, { id: 'filters', enabled: true }, { id: 'product-grid', enabled: true }, { id: 'collection-trust', enabled: true }], representativeImage: '/assets/hero-tunnel.webp', representativeAlt: 'The 90+ drop' },
    { id: 'product', name: 'Product detail', path: '/product/:handle', status: 'PUBLISHED', sections: 6, updatedAt: 'Yesterday, 16:20', layout: [{ id: 'product-gallery', enabled: true }, { id: 'product-buybox', enabled: true }, { id: 'product-highlights', enabled: true }, { id: 'product-story', enabled: true }, { id: 'product-proof', enabled: true }, { id: 'related-products', enabled: true }], representativeImage: '/assets/jersey-black.webp', representativeAlt: 'Product detail preview' },
    { id: 'custom', name: 'Custom Lab', path: '/custom', status: 'PUBLISHED', sections: 4, updatedAt: 'Sep 12, 2026', layout: [{ id: 'custom-hero', enabled: true }, { id: 'custom-steps', enabled: true }, { id: 'custom-catalog', enabled: true }, { id: 'custom-trust', enabled: true }], representativeImage: '/assets/jersey-white.webp', representativeAlt: 'Custom jersey preview' },
    { id: 'vault', name: 'The Vault', path: '/vault', status: 'DRAFT', sections: 2, updatedAt: 'Sep 08, 2026', layout: [{ id: 'vault-hero', enabled: true }, { id: 'vault-grid', enabled: true }], representativeImage: '/assets/jersey-oxblood.webp', representativeAlt: 'The archive' }
  ],
  content: {
    eyebrow: 'CUSTOM JERSEYS',
    headline: 'YOUR NAME.\nYOUR NUMBER.\nYOUR JERSEY.',
    supporting: 'Made for fans. Personalized with the details that make it yours.',
    button: 'START CUSTOMIZING',
    pages: {
      home: { eyebrow: 'CUSTOM JERSEYS', headline: 'YOUR NAME.\nYOUR NUMBER.\nYOUR JERSEY.', supporting: 'Made for fans. Personalized with the details that make it yours.', button: 'START CUSTOMIZING' },
      collection: { eyebrow: 'SHOP THE CATALOG', headline: 'FIND YOUR\nNEXT PIECE.', supporting: 'Browse published jerseys, fan gear and accessories by sport, team or collection.', button: 'SHOP ALL GEAR' },
      product: { eyebrow: 'PRODUCT DETAIL', headline: 'BUILT FOR\nYOUR MOMENT.', supporting: 'Choose a variation, add only the personal details this design supports, then review before checkout.', button: 'ADD TO BAG' },
      custom: { eyebrow: 'CUSTOM LAB / REVIEWED PERSONALIZATION', headline: 'PUT YOUR\nMOMENT ON IT.', supporting: 'Choose a designer-led base, add approved details and review every field before production.', button: 'CHOOSE A JERSEY' },
      vault: { eyebrow: 'THE VAULT', headline: 'EVERY DROP\nLEAVES A MARK.', supporting: 'Archive stories from previous Extra Time releases.', button: 'ENTER THE VAULT' }
    },
    blocks: {
      rail: { title: 'BEST SELLERS.\nYOUR WAY.', subtitle: 'Fan favorites, ready to personalize.' },
      'home-trust': { labels: ['Made Just for You', 'Personalized Your Way', 'Secure from Cart to Checkout', 'Tracked to Your Door'] }
    }
  }
}

export const adminMenus = [
  {
    id: 'main', name: 'Main navigation', location: 'Header / desktop + mobile', status: 'PUBLISHED', updatedAt: 'Today, 09:50',
    items: [
      { id: 'shop', label: 'Shop', target: '/shop', type: 'Page', visible: true, children: [
        { id: 'all-products', label: 'All gear', target: '/shop', type: 'Page', visible: true },
        { id: 'jerseys', label: 'Jerseys', target: '/category/football-jerseys', type: 'Page', visible: true },
        { id: 'accessories', label: 'Accessories', target: '/category/accessories', type: 'Page', visible: true }
      ]},
      { id: 'sports', label: 'Sports', target: '/sports', type: 'Page', visible: true, children: [] },
      { id: 'teams', label: 'Teams', target: '/teams', type: 'Page', visible: true, children: [] },
      { id: 'custom', label: 'Custom', target: '/category/custom-jerseys', type: 'Page', visible: true, children: [] },
      { id: 'collections', label: 'Collections', target: '/collections', type: 'Page', visible: true, children: [] },
      { id: 'new', label: 'New & trending', target: '/shop?sort=NEWEST', type: 'Page', visible: true, children: [] }
    ]
  },
  {
    id: 'footer', name: 'Footer navigation', location: 'Footer', status: 'PUBLISHED', updatedAt: 'Sep 09, 2026',
    items: [
      { id: 'shipping', label: 'Shipping', target: '/shipping', type: 'Page', visible: true, children: [] },
      { id: 'returns', label: 'Returns', target: '/returns', type: 'Page', visible: true, children: [] },
      { id: 'journal', label: 'Journal', target: '/journal', type: 'Page', visible: true, children: [] }
    ]
  },
  {
    id: 'fixed-footer', name: 'Fixed footer menu', location: 'Fixed footer / mobile', status: 'PUBLISHED', updatedAt: 'Today, 11:30',
    items: [
      { id: 'fixed-home', label: 'Home', target: '/', type: 'Page', visible: true, children: [] },
      { id: 'fixed-shop', label: 'Shop', target: '/shop', type: 'Collection', visible: true, children: [] },
      { id: 'fixed-custom', label: 'Custom', target: '/custom', type: 'Page', visible: true, children: [] },
      { id: 'fixed-bag', label: 'Bag', target: '#bag', type: 'Action', visible: true, children: [] }
    ]
  }
]

export const adminCollections = [
  { id: 'drop-01', name: 'THE 90+ DROP', handle: 'the-90-drop', status: 'PUBLISHED', description: 'The first collection for the minutes nobody forgets.', hero: '/assets/hero-tunnel.webp', products: ['after-90', 'home-end', 'under-lights'], count: 3, updatedAt: 'Today, 09:42', sort: 'Manual' },
  { id: 'custom-jerseys', name: 'CUSTOM JERSEYS', handle: 'custom-jerseys', status: 'PUBLISHED', description: 'A fixed point of view. A small personal layer.', hero: '/assets/jersey-white.webp', products: ['touchline'], count: 1, updatedAt: 'Yesterday, 16:18', sort: 'Featured first' },
  { id: 'archive', name: 'THE ARCHIVE', handle: 'archive', status: 'DRAFT', description: 'Pieces with a previous life.', hero: '/assets/jersey-oxblood.webp', products: ['the-whistle', 'chalk-lines'], count: 2, updatedAt: 'Sep 08, 2026', sort: 'Newest' }
]

export const adminProductOptions = {
  'after-90': {
    options: [{ name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }, { name: 'Color', values: ['Black'] }],
    variants: [
      { id: 'after-90-xs-black', sku: 'ET-001-XS-BLK', values: { Size: 'XS', Color: 'Black' }, price: 89, inventory: 4, status: 'ACTIVE' },
      { id: 'after-90-s-black', sku: 'ET-001-S-BLK', values: { Size: 'S', Color: 'Black' }, price: 89, inventory: 8, status: 'ACTIVE' },
      { id: 'after-90-m-black', sku: 'ET-001-M-BLK', values: { Size: 'M', Color: 'Black' }, price: 89, inventory: 12, status: 'ACTIVE' },
      { id: 'after-90-l-black', sku: 'ET-001-L-BLK', values: { Size: 'L', Color: 'Black' }, price: 89, inventory: 7, status: 'ACTIVE' },
      { id: 'after-90-xl-black', sku: 'ET-001-XL-BLK', values: { Size: 'XL', Color: 'Black' }, price: 89, inventory: 5, status: 'ACTIVE' },
      { id: 'after-90-xxl-black', sku: 'ET-001-XXL-BLK', values: { Size: 'XXL', Color: 'Black' }, price: 89, inventory: 2, status: 'LOW STOCK' }
    ]
  },
  touchline: {
    options: [{ name: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] }, { name: 'Color', values: ['White', 'Black'] }],
    variants: [
      { id: 'touchline-s-white', sku: 'ET-006-S-WHT', values: { Size: 'S', Color: 'White' }, price: 109, inventory: 3, status: 'ACTIVE' },
      { id: 'touchline-m-white', sku: 'ET-006-M-WHT', values: { Size: 'M', Color: 'White' }, price: 109, inventory: 6, status: 'ACTIVE' },
      { id: 'touchline-l-white', sku: 'ET-006-L-WHT', values: { Size: 'L', Color: 'White' }, price: 109, inventory: 4, status: 'ACTIVE' },
      { id: 'touchline-xl-white', sku: 'ET-006-XL-WHT', values: { Size: 'XL', Color: 'White' }, price: 109, inventory: 2, status: 'LOW STOCK' },
      { id: 'touchline-xxl-white', sku: 'ET-006-XXL-WHT', values: { Size: 'XXL', Color: 'White' }, price: 109, inventory: 1, status: 'LOW STOCK' }
    ]
  }
}

export const themeBlocks = [
  { id: 'announcement', type: 'Announcement bar', note: 'Free shipping message', enabled: true },
  { id: 'header', type: 'Header', note: 'Logo, menu and bag', enabled: true },
  { id: 'hero', type: 'Custom jersey hero', note: 'Your name, number and primary CTA', enabled: true },
  { id: 'home-trust', type: 'Home trust strip', note: 'Made to order, custom, secure and tracked', enabled: true },
  { id: 'leagues', type: 'League discovery', note: 'Choose a league and shop the route', enabled: true },
  { id: 'rail', type: 'Starting lineup', note: 'Fan favorites near the top of home', enabled: true },
  { id: 'home-path', type: 'Make it yours', note: 'Pick, personalize, preview and order', enabled: true },
  { id: 'custom-options', type: 'Customization options', note: 'Show the listing-approved personal fields', enabled: true },
  { id: 'quality', type: 'Detail proof', note: 'Surface, print, trim and fit guidance', enabled: true },
  { id: 'drop', type: 'Drop feature', note: 'Featured current listing', enabled: true },
  { id: 'players', type: 'Shop by intent', note: 'For you, two, family and squad', enabled: true },
  { id: 'community', type: 'Community proof', note: 'Editorial jersey imagery and story bridge', enabled: true },
  { id: 'faq', type: 'Homepage FAQ', note: 'Answer custom, preview, tracking and returns questions', enabled: true },
  { id: 'newsletter', type: 'Newsletter', note: 'Email capture', enabled: false },
  { id: 'story', type: 'Story explorer', note: 'Optional interactive design memory', enabled: false },
  { id: 'vault', type: 'Vault teaser', note: 'Optional archive entry point', enabled: false },
  { id: 'manifesto', type: 'Manifesto / story', note: 'Optional brand manifesto', enabled: false },
  { id: 'footer', type: 'Footer', note: 'Footer links and legal', enabled: true }
]
