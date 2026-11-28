import { isAlcoholFreeWine } from './catalog-collections.mjs';

export const BODY = {leve:'Leve', medio:'Médio', encorpado:'Encorpado'};
export const STYLE = {seco:'Seco', suave:'Suave', doce:'Doce', espumante:'Espumante'};
export const TYPE = {tinto:'Tinto', branco:'Branco', rose:'Rosé', espumante:'Espumante', sobremesa:'Sobremesa', fortificado:'Fortificado'};
export const INTENSITY = {baixa:'Baixa', media:'Média', alta:'Alta'};
export const FOOD = {carne:'Carne', massa:'Massa', queijo:'Queijo', peixe:'Peixe', aves:'Aves', sobremesa:'Sobremesa', petisco:'Petisco'};
export const OCCASION = {jantar_a_dois:'Jantar a dois', churrasco:'Churrasco', presente:'Presente', negocios:'Reunião de negócios', comemoracao:'Comemoração', dia_a_dia:'Dia a dia'};
export const KIT_CATEGORY = {vinho:'Vinho', queijo:'Queijo', acessorio:'Acessório', petisco:'Petisco', doce:'Doce', embalagem:'Embalagem'};
export const GIFT_OCCASION = {natal:'Natal', namorados:'Dia dos Namorados', aniversario:'Aniversário', agradecimento:'Agradecimento', corporativo:'Corporativo', outra:'Outra ocasião'};
export const CARD_STYLE = {classico:'Clássico', romantico:'Romântico', corporativo:'Corporativo'};
export const BUDGET = {
  ate150:{label:'Até R$ 150', min:0, max:150},
  '150a400':{label:'R$ 150 a R$ 400', min:150, max:400},
  '400a1000':{label:'R$ 400 a R$ 1.000', min:400, max:1000},
  acima1000:{label:'Acima de R$ 1.000', min:1000, max:Infinity},
  qualquer:{label:'Tanto faz', min:0, max:Infinity},
};
export const TASTE = {leve:'Leve', encorpado:'Encorpado', seco:'Seco', suave:'Suave ou adocicado', surpresa:'Surpreenda-me'};
export const PROFILE_FIELDS = 'tipo_vinho,corpo,estilo,harmoniza_com,ocasioes,produto_combina_ids,destaque_motivo,elegivel_kit,categoria_kit,uvas,regiao_vinho,safra,produtor,acidez,taninos,teor_alcoolico,aromas,sabor_resumo,temperatura_servico,potencial_guarda,madeira,amadurecimento,perfil_cliente,descricao_curta,descricao_longa,descricao_revisada';

export const profileComplete = wine => Boolean(wine.tipo_vinho && wine.corpo && wine.estilo && wine.harmoniza_com?.length && wine.ocasioes?.length);
export const totalAvailability = (catalog,id) => Object.values(catalog.stock?.[id] || {}).reduce((n,qty)=>n+Number(qty),0);
export const eligibleStores = (catalog,ids) => ids.length ? catalog.stores.filter(store=>ids.every(id=>catalog.stock?.[id]?.[store.id]>0)) : [];
export const money = value => Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const safeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const hasOffensiveText = value => /\b(puta|puto|merda|caralho|porra|vadia)\b/i.test(value);

export function recommendWines(products, catalog, answers) {
  const range=BUDGET[answers.budget] || BUDGET.qualquer;
  const candidates=products.filter(p=>!isAlcoholFreeWine(p)&&profileComplete(p)&&p.price>0&&totalAvailability(catalog,p.id)>0).map(product=>({
    product,
    occasion:product.ocasioes.includes(answers.occasion),
    food:answers.food==='nenhuma'||product.harmoniza_com.includes(answers.food),
    taste:answers.taste==='surpresa'||product.corpo===answers.taste||product.estilo===answers.taste||(answers.taste==='suave'&&product.estilo==='doce'),
    availability:totalAvailability(catalog,product.id),
    within:product.price>=range.min&&product.price<=range.max,
  }));
  let ranked=[];let relaxed=0;
  for (let step=0;step<=3;step++) {
    relaxed=step;
    ranked=candidates.filter(({product,food,taste,within})=>(step>=1||taste)&&(step>=2||food)&&
      (within||(step===3&&product.price>=range.min&&product.price<=range.max*1.2)));
    if(ranked.length>=3)break;
  }
  const score=hit=>3*Number(hit.occasion)+3*Number(hit.food&&answers.food!=='nenhuma')+
    3*Number(hit.taste&&answers.taste!=='surpresa')+2*Number(hit.within)+Number(Boolean(hit.product.destaque_motivo));
  ranked.sort((a,b)=>score(b)-score(a)||b.availability-a.availability||a.product.name.localeCompare(b.product.name,'pt-BR'));
  const pool=ranked.slice(0,7);
  const best=pool.shift();
  if(!best)return {results:[],relaxed:false};
  const alternate=pool.find(hit=>hit.product.price<best.product.price)||pool[0];
  const remaining=pool.filter(hit=>hit!==alternate);
  const special=remaining.find(hit=>hit.product.price>Math.max(best.product.price,alternate?.product.price||0))||remaining[0];
  return {results:[best,alternate,special].filter(Boolean),relaxed:relaxed>0};
}

export function wineReason(hit, answers) {
  const p=hit.product;
  const facts=['corpo '+BODY[p.corpo].toLowerCase(),'estilo '+STYLE[p.estilo].toLowerCase()];
  if(p.aromas?.length)facts.push('aromas de '+p.aromas.slice(0,3).join(', '));
  const matches=[];
  if(hit.occasion)matches.push('indicado para '+OCCASION[answers.occasion].toLowerCase());
  if(hit.food&&answers.food!=='nenhuma')matches.push('harmoniza com '+FOOD[answers.food].toLowerCase());
  if(hit.within&&answers.budget!=='qualquer')matches.push('dentro da faixa escolhida');
  return facts.join(', ').replace(/^./,c=>c.toUpperCase())+(matches.length?' · '+matches.join(' · '):'')+'.';
}

export function wineOverview(wine) {
  const short = wine.descricao_curta?.trim();
  const text = [short?.includes('|') ? '' : short, wine.descricao_longa, wine.sabor_resumo, wine.description]
    .find(value => value?.trim())?.trim().replace(/\s+/g, ' ') || '';
  if(text.length <= 220)return text;
  const excerpt = text.slice(0, 219);
  const sentenceEnd = excerpt.lastIndexOf('. ');
  if(sentenceEnd >= 80)return excerpt.slice(0, sentenceEnd + 1);
  const wordEnd = excerpt.lastIndexOf(' ');
  return (wordEnd >= 80 ? excerpt.slice(0, wordEnd) : excerpt) + '…';
}

export function generateWineCopy(p) {
  const type=TYPE[p.tipo_vinho];
  const style=STYLE[p.estilo]?.toLowerCase();
  const body=BODY[p.corpo]?.toLowerCase();
  const aromas=p.aromas?.filter(Boolean)||[];
  const first=[type,style,body&&'de corpo '+body].filter(Boolean).join(' ');
  const grape=p.uvas?.length?'Uvas '+p.uvas.join(', ')+'.':'';
  const nose=aromas.length?'Aromas de '+aromas.join(', ')+'.':'';
  const match=p.ocasioes?.length?'Indicado para '+p.ocasioes.map(value=>OCCASION[value]?.toLowerCase()).filter(Boolean).join(', ')+'.':'';
  const sensory=[body&&'corpo '+body,style&&'estilo '+style].filter(Boolean).join(' e ');
  const mouth=sensory?sensory[0].toUpperCase()+sensory.slice(1)+'.':'';
  const short=[first&&first+'.',aromas.length&&'Aromas de '+aromas.slice(0,2).join(' e ')+'.'].filter(Boolean).join(' ');
  return {descricao_curta:short.length>140?short.slice(0,139).trimEnd()+'…':short,
    descricao_longa:[grape,nose,match].filter(Boolean).join('\n')||mouth,
    sabor_resumo:mouth,
    perfil_cliente:sensory?'Para quem procura '+sensory+'.':''};
}

export function suggestWineFacts(p) {
  const source=(p.description||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
  const suggestions={};
  const body=source.match(/\b(?:corpo|paladar)\s*[:–-]?\s*(leve|medio|encorpado)\b/);
  const style=source.match(/\b(?:vinho|tinto|branco|rose|estilo|tipo)\s*[:–-]?\s*(seco|suave|doce)\b/);
  if(body&&!p.corpo)suggestions.corpo=body[1];
  if(style&&!p.estilo)suggestions.estilo=style[1];
  return suggestions;
}
