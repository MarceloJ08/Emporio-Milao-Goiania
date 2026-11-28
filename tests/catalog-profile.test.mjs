import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendWines,wineReason,wineOverview,eligibleStores,generateWineCopy,suggestWineFacts,hasOffensiveText} from '../src/js/catalog-profile.mjs';

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

test('amplia o orçamento em até 20% e não usa ramo sem estoque',()=>{
 const picks=[{...red,price:151},{...white,price:180},{...sparkling,price:180.01}];
 const results=recommendWines(picks,catalog,{budget:'ate150',occasion:'churrasco',food:'carne',taste:'encorpado'});
 assert.equal(results.relaxed,true);
 assert.deepEqual(results.results.map(hit=>hit.product.id),['red','white']);
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
 assert.doesNotMatch(wineReason(results[1],answers),/harmoniza com carne/);
});
