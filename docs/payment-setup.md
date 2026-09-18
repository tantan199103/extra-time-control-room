# Payment provider setup

The Admin Settings page now stores a provider-neutral payment configuration. It supports PayPal and Paddle, but saving configuration does not mark an order as paid and does not enable fulfillment by itself.

## PayPal

1. Create a REST app in PayPal Developer and copy its client ID into **Settings → Payment provider → PayPal client ID**.
2. Select `sandbox` while testing, or `live` only after the live app is approved.
3. Add these server-only environment variables in Vercel (never prefix them with `VITE_`):

   ```text
   PAYPAL_CLIENT_SECRET=…
   PAYPAL_WEBHOOK_ID=…
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

The Admin screen reports missing server keys. Checkout remains disabled until the provider-specific server credentials are present and the actual server-side order creation, stock reservation, capture/transaction flow and verified webhook handlers are deployed. This is deliberate: a client-side checkout callback is not proof of payment.
