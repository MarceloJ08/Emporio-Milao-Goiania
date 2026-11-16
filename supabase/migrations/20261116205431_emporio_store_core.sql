-- Migration recorded in Supabase as 20261116205431_emporio_store_core.
-- Keep this file aligned with the live database schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  country text,
  price numeric(12,2) not null check (price >= 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  payment_method text not null check (payment_method in ('pix','dinheiro','cartao_entrega')),
  notes text,
  status text not null default 'received'
    check (status in ('received','confirmed','preparing','out_for_delivery','completed','cancelled')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored
);

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx on public.profiles(created_at desc);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.phone, ''))
  on conflict (id) do update
    set full_name = excluded.full_name, phone = excluded.phone, updated_at = now();
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert or update of phone, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_payment_method text,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_total numeric(12,2);
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception 'É necessário entrar na conta para fazer o pedido.';
  end if;
  if length(trim(coalesce(p_customer_name,''))) < 2
     or length(regexp_replace(coalesce(p_customer_phone,''), '[^0-9]', '', 'g')) < 10
     or length(trim(coalesce(p_delivery_address,''))) < 8 then
    raise exception 'Informe nome, telefone e endereço completos.';
  end if;
  if p_payment_method not in ('pix','dinheiro','cartao_entrega') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sacola está vazia.';
  end if;
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count > 50 then
    raise exception 'Limite de 50 itens diferentes por pedido.';
  end if;

  with requested as (
    select (x->>'id') as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) x group by (x->>'id')
  )
  select sum(p.price * r.quantity) into v_total
  from requested r
  join public.products p on p.id = r.product_id and p.active
  where r.quantity between 1 and 99;

  if v_total is null or (
    select count(*) from (
      select (x->>'id') as product_id, sum((x->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_items) x group by (x->>'id')
    ) r where r.quantity between 1 and 99
  ) <> v_item_count then
    raise exception 'Um ou mais produtos estão indisponíveis ou com quantidade inválida.';
  end if;

  insert into public.orders (
    user_id, customer_name, customer_phone, delivery_address,
    payment_method, notes, total_amount
  ) values (
    v_user_id, trim(p_customer_name), trim(p_customer_phone),
    trim(p_delivery_address), p_payment_method,
    nullif(trim(coalesce(p_notes,'')), ''), v_total
  ) returning id into v_order_id;

  insert into public.order_items(order_id, product_id, product_name, quantity, unit_price)
  select v_order_id, p.id, p.name, r.quantity, p.price
  from (
    select (x->>'id') as product_id, sum((x->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) x group by (x->>'id')
  ) r join public.products p on p.id = r.product_id and p.active;

  return v_order_id;
end;
$$;
revoke all on function public.create_order(text,text,text,text,jsonb,text) from public, anon;
grant execute on function public.create_order(text,text,text,text,jsonb,text) to authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select private.is_admin(); $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "profiles_read_own_or_admin" on public.profiles
for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "products_anon_read_active" on public.products
for select to anon using (active);
create policy "products_authenticated_read_active_or_admin" on public.products
for select to authenticated using (active or (select private.is_admin()));
create policy "products_admin_insert" on public.products
for insert to authenticated with check ((select private.is_admin()));
create policy "products_admin_update" on public.products
for update to authenticated using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy "products_admin_delete" on public.products
for delete to authenticated using ((select private.is_admin()));

create policy "orders_read_own_or_admin" on public.orders
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy "orders_admin_update" on public.orders
for update to authenticated using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "order_items_read_own_or_admin" on public.order_items
for select to authenticated using (
  exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  ) or (select private.is_admin())
);

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant update(status) on public.orders to authenticated;
grant insert, update, delete on public.products to authenticated;
grant usage, select on sequence public.order_items_id_seq to authenticated;

insert into public.products (id,name,category,country,price,description,active) values
('suco-honest-acerola','Suco Honest Acerola 900 ml','Sucos','Brasil',19.99,'Bebida de fruta para servir bem gelada.',true),
('suco-honest-maracuja','Suco Honest Maracujá 900 ml','Sucos','Brasil',19.99,'Sabor tropical e refrescante.',true),
('suco-honest-frutas-vermelhas','Suco Honest Frutas Vermelhas 900 ml','Sucos','Brasil',19.99,'Combinação frutada para diferentes momentos.',true),
('suco-honest-morango-limao','Suco Honest Morango com Limão 900 ml','Sucos','Brasil',13.90,'Mistura de morango e limão em 900 ml.',true),
('suco-honest-morango-maracuja','Suco Honest Morango com Maracujá','Sucos','Brasil',19.99,'Combinação de frutas com perfil tropical.',true),
('suco-prats-uva','Suco Prats Uva Integral 900 ml','Sucos','Brasil',19.99,'Suco integral de uva.',true),
('suco-prats-laranja','Suco Prats Laranja Integral 900 ml','Sucos','Brasil',19.99,'Suco integral de laranja.',true),
('suco-casa-madeira','Suco Tinto de Uva Casa Madeira 1 L','Sucos','Brasil',29.99,'Suco tinto de uva em embalagem de 1 litro.',true),
('suco-jumju','Suco de Uva Jumju 238 ml','Sucos','Coreia do Sul',3.99,'Bebida de uva verde com pedaços de fruta. Servir bem gelada.',true)
on conflict (id) do update set
  name=excluded.name, category=excluded.category, country=excluded.country,
  price=excluded.price, description=excluded.description, updated_at=now();
