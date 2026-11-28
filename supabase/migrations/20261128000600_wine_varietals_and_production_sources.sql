alter table public.products
  add column vinificacao text check (char_length(vinificacao) <= 220),
  add column fonte_ficha text check (char_length(fonte_ficha) <= 500 and fonte_ficha ~ '^https://[^[:space:]]+$');

-- Restore the varietal field from the existing region | grapes | ABV catalog notes.
-- Generic blend, color, and sweetness labels do not identify castes.
with candidate as (
  select id, btrim(split_part(description, '|', 2)) as grapes
  from public.products
  where active and tipo_vinho is not null and cardinality(uvas)=0
)
update public.products p
set uvas = array[c.grapes]
from candidate c
where p.id=c.id and nullif(c.grapes,'') is not null
  and c.grapes !~* '^(blend |red blend$|castas |corte (alentejano|branco|de tintas|português|tinto)|brut$|doce$|rosé$|tinto suave$|vinho do porto)'
  and c.grapes !~ '[0-9%]';

-- Producer references are recorded per label. Unknown years and vessels remain unspecified.
with facts(id,grapes,oak,maturation,winemaking,source) as (
  values
    ('cardapio-casal-garcia-rose', array['Touriga Nacional', 'Sousão', 'Syrah', 'Tinta Roriz', 'entre outras'], null, null, null, 'https://casalgarcia.com/pt-br/vinho-rose/'),
    ('cardapio-casal-garcia-sweet-rose', array['Touriga Nacional', 'Sousão', 'Syrah', 'Tinta Roriz', 'entre outras'], null, null, 'Fermentação com temperatura controlada. A ficha não especifica o material do tanque.', 'https://casalgarcia.com/wp-content/uploads/2025/07/FT-Casal-Garcia-Sweet-Rose-1.pdf'),
    ('cardapio-esteban-martin-d-o-carinena-rosado-2024', array['Garnacha'], null, null, null, 'https://www.estebanmartin.com/esteban-martin-rosado/'),
    ('cardapio-insaciable-rioja-garnacha-rose', array['Garnacha'], null, null, null, 'https://www.bodegaslamateo.com/es/vinos/34-in-insaciable.html'),
    ('cardapio-miraval-rose-cotes-de-provence', array['Cinsault', 'Grenache', 'Syrah', 'Rolle'], null, null, '95% em cubas de inox e 5% em barricas; o produtor não especifica o carvalho nem a duração do estágio.', 'https://www.miraval.com/une-oeuvre/'),
    ('cardapio-piccini-memoro-rosato', null::text[], null, null, null, 'https://shop.piccini1882.it/it/eur/it/prodotti/memoro-rosato-piccini'),
    ('cardapio-solaia-antinori-2021', array['Cabernet Sauvignon', 'Cabernet Franc', 'Sangiovese'], 'Cerca de 16 meses em barricas novas de carvalho francês', null, null, 'https://www.antinori.it/en/vino/solaia-en/?wineyear=2021'),
    ('cardapio-opus-one-2017', array['Cabernet Sauvignon', 'Petit Verdot', 'Merlot', 'Cabernet Franc', 'Malbec'], '17 meses em barricas novas de carvalho francês', null, null, 'https://www.opusonewinery.com/opus-one-2017/'),
    ('cardapio-vega-sicilia-unico-2013', array['Tempranillo', 'Cabernet Sauvignon'], '5 anos entre barricas e tonéis de carvalho francês e americano', 'Mais 5 anos em garrafa', null, 'https://www.temposvegasicilia.com/f/es/vino/unico-es-1699.pdf'),
    ('cardapio-valbuena-5-vega-sicilia-2019', array['Tinto Fino', 'Merlot'], 'Barricas novas e usadas de carvalho francês e americano de 225 L, além de tonéis de carvalho; o produtor informa 5 anos entre madeira e garrafa', null, null, 'https://www.temposvegasicilia.com/en/wine/236/valbuena-5/2019'),
    ('cardapio-ornellaia-bolgheri-superiore-2022', null::text[], 'Cerca de 18 meses em barricas de carvalho', 'Mais 12 meses em garrafa antes do lançamento', 'Fermentação em tanques de inox e concreto. Malolática principalmente em barricas, 70% novas e 30% de segundo uso.', 'https://www.ornellaia.com/en/wines/ornellaia-2022/'),
    ('cardapio-chateau-montrose-2014', array['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc', 'Petit Verdot'], '18 meses em barricas de carvalho francês, com 60% de barricas novas no método divulgado pelo château', null, null, 'https://www.chateau-montrose.com/chateau-montrose/'),
    ('cardapio-la-dame-de-montrose', null::text[], '12 meses em barricas de carvalho francês, 30% novas, segundo a ficha geral do produtor', null, null, 'https://www.chateau-montrose.com/en/la-dame-de-montrose/'),
    ('cardapio-la-dame-de-montrose-2013-1-5-l', array['Merlot', 'Cabernet Sauvignon', 'Cabernet Franc'], null, null, null, 'https://www.chateau-montrose.com/wp-content/uploads/2017/02/DA-2013-FR.pdf'),
    ('cardapio-castillo-ygay-gran-reserva-especial-marques-de-murrieta-2010', array['Tempranillo', 'Mazuelo'], '24 meses em barricas de carvalho americano, conforme resumo do produtor', 'Mais 5 anos em garrafa', null, 'https://marquesdemurrieta.com/blogs/noticias/castilloygayelmejorgranreservadelmundo'),
    ('cardapio-louis-roederer-cristal-2016', array['Pinot Noir', 'Chardonnay'], null, null, '31% dos vinhos-base passaram por madeira; a ficha de 2016 não especifica o recipiente nem a duração desse estágio.', 'https://www.louis-roederer.com/sites/default/files/pdf/ft_cristal_2016_en.pdf'),
    ('cardapio-casa-valduga-130-brut-rose', array['Chardonnay', 'Pinot Noir'], null, '36 meses sobre as leveduras em garrafa, pelo método tradicional', null, 'https://www.casavalduga.com.br/api/media/file/Ficha%20Tecnica%20-%20130%20-%20Brut%20Rose.pdf'),
    ('cardapio-chandon-brut-rose', array['Chardonnay', 'Pinot Noir', 'Riesling Itálico'], null, 'Pelo menos 4 meses em tanques fechados durante a segunda fermentação', null, 'https://www.chandon.com.br/chandon-brut-rose'),
    ('cardapio-chandon-brut-rose-375-ml', array['Chardonnay', 'Pinot Noir', 'Riesling Itálico'], null, 'Pelo menos 4 meses em tanques fechados durante a segunda fermentação', null, 'https://www.chandon.com.br/chandon-brut-rose'),
    ('cardapio-chandon-reserve-brut', array['Chardonnay', 'Pinot Noir', 'Riesling Itálico'], null, 'Pelo menos 4 meses em tanques de aço inox durante a segunda fermentação', null, 'https://www.chandon.com.br/comunidade/vinificacao-o-processo-de-producao-de-vinhos-e-espumantes'),
    ('cardapio-ramon-bilbao-crianza-2022', array['Tempranillo'], null, null, 'Fermentações alcoólica e malolática em aço inox, antes do estágio em barricas.', 'https://bodegasramonbilbao.com/wp-content/uploads/2024/08/ficha-de-cata-rb-crianza-2022-es.pdf'),
    ('cardapio-veuve-clicquot-brut-yellow-label', array['Pinot Noir', 'Chardonnay', 'Meunier'], null, null, null, 'https://www.veuveclicquot.com/en-int/veuve-clicquot-yellow-label-brut-champagne-11003681.html'),
    ('cardapio-la-zero-shiraz-desalcoolizado-luiz-argenta', array['Shiraz'], null, 'Sem estágio de amadurecimento, conforme ficha da vinícola.', null, 'https://loja.luizargenta.com.br/zero/shiraz-desalcoolizado')
)
update public.products p
set uvas=case when p.descricao_revisada then p.uvas else coalesce(f.grapes,p.uvas) end,
    madeira=coalesce(p.madeira,f.oak),
    amadurecimento=case when p.descricao_revisada then p.amadurecimento else coalesce(f.maturation,p.amadurecimento) end,
    vinificacao=f.winemaking,
    fonte_ficha=f.source
from facts f
where p.id=f.id and p.active;
