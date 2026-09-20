# Extra Time — Story Commerce prototype

Custom POD storefront and control room, built from the supplied football-culture direction.

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
npm run preview
```

## Implemented routes

- `/` — campaign-led homepage, drop, product rail, Story Explorer, player discovery, Custom Lab teaser, Vault and early access.
- `/shop` — responsive collection page with colour filters and sorting.
- `/product/after-90` — editorial PDP, size recommender, product story, interactive details and cart flow.
- `/product/:id?custom=1` — product detail with personalization opened inline. `/custom?product=:id` is kept as a compatibility redirect into the same product page.
- `/studio?product=:id` — optional prompt-based AI edit workspace. It starts from the selected listing's main image and carries the product-page draft into long-form prompt suggestions.
- `/vault` — archive for sold-out drops.
- `/admin` — control-room dashboard for catalog health, deployment pulse and recent activity.
- `/admin/theme` — storefront Theme Studio with page selection, live desktop/mobile preview, editable copy, global design tokens and ordered section blocks.
- `/admin/theme/menus` — header, footer and fixed-mobile navigation builder with link types, visibility, ordering and responsive preview.
- `/admin/collections` — collection editor for content, merchandising order and product assignment.
- `/admin/catalog` — searchable listing catalogue with status, group, tag and automatically derived sale/stock/media filters plus one-click duplication.
- `/admin/products/:id` — the Listing Workspace for Story/SEO, direct image/video upload, rich content blocks, SKU-level variations and bulk pricing, structured customer fields, catalogue routing and AI-assisted copy.
- `/admin/orders` — protected order queue with payment read-only status, fulfillment stages, carrier/tracking updates and an auditable order detail view.
- `/admin/settings` — Supabase, GitHub and Vercel connection status plus safe environment setup notes.
- `/checkout` — server-priced checkout. The browser submits customer and delivery details, then is redirected to the configured payment provider. A pending order is not a paid order.
- `/track-order` and `/order/:orderNumber?token=...` — private order tracking using the order number plus the high-entropy private token returned after checkout. The order number alone never exposes customer data; the result can copy a shareable tracking link and refresh pending provider settlement.
- `/about`, `/shipping`, `/returns`, `/warranty`, `/privacy`, `/terms`, `/accessibility` and `/journal` — public, image-led launch pages for studio context, delivery, returns, defect review, privacy, purchase terms, accessibility and editorial trust. The operator is identified as Jersevo, with `support@jersevo.com` and Texas, United States as the current public location. These pages are included in the generated static HTML and sitemap. Add only a verified physical or mailing address; never publish a generated address.

Checkout and order tracking are connected through server-side Vercel functions and Supabase RPCs. Prices, member discounts, stock, shipping and tax are recalculated on the server; the client total is never authoritative. Checkout creates a `PENDING_PAYMENT` reservation only. The order becomes `CONFIRMED`/`PAID` after a verified PayPal capture or webhook. Failed, cancelled and expired attempts release reserved inventory. The Admin payment field is read-only; fulfillment cannot enter production or shipping until payment is provider-confirmed.

If a shopper cancels or receives a definitive payment failure, the next attempt gets a new idempotency key and reservation. Ambiguous provider responses keep the original order visible in tracking so the shopper is never prompted to pay twice. Set `SITE_URL` to the canonical HTTPS storefront origin; provider return URLs are never derived from an untrusted production `Host` header.

For local checkout API routes, use Vercel's runtime rather than the Vite-only server:

```bash
npx vercel dev --listen 5174
```

`npm run dev` remains useful for UI-only work, but it does not execute the files in `api/`; checkout quote requests will intentionally fail closed in that mode.

Run `npm test` for the overlay, routing, unavailable-control and admin save-error regression checks. See `docs/interaction-audit.md` for the scope and remaining product work.

## Mobile app experience

The fixed mobile navigation moves out of the way while the customer scrolls down, returns immediately on upward scrolling, and returns after a short pause. Product-page purchase actions use the freed bottom space while the menu is hidden.

The storefront is installable as a Progressive Web App. [`public/manifest.webmanifest`](<D:/APP Dự Án/custom pod/public/manifest.webmanifest>) defines standalone display, home-screen icons and Shop/Custom shortcuts; [`public/sw.js`](<D:/APP Dự Án/custom pod/public/sw.js>) provides a network-first shell cache. The header install action uses the browser install prompt when supported and otherwise shows iOS/Android home-screen instructions plus native sharing.

## Customer customization flow

The customer-facing flow is intentionally short: open a listing, choose standard or personalized, enter the available text details, leave an optional note and add to bag without leaving the product page. There is no canvas, layer panel, drag, resize or live typography editor. Each product's `customFields` array in [`src/data.js`](<D:/APP Dự Án/custom pod/src/data.js>) controls exactly which fields appear.

`Edit with AI` is an optional escape hatch for a bigger visual change. It receives the current name, number, team/city, year, colour, printed message and note, then offers long-form prompts that can change several areas together. [`api/ai-preview.js`](<D:/APP Dự Án/custom pod/api/ai-preview.js>) resolves the requested product on the server, downloads that product's exact main image and sends it as the only image-edit reference. The returned image is stored with the customer request as a visual direction; it is not treated as a print-ready master. On submit, the PDP also attempts to insert the structured request into Supabase `customization_orders`; the cart remains usable if Supabase is not configured yet.

Team-logo personalization follows the same locked-artwork rule without opening Studio. An administrator adds a `Team logo` custom field in the Listing Workspace, defines its designer-approved rectangle on the primary listing image and publishes the listing. A customer uploads a PNG, SVG, JPG or WebP (kept in the private `customer-references` bucket); the server creates an exact placement preview first, preserving the uploaded logo and every pixel outside the approved rectangle. `Try AI fabric finish` is optional and preview-only: the generated surface is validated against the locked image and the original logo is composited back over the result. The customer must confirm usage permission, and private asset URLs are masked in cart, checkout and order tracking views.

The five original campaign/product images were generated with the built-in image generation tool from a shared art direction: anonymous football culture, original garments, no player, club, sponsor or trademark. The source PNG files are retained; the app serves optimized WebP derivatives.

## Supabase, GitHub and Vercel handoff

1. Create a Supabase project and run [`supabase/schema.sql`](<D:/APP Dự Án/custom pod/supabase/schema.sql>) in the SQL editor. For an existing project, apply the files in [`supabase/migrations`](<D:/APP Dự Án/custom pod/supabase/migrations>) in filename order. `202609160001_listing_workspace.sql` adds listing-owned content/media/custom fields, variation cost data, the atomic save contract and the protected `product-media` bucket without deleting legacy artwork-template data. `20260919_checkout_orders.sql` adds pending-order reservations, secure tracking hashes, payment/fulfillment events and the guarded order RPCs. `20260920_menu_navigation_media.sql` adds nested menu media overrides, page representative images and the atomic menu-tree save contract; Auto thumbnails continue to follow the linked listing/page at runtime. `20260925_logo_customization.sql` adds private logo-preview metadata and raises the private customer-reference bucket limit to 10 MB. Apply it before enabling a published `Team logo` field.
2. Copy [`.env.example`](<D:/APP Dự Án/custom pod/.env.example>) to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The admin UI uses preview data until both variables exist, then reads the isolated `pod_*` tables through the Supabase adapter. Admin writes remain protected by the `app_metadata.extra_time_role = 'admin'` policy.
3. Push this folder to GitHub. The included [`.github/workflows/ci.yml`](<D:/APP Dự Án/custom pod/.github/workflows/ci.yml>) runs `npm ci` and `npm run build` on every push and pull request to `main`.
4. Import the GitHub repository into Vercel. `vercel.json` configures the Vite build and SPA rewrite so `/admin/*`, `/custom`, `/studio` and `/product/*` work on refresh. Add the same two `VITE_SUPABASE_*` variables in Vercel Project Settings before deploying.

5. Configure payments only after the migration is applied and a sandbox order has been exercised end-to-end. In Admin → Settings, choose PayPal and save the public client ID. In Vercel/Cloud Run, add `SUPABASE_URL` (or keep `VITE_SUPABASE_URL` as the server fallback), `SUPABASE_SERVICE_ROLE_KEY`, `CHECKOUT_SIGNING_SECRET`, `SITE_URL`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID`. Register `/api/payment-webhook` with PayPal and test create → approve → capture → webhook retry. Keep the provider disabled until the readiness panel shows all required server variables. Paddle is intentionally fail-closed for this physical-goods checkout until a shipping-capable adapter is implemented; configuring a Paddle token alone must not create an order.

6. After deployment, verify these invariants: `/api/checkout-quote` and `/api/order-track` return JSON with `Cache-Control: no-store`; a cancelled return releases the reservation; duplicate capture/webhook delivery is idempotent; a customer with only an order number cannot look up an order; and Admin cannot mark an unpaid order as in production, shipped or delivered. Confirm the public trust pages and their images at `/about`, `/shipping`, `/returns`, `/warranty`, `/privacy`, `/terms`, `/accessibility` and `/journal`, then submit `/sitemap.xml` in Google Search Console. Run `npm test`, `npm run build` and `npm run audit:hosting -- https://www.jersevo.com` before enabling live payments.

To connect the optional AI edit route through APIKEY.FUN, add `AI_IMAGE_API_KEY` as a server-only Vercel variable. The app defaults to `https://api.apikey.fan/v1/images/edits` with model `gpt-image-2`; `AI_IMAGE_API_URL` can still override the endpoint if APIKEY.FUN changes its production gateway. Do not use the `slb.apikey.fan` endpoint for this route because that gateway disables image generation. Never prefix the key with `VITE_`, because that would expose it to the browser bundle.

The Admin listing writer uses the same server-only APIKEY.FUN key by default and calls an OpenAI-compatible chat endpoint. Set `AI_TEXT_API_KEY`, `AI_TEXT_API_URL=https://api.apikey.fan/v1` and `AI_TEXT_MODEL` when you want a separate text model/key; otherwise it falls back to `AI_IMAGE_API_KEY` and `gpt-4.1-mini`. The server validates the Supabase access token and the scoped `app_metadata.extra_time_role = 'admin'` claim before forwarding a title, story or SEO request. AI output is always presented as a draft that an administrator must explicitly apply.

In Admin → Catalog → a listing → Story & SEO, `Review entire listing` runs a guarded full audit. It sends the listing title, story, SEO fields, customer-editable fields, rich-content blocks and up to ten public HTTPS product images to the vision-capable text model, always placing the primary listing image first. The response includes content/media scores, concise priority fixes, normalized title/story/SEO suggestions and controlled image gaps (`model-front`, `model-back`, `model-street`, `model-detail`, `model-matchday`, `custom-guide`). The server records the exact number of image references it actually sent; it never trusts a model-claimed count. Nothing is saved until an administrator chooses `Apply content draft`, and recommended image generation remains a separate, reviewable action. Generated media uses the existing locked-artwork reference contract and must be saved before it is published.

### Hybrid API runtime

The storefront now supports a split runtime: cart validation, member pricing, checkout quote and membership enrollment can run as Supabase Edge Functions; upload/image processing, AI, admin, checkout creation and payment/webhooks run on Node in Cloud Run at `api.jersevo.com`. Configure `VITE_SUPABASE_FUNCTIONS_URL`, `VITE_BACKEND_URL` and the server-only `ALLOWED_ORIGINS` values from [`.env.example`](<D:/APP Dự Án/custom pod/.env.example>). The browser routes through [`src/lib/api-client.js`](<D:/APP Dự Án/custom pod/src/lib/api-client.js>), so removing either public URL restores the same-origin `/api/*` fallback. See [`deploy/cloudrun/README.md`](<D:/APP Dự Án/custom pod/deploy/cloudrun/README.md>) for Google Cloud, Secret Manager, DNS and rollback steps.

The deterministic high-resolution renderer lives at [`api/render-artwork.js`](<D:/APP Dự Án/custom pod/api/render-artwork.js>) as a Vercel serverless function. Set `SUPABASE_SERVICE_ROLE_KEY` and (optionally) `SUPABASE_ARTWORK_BUCKET=artwork` only in Vercel server-side environment variables when you want rendered PNG masters uploaded to Supabase Storage. Keep the service-role key out of the browser.

The production storefront is [www.jersevo.com](https://www.jersevo.com) (the Vercel project hostname remains available for deployment inspection). Admin adapters read the isolated `pod_*` Supabase tables, with preview fallbacks; writes require the admin JWT policy. When the public Supabase keys are configured, the customer storefront consumes the published `pod_*` catalogue, menus, collections and theme; local preview mode falls back to `src/data.js`.

For the current US/EU placement, cache policy and post-deploy checks, see [`docs/hosting-us-eu.md`](<D:/APP Dự Án/custom pod/docs/hosting-us-eu.md>). Run `npm run audit:hosting -- https://www.jersevo.com` after a production deployment; the check fails if a payment API is routed to the SPA shell or becomes cacheable.

For Google indexing, canonical URLs, initial product HTML and the US launch checklist, see [`docs/seo-us-indexing.md`](<D:/APP Dự Án/custom pod/docs/seo-us-indexing.md>).

The workspace has a local Git history, CI workflow and an `origin` remote targeting the private `tantan199103/extra-time-control-room` repository. Push `main` after completing Git Credential Manager authentication to enable GitHub ↔ Vercel continuous deployment.

For the product-builder rationale and payload contract, read [`docs/template-engine.md`](<D:/APP Dự Án/custom pod/docs/template-engine.md>).
