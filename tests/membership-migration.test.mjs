import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const files=['../supabase/schema.sql','../supabase/migrations/20260916_listing_foundation.sql','../supabase/migrations/202609160002_scoped_admin.sql','../supabase/migrations/202609160001_listing_workspace.sql','../supabase/migrations/202609160003_storefront_runtime.sql','../supabase/migrations/20260917_membership_foundation.sql']

test('membership migration seeds the offer and enforces customer/admin authority',async t=>{
  const db=new PGlite()
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values ('00000000-0000-0000-0000-000000000001','customer@example.com'),('00000000-0000-0000-0000-000000000002','admin@example.com');
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid);
      alter table storage.objects enable row level security;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    `)
    for(const file of files) await db.exec(await readFile(new URL(file,import.meta.url),'utf8'))

    await t.test('published program, three terms, rule and policy are seeded',async()=>{
      assert.equal((await db.query("select count(*)::int n from public.pod_membership_programs where status='PUBLISHED'")).rows[0].n,1)
      assert.equal((await db.query("select count(*)::int n from public.pod_membership_prices where status='ACTIVE'")).rows[0].n,3)
      assert.equal((await db.query("select max(discount_percent)::int n from public.pod_membership_discount_rules")).rows[0].n,20)
      assert.equal((await db.query("select count(*)::int n from public.pod_membership_policy_versions where status='PUBLISHED'")).rows[0].n,1)
    })

    await db.exec(`grant usage on schema public,auth to authenticated,anon; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; set request.jwt.claims='{"email":"customer@example.com"}';`)
    await t.test('customer may request enrollment but cannot grant an active membership',async()=>{
      await db.exec(`insert into public.pod_customer_profiles(user_id,email) values(auth.uid(),'customer@example.com');
        insert into public.pod_member_policy_acceptances(user_id,policy_version_id) values(auth.uid(),'92000000-0000-4000-8000-000000000001');
        insert into public.pod_membership_enrollment_requests(user_id,program_id,price_id,policy_version_id,status)
        values(auth.uid(),'90-club','90000000-0000-4000-8000-000000000012','92000000-0000-4000-8000-000000000001','PENDING');`)
      assert.equal((await db.query("select count(*)::int n from public.pod_membership_enrollment_requests where user_id=auth.uid()")).rows[0].n,1)
      await assert.rejects(db.exec(`insert into public.pod_memberships(user_id,program_id,price_id,status) values(auth.uid(),'90-club','90000000-0000-4000-8000-000000000012','ACTIVE')`),/row-level security|permission denied/i)
      await db.exec("update public.pod_membership_enrollment_requests set status='APPROVED' where user_id=auth.uid()")
      assert.equal((await db.query("select status from public.pod_membership_enrollment_requests where user_id=auth.uid()")).rows[0].status,'PENDING')
    })

    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; set request.jwt.claims='{"app_metadata":{"extra_time_role":"admin"}}';`)
    await t.test('scoped admin can approve a request and create the entitlement',async()=>{
      const request=(await db.query("select id from public.pod_membership_enrollment_requests where status='PENDING' limit 1")).rows[0]
      await db.query('select public.pod_admin_approve_membership_request($1::uuid,null)',[request.id])
      const membership=(await db.query("select status,current_period_end>now() valid from public.pod_memberships where user_id='00000000-0000-0000-0000-000000000001'")).rows[0]
      assert.equal(membership.status,'ACTIVE')
      assert.equal(membership.valid,true)
      assert.equal((await db.query("select status from public.pod_membership_enrollment_requests where id=$1",[request.id])).rows[0].status,'APPROVED')
    })

    await t.test('generic admin metadata cannot manage the program',async()=>{
      await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'; set request.jwt.claims='{"app_metadata":{"role":"admin"}}';`)
      await assert.rejects(db.query("select public.pod_admin_set_membership('{\"user_id\":\"00000000-0000-0000-0000-000000000001\",\"program_id\":\"90-club\",\"status\":\"ACTIVE\"}'::jsonb)"),/Admin permission required/i)
    })
  }finally{await db.close()}
})
