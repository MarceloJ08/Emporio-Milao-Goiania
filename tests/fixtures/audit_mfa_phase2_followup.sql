-- Complemento estritamente de leitura. Envie apenas os indicadores, nunca as definições brutas.

-- 1. Dependências das expressões efetivas das políticas de pedidos.
-- O indicador do ramo do vendedor é textual. O catálogo mostra as funções
-- referenciadas pela expressão, sem confirmar como os ramos estão agrupados.
select p.polrelid::regclass::text as relation, p.polname, p.polpermissive,
  pg_get_expr(p.polqual,p.polrelid) ~* 'seller_user_id' as seller_branch,
  array(
    select distinct f.oid::regprocedure::text
    from pg_depend d join pg_proc f on f.oid=d.refobjid
    where d.classid='pg_policy'::regclass and d.objid=p.oid
      and d.refclassid='pg_proc'::regclass
    order by 1
  ) as functions_in_expression
from pg_policy p
where p.polrelid in ('public.orders'::regclass,'public.order_items'::regclass)
order by 1,2;

-- 2. Sobrecargas, proprietários, bandeiras e acesso efetivo de cada definição.
-- As dependências por catálogo não são completas para corpos SQL em texto ou PL/pgSQL.
select n.nspname as schema, p.proname as name, oidvectortypes(p.proargtypes) as argument_types,
  p.prokind, pg_get_userbyid(p.proowner) as owner, l.lanname as language, p.prosecdef,
  coalesce(p.proconfig @> array['search_path=""'],false) as empty_search_path,
  exists(select 1 from unnest(p.proconfig) setting where setting like 'search_path=%') as defines_search_path,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname in ('public','private') and (
  p.prosecdef or p.proname in ('create_order','is_admin','is_sales_staff','admin_finance_summary',
    'admin_list_sales_staff','admin_manage_sales_staff','create_assisted_sale',
    'create_assisted_sale_for_assistant','register_stock_movement','register_store_stock_movement')
)
order by 1,2,3;

-- 3. Prontidão, usando o mesmo vínculo por e-mail confirmado proposto para vendas.
-- Cada linha de vendas corresponde a uma autorização ativa, sem expor e-mail ou UUID.
with staff as (
  select exists(
      select 1 from auth.users u where lower(u.email)=lower(s.email) and u.email_confirmed_at is not null
    ) as linked,
    exists(
      select 1 from auth.users u join auth.mfa_factors f on f.user_id=u.id
      where lower(u.email)=lower(s.email) and u.email_confirmed_at is not null
        and f.status='verified' and f.factor_type='totp'
    ) as ready
  from private.sales_staff s where s.active
), admins as (
  select exists(select 1 from auth.users u where u.id=a.user_id) as linked,
    exists(select 1 from auth.users u join auth.mfa_factors f on f.user_id=u.id
      where u.id=a.user_id and f.status='verified' and f.factor_type='totp') as ready
  from private.admin_users a
)
select 'admin' as role, count(*) as authorizations,
  count(*) filter(where linked) as linked_accounts,
  count(*) filter(where ready) as verified_totp from admins
union all
select 'sales', count(*), count(*) filter(where linked),count(*) filter(where ready) from staff;

-- 4. Formato e faixa de custo do verificador de desconto, sem revelar valores.
-- A faixa de custo é descritiva. Não estabelece conformidade ou entropia do PIN.
select count(*) as config_rows,
  count(*) filter(where nullif(btrim(pin_hash),'') is not null) as configured_rows,
  count(*) filter(where pin_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') as bcrypt_shape_rows,
  count(*) filter(where pin_hash ~ '^\$2[aby]\$(0[4-9])\$[./A-Za-z0-9]{53}$') as bcrypt_cost_below_10
from private.sales_discount_config where id is true;
