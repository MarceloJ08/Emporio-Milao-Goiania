alter table public.products
  add column madeira text check (char_length(madeira) <= 220),
  add column amadurecimento text check (char_length(amadurecimento) <= 220);

update public.products
set category = case when id = 'cardapio-la-zero-shiraz-desalcoolizado-luiz-argenta'
                    then 'Vinhos desalcoolizados' else 'Espumantes sem álcool' end
where id in (
  'cardapio-la-zero-shiraz-desalcoolizado-luiz-argenta',
  'cardapio-garibaldi-moscatel-rose-zero-alcool',
  'cardapio-jp-chenet-chardonnay-sparkling-sem-alcool'
);

-- Bodega Ramón Bilbao, ficha da safra 2022:
-- https://bodegasramonbilbao.com/wp-content/uploads/2024/08/ficha-de-cata-rb-crianza-2022-es.pdf
update public.products
set madeira = coalesce(madeira, '14 meses em barricas de carvalho americano de segundo e terceiro uso'),
    descricao_longa = coalesce(descricao_longa, 'Tempranillo de Rioja com perfil fresco e leve. Amora e ameixa aparecem ao lado de toques de baunilha, coco e alcaçuz. Na boca, é suculento e equilibrado.'),
    descricao_curta = 'Tempranillo de Rioja com amora, ameixa e toques de baunilha, coco e alcaçuz.'
where active and name ~* '^Ram[oó]n Bilbao Crianza 2022([ (]|$)';

-- Chandon, ficha do Réserve Brut: https://www.chandon.com.br/chandon-reserve-brut
update public.products
set amadurecimento = coalesce(amadurecimento, 'Pelo menos quatro meses em tanques fechados durante a segunda fermentação'),
    descricao_longa = coalesce(descricao_longa, 'Espumante brut brasileiro com borbulhas finas e perfil fresco. Os aromas lembram lima, maçã, abacaxi, flores brancas e pão fresco. Pode acompanhar sushi, frutos do mar e queijos leves.'),
    descricao_curta = 'Espumante brut fresco, com notas cítricas, flores brancas e um toque de pão fresco.'
where id = 'cardapio-chandon-reserve-brut';

-- Veuve Clicquot, ficha do Yellow Label:
-- https://www.veuveclicquot.com/en-int/veuve-clicquot-yellow-label-brut-champagne-11003681.html
update public.products
set amadurecimento = coalesce(amadurecimento, 'Amadurecimento sobre as borras'),
    descricao_longa = coalesce(descricao_longa, 'Champagne brut com predominância de Pinot Noir, complementado por Chardonnay e Meunier. Tem borbulhas finas, aromas de pera, pêssego e cítricos, além de notas de brioche.'),
    descricao_curta = 'Champagne brut com borbulhas finas, notas de pera, pêssego, cítricos e brioche.'
where id = 'cardapio-veuve-clicquot-brut-yellow-label';

-- Luiz Argenta: https://loja.luizargenta.com.br/zero/shiraz-desalcoolizado
update public.products
set teor_alcoolico = coalesce(teor_alcoolico, 0),
    amadurecimento = coalesce(amadurecimento, 'Sem amadurecimento, conforme ficha da vinícola'),
    descricao_longa = coalesce(descricao_longa, 'Fermentado tinto desalcoolizado e adoçado, feito com Shiraz de Flores da Cunha, no Rio Grande do Sul. Tem aromas de amora, cereja e framboesa, textura macia e final frutado. Sirva entre 14 e 16 °C.'),
    descricao_curta = 'Shiraz desalcoolizado de Flores da Cunha, com aromas de amora, cereja e framboesa.'
where id = 'cardapio-la-zero-shiraz-desalcoolizado-luiz-argenta';

-- Garibaldi: https://vinicolagaribaldi.com.br/wp-content/uploads/2026/05/2026-05-Garibaldi-Moscato-Zero-Rose.pdf
update public.products
set teor_alcoolico = coalesce(teor_alcoolico, 0),
    descricao_longa = coalesce(descricao_longa, 'Bebida rosé gaseificada da Serra Gaúcha, com perfil de uvas moscatéis e notas de frutas e flores vermelhas. A ficha do produtor informa 0,0% de álcool.'),
    descricao_curta = 'Rosé gaseificado da Serra Gaúcha, com notas de frutas e flores vermelhas e 0,0% de álcool.'
where id = 'cardapio-garibaldi-moscatel-rose-zero-alcool';

update public.products
set descricao_longa = coalesce(descricao_longa, 'Espumante branco sem álcool, elaborado com Chardonnay na França.'),
    descricao_curta = 'Espumante branco francês de Chardonnay, sem álcool.'
where id = 'cardapio-jp-chenet-chardonnay-sparkling-sem-alcool';

-- Expand the existing catalog notes without inferring oak, aromas or other new facts.
with notes as (
  select id, category, btrim(description) as original,
         regexp_split_to_array(btrim(description), '[[:space:]]*\|[[:space:]]*') as parts
  from public.products
  where active and nullif(btrim(descricao_longa), '') is null
    and nullif(btrim(description), '') is not null
), copy as (
  select id, case
    when cardinality(parts) between 2 and 3
         and category in ('Vinhos Tintos', 'Vinhos Brancos', 'Vinhos Rosés', 'Vinho do Porto', 'Espumantes', 'Champagnes')
         and nullif(parts[1], '') is not null and nullif(parts[2], '') is not null
      then concat(
        case category when 'Vinhos Tintos' then 'Vinho tinto'
          when 'Vinhos Brancos' then 'Vinho branco' when 'Vinhos Rosés' then 'Vinho rosé'
          when 'Vinho do Porto' then 'Vinho do Porto' when 'Champagnes' then 'Champagne'
          else 'Espumante' end,
        '. Origem: ', rtrim(parts[1], '.'), '. Composição: ', rtrim(parts[2], '.'), '.',
        case when nullif(parts[3], '') is not null
             then concat(' ', case when parts[3] ~ '^[0-9]+([.,][0-9]+)?%$' then 'Teor alcoólico: ' else '' end, rtrim(parts[3], '.'), '.')
             else '' end)
    else replace(original, ' | ', ' · ') end as long_copy
  from notes
)
update public.products p
set descricao_longa = copy.long_copy
from copy
where p.id = copy.id;
