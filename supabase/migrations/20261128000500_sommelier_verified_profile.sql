-- Ramón Bilbao Crianza 2022: ficha técnica, harmonização e classificação no Brasil.
-- https://bodegasramonbilbao.com/wp-content/uploads/2024/08/ficha-de-cata-rb-crianza-2022-es.pdf
-- https://bodegasramonbilbao.com/maridaje-de-vino-y-queso-siente-el-alma-de-ramon-bilbao-crianza/
-- https://www.wine.com.br/product-view.ep/vinhos/ramon-bilbao-crianza-2022/prod31993.html
update public.products
set tipo_vinho = coalesce(tipo_vinho, 'tinto'),
    corpo = coalesce(corpo, 'leve'),
    estilo = coalesce(estilo, 'seco'),
    uvas = case when cardinality(uvas) = 0 then array['Tempranillo'] else uvas end,
    regiao_vinho = coalesce(regiao_vinho, 'Rioja'),
    harmoniza_com = case when cardinality(harmoniza_com) = 0 then array['queijo'] else harmoniza_com end,
    ocasioes = case when cardinality(ocasioes) = 0 then array['dia_a_dia'] else ocasioes end,
    aromas = case when cardinality(aromas) = 0 then array['amora', 'ameixa', 'baunilha'] else aromas end
where id = 'cardapio-ramon-bilbao-crianza-2022' and active;
