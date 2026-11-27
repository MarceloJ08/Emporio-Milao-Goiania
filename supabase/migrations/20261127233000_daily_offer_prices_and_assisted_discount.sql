-- Sale-of-the-day prices expire at midnight in Goiânia.
alter table public.products add column promotion_price numeric(12,2);
alter table public.products add constraint products_promotion_price_check
  check (promotion_price is null or (promotion_price > 0 and promotion_day is not null));

create function private.effective_catalog_price(regular_price numeric, offer_day date, offer_price numeric)
returns numeric language sql stable set search_path = '' as $$
  select case when offer_day = (now() at time zone 'America/Sao_Paulo')::date
    and offer_price > 0 and offer_price < regular_price then offer_price else regular_price end;
$$;
revoke all on function private.effective_catalog_price(numeric,date,numeric) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.create_assisted_sale(p_customer_name text, p_customer_phone text, p_delivery_address text, p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb, p_order_discount numeric DEFAULT 0, p_discount_percent numeric DEFAULT 0, p_discount_pin text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin if private.is_sales_staff() is not true then raise exception using errcode = '42501', message = 'Acesso não autorizado para esta sessão.'; end if;

declare
 v_seller uuid:=auth.uid(); v_email text; v_seller_name text; v_order uuid;
 v_subtotal numeric(12,2):=0; v_line_discount numeric(12,2):=0; v_discount numeric(12,2):=0;
 v_percent_discount numeric(12,2):=0; v_total numeric(12,2):=0; v_discount_base numeric(12,2):=0;
 v_count integer; item record; v_list numeric(12,2); v_sale numeric(12,2); v_stock integer;
 v_pin_hash text; v_pin_valid boolean:=false;
begin
 if v_seller is null or not private.is_sales_staff() then raise exception 'Acesso de vendedor autorizado necessário.'; end if;
 select lower(u.email),s.full_name into v_email,v_seller_name
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
  from jsonb_array_elements(p_items) x group by (x->>'id') order by (x->>'id')
 loop
  if item.qty<1 or item.qty>500 then raise exception 'Quantidade inválida.'; end if;
  select private.effective_catalog_price(p.price, p.promotion_day, p.promotion_price) into v_list from public.products p where p.id=item.product_id and p.active for share;
  if not found then raise exception 'Produto indisponível: %.',item.product_id; end if;
  v_sale:=coalesce(item.sale_price,v_list);
  if v_sale<=0 or v_sale>v_list then raise exception 'Preço unitário inválido para %.',item.product_id; end if;
  v_subtotal:=v_subtotal+(v_list*item.qty);
  v_line_discount:=v_line_discount+((v_list-v_sale)*item.qty);
 end loop;
 v_discount_base:=greatest(0,v_subtotal-v_line_discount-coalesce(p_order_discount,0));
 v_percent_discount:=round(v_discount_base*coalesce(p_discount_percent,0)/100,2);
 v_discount:=v_line_discount+coalesce(p_order_discount,0)+v_percent_discount;
 if v_discount>v_subtotal then raise exception 'Desconto não pode superar o subtotal.'; end if;
 if v_subtotal=0 then raise exception 'O subtotal da venda deve ser positivo.'; end if;
 if v_discount>round(v_subtotal*0.03,2) then
  if length(coalesce(p_discount_pin,'')) not between 1 and 72 then
   raise exception 'Informe a senha de autorização para desconto acima de 3%%.';
  end if;
  select pin_hash into v_pin_hash from private.sales_discount_config where id=true;
  v_pin_valid:=v_pin_hash is not null and extensions.crypt(p_discount_pin,v_pin_hash)=v_pin_hash;
  if not v_pin_valid then raise exception 'Senha de autorização inválida para desconto acima de 3%%.'; end if;
 end if;
 v_total:=v_subtotal-v_discount;
 insert into public.orders(user_id,customer_name,customer_phone,delivery_address,payment_method,notes,status,total_amount,payment_status,paid_at,sales_channel,seller_user_id,seller_name,seller_email,store_id,subtotal_amount,discount_amount,stock_reserved)
 values(null,trim(p_customer_name),regexp_replace(p_customer_phone,'[^0-9]','','g'),trim(p_delivery_address),p_payment_method,nullif(trim(coalesce(p_notes,'')),''),'confirmed',v_total,p_payment_status,case when p_payment_status='paid' then now() else null end,'whatsapp',v_seller,v_seller_name,v_email,p_store_id,v_subtotal,v_discount,true)
 returning id into v_order;
 for item in
  select (x->>'id')::text product_id,sum((x->>'quantity')::integer)::integer qty,min(nullif(x->>'unit_price','')::numeric) sale_price
  from jsonb_array_elements(p_items) x group by (x->>'id') order by (x->>'id')
 loop
  select private.effective_catalog_price(p.price, p.promotion_day, p.promotion_price) into v_list from public.products p where p.id=item.product_id and p.active;
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
end
;
end;$function$
;

CREATE OR REPLACE FUNCTION private.create_order(p_customer_name text, p_customer_phone text, p_delivery_address text, p_payment_method text, p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin if private.can_use_account() is not true then raise exception using errcode = '42501', message = 'Acesso não autorizado para esta sessão.'; end if;

declare v_user_id uuid:=auth.uid(); v_order_id uuid; v_total numeric(12,2); v_item_count integer; v_matched_count integer;
begin
 if v_user_id is null then raise exception 'É necessário entrar na conta para fazer o pedido.'; end if;
 if length(trim(coalesce(p_customer_name,'')))<2 or length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'))<10 or length(trim(coalesce(p_delivery_address,'')))<8 then
  raise exception 'Informe nome, telefone e endereço completos.';
 end if;
 if p_payment_method not in ('pix','dinheiro','cartao_entrega') then raise exception 'Forma de pagamento inválida.'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'A sacola está vazia.'; end if;
 select count(*) into v_item_count from jsonb_array_elements(p_items);
 if v_item_count>50 then raise exception 'Limite de 50 itens diferentes por pedido.'; end if;
 perform p.id from public.products p
 where p.id in (select x->>'id' from jsonb_array_elements(p_items) x)
 order by p.id for share;
 with requested as(select (x->>'id') product_id,sum((x->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_items) x group by (x->>'id'))
 select sum(private.effective_catalog_price(p.price,p.promotion_day,p.promotion_price)*r.quantity), count(*) into v_total,v_matched_count from requested r join public.products p on p.id=r.product_id and p.active where r.quantity between 1 and 99;
 if v_total is null or v_matched_count<>v_item_count then
  raise exception 'Um ou mais produtos estão indisponíveis ou com quantidade inválida.';
 end if;
 insert into public.orders(user_id,customer_name,customer_phone,delivery_address,payment_method,notes,total_amount,subtotal_amount,discount_amount,sales_channel)
 values(v_user_id,trim(p_customer_name),regexp_replace(p_customer_phone,'[^0-9]','','g'),trim(p_delivery_address),p_payment_method,nullif(trim(coalesce(p_notes,'')),''),v_total,v_total,0,'online')
 returning id into v_order_id;
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,list_unit_price,discount_amount)
 select v_order_id,p.id,p.name,r.quantity,private.effective_catalog_price(p.price,p.promotion_day,p.promotion_price),private.effective_catalog_price(p.price,p.promotion_day,p.promotion_price),0
 from (select (x->>'id') product_id,sum((x->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_items) x group by (x->>'id')) r
 join public.products p on p.id=r.product_id and p.active;
 return v_order_id;
end
;
end;$function$
;

-- Older callers still use the same validation and discount cap.
create or replace function private.create_assisted_sale(
  p_customer_name text, p_customer_phone text, p_delivery_address text,
  p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb,
  p_order_discount numeric default 0, p_notes text default null
) returns uuid language sql security definer set search_path = '' as $$
  select private.create_assisted_sale(
    p_customer_name, p_customer_phone, p_delivery_address, p_payment_method, p_payment_status,
    p_store_id, p_items, p_order_discount, 0::numeric, null::text, p_notes
  );
$$;

create or replace function private.create_assisted_sale_for_assistant(
  p_assistant_name text, p_customer_name text, p_customer_phone text, p_delivery_address text,
  p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb,
  p_order_discount numeric default 0, p_discount_percent numeric default 0,
  p_discount_pin text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  order_id uuid;
begin
  if private.is_sales_staff() is not true then
    raise exception using errcode = '42501', message = 'Acesso não autorizado para esta sessão.';
  end if;
  if p_assistant_name is null or p_assistant_name not in ('Tawane', 'Gabriela', 'Victoria') then
    raise exception 'Selecione uma assistente válida.';
  end if;
  order_id := private.create_assisted_sale(
    p_customer_name, p_customer_phone, p_delivery_address, p_payment_method, p_payment_status,
    p_store_id, p_items, p_order_discount, p_discount_percent, p_discount_pin, p_notes
  );
  update public.orders set seller_name = p_assistant_name
  where id = order_id and seller_user_id = auth.uid() and sales_channel = 'whatsapp';
  if not found then raise exception 'Não foi possível registrar a identificação da assistente.'; end if;
  return order_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.create_assisted_sale_for_assistant(p_assistant_name text, p_customer_name text, p_customer_phone text, p_delivery_address text, p_payment_method text, p_payment_status text, p_store_id uuid, p_items jsonb, p_order_discount numeric DEFAULT 0, p_discount_percent numeric DEFAULT 0, p_discount_pin text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.create_assisted_sale_for_assistant(
    p_assistant_name, p_customer_name, p_customer_phone, p_delivery_address,
    p_payment_method, p_payment_status, p_store_id, p_items,
    p_order_discount, p_discount_percent, p_discount_pin, p_notes
  );
$function$
;

revoke all on function private.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) from public, anon;
revoke all on function public.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) from public, anon;
grant execute on function private.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) to authenticated;
grant execute on function public.create_assisted_sale_for_assistant(text,text,text,text,text,text,uuid,jsonb,numeric,numeric,text,text) to authenticated;
