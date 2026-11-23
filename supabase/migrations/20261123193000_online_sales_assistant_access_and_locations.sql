-- Register the four operational stock origins and authorize the shared sales login.
-- The Galpão address is intentionally NULL until the owner supplies its physical address.
UPDATE public.store_locations
SET name = 'Celina Park'
WHERE lower(name) = lower('Avenida Milão');

INSERT INTO public.store_locations (name, address, active)
SELECT 'Galpão', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_locations WHERE lower(name) = lower('Galpão')
);

INSERT INTO private.sales_staff (email, full_name, active, max_discount_percent)
VALUES ('33marcelogof@gmail.com', 'Equipe de Vendas Online', true, 3)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    active = true,
    max_discount_percent = GREATEST(private.sales_staff.max_discount_percent, EXCLUDED.max_discount_percent),
    updated_at = now();
