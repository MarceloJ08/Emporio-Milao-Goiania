create table if not exists private.sales_discount_config (
  id boolean primary key default true check (id),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table private.sales_discount_config enable row level security;
alter table private.sales_discount_config force row level security;
revoke all on private.sales_discount_config from public, anon, authenticated;
insert into private.sales_discount_config(id,pin_hash)
values(true, extensions.crypt('123', extensions.gen_salt('bf')))
on conflict(id) do update set pin_hash=excluded.pin_hash, updated_at=now();

create or replace function private.create_assisted_sale(
 p_customer_name text, p_customer_phone text, p_delivery_address text,
 p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb,
 p_order_discount numeric default 0, p_discount_percent numeric default 0,
 p_discount_pin text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
 v_seller uuid:=auth.uid(); v_email text; v_seller_name text; v_limit numeric; v_order uuid;
 v_subtotal numeric(12,2):=0; v_line_discount numeric(12,2):=0; v_discount numeric(12,2):=0;
 v_percent_discount numeric(12,2):=0; v_total numeric(12,2):=0; v_discount_base numeric(12,2):=0;
 v_count integer; item record; v_list numeric(12,2); v_sale numeric(12,2); v_stock integer;
 v_pin_hash text; v_pin_valid boolean:=false;
begin
 if v_seller is null or not private.is_sales_staff() then raise exception 'Acesso de vendedor autorizado necessário.'; end if;
 select lower(u.email),s.full_name,s.max_discount_percent into v_email,v_seller_name,v_limit
 from auth.users u join private.sales_staff s on lower(s.email)=lower(u.email) where u.id=v_seller and s.active;
 if length(trim(coalesce(p_customer_name,'')))<2 then raise exception 'Informe o nome do cliente.'; end if;
 if length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<10 then raise exception 'Informe um WhatsApp válido.'; end if;
 if length(trim(coalesce(p_delivery_address,'')))<8 then raise exception 'Informe o endereço de entrega ou retirada.'; end if;
 if p_payment_method not in ('pix','dinheiro','cartao_entrega') then raise exception 'Forma de pagamento inválida.'; end if;
 if p_payment_status not in ('pending','paid') then raise exception 'Status de pagamento inválido.'; end if;
 if not exists(select 1 from public.store_locations where id=p_store_id and active) then raise exception 'Selecione uma unidade válida.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto.'; end if;
 select count(*) into v_count from jsonb_array_elements(p_items);
 if v_count>60 then raise exception 'Limite de 60 produtos diferentes por venda.'; end if;
 if coalesce(p_order_discount,0)<0 or coalesce(p_discount_percent,0)<0 or coalesce(p_discount_percent,0)>100 then raise exception 'Desconto inválido.'; end if;
 for item in
  select (x->>'id')::text product_id,sum((x->>'quantity')::integer)::integer qty,min(nullif(x->>'unit_price','')::numeric) sale_price
  from jsonb_array_elements(p_items) x group by (x->>'id')
 loop
  if item.qty<1 or item.qty>500 then raise exception 'Quantidade inválida.'; end if;
  select price into v_list from public.products where id=item.product_id and active for share;
  if not found then raise exception 'Produto indisponível: %.',item.product_id; end if;
  v_sale:=coalesce(item.sale_price,v_list);
  if v_sale<=0 or v_sale>v_list then raise exception 'Preço unitário inválido para %.',item.product_id; end if;
  v_subtotal:=v_subtotal+(v_list*item.qty);
  v_line_discount:=v_line_discount+((v_list-v_sale)*item.qty);
 end loop;
 if coalesce(p_discount_percent,0) not in (0,3) then
  select pin_hash into v_pin_hash from private.sales_discount_config where id=true;
  v_pin_valid:=v_pin_hash is not null and coalesce(p_discount_pin,'')<>'' and extensions.crypt(p_discount_pin,v_pin_hash)=v_pin_hash;
  if not v_pin_valid then raise exception 'Senha de autorização inválida para liberar desconto maior.'; end if;
 elsif coalesce(p_discount_percent,0)=3 and v_subtotal<1000 then
  raise exception 'O desconto padrão de 3%% só pode ser aplicado em compras a partir de R$ 1.000,00.';
 end if;
 v_discount_base:=greatest(0,v_subtotal-v_line_discount-coalesce(p_order_discount,0));
 v_percent_discount:=round(v_discount_base*coalesce(p_discount_percent,0)/100,2);
 v_discount:=v_line_discount+coalesce(p_order_discount,0)+v_percent_discount;
 if v_discount>v_subtotal then raise exception 'Desconto não pode superar o subtotal.'; end if;
 if v_subtotal=0 or (not v_pin_valid and (v_discount/v_subtotal*100)>greatest(coalesce(v_limit,0),3)) then
  raise exception 'Desconto acima do limite autorizado para este atendente (% por cento).',greatest(coalesce(v_limit,0),3);
 end if;
 v_total:=v_subtotal-v_discount;
 insert into public.orders(user_id,customer_name,customer_phone,delivery_address,payment_method,notes,status,total_amount,payment_status,paid_at,sales_channel,seller_user_id,seller_name,seller_email,store_id,subtotal_amount,discount_amount,stock_reserved)
 values(null,trim(p_customer_name),regexp_replace(p_customer_phone,'[^0-9]','','g'),trim(p_delivery_address),p_payment_method,nullif(trim(coalesce(p_notes,'')),''),'confirmed',v_total,p_payment_status,case when p_payment_status='paid' then now() else null end,'whatsapp',v_seller,v_seller_name,v_email,p_store_id,v_subtotal,v_discount,true)
 returning id into v_order;
 for item in
  select (x->>'id')::text product_id,sum((x->>'quantity')::integer)::integer qty,min(nullif(x->>'unit_price','')::numeric) sale_price
  from jsonb_array_elements(p_items) x group by (x->>'id')
 loop
  select price into v_list from public.products where id=item.product_id and active;
  v_sale:=coalesce(item.sale_price,v_list);
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,list_unit_price,discount_amount)
  select v_order,p.id,p.name,item.qty,v_sale,v_list,(v_list-v_sale)*item.qty from public.products p where p.id=item.product_id;
  insert into public.store_inventory(store_id,product_id,quantity) values(p_store_id,item.product_id,0) on conflict(store_id,product_id) do nothing;
  select quantity into v_stock from public.store_inventory where store_id=p_store_id and product_id=item.product_id for update;
  if v_stock<item.qty then raise exception 'Estoque insuficiente para %. Disponível: %, solicitado: %.',item.product_id,v_stock,item.qty; end if;
  update public.store_inventory set quantity=quantity-item.qty,updated_at=now() where store_id=p_store_id and product_id=item.product_id;
  insert into public.store_inventory_movements(store_id,product_id,order_id,movement_type,quantity,note,created_by)
  values(p_store_id,item.product_id,v_order,'saida',item.qty,'Reserva automática da venda WhatsApp #'||left(v_order::text,8),v_seller);
 end loop;
 return v_order;
end;
$function$;

create or replace function public.create_assisted_sale(
 p_customer_name text, p_customer_phone text, p_delivery_address text,
 p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb,
 p_order_discount numeric default 0, p_discount_percent numeric default 0,
 p_discount_pin text default null, p_notes text default null
) returns uuid
language sql set search_path = ''
as $function$
 select private.create_assisted_sale(p_customer_name,p_customer_phone,p_delivery_address,p_payment_method,p_payment_status,p_store_id,p_items,p_order_discount,p_discount_percent,p_discount_pin,p_notes);
$function$;

revoke all on function private.create_assisted_sale(text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) from public, anon;
grant execute on function private.create_assisted_sale(text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) to authenticated;
revoke all on function public.create_assisted_sale(text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) from public, anon;
grant execute on function public.create_assisted_sale(text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) to authenticated;
