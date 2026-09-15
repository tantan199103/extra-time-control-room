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
- `/custom` — live SVG jersey builder with colour, name, number, team/city, year, optional photo, size, front/back, shareable URL and add-to-bag.
- `/vault` — archive for sold-out drops.
- `/admin` — control-room dashboard for catalog health, deployment pulse and recent activity.
- `/admin/catalog` — searchable product catalog with publish state, stock, price and template linkage.
- `/admin/products/:id` — product editor with live preview, publishing, price/stock, SEO-ready fields and personalization policy.
- `/admin/templates` — template builder where locked artwork layers and the allowed personalization slots are managed separately.
- `/admin/settings` — Supabase, GitHub and Vercel connection status plus safe environment setup notes.

The checkout, customer account and Shopify data layer are intentionally represented as frontend states. Connect these components to Shopify products, variants, cart endpoints, metafields and metaobjects for production commerce.

## Custom Lab constraint

Custom Lab is intentionally designer-led: 70% of the visual system (composition, typography, texture, effects and hierarchy) is locked. The 30% editable layer is limited to name, number, team/city, year, colour and an optional personal photo. Size remains a purchase variant rather than an artwork control.

The five original campaign/product images were generated with the built-in image generation tool from a shared art direction: anonymous football culture, original garments, no player, club, sponsor or trademark. The source PNG files are retained; the app serves optimized WebP derivatives.

## Supabase, GitHub and Vercel handoff

1. Create a Supabase project and run [`supabase/schema.sql`](<D:/APP Dự Án/custom pod/supabase/schema.sql>) in the SQL editor.
2. Copy [`.env.example`](<D:/APP Dự Án/custom pod/.env.example>) to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The admin UI uses preview data until both variables exist, then reads/writes `products` and `templates` through the Supabase adapter.
3. Push this folder to GitHub. The included [`.github/workflows/ci.yml`](<D:/APP Dự Án/custom pod/.github/workflows/ci.yml>) runs `npm ci` and `npm run build` on every push and pull request to `main`.
4. Import the GitHub repository into Vercel. `vercel.json` configures the Vite build and SPA rewrite so `/admin/*`, `/custom` and `/product/*` work on refresh. Add the same two `VITE_SUPABASE_*` variables in Vercel Project Settings before deploying.

The current environment does not contain a GitHub token or Vercel deployment token, so the repository/configuration handoff is prepared locally without attempting to publish to an external account.
