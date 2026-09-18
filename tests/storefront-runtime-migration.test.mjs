import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('storefront runtime migration provides atomic configuration and secured request primitives', async () => {
  const db=new PGlite()
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
    for(const file of ['../supabase/schema.sql','../supabase/migrations/20260916_listing_foundation.sql','../supabase/migrations/20260916_scoped_admin.sql','../supabase/migrations/20260916_listing_workspace.sql','../supabase/migrations/20260916_storefront_runtime.sql','../supabase/migrations/20260918_cart_validation_quota.sql','../supabase/migrations/20260918_storefront_alignment.sql','../supabase/migrations/20260918_customization_assets.sql','../supabase/migrations/20260918_payment_settings.sql','../supabase/migrations/20260920_menu_navigation_media.sql']) {
      await db.exec(await readFile(new URL(file,import.meta.url),'utf8'))
    }
    const migratedCustom=(await db.query("select custom_fields,template_id from public.pod_products where id='touchline'")).rows[0]
    assert.deepEqual(migratedCustom.custom_fields.map(field=>field.key),['name','number','teamCity','year','color','photo'])
    assert.equal(migratedCustom.template_id,null)
    await db.exec(`grant usage on schema public,auth to authenticated,anon;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      grant usage,select on all sequences in schema public to authenticated;
      set role authenticated;
      set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      set request.jwt.claims='{"app_metadata":{"extra_time_role":"admin"}}';`)

    const menus=[{id:'runtime-main',name:'Main',location:'Header / desktop + mobile',status:'PUBLISHED',items:[{id:'runtime-shop',label:'Shop',target:'/shop',type:'PAGE',visible:true,sortOrder:0,children:[]}]}]
    await db.query('select public.pod_save_menus($1::jsonb)',[JSON.stringify(menus)])
    assert.equal((await db.query("select count(*)::int n from public.pod_menu_items where menu_id='runtime-main'")).rows[0].n,1)
    const nestedMenus=[{id:'runtime-media-menu',name:'Media menu',location:'HEADER',status:'DRAFT',items:[{id:'runtime-product-link',label:'After 90',target:'/product/after-90',type:'PRODUCT',visible:true,imageMode:'AUTO',children:[{id:'runtime-child-link',label:'Custom',target:'/custom',type:'PAGE',visible:true,imageMode:'CUSTOM',imageUrl:'/assets/jersey-white.webp',imageAlt:'Custom jersey'}]}]}]
    await db.query('select public.pod_save_menus($1::jsonb)',[JSON.stringify(nestedMenus)])
    const menuRows=(await db.query("select id,parent_id,image_mode,image_url from public.pod_menu_items where menu_id='runtime-media-menu' order by id")).rows
    assert.equal(menuRows.length,2)
    assert.equal(menuRows.find(row=>row.id==='runtime-child-link').parent_id,'runtime-product-link')
    assert.equal(menuRows.find(row=>row.id==='runtime-child-link').image_mode,'CUSTOM')
    const pageColumns=(await db.query("select column_name from information_schema.columns where table_name='pod_pages'")).rows.map(row=>row.column_name)
    assert.ok(pageColumns.includes('representative_image'))

    const collections=[{id:'runtime-collection',handle:'runtime',name:'Runtime',description:'Published',status:'PUBLISHED',hero:'',sort:'Manual',products:['after-90']}]
    await db.query('select public.pod_save_collections($1::jsonb)',[JSON.stringify(collections)])
    assert.equal((await db.query("select count(*)::int n from public.pod_collection_products where collection_id='runtime-collection'")).rows[0].n,1)

    const theme={id:'runtime-theme',name:'Runtime',status:'PUBLISHED',version:'v1',tokens:{ink:'#000000'},blocks:[{id:'hero',enabled:true}],content:{headline:'Runtime'},pages:[{id:'runtime-home',name:'Home',path:'/',status:'PUBLISHED',layout:[]}]}
    const savedTheme=(await db.query('select public.pod_save_theme($1::jsonb) theme',[JSON.stringify(theme)])).rows[0].theme
    assert.equal(savedTheme.definition.content.headline,'Runtime')
    assert.equal((await db.query("select count(*)::int n from public.pod_pages where theme_id='runtime-theme'")).rows[0].n,1)
    const draft={...theme,status:'DRAFT',content:{headline:'Draft only'}}
    const savedDraft=(await db.query('select public.pod_save_theme($1::jsonb) theme',[JSON.stringify(draft)])).rows[0].theme
    assert.equal(savedDraft.status,'DRAFT')
    assert.equal((await db.query("select definition->'content'->>'headline' headline from public.pod_themes where id='runtime-theme'")).rows[0].headline,'Runtime')

    await db.exec('reset role')
    const quota=await db.query("select public.pod_consume_api_quota('ai-preview',repeat('a',64)) result")
    assert.equal(quota.rows[0].result.allowed,true)
    const cartQuota=await db.query("select public.pod_consume_api_quota('cart-validate',repeat('b',64)) result")
    assert.equal(cartQuota.rows[0].result.allowed,true)
    assert.equal((await db.query("select public from storage.buckets where id='ai-previews'")).rows[0].public,false)
    const columns=(await db.query("select column_name from information_schema.columns where table_name='pod_customization_orders'")).rows.map(row=>row.column_name)
    for(const name of ['variant_id','listing_revision','custom_schema','idempotency_key','session_hash','asset_refs','ai_preview_id','review_note']) assert.ok(columns.includes(name))
    const payment=(await db.query("select value from public.pod_store_settings where key='payment'")).rows[0].value
    assert.equal(payment.provider,'NONE')
    assert.equal(payment.enabled,false)
  } finally { await db.close() }
})
