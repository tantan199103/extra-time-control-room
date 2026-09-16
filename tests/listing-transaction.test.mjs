import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('listing migration and transaction run against isolated PostgreSQL', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001');
      create table storage.buckets(id text primary key,name text,public boolean);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    `)
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'))
    const migration=await readFile(new URL('../supabase/migrations/20260916_listing_foundation.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const scopedMigration=await readFile(new URL('../supabase/migrations/20260916_scoped_admin.sql',import.meta.url),'utf8')
    await db.exec(scopedMigration)
    await db.exec(scopedMigration)
    await db.exec(`grant usage on schema public,auth to authenticated,anon;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      set role authenticated;
      set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
      set request.jwt.claims = '{"app_metadata":{"role":"ADMIN","extra_time_role":"admin"}}';`)
    const listing={id:'qa-listing',title:'QA Listing',handle:'qa-listing',status:'PUBLISHED',image:'/assets/test.webp',price:89,options:[{name:'Size',values:['S','M']}],variants:[
      {id:'qa-small',sku:'QA-S',option_values:{Size:'S'},price:89,inventory:2,status:'ACTIVE'},
      {id:'qa-medium',sku:'QA-M',option_values:{Size:'M'},price:92,inventory:3,status:'ACTIVE'}
    ]}
    const save=async (value,stamp=null)=>(await db.query('select public.pod_save_listing($1::jsonb,$2::timestamptz) as result',[JSON.stringify(value),stamp])).rows[0].result
    let saved
    await t.test('authorized save creates product, options, variants and audit record together',async()=>{
      saved=await save(listing)
      assert.equal(saved.inventory,5)
      assert.equal(saved.pod_product_variants.length,2)
      assert.equal(saved.pod_product_options[0].pod_product_option_values.length,2)
      assert.equal((await db.query("select count(*)::int n from public.pod_audit_logs where entity_id='qa-listing'")).rows[0].n,1)
    })
    await t.test('new save cannot overwrite an existing listing without its revision',async()=>{
      await assert.rejects(save({...listing,title:'Overwrite'}),/changed elsewhere/)
    })
    await t.test('duplicate SKU failure rolls back even the parent product update',async()=>{
      const failed=structuredClone(listing); failed.title='Must not be saved'; failed.variants[1].sku='qa-s'
      await assert.rejects(save(failed,saved.updated_at),/duplicate key/)
      assert.equal((await db.query("select title from public.pod_products where id='qa-listing'")).rows[0].title,'QA Listing')
      assert.equal((await db.query("select count(*)::int n from public.pod_audit_logs where entity_id='qa-listing'")).rows[0].n,1)
    })
    await t.test('omitted variants are archived, stale option values removed and old revisions rejected',async()=>{
      const reduced={...listing,options:[{name:'Size',values:['S']}],variants:[listing.variants[0]]}
      const updated=await save(reduced,saved.updated_at)
      assert.equal(updated.pod_product_variants.find(row=>row.id==='qa-medium').status,'ARCHIVED')
      assert.equal(updated.pod_product_options[0].pod_product_option_values.length,1)
      await assert.rejects(save(reduced,saved.updated_at),/changed elsewhere/)
    })
    await t.test('invalid active combination and missing publication image are rejected',async()=>{
      await assert.rejects(save({...listing,id:'bad1',variants:[{...listing.variants[0],id:'bad-var',option_values:{Size:'XXL'}}]}),/does not match/)
      await assert.rejects(save({...listing,id:'bad2',image:'',variants:[]}),/Publishing requires/)
    })
    await t.test('customer and anonymous sessions cannot execute an admin write',async()=>{
      await db.exec(`set request.jwt.claims = '{"user_metadata":{"role":"admin"}}';`)
      await assert.rejects(save(listing),/Admin permission/)
      await db.exec('set role anon')
      await assert.rejects(save(listing),/permission denied/)
    })
    await t.test('generic admin role from another app does not grant Extra Time access',async()=>{
      await db.exec(`set role authenticated; set request.jwt.claims = '{"app_metadata":{"role":"ADMIN"}}';`)
      assert.equal((await db.query('select public.pod_is_admin() as allowed')).rows[0].allowed,false)
      await assert.rejects(save(listing),/Admin permission/)
      await assert.rejects(db.query("insert into public.pod_products(id,handle,title) values('forbidden','forbidden','Forbidden')"),/row-level security/)
      await db.exec(`set request.jwt.claims = '{"app_metadata":{"role":"admin"}}';`)
      assert.equal((await db.query('select public.pod_is_admin() as allowed')).rows[0].allowed,false)
    })
    await t.test('customer-editable scoped role is rejected and public catalogue reads still work',async()=>{
      await db.exec(`set request.jwt.claims = '{"user_metadata":{"extra_time_role":"admin"}}';`)
      await assert.rejects(save(listing),/Admin permission/)
      await db.exec('reset role; grant select on public.pod_products to anon; set role anon')
      const rows=(await db.query('select id,status from public.pod_products')).rows
      assert.ok(rows.length>0)
      assert.ok(rows.every(row=>row.status==='PUBLISHED'))
    })
  } finally { await db.close() }
})
