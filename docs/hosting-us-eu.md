# Hosting audit for US and EU

Audit date: 2026-09-18. Public origin: `https://jersevo.com` (redirects to `https://www.jersevo.com`).

## Current result

- Vercel serves the Vite shell and static files through its global CDN. The audit request from Southeast Asia reached the `hkg1` edge POP and returned `X-Vercel-Cache: HIT`; that POP is the cache ingress, not the serverless execution region.
- The inspected production deployment runs Node functions in `iad1` (Washington, D.C.). This is a good default for the eastern US. EU users still cross the Atlantic for dynamic API requests.
- Before this release, the production deployment did not contain `api/payment-config.js` or `api/admin-payment-settings.js`; `/api/payment-config` fell through to the SPA shell. The current deployment now includes both routes: `/api/payment-config` returns JSON with `Cache-Control: no-store`, and payment/AI functions are confirmed in `iad1` with 15/30/60-second limits.
- The live JS bundle is about 594 KB before transfer compression and the CSS bundle is about 168 KB. Vite already splits the Admin and AI Studio routes, but the storefront entry remains large enough to warrant later bundle work.
- The Supabase project region cannot be inferred reliably from the public project URL, DNS or repository. It must be read in the Supabase Dashboard under project infrastructure/settings. Do not choose multi-region Functions until this is known: putting compute near users but far from PostgreSQL can increase total latency.

## Changes in this repository

- `vercel.json` now pins server functions to `iad1` and gives every API a bounded duration. PayPal/Paddle settings routes are explicitly limited to 15/30 seconds. Passive Function failover is intentionally not configured because Vercel restricts that feature to Enterprise plans.
- Static `/assets/*` and `/icons/*` receive a one-day browser cache plus seven-day stale-while-revalidate window. HTML, service worker, Admin and payment APIs are not given this policy.
- Unused high-resolution PNG source files now live under `source-assets/` instead of `public/assets/`; only the WebP delivery assets are emitted into `dist`.
- AI provider requests abort at 55 seconds, leaving time for a structured error before the 60-second Vercel function limit.
- `npm run audit:hosting -- https://www.jersevo.com` checks shell routes, service worker, manifest, payment configuration and the current hashed JS/CSS assets. It exits non-zero when a payment API is accidentally routed to the SPA or made cacheable.

## Region decision

Keep `iad1` as the primary function region until the Supabase region is verified. Then use this rule:

| Supabase primary region | Recommended Vercel Functions | Market effect |
| --- | --- | --- |
| US East | `iad1` | Best for US; acceptable but transatlantic dynamic latency for EU |
| EU West/Central | `fra1` or `lhr1` | Best for EU; transatlantic dynamic latency for US |
| One market is clearly dominant | Put functions next to the database | Lowest database round-trip and safest write behavior |
| Both US and EU require low dynamic latency | Add a measured multi-region/data replication design first | Do not enable two compute regions against one distant write-primary by assumption |

Static storefront files are already edge-delivered worldwide. The important unresolved factor is the distance between Vercel Functions and Supabase PostgreSQL/Storage, especially for Admin listing saves, uploads, order creation and verified payment webhooks.

## Production verification after deployment

1. Run `npm run audit:hosting -- https://www.jersevo.com` twice. The second run should show CDN hits for static assets.
2. `/api/payment-config` returns JSON with `Cache-Control: no-store` (`enabled:false` until a provider is intentionally configured). A `503` JSON response is acceptable until all server Supabase/payment environment variables are configured. HTML is never acceptable for this route.
3. Inspect the deployment with `vercel inspect <deployment-url> --json`. Confirm the payment functions exist and `deployedTo` contains the intended region.
4. Confirm the Supabase project region in its Dashboard, then benchmark an authenticated read and a small Storage upload from the chosen function region before changing placement.
5. Keep checkout disabled until order snapshots, inventory reservation, provider-side create/capture, verified idempotent webhooks and Admin order handling are deployed.
