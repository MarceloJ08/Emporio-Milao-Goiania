-- Run in an isolated PostgreSQL fixture. This file never connects to Supabase.
create role anon;
create role authenticated;
create schema auth;
create schema private;
create schema storage;
grant usage on schema public, private, auth, storage to authenticated;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key, user_id uuid, factor_id uuid, aal text, not_after timestamptz);
create table auth.mfa_factors(id uuid primary key, user_id uuid, status text, factor_type text);
create table private.admin_users(user_id uuid primary key);
create table private.sales_staff(email text primary key, active boolean);
create table private.sales_discount_config(id boolean primary key, pin_hash text);
alter table private.admin_users enable row level security;
alter table private.admin_users force row level security;
alter table private.sales_staff enable row level security;
alter table private.sales_staff force row level security;
alter table private.sales_discount_config enable row level security;
alter table private.sales_discount_config force row level security;
create function private.is_admin() returns boolean language sql stable security definer as $$
  select exists(select from private.admin_users where user_id=auth.uid())
$$;
create function private.is_sales_staff() returns boolean language sql stable security definer as $$
  select exists(select from auth.users u join private.sales_staff s using(email) where u.id=auth.uid() and active)
$$;
create table public.orders(id int primary key, user_id uuid, seller_user_id uuid);
create table public.order_items(order_id int);
create table public.profiles(id uuid primary key);
create table public.customer_carts(user_id uuid primary key);
create table public.products(id int primary key, active boolean);
create table public.store_settings(id int primary key);
create table public.store_locations(id int primary key);
create table public.inventory(id int primary key);
create table public.inventory_movements(id int primary key);
create table public.store_inventory(id int primary key);
create table public.store_inventory_movements(id int primary key);
create table storage.objects(id int primary key, bucket_id text);
create table storage.buckets(id text primary key, public boolean);
insert into storage.buckets values('product-images',true),('profile-avatars',true);
grant select,insert,update,delete on all tables in schema public,storage to authenticated;
grant select on public.products to anon;
grant usage on schema storage to anon;
grant insert on storage.objects to anon;
do $fixture$
declare t text;
begin
  foreach t in array array['profiles','orders','order_items','customer_carts','inventory','inventory_movements',
    'store_inventory','store_inventory_movements','products','store_settings','store_locations'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['profiles','inventory','inventory_movements','store_inventory',
    'store_inventory_movements','store_settings','store_locations'] loop
    execute format('create policy fixture_grant on public.%I for all to authenticated using(true) with check(true)', t);
  end loop;
end;
$fixture$;
create policy fixture_cart_scope on public.customer_carts for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy orders_read_customer_seller_or_admin on public.orders for select to authenticated
using(user_id=auth.uid() or seller_user_id=auth.uid() or private.is_admin());
create policy order_items_read_customer_seller_or_admin on public.order_items for select to authenticated
using(exists(select 1 from public.orders o where o.id=order_id));
create policy fixture_orders_write on public.orders for insert to authenticated with check(true);
create policy fixture_products_anon on public.products for select to anon using(active);
create policy fixture_products_read on public.products for select to authenticated using(active or private.is_admin());
create policy fixture_products_write on public.products for insert to authenticated with check(true);
alter table storage.objects enable row level security;
create policy fixture_storage on storage.objects for all to authenticated using(true) with check(true);
create policy fixture_storage_anon on storage.objects for insert to anon with check(true);

create function private.create_order(p_value int) returns int language plpgsql security definer set search_path = '' as $$
begin
  if p_value = 99 then
    insert into public.orders values (p_value, auth.uid(), null);
  end if;
  return p_value;
end;
$$;
create function public.create_order(p_value int) returns int language sql security invoker as $$
  select private.create_order(p_value);
$$;
create function private.create_assisted_sale(p_value int) returns int language plpgsql security definer set search_path = '' as $$
declare next_value int := p_value + 1;
begin return next_value; end;
$$;
create function public.create_assisted_sale(p_value int) returns int language sql security invoker as $$
  select private.create_assisted_sale(p_value);
$$;
create function private.create_assisted_sale(p_value int, p_extra int) returns int
language plpgsql security definer set search_path = '' as $$
begin return p_value + p_extra; end;
$$;
create function public.create_assisted_sale(p_value int, p_extra int) returns int language sql security invoker as $$
  select private.create_assisted_sale($1, $2);
$$;
create function private.create_assisted_sale_for_assistant(p_value int) returns int
language plpgsql security definer set search_path = '' as $$
begin return p_value; end;
$$;
create function public.create_assisted_sale_for_assistant(p_value int) returns int language sql security invoker as $$
  select private.create_assisted_sale_for_assistant(p_value);
$$;
create function public.admin_finance_summary() returns jsonb language plpgsql security definer set search_path = '' as $$
begin return '{"ok":true}'::jsonb; end;
$$;
create function public.admin_list_sales_staff() returns table (value int) language plpgsql security definer set search_path = '' as $$
begin return query select 1; end;
$$;
create function public.admin_manage_sales_staff() returns void language plpgsql security definer set search_path = '' as $$
begin return; end;
$$;
create function public.register_stock_movement() returns int language plpgsql security definer set search_path = '' as $$
begin return 1; end;
$$;
create function public.register_store_stock_movement() returns int language plpgsql security definer set search_path = '' as $$
begin return 1; end;
$$;
create publication supabase_realtime for table public.orders;

insert into auth.users select ('00000000-0000-0000-0000-00000000000' || n)::uuid, n || '@local.test', now() from generate_series(1,5) n;
insert into private.sales_staff values ('2@local.test',true);
insert into private.admin_users values ('00000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000005');
insert into auth.mfa_factors select ('20000000-0000-0000-0000-00000000000' || n)::uuid,
('00000000-0000-0000-0000-00000000000' || n)::uuid,'verified','totp' from generate_series(1,3) n;
insert into auth.sessions select ('10000000-0000-0000-0000-00000000000' || n)::uuid,
u.id, case when n<=3 then ('20000000-0000-0000-0000-00000000000' || n)::uuid end,
case when n<=3 then 'aal2' else 'aal1' end,null
from generate_series(1,5) n join auth.users u on u.email = n || '@local.test';
insert into public.orders values
 (1,'00000000-0000-0000-0000-000000000001',null),
 (2,'00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002');
insert into public.order_items values (1),(2);
insert into public.inventory values (1);
insert into public.store_inventory values (1);
insert into public.products values (1,true),(2,false);
