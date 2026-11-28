-- The pictured blue-label Las Perdices is the producer's Rosé Classique.
update public.products
set uvas = array['Malbec'],
    vinificacao = 'Fermentação por 20 dias, entre 14 e 16 °C. A ficha não identifica o recipiente dessa fermentação.',
    fonte_ficha = 'https://lasperdices.com/downloads/EXPLORACION_MALBEC_ROSE_ESP.pdf'
where id = 'cardapio-las-perdices-rose' and active and not descricao_revisada;

-- Use the sheet for each vintage. The producer's 2010 press release simplifies the barrel mix.
with vintages(id, grapes, oak, maturation, vinification, source) as (
  values
    ('cardapio-castillo-ygay-gran-reserva-especial-marques-de-murrieta-2010',
     array['Tempranillo (85%)', 'Mazuelo (15%)'],
     '24 meses em barricas de carvalho americano e francês de 225 L', '5 anos em garrafa',
     'Fermentação em tanques de aço inox com temperatura controlada.',
     'https://cdn.shopify.com/s/files/1/0413/0232/7459/files/Ficha_CastilloYgay_2010-v2.pdf?v=1647953335'),
    ('cardapio-castillo-ygay-gran-reserva-especial-marques-de-murrieta-2011',
     array['Tempranillo (84%)', 'Mazuelo (16%)'],
     '28 meses em barricas de 225 L. Carvalho americano para Tempranillo e francês para Mazuelo.',
     '13 meses em tanque de concreto após o corte, antes do engarrafamento',
     'Castas fermentadas separadamente em tanques de aço inox com temperatura controlada.',
     'https://cdn.shopify.com/s/files/1/0413/0232/7459/files/Ficha_Tecnica_-_Castillo_Ygay_2011.pdf?v=1706275657')
)
update public.products p
set uvas=v.grapes, madeira=v.oak, amadurecimento=v.maturation, vinificacao=v.vinification, fonte_ficha=v.source
from vintages v where p.id=v.id and p.active and not p.descricao_revisada;

-- Align older catalog summaries with the sourced grape list.
with sourced as (
  select id, description as previous, btrim(split_part(description, '|', 2)) as old_grapes,
         array_to_string(uvas, ', ') as grapes,
         concat_ws(' | ', nullif(btrim(split_part(description, '|', 1)), ''),
           array_to_string(uvas, ', '), nullif(btrim(split_part(description, '|', 3)), '')) as summary
  from public.products
  where active and fonte_ficha is not null and cardinality(uvas)>0 and not descricao_revisada
    and split_part(description, '|', 2) <> '' and split_part(description, '|', 4) = ''
)
update public.products p
set description=s.summary,
    descricao_curta=case when p.descricao_curta=s.previous then
      case when char_length(s.summary)<=140 then s.summary else null end
      else p.descricao_curta end,
    descricao_longa=replace(p.descricao_longa, 'Composição: ' || rtrim(s.old_grapes, '.') || '.', 'Composição: ' || rtrim(s.grapes, '.') || '.')
from sourced s
where p.id=s.id and s.old_grapes<>s.grapes;
