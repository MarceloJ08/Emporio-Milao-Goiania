-- Add a global count of confirmed orders to the protected finance summary.
create or replace function public.admin_finance_summary()
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not private.is_admin() then
   raise exception 'Acesso administrativo necessário.';
 end if;
 select jsonb_build_object(
  'orders_total',count(*),
  'orders_confirmed',count(*) filter(where status in ('confirmed','preparing','out_for_delivery','completed')),
  'orders_paid',count(*) filter(where payment_status='paid' and status<>'cancelled'),
  'orders_pending',count(*) filter(where payment_status='pending' and status<>'cancelled'),
  'orders_cancelled',count(*) filter(where status='cancelled'),
  'orders_completed',count(*) filter(where status='completed'),
  'revenue_paid',coalesce(sum(total_amount) filter(where payment_status='paid' and status<>'cancelled'),0),
  'sales_total',coalesce(sum(total_amount) filter(where status<>'cancelled'),0),
  'pending_amount',coalesce(sum(total_amount) filter(where payment_status='pending' and status<>'cancelled'),0),
  'discounts_total',coalesce(sum(discount_amount) filter(where status<>'cancelled'),0),
  'whatsapp_sales',coalesce(sum(total_amount) filter(where sales_channel='whatsapp' and status<>'cancelled'),0),
  'online_sales',coalesce(sum(total_amount) filter(where sales_channel='online' and status<>'cancelled'),0),
  'payment_methods',coalesce((select jsonb_agg(jsonb_build_object('method',pm,'orders',qty,'amount',amount)) from (
   select payment_method pm,count(*) qty,coalesce(sum(total_amount),0) amount from public.orders
   where status<>'cancelled' and payment_status='paid' group by payment_method
  ) methods),'[]'::jsonb)
 ) into v_result from public.orders;
 return v_result;
end;
$function$;
