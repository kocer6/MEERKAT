import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionMonitor } from '../src/monitor.js';
test('monitor pins open chain positions, serializes overlapping ticks and reports per-position failures',async()=>{
 let calls=0; let unblock!:()=>void; const gate=new Promise<void>(r=>unblock=r);
 const monitor=new PositionMonitor(()=>[{id:'a',source:'chain',status:'open'},{id:'b',source:'synthetic',status:'open'}],async()=>{calls++;await gate;throw new Error('RPC failed');});
 const a=monitor.tick();const b=monitor.tick();unblock();await Promise.all([a,b]);
 assert.equal(calls,1);assert.equal(monitor.snapshot().positions.a?.status,'error');
});
test('successful refresh clears error and closing a position removes it from monitoring',async()=>{
 let open=true;let fail=true;const monitor=new PositionMonitor(()=>open?[{id:'a',source:'chain',status:'open'}]:[],async()=>{if(fail)throw new Error('down');});
 await monitor.tick();fail=false;await monitor.tick();assert.equal(monitor.snapshot().positions.a?.status,'ok');
 open=false;await monitor.tick();assert.deepEqual(monitor.snapshot().positions,{});
});
test('stop waits for the current read and prevents further scheduled work',async()=>{
 let unblock!:()=>void;let calls=0;const gate=new Promise<void>(r=>unblock=r);
 const monitor=new PositionMonitor(()=>[{id:'a',source:'chain',status:'open'}],async()=>{calls++;await gate;},10);
 monitor.start();const stopped=monitor.stop();assert.equal(monitor.snapshot().active,false);unblock();await stopped;
 await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);
});
