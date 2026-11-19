-- Migration: harden_private_admin_users
-- Applied to the live Supabase project as version 20261119023414.
-- Keep the administrator allowlist inaccessible to direct API roles.
alter table private.admin_users enable row level security;
alter table private.admin_users force row level security;
revoke all on table private.admin_users from public, anon, authenticated;
comment on table private.admin_users is
  'Private administrator allowlist. Direct role access is revoked; authorization is checked through private.is_admin().';
