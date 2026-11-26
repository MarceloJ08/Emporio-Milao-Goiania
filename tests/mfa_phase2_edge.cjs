const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { runInNewContext } = require('node:vm');

const source = readFileSync('supabase/functions/centralize-product-images/index.ts', 'utf8')
  .replace(/^import .+;\s*$/gm, '');
const handlerSource = stripTypeScriptTypes(source);

async function run({ authenticated = true, allowed = true, updateVisible = true }) {
  const productId = 'fixture-product';
  let handler;
  let clients = 0;
  let uploads = 0;
  let databaseUpdates = 0;
  runInNewContext(handlerSource, {
    Response, URL, Uint8Array, AbortController, setTimeout, clearTimeout,
    Deno: {
      env: {
        get(name) {
          assert.notEqual(name, 'SUPABASE_SERVICE_ROLE_KEY');
          return { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'fixture-anon' }[name];
        },
      },
      serve(fn) { handler = fn; },
    },
    fetch: async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }),
    createClient(url, key, options) {
      clients++;
      assert.equal(url, 'https://supabase.test');
      assert.equal(key, 'fixture-anon');
      assert.equal(options.global.headers.Authorization, 'Bearer fixture-request');
      return {
        auth: { getUser: async () => ({ data: { user: authenticated ? {} : null } }) },
        rpc: async name => {
          assert.equal(name, 'is_admin');
          return { data: allowed };
        },
        from(name) {
          assert.equal(name, 'products');
          return {
            select: () => ({
              not: () => ({
                order: () => ({
                  limit: async () => ({ data: [{ id: productId, name: 'Fixture', image_url: 'https://images.tcdn.com.br/fixture.jpg' }] }),
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => {
                    databaseUpdates++;
                    return { data: updateVisible ? { id: productId } : null };
                  },
                }),
              }),
            }),
          };
        },
        storage: {
          from(name) {
            assert.equal(name, 'product-images');
            return {
              upload: async () => { uploads++; return {}; },
              getPublicUrl: () => ({ data: { publicUrl: 'https://supabase.test/storage/fixture.jpg' } }),
            };
          },
        },
      };
    },
  });

  const response = await handler(new Request('https://function.test', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-request' },
  }));
  return { status: response.status, body: await response.json(), clients, uploads, databaseUpdates };
}

(async () => {
  for (const scenario of [{ authenticated: false }, { allowed: false }]) {
    const result = await run(scenario);
    assert.equal(result.status, scenario.authenticated === false ? 401 : 403);
    assert.equal(result.uploads, 0);
    assert.equal(result.databaseUpdates, 0);
  }
  const approved = await run({});
  assert.equal(approved.status, 200);
  assert.equal(approved.clients, 1);
  assert.equal(approved.uploads, 1);
  assert.equal(approved.databaseUpdates, 1);
  assert.equal(approved.body.migrated, 1);
  const blockedDuringUpdate = await run({ updateVisible: false });
  assert.equal(blockedDuringUpdate.status, 200);
  assert.equal(blockedDuringUpdate.body.migrated, 0);
  assert.equal(blockedDuringUpdate.body.errors.length, 1);
  console.log('PASS simulated Edge: request context retained, authorization denied, zero-row update not counted');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
