
import {GIFT_OCCASION,CARD_STYLE,KIT_CATEGORY,money,safeHtml as h,hasOffensiveText,eligibleStores,totalAvailability} from './catalog-profile.mjs';

const themes={natal:'#7a2937',namorados:'#8e4055',aniversario:'#94662c',agradecimento:'#455e56',corporativo:'#32483d',outra:'#20372d'};
const messageByOccasion={
  natal:'Que o seu Natal seja cheio de bons encontros.',
  namorados:'Que a gente tenha muitos momentos assim para brindar.',
  aniversario:'Feliz aniversário! Que este novo ciclo traga boas surpresas.',
  agradecimento:'Obrigado pela atenção e pelo carinho.',
  corporativo:'Com apreço e agradecimento pela parceria.',
  outra:'Um presente para acompanhar um bom momento.',
};
const STEPS=['Ocasião','Vinho','Acompanhamentos','Acessório ou doce','Embalagem','Cartão','Entrega ou retirada','Resumo'];
const idsOf=s=>[s.wine,...s.sides,s.extra,s.package].filter(Boolean);
const occasionKey={natal:'comemoracao',namorados:'jantar_a_dois',aniversario:'comemoracao',agradecimento:'presente',corporativo:'negocios',outra:'presente'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format();
const asArray=value=>Array.isArray(value)?value:[];
const showDate=value=>String(value||'').split('-').reverse().join('/');

export function giftCardCanvas(card){
  const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=700;
  const ctx=canvas.getContext('2d');
  const paper={classico:'#f7efd9',romantico:'#f7e7ea',corporativo:'#e7eee8'};
  ctx.fillStyle=paper[card.style]||paper.classico;ctx.fillRect(0,0,1100,700);
  const theme=themes[card.occasion]||themes.outra;
  ctx.strokeStyle=theme;ctx.lineWidth=5;ctx.strokeRect(45,45,1010,610);
  ctx.fillStyle=theme;ctx.textAlign='center';
  ctx.font='26px Georgia';ctx.fillText('EMPÓRIO MILÃO PRIME',550,115);
  ctx.font='52px Georgia';ctx.fillText(card.to||'Para você',550,226,880);
  ctx.font='34px Georgia';
  const lines=[];let current='';
  for(const word of (card.message||'').split(/\s+/)){
    const next=[current,word].filter(Boolean).join(' ');
    if(current&&ctx.measureText(next).width>830){lines.push(current);current=word;}
    else current=next;
  }
  if(current)lines.push(current);
  for(const [i,line] of lines.entries())ctx.fillText(line,550,320+i*44,830);
  ctx.font='28px Georgia';ctx.fillText(card.from?'De '+card.from:'',550,600,880);
  return canvas;
}
export function downloadGiftCard(card){
  const a=document.createElement('a');a.download='cartao-emporio-milao.png';a.href=giftCardCanvas(card).toDataURL('image/png');a.click();
}

export async function openGiftExperience(api,existing=null){
  const {client,modal,action,productImage,getData}=api;
  const {dialog,panel}=modal('Monte seu Kit Presente','gift-dialog');
  panel.innerHTML='<p role="status">Consultando os itens e as unidades…</p>';
  let catalog,presets,settings,byId;
  let step=0,filter='',quote=null,loading=false;
  const state={occasion:'',wine:'',sides:[],extra:'',package:'',style:'classico',message:'',from:'',to:'',method:'delivery',address:'',date:'',store_id:'',preset:''};
  const setupCatalog=async()=>{catalog=await getData();byId=new Map(catalog.products.map(p=>[p.id,p]));};
  try{
    const [offers,config]=await Promise.all([
      client.supa.from('gift_kit_presets').select('id,name,product_ids,price').eq('active',true).order('price'),
      client.supa.from('gift_kit_settings').select('deadline_date,deadline_label').maybeSingle(),
      setupCatalog(),
    ]);
    if(offers.error||config.error)throw Error('Não foi possível carregar os kits e os prazos.');
    presets=offers.data||[];settings=config.data;
    if(!dialog.open)return;
    if(existing){
      const stored=existing.quote||existing;
      for(const key of ['occasion','style','message','from','to','method','address','date','store_id','preset']){
        if(stored[key]!=null)state[key]=stored[key];
      }
      loadProductIds(asArray(stored.ids));
      step=1;
    }
    render();
  }catch(error){panel.innerHTML=`<p role="alert">${h(error.message)}</p>`;}
  function loadProductIds(ids){
    const products=ids.map(id=>byId.get(id)).filter(Boolean);
    state.wine=products.find(p=>p.categoria_kit==='vinho')?.id||'';
    state.sides=products.filter(p=>['queijo','petisco'].includes(p.categoria_kit)).map(p=>p.id);
    state.extra=products.find(p=>['acessorio','doce'].includes(p.categoria_kit))?.id||'';
    state.package=products.find(p=>p.categoria_kit==='embalagem')?.id||'';
  }
  function subtotal(){
    const preset=presets.find(p=>p.id===state.preset);
    return preset?Number(preset.price):idsOf(state).reduce((sum,id)=>sum+(byId.get(id)?.price||0),0);
  }
  function choose(value){
    if(step===0)state.occasion=value;
    else{
      const before=JSON.stringify(idsOf(state).sort());
      if(step===1)state.wine=value;
      if(step===2)state.sides=state.sides.includes(value)?state.sides.filter(x=>x!==value):[...state.sides,value].slice(-2);
      if(step===3)state.extra=state.extra===value?'':value;
      if(step===4)state.package=value;
      if(before!==JSON.stringify(idsOf(state).sort()))state.preset='';
      state.store_id='';
    }
    quote=null;render();
  }
  const categoryAtStep={1:['vinho'],2:['queijo','petisco'],3:['acessorio','doce'],4:['embalagem']};
  function candidates(){
    const chosen=idsOf(state);
    const available=catalog.products.filter(p=>p.elegivel_kit&&categoryAtStep[step].includes(p.categoria_kit)&&p.price>0&&totalAvailability(catalog,p.id)>0);
    const max=Number(filter)||Infinity;
    const pair=byId.get(state.wine)?.produto_combina_ids||[];
    return available.filter(p=>{
      if(step===1&&p.price>max)return false;
      const other=chosen.filter(id=>!categoryAtStep[step].includes(byId.get(id)?.categoria_kit));
      return eligibleStores(catalog,[...other,p.id]).length>0;
    }).sort((a,b)=>{
      const weight=p=>step===1?Number(p.ocasioes?.includes(occasionKey[state.occasion])):Number(pair.includes(p.id));
      return weight(b)-weight(a)||a.price-b.price;
    });
  }
  function optionRows(){
    const list=candidates();
    if(!list.length)return '<p class="feature-note">Nenhum produto disponível para esta etapa com o estoque confirmado.</p>';
    const chosen=idsOf(state);
    const pairs=byId.get(state.wine)?.produto_combina_ids||[];
    return list.map(p=>`<button type="button" class="gift-choice" data-gift-product="${h(p.id)}" aria-pressed="${chosen.includes(p.id)}">
      ${productImage(p)}<span><b>${h(p.name)}</b><small>${money(p.price)}${pairs.includes(p.id)?' · Combina':''}${step===1&&p.ocasioes?.includes(occasionKey[state.occasion])?' · Indicado para a ocasião':''}</small></span></button>`).join('');
  }
  function cardPreview(){
    const look=panel.querySelector('.gift-card-preview');
    if(!look)return;
    look.dataset.style=state.style;
    look.innerHTML=`<small>EMPÓRIO MILÃO PRIME</small><strong>${h(state.to||'Para você')}</strong><p>${h(state.message||'Sua mensagem aparece aqui.')}</p><span>${state.from?'De '+h(state.from):''}</span>`;
  }
  function stepContents(){
    if(step===0)return `<div class="feature-options">${Object.entries(GIFT_OCCASION).map(([id,label])=>`<button type="button" class="feature-button" data-gift-product="${id}" aria-pressed="${state.occasion===id}">${label}</button>`).join('')}</div>
      ${presets.length?`<h4>Prontos para presentear</h4><p>O preço fechado vale para a combinação original. Se você trocar um item, o total será recalculado.</p><div class="feature-options">${presets.map(p=>action('data-gift-preset',p.id,p.name+' · '+money(p.price))).join('')}</div>`:''}`;
    if(step<=4)return `${step===1?`<label class="gift-filter">Preço máximo do vinho<select id="giftPriceFilter"><option value="">Todos</option>${[150,400,1000].map(n=>`<option value="${n}" ${filter===String(n)?'selected':''}>Até ${money(n)}</option>`).join('')}</select></label>`:''}
      ${step===2?'<p>Opcional · até dois queijos ou petiscos.</p>':step===3?'<p>Opcional · escolha um acessório ou doce.</p>':''}<div class="gift-options">${optionRows()}</div>`;
    if(step===5)return `<div class="gift-card-fields"><label>Quem envia<input data-gift-field="from" value="${h(state.from)}" maxlength="80"></label><label>Quem recebe<input data-gift-field="to" value="${h(state.to)}" maxlength="80"></label>
      <label>Estilo do cartão<select data-gift-field="style">${Object.entries(CARD_STYLE).map(([id,label])=>`<option value="${id}" ${state.style===id?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>Mensagem do cartão<textarea data-gift-field="message" maxlength="200" rows="4">${h(state.message)}</textarea></label>
      ${action('data-gift-action','suggest','Sugerir mensagem')}<div id="giftSuggestions"></div><div class="gift-card-preview"></div>${action('data-gift-action','download','Baixar prévia do cartão')}</div>`;
    if(step===6){
      const stores=eligibleStores(catalog,idsOf(state));
      return `<label>Como prefere receber?<select data-gift-field="method"><option value="delivery" ${state.method==='delivery'?'selected':''}>Entregar para o presente</option><option value="pickup" ${state.method==='pickup'?'selected':''}>Retirar na loja</option></select></label>
      ${state.method==='pickup'?`<label>Unidade com todos os itens<select data-gift-field="store_id"><option value="">Selecione</option>${stores.map(s=>`<option value="${h(s.id)}" ${state.store_id===s.id?'selected':''}>${h(s.name)}</option>`).join('')}</select></label>`:
      `<label>Endereço de entrega<textarea data-gift-field="address" maxlength="300" rows="3">${h(state.address)}</textarea></label><label>Data desejada<input type="date" data-gift-field="date" min="${today()}" value="${h(state.date)}"></label><p>A loja confirma a data e eventuais taxas pelo WhatsApp.</p>`}`;
    }
    return `<div class="gift-assembly">${idsOf(state).map(id=>productImage(byId.get(id))).join('')}</div><ul>${idsOf(state).map(id=>`<li>${h(byId.get(id)?.name)} · ${money(byId.get(id)?.price)}</li>`).join('')}</ul>
      <p>${state.method==='pickup'?'Retirada em '+h(quote?.store_name||''):h(state.address)+' · '+h(showDate(state.date))}</p><div class="gift-card-preview"></div>`;
  }
  function render(){
    if(!dialog.open)return;
    panel.style.setProperty('--gift-accent',themes[state.occasion]||themes.outra);
    panel.innerHTML=`<div class="feature-progress"><progress value="${step+1}" max="8"></progress><span>${step+1} de 8</span></div>
     ${settings?.deadline_label?`<p class="feature-note">${h(settings.deadline_label)}${settings.deadline_date?' · '+h(showDate(settings.deadline_date)):''}</p>`:''}
     <h3 tabindex="-1">${STEPS[step]}</h3>
     <div class="gift-step">${stepContents()}</div>
     <p class="gift-error" role="alert"></p>
     <div class="gift-total"><div><small>Total ${step<7?'estimado':''}</small><strong>${money(quote?.price||subtotal())}</strong></div><div class="feature-actions">${step?action('data-gift-action','back','Voltar'):''}${action('data-gift-action',step===7?'add':'next',step===7?'Adicionar kit à sacola':'Continuar',true)}</div></div>`;
    cardPreview();
    panel.querySelectorAll('[data-gift-product]').forEach(b=>b.onclick=()=>choose(b.dataset.giftProduct));
    panel.querySelectorAll('[data-gift-preset]').forEach(button=>button.onclick=()=>{
      const p=presets.find(x=>x.id===button.dataset.giftPreset);
      if(!eligibleStores(catalog,p.product_ids).length){showError('Este kit pronto está indisponível. Você pode montar um kit com os itens disponíveis.');return;}
      loadProductIds(p.product_ids);
      state.preset=p.id;
      if(!state.occasion)state.occasion='outra';
      state.store_id='';step=5;render();
    });
    panel.querySelector('#giftPriceFilter')?.addEventListener('change',event=>{filter=event.target.value;render();});
    panel.querySelectorAll('[data-gift-field]').forEach(el=>el.oninput=()=>{
      const field=el.dataset.giftField;
      state[field]=el.value;
      if(field==='method'){state.store_id='';render();}else cardPreview();
    });
    panel.querySelectorAll('[data-gift-action]').forEach(b=>b.onclick=()=>handle(b.dataset.giftAction));
    panel.querySelector('h3').focus({preventScroll:true});
  }
  function showError(message){ const target=panel.querySelector('.gift-error'); if(target)target.textContent=message; }
  async function freshQuote(){
    const request={...state,ids:idsOf(state)};
    const {data,error}=await client.supa.rpc('quote_gift_kit',{p_kit:request});
    if(error)throw Error(error.message);
    return data;
  }
  async function handle(command){
    if(loading)return;
    if(command==='back'){step--;quote=null;render();return;}
    if(command==='download'){
      if(hasOffensiveText([state.message,state.from,state.to].join(' '))){showError('Revise o texto do cartão.');return;}
      downloadGiftCard(state);return;
    }
    if(command==='suggest'){
      const base=messageByOccasion[state.occasion]||messageByOccasion.outra;
      const suggestions=[base,base+' Aproveite o presente!',(state.to?state.to+', ':'')+base+' Com carinho.'];
      const box=panel.querySelector('#giftSuggestions');
      box.innerHTML=suggestions.map((s,i)=>action('data-suggestion',i,s.slice(0,200))).join('');
      box.querySelectorAll('button').forEach(b=>b.onclick=()=>{state.message=suggestions[Number(b.dataset.suggestion)].slice(0,200);panel.querySelector('[data-gift-field="message"]').value=state.message;cardPreview();});
      return;
    }
    if(step===0&&!state.occasion){showError('Escolha uma ocasião.');return;}
    if(step===1&&!state.wine){showError('Escolha o vinho do kit.');return;}
    if(step===4&&!state.package){showError('Escolha uma embalagem.');return;}
    if(step===5&&hasOffensiveText([state.message,state.from,state.to].join(' '))){showError('Revise o texto do cartão.');return;}
    if(step<6){step++;render();return;}
    if(state.method==='pickup'&&!state.store_id){showError('Selecione a unidade para retirada.');return;}
    try{
      loading=true;
      panel.querySelector('.gift-total').setAttribute('aria-busy','true');
      const verified=await freshQuote();
      if(!dialog.open)return;
      if(step===6){quote=verified;step=7;render();return;}
      if(verified.price!==quote?.price||verified.store_id!==quote?.store_id){
        quote=verified;render();showError('O preço ou a unidade mudou. Confira o resumo atualizado.');return;
      }
      client.saveGiftKit({id:existing?.id||crypto.randomUUID(),quote:verified});
      dialog.close();client.openCart();
    } catch(error){
      if(!dialog.open)return;
      if(/esgotou|indispon|unidade tem/i.test(error.message)){
        try{
          await setupCatalog();
          if(catalog&&idsOf(state).length&&!eligibleStores(catalog,idsOf(state)).length){
            const existingIds=idsOf(state);
            const removal=existingIds.find(id=>totalAvailability(catalog,id)===0)||
              existingIds.find(id=>eligibleStores(catalog,existingIds.filter(other=>other!==id)).length);
            const category=byId.get(removal)?.categoria_kit||(removal===state.wine?'vinho':removal===state.package?'embalagem':state.sides.includes(removal)?'queijo':'acessorio');
            if(removal){loadProductIds(existingIds.filter(id=>id!==removal));state.preset='';state.store_id='';step=Number(Object.keys(categoryAtStep).find(key=>categoryAtStep[key].includes(category)))||1;}
            else{step=1;state.store_id='';}
            render();
            showError('O estoque mudou. Escolha um substituto entre os itens disponíveis.');
            return;
          }
        }catch{}
      }
      showError(error.message);
    } finally {
      loading=false;panel.querySelector('.gift-total')?.removeAttribute('aria-busy');
    }
  }
}
