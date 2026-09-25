-- Keep the listing RPC aligned with the customer-supplied logo field used by
-- TAASS personalization. The original workspace migration predates logo.
begin;

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.pod_save_listing(jsonb,timestamp with time zone)'))
    into function_definition;
  if function_definition is null then
    raise exception 'pod_save_listing(jsonb,timestamptz) is missing';
  end if;
  function_definition := replace(
    function_definition,
    'not in (''text'',''number'',''textarea'',''select'',''photo'')',
    'not in (''text'',''number'',''textarea'',''select'',''photo'',''logo'')'
  );
  if function_definition = pg_get_functiondef(to_regprocedure('public.pod_save_listing(jsonb,timestamp with time zone)')) then
    raise exception 'Could not update the custom field type allow-list';
  end if;
  execute function_definition;
end;
$migration$;

commit;
