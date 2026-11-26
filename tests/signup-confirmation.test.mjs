import assert from 'node:assert/strict';
import test from 'node:test';

const origin = 'https://store.example.test';
globalThis.location = { origin, pathname: '/' };
const { setupSignupConfirmation, signupReturnFrom } = await import('../src/js/signup-confirmation.mjs');
const key = 'emporio:signup-pending';
const alice = { id: 'alice', email: 'alice@example.test', email_confirmed_at: '2026-11-25T12:00:00Z' };
const bob = { id: 'bob', email: 'bob@example.test', email_confirmed_at: alice.email_confirmed_at };
const aliceSession = { access_token: 'mock-alice', user: alice };
const bobSession = { access_token: 'mock-bob', user: bob };

function node() {
  const classes = new Set();
  return {
    dataset: {}, hidden: true, textContent: '', append() {}, setAttribute() {}, focus() {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    },
  };
}

function browser(t, saved = null, hash = '', lookup = async token => ({
  data: { user: token === aliceSession.access_token ? alice : bob },
})) {
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', handler => timers.push(handler));
  t.mock.method(globalThis, 'setInterval', () => {});
  const storage = new Map([['unrelated', 'preserved']]);
  if (saved) storage.set(key, JSON.stringify({ email: saved, until: Date.now() + 60_000 }));
  globalThis.sessionStorage = {
    setItem: (name, value) => storage.set(name, value),
    getItem: name => storage.get(name) ?? null,
    removeItem: name => storage.delete(name),
  };
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  get('resendSignupForm').querySelector = () => get('resendButton');
  globalThis.document = { getElementById: get, createElement: node };
  globalThis.window = { addEventListener() {} };
  let resendRuns = 0;
  const flow = setupSignupConfirmation({
    callback: signupReturnFrom(new URL(origin + '/' + hash)),
    auth: { getUser: lookup, getSession: async () => ({ data: { session: aliceSession } }) },
    policy: { observe() {}, state: () => ({}), run: () => { resendRuns++; } },
  });
  return { flow, storage, get, timers, resendRuns: () => resendRuns };
}

test('remote confirmation, spent link and later login clear only the matching pending entry', async t => {
  const { flow, storage, get, resendRuns } = browser(t, alice.email, '#error_code=otp_expired');
  flow.initial();
  assert.equal(get('signupConfirmation').hidden, false);
  assert.equal(get('resendSignupForm').hidden, false);
  await flow.check(aliceSession);
  assert.equal(storage.has(key), false);
  assert.equal(storage.get('unrelated'), 'preserved');
  assert.equal(get('signupConfirmation').hidden, true);
  assert.equal(get('resendSignupForm').hidden, true);
  assert.equal(get('registerForm').hidden, false);
  assert.equal(get('accountModal').classList.contains('confirmation-open'), false);
  assert.equal(flow.showIfPending(), false);
  await get('resendSignupForm').onsubmit({ preventDefault() {} });
  assert.equal(resendRuns(), 0);
  flow.initial();
  assert.equal(get('signupConfirmation').hidden, true);
});

test('restored session on first render cleans a pending entry without an auth event', async t => {
  const { flow, storage, get } = browser(t, alice.email);
  await flow.check(aliceSession);
  flow.initial();
  assert.equal(storage.has(key), false);
  assert.equal(get('signupConfirmation').hidden, true);
});

test('login for another address hides the panel and preserves that signup', async t => {
  const { flow, storage, get } = browser(t, alice.email, '#error_code=otp_expired');
  flow.initial();
  await flow.check(bobSession);
  assert.equal(storage.has(key), true);
  assert.equal(flow.showIfPending(), false);
  assert.equal(get('signupConfirmation').hidden, true);
  await flow.check(null);
  assert.equal(flow.showIfPending(), true);
});

test('a valid same-session signup callback keeps the successful confirmation UI', async t => {
  const { flow, storage, get, timers } = browser(t, alice.email, '#type=signup&access_token=mock-alice');
  await flow.check(aliceSession);
  flow.initial();
  assert.equal(storage.has(key), false);
  assert.equal(get('signupConfirmation').dataset.state, 'confirmed');
  assert.equal(get('resendSignupForm').hidden, true);
  await timers[0]();
  assert.equal(get('signupConfirmation').hidden, true);
});

test('an inaccessible user lookup never marks or deletes a pending confirmation', async t => {
  const { flow, storage, get } = browser(t, alice.email, '', async () => ({ error: true }));
  await flow.check(aliceSession);
  assert.equal(storage.has(key), true);
  assert.equal(get('signupConfirmation').hidden, true);
  assert.equal(get('signupConfirmation').dataset.state, '');
});

test('a lookup completing after sign-out cannot clear the pending state', async t => {
  let resolve;
  const { flow, storage } = browser(t, alice.email, '', () => new Promise(done => { resolve = done; }));
  const request = flow.check(aliceSession);
  await flow.check(null);
  resolve({ data: { user: alice } });
  await request;
  assert.equal(storage.has(key), true);
  assert.equal(flow.showIfPending(), true);
});
