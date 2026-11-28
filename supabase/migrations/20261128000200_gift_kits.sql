create table public.gift_kit_presets (
  id text primary key,
  name text not null check (char_length(name) between 1 and 80),
  product_ids text[] not null default '{}',
  price numeric(12,2) check (price > 0),
  active boolean not null default false,
  check (not active or (price is not null and cardinality(product_ids) between 2 and 6))
);
create table public.gift_kit_settings (
  id boolean primary key default true check (id),
  deadline_date date,
  deadline_label text check (char_length(deadline_label) <= 140)
);
alter table public.gift_kit_presets enable row level security;
alter table public.gift_kit_settings enable row level security;
revoke all on public.gift_kit_presets, public.gift_kit_settings from anon, authenticated;
grant select on public.gift_kit_presets, public.gift_kit_settings to anon, authenticated;
grant update on public.gift_kit_presets, public.gift_kit_settings to authenticated;
create policy gift_presets_read on public.gift_kit_presets for select to anon, authenticated using (active);
create policy gift_presets_admin_read on public.gift_kit_presets for select to authenticated using ((select private.is_admin()));
create policy gift_presets_edit on public.gift_kit_presets for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy gift_settings_read on public.gift_kit_settings for select to anon, authenticated using (true);
create policy gift_settings_edit on public.gift_kit_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
insert into public.gift_kit_presets (id,name) values ('essencial','Essencial'),('classico','Clássico'),('premium','Premium');
insert into public.gift_kit_settings default values;

alter table public.customer_carts add column gift_kits jsonb not null default '[]'
  check (jsonb_typeof(gift_kits) = 'array' and jsonb_array_length(gift_kits) <= 5);
alter table public.orders add column gift_kits jsonb not null default '[]'
  check (jsonb_typeof(gift_kits) = 'array');
alter table public.order_items add column gift_kit_index smallint check (gift_kit_index between 1 and 5);

create function private.quote_gift_kit(p_kit jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  ids text[];
  components jsonb;
  stores jsonb;
  listed_total numeric(12,2);
  price numeric(12,2);
  selected_store uuid;
  preset public.gift_kit_presets%rowtype;
  occasion text := p_kit->>'occasion';
  method text := p_kit->>'method';
  card_style text := p_kit->>'style';
  card_message text := coalesce(p_kit->>'message','');
  giver text := trim(coalesce(p_kit->>'from',''));
  recipient text := trim(coalesce(p_kit->>'to',''));
  delivery_address text := trim(coalesce(p_kit->>'address',''));
  delivery_day date;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if jsonb_typeof(p_kit->'ids') is distinct from 'array' then raise exception 'Selecione os itens do kit.'; end if;
  if jsonb_array_length(p_kit->'ids') not between 2 and 6 then raise exception 'Seleção do kit inválida.'; end if;
  select array_agg(id order by id) into ids from jsonb_array_elements_text(p_kit->'ids') as item(id);
  if cardinality(ids) <> (select count(distinct id) from unnest(ids) as item(id)) then
    raise exception 'Escolha produtos diferentes no kit.';
  end if;
  if occasion is null or occasion not in ('natal','namorados','aniversario','agradecimento','corporativo','outra')
     or method is null or method not in ('delivery','pickup')
     or card_style is null or card_style not in ('classico','romantico','corporativo')
     or length(card_message)>200 or length(giver)>80 or length(recipient)>80
     or concat_ws(' ',card_message,giver,recipient) ~* '\m(puta|puto|merda|caralho|porra|vadia)\M'
  then raise exception 'Revise a ocasião, a entrega e o texto do cartão.'; end if;
  if method='delivery' then
    delivery_day := nullif(p_kit->>'date','')::date;
    if length(delivery_address) not between 8 and 300 or delivery_day is null or delivery_day<today
    then raise exception 'Informe o endereço e uma data de entrega válida.'; end if;
    if occasion='natal' and exists (
      select 1 from public.gift_kit_settings k where k.id and k.deadline_date is not null
        and today>k.deadline_date and delivery_day<make_date(extract(year from k.deadline_date)::int+1,1,1))
    then raise exception 'O prazo definido para os pedidos de Natal já passou.'; end if;
  end if;

  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'category',p.categoria_kit,'price',q.price) order by p.categoria_kit,p.name),
         sum(q.price)::numeric(12,2)
  into components,listed_total
  from public.products p
  cross join lateral (select private.effective_catalog_price(p.price,p.promotion_day,p.promotion_price) price) q
  where p.id=any(ids) and p.active and p.elegivel_kit and q.price>0
  having count(*)=cardinality(ids)
    and count(*) filter (where p.categoria_kit='vinho' and p.tipo_vinho is not null)=1
    and count(*) filter (where p.categoria_kit='embalagem')=1
    and count(*) filter (where p.categoria_kit in ('queijo','petisco'))<=2
    and count(*) filter (where p.categoria_kit in ('acessorio','doce'))<=1;
  if components is null then raise exception 'Revise os itens, o vinho e a embalagem do kit.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]'::jsonb)
  into stores from public.store_locations s where s.active and not exists (
    select 1 from unnest(ids) as item(id) where not exists (
      select 1 from public.store_inventory i where i.store_id=s.id and i.product_id=item.id and i.quantity>0));
  if jsonb_array_length(stores)=0 then raise exception 'Algum item esgotou ou nenhuma unidade tem o kit completo.'; end if;
  selected_store := nullif(p_kit->>'store_id','')::uuid;
  if selected_store is null and method='delivery' then selected_store := (stores->0->>'id')::uuid; end if;
  if not exists (select 1 from jsonb_array_elements(stores) as branch where (branch->>'id')::uuid=selected_store)
  then raise exception 'Selecione uma unidade que tenha todos os itens.'; end if;

  if nullif(p_kit->>'preset','') is not null then
    select * into preset from public.gift_kit_presets k where k.id=p_kit->>'preset' and k.active
      and ids=(select array_agg(id order by id) from unnest(k.product_ids) as item(id));
    if not found then raise exception 'O kit pronto mudou. Revise os itens e o valor.'; end if;
  end if;
  price:=coalesce(preset.price,listed_total);
  return jsonb_build_object('ids',ids,'items',components,'price',price,'listed_total',listed_total,
    'preset',preset.id,'title',coalesce(preset.name,'Kit Presente'),
    'occasion',occasion,'method',method,'store_id',selected_store,'stores',stores,
    'store_name',(select s.name from public.store_locations s where s.id=selected_store),
    'address',nullif(delivery_address,''),'date',delivery_day,'message',card_message,
    'from',giver,'to',recipient,'style',card_style);
end;
$$;

create function public.quote_gift_kit(p_kit jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.quote_gift_kit(p_kit);
$$;

create function public.create_order_with_gift_kits(
  p_customer_name text, p_customer_phone text, p_delivery_address text,
  p_payment_method text, p_items jsonb, p_notes text, p_kits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  order_id uuid;
  buyer uuid := auth.uid();
  request jsonb;
  kit jsonb;
  kits jsonb := '[]'::jsonb;
  item record;
  idx integer := 0;
  kits_total numeric(12,2) := 0;
  kits_subtotal numeric(12,2) := 0;
begin
  if buyer is null or private.can_use_account() is not true then
    raise exception 'Entre na sua conta para registrar o pedido.' using errcode='42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_typeof(p_kits) is distinct from 'array' then
    raise exception 'Sacola inválida.';
  end if;
  if jsonb_array_length(p_kits) not between 1 and 5 then raise exception 'Escolha até cinco kits por pedido.'; end if;

  -- Lock catalogue pricing and presets in stable order before computing charges.
  perform p.id from public.products p
  where p.id in (
    select component.id from jsonb_array_elements(p_kits) as k
      cross join lateral jsonb_array_elements_text(k->'ids') as component(id)
    union select v->>'id' from jsonb_array_elements(p_items) v
  ) order by p.id for share;
  perform k.id from public.gift_kit_presets k
  where k.id in (select v->>'preset' from jsonb_array_elements(p_kits) v) order by k.id for share;

  for request in select value from jsonb_array_elements(p_kits)
  loop
    kit := private.quote_gift_kit(request);
    if (request->>'price')::numeric is distinct from (kit->>'price')::numeric
       or request->>'store_id' is distinct from kit->>'store_id'
    then raise exception 'O preço ou a unidade do kit mudou. Revise o kit na sacola.'; end if;
    kits:=kits||jsonb_build_array(kit - 'stores');
    kits_total:=kits_total+(kit->>'price')::numeric;
    kits_subtotal:=kits_subtotal+greatest((kit->>'listed_total')::numeric,(kit->>'price')::numeric);
  end loop;

  if jsonb_array_length(p_items)>0 then
    order_id:=private.create_order(p_customer_name,p_customer_phone,p_delivery_address,p_payment_method,p_items,p_notes);
  else
    if length(trim(coalesce(p_customer_name,'')))<2
       or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<10
       or length(trim(coalesce(p_delivery_address,'')))<8
       or p_payment_method is null or p_payment_method not in ('pix','dinheiro','cartao_entrega')
    then raise exception 'Confira os dados de contato e o pagamento.'; end if;
    insert into public.orders (user_id,customer_name,customer_phone,delivery_address,payment_method,notes,total_amount,subtotal_amount,discount_amount,sales_channel)
    values (buyer,trim(p_customer_name),regexp_replace(p_customer_phone,'[^0-9]','','g'),trim(p_delivery_address),p_payment_method,nullif(trim(coalesce(p_notes,'')),''),0,0,0,'online')
    returning id into order_id;
  end if;

  for item in select (k->>'store_id')::uuid store_id, c->>'id' product_id, count(*)::integer amount
     from jsonb_array_elements(kits) k cross join lateral jsonb_array_elements(k->'items') c
     group by 1,2 order by 1,2
  loop
    update public.store_inventory set quantity=quantity-item.amount, updated_at=now()
    where store_id=item.store_id and product_id=item.product_id and quantity>=item.amount;
    if not found then raise exception 'Um item do kit esgotou. Reveja as combinações na sacola.'; end if;
    insert into public.store_inventory_movements (store_id,product_id,order_id,movement_type,quantity,note,created_by)
    values (item.store_id,item.product_id,order_id,'saida',item.amount,'Reserva de kit presente',buyer);
  end loop;

  for kit in select value from jsonb_array_elements(kits)
  loop
    idx:=idx+1;
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, list_unit_price, discount_amount, gift_kit_index)
    select order_id,c->>'id',c->>'name',1,(c->>'price')::numeric,(c->>'price')::numeric,0,idx
    from jsonb_array_elements(kit->'items') c;
  end loop;

  update public.orders o set gift_kits=kits, total_amount=o.total_amount+kits_total,
    subtotal_amount=coalesce(o.subtotal_amount,o.total_amount)+kits_subtotal,
    discount_amount=coalesce(o.discount_amount,0)+kits_subtotal-kits_total
  where o.id=order_id;
  return order_id;
end;
$$;

revoke all on function private.quote_gift_kit(jsonb) from public, anon, authenticated;
revoke all on function public.quote_gift_kit(jsonb) from public;
revoke all on function public.create_order_with_gift_kits(text,text,text,text,jsonb,text,jsonb) from public, anon;
grant execute on function public.quote_gift_kit(jsonb) to anon, authenticated;
grant execute on function public.create_order_with_gift_kits(text,text,text,text,jsonb,text,jsonb) to authenticated;

-- Reuse the existing cancellation ledger. Kit lines have already left branch stock.
do $patch$
declare
  source text := pg_get_functiondef('private.sync_order_inventory()'::regprocedure);
  needle text := 'where i.order_id = new.id';
begin
  if strpos(source,needle)=0 or strpos(source,'gift_kit_index')>0 then
    raise exception 'Revisar a integração com o gatilho de estoque.';
  end if;
  execute replace(source,needle,needle || ' and i.gift_kit_index is null');
end;
$patch$;
