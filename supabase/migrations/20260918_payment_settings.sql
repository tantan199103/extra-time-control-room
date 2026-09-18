-- Payment provider configuration is intentionally metadata-only.
-- Public client identifiers/tokens and Paddle price mappings may be stored here;
-- PayPal secrets, Paddle API keys and webhook secrets stay in server environment variables.
begin;

insert into public.pod_store_settings(key, value, updated_at)
values (
  'payment',
  jsonb_build_object(
    'schemaVersion', '1.0',
    'enabled', false,
    'provider', 'NONE',
    'environment', 'sandbox',
    'currency', 'USD',
    'paypal', jsonb_build_object('clientId', ''),
    'paddle', jsonb_build_object('clientToken', '', 'priceMap', '{}'::jsonb)
  ),
  now()
)
on conflict (key) do nothing;

commit;
