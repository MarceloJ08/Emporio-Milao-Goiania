-- Remove inherited/public grants from customer-owned records.
-- RLS remains the row-level boundary for authenticated users and administrators.
revoke all on table public.profiles, public.orders, public.order_items from public, anon;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.orders to authenticated;
grant update (status) on public.orders to authenticated;
grant select on public.order_items to authenticated;
