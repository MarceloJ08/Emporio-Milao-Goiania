import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import { bindEmailFeedback, createEmailPolicy, emailErrorKind, withEmailTimeout } from './email-requests.mjs';
import { setupSignupConfirmation, signupReturnFrom } from './signup-confirmation.mjs';

import { readAssurance, setupMfaChallenge, setupMfaSettings } from './mfa.mjs';
import { captchaErrorMessage, requestCaptcha } from './turnstile.mjs';
import { printSaleReceipt } from './sale-receipt.mjs';

const passwordFields = document.querySelectorAll(
  'input[type="password"][autocomplete="current-password"], input[type="password"][autocomplete="new-password"]',
);
for (const input of passwordFields) {
  const field = document.createElement('div');
  field.className = 'password-field';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.setAttribute('aria-controls', input.id);
  toggle.setAttribute('aria-label', input.id === 'recoveryConfirmPassword' ? 'Mostrar confirmação da senha' : 'Mostrar senha');
  toggle.innerHTML = '<svg class="store-icon" aria-hidden="true"><use></use></svg>';
  const icon = toggle.querySelector('use');
  const setVisibility = visible => {
    input.type = visible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(visible));
    icon.setAttribute('href', visible ? '/src/icons.svg#eye-off' : '/src/icons.svg#eye');
  };
  toggle.addEventListener('click', () => setVisibility(input.type === 'password'));
  input.form.addEventListener('reset', () => setVisibility(false));
  input.before(field);
  field.append(input, toggle);
  setVisibility(false);
}

const signupReturn = signupReturnFrom(new URL(location.href));

let emailStorage;
try { emailStorage = window.localStorage; } catch { /* Restricted browser storage. */ }
const emailPolicy = createEmailPolicy({ storage: emailStorage, locks: navigator.locks });
const emailFetch = withEmailTimeout(emailPolicy);
const authProject = ["https://khbcqvuaqmzxlmaayfla.supabase.co", "sb_publishable_N_Hr_LRVWHs-zN7NU5zV7A_aZuU6Fu1"];
const recoveryUrl = new URL('/?senha=recuperar', location.origin);
function readRecoveryReturn(url) {
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const type = query.get('type') || fragment.get('type');
  const code = query.get('code') || fragment.get('code');
  const explicitReturn = query.get('senha') === 'recuperar' || type === 'recovery';
  // Supabase may return a PKCE code to the Site URL without our route marker.
  // An unmarked root code still needs the isolated recovery verifier.
  const rootCode = url.pathname === '/' && query.has('code') && !type;
  if (!explicitReturn && !rootCode) return null;

  if (fragment.has('token_hash') || query.has('token_hash')) {
    const hashes = fragment.getAll('token_hash');
    const tokenHash = hashes[0] || '';
    const valid = explicitReturn && (!type || type === 'recovery')
      && hashes.length === 1 && /^[A-Za-z0-9_-]{1,512}$/.test(tokenHash)
      && !query.has('token_hash') && !code && !fragment.has('access_token')
      && !query.has('error') && !fragment.has('error')
      && !query.has('error_code') && !fragment.has('error_code');
    return { tokenHash: valid ? tokenHash : null };
  }

  return {
    code: !type || type === 'recovery' ? code : null,
    flowId: query.get('sb_flow_id') || fragment.get('sb_flow_id'),
    errorCode: query.get('error_code') || fragment.get('error_code'),
    failed: query.has('error') || fragment.has('error'),
  };
}

let recoveryCallback = readRecoveryReturn(new URL(location.href));
const recoveryReturn = Boolean(recoveryCallback);
let recoveryOpen = recoveryReturn;
let recoveryStarting = recoveryReturn;
if (recoveryReturn) history.replaceState(history.state, '', '/');

const supa = createClient(...authProject, {
  global: { fetch: emailFetch },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !recoveryReturn },
});

const mfaChallenge = setupMfaChallenge(document.getElementById('mfaChallenge'));
const mfaSettingsToggle = document.getElementById('mfaSettingsToggle');
const mfaSettings = setupMfaSettings({
  auth: supa.auth,
  panel: document.getElementById('mfaSettings'),
  toggle: mfaSettingsToggle,
  refresh: async () => {
    if (await refreshAuth() && mfaEnrollmentPending) {
      mfaEnrollmentPending = false;
      await finishLogin();
    }
  },
});
let mfaEnrollmentUserId;
let mfaEnrollmentPending = false;
mfaSettingsToggle.onclick = () => {
  const userId = currentUser?.id || mfaEnrollmentUserId;
  if (userId) mfaSettings.open(userId);
};

let recoveryClient;
function getRecoveryClient() {
  if (!recoveryClient) {
    const storageKey = 'emporio-password-recovery';
    const memory = new Map();
    // Only the PKCE verifier persists across navigations. The recovery
    // session is kept apart from the storefront session and stays in memory.
    const storage = {
      getItem: key => key === storageKey ? memory.get(key) ?? null : localStorage.getItem(key),
      setItem: (key, value) => key === storageKey ? memory.set(key, value) : localStorage.setItem(key, value),
      removeItem: key => key === storageKey ? memory.delete(key) : localStorage.removeItem(key),
    };
    recoveryClient = createClient(...authProject, {
      global: { fetch: emailFetch },
      auth: { flowType: 'pkce', storageKey, storage, autoRefreshToken: false, detectSessionInUrl: false },
    }).auth;
  }
  return recoveryClient;
}
let WA='556236367239';
const normalizePhone = value => {
  let digits = String(value || '').replace(/\D/g,'');
  if (digits.startsWith('55')) digits = digits.slice(2);
  return '+55' + digits;
};
const paymentLabels = {pix:'Pix',dinheiro:'Dinheiro',cartao_entrega:'Cartão na entrega'};
const isStrongPassword = value => value.length>=8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
let currentUser = null;
let isAdmin = false;
let isSalesStaff = false;
const accountPanels = document.getElementById('accountPanels');
const salesOpenButton = document.getElementById('salesOpenBtn');
const adminOpenButton = document.getElementById('adminOpenBtn');
const adminRefreshInterval = 20_000;
let adminRefreshTimer = null;
let adminRefreshDueAt = null;
let adminRefreshInFlight = false;
let adminDashboardRequest = 0;
let activeAdminArea = 'finance';
async function loadProducts(){
  const {data,error}=await supa.from('products').select('id,name,category,country,price,compare_at_price,promotion_day,description,image_url,image_alt').eq('active',true).order('name');
  if(error){console.error('Falha ao carregar produtos:',error);toast('Não foi possível atualizar o catálogo.');return;}
  if(data && data.length){products=data.map(p=>({...p,price:Number(p.price),oldPrice:p.compare_at_price?Number(p.compare_at_price):null}));renderFilters();renderProducts();renderCountries();if(currentCollection)renderCollectionProducts();}
}
async function loadCartForUser(user){
  cartOwnerId=user?.id||null;
  const localKey=cartOwnerId?'milao_cart_'+cartOwnerId:'milao_cart_guest';
  let cached={};try{cached=JSON.parse(localStorage.getItem(localKey)||'{}')||{};}catch(_){}
  if(!user){cart=cached;saveCart(false);return;}
  const {data,error}=await supa.from('customer_carts').select('items').eq('user_id',user.id).maybeSingle();
  if(error){console.warn('Carrinho remoto indisponível:',error);cart=cached;saveCart(false);return;}
  if(data?.items && typeof data.items==='object'){cart=data.items;localStorage.setItem(localKey,JSON.stringify(cart));}
  else {
    cart=cached;
    const guest=(()=>{try{return JSON.parse(localStorage.getItem('milao_cart_guest')||'{}')||{};}catch(_){return {};}})();
    if(!Object.keys(cart).length && Object.keys(guest).length){cart=guest;localStorage.removeItem('milao_cart_guest');}
    await persistCart();
  }
  saveCart(false);
}
async function persistCart(){
  const key=cartOwnerId?'milao_cart_'+cartOwnerId:'milao_cart_guest';
  try{localStorage.setItem(key,JSON.stringify(cart));}catch(e){console.warn('Não foi possível salvar a sacola localmente.',e);}
  if(cartOwnerId){
    const {error}=await supa.from('customer_carts').upsert({user_id:cartOwnerId,items:cart,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)console.warn('Não foi possível sincronizar a sacola:',error);
  }
}
function showAdminWelcomeNotification(){
  const key='milao_admin_welcome_'+(currentUser?.id||'');
  try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(_){}
  let layer=document.getElementById('adminWelcomeNotice');
  if(!layer){
    layer=document.createElement('div');layer.id='adminWelcomeNotice';layer.className='admin-welcome-notice';
    layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-labelledby','adminWelcomeTitle');
    layer.innerHTML='<div class="admin-welcome-card"><button class="admin-welcome-close" type="button" aria-label="Fechar aviso">×</button><div class="admin-welcome-mark">M</div><div class="admin-welcome-kicker">EMPÓRIO MILÃO · ÁREA DO PROPRIETÁRIO</div><h2 id="adminWelcomeTitle">Seja bem-vindo, Sr. Luiz.</h2><p>Sua empresa, sua visão. Vamos em frente.</p><div class="admin-welcome-rule"></div></div>';
    document.body.appendChild(layer);
    layer.querySelector('.admin-welcome-close').addEventListener('click',()=>layer.classList.remove('is-visible'));
    layer.addEventListener('click',e=>{if(e.target===layer)layer.classList.remove('is-visible');});
  }
  requestAnimationFrame(()=>layer.classList.add('is-visible'));
  window.setTimeout(()=>layer.classList.remove('is-visible'),5600);
}
async function refreshAuth(){
  if (recoveryOpen) return;
  const assurance = await readAssurance(supa.auth);
  if (recoveryOpen) return;
  let session = assurance.session;
  let staffSetupRequired = false;
  let requirementsUnavailable = false;
  if (session) {
    const { data, error } = await supa.rpc('account_mfa_requirements');
    if (recoveryOpen) return;
    requirementsUnavailable = Boolean(error) || typeof data?.ready !== 'boolean';
    staffSetupRequired = !requirementsUnavailable && !data.ready
      && (data.admin === true || data.sales === true) && assurance.level === 'aal1';
    if (!data?.ready && !staffSetupRequired) requirementsUnavailable = true;
  }

  const modal = document.getElementById('accountModal');
  const enrollmentUserId = staffSetupRequired ? session.user.id : null;
  const newEnrollment = enrollmentUserId && enrollmentUserId !== mfaEnrollmentUserId;
  mfaEnrollmentUserId = enrollmentUserId;
  if (staffSetupRequired) mfaEnrollmentPending = true;
  else if (assurance.state === 'signed-out') mfaEnrollmentPending = false;
  modal.classList.toggle('mfa-required', staffSetupRequired);
  const staffNotice = document.getElementById('mfaStaffNotice');
  staffNotice.hidden = !staffSetupRequired;
  if (staffSetupRequired || requirementsUnavailable) session = null;

  if (assurance.state === 'challenge' || assurance.state === 'unavailable' || requirementsUnavailable) {
    if (isAdminDashboardOpen()) stopAdminRefresh();
    document.body.classList.remove('admin-mode', 'sales-mode');
    document.getElementById('adminPage').hidden = true;
    mfaChallenge.show({
      auth: supa.auth,
      userId: assurance.userId,
      retry: async () => {
        if (requirementsUnavailable) await supa.auth.refreshSession();
        if (await refreshAuth()) await finishLogin();
      },
      cancel: async () => {
        const { error } = await supa.auth.signOut({ scope: 'local' });
        if (error) throw error;
        await refreshAuth();
      },
      verified: async () => { if (await refreshAuth()) await finishLogin(); },
    });
  } else mfaChallenge.close(supa.auth);
  if (!session && isAdminDashboardOpen()) closeAdminPage();
  await signupConfirmation.check(session);
  if (recoveryOpen) return;
  const nextUser=session?.user||null;
  mfaSettings.retain(nextUser?.id || mfaEnrollmentUserId);
  const changed=currentUser?.id!==nextUser?.id;
  currentUser=nextUser;isAdmin=false;isSalesStaff=false;currentProfile=null;
  accountPanels.hidden = true;
  salesOpenButton.hidden = true;
  adminOpenButton.hidden = true;
  if(currentUser){
    const {data:adminData,error:adminError}=await supa.rpc('is_admin');
    isAdmin=!adminError && adminData===true;
    if(adminError)console.error('Falha ao verificar permissão ADM:',adminError);
    if (!isAdmin && isAdminDashboardOpen()) closeAdminPage();
    const {data:salesData,error:salesError}=await supa.rpc('is_sales_staff');
    isSalesStaff=!salesError&&salesData===true;
    if(salesError)console.error('Falha ao verificar permissão de vendas:',salesError);
    const {data:profile,error:profileError}=await supa.from('profiles').select('full_name,email,phone,avatar_url,delivery_address').eq('id',currentUser.id).maybeSingle();
    if(!profileError)currentProfile=profile||{};
    if(changed&&isAdmin)showAdminWelcomeNotification();
    const name=currentProfile?.full_name||currentUser.user_metadata?.full_name||currentUser.email||'cliente';
    document.getElementById('accountStatus').textContent='Olá, '+name+'. Seus dados e pedidos estão vinculados a esta conta.';document.getElementById('accountBtn').textContent='Minha conta';
    document.getElementById('accountLogin').style.display='none';
    document.getElementById('accountRegister').style.display='none';
    document.getElementById('accountSigned').style.display='block';
    document.getElementById('profileName').value=currentProfile?.full_name||currentUser.user_metadata?.full_name||'';
    document.getElementById('profilePhone').value=currentProfile?.phone||'';
    document.getElementById('profileAddress').value=currentProfile?.delivery_address||'';
    document.getElementById('profileEmail').value=currentUser.email||'';
    document.getElementById('customerPhone').value=currentProfile?.phone||'';
    document.getElementById('deliveryAddress').value=currentProfile?.delivery_address||'';
    const avatar=document.getElementById('accountAvatar');
    avatar.innerHTML=currentProfile?.avatar_url?'<img src="'+escapeHtml(currentProfile.avatar_url)+'" alt="Foto de perfil">':escapeHtml((name.trim()[0]||'M').toUpperCase());
    document.getElementById('logoutBtn').style.display='block';
    salesOpenButton.hidden = !isSalesStaff;
    adminOpenButton.hidden = !isAdmin;
    accountPanels.hidden = !isSalesStaff && !isAdmin;
    const {data:orders,error:ordersError}=await supa.from('orders').select('id,status,total_amount,created_at,order_items(product_name,quantity)').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(20);
    const box=document.getElementById('customerOrders');
    if(ordersError){box.textContent='Não foi possível carregar seus pedidos agora.';}
    else if(!orders?.length){box.innerHTML='<h3>Meus pedidos</h3><p>Você ainda não fez nenhum pedido.</p>';}
    else{
      const labels={received:'Recebido',confirmed:'Confirmado',preparing:'Em preparação',out_for_delivery:'Saiu para entrega',completed:'Concluído',cancelled:'Cancelado'};
      box.innerHTML='<h3>Meus pedidos</h3>'+orders.map(o=>'<article class="customer-order"><b>Pedido #'+escapeHtml(o.id.slice(0,8))+'</b><span>'+escapeHtml(labels[o.status]||o.status)+'</span><small>'+new Date(o.created_at).toLocaleString('pt-BR')+' · '+brl(Number(o.total_amount))+'</small><p>'+((o.order_items||[]).map(i=>escapeHtml(i.quantity+'x '+i.product_name)).join(' · '))+'</p></article>').join('');
    }
    if(changed)await loadCartForUser(currentUser);
  }else{
    document.getElementById('accountStatus').textContent='Entre com seu e-mail e senha ou crie sua conta.';document.getElementById('accountBtn').textContent='Login';
    document.getElementById('accountLogin').style.display=staffSetupRequired?'none':'block';
    document.getElementById('accountRegister').style.display=staffSetupRequired?'none':'block';
    document.getElementById('accountSigned').style.display='none';
    document.getElementById('customerOrders').innerHTML='';
    if(changed)await loadCartForUser(null);
  }
  if (staffSetupRequired) {
    document.body.classList.remove('admin-mode', 'sales-mode');
    document.getElementById('adminPage').hidden = true;
    document.getElementById('accountSigned').style.display = 'block';
    document.getElementById('accountSettings').style.display = 'block';
    document.getElementById('accountBtn').textContent = 'Minha conta';
    modal.classList.add('open');
    if (newEnrollment) {
      staffNotice.focus();
      mfaSettings.open(mfaEnrollmentUserId);
    }
  }
  return session;
}


let products=[{"id": "suco-honest-acerola", "name": "Suco Honest Acerola 900 ml", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Bebida de fruta para servir bem gelada."}, {"id": "suco-honest-maracuja", "name": "Suco Honest Maracujá 900 ml", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Sabor tropical e refrescante."}, {"id": "suco-honest-frutas-vermelhas", "name": "Suco Honest Frutas Vermelhas 900 ml", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Combinação frutada para diferentes momentos."}, {"id": "suco-honest-morango-limao", "name": "Suco Honest Morango com Limão 900 ml", "category": "Sucos", "country": "Brasil", "price": 13.9, "oldPrice": null, "description": "Mistura de morango e limão em 900 ml."}, {"id": "suco-honest-morango-maracuja", "name": "Suco Honest Morango com Maracujá", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Combinação de frutas com perfil tropical."}, {"id": "suco-prats-uva", "name": "Suco Prats Uva Integral 900 ml", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Suco integral de uva."}, {"id": "suco-prats-laranja", "name": "Suco Prats Laranja Integral 900 ml", "category": "Sucos", "country": "Brasil", "price": 19.99, "oldPrice": null, "description": "Suco integral de laranja."}, {"id": "suco-casa-madeira", "name": "Suco Tinto de Uva Casa Madeira 1 L", "category": "Sucos", "country": "Brasil", "price": 29.99, "oldPrice": null, "description": "Suco tinto de uva em embalagem de 1 litro."}, {"id": "suco-jumju", "name": "Suco de Uva Jumju 238 ml", "category": "Sucos", "country": "Coreia do Sul", "price": 3.99, "oldPrice": null, "description": "Bebida de uva verde com pedaços de fruta. Servir bem gelada."}];const categories=[
 ['Vinhos','wine','Vinhos de todas as origens'],['Destilados','whisky','Destilados e licores'],['Whiskys','whisky','Scotch, bourbon e mais'],['Vinhos premium','sparkle','Rótulos especiais'],['Tintos','wine','Vinhos tintos'],['Vinho do Porto','wine','Ruby, LBV, Vintage, Tawny e mais'],['Brancos','flute','Vinhos brancos'],['Rosés','flower','Vinhos rosés'],['Espumantes','bottle','Brindes e celebrações'],['Carnes','meat','Cortes especiais'],['Utensílios','utensils','Acessórios e taças'],['Refrigerantes','drink','Bebidas sem álcool'],['Sucos','grapes','Sucos e bebidas de fruta'],['Frios','cheese','Frios e charcutaria'],['Azeites','olive','Azeites e conservas'],['Petiscos','snack','Para compartilhar'],['Queijos','cheese','Queijos especiais'],['Cervejas','beer','Cervejas e especiais'],['Gourmet & outros','sparkle','Outras descobertas']
];
const countries=[['Argentina','Malbec, Bonarda e Cabernet'],['Brasil','Espumantes, Merlot e castas nacionais'],['Chile','Cabernet Sauvignon, Carménère e Sauvignon Blanc'],['França','Bordeaux, Borgonha, Rhône e Champagne'],['Itália','Sangiovese, Nebbiolo, Pinot Grigio e mais'],['Portugal','Douro, Alentejo, Dão e Vinho Verde'],['Espanha','Tempranillo, Garnacha e Cava'],['Uruguai','Tannat e outras castas'],['Estados Unidos','Napa Valley, Sonoma e Oregon'],['África do Sul','Pinotage, Chenin Blanc e blends'],['Austrália','Shiraz e Chardonnay'],['Nova Zelândia','Sauvignon Blanc e Pinot Noir']];
let activeCategory='Todos',cart=JSON.parse(localStorage.getItem('milao_cart_guest')||'{}'),cartOwnerId=null,currentProfile=null,cartSaveTimer=null;
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function storeIcon(name) {
  return '<svg class="store-icon" aria-hidden="true" focusable="false"><use href="/src/icons.svg#' + name + '"></use></svg>';
}
function productIcon(category) {
  return categories.find(([name]) => name === category)?.[1] || "sparkle";
}
function productArtHtml(product) {
  if (!product.image_url) {
    return '<div class="product-art"><span>'+storeIcon(productIcon(product.category))+'</span></div>';
  }
  const label=product.image_alt || product.name;
  const vintageNote=label.endsWith('A safra da foto pode variar.')
    ? '<small class="product-photo-note">A safra da foto pode variar.</small>' : '';
  return '<div class="product-art has-image"><img src="'+escapeHtml(product.image_url)+'" alt="'+escapeHtml(label)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest(\'.product-art\').classList.add(\'image-failed\');this.remove()"><span class="product-art-fallback" aria-hidden="true">'+storeIcon(productIcon(product.category))+'</span>'+vintageNote+'</div>';
}
function toast(s){let t=document.getElementById('toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function renderCategories(){let el=document.getElementById('categoryGrid');el.innerHTML=categories.map(c=>`<button class="category ${activeCategory===c[0]?'selected':''}" data-cat="${c[0]}"><span class="symbol">${storeIcon(c[1])}</span><b>${c[0]}</b><small>${c[2]}</small></button>`).join('');el.querySelectorAll('button').forEach(b=>b.onclick=()=>openCollection({category:b.dataset.cat}))}
function renderCountryFilter() {
  const select = document.getElementById('catalogCountry');
  const previous = select.value;
  const origins = [...new Set(products.map(product => product.country).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.replaceChildren(new Option('Todos os países', ''), ...origins.map(origin => new Option(origin, origin)));
  if (origins.includes(previous)) select.value = previous;
}
function renderFilters(){renderCountryFilter();let list=['Todos',...new Set(products.map(p=>p.category))];document.getElementById('activeFilters').innerHTML=list.map(c=>`<button class="chip ${(activeCategory===c||(activeCategory==='Todos'&&c==='Todos'))?'active':''}" data-filter="${c}">${c}</button>`).join('');document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{activeCategory=b.dataset.filter==='Todos'?'Todos':b.dataset.filter;renderCategories();renderFilters();renderProducts()})}
const recommendedIds = [
  'cardapio-catena-malbec',
  'cardapio-veuve-clicquot-brut-yellow-label',
  'cardapio-moet-chandon-imperial-brut',
  'cardapio-vik-milla-cala-2022'
];
function storeDay() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(new Date());
}
function isWine(product) {
  return /vinho|tinto|branco|rosé|champagne|espumante/i.test(product.category);
}
function renderProducts(){let q=document.getElementById('search').value.toLowerCase();let sort=document.getElementById('sort').value;const country=document.getElementById('catalogCountry').value;const showingPicks=!country && !q.trim() && activeCategory==='Todos';
document.getElementById('catalogTitle').textContent=showingPicks?'Recomendados da casa':'Resultados do catálogo';
const candidates=showingPicks?recommendedIds.map(id=>products.find(p=>p.id===id)).filter(Boolean):products;
let list=candidates.filter(p=>(!country||p.country===country)&&(activeCategory==='Todos'||p.category===activeCategory)&&(`${p.name} ${p.category} ${p.country}`.toLowerCase().includes(q)));if(sort==='low')list.sort((a,b)=>a.price-b.price);if(sort==='high')list.sort((a,b)=>b.price-a.price);if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));let el=document.getElementById('productGrid');if(showingPicks && !list.length){el.textContent='Consulte o catálogo completo para explorar os rótulos disponíveis.';return;}if(!list.length){el.innerHTML=`<div class="empty"><b>Essa prateleira está sendo preparada.</b><p>Consulte a equipe para receber a lista atualizada desta categoria.</p><a class="btn" style="background:var(--forest);color:white;margin-top:10px" target="_blank" href="${waLink('Olá! Gostaria de consultar os produtos e preços desta categoria: '+activeCategory+'.')}">Consultar no WhatsApp</a></div>`;return}el.innerHTML=list.map(p=>{let old=p.oldPrice&&Number(p.oldPrice)>Number(p.price)?p.oldPrice:null;let disc=old?Math.round((1-p.price/old)*100):null;return `<article class="product">${productArtHtml(p)}<div class="product-body"><div class="product-meta">${p.country} · ${p.category}</div><h3>${p.name}</h3><p>${p.description}</p><div class="prices">${old?`<span class="was">${brl(old)}</span><span class="discount">-${disc}% OFF</span>`:''}<span class="current">${brl(p.price)}</span></div><div class="price-note">${old?'Oferta cadastrada':'Preço atual publicado'}</div><button class="add" data-add="${p.id}">Adicionar à sacola +</button></div></article>`}).join('');el.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add))}
function waLink(msg){return 'https://wa.me/'+WA+'?text='+encodeURIComponent(msg)}
function add(id){cart[id]=(cart[id]||0)+1;saveCart();toast('Produto adicionado à sua sacola.')}
function saveCart(sync=true){const key=cartOwnerId?'milao_cart_'+cartOwnerId:'milao_cart_guest';try{localStorage.setItem(key,JSON.stringify(cart));}catch(e){}document.getElementById('cartCount').textContent=Object.values(cart).reduce((a,b)=>a+b,0);renderCart();if(sync&&cartOwnerId){clearTimeout(cartSaveTimer);cartSaveTimer=setTimeout(()=>persistCart(),250);}}
function renderCart(){
 const entries=Object.entries(cart).filter(([id,n])=>n>0&&products.some(p=>p.id===id));const el=document.getElementById('cartItems');
 if(!entries.length){el.innerHTML='<div style="text-align:center;padding:50px 10px;color:#777"><div style="font-size:42px">'+storeIcon("bag")+'</div><b>Sua sacola está vazia.</b><p>Explore o catálogo e adicione seus favoritos.</p></div>';document.getElementById('cartTotal').textContent=brl(0);document.getElementById('checkoutTotal').textContent=brl(0);document.getElementById('continueCheckout').disabled=true;return;}
 document.getElementById('continueCheckout').disabled=false;let total=0;
 el.innerHTML=entries.map(([id,n])=>{const p=products.find(x=>x.id===id),line=p.price*n;total+=line;const symbol=storeIcon(productIcon(p.category));const art=p.image_url?'<img src="'+escapeHtml(p.image_url)+'" alt="'+escapeHtml(p.image_alt||p.name)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add(\'image-failed\')">'+symbol:symbol;return '<article class="cart-line"><div class="cart-product-art'+(p.image_url?' has-image':'')+'">'+art+'</div><div class="cart-product-info"><b>'+escapeHtml(p.name)+'</b><small>'+escapeHtml(p.category||'Produto')+(p.country?' · '+escapeHtml(p.country):'')+'</small><small class="cart-unit">'+brl(p.price)+' por unidade</small></div><div class="cart-line-price"><strong>'+brl(line)+'</strong><div class="qty"><button type="button" data-dec="'+escapeHtml(id)+'">−</button><span>'+n+'</span><button type="button" data-inc="'+escapeHtml(id)+'">+</button></div></div></article>';}).join('');
 document.getElementById('cartTotal').textContent=brl(total);document.getElementById('checkoutTotal').textContent=brl(total);
 el.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{cart[b.dataset.dec]--;if(cart[b.dataset.dec]<=0)delete cart[b.dataset.dec];saveCart();});el.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{cart[b.dataset.inc]++;saveCart();});
}
function showCartStep(step){const first=step===1;document.getElementById('cartReviewStep').hidden=!first;document.getElementById('checkoutDetailsStep').hidden=first;document.getElementById('cartProgressOne').classList.toggle('active',first);document.getElementById('cartProgressTwo').classList.toggle('active',!first);}
function openCart(){document.getElementById('cartDrawer').classList.add('open');showCartStep(1);renderCart();}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');}
document.getElementById('openCart').onclick=openCart;document.getElementById('closeCart').onclick=closeCart;document.getElementById('closeShade').onclick=closeCart;
document.getElementById('continueCheckout').onclick=()=>{if(!Object.values(cart).some(n=>n>0)){toast('Adicione produtos antes de continuar.');return;}if(!currentUser){toast('Entre na sua conta para concluir o pedido.');document.getElementById('accountModal').classList.add('open');return;}showCartStep(2);};
document.getElementById('backToCart').onclick=()=>showCartStep(1);
document.getElementById('checkout').onclick=async()=>{
 const entries=Object.entries(cart).filter(([id,n])=>n>0&&products.some(p=>p.id===id));if(!entries.length){toast('Adicione produtos antes de finalizar.');showCartStep(1);return;}if(!currentUser){toast('Entre na sua conta para registrar o pedido.');document.getElementById('accountModal').classList.add('open');return;}
 const address=document.getElementById('deliveryAddress').value.trim(),payment=document.getElementById('paymentMethod').value,notes=document.getElementById('orderNotes').value.trim();if(address.length<8){toast('Informe o endereço completo para entrega.');document.getElementById('deliveryAddress').focus();return;}
 const name=currentProfile?.full_name||currentUser.user_metadata?.full_name||'',phone=document.getElementById('customerPhone').value.trim()||currentProfile?.phone||'';if(!name||phone.replace(/\D/g,'').length<10){toast('Informe um WhatsApp válido para contato.');document.getElementById('customerPhone').focus();return;}
 const pendingWindow=window.open('about:blank','_blank'),items=entries.map(([id,n])=>({id,quantity:n}));await supa.from('profiles').update({phone,delivery_address:address,updated_at:new Date().toISOString()}).eq('id',currentUser.id);
 const {data:orderId,error}=await supa.rpc('create_order',{p_customer_name:name,p_customer_phone:phone,p_delivery_address:address,p_payment_method:payment,p_items:items,p_notes:notes||null});if(error){if(pendingWindow)pendingWindow.close();console.error(error);toast(error.message||'Não foi possível salvar o pedido.');return;}
 let total=0;const lines=entries.map(([id,n])=>{const p=products.find(x=>x.id===id);total+=p.price*n;return '• '+n+'x '+p.name+' — '+brl(p.price*n);});const msg='Olá! Fiz um pedido pelo site do Empório Milão.\nPedido: '+orderId+'\nCliente: '+name+'\nWhatsApp: '+phone+'\nEndereço: '+address+'\nPagamento: '+paymentLabels[payment]+'\nObservações: '+(notes||'Nenhuma')+'\n\nItens:\n'+lines.join('\n')+'\n\nTotal estimado: '+brl(total)+'\nPor favor, confirmem disponibilidade, entrega e valor final.';
 cart={};saveCart();closeCart();toast('Pedido registrado! Abrindo o WhatsApp.');const url=waLink(msg);if(pendingWindow)pendingWindow.location=url;else window.location.href=url;
};
document.getElementById('catalogCountry').addEventListener('change',renderProducts);
document.getElementById('search').addEventListener('input',renderProducts);document.getElementById('sort').addEventListener('change',renderProducts);

let currentCollection=null;
function collectionFromUrl(){const p=new URLSearchParams(location.search);if(!p.has('colecao'))return null;return {category:p.get('colecao')||'Vinhos',country:p.get('pais')||'',style:p.get('estilo')||''};}
function collectionMatches(product,collection){
 const cat=(product.category||'').toLowerCase(),name=(product.name||'').toLowerCase(),desc=(product.description||'').toLowerCase(),hay=cat+' '+name+' '+desc;
 const requested=(collection.category||'').toLowerCase();
 if(requested==='promoções do dia')return isWine(product) && product.promotion_day===storeDay() && Number(product.oldPrice)>Number(product.price);
 if(requested==='vinhos' && !isWine(product))return false;
 let categoryMatch=requested==='todos'||cat===requested||hay.includes(requested);
 if(requested==='destilados')categoryMatch=['destilados','whiskys','licores'].includes(cat)||categoryMatch;
 if(requested==='espumantes')categoryMatch=cat==='champagnes'||categoryMatch;
 if(requested==='vinhos')categoryMatch=categoryMatch||/vinho|tinto|branco|ros[eé]|espumante|champagne/.test(hay);
 if(requested==='vinho do porto')categoryMatch=cat==='vinho do porto'||(/portugal/.test((product.country||'').toLowerCase())&&/porto|ruby|lbv|vintage|tawny|colheita|crusted|late bottled/.test(hay));
 if(requested==='tintos')categoryMatch=/tinto|tintos/.test(hay);
 if(requested==='brancos')categoryMatch=/branco|brancos/.test(hay);
 if(requested==='rosés')categoryMatch=/ros[eé]/.test(hay);
 if(requested==='vinhos premium')categoryMatch=/premium|reserva|gran reserva|especial/.test(hay);
 if(requested==='tintos')categoryMatch=/tinto|tintos/.test(hay)&&!(/porto|ruby|lbv|vintage|tawny|colheita/.test(hay));
 if(collection.country&&(product.country||'').toLowerCase()!==collection.country.toLowerCase())return false;
 if(collection.style){const style=collection.style.toLowerCase();if(style==='vinho do porto'&&!(cat==='vinho do porto'||(/portugal/.test((product.country||'').toLowerCase())&&/porto|ruby|lbv|vintage|tawny|colheita|crusted|late bottled/.test(hay))))return false;if(style==='tintos'&&(!/tinto|tintos/.test(hay)||/porto|ruby|lbv|vintage|tawny|colheita/.test(hay)))return false;if(style==='brancos'&&!/branco|brancos/.test(hay))return false;if(style==='rosés'&&!/ros[eé]/.test(hay))return false;if(style==='espumantes'&&!/espumante|champagne|prosecco|cava/.test(hay))return false;if(style==='premium'&&!/premium|reserva|gran reserva|especial/.test(hay))return false;}
 return categoryMatch;
}
function openCollection(collection){
 currentCollection={category:collection.category||'Vinhos',country:collection.country||'',style:collection.style||''};
 const params=new URLSearchParams();params.set('colecao',currentCollection.category);if(currentCollection.country)params.set('pais',currentCollection.country);if(currentCollection.style)params.set('estilo',currentCollection.style);
 history.pushState({collection:currentCollection},'',location.pathname+'?'+params.toString());
 renderCollection();window.scrollTo({top:0,behavior:'smooth'});
}
function closeCollection(updateHistory=true){
 currentCollection=null;if(updateHistory)history.pushState({},'',location.pathname);
 document.getElementById('categoryPage').hidden=true;
 document.querySelectorAll('#top > .hero,#top > .manifesto,#top > section').forEach(el=>{if(el.id!=='categoryPage')el.hidden=false;});
}
function renderCollection(){
 if(!currentCollection)return;
 document.querySelectorAll('#top > .hero,#top > .manifesto,#top > section').forEach(el=>{if(el.id!=='categoryPage')el.hidden=true;});
 const page=document.getElementById('categoryPage');page.hidden=false;
 const c=currentCollection,parts=['Empório Milão',c.category];if(c.country)parts.push(c.country);if(c.style)parts.push(c.style);
 const title=c.country?((c.style==='Tintos'?'Vinhos tintos de ':c.style==='Brancos'?'Vinhos brancos de ':c.style==='Rosés'?'Vinhos rosés de ':'Vinhos de ')+c.country):(c.style?c.style+' · ':'')+c.category;
 document.getElementById('collectionCrumbs').textContent=parts.join(' / ');
 document.getElementById('collectionEyebrow').textContent=c.country?'Atlas de vinhos · '+c.country:'Coleção Empório Milão';
 document.getElementById('collectionTitle').textContent=title;
 document.getElementById('collectionDescription').textContent=c.country?'Explore os rótulos desta origem. Filtre por estilo, compare preços e adicione à sua sacola.':'Uma página dedicada a '+c.category.toLowerCase()+', com produtos, preços e ofertas publicados pela loja.';
 document.getElementById('collectionSearch').value='';
 const styles=['Todos os estilos',...(c.country==='Portugal'?['Vinho do Porto']:[]),'Tintos','Brancos','Rosés','Espumantes','Premium'];
 document.getElementById('collectionStyles').innerHTML=(c.country?styles:[]).map(s=>'<button type="button" class="collection-style '+((!c.style&&s==='Todos os estilos')||c.style===s?'active':'')+'" data-style="'+escapeHtml(s)+'">'+escapeHtml(s)+'</button>').join('');
 document.querySelectorAll('#collectionStyles [data-style]').forEach(b=>b.onclick=()=>openCollection({category:c.category,country:c.country,style:b.dataset.style==='Todos os estilos'?'':b.dataset.style}));
 renderCollectionProducts();
}
function renderCollectionProducts(){
 const c=currentCollection;if(!c)return;
 const q=document.getElementById('collectionSearch').value.toLowerCase(),sort=document.getElementById('collectionSort').value;
 let list=products.filter(p=>collectionMatches(p,c)&&(!q||(''+p.name+' '+p.category+' '+p.country+' '+p.description).toLowerCase().includes(q)));
 if(sort==='low')list.sort((a,b)=>a.price-b.price);if(sort==='high')list.sort((a,b)=>b.price-a.price);if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 const el=document.getElementById('collectionProducts');
 if(!list.length && c.category==='Promoções do dia'){el.innerHTML='<p class="collection-empty">'+(q?'Nenhuma oferta corresponde à busca.':'Nenhuma promoção publicada para hoje.')+'</p>';return;}
 if(!list.length){el.innerHTML='<div class="collection-empty"><div class="empty-seal">M</div><div class="eyebrow">Seleção em preparação</div><h3>Estamos preparando esta prateleira.</h3><p>Ainda não há produtos publicados nesta coleção no catálogo online. Não exibimos rótulos, preços ou descontos estimados. Fale com nossa equipe para consultar a disponibilidade atual.</p><a class="btn primary" target="_blank" href="'+waLink('Olá! Gostaria de consultar produtos e preços da coleção '+[c.category,c.country,c.style].filter(Boolean).join(' · ')+'.')+'">Consultar a equipe</a></div>';return;}
 el.innerHTML=list.map(p=>{const old=p.oldPrice&&Number(p.oldPrice)>Number(p.price)?p.oldPrice:null,disc=old?Math.round((1-p.price/old)*100):null;return '<article class="product">'+productArtHtml(p)+'<div class="product-body"><div class="product-meta">'+escapeHtml(p.country||'Empório Milão')+' · '+escapeHtml(p.category)+'</div><h3>'+escapeHtml(p.name)+'</h3><p>'+escapeHtml(p.description||'Produto selecionado pelo Empório Milão.')+'</p><div class="prices">'+(old?'<span class="was">'+brl(old)+'</span><span class="discount">-'+disc+'% OFF</span>':'')+'<span class="current">'+brl(p.price)+'</span></div><div class="price-note">'+(old?'Oferta cadastrada':'Preço atual publicado')+'</div><button class="add" data-add-collection="'+escapeHtml(p.id)+'">Adicionar à sacola +</button></div></article>';}).join('');
 el.querySelectorAll('[data-add-collection]').forEach(b=>b.onclick=()=>add(b.dataset.addCollection));
}
document.getElementById('collectionSearch').addEventListener('input',renderCollectionProducts);
document.getElementById('collectionSort').addEventListener('change',renderCollectionProducts);
document.getElementById('backHome').onclick=()=>closeCollection();
window.addEventListener('popstate',()=>{if(recoveryOpen)return;if(new URLSearchParams(location.search).get('admin')==='1'){openAdminPanel(true);}else if(new URLSearchParams(location.search).get('vendas')==='1'){openSalesPanel(true);}else if(document.body.classList.contains('admin-mode')){document.body.classList.remove('admin-mode','sales-mode');document.getElementById('adminPage').hidden=true;}const route=collectionFromUrl();if(route){currentCollection=route;renderCollection();}else closeCollection(false);});

function renderCountries() {
  const published=products.filter(isWine).map(product=>product.country).filter(Boolean);
  const origins=[...new Set(published.length?published:countries.map(([name])=>name))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  document.getElementById('countryList').replaceChildren(...origins.map(country=>{
    const link=document.createElement('a');
    link.href='/?'+new URLSearchParams({colecao:'Vinhos',pais:country});
    link.textContent=country;
    return link;
  }));
}

const signupConfirmation = setupSignupConfirmation({ auth: supa.auth, policy: emailPolicy, callback: signupReturn, recovery: recoveryReturn });
const signupFeedback = new Map(['registerForm', 'modalRegisterForm'].map(id => [
  id, bindEmailFeedback(document.getElementById(id), emailPolicy, 'signup'),
]));
const signupPendingMessage = 'Se for possível concluir o cadastro, você receberá as instruções por e-mail. Confira também o spam.';

async function handleRegistration(event, fields) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = document.getElementById(fields.name).value.trim();
  const email = document.getElementById(fields.email).value.trim().toLowerCase();
  const password = document.getElementById(fields.password).value;
  if (name.length < 2) { toast('Informe seu nome completo.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Informe um e-mail válido.'); return; }
  if (!isStrongPassword(password)) {
    toast('Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.');
    return;
  }
  const response = await signupFeedback.get(form.id)(async () => {
    const captchaToken = await requestCaptcha(form, 'signup');
    const { data, error } = await supa.auth.signUp({
      email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin, captchaToken },
    });
    if (['user_already_exists', 'email_exists'].includes(error?.code)) return { kind: 'ok', message: signupPendingMessage };
    if (error) {
      if (error.code === 'weak_password') return { kind: 'error', message: 'A senha foi recusada. Escolha outra e tente novamente.' };
      return { kind: emailErrorKind(error) };
    }
    return { kind: 'ok', signedIn: Boolean(data?.session), message: data?.session
      ? 'Conta criada. Você já está conectado.' : signupPendingMessage };
  }, 'Não foi possível iniciar o cadastro. Confira os dados e tente novamente.');
  if (response.kind !== 'ok') return;
  form.reset();
  if (response.signedIn) {
    toast('Conta criada. Você já está conectado.');
    document.getElementById('accountModal').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await refreshAuth();
  } else {
    signupConfirmation.start(email);
  }
}
document.getElementById('registerForm').onsubmit=e=>handleRegistration(e,{name:'fullName',email:'email',password:'registerPassword'});
document.getElementById('modalRegisterForm').onsubmit=e=>handleRegistration(e,{name:'modalFullName',email:'modalEmail',password:'modalRegisterPassword'});
document.getElementById('loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) {
    toast('Informe e-mail e senha.');
    return;
  }

  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Entrando…';
  form.setAttribute('aria-busy', 'true');
  const modal = document.getElementById('accountModal');
  try {
    const captchaToken = await requestCaptcha(form, 'login');
    const { error } = await supa.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) {
      const message = String(error.message || '').toLowerCase();
      toast(captchaErrorMessage(error) || (
        error.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
        : message.includes('email not confirmed') ? 'Este e-mail ainda não foi confirmado. Verifique sua caixa de entrada.'
        : message.includes('invalid login credentials') ? 'E-mail ou senha incorretos. Se acabou de cadastrar, talvez seja necessário confirmar o e-mail.'
        : 'Não foi possível entrar. Verifique a conexão e tente novamente.'
      ));
      return;
    }

    form.reset();
    if (await refreshAuth()) await finishLogin();
  } catch (error) {
    toast(captchaErrorMessage(error) || 'Não foi possível concluir o acesso. Verifique a conexão e tente novamente.');
  } finally {
    button.disabled = false;
    button.textContent = label;
    form.removeAttribute('aria-busy');
  }
};
async function finishLogin() {
  toast('Login realizado com sucesso.');
  document.getElementById('accountModal').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const params = new URLSearchParams(location.search);
  if (params.get('vendas') === '1') await openSalesPanel(true);
  else if (params.get('admin') === '1' && isAdmin) await openAdminPanel(true);
}

const requestReset = document.getElementById('forgotPasswordForm');
const resetPassword = document.getElementById('setNewPasswordForm');
const sendRecoveryEmail = bindEmailFeedback(requestReset, emailPolicy, 'recovery');
const savePasswordButton = resetPassword.querySelector('[type="submit"]');
const recoveryStatus = document.getElementById('accountStatus');
const recoveryTitle = document.querySelector('#accountModal h2');
const loginForm = document.getElementById('loginForm');
const confirmRecoveryStep = document.getElementById('confirmRecoveryStep');
const confirmRecoveryButton = document.getElementById('confirmRecoveryLink');
let recoveryAuth = null;

function showRecoveryView(title, message) {
  document.getElementById('accountModal').classList.add('open');
  document.getElementById('accountRegister').style.display = 'none';
  document.getElementById('accountSigned').style.display = 'none';
  loginForm.hidden = true;
  recoveryTitle.textContent = title;
  recoveryStatus.textContent = message;
}

function clearRecoveryConfirmation() {
  confirmRecoveryStep.hidden = true;
  confirmRecoveryButton.onclick = null;
}

function restoreLoginView() {
  clearRecoveryConfirmation();
  loginForm.hidden = false;
  recoveryTitle.textContent = 'Login';
}

function openResetRequest(message) {
  clearRecoveryConfirmation();
  if (recoveryOpen) showRecoveryView('Recuperar senha', message);
  else document.getElementById('accountModal').classList.add('open');
  document.getElementById('accountLogin').style.display = 'block';
  document.getElementById('forgotPasswordOpen').hidden = true;
  requestReset.hidden = false;
  if (message) recoveryStatus.textContent = message;
}

async function openNewPasswordForm(auth) {
  recoveryAuth = auth;
  clearRecoveryConfirmation();
  const assurance = await readAssurance(auth);
  if (recoveryAuth !== auth) return;
  if (assurance.state === 'signed-out') {
    mfaChallenge.close(auth);
    recoveryAuth = null;
    showRecoveryFailure();
    return;
  }
  if (assurance.state !== 'ready') {
    resetPassword.hidden = true;
    mfaChallenge.show({
      auth,
      userId: assurance.userId,
      retry: () => openNewPasswordForm(auth),
      verified: () => openNewPasswordForm(auth),
      cancel: closeRecovery,
    });
    return;
  }
  mfaChallenge.close(auth);
  showRecoveryView('Definir nova senha', 'E-mail verificado. Defina sua nova senha.');
  resetPassword.hidden = false;
  document.getElementById('recoveryNewPassword').focus();
}

function showRecoveryFailure(code) {
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found'].includes(code)) {
    openResetRequest('O link expirou ou já foi utilizado. Solicite um novo link.');
  } else if (['pkce_code_verifier_not_found', 'bad_code_verifier'].includes(code)) {
    openResetRequest('Abra o link no mesmo navegador em que pediu a recuperação ou solicite um novo.');
  } else {
    openResetRequest('Não foi possível validar este link. Solicite um novo link de recuperação.');
  }
}

function awaitRecoveryConfirmation(tokenHash) {
  // Opening the page does not consume the token. Email security scanners
  // can preview a link, but verification requires a separate user action.
  showRecoveryView('Recuperar senha', 'Confirme para continuar. Não será necessário informar seu e-mail novamente se o link for válido.');
  confirmRecoveryStep.hidden = false;
  confirmRecoveryButton.onclick = async () => {
    if (recoveryStarting || !tokenHash) return;
    recoveryStarting = true;
    confirmRecoveryButton.disabled = true;
    const credential = tokenHash;
    tokenHash = null;
    try {
      const auth = getRecoveryClient();
      const { data, error } = await auth.verifyOtp({ token_hash: credential, type: 'recovery' });
      if (!error && data?.session?.user?.id) await openNewPasswordForm(auth);
      else showRecoveryFailure(error?.code);
    } catch {
      showRecoveryFailure();
    } finally {
      recoveryStarting = false;
      confirmRecoveryButton.disabled = false;
    }
  };
}

document.getElementById('forgotPasswordOpen').onclick = () => {
  document.getElementById('forgotEmail').value = document.getElementById('loginEmail').value.trim();
  openResetRequest();
};
document.getElementById('cancelPasswordRecovery').onclick = () => {
  requestReset.hidden = true;
  document.getElementById('forgotPasswordOpen').hidden = false;
  if (recoveryOpen) {
    recoveryOpen = false;
    restoreLoginView();
    refreshAuth().catch(() => {});
  }
};
requestReset.onsubmit = async event => {
  event.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('Informe um e-mail válido.');
    return;
  }
  await sendRecoveryEmail(async () => {
    const captchaToken = await requestCaptcha(requestReset, 'recover');
    const { error } = await getRecoveryClient().resetPasswordForEmail(email, { redirectTo: recoveryUrl.href, captchaToken });
    if (error && error.code !== 'user_not_found') return { kind: emailErrorKind(error) };
    return { kind: 'ok', message: 'Se for possível recuperar a conta, você receberá um link. Confira também o spam.' };
  }, 'Não foi possível solicitar o link de recuperação. Tente novamente mais tarde.');
};

async function closeRecovery() {
  const auth = recoveryAuth;
  recoveryAuth = null;
  mfaChallenge.close(auth);
  resetPassword.reset();
  resetPassword.hidden = true;
  requestReset.hidden = true;
  document.getElementById('forgotPasswordOpen').hidden = false;
  restoreLoginView();
  if (auth) {
    try { await auth.signOut({ scope: 'local' }); } catch { /* Best effort. */ }
  }
  recoveryOpen = false;
  await refreshAuth();
}

resetPassword.onsubmit = async event => {
  event.preventDefault();
  if (!recoveryAuth || savePasswordButton.disabled) return;
  const password = document.getElementById('recoveryNewPassword').value;
  const confirm = document.getElementById('recoveryConfirmPassword').value;
  if (!isStrongPassword(password) || new TextEncoder().encode(password).length > 72) {
    toast('Use 8 ou mais caracteres, até 72 bytes, com maiúscula, minúscula, número e símbolo.');
    return;
  }
  if (password !== confirm) {
    toast('As senhas não coincidem.');
    return;
  }
  savePasswordButton.disabled = true;
  try {
    const { error } = await recoveryAuth.updateUser({ password });
    if (error) {
      if (error.code === 'insufficient_aal') await openNewPasswordForm(recoveryAuth);
      else if (error.code === 'same_password') toast('Escolha uma senha diferente da anterior.');
      else if (error.code === 'weak_password') toast('A senha foi recusada. Escolha outra e tente novamente.');
      else toast('Não foi possível atualizar a senha. Tente novamente ou solicite outro link.');
      return;
    }
    await closeRecovery().catch(() => {});
    if (!currentUser) recoveryStatus.textContent = 'Senha redefinida. Entre usando a nova senha.';
    toast('Senha redefinida. Use a nova senha no próximo acesso.');
  } catch {
    toast('Não foi possível atualizar a senha agora. Tente novamente.');
  } finally {
    savePasswordButton.disabled = false;
  }
};

document.getElementById('logoutBtn').onclick=async()=>{const {error}=await supa.auth.signOut();if(error){toast(error.message);return;}toast('Você saiu da sua conta.');await refreshAuth();};
document.getElementById('accountBtn').onclick=async()=>{
  await refreshAuth();
  if (mfaChallenge.isOpen() || mfaEnrollmentUserId || signupConfirmation.showIfPending()) return;
  document.getElementById('accountModal').classList.add('open');
};
const menuToggle=document.getElementById('mobileMenuToggle');
menuToggle.onclick=()=>{const links=document.getElementById('siteLinks');const open=links.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));menuToggle.textContent=open?'Fechar':'Menu';};
document.querySelectorAll('#siteLinks a').forEach(link=>link.addEventListener('click',()=>{if(currentCollection)closeCollection();document.getElementById('siteLinks').classList.remove('open');menuToggle.setAttribute('aria-expanded','false');menuToggle.textContent='Menu';}));
document.querySelector('.logo').addEventListener('click',e=>{if(currentCollection){e.preventDefault();closeCollection();window.scrollTo({top:0,behavior:'smooth'});}});
function dismissAccountModal() {
  if (recoveryStarting || savePasswordButton.disabled || mfaChallenge.isOpen() || mfaEnrollmentUserId) return;
  mfaSettings.close();
  document.getElementById('accountModal').classList.remove('open');
  if (recoveryOpen) closeRecovery().catch(() => {});
}
document.getElementById('closeModal').onclick = dismissAccountModal;
document.getElementById('accountModal').onclick = event => {
  if (event.target.id === 'accountModal') dismissAccountModal();
};

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function slugify(v){return String(v||'produto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'produto';}
async function loadStoreSettings(){
 const {data,error}=await supa.from('store_settings').select('store_name,announcement,whatsapp,opening_hours').eq('id',true).maybeSingle();
 if(error||!data)return; WA=data.whatsapp||WA;
 document.getElementById('announcementBar').textContent=data.announcement||'Empório Milão · Goiânia, GO';
 document.title=(data.store_name||'Empório Milão')+' — Curadoria para bons momentos';
 const hours=document.getElementById('hoursList');if(hours&&data.opening_hours){hours.innerHTML=data.opening_hours.split('|').map(line=>{const i=line.indexOf(':');return i>0?'<div class="hours-row"><span>'+escapeHtml(line.slice(0,i).trim())+'</span><b>'+escapeHtml(line.slice(i+1).trim())+'</b></div>':'<div class="hours-row">'+escapeHtml(line.trim())+'</div>';}).join('');}
}
function closeAdminPage(){
 stopAdminRefresh();
 document.getElementById('adminContent').replaceChildren();
 document.body.classList.remove('admin-mode','sales-mode');document.getElementById('adminPage').hidden=true;document.getElementById('adminRefresh').style.display='';const salesTitle=document.querySelector('.admin-title-row h1'),salesSubtitle=document.querySelector('.admin-title-row p');if(salesTitle)salesTitle.textContent='Painel administrativo';if(salesSubtitle)salesSubtitle.textContent='Visão financeira, pedidos, pagamentos e movimentação do galpão.';
 const p=new URLSearchParams(location.search);p.delete('admin');p.delete('vendas');history.pushState({},'',location.pathname+(p.toString()?'?'+p.toString():'')+location.hash);
}
async function openAdminPanel(fromRoute=false){
 if(recoveryOpen)return;
 const session = await refreshAuth();
 if(mfaChallenge.isOpen() || mfaEnrollmentUserId)return;
 if(!session?.user){toast('Entre com a conta administrativa para continuar.');document.getElementById('accountModal').classList.add('open');return;}
 const {data:allowed,error}=await supa.rpc('is_admin');isAdmin=!error&&allowed===true;
 if(!isAdmin){toast(error?'Não foi possível validar o acesso.':'Esta conta não possui permissão administrativa.');return;}
 document.getElementById('accountModal').classList.remove('open');
 document.body.classList.add('admin-mode');document.getElementById('adminPage').hidden=false;
 if(!fromRoute){const p=new URLSearchParams(location.search);p.delete('vendas');p.set('admin','1');history.pushState({admin:true},'',location.pathname+'?'+p.toString());}
 document.getElementById('adminIdentity').textContent=session.user.email||'Administrador';await loadAdminDashboard();
}

async function openSalesPanel(fromRoute=false){
 if(recoveryOpen)return;
 const session = await refreshAuth();
 if(mfaChallenge.isOpen() || mfaEnrollmentUserId)return;
 if(!session?.user){document.getElementById('accountModal').classList.add('open');toast('Entre com o e-mail autorizado pela administração para lançar vendas.');return;}
 const {data:allowed,error}=await supa.rpc('is_sales_staff');
 if(error||allowed!==true){toast('Este e-mail não possui acesso ao lançamento de vendas. Solicite liberação ao administrador.');return;}
 document.getElementById('accountModal').classList.remove('open');
 stopAdminRefresh();
 document.body.classList.add('admin-mode','sales-mode');document.getElementById('adminPage').hidden=false;
 const salesTitle=document.querySelector('.admin-title-row h1'),salesSubtitle=document.querySelector('.admin-title-row p');if(salesTitle)salesTitle.textContent='Central de atendimento';if(salesSubtitle)salesSubtitle.textContent='Consulte produtos, monte orçamentos e registre pedidos diretamente no financeiro da loja.';document.getElementById('adminRefresh').style.display='none';
 document.getElementById('adminIdentity').textContent=session.user.email||'Atendimento';
 document.getElementById('adminContent').innerHTML='<p>Preparando o lançamento de vendas...</p>';
 if(!fromRoute){const p=new URLSearchParams(location.search);p.delete('admin');p.set('vendas','1');history.pushState({sales:true},'',location.pathname+'?'+p.toString());}
 await renderSalesWorkspace();
}
async function renderSalesWorkspace(){
 const root=document.getElementById('adminContent');
 const [storesRes,productsRes,branchStockRes]=await Promise.all([
  supa.from('store_locations').select('id,name').eq('active',true).order('name'),
  supa.from('products').select('id,name,category,price').eq('active',true).order('name'),
  supa.from('store_inventory').select('store_id,product_id,quantity')
 ]);
 if(storesRes.error||productsRes.error||branchStockRes.error){root.innerHTML='<div class="admin-empty">Não foi possível carregar unidades e produtos. '+escapeHtml(storesRes.error?.message||productsRes.error?.message||branchStockRes.error?.message||'')+'</div>';return;}
 const stores=storesRes.data||[],itemsCatalog=productsRes.data||[],branchStock=branchStockRes.data||[];
 if(!stores.length||!itemsCatalog.length){root.innerHTML='<div class="admin-empty">Cadastre unidades e produtos antes de lançar vendas.</div>';return;}
 let lines=[];
 let selectedLine = null;
 let receiptOrderId = null;
 const receiptSellerId = currentUser.id;
 const getAvailable=(productId,storeId)=>Number(branchStock.find(x=>x.product_id===productId&&x.store_id===storeId)?.quantity||0);
 root.innerHTML = `
   <form id="assistedSaleForm" class="sale-desk admin-form">
     <div class="sale-console">
       <section class="sale-ticket" aria-label="Lançamento de produtos">
         <div class="sale-entry">
           <label>Produto<input id="saleProductSearch" type="search" placeholder="Buscar nome ou código"></label>
           <label>Quantidade<input id="saleQty" type="number" min="1" max="500" value="1"></label>
           <label>Valor unitário (R$)<input id="saleUnitPrice" type="number" min="0.01" step="0.01"></label>
           <button type="button" id="saleAddItem">Adicionar</button>
           <select id="saleProduct" aria-label="Produto do catálogo">${itemsCatalog.map(p=>'<option value="'+escapeHtml(p.id)+'" data-price="'+Number(p.price)+'">'+escapeHtml(p.name)+'</option>').join('')}</select>
           <small id="saleStockHint"></small>
         </div>
         <h2>Venda em transação</h2>
         <div id="saleLines" class="admin-table-wrap"></div>
       </section>
       <aside class="sale-summary" aria-label="Resumo da venda">
         <div class="sale-display"><div id="saleCount"></div><h2>Valor total</h2>
           <strong id="saleGrandTotal" aria-live="polite"></strong></div>
         <div id="saleTotals"></div>
         <div class="sale-brand"><img src="/src/images/logo-emporio-milao.jpg" alt="" width="76" height="76"><span>Empório Milão<small>PRIME · GOIÂNIA</small></span></div>
       </aside>
       <nav class="sale-commands" aria-label="Comandos da venda">
         <button type="button" data-sale-focus="saleProductSearch"><kbd>F2</kbd> Produto</button>
         <button type="button" data-sale-focus="saleQty"><kbd>F4</kbd> Quantidade</button>
         <button type="button" data-sale-key="F6"><kbd>F6</kbd> Excluir produto</button>
         <button type="button" data-sale-key="F7"><kbd>F7</kbd> Retirar quantidade</button>
         <button type="button" data-sale-focus="saleCustomer"><kbd>F8</kbd> Fechar venda</button>
         <button type="button" id="salePrint" aria-keyshortcuts="F9" disabled><kbd>F9</kbd> Imprimir cupom</button>
         <button type="button" data-sale-key="F10"><kbd>F10</kbd> Pedidos e cupons</button>
         <button type="button" data-sale-key="F3"><kbd>F3</kbd> Cancelar compra</button>
         <label>Unidade <select id="saleStore" required>${stores.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join('')}</select></label>
       </nav>
     </div>
     <section class="admin-section sale-checkout">
       <h2>Fechamento da venda</h2>
       <div class="admin-form-grid"><label>Nome do cliente<input id="saleCustomer" required minlength="2" maxlength="120" placeholder="Nome completo"></label>
       <label>WhatsApp do cliente<input id="salePhone" required type="tel" placeholder="(62) 99999-9999"></label>
       <label>Endereço de entrega ou retirada<input id="saleAddress" required minlength="8" maxlength="300" placeholder="Endereço completo ou identificação da retirada"></label>
       <label>Forma de pagamento<select id="salePayment"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao_entrega">Cartão na entrega</option></select></label>
       <label>Confirmação do pagamento<select id="salePaymentStatus"><option value="pending">Pendente — ainda não recebido</option><option value="paid">Pago — recebido e conferido</option></select></label></div>
       <h3>Descontos e observações</h3>
       <div class="admin-form-grid"><label>Desconto adicional no pedido (R$)<input id="saleOrderDiscount" type="number" min="0" step="0.01" value="0"></label><label id="saleStandardDiscountWrap" style="display:none">Compra acima de R$ 1.000,00: aplicar 3% de desconto?<select id="saleStandardDiscount"><option value="0">Não aplicar desconto</option><option value="3">Sim, aplicar 3%</option></select></label>
       <label>Desconto maior que 3% (opcional)<input id="saleCustomDiscountPercent" type="number" min="3.01" max="100" step="0.5" placeholder="Ex.: 5"></label>
       <label>Senha para autorizar desconto maior<input id="saleDiscountPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Senha de autorização"></label>
       <label>Observações<input id="saleNotes" maxlength="300" placeholder="Detalhes de entrega, negociação..."></label></div>
       <button class="admin-primary" type="submit">Registrar pedido e reservar estoque</button>
     </section>
   </form>
   <section class="admin-section"><h2 id="saleHistory" tabindex="-1">Meus pedidos e cupons recentes</h2><div id="mySalesList">Carregando vendas...</div></section>`;
 const productSelect=document.getElementById('saleProduct'),priceInput=document.getElementById('saleUnitPrice'),storeSelect=document.getElementById('saleStore');
 const saleSearch=document.getElementById('saleProductSearch');saleSearch.addEventListener('input',()=>{const q=saleSearch.value.trim().toLocaleLowerCase('pt-BR'),selected=productSelect.value,filtered=itemsCatalog.filter(p=>(p.name+' '+p.category+' '+p.id).toLocaleLowerCase('pt-BR').includes(q));productSelect.innerHTML=filtered.map(p=>'<option value="'+escapeHtml(p.id)+'" data-price="'+Number(p.price)+'">'+escapeHtml(p.name)+' · '+brl(Number(p.price))+'</option>').join('');if(filtered.some(p=>p.id===selected))productSelect.value=selected;setDefaultPrice();});
 const updateStockHint=()=>{const available=getAvailable(productSelect.value,storeSelect.value),already=lines.filter(x=>x.id===productSelect.value).reduce((n,x)=>n+x.quantity,0);document.getElementById('saleStockHint').textContent='Saldo disponível na unidade selecionada: '+Math.max(0,available-already)+' unidade(s)';};
 const setDefaultPrice=()=>{const opt=productSelect.selectedOptions[0];priceInput.value=Number(opt?.dataset.price||0).toFixed(2);updateStockHint();};
 setDefaultPrice();productSelect.onchange=setDefaultPrice;storeSelect.onchange=updateStockHint;
 const renderLines=()=>{
  const el=document.getElementById('saleLines');
  if (!lines.includes(selectedLine)) selectedLine = lines.at(-1) || null;

  const subtotal=lines.reduce((s,x)=>s+x.listPrice*x.quantity,0),lineDiscount=lines.reduce((s,x)=>s+(x.listPrice-x.unitPrice)*x.quantity,0),extra=Math.max(0,Number(document.getElementById('saleOrderDiscount').value)||0),customPercent=Number(document.getElementById('saleCustomDiscountPercent').value)||0,standardWrap=document.getElementById('saleStandardDiscountWrap'),standardSelect=document.getElementById('saleStandardDiscount');standardWrap.style.display=subtotal>=1000?'':'none';if(subtotal<1000)standardSelect.value='0';const discountPercent=customPercent>0?customPercent:Number(standardSelect.value)||0,percentBase=Math.max(0,subtotal-lineDiscount-extra),percentDiscount=Math.round(percentBase*discountPercent)/100,total=subtotal-lineDiscount-extra-percentDiscount;
  el.innerHTML = `<table class="admin-table"><thead><tr>
    <th>Seq.</th><th>Código</th><th>Descrição</th><th>Und.</th><th>Qtde.</th><th>V. unit.</th><th>Total</th><th>Ação</th>
    </tr></thead><tbody>${lines.map((line, index) => `<tr>
      <td><label class="sale-line-choice"><input type="radio" name="saleLine" value="${index}" ${line === selectedLine ? 'checked' : ''} aria-label="Selecionar ${escapeHtml(line.name)}">${index+1}</label></td><td class="sale-code" title="${escapeHtml(line.id)}">${escapeHtml(line.id)}</td>
      <td>${escapeHtml(line.name)}</td><td>UN</td><td>${line.quantity}</td>
      <td>${brl(line.unitPrice)}</td><td>${brl(line.unitPrice*line.quantity)}</td>
      <td><button type="button" data-remove-sale-line="${index}" aria-label="Remover ${escapeHtml(line.name)}">Remover</button></td>
    </tr>`).join('')}</tbody></table>`;
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  el.onchange = event => {
    if (event.target.name === 'saleLine') selectedLine = lines[Number(event.target.value)];
  };
  document.getElementById('saleCount').textContent = 'Itens: ' + lines.length + '  /  Quantidade: ' + units;
  document.getElementById('saleGrandTotal').textContent = brl(Math.max(0,total));
  document.getElementById('saleTotals').innerHTML = '<p>Subtotal <b>'+brl(subtotal)+'</b></p><p>Descontos <b>'+brl(lines.length ? lineDiscount+extra+percentDiscount : 0)+'</b></p>';
  el.querySelectorAll('[data-remove-sale-line]').forEach(b=>b.onclick=()=>{lines.splice(Number(b.dataset.removeSaleLine),1);renderLines();updateStockHint();});
 };
 document.getElementById('saleAddItem').onclick=()=>{
  const id=productSelect.value,p=itemsCatalog.find(x=>x.id===id),quantity=Number(document.getElementById('saleQty').value),unitPrice=Number(priceInput.value);
  if(!p||!Number.isInteger(quantity)||quantity<1||quantity>500||!Number.isFinite(unitPrice)||unitPrice<=0||unitPrice>Number(p.price)){toast('Confira a quantidade e o preço negociado. O preço não pode superar o preço cadastrado.');return;}
  const found=lines.find(x=>x.id===id);
  const available=getAvailable(id,storeSelect.value),already=lines.filter(x=>x.id===id).reduce((n,x)=>n+x.quantity,0);if(already+quantity>available){toast('Estoque insuficiente nesta unidade. Disponível: '+available+'.');return;}
  if(found){if(found.unitPrice!==unitPrice){toast('Este produto já está na venda com outro preço unitário. Remova a linha anterior para alterar o preço.');return;}found.quantity+=quantity;}else lines.push({id,name:p.name,quantity,unitPrice,listPrice:Number(p.price)});
  selectedLine = found || lines.at(-1);
  renderLines();updateStockHint();
 };
 document.getElementById('saleOrderDiscount').oninput=renderLines;document.getElementById('saleStandardDiscount').onchange=()=>{if(Number(document.getElementById('saleStandardDiscount').value)>0)document.getElementById('saleCustomDiscountPercent').value='';renderLines();};document.getElementById('saleCustomDiscountPercent').oninput=()=>{if(Number(document.getElementById('saleCustomDiscountPercent').value)>0)document.getElementById('saleStandardDiscount').value='0';renderLines();};
 document.getElementById('assistedSaleForm').onsubmit=async e=>{
  e.preventDefault();if(!lines.length){toast('Adicione pelo menos um produto.');return;}
  const subtotal=lines.reduce((s,x)=>s+x.listPrice*x.quantity,0),lineDiscount=lines.reduce((s,x)=>s+(x.listPrice-x.unitPrice)*x.quantity,0),extra=Number(document.getElementById('saleOrderDiscount').value)||0,customPercent=Number(document.getElementById('saleCustomDiscountPercent').value)||0,standardPercent=Number(document.getElementById('saleStandardDiscount').value)||0,discountPercent=customPercent>0?customPercent:standardPercent,discountPin=document.getElementById('saleDiscountPin').value;
  if(extra<0||extra+lineDiscount>subtotal){toast('O desconto não pode superar o subtotal.');return;}if(standardPercent===3&&subtotal<1000){toast('O desconto de 3% só pode ser aplicado em compras a partir de R$ 1.000,00.');return;}if(customPercent>0&&(!Number.isFinite(customPercent)||customPercent<=3||customPercent>100||!discountPin)){toast('Para aplicar desconto maior que 3%, informe um percentual válido e a senha de autorização.');return;}
  const button=e.currentTarget.querySelector('button[type=submit]');button.disabled=true;button.textContent='Registrando venda...';
  const {data,error}=await supa.rpc('create_assisted_sale',{p_customer_name:document.getElementById('saleCustomer').value.trim(),p_customer_phone:document.getElementById('salePhone').value.trim(),p_delivery_address:document.getElementById('saleAddress').value.trim(),p_payment_method:document.getElementById('salePayment').value,p_payment_status:document.getElementById('salePaymentStatus').value,p_store_id:document.getElementById('saleStore').value,p_items:lines.map(x=>({id:x.id,quantity:x.quantity,unit_price:x.unitPrice})),p_order_discount:extra,p_discount_percent:discountPercent,p_discount_pin:discountPercent>3?discountPin:null,p_notes:document.getElementById('saleNotes').value.trim()||null});
  button.disabled=false;button.textContent='Registrar pedido e reservar estoque';
  if(error){toast('Venda não registrada: '+error.message);return;}
  receiptOrderId = data;
  printButton.disabled = false;
  printButton.focus();
  toast('Venda registrada! Pedido #'+String(data).slice(0,8)+'.');lines=[];document.getElementById('assistedSaleForm').reset();document.getElementById('saleStandardDiscountWrap').style.display='none';setDefaultPrice();renderLines();await loadMySales();
 };
 const commands = root.querySelector('.sale-commands');
 const printButton = document.getElementById('salePrint');
 const printOrder = async (id, button) => {
   button.disabled = true;
   try {
     await printSaleReceipt(supa, receiptSellerId, id, () =>
       commands.isConnected && document.body.classList.contains('sales-mode') && currentUser?.id === receiptSellerId);
   } catch {
     toast('Não foi possível carregar o cupom. Tente imprimir novamente.');
   } finally {
     button.disabled = false;
   }
 };
 document.getElementById('mySalesList').onclick = event => {
   const button = event.target.closest('[data-sale-receipt]');
   if (button) printOrder(button.dataset.saleReceipt, button);
 };
 printButton.onclick = async () => {
   if (lines.length) { toast('Feche a venda atual antes de imprimir o cupom.'); return; }
   if (!receiptOrderId || printButton.disabled) return;
   await printOrder(receiptOrderId, printButton);
 };
 const focusSaleField = id => {
   const input = document.getElementById(id);
   input.focus();
   if (input.select) input.select();
 };
 commands.querySelectorAll('[data-sale-focus]').forEach(button => {
   button.onclick = () => focusSaleField(button.dataset.saleFocus);
 });
 const shortcuts = {F2: 'saleProductSearch', F4: 'saleQty', F8: 'saleCustomer'};
 const form = document.getElementById('assistedSaleForm');
 const runSaleCommand = key => {
   if (form.querySelector('[type=submit]').disabled) return;
   if (key === 'F10') {
     document.getElementById('saleHistory').focus();
     return;
   }
   if (key === 'F3') {
     if (!window.confirm('Cancelar toda a compra em andamento e limpar os dados deste atendimento?')) return;
     const store = storeSelect.value;
     form.reset();
     storeSelect.value = store;
     lines = [];
     saleSearch.dispatchEvent(new Event('input'));
     renderLines();
     focusSaleField('saleProductSearch');
     return;
   }
   if (!selectedLine) { toast('Selecione um produto da venda.'); return; }
   let quantity = selectedLine.quantity;
   if (key === 'F7') {
     const answer = window.prompt('Quantas unidades de ' + selectedLine.name + ' deseja retirar? Disponível na venda: ' + quantity, '1');
     if (answer === null) return;
     const requested = Number(answer);
     if (!Number.isInteger(requested) || requested < 1 || requested > quantity) {
       toast('Informe uma quantidade inteira entre 1 e ' + quantity + '.');
       return;
     }
     quantity = requested;
   }
   selectedLine.quantity -= quantity;
   if (!selectedLine.quantity) lines.splice(lines.indexOf(selectedLine), 1);
   renderLines();
   updateStockHint();
   focusSaleField('saleProductSearch');
 };
 const actionButtons = new Map();
 for (const button of commands.querySelectorAll('[data-sale-key]')) {
   const key = button.dataset.saleKey;
   actionButtons.set(key, button);
   button.setAttribute('aria-keyshortcuts', key);
   button.onclick = () => runSaleCommand(key);
 }
 root.onkeydown = event => {
   if (!document.body.classList.contains('sales-mode') || !commands.isConnected) return;
   if (event.altKey || event.ctrlKey || event.metaKey) return;
   if (actionButtons.has(event.key)) {
     event.preventDefault();
     if (!event.repeat) actionButtons.get(event.key).click();
   } else if (event.key === 'F9') {
     event.preventDefault();
     if (!receiptOrderId) toast('Registre a venda para imprimir o cupom.');
     else if (!event.repeat) printButton.click();
   } else if (shortcuts[event.key]) {
     event.preventDefault();
     focusSaleField(shortcuts[event.key]);
   } else if (event.key === 'Enter' && event.target.closest('.sale-entry') && event.target.tagName === 'INPUT') {
     event.preventDefault();
     document.getElementById('saleAddItem').click();
   }
 };
 focusSaleField('saleProductSearch');
 renderLines();
 await loadMySales();
}
async function loadMySales(){
 const el=document.getElementById('mySalesList');if(!el)return;
 const {data,error}=await supa.from('orders').select('id,customer_name,total_amount,payment_status,created_at,store_locations(name),order_items(product_name,quantity,unit_price,discount_amount)').eq('seller_user_id',currentUser.id).order('created_at',{ascending:false}).limit(30);
 if(error){el.textContent='Não foi possível carregar as vendas recentes.';return;}
 el.innerHTML=(data||[]).map(o=>'<article class="admin-order-card"><b>Pedido #'+escapeHtml(o.id.slice(0,8))+' · '+brl(Number(o.total_amount))+'</b><small>'+new Date(o.created_at).toLocaleString('pt-BR')+' · '+escapeHtml(o.customer_name)+' · '+escapeHtml(o.store_locations?.name||'Unidade')+'</small><p>'+escapeHtml((o.order_items||[]).map(i=>i.quantity+'× '+i.product_name+' · '+brl(Number(i.unit_price))+' un.').join(' | '))+'</p><span class="admin-pill">'+(o.payment_status==='paid'?'Pago':'Pendente')+'</span><button type="button" class="admin-secondary" data-sale-receipt="'+escapeHtml(o.id)+'">Imprimir cupom</button></article>').join('')||'<p>Nenhuma venda lançada por este usuário.</p>';
}

function isAdminDashboardOpen() {
 return document.body.classList.contains('admin-mode') && !document.body.classList.contains('sales-mode')
   && !document.getElementById('adminPage').hidden;
}

function setAdminPollStatus(message = '') {
 const status = document.getElementById('adminPollStatus');
 status.textContent = message;
 status.hidden = !message;
}

function pauseAdminRefresh() {
 clearTimeout(adminRefreshTimer);
 adminRefreshTimer = null;
}

function stopAdminRefresh() {
 pauseAdminRefresh();
 adminRefreshDueAt = null;
 adminDashboardRequest++;
 setAdminPollStatus();
}

function canRefreshAdminOrders() {
 return ['orders', 'finance'].includes(activeAdminArea) &&
   !document.activeElement?.closest('#adminContent form, #adminContent select');
}

function scheduleAdminRefresh() {
 if (!isAdminDashboardOpen()) return;
 adminRefreshDueAt ??= Date.now() + adminRefreshInterval;
 if (document.hidden || adminRefreshInFlight || adminRefreshTimer !== null) return;
 adminRefreshTimer = setTimeout(refreshAdminOnTimer, Math.max(0, adminRefreshDueAt - Date.now()));
}

async function refreshAdminOnTimer() {
 adminRefreshTimer = null;
 if (!isAdminDashboardOpen() || document.hidden) return;
 adminRefreshInFlight = true;
 const dueAt = adminRefreshDueAt;
 let renewed = false;
 try {
  const { data, error } = await supa.rpc('is_admin');
  if (!isAdminDashboardOpen() || adminRefreshDueAt !== dueAt) return;
  if (error || data !== true) {
   closeAdminPage();
   if (error) toast('Não foi possível confirmar a autorização do painel.');
   await refreshAuth();
   return;
  }
  renewed = true;
  if (!document.hidden && canRefreshAdminOrders()) await loadAdminDashboard({background:true});
 } catch {
  if (!isAdminDashboardOpen() || adminRefreshDueAt !== dueAt) return;
  if (!renewed) {
   closeAdminPage();
   toast('Não foi possível confirmar a autorização do painel.');
  } else setAdminPollStatus('Não foi possível atualizar os pedidos. Nova tentativa em instantes.');
 } finally {
  adminRefreshInFlight = false;
  if (adminRefreshDueAt === dueAt) adminRefreshDueAt = Date.now() + adminRefreshInterval;
  scheduleAdminRefresh();
 }
}

function resumeAdminRefresh() {
 pauseAdminRefresh();
 scheduleAdminRefresh();
}
document.addEventListener('visibilitychange', () => {
 if (document.hidden) pauseAdminRefresh();
 else resumeAdminRefresh();
});
window.addEventListener('focus', resumeAdminRefresh);

async function loadAdminDashboard({background = false} = {}){
 if (!isAdminDashboardOpen()) return;
 scheduleAdminRefresh();
 const content=document.getElementById('adminContent');
 const request = ++adminDashboardRequest;
 const area = activeAdminArea;
 if (!background) content.innerHTML='<p>Carregando dados do negócio...</p>';
 const [summary,or,pr,cr,ir,mr,storesRes,storeInvRes,storeMovesRes,staffRes]=await Promise.all([
  supa.rpc('admin_finance_summary'),
  supa.from('orders').select('id,customer_name,customer_phone,delivery_address,payment_method,payment_status,status,total_amount,subtotal_amount,discount_amount,sales_channel,seller_name,seller_email,store_id,created_at,store_locations(name),order_items(product_name,quantity,unit_price,list_unit_price,discount_amount,line_total)').order('created_at',{ascending:false}).limit(250),
  supa.from('profiles').select('id,full_name,phone,created_at').order('created_at',{ascending:false}).limit(500),
  supa.from('products').select('id,name,category,country,price,compare_at_price,promotion_day,description,active,image_url,image_alt').order('name'),
  supa.from('inventory').select('product_id,quantity,updated_at'),
  supa.from('inventory_movements').select('id,product_id,movement_type,quantity,note,created_at,products(name)').order('created_at',{ascending:false}).limit(60),
  supa.from('store_locations').select('id,name,active').order('name'),
  supa.from('store_inventory').select('store_id,product_id,quantity,updated_at'),
  supa.from('store_inventory_movements').select('id,store_id,product_id,movement_type,quantity,note,created_at,store_locations(name),products(name)').order('created_at',{ascending:false}).limit(80),
  supa.rpc('admin_list_sales_staff')
 ]);
 if (request !== adminDashboardRequest || !isAdminDashboardOpen()) return;
 if (background && (document.hidden || activeAdminArea !== area || !canRefreshAdminOrders())) return;
 const failure=[summary,or,pr,cr,ir,mr,storesRes,storeInvRes,storeMovesRes,staffRes].find(x=>x.error);
 if (failure) {
  if (background) setAdminPollStatus('Não foi possível atualizar os pedidos. Nova tentativa em instantes.');
  else content.innerHTML='<div class="admin-empty">Não foi possível carregar os dados: '+escapeHtml(failure.error.message)+'</div>';
  return;
 }
 setAdminPollStatus();
 const stats=summary.data||{},orders=or.data||[],profiles=pr.data||[],productRows=cr.data||[],inventory=ir.data||[],movements=mr.data||[],stores=storesRes.data||[],storeInventory=storeInvRes.data||[],storeMovements=storeMovesRes.data||[],salesStaff=staffRes.data||[];
 const stock={};inventory.forEach(x=>stock[x.product_id]=Number(x.quantity));
 const methodLabels={pix:'Pix',dinheiro:'Dinheiro',cartao_entrega:'Cartão na entrega'};
 const paymentLabels={pending:'Não pago',paid:'Pago',failed:'Falhou',refunded:'Estornado'};
 const orderLabels={received:'Recebido',confirmed:'Confirmado',preparing:'Em preparação',out_for_delivery:'Saiu para entrega',completed:'Concluído',cancelled:'Cancelado'};
 const methods=(stats.payment_methods||[]).map(x=>'<div class="admin-method"><small>'+escapeHtml(methodLabels[x.method]||x.method||'Outro')+'</small><b>'+brl(Number(x.amount))+'</b><small>'+Number(x.orders)+' pagamento(s) confirmado(s)</small></div>').join('')||'<div class="admin-empty">Nenhum pagamento confirmado.</div>';
 const ordersHtml=orders.map(o=>{
  const items=(o.order_items||[]).map(i=>'<li>'+escapeHtml(i.quantity+'× '+i.product_name)+' · Unitário: '+brl(Number(i.list_unit_price||i.unit_price))+(Number(i.discount_amount)>0?' · Desconto: '+brl(Number(i.discount_amount)):'')+' · Total: '+brl(Number(i.line_total||i.quantity*i.unit_price))+'</li>').join('');
  const channel=o.sales_channel==='whatsapp'?'Venda assistida · WhatsApp':'Pedido pelo site';
  const store=o.store_locations?.name||'Unidade não definida / venda online';
  const seller=o.seller_name?(' · Atendente: '+escapeHtml(o.seller_name)+' ('+escapeHtml(o.seller_email||'')+')'):'';
  return '<article class="admin-order-card"><div class="admin-order-head"><b>Pedido #'+escapeHtml(o.id.slice(0,8))+' · '+brl(Number(o.total_amount))+'</b><span class="admin-pill">'+escapeHtml(paymentLabels[o.payment_status]||'Não pago')+'</span></div><small>'+new Date(o.created_at).toLocaleString('pt-BR')+' · '+escapeHtml(o.customer_name)+' · '+escapeHtml(o.customer_phone)+'</small><p><b>Origem:</b> '+channel+'<br><b>Unidade de saída:</b> '+escapeHtml(store)+seller+'<br><b>Entrega/retirada:</b> '+escapeHtml(o.delivery_address)+'<br><b>Pagamento:</b> '+escapeHtml(methodLabels[o.payment_method]||o.payment_method||'—')+'</p><details><summary>Detalhamento financeiro e itens</summary><p>Subtotal: '+brl(Number(o.subtotal_amount||o.total_amount))+'<br>Descontos totais: '+brl(Number(o.discount_amount||0))+'<br><b>Valor final: '+brl(Number(o.total_amount))+'</b></p><ul>'+items+'</ul></details><div class="admin-order-controls"><label>Andamento<select data-order-status="'+escapeHtml(o.id)+'">'+Object.entries(orderLabels).map(([v,l])=>'<option value="'+v+'" '+(o.status===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Pagamento<select data-payment-status="'+escapeHtml(o.id)+'">'+Object.entries(paymentLabels).map(([v,l])=>'<option value="'+v+'" '+((o.payment_status||'pending')===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label></div></article>';
 }).join('')||'<div class="admin-empty">Nenhum pedido registrado até agora.</div>';
 const productOptions=productRows.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.name)+'</option>').join('');
 const stockRows=productRows.map(p=>{const qty=stock[p.id]??0;const updated=inventory.find(x=>x.product_id===p.id)?.updated_at||p.created_at;return '<tr><td><b>'+escapeHtml(p.name)+'</b><br><small>'+escapeHtml(p.category||'')+'</small></td><td>'+(p.active?'Publicado':'Oculto')+'</td><td><strong class="'+(qty<=3?'admin-stock-low':'admin-stock-ok')+'">'+qty+'</strong></td><td>'+new Date(updated).toLocaleDateString('pt-BR')+'</td></tr>';}).join('')||'<tr><td colspan="4">Nenhum produto cadastrado.</td></tr>';
 const movementNames={entrada:'Entrada',saida:'Saída',ajuste:'Ajuste'};
 const movementRows=movements.map(m=>'<tr><td>'+new Date(m.created_at).toLocaleString('pt-BR')+'</td><td>'+escapeHtml(m.products?.name||m.product_id)+'</td><td>'+escapeHtml(movementNames[m.movement_type]||m.movement_type)+'</td><td>'+m.quantity+'</td><td>'+escapeHtml(m.note||'—')+'</td></tr>').join('')||'<tr><td colspan="5">Nenhuma movimentação registrada.</td></tr>';
 const productAdminRows=productRows.map(p=>'<tr><td><div class="admin-product-cell">'+(p.image_url?'<img src="'+escapeHtml(p.image_url)+'" alt="" loading="lazy">':'<span class="admin-product-placeholder">M</span>')+'<b>'+escapeHtml(p.name)+'</b></div></td><td>'+escapeHtml(p.category||'')+'</td><td>'+brl(Number(p.price))+(p.compare_at_price&&Number(p.compare_at_price)>Number(p.price)?'<br><small class="admin-old-price">'+brl(Number(p.compare_at_price))+' · '+Math.round((1-Number(p.price)/Number(p.compare_at_price))*100)+'% OFF</small>':'')+'</td><td>'+(stock[p.id]??0)+'</td><td>'+(p.active?'Publicado':'Oculto')+'</td><td><button class="admin-secondary" type="button" data-edit="'+escapeHtml(p.id)+'">Editar</button> <button class="admin-secondary" type="button" data-toggle="'+escapeHtml(p.id)+'" data-active="'+p.active+'">'+(p.active?'Ocultar':'Publicar')+'</button></td></tr>').join('');
 content.innerHTML=
 '<section class="admin-welcome" style="display:flex;align-items:center;gap:18px;margin:0 0 22px;padding:22px 26px;border:1px solid #e9e3da;border-left:4px solid #9b7955;border-radius:14px;background:#f8f6f2;color:#292724;box-shadow:0 5px 18px rgba(35,31,27,.045)"><div style="flex:0 0 42px;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#eee8df;color:#806548;font-family:Georgia,serif;font-size:22px">M</div><div style="min-width:0"><div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8a755d;font-weight:700;margin-bottom:5px">EMPÓRIO MILÃO · CENTRAL DE GESTÃO</div><h2 style="font-family:Georgia,serif;font-size:clamp(21px,3vw,28px);font-weight:500;line-height:1.2;margin:0 0 5px;color:#292724">Seja bem-vindo, Sr. Luiz, ao controle da sua empresa.</h2><p style="font-size:13px;line-height:1.5;color:#6d6861;margin:0">Acompanhe os resultados e a operação em um só lugar.</p></div></section>'+
 '<div class="admin-kpis"><div class="admin-kpi"><small>Faturamento recebido</small><strong>'+brl(Number(stats.revenue_paid||0))+'</strong><em>Somente pagamentos confirmados</em></div><div class="admin-kpi"><small>Vendas não canceladas</small><strong>'+brl(Number(stats.sales_total||0))+'</strong><em>Valor total dos pedidos válidos</em></div><div class="admin-kpi"><small>Valores a receber</small><strong>'+brl(Number(stats.pending_amount||0))+'</strong><em>'+Number(stats.orders_pending||0)+' pedido(s) não pagos</em></div><div class="admin-kpi"><small>Total de pedidos</small><strong>'+Number(stats.orders_total||0)+'</strong><em>'+Number(stats.orders_paid||0)+' pagos · '+Number(stats.orders_pending||0)+' pendentes</em></div><div class="admin-kpi"><small>Pedidos confirmados</small><strong>'+Number(stats.orders_confirmed||0)+'</strong><em>Confirmados ou em andamento</em></div></div>'+
 '<div class="admin-kpis" style="margin-top:13px"><div class="admin-kpi"><small>Pedidos pagos</small><strong>'+Number(stats.orders_paid||0)+'</strong><em>Pagamento confirmado</em></div><div class="admin-kpi"><small>Pedidos não pagos</small><strong>'+Number(stats.orders_pending||0)+'</strong><em>Aguardando recebimento</em></div><div class="admin-kpi"><small>Pedidos concluídos</small><strong>'+Number(stats.orders_completed||0)+'</strong><em>Entrega finalizada</em></div><div class="admin-kpi"><small>Clientes cadastrados</small><strong>'+profiles.length+'</strong><em>Perfis carregados</em></div></div>'+
 '<div class="admin-kpis" style="margin-top:13px"><div class="admin-kpi"><small>Descontos concedidos</small><strong>'+brl(Number(stats.discounts_total||0))+'</strong><em>Pedidos não cancelados</em></div><div class="admin-kpi"><small>Vendas pelo WhatsApp</small><strong>'+brl(Number(stats.whatsapp_sales||0))+'</strong><em>Vendas assistidas</em></div><div class="admin-kpi"><small>Vendas pelo site</small><strong>'+brl(Number(stats.online_sales||0))+'</strong><em>Pedidos online</em></div><div class="admin-kpi"><small>Unidades</small><strong>'+stores.length+'</strong><em>Estoques separados</em></div></div>'+
 '<section class="admin-section"><h2>Financeiro por método de pagamento</h2><div class="admin-methods">'+methods+'</div><p style="font-size:11px;color:#7c7164;margin:12px 0 0">O faturamento só considera pedidos marcados manualmente como “Pago”. A escolha de Pix, dinheiro ou cartão não significa que o dinheiro já foi recebido.</p></section>'+
 '<section class="admin-section"><h2>Pedidos e recebimentos</h2><div class="admin-heading-tools"><input class="admin-filter" id="adminOrderSearch" placeholder="Buscar cliente, telefone ou pedido"><select class="admin-filter" id="adminOrderFilter"><option value="all">Todos</option><option value="paid">Pagos</option><option value="pending">Não pagos</option><option value="cancelled">Cancelados</option></select></div><div id="adminOrdersList">'+ordersHtml+'</div><p style="font-size:11px;color:#887e70">Exibindo os 250 pedidos mais recentes. Os indicadores financeiros acima consideram todo o histórico.</p></section>'+
 '<section class="admin-section"><h2>Equipe de vendas online</h2><p style="font-size:13px;color:#786e61">Libere os e-mails individuais dos atendentes. Cada pessoa deve entrar com sua própria conta para que o sistema registre quem lançou cada venda. O limite de desconto é aplicado automaticamente pelo banco de dados.</p><form id="salesStaffForm" class="admin-form"><div class="admin-form-grid"><label>Nome do atendente<input id="staffName" required maxlength="100" placeholder="Nome e sobrenome"></label><label>E-mail autorizado<input id="staffEmail" type="email" required maxlength="180" placeholder="atendente@empresa.com"></label><label>Desconto máximo (%)<input id="staffDiscount" type="number" min="0" max="100" step="0.5" value="10" required></label><label>Status<select id="staffActive"><option value="true">Ativo</option><option value="false">Bloqueado</option></select></label></div><button type="submit" class="admin-primary">Salvar acesso de atendente</button></form><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Atendente</th><th>E-mail</th><th>Desconto máximo</th><th>Acesso</th></tr></thead><tbody>'+salesStaff.map(s=>'<tr><td>'+escapeHtml(s.full_name)+'</td><td>'+escapeHtml(s.email)+'</td><td>'+Number(s.max_discount_percent)+'%</td><td>'+(s.active?'Ativo':'Bloqueado')+'</td></tr>').join('')+'</tbody></table></div><p style="font-size:12px;color:#786e61">Link de acesso para a equipe: <a href="?vendas=1" target="_blank" rel="noopener">Abrir lançamento de vendas</a>. O atendente precisa ter uma conta cadastrada com o mesmo e-mail liberado.</p></section>'+'<section class="admin-section"><h2>Estoque do galpão</h2><p style="font-size:13px;color:#786e61">Registre compras, reposições e ajustes. Quando um pedido mudar para “Saiu para entrega”, a quantidade dos produtos será baixada automaticamente; se o pedido for cancelado após a saída, o saldo será reposto. Todas as movimentações ficam no histórico.</p><form id="stockMovementForm" class="admin-form"><div class="admin-form-grid"><label>Produto<select id="stockProduct" required>'+productOptions+'</select></label><label>Tipo<select id="stockType"><option value="entrada">Entrada no galpão</option><option value="saida">Saída do galpão</option><option value="ajuste">Ajustar saldo para</option></select></label><label>Quantidade<input id="stockQuantity" type="number" min="1" step="1" required placeholder="Ex.: 12"></label><label>Observação<input id="stockNote" maxlength="180" placeholder="Compra, reposição, retirada..."></label></div><button class="admin-primary" type="submit">Registrar movimentação</button></form><h3>Saldo atual por produto</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto</th><th>Catálogo</th><th>Quantidade</th><th>Atualizado</th></tr></thead><tbody>'+stockRows+'</tbody></table></div><h3>Histórico de entradas e saídas</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Data</th><th>Produto</th><th>Movimento</th><th>Quantidade</th><th>Observação</th></tr></thead><tbody>'+movementRows+'</tbody></table></div></section>'+
 '<section class="admin-section"><h2>Estoque por unidade</h2><p style="font-size:13px;color:#786e61">O estoque das lojas é independente. Ao registrar uma venda assistida, os itens são reservados automaticamente na unidade selecionada. O saldo é devolvido se o pedido for cancelado.</p><form id="storeStockForm" class="admin-form"><div class="admin-form-grid"><label>Unidade<select id="branchStore">'+stores.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join('')+'</select></label><label>Produto<select id="branchProduct">'+productOptions+'</select></label><label>Movimentação<select id="branchMovement"><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajustar saldo</option></select></label><label>Quantidade<input id="branchQuantity" type="number" min="1" step="1" required></label><label>Observação<input id="branchNote" maxlength="180" placeholder="Reposição, transferência, conferência..."></label></div><button class="admin-primary" type="submit">Atualizar estoque da unidade</button></form><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Unidade</th><th>Produto</th><th>Saldo</th><th>Atualizado</th></tr></thead><tbody>'+storeInventory.map(x=>{const p=productRows.find(z=>z.id===x.product_id),st=stores.find(z=>z.id===x.store_id);return '<tr><td>'+escapeHtml(st?.name||'—')+'</td><td>'+escapeHtml(p?.name||x.product_id)+'</td><td><b class="'+(x.quantity<=3?'admin-stock-low':'admin-stock-ok')+'">'+x.quantity+'</b></td><td>'+new Date(x.updated_at).toLocaleDateString('pt-BR')+'</td></tr>';}).join('')+'</tbody></table></div><h3>Movimentações recentes por unidade</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Data</th><th>Unidade</th><th>Produto</th><th>Tipo</th><th>Qtd.</th><th>Observação</th></tr></thead><tbody>'+storeMovements.map(m=>'<tr><td>'+new Date(m.created_at).toLocaleString('pt-BR')+'</td><td>'+escapeHtml(m.store_locations?.name||'—')+'</td><td>'+escapeHtml(m.products?.name||m.product_id)+'</td><td>'+escapeHtml(movementNames[m.movement_type]||m.movement_type)+'</td><td>'+m.quantity+'</td><td>'+escapeHtml(m.note||'—')+'</td></tr>').join('')+'</tbody></table></div></section>'+'<section class="admin-section"><div class="admin-section-heading"><div><h2>Cadastro e catálogo de produtos</h2><p>Edite preços, promoções, imagens e informações exibidas na vitrine.</p></div><button type="button" class="admin-secondary" id="centralizeProductImages">Centralizar fotos já cadastradas</button></div><form id="productForm" class="admin-form"><input id="editProductId" type="hidden"><div class="admin-form-grid"><label>Nome<input id="pName" required maxlength="120"></label><label>Categoria<select id="pCategory" required><option value="">Selecione uma categoria</option>'+categories.map(c=>'<option value="'+escapeHtml(c[0])+'">'+escapeHtml(c[0])+'</option>').join('')+'</select></label><label>País<select id="pCountry"><option value="">Não se aplica</option>'+countries.map(c=>'<option value="'+escapeHtml(c[0])+'">'+escapeHtml(c[0])+'</option>').join('')+'</select></label><label>Preço atual (R$)<input id="pPrice" type="number" min="0.01" step="0.01" required></label><label>Preço anterior (R$)<input id="pComparePrice" type="number" min="0.01" step="0.01"></label><label>Descrição<input id="pDescription" maxlength="240"></label><label>Imagem do produto (JPG, PNG ou WEBP)<input id="pImageFile" type="file" accept="image/jpeg,image/png,image/webp"></label><label>URL da imagem atual (opcional)<input id="pImageUrl" type="url" maxlength="1000" placeholder="https://..."></label></div><div class="admin-actions"><button type="submit" class="admin-primary">Salvar produto</button><button type="button" class="admin-secondary" id="clearProduct">Limpar</button></div></form><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+productAdminRows+'</tbody></table></div></section>'+
 '<section class="admin-section"><h2>Clientes cadastrados</h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Cadastro</th></tr></thead><tbody>'+profiles.map(p=>'<tr><td>'+escapeHtml(p.full_name||'Cliente')+'</td><td>'+escapeHtml(p.phone||'—')+'</td><td>'+new Date(p.created_at).toLocaleDateString('pt-BR')+'</td></tr>').join('')+'</tbody></table></div></section>';
 
 const adminAreaConfig=[
  {id:'warehouse',label:'Galpão e estoques',desc:'Entradas, saídas, ajustes e saldos das unidades.'},
  {id:'discounts',label:'Descontos para clientes',desc:'Regra de desconto, autorizações e limites por atendente.'},
  {id:'orders',label:'Pedidos online',desc:'Acompanhe pedidos, andamento e pagamentos.'},
  {id:'finance',label:'Faturamento detalhado',desc:'Recebimentos separados por forma de pagamento.'},
  {id:'promotions',label:'Promoções do dia',desc:'Escolha os vinhos em oferta para hoje.'},
  {id:'products',label:'Produtos e catálogo',desc:'Cadastro, preços, promoções e publicação.'},
  {id:'customers',label:'Clientes',desc:'Consulte os clientes cadastrados.'}
 ];
 const areaNav=document.createElement('section');areaNav.className='admin-area-selector';
 areaNav.innerHTML='<div class="admin-area-selector-heading"><div><span>GESTÃO ORGANIZADA</span><h2>Áreas de acesso</h2><p>Selecione uma área para abrir seus controles.</p></div></div><div class="admin-area-buttons">'+adminAreaConfig.map(a=>'<button type="button" class="admin-area-button" data-open-admin-area="'+a.id+'" aria-expanded="false"><span><b>'+a.label+'</b><small>'+a.desc+'</small></span><i>'+storeIcon("arrow-out")+'</i></button>').join('')+'</div>';
 const kpiBlocks=content.querySelectorAll(':scope > .admin-kpis');
 if(kpiBlocks.length>=3)kpiBlocks[2].insertAdjacentElement('afterend',areaNav);else content.prepend(areaNav);
 const panelsWrap=document.createElement('div');panelsWrap.className='admin-area-panels';areaNav.insertAdjacentElement('afterend',panelsWrap);
 const areaPanels={};adminAreaConfig.forEach(a=>{const panel=document.createElement('div');panel.className='admin-area-panel';panel.dataset.adminAreaPanel=a.id;panel.hidden=true;panelsWrap.appendChild(panel);areaPanels[a.id]=panel;});
 const adminSections=Array.from(content.querySelectorAll(':scope > .admin-section'));
 adminSections.forEach(section=>{
  const heading=(section.querySelector('h2')?.textContent||'').trim().toLowerCase();
  let area='products';
  if(heading.includes('financeiro por método'))area='finance';
  else if(heading.includes('pedidos e recebimentos'))area='orders';
  else if(heading.includes('equipe de vendas'))area='discounts';
  else if(heading.includes('estoque do galpão')||heading.includes('estoque por unidade'))area='warehouse';
  else if(heading.includes('clientes cadastrados'))area='customers';
  areaPanels[area].appendChild(section);
 });
 const promotionPanel=areaPanels.promotions;
 const eligible=productRows.filter(p=>p.active && isWine(p) && Number(p.compare_at_price)>Number(p.price));
 promotionPanel.innerHTML='<section class="admin-section"><h2>Promoções do dia</h2><p>Selecione um vinho com desconto cadastrado. Para incluir outro rótulo, ajuste o preço atual e o anterior em Produtos e catálogo. O destaque termina à meia-noite de Goiânia.</p><label>Vinho em oferta <select></select></label> <button type="button" class="admin-primary">Destacar hoje</button><ul></ul></section>';
 const promoSelect=promotionPanel.querySelector('select');
 const promoButton=promotionPanel.querySelector('button');
 const promoList=promotionPanel.querySelector('ul');
 const today=storeDay();
 for(const wine of eligible){
   if(wine.promotion_day!==today){promoSelect.add(new Option(wine.name,wine.id));continue;}
   const row=document.createElement('li');
   row.append(wine.name+' ');
   const remove=document.createElement('button');remove.type='button';remove.textContent='Retirar';
   remove.onclick=()=>setPromotion(wine.id,null,remove);
   row.append(remove);promoList.append(row);
 }
 promoButton.disabled=!promoSelect.length;
 promoButton.onclick=()=>setPromotion(promoSelect.value,storeDay(),promoButton);
 async function setPromotion(id,day,button){
   button.disabled=true;
   const {data,error}=await supa.from('products').update({promotion_day:day}).eq('id',id).select('id').single();
   if(error||!data){button.disabled=false;toast('Não foi possível atualizar a promoção.');return;}
   await loadProducts();await loadAdminDashboard();
 }
 const discountPolicy=document.createElement('div');discountPolicy.className='admin-discount-policy-note';
 discountPolicy.innerHTML='<b>Política de descontos vigente</b><p>Pedidos a partir de R$ 1.000 podem receber 3% de desconto quando o vendedor optar por aplicar. Descontos acima de 3% exigem autorização por PIN e respeitam o limite liberado para cada atendente.</p>';
 areaPanels.discounts.prepend(discountPolicy);
 const setAdminArea=key=>{
  activeAdminArea=key;
  Object.entries(areaPanels).forEach(([id,panel])=>panel.hidden=id!==key);
  content.querySelectorAll('[data-open-admin-area]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.openAdminArea===key)));
 };
 areaNav.querySelectorAll('[data-open-admin-area]').forEach(button=>button.onclick=()=>setAdminArea(activeAdminArea===button.dataset.openAdminArea?'':button.dataset.openAdminArea));
 setAdminArea(activeAdminArea);
 content.querySelectorAll('[data-order-status]').forEach(sel=>sel.onchange=async()=>{const {error}=await supa.from('orders').update({status:sel.value,updated_at:new Date().toISOString()}).eq('id',sel.dataset.orderStatus);toast(error?'Falha ao atualizar pedido.':'Andamento atualizado.');if(!error)await loadAdminDashboard();});
 content.querySelectorAll('[data-payment-status]').forEach(sel=>sel.onchange=async()=>{const v=sel.value;const {error}=await supa.from('orders').update({payment_status:v,paid_at:v==='paid'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',sel.dataset.paymentStatus);toast(error?'Falha ao atualizar pagamento.':'Pagamento atualizado.');if(!error)await loadAdminDashboard();});
 document.getElementById('salesStaffForm').onsubmit=async e=>{e.preventDefault();const {error}=await supa.rpc('admin_manage_sales_staff',{p_email:document.getElementById('staffEmail').value.trim().toLowerCase(),p_full_name:document.getElementById('staffName').value.trim(),p_active:document.getElementById('staffActive').value==='true',p_max_discount_percent:Number(document.getElementById('staffDiscount').value)});if(error){toast('Não foi possível salvar o acesso: '+error.message);return;}toast('Permissão de vendas atualizada.');await loadAdminDashboard();};
 document.getElementById('storeStockForm').onsubmit=async e=>{e.preventDefault();const {data,error}=await supa.rpc('register_store_stock_movement',{p_store_id:document.getElementById('branchStore').value,p_product_id:document.getElementById('branchProduct').value,p_movement_type:document.getElementById('branchMovement').value,p_quantity:Number(document.getElementById('branchQuantity').value),p_note:document.getElementById('branchNote').value.trim()||null});if(error){toast('Falha ao atualizar estoque da unidade: '+error.message);return;}toast('Estoque da unidade atualizado. Saldo: '+data);await loadAdminDashboard();};
 document.getElementById('stockMovementForm').onsubmit=async e=>{e.preventDefault();const {data,error}=await supa.rpc('register_stock_movement',{p_product_id:document.getElementById('stockProduct').value,p_movement_type:document.getElementById('stockType').value,p_quantity:Number(document.getElementById('stockQuantity').value),p_note:document.getElementById('stockNote').value.trim()||null});if(error){toast('Falha no estoque: '+error.message);return;}toast('Movimentação registrada. Saldo atual: '+data);await loadAdminDashboard();};
 document.getElementById('centralizeProductImages').onclick=async()=>{const button=document.getElementById('centralizeProductImages');button.disabled=true;button.textContent='Centralizando imagens...';const {data,error}=await supa.functions.invoke('centralize-product-images');button.disabled=false;button.textContent='Centralizar fotos já cadastradas';if(error){toast('Não foi possível centralizar as fotos: '+error.message);return;}toast('Imagens centralizadas: '+Number(data?.migrated||0)+' · ignoradas: '+Number(data?.skipped||0));await loadProducts();await loadAdminDashboard();};
 document.getElementById('productForm').onsubmit=async e=>{e.preventDefault();const id=document.getElementById('editProductId').value,name=document.getElementById('pName').value.trim(),imageFile=document.getElementById('pImageFile').files[0];let imageUrl=document.getElementById('pImageUrl').value.trim()||null;const oldValue=Number(document.getElementById('pComparePrice').value)||null;const payload={name,category:document.getElementById('pCategory').value.trim(),country:document.getElementById('pCountry').value.trim()||null,price:Number(document.getElementById('pPrice').value),compare_at_price:oldValue&&oldValue>Number(document.getElementById('pPrice').value)?oldValue:null,description:document.getElementById('pDescription').value.trim(),active:true,updated_at:new Date().toISOString()};if(!name||!payload.category||!Number.isFinite(payload.price)||payload.price<=0){toast('Confira nome, categoria e preço atual.');return;}if(imageFile&&(!['image/jpeg','image/png','image/webp'].includes(imageFile.type)||imageFile.size>8*1024*1024)){toast('A imagem deve ser JPG, PNG ou WEBP e ter até 8 MB.');return;}const result=id?await supa.from('products').update(payload).eq('id',id):await supa.from('products').insert({...payload,id:slugify(name)+'-'+Date.now().toString(36)}).select('id').single();if(result.error){toast('Erro ao salvar produto: '+result.error.message);return;}const productId=id||result.data.id;if(imageFile){const ext=imageFile.type==='image/png'?'png':imageFile.type==='image/webp'?'webp':'jpg',path='products/'+productId+'.'+ext;const {error:uploadError}=await supa.storage.from('product-images').upload(path,imageFile,{upsert:true,contentType:imageFile.type,cacheControl:'31536000'});if(uploadError){toast('Produto salvo, mas falha ao centralizar a imagem: '+uploadError.message);return;}imageUrl=supa.storage.from('product-images').getPublicUrl(path).data.publicUrl;}if(imageUrl!==null){const {error:imageError}=await supa.from('products').update({image_url:imageUrl,image_alt:name,updated_at:new Date().toISOString()}).eq('id',productId);if(imageError){toast('Produto salvo, mas não foi possível atualizar a imagem: '+imageError.message);return;}}const stockResult=await supa.from('inventory').upsert({product_id:productId,quantity:0},{onConflict:'product_id',ignoreDuplicates:true});if(stockResult.error){toast('Produto salvo, mas falhou ao inicializar o estoque: '+stockResult.error.message);return;}const branchSeed=await supa.from('store_inventory').upsert(stores.map(s=>({store_id:s.id,product_id:productId,quantity:0})),{onConflict:'store_id,product_id',ignoreDuplicates:true});if(branchSeed.error){toast('Produto salvo, mas não foi possível inicializar o estoque das unidades: '+branchSeed.error.message);return;}toast('Produto e imagem salvos.');await loadProducts();await loadAdminDashboard();};
 document.getElementById('clearProduct').onclick=()=>{document.getElementById('productForm').reset();document.getElementById('editProductId').value='';document.getElementById('pImageUrl').value='';document.getElementById('pImageFile').value='';};
 content.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>{const p=productRows.find(x=>x.id===btn.dataset.edit);if(!p)return;document.getElementById('editProductId').value=p.id;document.getElementById('pName').value=p.name;const categorySelect=document.getElementById('pCategory'),countrySelect=document.getElementById('pCountry');if(p.category&&!Array.from(categorySelect.options).some(o=>o.value===p.category))categorySelect.add(new Option(p.category,p.category));if(p.country&&!Array.from(countrySelect.options).some(o=>o.value===p.country))countrySelect.add(new Option(p.country,p.country));categorySelect.value=p.category;countrySelect.value=p.country||'';document.getElementById('pPrice').value=p.price;document.getElementById('pComparePrice').value=p.compare_at_price||'';document.getElementById('pDescription').value=p.description||'';document.getElementById('pImageUrl').value=p.image_url||'';document.getElementById('pImageFile').value='';document.getElementById('productForm').scrollIntoView({behavior:'smooth',block:'center'});});
 content.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{const {error}=await supa.from('products').update({active:btn.dataset.active!=='true',updated_at:new Date().toISOString()}).eq('id',btn.dataset.toggle);if(error){toast('Não foi possível alterar o produto.');return;}await loadProducts();await loadAdminDashboard();});
 const search=document.getElementById('adminOrderSearch'),filter=document.getElementById('adminOrderFilter');const applyFilter=()=>{const q=search.value.toLowerCase(),v=filter.value;content.querySelectorAll('.admin-order-card').forEach(card=>{const text=card.textContent.toLowerCase(),pay=card.querySelector('[data-payment-status]')?.value||'pending',cancel=card.querySelector('[data-order-status]')?.value==='cancelled';card.style.display=(!q||text.includes(q))&&(v==='all'||(v==='paid'&&pay==='paid')||(v==='pending'&&pay==='pending')||(v==='cancelled'&&cancel))?'':'none';});};search.oninput=applyFilter;filter.onchange=applyFilter;
}
adminOpenButton.onclick=()=>openAdminPanel();
salesOpenButton.onclick=()=>openSalesPanel();
document.getElementById('adminBackToStore').onclick=closeAdminPage;
document.getElementById('adminBackToStore').textContent='← Voltar';
document.getElementById('adminRefresh').onclick=loadAdminDashboard;

document.getElementById('settingsToggleBtn').onclick=()=>{const box=document.getElementById('accountSettings');box.style.display=box.style.display==='none'?'block':'none';if(box.style.display==='none')mfaSettings.close();};
const profileForm = document.getElementById('profileForm');
const saveProfile = bindEmailFeedback(profileForm, emailPolicy, 'emailChange');
profileForm.onsubmit = async event => {
  event.preventDefault();
  const user = currentUser;
  if (!user) { toast('Entre na sua conta para alterar seus dados.'); return; }
  const full_name = document.getElementById('profileName').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();
  const address = document.getElementById('profileAddress').value.trim();
  const email = document.getElementById('profileEmail').value.trim().toLowerCase();
  if (full_name.length < 2) { toast('Informe seu nome completo.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Informe um e-mail válido.'); return; }
  const changingEmail = email !== String(user.email || '').toLowerCase();
  await saveProfile(async () => {
    const { error: nameError } = await supa.auth.updateUser({ data: { full_name } });
    if (nameError || currentUser?.id !== user.id) return { kind: 'other' };
    const delivery_address = address;
    const { error } = await supa.from('profiles').update({
      full_name, phone, delivery_address, updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    if (error || currentUser?.id !== user.id) return { kind: 'other' };
    currentProfile = { ...currentProfile, full_name, phone, delivery_address };
    document.getElementById('accountStatus').textContent = 'Olá, ' + full_name + '. Seus dados e pedidos estão vinculados a esta conta.';
    if (!changingEmail) return { kind: 'ok', message: 'Dados da conta atualizados.' };
    const { error: emailError } = await supa.auth.updateUser({ email });
    if (emailError) {
      const kind = emailErrorKind(emailError);
      if (kind !== 'other') return { kind };
      return { kind: 'other', message: 'Dados salvos, mas não foi possível solicitar a alteração do e-mail.' };
    }
    return { kind: 'ok', message: 'Dados salvos e alteração de e-mail solicitada. Confira as caixas de entrada e spam do e-mail novo e do atual para ver se há instruções de confirmação.' };
  }, 'Não foi possível salvar os dados agora. Tente novamente.');
};
document.getElementById('passwordForm').onsubmit=async e=>{
 e.preventDefault();const password=document.getElementById('newPassword').value;
 if(!isStrongPassword(password)){toast('Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.');return;}
 const {error}=await supa.auth.updateUser({password});
 if(error){toast('Não foi possível atualizar a senha: '+error.message);return;}
 e.currentTarget.reset();toast('Senha atualizada com sucesso.');
};
document.getElementById('avatarForm').onsubmit=async e=>{
 e.preventDefault();if(!currentUser)return;
 const file=document.getElementById('profileAvatarFile').files[0];if(!file){toast('Escolha uma imagem primeiro.');return;}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){toast('Use JPG, PNG ou WEBP de até 2 MB.');return;}
 const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=currentUser.id+'/avatar.'+ext;
 const {error:uploadError}=await supa.storage.from('profile-avatars').upload(path,file,{upsert:true,contentType:file.type});
 if(uploadError){toast('Não foi possível enviar a foto: '+uploadError.message);return;}
 const {data}=supa.storage.from('profile-avatars').getPublicUrl(path),avatar_url=data.publicUrl+'?v='+Date.now();
 const {error}=await supa.from('profiles').update({avatar_url,updated_at:new Date().toISOString()}).eq('id',currentUser.id);
 if(error){toast('Foto enviada, mas não foi possível salvar no perfil: '+error.message);return;}
 currentProfile={...(currentProfile||{}),avatar_url};document.getElementById('accountAvatar').innerHTML='<img src="'+escapeHtml(avatar_url)+'" alt="Foto de perfil">';e.currentTarget.reset();toast('Foto de perfil atualizada.');
};


async function initSupabase(){
  supa.auth.onAuthStateChange(() => {
    setTimeout(() => refreshAuth().catch(() => {}), 0);
  });
  if (recoveryReturn) {
    const callback = recoveryCallback;
    recoveryCallback = null;
    document.getElementById('accountLogin').style.display = 'none';

    if ('tokenHash' in callback) {
      recoveryStarting = false;
      if (callback.tokenHash) awaitRecoveryConfirmation(callback.tokenHash);
      else showRecoveryFailure();
      return;
    }

    showRecoveryView('Recuperar senha', 'Validando o link de recuperação…');
    const { code, flowId, errorCode, failed } = callback;
    let failure = errorCode;
    try {
      if (code && !failed && !errorCode) {
        const auth = getRecoveryClient();
        const options = flowId ? { flowId } : undefined;
        const { data, error } = await auth.exchangeCodeForSession(code, options);
        // The SDK emits PASSWORD_RECOVERY on this isolated client. Its
        // exchange result also identifies the verified recovery flow.
        if (!error && data?.redirectType === 'recovery' && data?.session?.user?.id) recoveryAuth = auth;
        else failure = error?.code;
      }
    } catch {
      // Unavailable storage or network. Never log the callback credentials.
    } finally {
      recoveryStarting = false;
    }

    if (recoveryAuth) await openNewPasswordForm(recoveryAuth);
    else showRecoveryFailure(failure);
    return;
  }
  await refreshAuth();
  if (mfaChallenge.isOpen() || mfaEnrollmentUserId) return;
  signupConfirmation.initial();
  if(new URLSearchParams(location.search).get('vendas')==='1'){await openSalesPanel(true);return;}
  if(new URLSearchParams(location.search).get('admin')==='1'){if(isAdmin){document.body.classList.add('admin-mode');document.getElementById('adminPage').hidden=false;await loadAdminDashboard();}else{history.replaceState({},'',location.pathname);document.getElementById('accountModal').classList.add('open');toast('Entre com uma conta autorizada para acessar o ADM.');}}
}


/* Interação frontal limitada: a fotografia permanece sempre voltada ao visitante. */
const epuStage=document.getElementById('epuStage');
const epuBottle=document.getElementById('epuBottle');
if(epuStage&&epuBottle){
 let dragging=false,startX=0,startY=0,baseY=0,baseX=0;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const paint=(y,x)=>{epuBottle.style.transform='perspective(1000px) rotateY('+clamp(y,-17,17)+'deg) rotateX('+clamp(x,-2,2)+'deg) scale(1.015)';};
 epuStage.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;dragging=true;startX=e.clientX;startY=e.clientY;baseY=parseFloat(epuBottle.dataset.ry||'0');baseX=parseFloat(epuBottle.dataset.rx||'0');epuStage.classList.add('is-dragging');epuStage.setPointerCapture?.(e.pointerId);});
 epuStage.addEventListener('pointermove',e=>{if(!dragging)return;const y=clamp(baseY+(e.clientX-startX)*.24,-17,17),x=clamp(baseX-(e.clientY-startY)*.035,-2,2);epuBottle.dataset.ry=y;epuBottle.dataset.rx=x;paint(y,x);});
 const finish=()=>{if(!dragging)return;dragging=false;epuStage.classList.remove('is-dragging');};
 epuStage.addEventListener('pointerup',finish);epuStage.addEventListener('pointercancel',finish);epuStage.addEventListener('lostpointercapture',finish);
 epuStage.addEventListener('keydown',e=>{let y=parseFloat(epuBottle.dataset.ry||'0');if(e.key==='ArrowLeft')y=clamp(y-4,-17,17);else if(e.key==='ArrowRight')y=clamp(y+4,-17,17);else if(e.key==='Home')y=0;else return;e.preventDefault();epuBottle.dataset.ry=y;paint(y,parseFloat(epuBottle.dataset.rx||'0'));});
}

renderCategories();renderFilters();renderProducts();renderCountries();saveCart(false);const initialCollection=collectionFromUrl();if(initialCollection){currentCollection=initialCollection;renderCollection();}loadProducts().catch(error=>console.error('Falha ao carregar catálogo:',error));initSupabase().catch(error=>console.error('Falha na inicialização:',error));
