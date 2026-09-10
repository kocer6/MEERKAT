import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('offline demo runs without a key and completes an honestly labeled paper trade', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'demo'], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, PRIVATE_KEY: '' },
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.mode, 'paper');
  assert.equal(result.source, 'synthetic');
  assert.equal(result.position.status, 'closed');
  assert.equal(result.position.exitReason, 'take-profit');
  assert.equal(result.account.balanceWei, '1040000000000000000');
  assert.equal(result.position.realizedPnlWei, '40000000000000000');
  assert.deepEqual(result.events.map((x: { kind: string }) => x.kind), ['entry-reserved', 'entry-filled', 'position-marked', 'exit-filled']);
});

test('unsupported command fails with usage instead of silently starting work', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'trade-live'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Usage:/);
});
