-- Admin-managed public store configuration.
-- Public may read display settings; only users listed in private.admin_users may change them.
create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  store_name text not null default 'Empório Milão',
  announcement text not null default 'Empório Milão · Bons produtos, escolhas inteligentes · Goiânia, GO',
  whatsapp text not null default '556236367239' check (whatsapp ~ '^[0-9]{10,15}$'),
  opening_hours text not null default 'Segunda a quinta: 09:00–21:00 | Sexta e sábado: 08:30–21:30 | Domingo: 09:00–14:00',
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;
create policy "store_settings_public_read" on public.store_settings
for select to anon, authenticated using (true);
create policy "store_settings_admin_insert" on public.store_settings
for insert to authenticated with check ((select private.is_admin()));
create policy "store_settings_admin_update" on public.store_settings
for update to authenticated using ((select private.is_admin()))
with check ((select private.is_admin()));
grant select on public.store_settings to anon, authenticated;
grant insert, update on public.store_settings to authenticated;
insert into public.store_settings (id) values (true) on conflict (id) do nothing;
