
import {BODY,STYLE,TYPE,INTENSITY,FOOD,OCCASION,KIT_CATEGORY,GIFT_OCCASION,CARD_STYLE,BUDGET,TASTE,PROFILE_FIELDS,SOMMELIER_FOOD,eligibleStores,totalAvailability,recommendWines,wineInBudget,parseWineBudget,wineReason,wineOverview,money,safeHtml as h,hasOffensiveText} from './catalog-profile.mjs';

let client;
let pageDialog;
const labels = {occasion:'Ocasião', food:'Comida', budget:'Orçamento', taste:'Gosto'};
const giftThemes={natal:'#7a2937',namorados:'#8e4055',aniversario:'#94662c',agradecimento:'#455e56',corporativo:'#32483d',outra:'#20372d'};
const gifts={natal:'Que seu Natal seja feliz e cheio de bons momentos.',namorados:'Que a gente celebre muitos momentos assim juntos.',aniversario:'Feliz aniversário! Que seu novo ano traga bons encontros.',agradecimento:'Obrigado pela atenção e pelo carinho.',corporativo:'Com apreço e agradecimento pela parceria.',outra:'Espero que este presente faça parte de um bom momento.'};
const dataColumns='id,name,category,country,price,compare_at_price,promotion_price,promotion_day,description,image_url,image_alt,'+PROFILE_FIELDS;

export function configureFeatures(options) { client=options; }
export async function openGiftKit(existing=null) {
  const {openGiftExperience}=await import('./gift-experience.mjs');
  return openGiftExperience({client,modal,action,productImage,getData},existing);
}

async function getData() {
  const [data,availability]=await Promise.all([
    client.supa.from('products').select(dataColumns).eq('active',true).order('name'),
    client.supa.rpc('catalog_profile_availability'),
  ]);
  if(data.error||availability.error)throw Error('Não foi possível consultar o catálogo e o estoque.');
  return {products:(data.data||[]).map(p=>({...p,price:client.catalogPrice(p)})),...availability.data};
}

function modal(title, panelClass='') {
  if(pageDialog?.open)pageDialog.close();
  const opener=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='emporio-dialog '+panelClass;
  dialog.setAttribute('aria-labelledby','emporioFeatureTitle');
  dialog.innerHTML=`<header class="feature-header"><h2 id="emporioFeatureTitle">${h(title)}</h2><button class="feature-close" type="button" aria-label="Fechar">×</button></header><div class="feature-content"></div>`;
  dialog.querySelector('.feature-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});});
  document.body.append(dialog);
  pageDialog=dialog;
  dialog.showModal();
  return {dialog,panel:dialog.querySelector('.feature-content')};
}

function productImage(p) {
  return p?.image_url?`<img class="feature-product-image" src="${h(p.image_url)}" alt="${h(p.image_alt||p.name)}" loading="lazy">`:'';
}
const action=(attr,value,label,main=false)=>`<button type="button" class="feature-button ${main?'feature-primary':''}" ${attr}="${h(value)}">${h(label)}</button>`;
const addToBag=(dialog,id)=>{client.add(id);dialog.close();client.openCart();};

const QUESTIONS=[
  ['occasion','Qual é a ocasião?',Object.entries(OCCASION).filter(([id])=>id!=='dia_a_dia')],
  ['food','O que vai à mesa?',Object.entries(SOMMELIER_FOOD).map(([id,v])=>[id,v.label])],
  ['budget','Quanto você quer gastar por garrafa?',Object.entries(BUDGET).map(([id,v])=>[id,v.label])],
  ['taste','Que tipo de vinho você prefere?',Object.entries(TASTE)],
];
const answerLabel=(key,value)=>QUESTIONS.find(q=>q[0]===key)?.[2].find(x=>x[0]===value)?.[1]||value;
const budgetLabel=answers=>answers.budget==='personalizado'?'Até '+money(answers.budgetMax):answerLabel('budget',answers.budget);
const whatsapp=(answers,question='')=>client.waLink('Olá! Usei o Sommelier. '+Object.keys(labels).filter(key=>answers[key]).map(key=>labels[key]+' '+(key==='budget'?budgetLabel(answers):answerLabel(key,answers[key]))).join(', ')+'. '+(question||'Pode me ajudar?'));
function analyticsAnswers(answers){
  const {occasion,taste,budget,budgetMax,food}=answers;
  const bracket=Object.entries(BUDGET).find(([,range])=>budgetMax<=range.max)?.[0];
  return {occasion,taste,budget:budget==='personalizado'?bracket:budget,food:SOMMELIER_FOOD[food].group};
}

export function openSommelier() {
  const {dialog,panel}=modal('Sommelier do Empório');
  let step=0,turn=0,answers={},results=[],sessionId=null,log=null;
  function renderQuestion() {
    const [key,title,options]=QUESTIONS[step];
    panel.innerHTML=`<div class="feature-progress"><progress value="${step+1}" max="4"></progress><span>${step+1} de 4</span></div>
      <h3 tabindex="-1">${h(title)}</h3><div class="feature-options">${options.map(([id,label])=>action('data-answer',id,label)).join('')}</div>
      ${key==='budget'?'<form class="feature-question"><label>Ou informe seu valor máximo (R$)<input name="maxPrice" inputmode="decimal" placeholder="Ex.: 180,00" maxlength="15" required></label><button class="feature-button" type="submit">Usar este valor</button><p role="status" class="feature-answer"></p></form>':''}
      ${step?action('data-sommelier','back','Voltar'):''}`;
    panel.querySelector('h3').focus();
    function advance(){
      step++;
      if(step<QUESTIONS.length)renderQuestion();else showResults();
    }
    panel.querySelectorAll('[data-answer]').forEach(btn=>btn.onclick=()=>{
      answers[key]=btn.dataset.answer;
      if(key==='budget')delete answers.budgetMax;
      advance();
    });
    panel.querySelector('form')?.addEventListener('submit',event=>{
      event.preventDefault();
      const amount=parseWineBudget(event.currentTarget.elements.maxPrice.value);
      if(amount===null){panel.querySelector('.feature-answer').textContent='Informe um valor em reais, como 180,00.';return;}
      answers.budget='personalizado';
      answers.budgetMax=amount;
      advance();
    });
    panel.querySelector('[data-sommelier="back"]')?.addEventListener('click',()=>{step--;renderQuestion();});
  }
  async function showResults(){
    const request=++turn;
    panel.innerHTML='<p role="status">Consultando as fichas e o estoque das unidades…</p>';
    try {
      const data=await getData();
      if(!dialog.open||request!==turn)return;
      const selection=recommendWines(data.products,data,answers);
      results=selection.results;
      sessionId=crypto.randomUUID();
      const recommended=results.map(({product})=>product.id);
      const loggedAnswers=analyticsAnswers(answers);
      log=recommended.length ? client.supa.rpc('record_sommelier_session',{p_id:sessionId,p_answers:loggedAnswers,p_recommended:recommended}).then(()=>{},()=>{}) : Promise.resolve();
      const mainWine=results[0]?.product;
      const companion=mainWine?.produto_combina_ids?.map(id=>data.products.find(p=>p.id===id)).find(p=>p&&/queijo|carne/i.test(p.category+' '+p.name)&&totalAvailability(data,p.id)>0&&wineInBudget(mainWine.price+p.price,answers));
      panel.innerHTML=`<h3 tabindex="-1">Nossa seleção para você</h3>
       <p>${h(answerLabel('food',answers.food))} · ${h(budgetLabel(answers))}</p>
       ${results.length?'<div class="feature-wines">'+results.map(({product,availability,...hit},index)=>`<article class="feature-wine-card">${productImage(product)}<small>${['Indicação da casa','Outra opção','Seleção especial'][index]}</small><h4>${h(product.name)}</h4>
         <p>${h([product.country,product.regiao_vinho].filter(Boolean).join(' · '))}</p>
         <b>${money(product.price)}</b> ${availability<=3?'<span class="feature-note">Últimas unidades</span>':''}
         ${wineOverview(product)?`<p>${h(wineOverview(product))}</p>`:''}
         ${product.madeira?`<p><strong>Tempo em madeira</strong> · ${h(product.madeira)}</p>`:product.amadurecimento?`<p><strong>Amadurecimento</strong> · ${h(product.amadurecimento)}</p>`:''}
         <p><strong>Por que indicamos</strong> · ${h(wineReason({product,...hit},answers))}</p>
         <div class="feature-actions">${action('data-chosen',product.id,'Adicionar à sacola',true)}${action('data-wine',product.id,'Ver detalhes')}${client.favoriteButton(product)}</div></article>`).join('')+'</div>':'<p>Nenhum vinho com estoque confirmado combina com a seleção dentro do orçamento informado. Você pode ajustar suas escolhas ou falar com a equipe.</p>'}
       ${companion?`<aside class="feature-companion"><b>Quer completar?</b> <span>${h(companion.name)} · ${money(companion.price)}</span> ${action('data-companion',companion.id,'Adicionar à sacola')}</aside>`:''}
       ${results.length?`<form class="feature-question"><label>Uma dúvida sobre a ficha<select name="wine">${results.map(({product})=>`<option value="${h(product.id)}">${h(product.name)}</option>`).join('')}</select></label>
       <label>Pergunta<input name="question" maxlength="150" required placeholder="Ex.: esse vinho é seco?"></label><button class="feature-button" type="submit">Consultar ficha</button><p role="status" class="feature-answer"></p></form>`:''}
       <div class="feature-actions">${action('data-sommelier','restart','Refazer')}<a class="feature-button" target="_blank" rel="noopener" href="${h(whatsapp(answers))}">Falar com um especialista no WhatsApp</a></div>`;
      panel.querySelector('h3').focus();
      panel.querySelectorAll('[data-chosen]').forEach(btn=>btn.onclick=async()=>{
        const id=btn.dataset.chosen;
        const [{data:fresh,error},current]=await Promise.all([client.supa.rpc('catalog_profile_availability'),loadWine(id)]);
        if(!dialog.open)return;
        if(error||totalAvailability(fresh||{},id)<1){client.toast('Estoque indisponível. Estamos atualizando as opções.');return showResults();}
        const quoted=results.find(({product})=>product.id===id)?.product.price;
        if(!current||client.catalogPrice(current)!==quoted){client.toast('O catálogo mudou. Estamos atualizando preços e opções.');return showResults();}
        void log.then(()=>client.supa.rpc('record_sommelier_session',{p_id:sessionId,p_answers:loggedAnswers,p_recommended:recommended,p_selected:id}));
        addToBag(dialog,id);
      });
      panel.querySelectorAll('[data-wine]').forEach(btn=>btn.onclick=()=>openWineDetails(btn.dataset.wine,showResults));
      panel.querySelector('[data-companion]')?.addEventListener('click',async()=>{
        const {data:fresh,error}=await client.supa.rpc('catalog_profile_availability');
        if(!dialog.open)return;
        if(error||totalAvailability(fresh||{},companion.id)<1){client.toast('O acompanhamento ficou indisponível.');return showResults();}
        addToBag(dialog,companion.id);
      });
      panel.querySelector('.feature-question')?.addEventListener('submit',event=>{
        event.preventDefault();
        const fields=new FormData(event.currentTarget),question=String(fields.get('question'));
        const p=results.find(({product})=>product.id===fields.get('wine')).product;
        const answer=answerQuestion(p,question);
        const target=panel.querySelector('.feature-answer');
        target.textContent=answer||'Vou confirmar com nossa equipe. ';
        if(!answer){const a=document.createElement('a');a.href=whatsapp(answers,question);a.target='_blank';a.rel='noopener';a.textContent='Consultar pelo WhatsApp';target.append(a);}
      });
      panel.querySelector('[data-sommelier="restart"]').onclick=()=>{answers={};step=0;renderQuestion();};
    } catch(error) {
      if(!dialog.open)return;
      panel.innerHTML=`<p role="alert">${h(error.message)}</p>${action('data-sommelier','retry','Tentar novamente')}`;
      panel.querySelector('button').onclick=showResults;
    }
  }
  renderQuestion();
}

function answerQuestion(product,text) {
  const q=text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(/madeira|barrica|carvalho/.test(q))return product.madeira||'';
  if(/amadurec|envelhec/.test(q))return product.amadurecimento||product.madeira||'';
  if(/seco|suave|doc|adoci|estilo/.test(q)&&product.estilo)return 'O estilo cadastrado é '+STYLE[product.estilo].toLowerCase()+'.';
  if(/leve|corpo|encorpad/.test(q)&&product.corpo)return 'O vinho tem corpo '+BODY[product.corpo].toLowerCase()+'.';
  if(/tanino/.test(q)&&product.taninos)return 'Taninos de intensidade '+INTENSITY[product.taninos].toLowerCase()+'.';
  if(/acid/.test(q)&&product.acidez)return 'Acidez '+INTENSITY[product.acidez].toLowerCase()+'.';
  if(/aroma|cheiro/.test(q)&&product.aromas?.length)return 'Aromas cadastrados de '+product.aromas.join(', ')+'.';
  if(/carne|queijo|peixe|massa|harmon/.test(q)&&product.harmoniza_com?.length)return 'A ficha indica harmonização com '+product.harmoniza_com.map(id=>FOOD[id].toLowerCase()).join(', ')+'.';
  if(/alcool|teor/.test(q)&&product.teor_alcoolico!=null)return 'Teor alcoólico de '+product.teor_alcoolico+'%.';
  return '';
}

const detailPair=(label,value)=>value?`<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`:'';
const detailMeter=(label,value,level)=>value&&level?`<div class="profile-meter"><span>${h(label)} · ${h(value)}</span><meter aria-label="${h(label)}" min="0" max="5" value="${level}" aria-valuetext="${h(value)}">${level} de 5</meter></div>`:'';
const listLabels=(list,lookup)=>(list||[]).map(key=>lookup[key]).filter(Boolean).join(', ');
async function loadWine(id){
  const result=await client.supa.from('products').select(dataColumns).eq('active',true).eq('id',id).maybeSingle();
  return result.error?null:result.data;
}
export async function openWineDetails(id, fromSommelier=false) {
  if(fromSommelier&&pageDialog?.open){await showNestedDetails(id);return;}
  const {dialog,panel}=modal('Ficha do produto');
  panel.textContent='Carregando ficha…';
  const p=await loadWine(id);
  if(!dialog.open)return;
  if(!p){panel.textContent='Produto indisponível no catálogo.';return;}
  dialog.querySelector('h2').textContent=p.name;
  renderDetails(panel,p);
  panel.querySelector('[data-detail-add]').onclick=()=>addToBag(dialog,p.id);
}
async function showNestedDetails(id){
  const opener=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='emporio-dialog emporio-detail';
  dialog.setAttribute('aria-labelledby','emporioNestedTitle');
  dialog.innerHTML='<header class="feature-header"><h2 id="emporioNestedTitle">Ficha do vinho</h2><button type="button" class="feature-close" aria-label="Voltar à seleção">×</button></header><div class="feature-content">Carregando ficha…</div>';
  document.body.append(dialog);
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();});
  dialog.showModal();
  const p=await loadWine(id);
  if(!dialog.open)return;
  const panel=dialog.querySelector('.feature-content');
  if(!p){panel.textContent='Produto indisponível no catálogo.';return;}
  dialog.querySelector('h2').textContent=p.name;
  renderDetails(panel,p);
  panel.querySelector('[data-detail-add]').remove();
}
function renderDetails(panel,p){
  const stages={leve:1,medio:3,encorpado:5,baixa:1,media:3,alta:5,seco:1,suave:3,doce:5};
  const attributes=[detailPair('Tipo',TYPE[p.tipo_vinho]),detailPair('Uvas',p.uvas?.join(', ')),detailPair('Origem',[p.country,p.regiao_vinho].filter(Boolean).join(' · ')),detailPair('Safra',p.safra),detailPair('Produtor',p.produtor),detailPair('Teor alcoólico',p.teor_alcoolico!=null?p.teor_alcoolico+'%':''),detailPair('Temperatura de serviço',p.temperatura_servico),detailPair('Tempo em madeira',p.madeira),detailPair('Amadurecimento',p.amadurecimento),detailPair('Guarda',p.potencial_guarda),detailPair('Ideal para',listLabels(p.ocasioes,OCCASION)),detailPair('Harmonização',listLabels(p.harmoniza_com,FOOD))].join('');
  const meters=detailMeter('Corpo',BODY[p.corpo],stages[p.corpo])+detailMeter('Acidez',INTENSITY[p.acidez],stages[p.acidez])+detailMeter('Taninos',INTENSITY[p.taninos],stages[p.taninos])+detailMeter('Doçura',STYLE[p.estilo],stages[p.estilo]);
  panel.innerHTML=`<div class="feature-detail-grid"><div>${productImage(p)}</div><div><p>${h((p.descricao_longa&&(p.descricao_curta===p.description||p.descricao_curta===p.descricao_longa))?'':p.descricao_curta||(!p.descricao_longa?p.description:''))}</p><p><strong>${money(client.catalogPrice(p))}</strong></p><div class="feature-actions">${action('data-detail-add',p.id,'Adicionar à sacola',true)}${client.favoriteButton(p)}</div>${meters}</div></div>
    ${attributes?`<dl class="feature-facts">${attributes}</dl>`:''}${p.aromas?.length?`<h3>Aromas</h3><p class="feature-chips">${p.aromas.map(a=>`<span>${h(a)}</span>`).join('')}</p>`:''}
    ${p.descricao_longa?`<h3>Sobre o produto</h3><p class="feature-long-copy">${h(p.descricao_longa)}</p>`:''}${p.sabor_resumo&&!p.descricao_longa?.includes(p.sabor_resumo)?`<p>${h(p.sabor_resumo)}</p>`:''}`;
}
