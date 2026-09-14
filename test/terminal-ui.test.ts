import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('terminal exposes four destinations and no Analyze navigation',()=>{
 const html=readFileSync('public/terminal.html','utf8');
 assert.match(html,/data-route="\/terminal\/radar"/);
 assert.match(html,/data-route="\/terminal\/leaderboard"/);
 assert.match(html,/data-route="\/terminal\/watchlist"/);
 assert.match(html,/data-route="\/terminal\/activity"/);
 assert.doesNotMatch(html,/>\s*ANALYZE\s*</i);
 assert.match(html,/id="global-search"/);
});

test('terminal client has six route handlers and explicit address fallback',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 for(const route of ['radar','leaderboard','watchlist','activity','token','wallet'])assert.ok(js.includes(`/terminal/${route}`));
 assert.match(js,/OPEN AS WALLET/);
 assert.match(js,/OPEN AS TOKEN/);
 assert.match(js,/popstate/);
 assert.match(js,/captureViewState/);
});

test('leaderboard ranks all evidenced outcomes by default',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 assert.match(js,/get\('\/api\/radar\/leaderboard',\{window:'all',sort:'total-pnl',status:'all'\}\)/);
});

test('token and wallet entities use the shared red amber green score scale',()=>{
 const js=readFileSync('public/terminal.js','utf8'),css=readFileSync('public/terminal.css','utf8');
 assert.match(js,/function scoreTone/);assert.match(js,/score-low/);assert.match(js,/score-mid/);assert.match(js,/score-high/);
 assert.match(css,/\.score-low/);assert.match(css,/\.score-mid/);assert.match(css,/\.score-high/);
});

test('token dossier exposes market intelligence, participant pnl and tape',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 for(const label of ['MARKET INTELLIGENCE','SCORE & CONTRACT','BUYERS 60\+','WHO IS BUYING','WHO STILL HOLDS','THE TAPE'])assert.match(js,new RegExp(label));
 assert.match(js,/participantScores/);assert.match(js,/REALIZED P\/L/);
 assert.match(js,/LOSING/);
});

test('desktop readability floors are encoded in terminal CSS',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/--body-size:17px/);assert.match(css,/--table-size:15px/);assert.match(css,/--meta-size:12px/);assert.match(css,/min-height:50px/);
 assert.doesNotMatch(css,/\.metric\{[^}]*border-radius:\s*(?:[1-9][0-9]|[2-9])px/);
});

test('terminal handles empty upstream responses and labels pending metadata honestly',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 assert.match(js,/Service temporarily unavailable\. Retry in a moment\./);
 assert.match(js,/METADATA PENDING/);
 assert.match(js,/'RETRY'/);
 assert.doesNotMatch(js,/item\.symbol\|\|'UNKNOWN'/);
 assert.doesNotMatch(js,/await response\.json\(\)/);
});


test('terminal status keeps updating and recovers after an API failure',async()=>{
 const source=readFileSync('public/terminal.js','utf8'),fn=source.slice(source.indexOf('async function refreshRadarStatus()'),source.indexOf('void refreshRadarStatus();'));
 const elements:Record<string,{textContent:string;title:string;className:string}>={};const callbacks:Array<()=>void>=[];let current:any={state:'ready',updatedAt:Date.now(),lastIndexedBlock:'100',workers:{collection:{state:'ready'},enrichment:{state:'ready'}},queueDepth:2,pendingProjections:0};
 const refresh=runInNewContext(fn+';refreshRadarStatus',{get:async()=>{if(current instanceof Error)throw current;return current;},$:(id:string)=>elements[id]??=( {textContent:'',title:'',className:''}),setTimeout:(fn:()=>void,ms:number)=>{assert.equal(ms,15000);callbacks.push(fn);},Date});
 await refresh();assert.equal(elements['radar-head']!.textContent,'100');assert.equal(callbacks.length,1);
 current=new Error('network');await refresh();assert.equal(elements['session-status']!.textContent,'OFFLINE');assert.equal(callbacks.length,2);
 current={state:'ready',updatedAt:Date.now(),lastIndexedBlock:'200',workers:{enrichment:{state:'error',error:'rate limit'}}};await refresh();assert.equal(elements['radar-head']!.textContent,'200');assert.equal(elements['radar-index-status']!.textContent,'DEGRADED');assert.equal(elements['session-status']!.textContent,'CONNECTED');assert.equal(elements['session-status']!.className,'');
});


test('market availability distinguishes unlisted tokens from a pending request',()=>{
 const source=readFileSync('public/terminal.js','utf8'),fn=source.slice(source.indexOf('function enrichedMarket('),source.indexOf('function renderToken(')),messages:string[]=[];
 const render=runInNewContext(fn+';enrichedMarket',{el:(_tag:string,text?:string)=>{if(text)messages.push(text);return {append:()=>{}};},Date});
 render(null);assert.match(messages.pop()!,/Loading/);render({checkedAt:1,data:null,error:null});assert.match(messages.pop()!,/do not list a market quote/);render({checkedAt:1,data:null,error:'rate limit'});assert.match(messages.pop()!,/provider unavailable/);
});
