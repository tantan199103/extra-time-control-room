-- Data migrations may preserve explicit audit IDs. Keep the identity sequence
-- ahead of those rows before high-volume catalogue writes append new audits.
begin;

select setval(
  pg_get_serial_sequence('public.pod_audit_logs', 'id'),
  coalesce((select max(id) from public.pod_audit_logs), 1),
  exists(select 1 from public.pod_audit_logs)
);

commit;
