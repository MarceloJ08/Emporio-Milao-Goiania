-- Valores publicados pelo cardápio oficial em 27/11/2026.
-- https://emporiomilaoprime.meucardapio.ai/categoria/sele%C3%A7%C3%A3o-black-friday/43772
-- Atualiza apenas correspondências conferidas, com proteção contra edição concorrente.
do $sync$
declare
  matched_count integer;
begin
  update public.products as product
  set price = source.price,
      compare_at_price = source.reference_price,
      updated_at = case when (product.price, product.compare_at_price) is distinct from (source.price, source.reference_price)
                        then now() else product.updated_at end
  from (values
    ('cardapio-1792-small-batch', 199.90::numeric, 249.90::numeric, 199.99::numeric, null::numeric),
    ('cardapio-alba-de-domus-cabernet-sauvignon-2020', 249.90::numeric, 289.90::numeric, 229.90::numeric, null::numeric),
    ('cardapio-almaviva-2023', 1499.90::numeric, null::numeric, 1099.90::numeric, null::numeric),
    ('cardapio-altazor-d-o-valle-del-maipo-2024', 279.90::numeric, 349.90::numeric, 199.90::numeric, null::numeric),
    ('cardapio-apothic-red', 89.90::numeric, 139.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-arrepiado-collection', 299.90::numeric, 319.90::numeric, 329.90::numeric, null::numeric),
    ('cardapio-belhara-estate-block-10-cabernet-franc', 89.90::numeric, 109.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-belhara-estate-gran-corte-2024', 69.90::numeric, 89.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-burmester-tawny', 69.90::numeric, 79.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-caballo-loco-experimental-cuarzo-2023', 179.90::numeric, 269.90::numeric, 179.90::numeric, null::numeric),
    ('cardapio-caballo-loco-experimental-granitico-2018', 179.90::numeric, 259.90::numeric, 179.90::numeric, null::numeric),
    ('cardapio-carnivor-cabernet-sauvignon', 69.90::numeric, 99.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-carnivor-zinfandel', 69.90::numeric, 99.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-casa-perini-brut', 44.90::numeric, null::numeric, 42.90::numeric, null::numeric),
    ('cardapio-casa-perini-ice', 54.90::numeric, null::numeric, 49.99::numeric, null::numeric),
    ('cardapio-casa-perini-moscatel', 44.90::numeric, 64.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-casa-perini-prosecco', 44.90::numeric, 64.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-casa-valduga-naturelle-tinto-suave', 59.90::numeric, 79.90::numeric, 54.90::numeric, null::numeric),
    ('cardapio-casas-del-toqui-barrel-series-reserva-cabernet-sauvignon-2023', 44.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-casas-del-toqui-barrel-series-reserva-carmenere-2023', 44.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-casas-del-toqui-gran-reserva-cabernet-sauvignon-2022', 69.90::numeric, 79.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-casas-del-toqui-gran-reserva-carmenere-2022', 69.90::numeric, 79.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-cava-negra-cabernet-sauvignon-2025', 32.90::numeric, 49.90::numeric, 29.90::numeric, null::numeric),
    ('cardapio-cava-negra-malbec-2025', 32.90::numeric, 49.90::numeric, 29.90::numeric, null::numeric),
    ('cardapio-cava-negra-merlot-2025', 32.90::numeric, 49.90::numeric, 29.90::numeric, null::numeric),
    ('cardapio-cava-negra-torrontes', 32.90::numeric, 49.90::numeric, 33.90::numeric, null::numeric),
    ('cardapio-caymus-napa-valley-zinfandel-2022', 539.90::numeric, 649.90::numeric, 539.90::numeric, null::numeric),
    ('cardapio-chac-chac-cabernet-franc-2025', 29.90::numeric, 39.90::numeric, 27.90::numeric, null::numeric),
    ('cardapio-chac-chac-reserva-malbec', 42.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-chac-chac-reserva-pinot-noir', 42.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-chac-chac-reserva-tannat', 42.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-chac-chac-sauvignon-blanc-2025', 32.90::numeric, 39.90::numeric, 27.90::numeric, null::numeric),
    ('cardapio-champagne-montaudon-brut', 239.90::numeric, 259.90::numeric, 229.90::numeric, null::numeric),
    ('cardapio-chandon-brut-rose', 89.90::numeric, 119.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-chandon-passion-on-ice', 94.90::numeric, null::numeric, 89.90::numeric, null::numeric),
    ('cardapio-chandon-riche-demi-sec', 94.90::numeric, 119.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-chateau-palmer-2017', 3999.90::numeric, 4279.00::numeric, 3499.90::numeric, null::numeric),
    ('cardapio-chivas-regal-12-anos-1-l', 139.90::numeric, null::numeric, 129.90::numeric, null::numeric),
    ('cardapio-clos-apalta-2021', 999.90::numeric, 1099.90::numeric, 999.90::numeric, null::numeric),
    ('cardapio-cordero-con-piel-de-lobo-malbec-2025', 49.90::numeric, null::numeric, 44.90::numeric, null::numeric),
    ('cardapio-cuvee-dissenay-chardonnay-2025', 89.99::numeric, 110.00::numeric, 89.90::numeric, null::numeric),
    ('cardapio-escorihuela-gascon-don-malbec', 399.90::numeric, null::numeric, 399.00::numeric, null::numeric),
    ('cardapio-finca-la-anita-gran-corte-2022', 119.90::numeric, 139.90::numeric, 99.90::numeric, null::numeric),
    ('cardapio-finca-la-anita-petit-verdot-2022', 119.90::numeric, 139.90::numeric, 99.90::numeric, null::numeric),
    ('cardapio-finca-la-anita-syrah-2022', 119.90::numeric, 139.90::numeric, 99.90::numeric, null::numeric),
    ('cardapio-foye-gran-reserva-cabernet-sauvignon', 39.90::numeric, 54.90::numeric, 39.90::numeric, null::numeric),
    ('cardapio-foye-gran-reserva-carmenere', 39.90::numeric, 54.90::numeric, 39.90::numeric, null::numeric),
    ('cardapio-freixenet-cordon-negro-brut', 69.90::numeric, 72.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-garibaldi-prosecco-rose', 37.90::numeric, 59.90::numeric, 39.90::numeric, null::numeric),
    ('cardapio-graham-beck-brut-nv', 169.90::numeric, 199.90::numeric, 169.90::numeric, null::numeric),
    ('cardapio-johnnie-walker-18-anos', 499.90::numeric, 549.90::numeric, 499.90::numeric, null::numeric),
    ('cardapio-johnnie-walker-black-label-12-anos-1-l', 189.90::numeric, 259.90::numeric, 189.90::numeric, null::numeric),
    ('cardapio-johnnie-walker-gold-label-reserve', 269.90::numeric, 279.90::numeric, 259.90::numeric, null::numeric),
    ('cardapio-johnnie-walker-green-label-15-anos', 449.90::numeric, 534.90::numeric, 449.90::numeric, null::numeric),
    ('cardapio-judas-malbec', 349.90::numeric, null::numeric, 279.90::numeric, null::numeric),
    ('cardapio-julia-florista-tinto', 28.90::numeric, 44.90::numeric, 29.90::numeric, null::numeric),
    ('cardapio-la-dame-de-montrose', 599.90::numeric, 689.90::numeric, 1399.90::numeric, null::numeric),
    ('cardapio-las-perdices-reserva-bonarda', 69.90::numeric, 79.90::numeric, 69.90::numeric, null::numeric),
    ('cardapio-las-perdices-riesling-2024', 79.90::numeric, 99.90::numeric, 79.90::numeric, null::numeric),
    ('cardapio-las-perdices-tinamu', 199.90::numeric, 209.90::numeric, 199.90::numeric, null::numeric),
    ('cardapio-le-c-de-calon-segur', 349.90::numeric, 409.90::numeric, 349.90::numeric, null::numeric),
    ('cardapio-le-marquis-de-calon-segur-2021', 549.90::numeric, 619.90::numeric, 549.90::numeric, null::numeric),
    ('cardapio-le-petit-cochonnet-cabernet-sauvignon', 42.90::numeric, 59.90::numeric, 42.90::numeric, null::numeric),
    ('cardapio-le-petit-cochonnet-merlot', 42.90::numeric, 59.90::numeric, 39.90::numeric, null::numeric),
    ('cardapio-les-pagodes-de-cos-2020', 649.90::numeric, 729.90::numeric, 649.90::numeric, null::numeric),
    ('cardapio-lindaflor-la-violeta-malbec-2016', 1199.90::numeric, 1290.90::numeric, 1099.90::numeric, null::numeric),
    ('cardapio-louis-latour-chablis-2024', 329.90::numeric, null::numeric, 299.90::numeric, null::numeric),
    ('cardapio-lyngrove-collection-pinotage-2023', 59.90::numeric, null::numeric, 49.90::numeric, null::numeric),
    ('cardapio-marques-de-casa-concha-heritage-2022', 189.99::numeric, 289.99::numeric, 179.90::numeric, null::numeric),
    ('cardapio-menage-a-trois-lavish-merlot', 99.90::numeric, 109.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-menage-a-trois-midnight-dark-red-blend', 99.90::numeric, 109.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-menage-a-trois-silk-soft-red-blend', 99.90::numeric, 109.90::numeric, 89.90::numeric, null::numeric),
    ('cardapio-montes-alpha-cabernet-sauvignon-2022', 119.90::numeric, null::numeric, 109.90::numeric, null::numeric),
    ('cardapio-montes-alpha-special-cuvee-carmenere', 189.90::numeric, 239.90::numeric, 179.90::numeric, null::numeric),
    ('cardapio-montes-folly-syrah', 599.90::numeric, 639.90::numeric, 599.90::numeric, null::numeric),
    ('cardapio-n3-d-angelus-2023', 599.90::numeric, 799.90::numeric, 599.90::numeric, null::numeric),
    ('cardapio-opus-one-2017', 5499.90::numeric, null::numeric, 4499.00::numeric, null::numeric),
    ('cardapio-piccini-memoro-bianco', 69.90::numeric, 79.90::numeric, 59.90::numeric, null::numeric),
    ('cardapio-portillo-valle-de-uco-cabernet-sauvignon-2024', 39.90::numeric, 49.90::numeric, 34.90::numeric, null::numeric),
    ('cardapio-portillo-valle-de-uco-merlot-2025', 39.90::numeric, 49.90::numeric, 34.90::numeric, null::numeric),
    ('cardapio-portillo-valle-de-uco-pinot-noir-2025', 39.90::numeric, 49.90::numeric, 34.90::numeric, null::numeric),
    ('cardapio-ramon-bilbao-crianza-2022', 79.90::numeric, 109.90::numeric, 79.90::numeric, null::numeric),
    ('cardapio-ramon-bilbao-reserva-2019', 109.90::numeric, 139.90::numeric, 109.90::numeric, null::numeric),
    ('cardapio-royal-salute-21-anos-the-signature-blend', 699.90::numeric, 999.90::numeric, 749.90::numeric, null::numeric),
    ('cardapio-ruinart-blanc-de-blancs', 679.90::numeric, null::numeric, 649.90::numeric, null::numeric),
    ('cardapio-sena-2023', 499.90::numeric, 759.90::numeric, 599.90::numeric, null::numeric),
    ('cardapio-taittinger-brut-reserve', 429.90::numeric, null::numeric, 349.90::numeric, null::numeric),
    ('cardapio-taittinger-prestige-rose', 549.90::numeric, null::numeric, 499.90::numeric, null::numeric),
    ('cardapio-terrunyo-carmenere-concha-y-toro-2019', 189.90::numeric, 229.90::numeric, 189.90::numeric, null::numeric),
    ('cardapio-the-prisoner-cabernet-sauvignon', 499.90::numeric, 519.90::numeric, 479.90::numeric, null::numeric),
    ('cardapio-undurraga-demi-sec', 32.90::numeric, 59.90::numeric, 32.90::numeric, null::numeric),
    ('cardapio-undurraga-sweet', 32.90::numeric, 59.90::numeric, 32.90::numeric, null::numeric),
    ('cardapio-vik-la-piu-belle', 349.90::numeric, 419.90::numeric, 339.90::numeric, null::numeric),
    ('cardapio-vik-la-piu-belle-rose', 99.90::numeric, 159.90::numeric, 99.90::numeric, null::numeric),
    ('cardapio-vina-alberdi-reserva-la-rioja-alta', 329.90::numeric, 399.90::numeric, 299.90::numeric, null::numeric),
    ('espumante-terranova-brut', 26.99::numeric, 49.90::numeric, 27.90::numeric, 49.90::numeric),
    ('espumante-terranova-moscatel', 26.99::numeric, 49.90::numeric, 27.90::numeric, 49.90::numeric),
    ('vinho-alfacinha-branco', 29.90::numeric, 49.90::numeric, 27.90::numeric, 49.90::numeric),
    ('vinho-baron-philippe-sauvignon-blanc', 32.90::numeric, 49.90::numeric, 29.90::numeric, 49.90::numeric),
    ('vinho-las-perdices-gewurztraminer', 79.90::numeric, 99.90::numeric, 79.90::numeric, 89.90::numeric),
    ('vinho-rocas-de-sena', 279.00::numeric, 349.90::numeric, 269.90::numeric, 399.90::numeric),
    ('vinho-tua-rita-redigaffi-2015', 2799.90::numeric, null::numeric, 2799.90::numeric, 2990.90::numeric)
  ) as source(id, price, reference_price, previous_price, previous_reference)
  where product.id = source.id and product.active
    and ((product.price, product.compare_at_price) is not distinct from (source.previous_price, source.previous_reference)
      or (product.price, product.compare_at_price) is not distinct from (source.price, source.reference_price));

  get diagnostics matched_count = row_count;
  if matched_count <> 102 then
    raise exception 'Catálogo alterado durante a preparação: % itens encontrados.', matched_count;
  end if;
end;
$sync$;

-- Kits e embalagens são produtos próprios. O cadastro não altera saldos.
insert into public.products
  (id, name, category, country, price, compare_at_price, description, image_url, image_alt, active)
values
  ('cardapio-campari-aperitivo', 'Campari', 'Aperitivos', 'Itália', 59.90, null, 'Aperitivo italiano de perfil amargo e herbal.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/campari-aperitivo.webp', 'Embalagem de Campari.', true),
  ('cardapio-bottega-pistacchio-500-ml', 'Licor Bottega Pistacchio 500 ml', 'Licores', 'Itália', 149.90, 179.90, 'Licor cremoso de pistache siciliano.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/bottega-pistacchio-500-ml.webp', 'Embalagem de Licor Bottega Pistacchio 500 ml.', true),
  ('cardapio-kit-norton-altura-malbec-com-decanter', 'Kit Norton Altura Malbec com decanter', 'Utensílios', 'Argentina', 149.90, null, 'Kit com uma garrafa de Norton Altura Malbec e um decanter.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/kit-norton-altura-malbec-com-decanter.webp', 'Embalagem de Kit Norton Altura Malbec com decanter.', true),
  ('cardapio-kit-santa-carolina-anniversary-com-decanter', 'Kit Santa Carolina Anniversary com decanter', 'Utensílios', 'Chile', 149.90, null, 'Kit com uma garrafa de Santa Carolina Anniversary e um decanter.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/kit-santa-carolina-anniversary-com-decanter.webp', 'Embalagem de Kit Santa Carolina Anniversary com decanter.', true),
  ('cardapio-breez-cooler-galiotto-maca-verde', 'Breez Cooler Galiotto Maçã Verde', 'Bebidas Mistas', 'Brasil', 6.49, 9.99, 'Cooler Galiotto sabor maçã verde.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/breez-cooler-galiotto-maca-verde.webp', 'Embalagem de Breez Cooler Galiotto Maçã Verde.', true),
  ('cardapio-breez-cooler-galiotto-pessego', 'Breez Cooler Galiotto Pêssego', 'Bebidas Mistas', 'Brasil', 6.49, 9.99, 'Cooler Galiotto sabor pêssego.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/breez-cooler-galiotto-pessego.webp', 'Embalagem de Breez Cooler Galiotto Pêssego.', true),
  ('cardapio-breez-cooler-galiotto-morango', 'Breez Cooler Galiotto Morango', 'Bebidas Mistas', 'Brasil', 6.49, 9.99, 'Cooler Galiotto sabor morango.', 'https://emporio-milao-goiania.vercel.app/src/images/catalogo/breez-cooler-galiotto-morango.webp', 'Embalagem de Breez Cooler Galiotto Morango.', true)
on conflict (id) do nothing;
