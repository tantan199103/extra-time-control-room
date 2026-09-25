import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const focus = await readFile(new URL('../src/useDialogFocus.js', import.meta.url), 'utf8')
const supabaseSource = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')

test('closed install sheet cannot intercept pointer events', () => {
  const rule = css.match(/\.install-sheet \{([^}]+)\}/)?.[1]
  assert.match(rule, /pointer-events:\s*none/)
  assert.match(rule, /visibility:\s*hidden/)
  const backdrop = css.match(/\.install-sheet \.backdrop \{([^}]+)\}/)?.[1]
  assert.doesNotMatch(backdrop, /visibility:\s*visible/)
  assert.match(css, /\.install-sheet\.is-open \.backdrop \{[^}]*visibility:\s*visible/)
})

test('closed panels are inert to keyboard and screen-reader interactions', () => {
  for (const name of ['mobile-menu', 'search-overlay', 'cart-drawer', 'install-sheet', 'filter-sheet', 'size-modal']) {
    const tag = source.split('\n').find(line => line.includes(`className={\``) && line.includes(name))
    assert.ok(tag, `${name} exists`)
    assert.match(tag, /inert=\{!\w+\}/, `${name} must be inert when closed`)
    assert.match(tag, /aria-hidden=\{!\w+\}/, `${name} must be hidden from assistive technology when closed`)
  }
})

test('routing observes query changes and isolates different product state', () => {
  assert.match(source, /setRoute\(window\.location\.pathname \+ window\.location\.search \+ window\.location\.hash\)/)
  assert.match(source, /<ProductPage key=\{routeProduct\.id\}/)
  assert.match(source, /startPersonalized=\{new URLSearchParams\(search\)\.get\('custom'\) === '1'\}/)
  assert.match(source, /useEffect\(\(\) => \{ if \(startPersonalized && customFields\.length\) setPersonalized\(true\) \}, \[startPersonalized,customFields\.length\]\)/)
})

test('shop waits for the full live catalog and does not present PDP related products as the whole shop', () => {
  assert.match(source, /scope:productBootstrap \? 'single' : 'none'/)
  assert.match(source, /catalogRoute && catalogState\.scope !== 'page'/)
  assert.match(source, /else if \(!productSlug\) setProducts\(\[\]\)/)
  assert.match(supabaseSource, /\[0, 408, 429, 500, 502, 503, 504\]/)
})

test('navigation closes overlays and product drafts remain scoped by listing', () => {
  const handler = source.match(/const onPop = \(\) => \{([^}]+)\}/)?.[1]
  for (const name of ['Search', 'Cart', 'Install', 'SizeGuide']) assert.match(handler, new RegExp(`set${name}Open\\(false\\)`))
  assert.match(source, /extra-time-pdp-draft-\$\{product\.id\}/)
  assert.match(source, /cartLineKey\(item\)/)
  assert.match(source, /extra-time-cart-v2/)
})

test('Standard clears the custom URL flag so the Custom shortcut can open it again', () => {
  const chooseOrderType = source.match(/const chooseOrderType = enabled => \{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(chooseOrderType)
  assert.match(chooseOrderType, /url\.searchParams\.set\('custom','1'\)/)
  assert.match(chooseOrderType, /url\.searchParams\.delete\('custom'\)/)
  assert.match(chooseOrderType, /history\.replaceState/)
  assert.match(chooseOrderType, /dispatchEvent\(new PopStateEvent\('popstate'\)\)/)
})

test('Escape closes dialogs and focus returns to the opener', () => {
  assert.match(focus, /event\.key === 'Escape'/)
  assert.match(focus, /closeRef\.current\?\.\(\)/)
  assert.match(focus, /event\.key !== 'Tab'/)
  assert.match(focus, /previousFocus\.focus\(\{ preventScroll: true \}\)/)
  assert.match(focus, /removeEventListener\('keydown', onKeyDown\)/)
})

test('checkout starts a secure flow without implying payment confirmation', () => {
  assert.match(source, /<button onClick=\{onCheckout\} disabled=\{!cart\.length\}>CHECKOUT/)
  assert.match(source, /Your order is only confirmed after the provider approves payment/)
  assert.doesNotMatch(source, /YOU'RE ON THE TEAM|Watch your inbox/)
  assert.doesNotMatch(source, /<ButtonLink light>VIEW THE STORY/)
})

test('product cards expose quick view and never quick-add sold-out variants', () => {
  assert.match(source, /QUICK VIEW/)
  assert.match(source, /SOLD OUT/)
  assert.match(source, /isSellableVariant\(variant\)/)
  assert.match(source, /<QuickView/)
})

test('size finder renders catalog sizes in the same canonical form as the option controls', () => {
  assert.match(source, /availableSizes\.map\(canonicalSize\)/)
  assert.match(source, /canonicalSize\(recommendation\)/)
  assert.match(source, /availableFinderSizes\(product/)
})

test('product decision content is compact until the shopper asks for detail', () => {
  assert.match(source, /className="pdp__essentials"><details>/)
  assert.match(source, /<span>Shipping & returns<\/span>/)
  assert.match(source, /<span>Product, fit & care<\/span>/)
  assert.match(source, /<details className="pdp-content__details">/)
  assert.match(source, /className="pdp-story-signals"><details>/)
  assert.match(source, /aria-label="Checkout and order assurances"/)
  assert.doesNotMatch(source, /className="pdp__decision"/)
  assert.doesNotMatch(source, /Ready to ship/)
})

test('product highlights use configured bulk offers and do not invent discounts', () => {
  const highlights = source.match(/function ProductPurchaseHighlights\([\s\S]*?\nfunction ProductContentBlocks/)?.[0]
  assert.ok(highlights)
  assert.match(highlights, /const offers = config\.bulkOffers/)
  assert.match(highlights, /offer\.discountPercent/)
  assert.match(highlights, /GET TEAM PRICING/)
  assert.match(highlights, /ESTIMATED DELIVERY/)
  assert.match(highlights, /JERSEVO PRINT & BUILD/)
  assert.doesNotMatch(highlights, /Ready to ship/i)
  assert.doesNotMatch(highlights, /70\s*%|30\s*%/)
  assert.doesNotMatch(highlights, /(?:5|7|10|15)% off/)
})

test('mobile purchase bar keeps product context above the fixed navigation', () => {
  assert.match(source, /className="mobile-sticky-atc__product"><img/)
  assert.match(source, /selectionSummary/)
  assert.match(css, /\.mobile-sticky-atc \{ bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/)
})

test('sport and team discovery stay available across header, footer and mobile', async () => {
  const discovery = await readFile(new URL('../src/lib/discovery-navigation.js', import.meta.url), 'utf8')
  assert.match(discovery, /'Sports', 'Teams'/)
  assert.match(source, /mobile-discovery-group/)
  assert.match(source, /mega-menu--discovery/)
  assert.doesNotMatch(source, /className="footer__leagues"/)
  assert.doesNotMatch(source, /className="footer__league-grid"/)
  assert.doesNotMatch(source, /className="footer__categories"/)
  assert.match(source, /label:'SHOP'/)
  assert.match(source, /label:'HELP'/)
  assert.match(source, /id:'leagues', label:'Leagues'/)
  assert.match(source, /className="fixed-league-panel"/)
  assert.doesNotMatch(source, /className="fixed-league-menu"/)
  assert.match(css, /\.pdp \+ footer/)
})

test('homepage hero stays focused and trust ribbon keeps all four pillars readable', () => {
  assert.doesNotMatch(source, /POPULAR LEAGUES:/)
  assert.doesNotMatch(source, /hero__quick-sports/)
  assert.match(source, /\['Made Just for You', 'Crafted on demand', Sparkles\]/)
  assert.match(source, /\['Tracked to Your Door', 'Delivery updates included', Truck\]/)
  assert.match(source, /className="storefront-trust__pill-text"/)
  assert.match(css, /\.storefront-trust:not\(\.storefront-trust--home\) > \.storefront-trust__item/)
  assert.doesNotMatch(css, /\.storefront-trust__pill-title\s*\{[^}]*text-overflow:\s*ellipsis/)
})

test('product page integrates inline estimated delivery with purchase options and highlights timeline', () => {
  assert.match(source, /className="pdp-delivery-badge"/)
  assert.match(source, /ESTIMATED ARRIVAL:/)
  assert.match(source, /href="#pdp-delivery-timeline"/)
  assert.match(source, /id="pdp-delivery-timeline"/)
  assert.match(source, /<ProductPurchaseHighlights product=\{product\} personalized=\{personalized\}\/>/)
  assert.match(css, /\.pdp-delivery-badge\s*\{/)
  assert.match(css, /\.pdp-highlights\s*\{\s*padding:\s*36px/)
})

