begin;

set local lock_timeout = '5s';
lock table public.orders in share row exclusive mode;

-- The trigger predates the available migration history. Refuse to replace an
-- unattached function or one bound to a different event.
do $check$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'orders_sync_inventory_after_status'
      and tgfoid = to_regprocedure('private.sync_order_inventory()')
      and not tgisinternal
      and tgtype = 17
      and tgenabled in ('O', 'A')
      and tgattr::text = (
        select attnum::text from pg_attribute
        where attrelid = 'public.orders'::regclass and attname = 'status' and not attisdropped
      )
  ) then
    raise exception 'Gatilho de estoque divergente do catálogo revisado.';
  end if;
end;
$check$;

create or replace function private.sync_order_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  item record;
  actor uuid;
begin
  if tg_relid <> 'public.orders'::regclass or tg_op <> 'UPDATE'
     or tg_level <> 'ROW' or tg_when <> 'AFTER' then
    raise exception 'Contexto inválido para o gatilho de estoque.';
  end if;

  if new.status = old.status then
    return new;
  end if;
  if new.status <> 'cancelled'
     and (new.status not in ('out_for_delivery', 'completed') or old.stock_reserved) then
    return new;
  end if;

  -- Check the requesting identity, role and live MFA session before using the
  -- function owner's privileges. The movement ledger remains read-only to callers.
  actor := auth.uid();
  if actor is null or private.is_admin() is not true then
    raise exception 'Acesso administrativo com MFA necessário para movimentar estoque.'
      using errcode = '42501';
  end if;

  -- The order update already locks this order. The latest debit/credit for
  -- each product is therefore consulted and recorded under the same row lock.
  if new.status = 'cancelled' then
    for item in
      select latest.product_id, latest.quantity
      from (
        select distinct on (m.product_id) m.product_id, m.quantity, m.movement_type
        from public.inventory_movements m
        where m.order_id = new.id and m.movement_type in ('saida', 'entrada')
        order by m.product_id, m.id desc
      ) latest
      where latest.movement_type = 'saida'
      order by latest.product_id
    loop
      update public.inventory
      set quantity = quantity + item.quantity, updated_at = now()
      where product_id = item.product_id;
      if not found then
        raise exception 'Estoque do galpão não encontrado para devolver o produto %.', item.product_id;
      end if;
      insert into public.inventory_movements (product_id, order_id, movement_type, quantity, note, created_by)
      values (item.product_id, new.id, 'entrada', item.quantity,
              'Reposição automática por cancelamento do pedido #' || left(new.id::text, 8), actor);
    end loop;

    for item in
      select latest.store_id, latest.product_id, latest.quantity
      from (
        select distinct on (m.store_id, m.product_id) m.store_id, m.product_id, m.quantity, m.movement_type
        from public.store_inventory_movements m
        where m.order_id = new.id and m.movement_type in ('saida', 'entrada')
        order by m.store_id, m.product_id, m.id desc
      ) latest
      where latest.movement_type = 'saida'
      order by latest.store_id, latest.product_id
    loop
      update public.store_inventory
      set quantity = quantity + item.quantity, updated_at = now()
      where store_id = item.store_id and product_id = item.product_id;
      if not found then
        raise exception 'Estoque da unidade não encontrado para devolver o produto %.', item.product_id;
      end if;
      insert into public.store_inventory_movements (store_id, product_id, order_id, movement_type, quantity, note, created_by)
      values (item.store_id, item.product_id, new.id, 'entrada', item.quantity,
              'Estorno de reserva por cancelamento do pedido #' || left(new.id::text, 8), actor);
    end loop;
    return new;
  end if;

  for item in
    select i.product_id, sum(i.quantity)::integer as quantity
    from public.order_items i
    where i.order_id = new.id
      and (
        select m.movement_type from public.inventory_movements m
        where m.order_id = new.id and m.product_id = i.product_id
          and m.movement_type in ('saida', 'entrada')
        order by m.id desc limit 1
      ) is distinct from 'saida'
    group by i.product_id
    order by i.product_id
  loop
    update public.inventory
    set quantity = quantity - item.quantity, updated_at = now()
    where product_id = item.product_id and quantity >= item.quantity;
    if not found then
      raise exception 'Estoque insuficiente para o produto %. Quantidade solicitada: %.',
        item.product_id, item.quantity;
    end if;
    insert into public.inventory_movements (product_id, order_id, movement_type, quantity, note, created_by)
    values (item.product_id, new.id, 'saida', item.quantity,
            'Saída automática do pedido #' || left(new.id::text, 8), actor);
  end loop;
  return new;
end;
$function$;

revoke execute on function private.sync_order_inventory() from public, anon, authenticated, service_role;

commit;

