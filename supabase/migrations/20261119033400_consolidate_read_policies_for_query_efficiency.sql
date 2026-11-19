DROP POLICY IF EXISTS orders_read_own_or_admin ON public.orders;
DROP POLICY IF EXISTS orders_read_sales_own ON public.orders;
CREATE POLICY orders_read_customer_seller_or_admin ON public.orders FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR seller_user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
DROP POLICY IF EXISTS order_items_read_own_or_admin ON public.order_items;
DROP POLICY IF EXISTS order_items_read_sales_own ON public.order_items;
CREATE POLICY order_items_read_customer_seller_or_admin ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.user_id = (SELECT auth.uid()) OR o.seller_user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))));
DROP POLICY IF EXISTS store_inventory_admin_all ON public.store_inventory;
DROP POLICY IF EXISTS store_inventory_read_staff ON public.store_inventory;
CREATE POLICY store_inventory_read_staff ON public.store_inventory FOR SELECT TO authenticated
USING ((SELECT private.is_admin()) OR (SELECT private.is_sales_staff()));
CREATE POLICY store_inventory_admin_insert ON public.store_inventory FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY store_inventory_admin_update ON public.store_inventory FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY store_inventory_admin_delete ON public.store_inventory FOR DELETE TO authenticated USING ((SELECT private.is_admin()));
DROP POLICY IF EXISTS store_inventory_movements_admin_read ON public.store_inventory_movements;
