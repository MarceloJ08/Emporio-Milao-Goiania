-- Keep the authorized sales-staff email allowlist inaccessible to direct API roles.
alter table private.sales_staff enable row level security;
alter table private.sales_staff force row level security;
revoke all on table private.sales_staff from public, anon, authenticated;
comment on table private.sales_staff is
  'Private sales-staff allowlist. Direct role access is revoked; management and authorization are mediated by private RPCs.';
