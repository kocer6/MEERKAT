import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startObserver} from '../src/observer-server.js';
test('primary product is observer-only, starts empty, protects controls and exposes no paper endpoints',async()=>{
 const app=await startObserver({port:0,database:':memory:'});
 try{
  const html=await (await fetch(app.url+'/terminal')).text();assert.match(html,/private keys/);assert.doesNotMatch(html,/Run paper scenario|PAPER BALANCE/);
  const token=/name="control-token" content="([a-f0-9]+)"/.exec(html)![1]!;
  const state=await (await fetch(app.url+'/api/state')).json();assert.equal(state.mode,'observe');assert.deepEqual(state.watches,[]);assert.equal(state.account,undefined);
  assert.equal((await fetch(app.url+'/api/watch/add?token=bad',{method:'POST'})).status,403);
  assert.equal((await fetch(app.url+'/api/watch/add?token=bad',{method:'POST',headers:{'x-control-token':token}})).status,400);
  for(const path of ['/api/demo','/api/paper/buy','/api/paper/close'])assert.equal((await fetch(app.url+path,{method:'POST',headers:{'x-control-token':token}})).status,404);
 }finally{await app.close();}
});

test('landing and terminal are separate product surfaces',async()=>{
 const app=await startObserver({port:0,database:':memory:'});
 try{
  const landing=await (await fetch(app.url+'/')).text();
  const terminal=await (await fetch(app.url+'/terminal')).text();
  assert.match(landing,/<title>MEERKAT — Token Intelligence<\/title>/);
  assert.match(landing,/SCORE FIRST/);
  assert.match(landing,/OPEN TERMINAL/);
  assert.match(landing,/TOKEN LIFECYCLE/);
  assert.match(landing,/WALLET SCORE/);
  assert.match(landing,/RELATIONSHIP MAP/);
  assert.doesNotMatch(landing,/name="control-token"/);
  assert.match(terminal,/<title>Terminal — MEERKAT<\/title>/);
  assert.match(terminal,/name="control-token" content="[a-f0-9]+"/);
  assert.match(terminal,/TOKEN/);
  assert.match(terminal,/WALLET/);
 }finally{await app.close();}
});

test('landing carries the approved brand, roadmap truth and accessible motion contract',async()=>{
 const app=await startObserver({port:0,database:':memory:'});
 try{
  const [html,css]=await Promise.all([fetch(app.url+'/').then(r=>r.text()),fetch(app.url+'/landing.css').then(r=>r.text())]);
  assert.match(css,/meerkat-banner-v2\.png/);
  assert.match(html,/OPEN SOURCE · COMMUNITY DRIVEN/);
  assert.match(html,/\[ LIVE \]/);
  assert.match(html,/\[ BUILDING \]/);
  assert.match(html,/\[ PLANNED \]/);
  assert.match(html,/RELATIONSHIP MAP[\s\S]{0,160}\[ LIVE \]/);
  assert.match(css,/@font-face/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/font-size:\s*18px/);
  assert.doesNotMatch(html,/scan-line|marquee/);
  assert.match(html,/hero-board[\s\S]*OPEN TERMINAL[\s\S]*VIEW SOURCE/);
  assert.match(html,/class="pons-link"[^>]+https:\/\/www\.ponsfamily\.com\//);
  assert.match(html,/TOKEN HOLDER INTELLIGENCE/);
  assert.match(html,/EVIDENCE EXPORT/);
  assert.match(html,/TERMINAL PREVIEW/);
  assert.match(html,/FEE FLOW · LIVE/);
  assert.match(html,/MINI RELATIONSHIP GRAPH/);
  assert.match(html,/ANALYZE HOP OUT/);
  assert.match(html,/\/terminal\?token=0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8/);
  assert.match(html,/mascot-interlude/);
  const banner=await fetch(app.url+'/assets/meerkat-banner-v2.png');
  assert.equal(banner.status,200);
  assert.equal(banner.headers.get('content-type'),'image/png');
 }finally{await app.close();}
});

test('terminal connects token and wallet modes to read-only evidence APIs',async()=>{
 const app=await startObserver({port:0,database:':memory:'});
 try{
  const [html,css,js]=await Promise.all([
   fetch(app.url+'/terminal').then(r=>r.text()),
   fetch(app.url+'/terminal.css').then(r=>r.text()),
   fetch(app.url+'/terminal.js').then(r=>r.text()),
  ]);
  assert.match(html,/data-mode="token"/);
  assert.match(html,/data-mode="wallet"/);
  assert.match(css,/@font-face/);
  assert.match(css,/font-size:\s*18px/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(js,/\/api\/token\/index/);
  assert.match(js,/\/api\/token\/history/);
  assert.match(js,/\/api\/wallet\/dossier/);
  assert.match(html,/RELATIONSHIP MAP/);
  assert.match(css,/\.relationship-map/);
  assert.match(css,/\.relationship-section \.section-heading/);
  assert.match(js,/data\.relationships/);
  assert.match(js,/renderScore/);
  assert.match(html,/id="history-back"/);
  assert.match(js,/navigationHistory/);
  assert.match(js,/ponsfamily\.com\/launchpad\//);
  assert.match(js,/ponsfamily\.com\/profile\//);
  assert.match(js,/blockscout\.com\/address\//);
  for(const hook of ['summary-grid','zone-score','zone-overview','zone-market','tx-buy','tx-sell','tx-transfer','tx-unattributed']){
   assert.match(css,new RegExp(`\\.${hook}`));
  }
  assert.match(js,/marketSummary/);
  assert.match(js,/transactionClass/);
  assert.match(js,/TRADE FLOW/);
  assert.match(js,/CURRENT HOLDERS/);
  assert.match(js,/WALLET ROUTES/);
  assert.match(js,/OPEN WALLET DOSSIER/);
  assert.match(js,/holdersComplete/);
  assert.match(js,/relationshipState/);
  assert.match(js,/data\.feeFlow/);
  assert.match(js,/FEE FLOW/);
  assert.match(js,/CURRENT RECIPIENT/);
  assert.match(css,/\.relationship-inspector/);
  assert.match(css,/\.graph-mode-tabs/);
  assert.match(css,/\.zone-fees/);
  assert.match(css,/\.fee-route/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(js,/scrollIntoView/);
  for(const label of ['OVERVIEW & SCORE','FEE FLOW','RELATIONSHIPS','WALLETS & HOLDERS','TIMELINE'])assert.match(js,new RegExp(label.replace('&','&')));
  assert.match(js,/\/api\/token\/timeline/);
  assert.match(js,/LOAD 50 MORE/);
  assert.match(js,/INDEXED REVENUE · PARTIAL/);
  assert.match(js,/URLSearchParams\(location\.search\)/);
  assert.match(js,/function centerRelationshipMap[\s\S]{0,260}requestAnimationFrame\(\(\)=>requestAnimationFrame/);
  assert.match(css,/\.dossier-tabs/);
  assert.match(css,/font-size:12px/);
  assert.match(js,/marker-end/);
  assert.doesNotMatch(js,/privateKey|sendTransaction|eth_sendTransaction/);
  const invalid=await fetch(app.url+'/api/wallet/dossier?address=bad');
  assert.equal(invalid.status,400);
  const invalidTimeline=await fetch(app.url+'/api/token/timeline?token=bad');
  assert.equal(invalidTimeline.status,400);
 }finally{await app.close();}
});
