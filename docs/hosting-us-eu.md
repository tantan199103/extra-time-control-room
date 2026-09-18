# Hosting audit for US and EU

Audit date: 2026-09-18. Public origin: `https://jersevo.com` (redirects to `https://www.jersevo.com`).

## Current result

- Vercel serves the Vite shell and static files through its global CDN. The audit request from Southeast Asia reached the `hkg1` edge POP and returned `X-Vercel-Cache: HIT`; that POP is the cache ingress, not the serverless execution region.
- The Vercel deployment serves a small payment-adjacent fallback in `iad1` (Washington, D.C.) while the dedicated Node API is provisioned. The heavy AI/upload/admin routes are intentionally routed to Cloud Run at `api.jersevo.com`; EU users will cross the Atlantic for dynamic requests until the API region is measured.
- Before this release, the production deployment did not contain `api/payment-config.js` or `api/admin-payment-settings.js`; `/api/payment-config` fell through to the SPA shell. The current deployment includes the checkout/payment/tracking fallback routes: `/api/payment-config` returns JSON with `Cache-Control: no-store`. The live payment response remains disabled until Supabase migrations and server secrets are present.
- The live JS bundle is about 594 KB before transfer compression and the CSS bundle is about 168 KB. Vite already splits the Admin and AI Studio routes, but the storefront entry remains large enough to warrant later bundle work.
- The Supabase project region cannot be inferred reliably from the public project URL, DNS or repository. It must be read in the Supabase Dashboard under project infrastructure/settings. Do not choose multi-region Functions until this is known: putting compute near users but far from PostgreSQL can increase total latency.

## Changes in this repository

- `vercel.json` pins the Vercel fallback functions to `iad1` with bounded 15/30-second durations. `.vercelignore` keeps heavy API handlers out of Vercel; those handlers run in the Cloud Run container described in [`deploy/cloudrun/README.md`](<D:/APP Dự Án/custom pod/deploy/cloudrun/README.md>). Passive Function failover is intentionally not configured because Vercel restricts that feature to Enterprise plans.
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
3. Inspect the deployment with `vercel inspect <deployment-url> --json`. Confirm the fallback payment functions exist and `deployedTo` contains the intended region; separately verify Cloud Run `/health` and `/ready` once `api.jersevo.com` is mapped.
4. Confirm the Supabase project region in its Dashboard, then benchmark an authenticated read and a small Storage upload from the chosen function region before changing placement.
5. Keep the payment provider disabled until order snapshots, inventory reservation, provider-side create/capture, verified idempotent webhooks and Admin order handling have been exercised in sandbox. Once those checks pass, enable the provider deliberately; the storefront still fail-closes whenever server readiness is incomplete.
