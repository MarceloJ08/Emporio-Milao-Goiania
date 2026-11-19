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
