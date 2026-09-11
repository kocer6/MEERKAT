import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ledger} from '../src/ledger.js';
import {PaperEngine} from '../src/paper.js';
import {defaultRules} from '../src/rules.js';
const settings={takeProfitBps:4000,stopLossBps:1000,trailingBps:500,maxHoldMs:600000};
test('exit settings persist for new engines, reject invalid input and cannot change with pending orders',()=>{
 const ledger=new Ledger(':memory:',1000000n,1000000n);
 try{
  const engine=new PaperEngine(ledger,defaultRules);engine.setExitSettings(settings);
  assert.equal(new PaperEngine(ledger,defaultRules).rules.takeProfitBps,4000);
  assert.equal(ledger.events()[0]?.kind,'strategy-updated');
  assert.throws(()=>engine.setExitSettings({...settings,stopLossBps:10000}));
  assert.equal(engine.rules.stopLossBps,1000);
  ledger.reserve('pending',{token:'0x1111111111111111111111111111111111111111',symbol:'TEST',amountWei:100n,score:100,openingTaxBps:0,source:'chain'},100n,3,Date.now());
  assert.throws(()=>engine.setExitSettings(settings),/positions or orders/);
 }finally{ledger.close();}
});
