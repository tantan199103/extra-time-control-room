-- Stripe hosted Checkout uses the same order reservation/finalization RPCs as
-- PayPal. Extend the provider allow-list for databases that already ran the
-- checkout migration.
alter table public.pod_orders drop constraint if exists pod_orders_payment_provider_check;
alter table public.pod_orders
  add constraint pod_orders_payment_provider_check
  check (payment_provider in ('NONE','PAYPAL','STRIPE','PADDLE'));

comment on column public.pod_orders.payment_provider is 'Server-side payment adapter: NONE, PAYPAL, STRIPE or PADDLE';
