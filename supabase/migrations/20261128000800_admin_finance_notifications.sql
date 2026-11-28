create policy admin_receive_finance_updates
on realtime.messages
for select to authenticated
using (
  realtime.topic() = 'emporio:admin:finance'
  and extension = 'broadcast'
  and (select public.is_admin())
);

create function private.notify_admin_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb,'orders_changed','emporio:admin:finance',true);
  return null;
exception when others then
  -- The periodic dashboard refresh still works if Realtime is unavailable.
  raise warning 'Could not send the finance refresh signal (SQLSTATE %)', sqlstate;
  return null;
end;
$$;

revoke all on function private.notify_admin_finance() from public, anon, authenticated;

create trigger notify_admin_finance_after_orders
after insert or update of status, payment_status, paid_at, payment_method, total_amount, discount_amount or delete
on public.orders
for each statement
execute function private.notify_admin_finance();
