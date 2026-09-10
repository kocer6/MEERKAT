import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.js';
import { PonsDiscovery } from '../src/chain/discovery.js';

test('UI boots, rejects unauthenticated/cross-origin controls and persists a demo cycle', async () => {
  const app = await startServer({ port: 0, database: ':memory:' });
  try {
    const html = await (await fetch(app.url)).text(); assert.match(html, /MEERKAT/);
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
