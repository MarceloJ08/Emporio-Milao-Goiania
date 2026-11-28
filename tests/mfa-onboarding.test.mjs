import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const refresh = app.slice(app.indexOf('async function refreshAuth(){'), app.indexOf('let products='));
const user = { id:'mock-id', email:'mock@example.test' };
const session = { user };
function node() {
  const classes = new Set();
  return {
    style:{}, hidden:false, focus() { this.focused = true; },
    classList:{
      toggle(name,value) { if (value) classes.add(name); else classes.delete(name); },
      add(...names) { names.forEach(name=>classes.add(name)); },
      remove(...names) { names.forEach(name=>classes.delete(name)); },
      contains:name=>classes.has(name),
    },
  };
}
function environment(assurance, requirement, result = {}) {
  const nodes = new Map();
  const events = [];
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  const query = {
    select: () => query, eq: () => query, order: () => query,
    maybeSingle: () => ({data:{}}), limit: () => ({data:[]}),
  };
  const context = {
    recoveryOpen:false,
    dedicatedSalesSession:false,
    isAdminDashboardOpen: () => false,
    readAssurance: async ()=>assurance,
    currentUser:null, cartOwnerId:null, currentProfile:null, isAdmin:false,isSalesStaff:false,
    mfaEnrollmentPending:false, mfaEnrollmentUserId:null,
    adminOpenButton:node(), salesOpenButton:node(), accountPanels:node(),
    document:{getElementById:get,body:node()},
    signupConfirmation:{check: value => events.push(['confirmation',!!value])},
    mfaChallenge:{ show: () => events.push('challenge'), close: () => {} },
    mfaSettings:{ retain:()=>{}, open: id=>events.push(['enroll',id]), close:()=>{} },
    supa:{
      from(name) { events.push(name); return query; },
      rpc(name) {
        events.push(name);
        return name==='account_mfa_requirements' ? requirement : { data: result[name] ?? false };
      },
    },
    showAdminWelcomeNotification:()=>{}, escapeHtml:String, loadCartForUser:()=>{}, brl:String,
  };
  const run = runInNewContext(refresh + '\nrefreshAuth;',context);
  return {run, context, events, get};
}

test('staging onboarding markup has exactly one notice and MFA section',()=>{
  for (const id of ['mfaStaffNotice','mfaSettings']) assert.equal(html.split('id="'+id+'"').length,2);
});

test('privileged AAL1 without MFA only enters enrollment and can reload',async()=>{
  const state={state:'ready',session,level:'aal1'};
  const env=environment(state,{data:{admin:false,sales:true,ready:false}});
  env.context.document.body.classList.add('admin-mode','sales-mode');
  assert.equal(await env.run(),null);
  assert.equal(env.get('accountModal').classList.contains('mfa-required'),true);
  assert.equal(env.get('accountRegister').style.display,'none');
  assert.equal(env.get('accountLogin').style.display,'none');
  assert.equal(env.get('accountSigned').style.display,'block');
  assert.equal(env.get('accountSettings').style.display,'block');
  assert.equal(env.get('mfaStaffNotice').hidden,false);
  assert.equal(env.get('mfaStaffNotice').focused,true);
  assert.equal(env.get('adminPage').hidden,true);
  assert.equal(env.context.document.body.classList.contains('sales-mode'),false);
  assert.deepEqual(env.events,['account_mfa_requirements',['confirmation',false],['enroll',user.id]]);
  assert.equal(await env.run(),null);
  assert.equal(env.events.filter(item=>Array.isArray(item)&&item[0]==='enroll').length,1);
});

test('registered AAL1 account goes to challenge without reading privileged data',async()=>{
  const env=environment({state:'challenge',userId:user.id},null);
  assert.equal(await env.run(),undefined);
  assert.deepEqual(env.events,['challenge',['confirmation',false]]);
});

test('a failed authorization RPC keeps data unavailable',async()=>{
  const env=environment({state:'ready',session,level:'aal1'},{error:true});
  assert.equal(await env.run(),null);
  assert.deepEqual(env.events,['account_mfa_requirements','challenge',['confirmation',false]]);
});

test('AAL2 staff becomes ready after successful enrollment',async()=>{
  const state={state:'ready',session,level:'aal1'};
  const requirement={data:{admin:false,sales:true,ready:false}};
  const env=environment(state,requirement,{is_sales_staff:true});
  await env.run();
  state.level='aal2';
  requirement.data.ready=true;
  assert.equal(await env.run(),session);
  assert.equal(env.get('accountModal').classList.contains('mfa-required'),false);
  assert.equal(env.get('mfaStaffNotice').hidden,true);
  assert.equal(env.context.salesOpenButton.hidden,false);
  assert.equal(env.context.adminOpenButton.hidden,true);
});

test('regular AAL1 customer retains account access',async()=>{
  const env=environment({state:'ready',session,level:'aal1'},{data:{admin:false,sales:false,ready:true}});
  assert.equal(await env.run(),session);
  assert.equal(env.context.accountPanels.hidden,true);
  assert(env.events.includes('orders'));
});
