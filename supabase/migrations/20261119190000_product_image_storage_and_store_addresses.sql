insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images" on storage.objects for select to public
using (bucket_id='product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images" on storage.objects for insert to authenticated
with check (bucket_id='product-images' and (select public.is_admin()));

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images" on storage.objects for update to authenticated
using (bucket_id='product-images' and (select public.is_admin()))
with check (bucket_id='product-images' and (select public.is_admin()));

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images" on storage.objects for delete to authenticated
using (bucket_id='product-images' and (select public.is_admin()));

update public.store_locations set address='Av. Eng. Eurico Viana, 22, Qd. 04, Lt. 08/09, Setor Alto da Glória, Goiânia - GO, 74815-725'
where name ilike '%Alto%';
update public.store_locations set address='Av. C-233, 665, Qd. 574, Lt. 14, Setor Bueno (região Nova Suíça), Goiânia - GO, 74290-040'
where name ilike '%Nova%';
update public.store_locations set address='Av. Milão, 1.697, Qd. CP13, Lt. 01, Residencial Celina Park, Goiânia - GO, 74373-270'
where name ilike '%Avenida Milão%';