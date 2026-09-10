import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.js';
import { PonsDiscovery } from '../src/chain/discovery.js';

test('UI boots, rejects unauthenticated/cross-origin controls and persists a demo cycle', async () => {
  const app = await startServer({ port: 0, database: ':memory:' });
  try {
    const html = await (await fetch(app.url)).text(); assert.match(html, /MEERKAT/);
    for (const [path, type] of [['/assets/meerkat-desert.png', 'image/png'], ['/assets/press-start-2p.ttf', 'font/ttf']]) {
      const asset = await fetch(app.url + path);
      assert.equal(asset.status, 200); assert.equal(asset.headers.get('content-type'), type);
      assert.ok((await asset.arrayBuffer()).byteLength > 1000);
    }
    const token = /name="control-token" content="([a-f0-9]+)"/.exec(html)?.[1]; assert.ok(token);
    const before = await (await fetch(app.url + '/api/state')).json(); assert.equal(before.mode, 'paper');
    assert.equal((await fetch(app.url + '/api/demo', { method: 'POST' })).status, 403);
    assert.equal((await fetch(app.url + '/api/demo', { method: 'POST', headers: { 'x-control-token': token, origin: 'https://evil.invalid' } })).status, 403);
    const response = await fetch(app.url + '/api/demo', { method: 'POST', headers: { 'x-control-token': token, origin: app.url } });
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.position.status, 'closed');
    const after = await (await fetch(app.url + '/api/state')).json(); assert.equal(after.account.balanceWei, '1040000000000000000');
    assert.equal(after.positions.length, 1); assert.equal(after.events.filter((x: { kind: string }) => x.kind === 'exit-filled').length, 1);
    assert.equal((await fetch(app.url + '/api/export')).status, 200);
  } finally { await app.close(); }
});

test('chain controls require authorization, start once and stop without creating paper positions', async () => {
  let reads = 0;
  const discovery = new PonsDiscovery({
    chainId: async () => 4663, head: async () => 5000n, code: async () => '0x1234',
    logs: async () => { reads++; return []; },
    record: async () => { throw new Error('no launch to inspect'); },
  });
  const app = await startServer({ port: 0, database: ':memory:', discovery });
  try {
    const html = await (await fetch(app.url)).text();
    const token = /name="control-token" content="([a-f0-9]+)"/.exec(html)![1]!;
    const post = (path: string) => fetch(app.url + path, { method: 'POST', headers: { 'x-control-token': token } });
    assert.equal((await fetch(app.url + '/api/market/start', { method: 'POST' })).status, 403);
    assert.equal(reads, 0);
    assert.equal((await (await post('/api/market/start')).json()).status, 'connected');
    await post('/api/market/start'); assert.equal(reads, 1);
    assert.equal((await (await post('/api/market/stop')).json()).marketActive, false);
    const state = await (await fetch(app.url + '/api/state')).json();
    assert.equal(state.marketActive, false); assert.deepEqual(state.positions, []);
    assert.equal(state.account.balanceWei, '1000000000000000000');
  } finally { await app.close(); }
});

test('inspection API authenticates, validates input and returns read-only quotes', async () => {
  const market = {
    chainId: async () => 4663, block: async () => ({ number: 42n, timestamp: BigInt(Math.floor(Date.now()/1000)) }),
    record: async () => ({ exists: true, curve: '0x2222222222222222222222222222222222222222', pairToken: '0x0000000000000000000000000000000000000000', phase: 0 }),
    metadata: async () => ({ symbol: 'TEST', decimals: 18 }),
    curve: async () => ({ quoteReserve: 10n ** 18n, tokenReserve: 10n ** 24n, realQuoteReserve: 10n ** 18n, sellableTokens: 8n * 10n ** 23n, feeBps: 100n, creatorTaxBps: 0n, openingTaxBps: 0n, graduated: false, readyToGraduate: false }),
  };
  const app = await startServer({ port: 0, database: ':memory:', market });
  try {
    const html = await (await fetch(app.url)).text(); const token = /name="control-token" content="([a-f0-9]+)"/.exec(html)![1]!;
    const path = '/api/inspect?token=0x1111111111111111111111111111111111111111&amount=';
    assert.equal((await fetch(app.url + path + '0.01', { method: 'POST' })).status, 403);
    const post = (amount: string) => fetch(app.url + path + amount, { method: 'POST', headers: { 'x-control-token': token } });
    for (const invalid of ['0', '-1', '2', 'NaN', '1e-2', '0.0000000000000000001']) assert.equal((await post(invalid)).status, 400);
    const response = await post('0.01'); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.source, 'chain'); assert.ok(BigInt(result.buy.tokensOut) > 0n);
    const state = await (await fetch(app.url + '/api/state')).json(); assert.deepEqual(state.positions, []);
    const buyPath='/api/paper/buy?token=0x1111111111111111111111111111111111111111&amount=0.01&orderId=test-order-123';
    for(const route of [buyPath,'/api/paper/close?id=unknown','/api/paper/observe?id=unknown']) assert.equal((await fetch(app.url+route,{method:'POST'})).status,403);
    const send=(route:string)=>fetch(app.url+route,{method:'POST',headers:{'x-control-token':token}});
    const bought=await send(buyPath); assert.equal(bought.status,200); const position=(await bought.json()).position;
    assert.equal(position.source,'chain'); assert.equal(position.status,'open');
    const observed=await send('/api/paper/observe?id='+position.id); assert.equal(observed.status,200);
    const closed=await send('/api/paper/close?id='+position.id); assert.equal(closed.status,200); assert.equal((await closed.json()).position.status,'closed');
    assert.equal((await send('/api/paper/close?id='+position.id)).status,400);

  } finally { await app.close(); }
});
