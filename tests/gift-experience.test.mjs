import test from 'node:test';
import assert from 'node:assert/strict';
import {canCompleteGift,giftProducts,openGiftExperience} from '../src/js/gift-experience.mjs';

const wine={id:'tinto',categoria_kit:'vinho',elegivel_kit:true,price:100,tipo_vinho:'tinto',name:'Tinto'};
const box={id:'caixa',categoria_kit:'embalagem',elegivel_kit:true,price:10,name:'Caixa'};
const stores=[{id:'sul'},{id:'norte'}];
const catalog={products:[wine,box],stores,stock:{tinto:{sul:3},caixa:{sul:1}}};

test('exige embalagem na mesma unidade e ignora vinho sem tipo no cadastro',()=>{
 const invalid={...wine,id:'sem-tipo',tipo_vinho:null};
 const split={...catalog,products:[wine,box,invalid],stock:{tinto:{sul:1},caixa:{norte:2},'sem-tipo':{sul:1}}};
 assert.deepEqual(giftProducts(split,'vinho'),[wine]);
 assert.equal(canCompleteGift(split,[wine.id],giftProducts(split,'embalagem')),false);
 assert.equal(canCompleteGift(catalog,[wine.id],giftProducts(catalog,'embalagem')),true);
});

test('reabre um kit da sacola com a lista de vinhos já inicializada',async()=>{
 const panel={
  style:{setProperty(){}},
  querySelector(selector){return selector==='h3'?{focus(){}}:null;},
  querySelectorAll(){return [];},
 };
 const client={supa:{from(){return {select(){return this;},eq(){return this;},
  order(){return {data:[]};},maybeSingle(){return {data:null};}};}}};
 await openGiftExperience({
  client,modal:()=>({dialog:{open:true},panel}),getData:async()=>catalog,
  action:()=>'',productImage:()=>'',
 },{quote:{ids:[wine.id,box.id],occasion:'natal'}});
 assert.match(panel.innerHTML,/<progress value="2"/);
 assert.match(panel.innerHTML,/data-gift-product="tinto" aria-pressed="true"/);
});
