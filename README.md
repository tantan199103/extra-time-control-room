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
- `/admin/settings` — Supabase, GitHub and Vercel connection status plus safe environment setup notes.

Checkout, customer accounts, newsletter signup and several advanced admin controls are not connected. Unavailable controls are now disabled and labeled instead of silently doing nothing or displaying false success. No checkout/payment backend was added by the interaction repair.

Run `npm test` for the overlay, routing, unavailable-control and admin save-error regression checks. See `docs/interaction-audit.md` for the scope and remaining product work.

## Mobile app experience

The fixed mobile navigation moves out of the way while the customer scrolls down, returns immediately on upward scrolling, and returns after a short pause. Product-page purchase actions use the freed bottom space while the menu is hidden.

The storefront is installable as a Progressive Web App. [`public/manifest.webmanifest`](<D:/APP Dự Án/custom pod/public/manifest.webmanifest>) defines standalone display, home-screen icons and Shop/Custom shortcuts; [`public/sw.js`](<D:/APP Dự Án/custom pod/public/sw.js>) provides a network-first shell cache. The header install action uses the browser install prompt when supported and otherwise shows iOS/Android home-screen instructions plus native sharing.

## Customer customization flow

The customer-facing flow is intentionally short: open a listing, choose standard or personalized, enter the available text details, leave an optional note and add to bag without leaving the product page. There is no canvas, layer panel, drag, resize or live typography editor. Each product's `customFields` array in [`src/data.js`](<D:/APP Dự Án/custom pod/src/data.js>) controls exactly which fields appear.

`Edit with AI` is an optional escape hatch for a bigger visual change. It receives the current name, number, team/city, year, colour, printed message and note, then offers long-form prompts that can change several areas together. [`api/ai-preview.js`](<D:/APP Dự Án/custom pod/api/ai-preview.js>) resolves the requested product on the server, downloads that product's exact main image and sends it as the only image-edit reference. The returned image is stored with the customer request as a visual direction; it is not treated as a print-ready master. On submit, the PDP also attempts to insert the structured request into Supabase `customization_orders`; the cart remains usable if Supabase is not configured yet.

The five original campaign/product images were generated with the built-in image generation tool from a shared art direction: anonymous football culture, original garments, no player, club, sponsor or trademark. The source PNG files are retained; the app serves optimized WebP derivatives.

## Supabase, GitHub and Vercel handoff

1. Create a Supabase project and run [`supabase/schema.sql`](<D:/APP Dự Án/custom pod/supabase/schema.sql>) in the SQL editor. For an existing project, apply the files in [`supabase/migrations`](<D:/APP Dự Án/custom pod/supabase/migrations>) in filename order. `20260916_listing_workspace.sql` adds listing-owned content/media/custom fields, variation cost data, the atomic save contract and the protected `product-media` bucket without deleting legacy artwork-template data.
2. Copy [`.env.example`](<D:/APP Dự Án/custom pod/.env.example>) to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The admin UI uses preview data until both variables exist, then reads the isolated `pod_*` tables through the Supabase adapter. Admin writes remain protected by the `app_metadata.extra_time_role = 'admin'` policy.
3. Push this folder to GitHub. The included [`.github/workflows/ci.yml`](<D:/APP Dự Án/custom pod/.github/workflows/ci.yml>) runs `npm ci` and `npm run build` on every push and pull request to `main`.
4. Import the GitHub repository into Vercel. `vercel.json` configures the Vite build and SPA rewrite so `/admin/*`, `/custom`, `/studio` and `/product/*` work on refresh. Add the same two `VITE_SUPABASE_*` variables in Vercel Project Settings before deploying.

To connect the optional AI edit route through APIKEY.FUN, add `AI_IMAGE_API_KEY` as a server-only Vercel variable. The app defaults to `https://api.apikey.fan/v1/images/edits` with model `gpt-image-2`; `AI_IMAGE_API_URL` can still override the endpoint if APIKEY.FUN changes its production gateway. Do not use the `slb.apikey.fan` endpoint for this route because that gateway disables image generation. Never prefix the key with `VITE_`, because that would expose it to the browser bundle.

The Admin listing writer uses the same server-only APIKEY.FUN key by default and calls an OpenAI-compatible chat endpoint. Set `AI_TEXT_API_KEY`, `AI_TEXT_API_URL=https://api.apikey.fan/v1` and `AI_TEXT_MODEL` when you want a separate text model/key; otherwise it falls back to `AI_IMAGE_API_KEY` and `gpt-4.1-mini`. The server validates the Supabase access token and the scoped `app_metadata.extra_time_role = 'admin'` claim before forwarding a title, story or SEO request. AI output is always presented as a draft that an administrator must explicitly apply.

The deterministic high-resolution renderer lives at [`api/render-artwork.js`](<D:/APP Dự Án/custom pod/api/render-artwork.js>) as a Vercel serverless function. Set `SUPABASE_SERVICE_ROLE_KEY` and (optionally) `SUPABASE_ARTWORK_BUCKET=artwork` only in Vercel server-side environment variables when you want rendered PNG masters uploaded to Supabase Storage. Keep the service-role key out of the browser.

The production storefront is [www.jersevo.com](https://www.jersevo.com) (the Vercel project hostname remains available for deployment inspection). Admin adapters read the isolated `pod_*` Supabase tables, with preview fallbacks; writes require the admin JWT policy. The customer storefront still reads `src/data.js` and does not yet render published admin theme/menu/collection changes.

For the current US/EU placement, cache policy and post-deploy checks, see [`docs/hosting-us-eu.md`](<D:/APP Dự Án/custom pod/docs/hosting-us-eu.md>). Run `npm run audit:hosting -- https://www.jersevo.com` after a production deployment; the check fails if a payment API is routed to the SPA shell or becomes cacheable.

For Google indexing, canonical URLs, initial product HTML and the US launch checklist, see [`docs/seo-us-indexing.md`](<D:/APP Dự Án/custom pod/docs/seo-us-indexing.md>).

The workspace has a local Git history, CI workflow and an `origin` remote targeting the private `tantan199103/extra-time-control-room` repository. Push `main` after completing Git Credential Manager authentication to enable GitHub ↔ Vercel continuous deployment.

For the product-builder rationale and payload contract, read [`docs/template-engine.md`](<D:/APP Dự Án/custom pod/docs/template-engine.md>).
