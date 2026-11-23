-- Add the two requested stock locations without changing existing branch records.
insert into public.store_locations (name, active)
select requested.name, true
from (values ('Galpão'), ('Celina Park')) as requested(name)
where not exists (
  select 1 from public.store_locations existing
  where lower(existing.name) = lower(requested.name)
);

-- Shared sales login with per-sale assistant attribution.
-- Each sale remains owned by the authenticated, authorized sales account.
-- The selected assistant is validated server-side and snapshotted on the order.

create or replace function public.create_assisted_sale_for_assistant(
  p_assistant_name text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_payment_method text,
  p_payment_status text,
  p_store_id uuid,
  p_items jsonb,
  p_order_discount numeric default 0,
  p_discount_percent numeric default 0,
  p_discount_pin text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_assistant text := trim(coalesce(p_assistant_name, ''));
begin
  if auth.uid() is null or not private.is_sales_staff() then
    raise exception 'Acesso de vendedor autorizado necessário.';
  end if;

  if v_assistant not in ('Gabriela', 'Tawane', 'Victoria') then
    raise exception 'Selecione uma assistente válida.';
  end if;

  v_order_id := public.create_assisted_sale(
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_payment_method,
    p_payment_status,
    p_store_id,
    p_items,
    p_order_discount,
    p_discount_percent,
    p_discount_pin,
    p_notes
  );

  update public.orders
     set seller_name = v_assistant
   where id = v_order_id
     and seller_user_id = auth.uid()
     and sales_channel = 'whatsapp';

  if not found then
    raise exception 'Não foi possível registrar a identificação da assistente.';
  end if;

  return v_order_id;
end;
$function$;

revoke all on function public.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) from public;
grant execute on function public.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) to authenticated;
