# Payment provider setup

The Admin Settings page now stores a provider-neutral payment configuration. It supports PayPal and Paddle, but saving configuration does not mark an order as paid and does not enable fulfillment by itself.

## PayPal

1. Create a REST app in PayPal Developer and copy its client ID into **Settings → Payment provider → PayPal client ID**.
2. Select `sandbox` while testing, or `live` only after the live app is approved.
3. Add these server-only environment variables in Vercel (never prefix them with `VITE_`):

   ```text
   PAYPAL_CLIENT_SECRET=…
   PAYPAL_WEBHOOK_ID=…
   SITE_URL=https://www.jersevo.com
   ```

4. Configure PayPal webhooks for order approval/capture events and verify their signatures before updating an order. PayPal’s Orders API must be called from the server; the browser must not receive the secret.

## Paddle

1. Create a Paddle client-side token and enter it in **Settings → Payment provider → Paddle client token**.
2. Create Paddle prices and enter a JSON map from this store’s variant/product ID to each `pri_…` price ID:

   ```json
   { "variant-id": "pri_01…" }
   ```

3. Add these server-only environment variables:

   ```text
   PADDLE_API_KEY=…
   PADDLE_WEBHOOK_SECRET=…
   ```

4. Configure a Paddle notification destination for `transaction.paid` and `transaction.completed`. Verify the `Paddle-Signature` header against the raw request body and make webhook handling idempotent.

## Safety gate

The Admin screen reports missing server keys and keeps checkout fail-closed until the provider-specific server credentials are present. The deployed flow creates a pending reservation, performs provider-side order creation/capture, and accepts only verified idempotent webhook/capture confirmations as proof of payment. A client-side return URL is never treated as payment proof.

`SITE_URL` must be the canonical HTTPS storefront origin. It is used to build the PayPal return/cancel URLs; production requests are rejected rather than deriving those URLs from an arbitrary host header.
