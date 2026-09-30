import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = [
  await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
  await readFile(new URL('../src/ProductPage.jsx', import.meta.url), 'utf8')
].join('\n')
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

test('header controls have explicit names and minimum 44px interaction targets', () => {
  assert.match(source, /aria-label="Search teams, products and leagues"/)
  assert.match(source, /aria-label=\{`Open bag with \$\{bagCount\}/)
  assert.match(source, /aria-label="Extra Time home"/)
  assert.match(css, /\.icon-button \{[^}]*width:44px;[^}]*height:44px/)
  assert.match(css, /\.text-action \{[^}]*min-height:44px/)
  assert.match(css, /\.mark \{[^}]*min-height:44px/)
})

test('search ranks commerce intent and keeps bounded recent searches on the client', () => {
  assert.match(source, /discoverySearchScore\(b,query\) - discoverySearchScore\(a,query\)/)
  assert.match(source, /discoveryQueryVariants\(value,3\)/)
  assert.match(source, /extra-time-recent-searches-v1/)
  assert.match(source, /RECENT SEARCHES/)
  assert.match(source, /\.slice\(0,5\)/)
})

test('storefront emits the planned analytics events at customer actions and failure boundaries', async () => {
  const designer = await readFile(new URL('../src/CustomDesignerPage.jsx', import.meta.url), 'utf8')
  const checkout = await readFile(new URL('../src/CheckoutPage.jsx', import.meta.url), 'utf8')
  const tracking = await readFile(new URL('../src/OrderTrackingPage.jsx', import.meta.url), 'utf8')
  for (const event of ['search_submitted','filter_applied','product_card_clicked','pdp_viewed','add_to_bag','checkout_started','custom_cta_clicked','image_load_error','catalog_unavailable','search_zero_results']) {
    assert.match(source,new RegExp(`trackStorefrontEvent\\('${event}'`),event)
  }
  for (const event of ['designer_started','designer_completed','designer_load_error']) {
    assert.match(designer,new RegExp(`trackStorefrontEvent\\('${event}'`),event)
  }
  assert.match(checkout,/trackStorefrontEventOnce\('purchase_completed'/)
  assert.match(tracking,/trackStorefrontEventOnce\('purchase_completed'/)
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

test('PDP keeps a compact recent rail above commerce and team-aware suggestions below', () => {
  assert.match(source,/readRecentlyViewed/)
  assert.match(source,/className="pdp-recent"/)
  assert.match(source,/<PdpRecentlyViewed items=\{recentlyViewed\}\/>[\s\S]*?<div className="pdp__commerce"/)
  assert.match(source,/title="YOU MAY ALSO LIKE"/)
  assert.match(source,/suggestedContext/)
  assert.match(css,/\.pdp-recent__track\s*\{[^}]*overflow-x:\s*auto/)
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

test('homepage puts a detailed live product explorer directly after Custom', () => {
  assert.match(source, /function HomeProductDiscovery\(/)
  assert.match(source, /id="product-discovery"/)
  assert.match(source, /VIEW PRODUCT/)
  assert.match(source, /Available sizes/)
  assert.match(source, /Full 3D builder/)
  assert.match(source, /'product-discovery':<HomeProductDiscovery/)
  assert.match(source, /const customAt = Math\.max\(/)
  assert.match(source, /blocks = customAt < 0 \? \[\.\.\.blocks,next\] : \[\.\.\.blocks\.slice\(0,customAt \+ 1\),next/)
  assert.match(css, /\.home-product-discovery\s*\{[^}]*border-top: 8px solid var\(--ink\)/)
  assert.match(css, /\.home-product-discovery__panel\s*\{[^}]*grid-template-columns/)
  assert.match(css, /@media \(max-width: 780px\) \{[\s\S]*\.home-product-discovery__panel/)
})

test('mobile product explorer keeps the artwork and removes nonessential copy', () => {
  assert.match(source, /className="home-product-discovery__media-link"/)
  assert.match(source, /aria-label=\{route\.label\}/)
  assert.match(source, /aria-label=\{`View \$\{item\.name \|\| item\.title/)
  assert.match(css, /\.home-product-discovery__detail \{ display: none; \}/)
  assert.match(css, /\.home-product-discovery__media figcaption \{ display: none; \}/)
  assert.match(css, /\.home-product-discovery__lineup-track button > span \{ display: none; \}/)
  assert.match(css, /\.home-product-discovery__tabs button span,[\s\S]*?clip: rect\(0,0,0,0\)/)
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
