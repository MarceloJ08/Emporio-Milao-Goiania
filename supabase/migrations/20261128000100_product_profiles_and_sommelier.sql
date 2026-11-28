-- Fichas e sugestões do catálogo. Informações ausentes permanecem vazias.
create type public.vinho_corpo as enum ('leve', 'medio', 'encorpado');
create type public.vinho_estilo as enum ('seco', 'suave', 'doce', 'espumante');
create type public.vinho_tipo as enum ('tinto', 'branco', 'rose', 'espumante', 'sobremesa', 'fortificado');
create type public.ficha_intensidade as enum ('baixa', 'media', 'alta');
create type public.kit_categoria as enum ('vinho', 'queijo', 'acessorio', 'petisco', 'doce', 'embalagem');

alter table public.products
  add column tipo_vinho public.vinho_tipo,
  add column corpo public.vinho_corpo,
  add column estilo public.vinho_estilo,
  add column harmoniza_com text[] not null default '{}',
  add column ocasioes text[] not null default '{}',
  add column produto_combina_ids text[] not null default '{}',
  add column destaque_motivo text check (char_length(destaque_motivo) <= 180),
  add column elegivel_kit boolean not null default false,
  add column categoria_kit public.kit_categoria,
  add column uvas text[] not null default '{}',
  add column regiao_vinho text,
  add column safra smallint check (safra between 1800 and 2100),
  add column produtor text,
  add column acidez public.ficha_intensidade,
  add column taninos public.ficha_intensidade,
  add column teor_alcoolico numeric(4,1) check (teor_alcoolico between 0 and 99.9),
  add column aromas text[] not null default '{}',
  add column sabor_resumo text,
  add column temperatura_servico text,
  add column potencial_guarda text,
  add column perfil_cliente text,
  add column descricao_curta text check (char_length(descricao_curta) <= 140),
  add column descricao_longa text,
  add column descricao_revisada boolean not null default false,
  add constraint products_ficha_food check (harmoniza_com <@ array['carne','massa','queijo','peixe','aves','sobremesa','petisco']),
  add constraint products_ficha_occasion check (ocasioes <@ array['jantar_a_dois','churrasco','presente','negocios','comemoracao','dia_a_dia']),
  add constraint products_ficha_kind check ((tipo_vinho is not null or (corpo is null and estilo is null and acidez is null)) and (taninos is null or tipo_vinho is not distinct from 'tinto')),
  add constraint products_ficha_kit check (not elegivel_kit or categoria_kit is not null),
  add constraint products_ficha_pairing check (cardinality(produto_combina_ids) <= 20 and not (id = any(produto_combina_ids)));

-- Só aproveita fatos declarados no cadastro. Nenhum corpo, estilo ou ocasião é inferido.
update public.products
set tipo_vinho = case lower(category)
    when 'vinhos tintos' then 'tinto'::public.vinho_tipo
    when 'vinhos brancos' then 'branco'::public.vinho_tipo
    when 'vinhos rosés' then 'rose'::public.vinho_tipo
    when 'vinho do porto' then 'fortificado'::public.vinho_tipo
    else 'espumante'::public.vinho_tipo
  end,
  safra = substring(name from '\m(19[0-9]{2}|20[0-9]{2})\M')::smallint,
  descricao_curta = case when char_length(trim(description)) between 1 and 140 then trim(description) end
where lower(category) in ('vinhos tintos','vinhos brancos','vinhos rosés','vinho do porto','champagnes','espumantes');

create table public.sommelier_sessoes (
  id uuid primary key,
  ocasiao text not null,
  comida text not null,
  faixa text not null,
  gosto text not null,
  recomendados text[] not null,
  escolhido text,
  created_at timestamptz not null default now()
);
alter table public.sommelier_sessoes enable row level security;
revoke all on public.sommelier_sessoes from anon, authenticated;
grant select on public.sommelier_sessoes to authenticated;
create policy sommelier_admin_read on public.sommelier_sessoes for select to authenticated using ((select private.is_admin()));

create function public.record_sommelier_session(p_id uuid, p_answers jsonb, p_recommended text[], p_selected text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or p_answers->>'occasion' is null or p_answers->>'food' is null
    or p_answers->>'budget' is null or p_answers->>'taste' is null
    or p_answers->>'occasion' not in ('jantar_a_dois','churrasco','presente','negocios','comemoracao')
    or p_answers->>'food' not in ('carne','massa','queijo','peixe','nenhuma')
    or p_answers->>'budget' not in ('ate150','150a400','400a1000','acima1000','qualquer')
    or p_answers->>'taste' not in ('leve','encorpado','seco','suave','surpresa')
    or p_recommended is null or cardinality(p_recommended) not between 1 and 3
    or (p_selected is not null and not (p_selected = any(p_recommended)))
    or exists (select 1 from unnest(p_recommended) as recommendation(id)
      where not exists (select 1 from public.products p where p.id = recommendation.id and p.active and p.tipo_vinho is not null))
  then raise exception 'Sessão de Sommelier inválida.'; end if;
  if p_selected is null then
    insert into public.sommelier_sessoes (id,ocasiao,comida,faixa,gosto,recomendados)
    values (p_id,p_answers->>'occasion',p_answers->>'food',p_answers->>'budget',p_answers->>'taste',p_recommended)
    on conflict (id) do nothing;
  else
    update public.sommelier_sessoes set escolhido=p_selected
    where id=p_id and recomendados=p_recommended and escolhido is null;
  end if;
end;
$$;

-- Expõe apenas disponibilidade comercial, limitada a "4 ou mais".
create function public.catalog_profile_availability()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'stores', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from public.store_locations s where s.active), '[]'::jsonb),
    'stock', coalesce((select jsonb_object_agg(item.product_id, item.branches)
      from (select i.product_id, jsonb_object_agg(i.store_id::text, least(i.quantity, 4)) branches
        from public.store_inventory i
        join public.store_locations s on s.id=i.store_id and s.active
        join public.products p on p.id=i.product_id and p.active
        where i.quantity > 0 and (p.tipo_vinho is not null or p.elegivel_kit or exists (
          select 1 from public.products wine where wine.active and i.product_id = any(wine.produto_combina_ids)))
        group by i.product_id) item), '{}'::jsonb)
  );
$$;
revoke all on function public.record_sommelier_session(uuid,jsonb,text[],text) from public;
revoke all on function public.catalog_profile_availability() from public;
grant execute on function public.record_sommelier_session(uuid,jsonb,text[],text) to anon, authenticated;
grant execute on function public.catalog_profile_availability() to anon, authenticated;
