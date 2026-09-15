# Extra Time — Story Commerce prototype

An interactive storefront prototype built from the supplied football-culture / custom-POD direction.

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
- `/custom?product=:id` — mobile-first customer request form. It only shows the fields allowed by that listing plus an optional note and size.
- `/studio?product=:id` — optional prompt-based AI edit workspace. It always starts from the selected listing's main image.
- `/vault` — archive for sold-out drops.
- `/admin` — control-room dashboard for catalog health, deployment pulse and recent activity.
- `/admin/catalog` — searchable product catalog with publish state, stock, price and template linkage.
- `/admin/products/:id` — product editor with live preview, publishing, price/stock, SEO-ready fields and personalization policy.
- `/admin/templates` — template builder where locked artwork layers and the allowed personalization slots are managed separately.
- `/admin/settings` — Supabase, GitHub and Vercel connection status plus safe environment setup notes.

The checkout, customer account and Shopify data layer are intentionally represented as frontend states. Connect these components to Shopify products, variants, cart endpoints, metafields and metaobjects for production commerce.

## Customer customization flow

The customer-facing flow is intentionally short: open a listing, enter the available text details, leave an optional note and save the request. There is no canvas, layer panel, drag, resize or live typography editor. Each product's `customFields` array in [`src/data.js`](<D:/APP Dự Án/custom pod/src/data.js>) controls exactly which fields appear.

`Edit with AI` is an optional escape hatch for a bigger visual change. [`api/ai-preview.js`](<D:/APP Dự Án/custom pod/api/ai-preview.js>) resolves the requested product on the server, downloads that product's exact main image and sends it as the only image-edit reference. The returned image is stored with the customer request as a visual direction; it is not treated as a print-ready master. On submit, the form also attempts to insert the structured request into Supabase `customization_orders`; the cart remains usable if Supabase is not configured yet.

The five original campaign/product images were generated with the built-in image generation tool from a shared art direction: anonymous football culture, original garments, no player, club, sponsor or trademark. The source PNG files are retained; the app serves optimized WebP derivatives.

## Supabase, GitHub and Vercel handoff

1. Create a Supabase project and run [`supabase/schema.sql`](<D:/APP Dự Án/custom pod/supabase/schema.sql>) in the SQL editor.
2. Copy [`.env.example`](<D:/APP Dự Án/custom pod/.env.example>) to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The admin UI uses preview data until both variables exist, then reads/writes `products` and `templates` through the Supabase adapter.
3. Push this folder to GitHub. The included [`.github/workflows/ci.yml`](<D:/APP Dự Án/custom pod/.github/workflows/ci.yml>) runs `npm ci` and `npm run build` on every push and pull request to `main`.
4. Import the GitHub repository into Vercel. `vercel.json` configures the Vite build and SPA rewrite so `/admin/*`, `/custom`, `/studio` and `/product/*` work on refresh. Add the same two `VITE_SUPABASE_*` variables in Vercel Project Settings before deploying.

To connect the optional AI edit route, add `AI_IMAGE_API_KEY` and `AI_IMAGE_API_URL` as server-only Vercel variables. `AI_IMAGE_API_URL` should be your provider's OpenAI-compatible image-edit endpoint. The default model is `gpt-image-2`; override it with `AI_IMAGE_MODEL` if needed. Do not prefix these variables with `VITE_`, because that would expose them to the browser bundle.

The deterministic high-resolution renderer lives at [`api/render-artwork.js`](<D:/APP Dự Án/custom pod/api/render-artwork.js>) as a Vercel serverless function. Set `SUPABASE_SERVICE_ROLE_KEY` and (optionally) `SUPABASE_ARTWORK_BUCKET=artwork` only in Vercel server-side environment variables when you want rendered PNG masters uploaded to Supabase Storage. Keep the service-role key out of the browser.

The current production deployment is [extra-time-control-room.vercel.app](https://extra-time-control-room.vercel.app). It is running in preview-data mode until Supabase environment variables are added.

The workspace now has a local Git history and CI workflow. No GitHub remote is configured yet, so add the destination repository URL and push `main` to enable GitHub ↔ Vercel continuous deployment.

For the product-builder rationale and payload contract, read [`docs/template-engine.md`](<D:/APP Dự Án/custom pod/docs/template-engine.md>).
