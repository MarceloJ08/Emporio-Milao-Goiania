import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../api/catalog.mjs';

test('public catalog shares a CDN cache and only fetches published product fields',async t=>{
  const product={id:'wine-one',name:'Wine',price:40};
  const fetchMock=t.mock.method(globalThis,'fetch',async (url,{headers})=>{
    assert.equal(url.pathname,'/rest/v1/products');
    assert.equal(url.searchParams.get('active'),'eq.true');
    assert.match(url.searchParams.get('select'),/image_url/);
    assert.doesNotMatch(url.searchParams.get('select'),/user|email|phone|stock/);
    assert.ok(headers.apikey.startsWith('sb_publishable_'));
    return Response.json([product]);
  });
  const response=await catalog.fetch(new Request('https://example.test/api/catalog'));
  assert.equal(response.status,200);
  assert.match(response.headers.get('Vercel-CDN-Cache-Control'),/s-maxage=60/);
  assert.deepEqual(await response.json(),[product]);
  assert.equal(fetchMock.mock.callCount(),1);
});
