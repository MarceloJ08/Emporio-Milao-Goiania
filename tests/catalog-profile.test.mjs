import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendWines,wineReason,wineOverview,parseWineBudget,eligibleStores,generateWineCopy,suggestWineFacts,hasOffensiveText} from '../src/js/catalog-profile.mjs';

const stores=[{id:'ns',name:'Nova Suíça'},{id:'ag',name:'Alto da Glória'}];
const red={id:'red',name:'Tinto de teste',tipo_vinho:'tinto',corpo:'encorpado',estilo:'seco',aromas:['ameixa'],ocasioes:['churrasco'],harmoniza_com:['carne'],price:129};
const white={id:'white',name:'Branco de teste',tipo_vinho:'branco',corpo:'leve',estilo:'seco',aromas:['cítrico'],ocasioes:['jantar_a_dois'],harmoniza_com:['peixe'],price:90};
const sparkling={id:'sparkling',name:'Espumante de teste',tipo_vinho:'espumante',corpo:'medio',estilo:'espumante',aromas:['maçã'],ocasioes:['comemoracao'],harmoniza_com:['queijo'],price:250};
const stock={red:{ns:4},white:{ag:2},sparkling:{ns:3}};
const products=[red,white,sparkling,{...red,id:'out',price:50},{...red,id:'incomplete',corpo:null,price:40}];
const catalog={stores,stock:{...stock,incomplete:{ns:4}}};

test('recomenda por perfil, exclui estoque zerado e não usa fichas incompletas',()=>{
 for(const [answers,id] of [
  [{occasion:'churrasco',food:'carne',budget:'ate150',taste:'encorpado'},'red'],
  [{occasion:'jantar_a_dois',food:'peixe',budget:'ate150',taste:'leve'},'white'],
  [{occasion:'comemoracao',food:'queijo',budget:'150a400',taste:'surpresa'},'sparkling'],
 ]){
  const {results}=recommendWines(products,catalog,answers);
  assert.equal(results[0].product.id,id);
  assert.ok(results.every(({product})=>!['out','incomplete'].includes(product.id)));
  assert.ok(wineReason(results[0],answers).includes('aromas de '+results[0].product.aromas[0]));
 }
 assert.deepEqual(recommendWines(products,{stores,stock:{}},{budget:'qualquer'}).results,[]);
});

test('respeita faixa e teto exato, inclusive diferença de um centavo',()=>{
 const picks=[{...red,price:150.01},white,sparkling];
 const answers={budget:'ate150',occasion:'churrasco',food:'carne',taste:'encorpado'};
 assert.deepEqual(recommendWines(picks,catalog,answers).results,[]);
 assert.deepEqual(recommendWines(picks,catalog,{...answers,budget:'personalizado',budgetMax:150}).results,[]);
 assert.deepEqual(recommendWines(picks,catalog,{...answers,budget:'personalizado',budgetMax:150.01}).results.map(hit=>hit.product.id),['red']);
 assert.deepEqual(recommendWines([red,sparkling],catalog,{...answers,budget:'150a400',food:'nenhuma',taste:'surpresa'}).results.map(hit=>hit.product.id),['sparkling']);
 assert.equal(parseWineBudget('180,50'),180.5);
 assert.equal(parseWineBudget('1.200,50'),1200.5);
 assert.equal(parseWineBudget('180.50'),180.5);
 assert.equal(parseWineBudget('0'),null);
 assert.equal(parseWineBudget('1e3'),null);
 assert.deepEqual(eligibleStores(catalog,['red','sparkling']),[stores[0]]);
 assert.deepEqual(eligibleStores(catalog,['red','white']),[]);
});

test('texto usa os campos preenchidos e a prévia recusa termos bloqueados',()=>{
 const description=generateWineCopy({...red,uvas:['Malbec']});
 assert.ok(description.descricao_curta.length<=140);
 assert.match(description.descricao_longa,/Malbec/);
 assert.doesNotMatch(description.descricao_longa,/2019|medalha|\d{2} °C/);
 assert.deepEqual(suggestWineFacts({description:'Vinho seco e corpo leve.'}),{corpo:'leve',estilo:'seco'});
 assert.deepEqual(suggestWineFacts({description:'Toque leve de baunilha.'}),{});
 assert.equal(hasOffensiveText('Pô, que presente!'),false);
 assert.equal(hasOffensiveText('que porra'),true);
});

test('mostra o texto cadastrado de cada rótulo e mantém a harmonização ligada à escolha',()=>{
 const tinto={...red,descricao_curta:'Frutado com notas de ameixa e final macio.'};
 const branco={...white,descricao_curta:'Mendoza | Chardonnay',descricao_longa:'Branco fresco com notas cítricas.'};
 assert.equal(wineOverview(tinto),'Frutado com notas de ameixa e final macio.');
 assert.equal(wineOverview(branco),'Branco fresco com notas cítricas.');
 assert.equal(wineOverview(red),'');
 const answers={occasion:'churrasco',food:'carne',budget:'ate150',taste:'encorpado'};
 const {results}=recommendWines([tinto,branco],catalog,answers);
 assert.match(wineReason(results[0],answers),/harmoniza com carne/);
 assert.deepEqual(results.map(hit=>hit.product.id),['red']);
});

test('distingue molhos e só usa regras gerais com dados da ficha',()=>{
 const tomatoWine={...red,acidez:'alta',harmoniza_com:['massa']};
 const creamWine={...white,acidez:'media',harmoniza_com:['massa']};
 const choices=[tomatoWine,creamWine];
 const answers={occasion:'jantar_a_dois',budget:'ate150',taste:'surpresa'};
 const tomato=recommendWines(choices,catalog,{...answers,food:'massa_tomate'}).results;
 const creamy=recommendWines(choices,catalog,{...answers,food:'massa_cremosa'}).results;
 assert.deepEqual(tomato.map(hit=>hit.product.id),['red']);
 assert.deepEqual(creamy.map(hit=>hit.product.id),['white']);
 assert.match(wineReason(tomato[0],{...answers,food:'massa_tomate'}),/acidez alta.*molho de tomate/);
 assert.deepEqual(recommendWines([{...tomatoWine,acidez:null}],catalog,{...answers,food:'massa_tomate'}).results,[]);
 assert.deepEqual(recommendWines(choices,catalog,{...answers,food:'massa_tomate',taste:'leve'}).results,[]);
 assert.deepEqual(recommendWines([{...red,harmoniza_com:['peixe'],taninos:'alta'}],catalog,{...answers,food:'peixe'}).results,[]);
});
