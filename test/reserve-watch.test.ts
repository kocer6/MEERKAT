import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sample=(block:number,reserve:string|null,at=block*15000)=>({blockNumber:String(block),reserveWei:reserve,curve:'curve',observedAt:at});
test('reserve baseline and warning survive reopening SQLite',()=>{
 const dir=mkdtempSync(join(tmpdir(),'meerkat-reserve-'));const file=join(dir,'paper.sqlite');
 try{
  let ledger=new Ledger(file,1000n,1000n);ledger.recordReserve('p',sample(1,'100'));ledger.close();
  ledger=new Ledger(file,1000n,1000n);ledger.recordReserve('p',sample(2,'70'));ledger.close();
  ledger=new Ledger(file,1000n,1000n);
  try{assert.equal(ledger.reserveWatches().p?.lastWarning?.dropBps,3000);assert.equal(ledger.events().length,1);}finally{ledger.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('reserve watch warns once above 15%, without changing account or positions',()=>{
 const ledger=new Ledger(':memory:',1000n,1000n);
 try {
  ledger.recordReserve('p',sample(1,'100')); ledger.recordReserve('p',sample(2,'85'));
  assert.equal(ledger.events().length,0);
  ledger.recordReserve('p',sample(3,'60')); ledger.recordReserve('p',sample(3,'40'));
  assert.equal(ledger.events().length,1); assert.equal(ledger.events()[0]?.kind,'reserve-warning');
  assert.equal(ledger.reserveWatches().p?.reserveWei,'60');
  assert.equal(ledger.account().balanceWei,'1000');assert.equal(ledger.positions().length,0);
 }finally{ledger.close();}
});
test('missing data, long gaps, curve changes and older blocks do not create reserve warnings',()=>{
 const ledger=new Ledger(':memory:',1000n,1000n);
 try {
  ledger.recordReserve('p',sample(1,'100'));ledger.recordReserve('p',sample(2,null));
  ledger.recordReserve('p',sample(3,'10'));ledger.recordReserve('p',sample(2,'1'));
  assert.equal(ledger.reserveWatches().p?.reserveWei,'10');
  ledger.recordReserve('p',sample(10,'1'));ledger.recordReserve('p',{...sample(11,'0'),curve:'other'});
  assert.equal(ledger.events().length,0);
 }finally{ledger.close();}
});
