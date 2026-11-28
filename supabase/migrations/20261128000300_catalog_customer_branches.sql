create or replace function public.catalog_profile_availability()
returns jsonb language sql stable security definer set search_path = '' as $$
  with branches as (
    select id, name from public.store_locations where active and name <> 'Galpão'
  )
  select jsonb_build_object(
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from branches s), '[]'::jsonb),
    'stock', coalesce((select jsonb_object_agg(item.product_id, item.branches)
      from (select i.product_id, jsonb_object_agg(i.store_id::text, least(i.quantity, 4)) branches
        from public.store_inventory i
        join branches s on s.id=i.store_id
        join public.products p on p.id=i.product_id and p.active
        where i.quantity > 0 and (p.tipo_vinho is not null or p.elegivel_kit or exists (
          select 1 from public.products wine where wine.active and i.product_id = any(wine.produto_combina_ids)))
        group by i.product_id) item), '{}'::jsonb)
  );
$$;

do $$
declare
  definition text;
  original text := 'into stores from public.store_locations s where s.active and not exists';
begin
  select pg_get_functiondef('private.quote_gift_kit(jsonb)'::regprocedure) into definition;
  if position(original in definition) = 0 then
    raise exception 'Revise a definição de private.quote_gift_kit.';
  end if;
  execute replace(definition, original,
    'into stores from public.store_locations s where s.active and s.name <> ''Galpão'' and not exists');
end;
$$;
