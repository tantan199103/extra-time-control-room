# Hybrid API deployment

## Runtime split

| Traffic | Runtime | Routes |
| --- | --- | --- |
| Lightweight, database-authoritative | Supabase Edge Functions | `cart-validate`, `member-quote`, `checkout-quote`, `membership-enroll` |
| Upload/image/AI/payment/admin | Node (`api.jersevo.com`) | customer upload, AI preview/copy, customization, checkout quote fallback/create, payment capture/cancel/webhook, order tracking, admin APIs |
| SEO shell | Vercel | Vite static output and `sitemap.xml` |

The browser only sees the two public origins. Supabase service-role, AI and
payment secrets stay in Edge/Node environment variables. The existing `api/`
handlers remain in the repository so local tests and rollback are possible;
`.vercelignore` keeps them out of the Vercel production bundle. Vercel rewrites
`/api/*` to `https://api.jersevo.com/api/*` as a last-resort compatibility path.

## Supabase Edge Functions

From the project root:

```bash
supabase login
supabase link --project-ref PROJECT_REF
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... NODE_BACKEND_URL=https://api.jersevo.com ALLOWED_ORIGINS=https://www.jersevo.com,https://jersevo.com
supabase functions deploy cart-validate
supabase functions deploy member-quote
supabase functions deploy checkout-quote
supabase functions deploy membership-enroll
```

Run the SQL migrations before deploying. `checkout-quote` is intentionally a
thin Edge gateway to the Node quote implementation so signing, tax, shipping
and stock logic have one source of truth. The Node runtime also exposes the
same route as a direct fallback when the Edge origin is not configured. If the
Node URL is unavailable it fails closed with `503`; it never falls back to
client totals.

## Node backend trên Cloud Run

```bash
copy .env.example .env
npm run backend:dev
# or
npm run backend:docker
```

Required server variables:

```env
PORT=8787
ALLOWED_ORIGINS=https://www.jersevo.com,https://jersevo.com
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-key
CHECKOUT_SIGNING_SECRET=random-long-secret
```

Add the server-only AI, PayPal and Paddle values from `.env.example`. Deploy
the container with [deploy/cloudrun/README.md](<D:/APP Dự Án/custom pod/deploy/cloudrun/README.md>), then map `api.jersevo.com` and configure PayPal/Paddle webhooks at:

```text
https://api.jersevo.com/api/payment-webhook
```

The `/health` endpoint is safe for an uptime monitor and returns no secrets.
The `/ready` endpoint returns `503` until Supabase, checkout signing and the
origin allowlist are configured. It only reports missing variable names.
Cloud Run owns HTTPS, scaling and container restarts. The older Docker Compose
and Caddy files remain as a self-hosted fallback, but are not needed for the
Cloud Run deployment.

## Frontend variables

Set these in Vercel (and `.env.local` for a local hybrid test):

```env
VITE_SUPABASE_FUNCTIONS_URL=https://PROJECT.supabase.co/functions/v1
VITE_BACKEND_URL=https://api.jersevo.com
```

After changing variables, redeploy the frontend. Verify in the browser network
panel that cart/member/quote calls use the Supabase Functions URL and upload,
AI, admin, checkout-create and payment calls use `api.jersevo.com`.

## Safe rollout

1. Run `npm test`, `npm run build` and `npm run backend:dev` locally.
2. Deploy Node and check `GET https://api.jersevo.com/health`.
3. Deploy Edge Functions and run one cart validation plus one member quote.
4. Configure frontend variables and test checkout in PayPal sandbox. Confirm
   the payment webhook receives the original raw body and duplicate events are
   idempotent.
5. Only then enable production payment settings. The addon and checkout code
   never publish a listing automatically.

For rollback, remove the two `VITE_*` hybrid variables and restore the previous
Vercel API deployment; the same handler contracts remain available locally.
