import {HistoryStore,TokenHistory,historyReader} from './token-history.js';
import {buildWalletDossier} from './wallet-dossier.js';
import {createServer,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {WatchStore,WatchService} from './watch.js';
import {marketReader,type MarketReader} from './chain/market.js';
import {PonsDiscovery,rpcReader} from './chain/discovery.js';
import {PositionMonitor} from './monitor.js';
import {encode} from './types.js';
import {isAddress} from 'viem';
import {Worker} from 'node:worker_threads';
import {IndexAdmission,IndexAdmissionError,type IndexAdmissionOptions} from './index-admission.js';
import {RadarStore} from './radar/store.js';
import {RadarIndexer,type RadarIndexerOptions} from './radar/indexer.js';
import {radarReader,type RadarReader} from './radar/reader.js';
import {RadarService,type LeaderboardSort,type LeaderboardStatus,type RadarFeed,type RadarWindow} from './radar/service.js';
interface ObserverOptions {port:number;database:string;market?:MarketReader;discovery?:PonsDiscovery;publicMode?:boolean;publicOrigin?:string;trustedHosts?:string[];historyReader?:ReturnType<typeof historyReader>;indexLimits?:IndexAdmissionOptions;radarReader?:RadarReader;radarAutoStart?:boolean;radarOptions?:Partial<RadarIndexerOptions>}
export async function startObserver(options:ObserverOptions){
 const publicMode=options.publicMode??false,publicOrigin=options.publicOrigin?.replace(/\/$/,'');
 if(publicMode){if(!publicOrigin||new URL(publicOrigin).protocol!=='https:'||new URL(publicOrigin).origin!==publicOrigin)throw new Error('Public mode requires an HTTPS public origin');if(!options.trustedHosts?.length)throw new Error('Public mode requires trusted hosts');}
 const trustedHosts=new Set((options.trustedHosts??[]).map(host=>host.trim().toLowerCase()).filter(Boolean));
 const historyStore=new HistoryStore(options.database);const history=new TokenHistory(historyStore,options.historyReader);
 const radarStore=new RadarStore(options.database),radarIndexer=new RadarIndexer(radarStore,options.radarReader??radarReader(),{rangeBlocks:options.radarOptions?.rangeBlocks??2000n,pollMs:options.radarOptions?.pollMs??30000,profileConcurrency:options.radarOptions?.profileConcurrency??2,historyStartBlock:options.radarOptions?.historyStartBlock??0n}),radar=new RadarService(radarStore,()=>radarIndexer.status());
 const store=new WatchStore(options.database);const service=new WatchService(store,options.market??marketReader());
 const discovery=options.discovery??new PonsDiscovery(rpcReader(),{load:()=>store.loadDiscovery(),save:s=>store.saveDiscovery(s)});
 const monitor=new PositionMonitor(()=>store.items().map(w=>({id:w.token,source:'chain',status:'open'})),token=>service.refresh(token));
 const resultCache=new Map<string,{updatedAt:number;value:ReturnType<TokenHistory['result']>}>(),resultJobs=new Map<string,Promise<ReturnType<TokenHistory['result']>>>();
 const tokenResult=async(token:string)=>{token=token.toLowerCase();const state=historyStore.state(token);if(state?.status==='indexing')return history.progress(token);if(!state||options.database===':memory:')return history.result(token);const cached=resultCache.get(token);if(cached?.updatedAt===state.updatedAt)return {...cached.value,...history.activity(token)};const active=resultJobs.get(token);if(active)return {...await active,...history.activity(token)};const workerUrl=new URL(import.meta.url.endsWith('.ts')?'./history-result-worker.ts':'./history-result-worker.js',import.meta.url),job=new Promise<ReturnType<TokenHistory['result']>>((resolve,reject)=>{const worker=new Worker(workerUrl,{workerData:{database:options.database,token}});worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(new Error(`History result worker exited with code ${code}`));});});resultJobs.set(token,job);try{const value=await job;const latest=historyStore.state(token);if(latest?.updatedAt===state.updatedAt)resultCache.set(token,{updatedAt:state.updatedAt,value});return {...value,...history.activity(token)};}finally{resultJobs.delete(token);}};
 const control=randomBytes(32).toString('hex');let url='',closing=false,scannerActive=false,scannerGeneration=0,scannerTimer:NodeJS.Timeout|undefined;
 const admission=new IndexAdmission(token=>history.start(token),options.indexLimits??{maxActive:2,maxQueued:20,maxPerWindow:5,windowMs:600_000});
 const scan=async(generation:number)=>{await discovery.refresh();if(scannerActive&&!closing&&generation===scannerGeneration)scannerTimer=setTimeout(()=>void scan(generation),30000);};
 const state=()=>({mode:'observe',chainId:4663,watches:store.items(),events:store.events(),monitor:monitor.snapshot(),scannerActive,discovery:discovery.snapshot()});
 const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(encode(value));};
 const feed=(value:string|null):RadarFeed=>{const parsed=(value??'signals') as RadarFeed;if(!['signals','fresh','exits','launches','wallets'].includes(parsed))throw new Error('Invalid radar feed');return parsed;};
 const window=(value:string|null):RadarWindow=>{const parsed=(value??'24h') as RadarWindow;if(!['24h','7d','30d','all'].includes(parsed))throw new Error('Invalid radar window');return parsed;};
 const sort=(value:string|null):LeaderboardSort=>{const parsed=(value??'total-pnl') as LeaderboardSort;if(!['total-pnl','realized','open','win-rate','reputation'].includes(parsed))throw new Error('Invalid leaderboard sort');return parsed;};
 const rankingStatus=(value:string|null):LeaderboardStatus=>{const parsed=(value??'eligible') as LeaderboardStatus;if(!['eligible','provisional','all'].includes(parsed))throw new Error('Invalid leaderboard status');return parsed;};
 const terminalTemplate=readFileSync(new URL('../public/terminal.html',import.meta.url),'utf8'),terminalBody=publicMode?terminalTemplate.replace(/\s*<meta name="control-token" content="__CONTROL_TOKEN__">\r?\n?/,'\n'):terminalTemplate.replace('__CONTROL_TOKEN__',control);
 const assets=new Map([
  ['/',{type:'text/html; charset=utf-8',body:readFileSync(new URL('../public/landing.html',import.meta.url),'utf8')}],
  ['/terminal',{type:'text/html; charset=utf-8',body:terminalBody}],
  ['/landing.css',{type:'text/css',body:readFileSync(new URL('../public/landing.css',import.meta.url),'utf8')}],
  ['/landing.js',{type:'text/javascript',body:readFileSync(new URL('../public/landing.js',import.meta.url),'utf8')}],
  ['/terminal.css',{type:'text/css',body:readFileSync(new URL('../public/terminal.css',import.meta.url),'utf8')}],
  ['/terminal.js',{type:'text/javascript',body:readFileSync(new URL('../public/terminal.js',import.meta.url),'utf8')}],
  ['/favicon.ico',{type:'image/x-icon',body:readFileSync(new URL('../public/favicon.ico',import.meta.url))}],
  ['/assets/meerkat-icon.png',{type:'image/png',body:readFileSync(new URL('../public/assets/meerkat-icon.png',import.meta.url))}],
  ['/assets/meerkat-desert.png',{type:'image/png',body:readFileSync(new URL('../public/assets/meerkat-desert.png',import.meta.url))}],
  ['/assets/meerkat-banner-v2.png',{type:'image/png',body:readFileSync(new URL('../public/assets/meerkat-banner-v2.png',import.meta.url))}],
  ['/assets/press-start-2p.ttf',{type:'font/ttf',body:readFileSync(new URL('../public/assets/press-start-2p.ttf',import.meta.url))}],
  ['/observer.js',{type:'text/javascript',body:readFileSync(new URL('../public/observer.js',import.meta.url),'utf8')}],
  ['/observer.css',{type:'text/css',body:readFileSync(new URL('../public/observer.css',import.meta.url),'utf8')}],
 ]);
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(closing){send(res,503,{error:'Shutting down'});return;}
  const allowedHosts=publicMode?trustedHosts:new Set([new URL(url).host.toLowerCase()]),requestHost=req.headers.host?.toLowerCase();
  if(!requestHost||!allowedHosts.has(requestHost)||(req.headers.origin&&req.headers.origin!==(publicMode?publicOrigin:url))){send(res,403,{error:'Untrusted origin'});return;}
  const request=new URL(req.url??'/',url),path=request.pathname,p=request.searchParams;
  try{
   if(req.method==='HEAD'){
    if(path==='/healthz'){res.writeHead(historyStore.health()?200:503,{'content-type':'application/json'});res.end();return;}
    const asset=path.startsWith('/terminal/')?assets.get('/terminal'):assets.get(path);if(asset){res.writeHead(200,{'content-type':asset.type});res.end();return;}
   }
   if(req.method==='GET'){
    if(path==='/healthz'){send(res,historyStore.health()?200:503,{status:historyStore.health()?'ok':'unavailable'});return;}
    const asset=path.startsWith('/terminal/')?assets.get('/terminal'):assets.get(path);if(asset){res.writeHead(200,{'content-type':asset.type});res.end(asset.body);return;}
    if(path==='/api/radar/status'){send(res,200,radar.status());return;}
    if(path==='/api/radar/signals'){send(res,200,radar.signals({feed:feed(p.get('feed')),window:window(p.get('window')),cursor:p.get('cursor')}));return;}
    if(path==='/api/radar/launches'){send(res,200,radar.launches(p.get('cursor')));return;}
    if(path==='/api/radar/activity'){send(res,200,radar.activity(p.get('cursor')));return;}
    if(path==='/api/radar/watchlist'){send(res,200,radar.watchlist());return;}
    if(path==='/api/radar/leaderboard'){send(res,200,radar.leaderboard({window:window(p.get('window')),sort:sort(p.get('sort')),status:rankingStatus(p.get('status')),cursor:p.get('cursor')}));return;}
    if(path==='/api/radar/search'){send(res,200,radar.search(p.get('q')??''));return;}
    const tokenSummary=/^\/api\/radar\/token\/(0x[a-fA-F0-9]{40})\/summary$/.exec(path);if(tokenSummary){send(res,200,radar.tokenSummary(tokenSummary[1]!));return;}
    const walletSummary=/^\/api\/radar\/wallet\/(0x[a-fA-F0-9]{40})\/summary$/.exec(path);if(walletSummary){send(res,200,radar.walletSummary(walletSummary[1]!));return;}
    if(path==='/api/token/history'){const token=p.get('token')??'';if(!isAddress(token))throw new Error('Invalid token address');send(res,200,await tokenResult(token));return;}
    if(path==='/api/token/timeline'){const token=p.get('token')??'';if(!isAddress(token))throw new Error('Invalid token address');if(!historyStore.state(token.toLowerCase()))throw new Error('Token history is not indexed');const limit=Number(p.get('limit')??50),types=(p.get('types')??'').split(',').filter(Boolean).map(type=>type.toLowerCase());send(res,200,historyStore.timeline(token,{limit,types,cursor:p.get('cursor')??undefined}));return;}
    if(path==='/api/wallet/dossier'){const address=p.get('address')??'';if(!isAddress(address))throw new Error('Invalid wallet address');const normalized=address.toLowerCase(),matched=new Map<string,ReturnType<HistoryStore['events']>>();for(const row of historyStore.walletEvents(normalized)){const events=matched.get(row.token)??[];events.push(row.event);matched.set(row.token,events);}const histories=historyStore.states().map(state=>{const profile=state.profile,roleMatch=[profile.deployer,profile.creatorFeeRecipient,profile.pendingCreatorFeeRecipient?.newRecipient].some(value=>value?.toLowerCase()===normalized),events=matched.get(profile.token)??[];if(roleMatch){const ids=new Set(events.map(event=>event.id));for(const event of historyStore.eventsByKinds(profile.token,['FeesSwept','FeesRescued','PoolFeesSwept','PoolFeesRescued']))if(!ids.has(event.id))events.push(event);}return {state,events};});send(res,200,buildWalletDossier(normalized,histories));return;}
    if(!publicMode&&(path==='/api/state'||path==='/api/export')){if(path.endsWith('export'))res.setHeader('Content-Disposition','attachment; filename="meerkat-observations.json"');send(res,200,state());return;}
   }
   if(req.method==='POST'){
    if(publicMode&&path==='/api/token/index'){const forwarded=req.headers['x-forwarded-for'],client=typeof forwarded==='string'?forwarded.split(',')[0]!.trim():req.socket.remoteAddress??'unknown';const result=admission.admit(p.get('token')??'',client);send(res,202,result);return;}
    if(publicMode){send(res,404,{error:'Not found'});return;}
    const token=req.headers['x-control-token'];if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(control)||!timingSafeEqual(Buffer.from(token),Buffer.from(control))){send(res,403,{error:'Control token required'});return;}
    if(path==='/api/token/index'){void history.start(p.get('token')??'');send(res,202,{started:true});return;}
    if(path==='/api/watch/add'){send(res,200,await service.add(p.get('token')??'',p.get('quantity')??'',p.get('cost')??''));return;}
    if(path==='/api/watch/refresh'){send(res,200,await service.refresh((p.get('token')??'').toLowerCase()));return;}
    if(path==='/api/watch/archive'){store.archive((p.get('token')??'').toLowerCase());send(res,200,{ok:true});return;}
    if(path==='/api/monitor/pause'){await monitor.stop();send(res,200,{ok:true});return;}
    if(path==='/api/monitor/resume'){monitor.start();send(res,200,{ok:true});return;}
    if(path==='/api/scanner/start'){if(!scannerActive){scannerActive=true;void scan(++scannerGeneration);}send(res,200,{ok:true});return;}
    if(path==='/api/scanner/pause'){scannerActive=false;scannerGeneration++;if(scannerTimer)clearTimeout(scannerTimer);send(res,200,{ok:true});return;}
   }
   send(res,404,{error:'Not found'});
  }catch(e){if(e instanceof IndexAdmissionError&&e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));send(res,e instanceof IndexAdmissionError?e.status:400,{error:(e instanceof Error?e.message:'Request failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,240)});}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',resolve);});
 const address=server.address();if(!address||typeof address==='string')throw new Error('No server address');url=`http://127.0.0.1:${address.port}`;if(!publicMode)monitor.start();if(options.radarAutoStart)radarIndexer.start();
 return {url,radarTick:()=>radarIndexer.tick(),close:async()=>{closing=true;scannerActive=false;scannerGeneration++;if(scannerTimer)clearTimeout(scannerTimer);await monitor.stop();await discovery.settled();await radarIndexer.close();await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();});await history.close();radarStore.close();store.close();}};
}
