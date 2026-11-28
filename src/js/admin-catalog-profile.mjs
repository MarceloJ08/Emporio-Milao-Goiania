
import {BODY,STYLE,TYPE,INTENSITY,FOOD,OCCASION,KIT_CATEGORY,GIFT_OCCASION,BUDGET,safeHtml as h,money,profileComplete,generateWineCopy,suggestWineFacts} from './catalog-profile.mjs';

const selects={tipo_vinho:['Tipo',TYPE],corpo:['Corpo',BODY],estilo:['Estilo',STYLE],acidez:['Acidez',INTENSITY],taninos:['Taninos',INTENSITY],categoria_kit:['Categoria do kit',KIT_CATEGORY]};
const texts={regiao_vinho:'Região',produtor:'Produtor',safra:'Safra',teor_alcoolico:'Teor alcoólico (%)',temperatura_servico:'Temperatura de serviço',potencial_guarda:'Potencial de guarda',destaque_motivo:'Motivo de destaque',sabor_resumo:'Sensação na boca',perfil_cliente:'Quem costuma gostar',descricao_curta:'Descrição curta'};
const listInputs={uvas:'Uvas',aromas:'Aromas'};
const chips={harmoniza_com:['Harmoniza com',FOOD],ocasioes:['Ideal para',OCCASION]};
const parseList=value=>[...new Set(value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean))].slice(0,16);
const pickOptions=(dictionary)=>Object.entries(dictionary).map(([k,v])=>`<option value="${h(k)}">${h(v)}</option>`).join('');
const wineKeys=['tipo_vinho','corpo','estilo','acidez','taninos','uvas','regiao_vinho','safra','produtor','teor_alcoolico','aromas','sabor_resumo','temperatura_servico','potencial_guarda','perfil_cliente','descricao_curta','descricao_longa','descricao_revisada'];
const isWine=p=>p.tipo_vinho||/vinho|espumante|champagne/.test((p.category||'').toLowerCase());

export function mountCatalogAdmin({supa,productRows,orders,areas,content,toast,refresh,stores}){
  const productForm=content.querySelector('#productForm');
  const fields=document.createElement('details');
  fields.className='profile-editor';
  fields.innerHTML=`<summary>Ficha, harmonização e Kit Presente</summary><p>Preencha a ficha para o vinho aparecer no Sommelier quando houver estoque.</p>
    <div class="admin-form-grid">${Object.entries(selects).map(([key,[label,values]])=>`<label>${label}<select data-profile="${key}"><option value="">Selecione</option>${pickOptions(values)}</select></label>`).join('')}
    ${Object.entries(texts).map(([key,label])=>`<label>${label}<input data-profile="${key}" ${key==='safra'?'type="number" min="1800" max="2100"':key==='teor_alcoolico'?'type="number" min="0" max="99.9" step=".1"':'maxlength="'+(key==='descricao_curta'?140:key==='destaque_motivo'?180:220)+'"'}></label>`).join('')}
    ${Object.entries(listInputs).map(([key,label])=>`<label>${label}<input data-profile="${key}" maxlength="250" placeholder="Separe por vírgulas"></label>`).join('')}</div>
    <div class="profile-chip-groups">${Object.entries(chips).map(([name,[label,dict]])=>`<fieldset><legend>${label}</legend><div class="feature-chips">${Object.entries(dict).map(([key,text])=>`<label><input type="checkbox" data-profile-chip="${name}" value="${key}"><span>${text}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
    <label>Buscar produtos que combinam<input type="search" data-profile-pair-search></label><label>Produtos que combinam<select multiple size="5" data-profile-pairs></select></label>
    <label>Descrição longa<textarea data-profile="descricao_longa" rows="4" maxlength="1600"></textarea></label>
    <div class="profile-flags"><label><input type="checkbox" data-profile="descricao_revisada"> Descrição revisada</label><label><input type="checkbox" data-profile="elegivel_kit"> Elegível para kit</label></div>
    <button type="button" class="admin-secondary" data-profile-generate>Gerar descrição</button> <button type="button" class="admin-secondary" data-profile-suggest>Sugerir a partir da descrição existente</button>`;
  productForm.insertBefore(fields,productForm.querySelector('.admin-actions'));
  const input=key=>fields.querySelector('[data-profile="'+key+'"]');
  const pairPicker=fields.querySelector('[data-profile-pairs]');
  const pairSearch=fields.querySelector('[data-profile-pair-search]');
  let paired=new Set();
  let currentId='';
  function renderPairs(){
    const term=pairSearch.value.toLocaleLowerCase('pt-BR').trim();
    const options=productRows.filter(p=>p.id!==currentId&&p.active&&(paired.has(p.id)||p.name.toLocaleLowerCase('pt-BR').includes(term)));
    pairPicker.replaceChildren(...options.map(p=>new Option(p.name,p.id,false,paired.has(p.id))));
  }
  pairSearch.oninput=renderPairs;
  pairPicker.onchange=()=>{
    const visible=new Set([...pairPicker.options].map(o=>o.value));
    paired=new Set([...paired].filter(id=>!visible.has(id)).concat([...pairPicker.selectedOptions].map(o=>o.value)));
  };
  function read(){
    const result={};
    for(const el of fields.querySelectorAll('[data-profile]')){
      const name=el.dataset.profile;
      result[name]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):
        name in listInputs?parseList(el.value):el.value.trim()||null;
    }
    for(const name of Object.keys(chips))result[name]=[...fields.querySelectorAll('[data-profile-chip="'+name+'"]:checked')].map(el=>el.value);
    result.produto_combina_ids=[...paired].slice(0,20);
    if(!result.tipo_vinho)for(const key of wineKeys){
      result[key]=key in listInputs?[]:key==='descricao_revisada'?false:null;
    }
    if(result.tipo_vinho!=='tinto')result.taninos=null;
    if(!result.categoria_kit)result.elegivel_kit=false;
    return result;
  }
  function fill(p){
    currentId=p.id||'';
    for(const el of fields.querySelectorAll('[data-profile]')){
      const value=p[el.dataset.profile];
      if(el.type==='checkbox')el.checked=Boolean(value);
      else el.value=Array.isArray(value)?value.join(', '):value??'';
    }
    for(const check of fields.querySelectorAll('[data-profile-chip]'))check.checked=(p[check.dataset.profileChip]||[]).includes(check.value);
    paired=new Set(p.produto_combina_ids||[]);
    pairSearch.value='';renderPairs();
    input('taninos').disabled=input('tipo_vinho').value!=='tinto';
  }
  input('tipo_vinho').onchange=()=>{input('taninos').disabled=input('tipo_vinho').value!=='tinto';};
  fields.addEventListener('input',event=>{
    if(event.target.dataset.profile!=='descricao_revisada')input('descricao_revisada').checked=false;
  });
  fields.querySelector('[data-profile-generate]').onclick=()=>{
    const p=read();
    if(!p.tipo_vinho||!p.uvas.length||!p.corpo||!p.estilo||!p.aromas.length||!p.ocasioes.length){
      toast('Preencha tipo, uvas, corpo, estilo, aromas e ocasiões.');return;
    }
    for(const [key,value] of Object.entries(generateWineCopy(p)))input(key).value=value;
    input('descricao_revisada').checked=false;
    toast('Descrição pronta para revisão.');
  };
  fields.querySelector('[data-profile-suggest]').onclick=()=>{
    const p={...read(),description:productForm.querySelector('#pDescription').value};
    const suggestion=suggestWineFacts(p);
    for(const [key,value] of Object.entries(suggestion))input(key).value=value;
    if(Object.keys(suggestion).length)input('descricao_revisada').checked=false;
    toast(Object.keys(suggestion).length?'Sugestões preenchidas para revisão.':'A descrição atual não declara corpo ou estilo com clareza.');
  };
  renderProfiles();
  void renderAnalytics();
  void renderGifts();
  return {read,fill};

  function renderProfiles(){
    const wines=productRows.filter(isWine);
    const progress=p=>[p.tipo_vinho,p.corpo,p.estilo,p.harmoniza_com?.length,p.ocasioes?.length,p.aromas?.length,p.descricao_curta,p.descricao_longa].filter(Boolean).length;
    const area=areas.profiles;
    area.innerHTML=`<section class="admin-section"><h2>Produtos sem perfil e fichas incompletas</h2><p>${wines.filter(p=>p.active&&!profileComplete(p)).length} vinhos publicados estão fora do Sommelier por ficha incompleta.</p>
     <label>Filtrar <select id="profileScope"><option value="incomplete">Fichas incompletas</option><option value="missing">Produtos sem perfil</option><option value="review">A revisar</option><option value="all">Todos os vinhos</option></select></label>
     <label>Buscar vinho <input id="profileSearch" type="search"></label><div class="feature-actions"><button type="button" class="admin-secondary" id="profileBatch">Gerar descrições dos selecionados</button><button type="button" class="admin-secondary" id="profileSuggestBatch">Sugerir perfis dos selecionados</button></div>
     <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Selecionar</th><th>Vinho</th><th>Ficha</th><th>Revisão</th><th>Ações</th></tr></thead><tbody></tbody></table></div></section>`;
    const selected=new Set();
    const scope=area.querySelector('#profileScope'),search=area.querySelector('#profileSearch');
    function rows(){
      const q=search.value.trim().toLocaleLowerCase('pt-BR');
      const listing=wines.filter(p=>(!q||p.name.toLocaleLowerCase('pt-BR').includes(q))&&
        (scope.value==='all'||scope.value==='incomplete'&&progress(p)<8||scope.value==='missing'&&(!p.corpo||!p.estilo||!p.harmoniza_com?.length)||scope.value==='review'&&!p.descricao_revisada));
      area.querySelector('tbody').innerHTML=listing.map(p=>`<tr><td><input type="checkbox" aria-label="Selecionar ${h(p.name)}" data-batch-wine="${h(p.id)}" ${selected.has(p.id)?'checked':''}></td><td>${h(p.name)}</td><td>${Math.round(progress(p)/8*100)}%</td><td>${p.descricao_revisada?'Revisada':'A revisar'}</td><td><button type="button" class="admin-secondary" data-ficha-edit="${h(p.id)}">Editar ficha</button></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma ficha encontrada.</td></tr>';
      area.querySelectorAll('[data-batch-wine]').forEach(el=>el.onchange=()=>el.checked?selected.add(el.dataset.batchWine):selected.delete(el.dataset.batchWine));
      area.querySelectorAll('[data-ficha-edit]').forEach(el=>el.onclick=()=>{
        content.querySelector('[data-open-admin-area="products"]').click();
        [...areas.products.querySelectorAll('[data-edit]')].find(b=>b.dataset.edit===el.dataset.fichaEdit)?.click();
        fields.open=true;fields.scrollIntoView({block:'center'});
      });
    }
    scope.onchange=rows;search.oninput=rows;rows();
    const runBatch=async(event,mode)=>{
      const batch=wines.filter(p=>selected.has(p.id));
      if(!batch.length){toast('Selecione pelo menos uma ficha.');return;}
      const button=event.currentTarget;
      button.disabled=true;
      let saved=0,failed=0;
      try{
        for(const p of batch){
          const generated=mode==='suggest'?suggestWineFacts(p):
            p.tipo_vinho&&p.uvas?.length&&p.corpo&&p.estilo&&p.aromas?.length&&p.ocasioes?.length?generateWineCopy(p):{};
          if(!Object.keys(generated).length)continue;
          const {error}=await supa.from('products').update({...generated,descricao_revisada:false,updated_at:new Date().toISOString()}).eq('id',p.id);
          if(error)failed++;else saved++;
        }
        toast(saved+' ficha(s) salvas para revisão.'+(failed?' '+failed+' falha(s).':''));
        if(saved)await refresh();
      } finally {button.disabled=false;}
    };
    area.querySelector('#profileBatch').onclick=e=>runBatch(e,'generate');
    area.querySelector('#profileSuggestBatch').onclick=e=>runBatch(e,'suggest');
  }

  async function renderAnalytics(){
    const area=areas.sommelier;
    area.innerHTML='<section class="admin-section"><h2>Preferências do Sommelier</h2><p role="status">Carregando sessões…</p></section>';
    const {data,error}=await supa.from('sommelier_sessoes').select('ocasiao,faixa,recomendados,escolhido').order('created_at',{ascending:false}).limit(1000);
    if(!area.isConnected)return;
    if(error){area.querySelector('p').textContent='Não foi possível consultar as sessões.';return;}
    const histogram=(values,display)=>{
      const counts=new Map();
      for(const value of values)if(value)counts.set(value,(counts.get(value)||0)+1);
      const sorted=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);
      return sorted.map(([id,count])=>`<div class="profile-stat"><span>${h(display(id))}</span><meter min="0" max="${sorted[0][1]}" value="${count}" aria-label="${h(display(id))}">${count}</meter><b>${count}</b></div>`).join('')||'<p>Sem registros.</p>';
    };
    const sessions=data||[],name=id=>productRows.find(p=>p.id===id)?.name||id;
    area.innerHTML=`<section class="admin-section"><h2>Preferências do Sommelier</h2><p>${sessions.length} sessão(ões) recentes · até 1.000 registros</p>
      <h3>Ocasiões mais pedidas</h3>${histogram(sessions.map(s=>s.ocasiao),id=>OCCASION[id]||id)}
      <h3>Faixas de orçamento mais comuns</h3>${histogram(sessions.map(s=>s.faixa),id=>BUDGET[id]?.label||id)}
      <h3>Rótulos mais recomendados</h3>${histogram(sessions.flatMap(s=>s.recomendados),name)}
      <h3>Rótulos escolhidos</h3>${histogram(sessions.map(s=>s.escolhido),name)}</section>`;
  }
  async function renderGifts(){
    const area=areas.gifts;
    area.innerHTML='<section class="admin-section"><h2>Kits Presente</h2><p role="status">Carregando embalagens, kits e pedidos…</p></section>';
    const [presets,settings,giftOrders]=await Promise.all([
      supa.from('gift_kit_presets').select('*').order('id'),
      supa.from('gift_kit_settings').select('*').maybeSingle(),
      supa.from('orders').select('id,status,payment_status,gift_kits,created_at').neq('gift_kits','[]').order('created_at',{ascending:false}).limit(1000),
    ]);
    if(!area.isConnected)return;
    if(presets.error||settings.error){area.querySelector('p').textContent='Não foi possível consultar os kits.';return;}
    const packages=productRows.filter(p=>p.categoria_kit==='embalagem');
    const eligible=productRows.filter(p=>p.elegivel_kit&&p.active);
    const list=(giftOrders.error?orders:giftOrders.data||[]).flatMap(o=>(o.gift_kits||[]).map(kit=>({order:o,kit})));
    const valid=list.filter(({order})=>order.status!=='cancelled'&&order.payment_status==='paid');
    const counts=new Map();
    for(const {kit} of valid)counts.set(kit.occasion,(counts.get(kit.occasion)||0)+1);
    const average=valid.length?valid.reduce((sum,{kit})=>sum+Number(kit.price),0)/valid.length:0;
    area.innerHTML=`<section class="admin-section"><h2>Embalagens</h2>
      <form class="admin-form" id="giftPackageForm"><div class="admin-form-grid">
      <label>Cadastro<select name="id"><option value="">Nova embalagem</option>${packages.map(p=>`<option value="${h(p.id)}">${h(p.name)}</option>`).join('')}</select></label>
      <label>Nome<input name="name" required maxlength="100" placeholder="Ex.: Caixa clássica"></label>
      <label>Preço (R$)<input type="number" name="price" min=".01" step=".01" required></label><label>Foto (URL)<input name="image" type="url" required></label>
      <label>Unidade para ajuste<select name="store"><option value="">Sem ajuste de estoque</option>${stores.filter(s=>s.active).map(s=>`<option value="${h(s.id)}">${h(s.name)}</option>`).join('')}</select></label>
      <label>Saldo nessa unidade<input name="quantity" type="number" min="0" step="1"></label></div><button type="submit" class="admin-primary">Salvar embalagem</button></form></section>
      <section class="admin-section"><h2>Kits prontos</h2><p>Selecione um vinho, uma embalagem e os complementos. O preço fechado vale para a combinação cadastrada.</p>
      <form class="admin-form" id="giftPresetForm"><label>Kit<select name="id">${(presets.data||[]).map(p=>`<option value="${h(p.id)}">${h(p.name)}</option>`).join('')}</select></label>
      <label>Componentes<select name="products" multiple size="9">${eligible.map(p=>`<option value="${h(p.id)}">${h(KIT_CATEGORY[p.categoria_kit])} · ${h(p.name)}</option>`).join('')}</select></label>
      <label>Preço fechado (R$)<input name="price" type="number" min=".01" step=".01"></label><label><input type="checkbox" name="active"> Publicar</label>
      <button type="submit" class="admin-primary">Salvar kit pronto</button></form>
      <form class="admin-form" id="giftDeadlineForm"><label>Aviso de antecedência<input name="label" maxlength="140" value="${h(settings.data?.deadline_label)}"></label><label>Prazo para pedidos de Natal<input name="date" type="date" value="${h(settings.data?.deadline_date)}"></label><button type="submit" class="admin-secondary">Salvar prazo</button></form></section>
      <section class="admin-section"><h2>Pedidos de kit</h2><p>${valid.length} kit(s) em pedidos pagos · Ticket médio ${money(average)}.</p>
      <ul>${[...counts].map(([id,n])=>`<li>${h(GIFT_OCCASION[id]||id)} · ${n}</li>`).join('')}</ul>
      ${list.map(({order,kit},i)=>`<article class="admin-order-card"><b>Pedido #${h(order.id.slice(0,8))} · ${h(kit.title)} · ${money(kit.price)}</b><p>${h(kit.items.map(item=>item.name).join(', '))}</p><p>${h(kit.method==='pickup'?'Retirada · '+kit.store_name:'Entrega · '+kit.address+' · '+kit.date)}</p><p>${h(kit.from)} → ${h(kit.to)} · ${h(kit.message||'Sem mensagem')}</p><button type="button" class="admin-secondary" data-print-gift="${i}">Imprimir cartão</button></article>`).join('')||'<p>Nenhum pedido de kit registrado.</p>'}</section>`;
    const pkg=area.querySelector('#giftPackageForm');
    pkg.elements.id.onchange=()=>{
      const p=packages.find(row=>row.id===pkg.elements.id.value);
      pkg.elements.name.value=p?.name||'';pkg.elements.price.value=p?.price||'';pkg.elements.image.value=p?.image_url||'';
    };
    pkg.onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(pkg),name=String(fd.get('name')).trim(),image=String(fd.get('image')).trim();
      const id=fd.get('id')||'embalagem-'+crypto.randomUUID();
      const store=fd.get('store'),qty=fd.get('quantity');
      if(!/^https:\/\/[^ ]+/i.test(image)||!name||store&&qty===''){toast('Confira nome, foto HTTPS e saldo.');return;}
      const payload={name,category:'Embalagens para presente',categoria_kit:'embalagem',elegivel_kit:true,active:true,price:Number(fd.get('price')),image_url:image,image_alt:name,updated_at:new Date().toISOString()};
      const result=fd.get('id')?await supa.from('products').update(payload).eq('id',id):await supa.from('products').insert({id,...payload});
      if(result.error){toast(result.error.message);return;}
      if(store){
        const {error}=await supa.rpc('register_store_stock_movement',{p_store_id:store,p_product_id:id,p_movement_type:'ajuste',p_quantity:Number(qty),p_note:'Saldo da embalagem para presente'});
        if(error){toast('Embalagem salva, mas o saldo não foi atualizado. '+error.message);await refresh();return;}
      }
      toast('Embalagem salva.');await refresh();
    };
    const preset=area.querySelector('#giftPresetForm'),loadPreset=()=>{
      const p=(presets.data||[]).find(row=>row.id===preset.elements.id.value);
      preset.elements.price.value=p?.price||'';
      preset.elements.active.checked=Boolean(p?.active);
      for(const option of preset.elements.products.options)option.selected=p?.product_ids?.includes(option.value)||false;
    };
    preset.elements.id.onchange=loadPreset;loadPreset();
    preset.onsubmit=async e=>{
      e.preventDefault();
      const ids=[...preset.elements.products.selectedOptions].map(o=>o.value),published=preset.elements.active.checked;
      const categories=ids.map(id=>eligible.find(p=>p.id===id)?.categoria_kit);
      const count=(...values)=>categories.filter(c=>values.includes(c)).length;
      if(published&&(!(Number(preset.elements.price.value)>0)||count('vinho')!==1||count('embalagem')!==1||count('queijo','petisco')>2||count('acessorio','doce')>1)){
        toast('Informe um preço válido, um vinho e uma embalagem. Escolha até dois acompanhamentos e um acessório ou doce.');return;
      }
      const {error}=await supa.from('gift_kit_presets').update({product_ids:ids,price:Number(preset.elements.price.value)||null,active:published}).eq('id',preset.elements.id.value);
      if(error){toast(error.message);return;}toast('Kit pronto salvo.');await refresh();
    };
    const deadline=area.querySelector('#giftDeadlineForm');
    deadline.onsubmit=async e=>{
      e.preventDefault();
      const {error}=await supa.from('gift_kit_settings').update({deadline_date:deadline.elements.date.value||null,deadline_label:deadline.elements.label.value.trim()||null}).eq('id',true);
      if(error){toast(error.message);return;}toast('Prazo salvo.');await refresh();
    };
    area.querySelectorAll('[data-print-gift]').forEach(button=>button.onclick=async()=>{
      const pending=window.open('about:blank','_blank');
      if(!pending){toast('Permita a abertura da janela de impressão.');return;}
      try {
        const {giftCardCanvas}=await import('./gift-experience.mjs');
        pending.opener=null;
        pending.document.title='Cartão · Empório Milão';
        const img=pending.document.createElement('img');
        img.style.maxWidth='100%';img.src=giftCardCanvas(list[Number(button.dataset.printGift)].kit).toDataURL('image/png');
        pending.document.body.replaceChildren(img);
        await img.decode();pending.print();
      } catch {pending.close();toast('Não foi possível preparar a impressão.');}
    });
  }
}
