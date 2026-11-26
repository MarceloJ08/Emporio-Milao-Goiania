-- Proposed. Reconcile the live catalog before applying. See docs/MFA_PHASE_2.md.
begin;

-- The catalog must be reviewed privately before this proposal becomes deployable.
-- Populate this manifest only after reviewing each definition, owner, ACL and policy.
do $review$
declare
  approved_snapshot text := null; -- reviewed production/staging catalog
  actual_snapshot text;
  approved_order_updates text := null; -- choose only after rehearsing the transport
  relation_name text;
begin
  select md5(string_agg(entry, E'\n' order by entry)) into actual_snapshot from (
    select concat_ws('|', 'routine', n.nspname, p.proname, oidvectortypes(p.proargtypes),
      pg_get_userbyid(p.proowner), p.proacl::text, pg_get_functiondef(p.oid)) as entry
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prokind in ('f','p')
    union all
    select concat_ws('|','policy',schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check)
    from pg_policies where schemaname in ('public','private')
      or (schemaname = 'storage' and tablename = 'objects')
    union all
    select concat_ws('|','relation',n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner),c.relacl::text,c.reloptions::text,
      (select jsonb_object_agg(a.attname,a.attacl::text) from pg_attribute a
       where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attacl is not null))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','v','m','f')
      and (n.nspname in ('public','private')
        or (n.nspname = 'storage' and c.relname = 'objects'))
    union all
    select concat_ws('|','column',n.nspname,c.relname,a.attnum,a.attname,
      format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated)
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    where a.attnum>0 and not a.attisdropped and (
      (n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f'))
      or (n.nspname = 'auth' and (
        (c.relname='users' and a.attname in ('id','email','email_confirmed_at'))
        or (c.relname='sessions' and a.attname in ('id','user_id','factor_id','aal','not_after'))
        or (c.relname='mfa_factors' and a.attname in ('id','user_id','status','factor_type'))
      ))
      or (n.nspname='storage' and c.relname='objects' and a.attname='bucket_id')
    )
    union all
    select concat_ws('|','publication',t.pubname,t.schemaname,t.tablename,t.attnames::text,t.rowfilter,
      p.puballtables,p.pubinsert,p.pubupdate,p.pubdelete,p.pubtruncate,p.pubviaroot,c.relreplident)
    from pg_publication_tables t join pg_publication p on p.pubname=t.pubname
    join pg_namespace n on n.nspname=t.schemaname
    join pg_class c on c.relnamespace=n.oid and c.relname=t.tablename
    where t.schemaname in ('public','private')
    union all
    select concat_ws('|','bucket',b.id,b.public) from storage.buckets b
    where b.id in ('product-images','profile-avatars')
  ) catalog;

  if approved_snapshot is null or actual_snapshot is distinct from approved_snapshot then
    raise exception 'MFA preflight: catálogo sem revisão ou diferente do snapshot aprovado.';
  end if;

  foreach relation_name in array array['private.admin_users','private.sales_staff','private.sales_discount_config'] loop
    if not exists (select 1 from pg_class where oid = to_regclass(relation_name) and relrowsecurity and relforcerowsecurity) then
      raise exception 'MFA preflight: tabela privada ausente ou sem RLS forçada: %.', relation_name;
    end if;
    if has_table_privilege('anon',relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated',relation_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege('anon',relation_name,'SELECT,INSERT,UPDATE,REFERENCES')
      or has_any_column_privilege('authenticated',relation_name,'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'MFA preflight: grants diretos em tabela privada: %.', relation_name;
    end if;
  end loop;

  if approved_order_updates is distinct from 'polling' then
    raise exception 'MFA preflight: transporte de atualização de pedidos ainda não aprovado.';
  end if;

  -- Verified enrollment is detectable here. Successful AAL2 panel access must be
  -- tested operationally before approval. Other accounts can enroll after rollout.
  if not exists (
    select 1 from private.admin_users a
    join auth.users u on u.id=a.user_id
    join auth.mfa_factors f on f.user_id=u.id
    where f.status::text = 'verified' and f.factor_type::text = 'totp'
  ) then
    raise exception 'MFA preflight: é necessário pelo menos um administrador com TOTP verificado.';
  end if;

  -- The production audit found two signatures with matching public/private pairs.
  -- Exact bodies and ACLs must also match the reviewed snapshot above.
  if exists (
    with overloads as (
      select n.nspname, p.proargtypes
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private')
        and p.proname='create_assisted_sale' and p.prokind='f'
    )
    select 1 where (select count(*) from overloads) <> 4
      or (select count(distinct proargtypes) from overloads) <> 2
      or exists (select 1 from overloads group by proargtypes having count(distinct nspname) <> 2)
  ) then
    raise exception 'MFA preflight: assinaturas de create_assisted_sale divergem dos dois pares auditados.';
  end if;
end;
$review$;

create function private.has_admin_role()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.admin_users a where a.user_id = (select auth.uid()));
$$;

create function private.has_sales_role()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    join private.sales_staff s on lower(s.email) = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null and s.active
  );
$$;

-- Only the session primary key and JWT claims are documented integration points.
-- The additional managed fields are intentional checks for revocation and factor removal.
create function private.has_live_account_session(require_aal2 boolean, require_totp boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = (case when (select auth.jwt()->>'session_id') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select auth.jwt()->>'session_id')::uuid end)
      and s.user_id = (select auth.uid())
      and (s.not_after is null or s.not_after > statement_timestamp())
      and (not require_aal2 or (
        (select auth.jwt()->>'aal') = 'aal2' and s.aal::text = 'aal2'
        and exists (
          select 1 from auth.mfa_factors f
          where f.id = s.factor_id and f.user_id = s.user_id and f.status::text = 'verified'
            and (not require_totp or f.factor_type::text = 'totp')
        )
      ))
  );
$$;

create function private.has_live_staff_aal2()
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_live_account_session(true, true)
    -- A recovery or email-confirmation session must not become a staff login.
    and coalesce((select auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb, false);
$$;

create function private.can_use_account()
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when private.has_admin_role() or private.has_sales_role()
    then private.has_live_staff_aal2()
    else private.has_live_account_session(
      coalesce((select auth.jwt()->>'aal') = 'aal2',false) or exists (
        select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status::text = 'verified'
      ), false)
  end;
$$;

-- Preserve the function identities so policies and existing RPCs keep their dependencies.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_admin_role() and private.has_live_staff_aal2(); $$;

create or replace function private.is_sales_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_sales_role() and private.has_live_staff_aal2(); $$;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_admin(); $$;

create or replace function public.is_sales_staff()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_sales_staff(); $$;

-- Self-only onboarding; never returns rows from the allowlists or accepts a target.
create function public.account_mfa_requirements()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'admin', private.has_admin_role(),
    'sales', private.has_sales_role(),
    'ready', private.can_use_account());
$$;

revoke all on function private.has_admin_role(), private.has_sales_role(), private.has_live_staff_aal2(),
  private.has_live_account_session(boolean, boolean)
  from public, anon, authenticated;
revoke all on function private.can_use_account(), private.is_admin(), private.is_sales_staff(),
  public.is_admin(), public.is_sales_staff(), public.account_mfa_requirements() from public, anon, authenticated;
grant execute on function private.can_use_account(), private.is_admin(), private.is_sales_staff(),
  public.is_admin(), public.is_sales_staff(), public.account_mfa_requirements() to authenticated;

alter policy orders_read_customer_seller_or_admin on public.orders using (
  user_id = (select auth.uid()) or
  (seller_user_id = (select auth.uid()) and (select private.is_sales_staff())) or
  (select private.is_admin())
);
alter policy order_items_read_customer_seller_or_admin on public.order_items using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and (
    o.user_id = (select auth.uid()) or
    (o.seller_user_id = (select auth.uid()) and (select private.is_sales_staff())) or
    (select private.is_admin())
  ))
);

do $migration$
declare relation_name text;
begin
  foreach relation_name in array array['public.profiles','public.orders','public.order_items','public.customer_carts',
    'public.inventory','public.inventory_movements','public.store_inventory_movements','public.products',
    'public.store_settings','public.store_inventory','public.store_locations','storage.objects'] loop
    if not exists (select 1 from pg_class where oid = to_regclass(relation_name) and relrowsecurity) then
      raise exception 'MFA preflight: % ausente ou com RLS desativado.', relation_name;
    end if;
  end loop;
  foreach relation_name in array array['profiles','orders','order_items','customer_carts'] loop
    execute format('create policy mfa_account_session on public.%I as restrictive for all to authenticated
      using ((select private.can_use_account())) with check ((select private.can_use_account()))', relation_name);
  end loop;
  foreach relation_name in array array['inventory','inventory_movements','store_inventory_movements'] loop
    execute format('create policy mfa_admin_only on public.%I as restrictive for all to authenticated
      using ((select private.is_admin())) with check ((select private.is_admin()))', relation_name);
  end loop;
  foreach relation_name in array array['products','store_settings','orders','store_inventory'] loop
    execute format('create policy mfa_admin_insert on public.%I as restrictive for insert to authenticated
      with check ((select private.is_admin()))', relation_name);
    execute format('create policy mfa_admin_update on public.%I as restrictive for update to authenticated
      using ((select private.is_admin())) with check ((select private.is_admin()))', relation_name);
    execute format('create policy mfa_admin_delete on public.%I as restrictive for delete to authenticated
      using ((select private.is_admin()))', relation_name);
  end loop;
end;
$migration$;

-- Restrictive reads prevent older permissive policies from re-granting these paths.
create policy mfa_orders_read_scope on public.orders as restrictive for select to authenticated using (
  user_id = (select auth.uid()) or
  (seller_user_id = (select auth.uid()) and (select private.is_sales_staff())) or
  (select private.is_admin())
);
create policy mfa_order_items_read_scope on public.order_items as restrictive for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy mfa_profiles_read_scope on public.profiles as restrictive for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy mfa_products_read_scope on public.products as restrictive for select to authenticated
using (active or (select private.is_admin()));

create policy mfa_branch_stock_read on public.store_inventory as restrictive for select to authenticated
using ((select private.is_admin()) or (select private.is_sales_staff()));

-- Preserve any existing public location reads and require AAL2 for an authenticated staff session.
create policy mfa_store_locations_session on public.store_locations as restrictive for select to authenticated
using ((select private.can_use_account()));

create policy mfa_product_images_insert on storage.objects as restrictive for insert to authenticated
with check ((bucket_id <> 'product-images' or (select private.is_admin())) and
  (bucket_id <> 'profile-avatars' or (select private.can_use_account())));
create policy mfa_product_images_update on storage.objects as restrictive for update to authenticated
using ((bucket_id <> 'product-images' or (select private.is_admin())) and
  (bucket_id <> 'profile-avatars' or (select private.can_use_account())))
with check ((bucket_id <> 'product-images' or (select private.is_admin())) and
  (bucket_id <> 'profile-avatars' or (select private.can_use_account())));
create policy mfa_product_images_delete on storage.objects as restrictive for delete to authenticated
using ((bucket_id <> 'product-images' or (select private.is_admin())) and
  (bucket_id <> 'profile-avatars' or (select private.can_use_account())));

-- Protected buckets also remain non-writable by anon even if a permissive policy is added.
create policy mfa_account_buckets_anon_insert on storage.objects as restrictive for insert to anon
with check (bucket_id not in ('product-images','profile-avatars'));
create policy mfa_account_buckets_anon_update on storage.objects as restrictive for update to anon
using (bucket_id not in ('product-images','profile-avatars'))
with check (bucket_id not in ('product-images','profile-avatars'));
create policy mfa_account_buckets_anon_delete on storage.objects as restrictive for delete to anon
using (bucket_id not in ('product-images','profile-avatars'));

-- RPCs may bypass RLS as SECURITY DEFINER. Insert an entry check while preserving
-- original identity, owner, grants, arguments, configuration and business logic.
-- A SQL wrapper is accepted only if it exclusively calls its guarded private namesake.
do $migration$
declare
  fn record;
  name text;
  required text[] := array['create_order','create_assisted_sale','admin_finance_summary','admin_list_sales_staff',
    'admin_manage_sales_staff','register_stock_movement','register_store_stock_movement'];
  guard text;
  definition text;
  marker text;
  position_as integer;
  normalized text;
  positional_args text;
  named_args text;
  prefix text;
begin
  foreach name in array required loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = name and p.prokind = 'f') then
      raise exception 'MFA preflight: RPC public.% ausente. Confira o baseline.', name;
    end if;
  end loop;

  for fn in
    select p.oid, p.proname, p.prosrc, p.prosqlbody, p.prosecdef, p.proconfig,
      p.pronargs, p.proargnames, n.nspname, l.lanname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
    where n.nspname in ('public','private') and p.prokind = 'f'
      and p.proname = any(required || array['create_assisted_sale_for_assistant'])
  loop
    guard := case when fn.proname = 'create_order' then 'can_use_account'
      when fn.proname like 'create_assisted_sale%' then 'is_sales_staff' else 'is_admin' end;
    if fn.lanname = 'sql' and fn.nspname = 'public' and not fn.prosecdef and fn.prosqlbody is null then
      normalized := lower(regexp_replace(btrim(fn.prosrc), '\s+', '', 'g'));
      prefix := 'private.' || fn.proname || '(';
      select coalesce(string_agg('$' || i, ',' order by i), ''),
        case when count(fn.proargnames[i]) = fn.pronargs
          then coalesce(string_agg(lower(fn.proargnames[i]), ',' order by i), '') end
      into positional_args, named_args from generate_series(1,fn.pronargs) i;
      if regexp_replace(normalized, ';$', '') in (
        'select'||prefix||positional_args||')', 'select*from'||prefix||positional_args||')',
        'select'||prefix||named_args||')', 'select*from'||prefix||named_args||')'
      )
        and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = fn.proname and p.proargtypes =
            (select proargtypes from pg_proc where oid = fn.oid)) then
        continue;
      end if;
    end if;
    if fn.lanname <> 'plpgsql' or ltrim(fn.prosrc) like '#%' then
      raise exception 'MFA preflight: implementação não reconhecida em %. Revise a função.', fn.oid::regprocedure;
    end if;
    if fn.prosecdef and not coalesce(fn.proconfig @> array['search_path=""'],false) then
      raise exception 'MFA preflight: SECURITY DEFINER sem search_path vazio em %.', fn.oid::regprocedure;
    end if;
    definition := pg_get_functiondef(fn.oid);
    marker := (regexp_match(definition, E'\nAS (\\$[a-zA-Z_0-9]*\\$)'))[1];
    position_as := strpos(definition, E'\nAS ' || marker);
    if coalesce(position_as, 0) = 0 then
      raise exception 'MFA preflight: definição não reconhecida em %.', fn.oid::regprocedure;
    end if;
    execute left(definition, position_as + 3) || quote_literal(
      'begin if private.' || guard || '() is not true then ' ||
      'raise exception using errcode = ''42501'', message = ''Acesso não autorizado para esta sessão.''; end if;' ||
      E'\n' || regexp_replace(fn.prosrc, ';\s*$', '') || E'\n;\nend;');
  end loop;
end;
$migration$;

-- Review any consumer-facing view before enabling the migration.
do $migration$
declare
  unexpected regclass;
  unreviewed regprocedure;
begin
  select c.oid::regclass into unexpected from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
    and (c.relkind = 'm' or not coalesce(c.reloptions @> array['security_invoker=true'], false)) limit 1;
  if unexpected is not null then
    raise exception 'MFA preflight: view exposta exige revisão: %.', unexpected;
  end if;
  select p.oid::regprocedure into unreviewed from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
    and p.proname not in ('is_admin','is_sales_staff','can_use_account','account_mfa_requirements','create_order',
      'create_assisted_sale','create_assisted_sale_for_assistant','admin_finance_summary','admin_list_sales_staff',
      'admin_manage_sales_staff','register_stock_movement','register_store_stock_movement')
    and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
    limit 1;
  if unreviewed is not null then
    raise exception 'MFA preflight: SECURITY DEFINER executável exige revisão: %.', unreviewed;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and (
      (p.proname in ('is_admin','is_sales_staff','can_use_account','account_mfa_requirements') and p.pronargs <> 0)
      or (p.prokind = 'p' and p.proname in ('create_order','create_assisted_sale','create_assisted_sale_for_assistant',
        'admin_finance_summary','admin_list_sales_staff','admin_manage_sales_staff','register_stock_movement',
        'register_store_stock_movement'))
    )
  ) then
    raise exception 'MFA preflight: sobrecarga de autorização ou procedimento alternativo exige revisão.';
  end if;

  -- Validation transport for this draft only. A production decision is required
  -- after testing the alternatives and confirming consumers of this publication.
  if exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    -- PostgreSQL rejects this if a publication includes a schema or all tables.
    alter publication supabase_realtime drop table public.orders;
  end if;
end;
$migration$;

commit;
