-- Keep the explicit SEO approval timestamp in sync with the first-class gate.
-- The listing RPC already writes seo_status through the structured seo object;
-- this additive trigger records when an operator actually moves the row to
-- INDEXABLE without granting any publish authority.
begin;

create or replace function public.pod_record_seo_review()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.seo_status = 'INDEXABLE' then new.seo_reviewed_at := coalesce(new.seo_reviewed_at, now()); end if;
  elsif old.seo_status is distinct from new.seo_status then
    if new.seo_status = 'INDEXABLE' then new.seo_reviewed_at := coalesce(new.seo_reviewed_at, now());
    else new.seo_reviewed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_z_record_seo_review on public.pod_products;
create trigger products_z_record_seo_review
before insert or update of seo, seo_status
on public.pod_products
for each row execute function public.pod_record_seo_review();

commit;
