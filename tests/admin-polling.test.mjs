import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { PROFILE_FIELDS } from '../src/js/catalog-profile.mjs';

const app = readFileSync(new URL('../src/js/app.js',import.meta.url),'utf8');
const polling = app.slice(app.indexOf('function isAdminDashboardOpen()'),app.indexOf('async function loadAdminDashboard('));
const timerState = app.slice(app.indexOf('const adminRefreshInterval'),app.indexOf('let activeAdminArea'));
const dashboardReads = app.slice(app.indexOf('async function loadAdminDashboard('),app.indexOf(' const stats=summary.data'));
const orderCards = app.slice(app.indexOf(' const methodLabels=',app.indexOf('async function loadAdminDashboard(')),
  app.indexOf(' const productOptions=',app.indexOf('async function loadAdminDashboard(')));

function fixture(withDashboard = false) {
  const events = {};
  const timers = new Map();
  const classes = new Set(['admin-mode']);
  const orderList={innerHTML:'old list',querySelectorAll:()=>[]};
  const statusChart={querySelector:()=>({style:{}})};
  const panels={'#adminOrdersList':orderList,'.admin-methods':{innerHTML:''},'#adminOrderStatusChart':statusChart,
    '#adminOrderSearch':{value:''},'#adminOrderFilter':{value:'all'}};
  const nodes = {adminPage:{hidden:false},adminPollStatus:{hidden:true,textContent:''},orderList,
    adminContent:{innerHTML:'old list',querySelector:selector=>panels[selector],querySelectorAll:()=>[]}};
  const count = {authorized:0,refreshes:0,reads:0};
  let now = 0;
  let serial = 0;
  const reports = [];
  const db = { authData:true, failure:null, authorization:null, orders:[] };
  function table(name) {
    const query = {
      select: () => query, order: () => query,
      limit: () => ({data:name==='orders'?db.orders:[],error:name==='orders'?db.failure:null}),
    };
    return query;
  }
  const context = {
    activeAdminArea: 'orders',
    document: {
      hidden:false, activeElement:null,
      getElementById: id => nodes[id],
      body:{classList:{contains: name => classes.has(name)}},
      addEventListener: (event,callback) => {events[event] = callback;},
    },
    window: {addEventListener: (event,callback) => {events[event] = callback;}},
    Date:class extends Date { static now(){ return now; } },
    brl: String, escapeHtml: String,
    PROFILE_FIELDS,
    readStockByStore: async () => ({data:[]}),
    setTimeout(callback,delay) { timers.set(++serial,{callback,time:now+delay}); return serial; },
    clearTimeout(id) { timers.delete(id); },
    supa: {
      async rpc(name) {
        if (name !== 'is_admin') return {data:[]};
        count.authorized++;
        return db.authorization ? db.authorization : {data:db.authData};
      },
      from(name) { if(name==='orders') count.reads++; return table(name); },
    },
    async loadAdminDashboard(options) {
      assert.equal(options.background,true);
      count.refreshes++;
    },
    closeAdminPage() {
      nodes.adminPage.hidden=true;
      classes.delete('admin-mode');
      vm.stopAdminRefresh();
    },
    refreshAuth: async () => {},
    toast: value => reports.push(value),
  };
  const source = (withDashboard ? dashboardReads + 'const stats={};const orders=or.data||[];\n' + orderCards + '\nupdateAdminFinancialView(content,stats,orders,methods,ordersHtml); }\n' : '')
    + polling + '\n({scheduleAdminRefresh,stopAdminRefresh,queueAdminOrderRefresh,loadAdminDashboard});';
  const vm = runInNewContext(timerState + source,context);
  const expectNext = time => assert.deepEqual([...timers.values()].map(timer=>timer.time),[time]);
  const advance = async time => {
    now=time;
    for(const [id,timer] of [...timers]) {
      if(timer.time>now) continue;
      timers.delete(id);
      await timer.callback();
    }
  };
  return {vm,context,events,timers,nodes,count,db,reports,expectNext,advance,now:time=>{now=time;}};
}
test('orders section refreshes at 20 seconds, authorization comes before reading and next cycle is scheduled',async()=>{
  const f=fixture();
  f.vm.scheduleAdminRefresh();
  f.vm.scheduleAdminRefresh();
  f.expectNext(20_000);
  await f.advance(19_999);
  assert.equal(f.count.refreshes,0);
  await f.advance(20_000);
  assert.deepEqual(f.count,{authorized:1,refreshes:1,reads:0});
  f.expectNext(40_000);
  await f.advance(40_000);
  assert.equal(f.count.refreshes,2);
});
test('background pauses and an overdue cycle resumes on focus without duplicate polls',async()=>{
  const f=fixture();
  f.vm.scheduleAdminRefresh();
  f.now(4_000);
  f.context.document.hidden=true;
  f.events.visibilitychange();
  assert.equal(f.timers.size,0);
  await f.advance(30_000);
  assert.equal(f.count.authorized,0);
  f.context.document.hidden=false;
  f.events.visibilitychange();
  f.events.focus();
  f.expectNext(30_000);
  await f.advance(30_000);
  assert.equal(f.count.refreshes,1);
  f.expectNext(50_000);
});
test('a revoked session closes the panel and clears the timer before any polling reads',async()=>{
  const f=fixture();
  f.db.authData=false;
  f.vm.scheduleAdminRefresh();
  await f.advance(20_000);
  assert.equal(f.nodes.adminPage.hidden,true);
  assert.equal(f.count.refreshes,0);
  f.events.focus();
  assert.equal(f.timers.size,0);
});
test('closing the panel prevents rendering an in-flight background response',async()=>{
  const f=fixture();
  let authorize;
  f.db.authorization=new Promise(done=>{authorize=done;});
  f.vm.scheduleAdminRefresh();
  const inFlight=f.advance(20_000);
  f.context.closeAdminPage();
  authorize({data:true});
  await inFlight;
  assert.equal(f.count.refreshes,0);
  assert.equal(f.timers.size,0);
});
test('query errors keep previous orders visible, report the error and recover at the next interval',async()=>{
  const f=fixture(true);
  f.db.failure={message:'temporary read failure'};
  f.vm.scheduleAdminRefresh();
  await f.advance(20_000);
  assert.equal(f.count.reads,1);
  assert.equal(f.nodes.orderList.innerHTML,'old list');
  assert.equal(f.nodes.adminPollStatus.hidden,false);
  f.db.failure=null;
  await f.advance(40_000);
  assert.equal(f.count.reads,2);
  assert.match(f.nodes.orderList.innerHTML,/Nenhum pedido registrado/);
  assert.equal(f.nodes.adminPollStatus.hidden,true);
});

test('a new order returned by the scheduled read reaches the actual order renderer',async()=>{
  const f=fixture(true);
  f.db.orders=[{id:'fixture-new-order',created_at:'2026-11-26T12:00:00Z',total_amount:31.5,
    sales_channel:'online',status:'received',order_items:[]}];
  f.vm.scheduleAdminRefresh();
  await f.advance(20_000);
  assert.equal(f.count.authorized,1);
  assert.match(f.nodes.orderList.innerHTML,/Pedido #fixture-/);
  assert.match(f.nodes.orderList.innerHTML,/Pedido pelo site/);
  assert.equal(f.nodes.adminContent.innerHTML,'old list');
});

test('an order event advances the refresh and a burst keeps one authorized reload',async()=>{
  const f=fixture();
  f.vm.scheduleAdminRefresh();
  f.now(1000);
  f.vm.queueAdminOrderRefresh();
  f.now(1100);
  f.vm.queueAdminOrderRefresh();
  f.expectNext(1500);
  await f.advance(1500);
  assert.deepEqual(f.count,{authorized:1,refreshes:1,reads:0});
  f.expectNext(21500);
});
