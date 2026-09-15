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


test('Radar live connection receives snapshots and closes when leaving the view',async()=>{
 const source=readFileSync('public/terminal.js','utf8');assert.match(source,/function connectRadarFeed/);
 const fn=source.slice(source.indexOf('function connectRadarFeed('),source.indexOf('async function renderRadar('));
 const streams:any[]=[],pages:any[]=[],statuses:string[]=[],listeners=new Map<string,Function>(),timers=new Map<number,Function>();let id=0;
 class FakeSource{readyState=0;handlers=new Map<string,Function>();closed=false;onopen:any;onerror:any;constructor(public url:string){streams.push(this);}addEventListener(name:string,fn:Function){this.handlers.set(name,fn);}close(){this.closed=true;}emit(name:string,value:any){this.handlers.get(name)?.({data:JSON.stringify(value)});}}
 const doc={hidden:false,addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
 const connect=runInNewContext(fn+';connectRadarFeed',{EventSource:FakeSource,document:doc,URLSearchParams,setTimeout:(fn:Function)=>{timers.set(++id,fn);return id;},clearTimeout:(id:number)=>timers.delete(id),get:async()=>({items:[]}),addEventListener:()=>{},removeEventListener:()=>{}});
 const stop=connect('fresh',(page:any)=>pages.push(page),(state:string)=>statuses.push(state));assert.match(streams[0].url,/feed=fresh/);
 streams[0].readyState=1;streams[0].onopen();streams[0].emit('snapshot',{items:[{token:'one'}]});assert.equal(pages.length,1);
 streams[0].readyState=0;streams[0].onerror();streams[0].readyState=1;streams[0].onopen();streams[0].emit('snapshot',{items:[{token:'newer'}]});await Promise.resolve();await Promise.resolve();assert.equal(pages.length,2);assert.equal(pages[1].items[0].token,'newer');
 doc.hidden=true;listeners.get('visibilitychange')!();assert.equal(streams[0].closed,true);doc.hidden=false;listeners.get('visibilitychange')!();assert.equal(streams.length,2);
 stop();assert.equal(streams[1].closed,true);streams[1].emit('snapshot',{items:[{token:'late'}]});assert.equal(pages.length,2);assert.equal(timers.size,0);assert.equal(listeners.size,0);
});


test('live table patches cells, retains buttons and holds order during interaction',()=>{
 const source=readFileSync('public/terminal.js','utf8'),fn=source.slice(source.indexOf('function feedTable('),source.indexOf('function connectRadarFeed('));
 class Node{children:Node[]=[];parent:Node|null=null;textContent='';className='';title='';dataset:Record<string,string>={};handlers=new Map<string,Function>();classList={add:(name:string)=>{this.className+=' '+name;}};constructor(public tag:string){}append(...nodes:Node[]){for(const node of nodes)this.insertBefore(node,null);}insertBefore(node:Node,before:Node|null){node.remove();const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,node);node.parent=this;}remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}contains(node:Node|null):boolean{return node===this||this.children.some(child=>child.contains(node));}getBoundingClientRect(){return {top:0};}addEventListener(name:string,fn:Function){this.handlers.set(name,fn);}}
 const pending:number[]=[],doc={activeElement:null},nav:string[]=[];
 const create=runInNewContext(fn+';feedTable',{el:(tag:string,text?:string,cls?:string)=>{const node=new Node(tag);if(text!==undefined)node.textContent=text;node.className=cls||'';return node;},document:doc,matchMedia:()=>({matches:true}),scoreTone:(score:number)=>score>=70?'score-high':'score-low',short:(s:string)=>s,eth:(s:string)=>s,marketUsd:(v:any)=>String(v??'-'),watchButton:()=>new Node('button'),navigate:(path:string)=>nav.push(path),queueMicrotask:(fn:Function)=>fn(),window:{scrollBy:()=>{}}});
 const item=(token:string,score=40)=>({token,symbol:token,radarStrength:score,state:'scored',participants:1,buys:1,sells:0,buyFlow:'1',sellFlow:'0',pairToken:'0x0000000000000000000000000000000000000000'});
 const wrap=create([item('a'),item('b')],(n:number)=>pending.push(n)),body=wrap.children[0].children[1],a=body.children[0],b=body.children[1],watch=a.children[9].children[0];watch.textContent='REMOVE FROM WATCHLIST';
 wrap.handlers.get('mouseenter')();wrap.updateRows([item('b',90),item('c'),item('a')]);assert.deepEqual(body.children,[a,b]);assert.equal(b.children[1].textContent,'90');assert.equal(pending.at(-1),1);
 wrap.handlers.get('mouseleave')();assert.deepEqual(body.children.map((row:Node)=>row.dataset.token),['b','c','a']);assert.equal(body.children[2],a);assert.equal(a.children[9].children[0],watch);assert.equal(watch.textContent,'REMOVE FROM WATCHLIST');
 a.children[0].children[0].handlers.get('click')();assert.equal(nav[0],'/terminal/token/a');
 wrap.updateRows([item('a',80)]);assert.deepEqual(body.children,[a]);wrap.updateRows([]);assert.equal(body.children.length,0);assert.equal(wrap.children[0].children[1],body);
});
