alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists image_alt text;

comment on column public.products.image_url is 'Public product image URL for catalog display';
comment on column public.products.image_alt is 'Accessible alt text for product image';

insert into public.products (id,name,category,country,price,compare_at_price,description,active)
values
('vinho-foye-reserva-chardonnay','Vinho Branco Foye Reserva Chardonnay','Vinhos Brancos','Chile',24.90,49.90,'Vinho branco seco elaborado com Chardonnay. Perfil frutado, boa estrutura e notas de frutas tropicais, pêssego e leve baunilha. Origem: Chile. Temperatura de serviço: 8–10 °C.',true),
('espumante-terranova-brut','Espumante Terranova Brut','Espumantes','Brasil',26.99,49.90,'Espumante brasileiro do Vale do São Francisco, de perfil fresco e versátil.',true),
('espumante-terranova-moscatel','Espumante Terranova Moscatel','Espumantes','Brasil',26.99,49.90,'Espumante brasileiro do Vale do São Francisco, leve e aromático.',true),
('vinho-santa-rita-120-pinot-grigio','Vinho Branco Santa Rita 120 Reserva Especial Pinot Grigio','Vinhos Brancos','Chile',27.90,49.90,'Vinho branco chileno elaborado com Pinot Grigio, de perfil leve e refrescante.',true),
('vinho-riccitelli-the-party-malbec','Vinho Tinto Riccitelli The Party Malbec','Vinhos Tintos','Argentina',79.90,109.90,'Vinho jovem e vibrante de Mendoza, elaborado com Malbec. Frutas vermelhas e negras, taninos macios e acidez equilibrada. Teor alcoólico: 13,5%.',true),
('vinho-baron-philippe-sauvignon-blanc','Vinho Branco Baron Philippe Sauvignon Blanc','Vinhos Brancos','Chile',32.90,49.90,'Vinho branco seco do Vale Central, elaborado com Sauvignon Blanc. Aromas cítricos e tropicais, acidez marcante. Teor alcoólico: 12,5%.',true),
('vinho-alfacinha-branco','Vinho Alfacinha Branco','Vinhos Brancos','Portugal',29.90,49.90,'Vinho branco de Lisboa, leve e fresco, elaborado com blend de castas portuguesas.',true),
('vinho-chac-chac-reserva-chardonnay','Vinho Branco Chac Chac Reserva Chardonnay','Vinhos Brancos','Argentina',42.90,59.90,'Vinho branco argentino de perfil leve e frutado, com Chardonnay, boa acidez e notas de frutas tropicais.',true),
('vinho-las-perdices-gewurztraminer','Vinho Branco Las Perdices Gewurztraminer','Vinhos Brancos','Argentina',69.90,89.90,'Vinho branco aromático de Mendoza, com notas florais, lichia, abacaxi e especiarias. Perfil meio seco.',true),
('vinho-la-croisade-grand-reserve-chardonnay','Vinho Branco La Croisade Grand Réserve Chardonnay','Vinhos Brancos','França',74.90,109.90,'Vinho branco do Languedoc, elaborado com Chardonnay. Frutas tropicais, pêssego e toques de baunilha.',true),
('vinho-burmester-ruby','Vinho do Porto Burmester Ruby','Vinhos Fortificados','Portugal',69.90,79.90,'Vinho do Porto Ruby da região do Douro, jovem e frutado, com notas de cereja, amora e ameixa.',true),
('vinho-rocas-de-sena','Vinho Tinto Rocas de Seña','Vinhos Tintos','Chile',249.90,399.90,'Vinho tinto chileno do Vale de Aconcágua, elegante e estruturado, com frutas negras, especiarias e notas de carvalho.',true),
('vinho-tua-rita-redigaffi-2015','Vinho Tinto Tua Rita Redigaffi 2015','Vinhos Tintos','Itália',2599.90,2990.90,'Vinho tinto toscano elaborado exclusivamente com Merlot, encorpado, complexo e de longa persistência.',true)
on conflict (id) do nothing;

update public.products set image_url=case id
when 'vinho-foye-reserva-chardonnay' then 'https://diawine.agilecdn.com.br/13207_1.jpg'
when 'espumante-terranova-brut' then 'https://images.tcdn.com.br/img/img_prod/1199358/espumante_miolo_terranova_brut_750ml_547_1_41c5a20d2d6e40660dfdb3ab3e65ac0c.jpg'
when 'espumante-terranova-moscatel' then 'https://www.vinhosevinhos.com/media/catalog/product/cache/f551083cd20de7ac8cf7d25adc91480d/t/e/terranova_moscatel_750ml-nova_embalagem_1.jpg'
when 'vinho-santa-rita-120-pinot-grigio' then 'https://static.paodeacucar.com/img/uploads/1/886/22316886.jpg'
when 'vinho-riccitelli-the-party-malbec' then 'https://www.winedispensary.com/cdn/shop/files/MatiasRiccitelli_TheParty_Malbec_UcoValley_Argentina.png?v=1751847222'
when 'vinho-baron-philippe-sauvignon-blanc' then 'https://images.tcdn.com.br/img/img_prod/1406013/baron_philippe_de_rothschild_sauvignon_blanc_2024_1_20260220104204_c4c90dd0d671.png'
when 'vinho-alfacinha-branco' then 'https://carrefourbr.vtexassets.com/arquivos/ids/189735267/image-0.jpg?v=638796555729070000'
when 'vinho-chac-chac-reserva-chardonnay' then 'https://diawine.agilecdn.com.br/21449_1.jpg?v=82-845148806'
when 'vinho-las-perdices-gewurztraminer' then 'https://images.tcdn.com.br/img/img_prod/712359/las_perdices_gewurztraminer_750ml_argentina_7001_1_8acfff528421fd1c84b85ddf9d1f9a7c.jpg'
when 'vinho-la-croisade-grand-reserve-chardonnay' then 'https://naracellar.com/img_wine/upload/wine/3666989372_kAV1Y0mP_d6d0b3e3b77d23ff8a6d0e7608c812d4e5716da2.jpg'
when 'vinho-burmester-ruby' then 'https://perfectewijn.nl/cdn/shop/files/burmester-ruby-port_7688.webp?v=1770110606&width=480'
when 'vinho-rocas-de-sena' then 'https://www.perfectcellar.com/cdn/shop/files/SenaRocasdeSena2021.png?v=1770378200&width=1946'
when 'vinho-tua-rita-redigaffi-2015' then 'https://peak-wines.com/cdn/shop/files/Tuarita_redigaffi_2015_front.jpg?v=1764013512&width=2048'
end, image_alt=name
where id in ('vinho-foye-reserva-chardonnay','espumante-terranova-brut','espumante-terranova-moscatel','vinho-santa-rita-120-pinot-grigio','vinho-riccitelli-the-party-malbec','vinho-baron-philippe-sauvignon-blanc','vinho-alfacinha-branco','vinho-chac-chac-reserva-chardonnay','vinho-las-perdices-gewurztraminer','vinho-la-croisade-grand-reserve-chardonnay','vinho-burmester-ruby','vinho-rocas-de-sena','vinho-tua-rita-redigaffi-2015');
