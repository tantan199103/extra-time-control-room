import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { normalizeCheckoutLines, normalizeCustomer, normalizeShipping, issueQuoteToken, verifyQuoteToken } from '../api/_checkout.js'

test('checkout input is normalized and quote tokens are tamper-evident', () => {
  process.env.CHECKOUT_SIGNING_SECRET = 'test-checkout-secret'
  const lines = normalizeCheckoutLines([{ productId: 'p', variantId: 'v', qty: 2, customization: { fields: { name: 'TAN' }, note: 'hi' } }])
  assert.equal(lines[0].qty, 2)
  assert.equal(lines[0].customization.fields.name, 'TAN')
  assert.throws(() => normalizeCustomer({ email: 'bad', name: 'T' }), /valid email/)
  assert.equal(normalizeShipping({ country: 'us', method: 'EXPRESS' }, { requireAddress: false }).country, 'US')
  assert.equal(normalizeShipping({ country:'US', method:'STANDARD', state:'Texas' }, { requireAddress:false }).state, 'TX')
  assert.equal(normalizeShipping({ country:'CA', method:'STANDARD', state:'Ontario' }, { requireAddress:false }).state, 'ON')
  assert.throws(() => normalizeShipping({ country:'US', method:'STANDARD', state:'Taxas' }, { requireAddress:false }), /valid US state/i)
  const token = issueQuoteToken({ version: 1, total: 42 })
  assert.equal(verifyQuoteToken(token).total, 42)
  assert.throws(() => verifyQuoteToken(`${token}x`), /no longer valid/)
})

test('checkout migration creates isolated commerce order tables and guarded RPCs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid);
      alter table storage.objects enable row level security;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    `)
    for (const file of ['supabase/schema.sql','supabase/migrations/20260916_listing_foundation.sql','supabase/migrations/20260916_scoped_admin.sql','supabase/migrations/20260916_listing_workspace.sql','supabase/migrations/20260916_storefront_runtime.sql','supabase/migrations/20260918_cart_validation_quota.sql','supabase/migrations/20260918_storefront_alignment.sql','supabase/migrations/20260918_customization_assets.sql','supabase/migrations/20260918_payment_settings.sql','supabase/migrations/20260919_checkout_orders.sql']) await db.exec(await readFile(file, 'utf8'))
    const tables = (await db.query("select table_name from information_schema.tables where table_name in ('pod_orders','pod_order_lines','pod_order_events') order by table_name")).rows.map(row => row.table_name)
    assert.deepEqual(tables, ['pod_order_events','pod_order_lines','pod_orders'])
    const functions = (await db.query("select routine_name from information_schema.routines where routine_name in ('pod_admin_update_order_fulfillment','pod_create_pending_order','pod_finalize_order_payment','pod_expire_pending_orders','pod_mark_order_payment_pending') order by routine_name")).rows.map(row => row.routine_name)
    assert.deepEqual(functions, ['pod_admin_update_order_fulfillment','pod_create_pending_order','pod_expire_pending_orders','pod_finalize_order_payment','pod_mark_order_payment_pending'])
    const columns = (await db.query("select column_name from information_schema.columns where table_name='pod_orders'")).rows.map(row => row.column_name)
    for (const name of ['order_number','payment_status','fulfillment_status','tracking_token_hash','idempotency_key','expires_at']) assert.ok(columns.includes(name))
    const seeded = (await db.query("select p.id product_id,v.id variant_id,v.sku,v.price,v.inventory from public.pod_products p join public.pod_product_variants v on v.product_id=p.id where p.status='PUBLISHED' and v.status='ACTIVE' and v.inventory>0 limit 1")).rows[0]
    assert.ok(seeded)
    const payload = { orderNumber:'ET-TEST-001', sessionHash:'a'.repeat(64), customerEmail:'buyer@example.com', customerName:'Test Buyer', shippingAddress:{ country:'US', address1:'1 Test Way', city:'Austin', postalCode:'78701', method:'STANDARD' }, currency:'USD', paymentProvider:'PAYPAL', quoteHash:'q', idempotencyKey:'checkout_test_123456', trackingTokenHash:'t'.repeat(64), totals:{ subtotal:Number(seeded.price), publicSubtotal:Number(seeded.price), discount:0, shipping:0, tax:0, total:Number(seeded.price) }, lines:[{ lineKey:'one', variantId:seeded.variant_id, qty:1, publicUnit:Number(seeded.price), finalUnit:Number(seeded.price), customization:{} }] }
    const created = (await db.query('select public.pod_create_pending_order($1::jsonb) order_json', [JSON.stringify(payload)])).rows[0].order_json
    assert.equal(created.status, 'PENDING_PAYMENT')
    assert.equal((await db.query('select reserved_inventory from public.pod_product_variants where id=$1',[seeded.variant_id])).rows[0].reserved_inventory, 1)
    const finalized = (await db.query('select public.pod_finalize_order_payment($1::uuid,$2,$3,$4,$5::jsonb) order_json', [created.id, 'PAID', 'pay_test', 'event_test', '{}'])).rows[0].order_json
    assert.equal(finalized.payment_status, 'PAID')
    assert.equal((await db.query('select inventory,reserved_inventory from public.pod_product_variants where id=$1',[seeded.variant_id])).rows[0].reserved_inventory, 0)
    const duplicate = (await db.query('select public.pod_finalize_order_payment($1::uuid,$2,$3,$4,$5::jsonb) order_json', [created.id, 'PAID', 'pay_test', 'event_test', '{}'])).rows[0].order_json
    assert.equal(duplicate.replayed, true)
    const processing = (await db.query('select public.pod_admin_update_order_fulfillment($1::uuid,$2,$3,$4,$5,$6) order_json', [created.id, 'IN_PROGRESS', null, null, null, '00000000-0000-0000-0000-000000000001'])).rows[0].order_json
    assert.equal(processing.fulfillment_status, 'IN_PROGRESS')
    const shipped = (await db.query('select public.pod_admin_update_order_fulfillment($1::uuid,$2,$3,$4,$5,$6) order_json', [created.id, 'SHIPPED', 'UPS', '1ZTEST', 'https://www.ups.com/track?loc=en_US&tracknum=1ZTEST', '00000000-0000-0000-0000-000000000001'])).rows[0].order_json
    assert.equal(shipped.status, 'SHIPPED')
    const delivered = (await db.query('select public.pod_admin_update_order_fulfillment($1::uuid,$2,$3,$4,$5,$6) order_json', [created.id, 'DELIVERED', 'UPS', '1ZTEST', 'https://www.ups.com/track?loc=en_US&tracknum=1ZTEST', '00000000-0000-0000-0000-000000000001'])).rows[0].order_json
    assert.equal(delivered.fulfillment_status, 'DELIVERED')
    await assert.rejects(() => db.query('select public.pod_admin_update_order_fulfillment($1::uuid,$2,$3,$4,$5,$6)', [created.id, 'CANCELLED', null, null, null, '00000000-0000-0000-0000-000000000001']), /Paid orders need a refund workflow/)
    const pendingPayload = { ...payload, orderNumber:'ET-TEST-002', idempotencyKey:'checkout_test_223456' }
    const pending = (await db.query('select public.pod_create_pending_order($1::jsonb) order_json', [JSON.stringify(pendingPayload)])).rows[0].order_json
    const marked = (await db.query('select public.pod_mark_order_payment_pending($1::uuid,$2,$3,$4::jsonb) order_json', [pending.id, 'pending_pay', 'pending_event', '{}'])).rows[0].order_json
    assert.equal(marked.payment_status, 'AUTHORIZED')
    const paidPending = (await db.query('select public.pod_finalize_order_payment($1::uuid,$2,$3,$4,$5::jsonb) order_json', [pending.id, 'PAID', 'pending_pay', 'pending_complete', '{}'])).rows[0].order_json
    assert.equal(paidPending.payment_status, 'PAID')
    const expiredPayload = { ...payload, orderNumber:'ET-TEST-003', idempotencyKey:'checkout_test_334567' }
    const expired = (await db.query('select public.pod_create_pending_order($1::jsonb) order_json', [JSON.stringify(expiredPayload)])).rows[0].order_json
    await db.query("update public.pod_orders set expires_at=now()-interval '1 minute' where id=$1", [expired.id])
    await db.query('select public.pod_expire_pending_orders()')
    const lateCapture = (await db.query('select public.pod_finalize_order_payment($1::uuid,$2,$3,$4,$5::jsonb) order_json', [expired.id, 'PAID', 'late_pay', 'late_event', '{}'])).rows[0].order_json
    assert.equal(lateCapture.status, 'EXPIRED')
    assert.notEqual(lateCapture.payment_status, 'PAID')
    assert.equal((await db.query("select has_table_privilege('authenticated','public.pod_orders','select')")).rows[0].has_table_privilege, false)
  } finally { await db.close() }
})
