-- Move the order-writing SECURITY DEFINER implementation out of the exposed
-- public schema. The public RPC remains SECURITY INVOKER and is callable only
-- by authenticated customers.
alter function public.create_order(text,text,text,text,jsonb,text) set schema private;

create or replace function public.create_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_payment_method text,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_order(
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_payment_method,
    p_items,
    p_notes
  );
$$;

revoke all on function public.create_order(text,text,text,text,jsonb,text) from public, anon;
grant execute on function public.create_order(text,text,text,text,jsonb,text) to authenticated;
