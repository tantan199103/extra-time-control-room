import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('collection automation previews, backfills and routes future matching listings without removing manual membership', async () => {
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
    for (const file of [
      '../supabase/schema.sql',
      '../supabase/migrations/20260916_listing_foundation.sql',
      '../supabase/migrations/202609160002_scoped_admin.sql',
      '../supabase/migrations/202609160001_listing_workspace.sql',
      '../supabase/migrations/202609280003_collection_automation.sql'
    ]) await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'))

    await db.exec(`
      grant usage on schema public,auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      set role authenticated;
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      set request.jwt.claims='{"app_metadata":{"extra_time_role":"admin"}}';
      insert into public.pod_collections(id,handle,name,status) values ('auto-caps','auto-caps','Auto caps','DRAFT');
      insert into public.pod_products(id,handle,title,status,sku,tags,product_group,taxonomy,custom_fields)
      values
        ('auto-cap-1','auto-cap-1','Toronto Blue Jays Fitted Cap','PUBLISHED','AUTO-CAP-1',array['mlb','blue-jays'],'Caps','{"league":"MLB","team":"Toronto Blue Jays"}','[{"key":"name","label":"Name","type":"text"}]'),
        ('manual-jersey','manual-jersey','Manual Football Jersey','PUBLISHED','MANUAL-JERSEY',array['football'],'Jerseys','{"league":"NFL"}','[]');
      insert into public.pod_collection_products(collection_id,product_id,sort_order) values ('auto-caps','manual-jersey',0);
    `)

    const rules = {
      enabled:true, keywordMode:'ALL', includeKeywords:['blue jays','cap'], excludeKeywords:['kids'],
      searchFields:['title','tags'], status:'PUBLISHED', productGroup:'Caps', productType:'',
      league:'MLB', team:'Toronto Blue Jays', customizable:'YES'
    }
    const preview = (await db.query(
      'select public.pod_preview_collection_automation($1,$2::jsonb,40) result',
      ['auto-caps', JSON.stringify(rules)]
    )).rows[0].result
    assert.equal(preview.matchCount, 1)
    assert.equal(preview.newCount, 1)

    const applied = (await db.query(
      'select public.pod_apply_collection_automation($1,$2::jsonb) result',
      ['auto-caps', JSON.stringify(rules)]
    )).rows[0].result
    assert.equal(applied.addedCount, 1)
    assert.equal((await db.query("select count(*)::int n from public.pod_collection_products where collection_id='auto-caps'")).rows[0].n, 2)
    assert.equal((await db.query("select count(*)::int n from public.pod_collection_products where collection_id='auto-caps' and product_id='manual-jersey'")).rows[0].n, 1)

    await db.exec(`
      insert into public.pod_products(id,handle,title,status,sku,tags,product_group,taxonomy,custom_fields)
      values ('auto-cap-2','auto-cap-2','Toronto Blue Jays Club Cap','PUBLISHED','AUTO-CAP-2',array['mlb','blue-jays'],'Caps','{"league":"MLB","team":"Toronto Blue Jays"}','[{"key":"number","label":"Number","type":"number"}]');
    `)
    assert.equal((await db.query("select count(*)::int n from public.pod_collection_products where collection_id='auto-caps' and product_id='auto-cap-2'")).rows[0].n, 1)
  } finally {
    await db.close()
  }
})
