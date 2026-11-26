begin;

-- Moving the original function retains its validated body, including the
-- Phase 2 MFA guard that runs before any inventory write.
do $preflight$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure('public.register_stock_movement(text,text,integer,text)')
      and not p.prosecdef
      and l.lanname = 'plpgsql'
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.pronargdefaults = 1
      and p.proargnames = array['p_product_id','p_movement_type','p_quantity','p_note']
      and p.prorettype = 'integer'::regtype
      and p.proconfig = array['search_path=""']
      and md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) = 'daaad9047f1700f2209c3452232ea6e8'
  ) or to_regprocedure('private.register_stock_movement(text,text,integer,text)') is not null
    or not exists (
      select 1 from pg_proc
      where oid = to_regprocedure('private.is_admin()')
        and regexp_replace(lower(prosrc), '[[:space:]]', '', 'g') =
          'selectprivate.has_admin_role()andprivate.has_live_staff_aal2();'
    ) then
    raise exception 'As definições de estoque ou MFA divergem do catálogo revisado.';
  end if;
end;
$preflight$;

alter function public.register_stock_movement(text,text,integer,text) set schema private;
alter function private.register_stock_movement(text,text,integer,text) security definer;

create function public.register_stock_movement(
  p_product_id text,
  p_movement_type text,
  p_quantity integer,
  p_note text default null
)
returns integer
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.register_stock_movement(p_product_id, p_movement_type, p_quantity, p_note);
$wrapper$;

revoke execute on function
  private.register_stock_movement(text,text,integer,text),
  public.register_stock_movement(text,text,integer,text)
from public, anon, authenticated, service_role;

grant execute on function
  private.register_stock_movement(text,text,integer,text),
  public.register_stock_movement(text,text,integer,text)
to authenticated;

notify pgrst, 'reload schema';

commit;
