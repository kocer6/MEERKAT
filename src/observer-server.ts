import {createServer,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {WatchStore,WatchService} from './watch.js';
import {marketReader,type MarketReader} from './chain/market.js';
import {PonsDiscovery,rpcReader} from './chain/discovery.js';
import {PositionMonitor} from './monitor.js';
import {encode} from './types.js';
export async function startObserver(options:{port:number;database:string;market?:MarketReader;discovery?:PonsDiscovery}){
 const store=new WatchStore(options.database);const service=new WatchService(store,options.market??marketReader());
 const discovery=options.discovery??new PonsDiscovery(rpcReader(),{load:()=>store.loadDiscovery(),save:s=>store.saveDiscovery(s)});
 const monitor=new PositionMonitor(()=>store.items().map(w=>({id:w.token,source:'chain',status:'open'})),token=>service.refresh(token));
 const control=randomBytes(32).toString('hex');let url='',closing=false,scannerActive=false,scannerGeneration=0,scannerTimer:NodeJS.Timeout|undefined;
 const scan=async(generation:number)=>{await discovery.refresh();if(scannerActive&&!closing&&generation===scannerGeneration)scannerTimer=setTimeout(()=>void scan(generation),30000);};
 const state=()=>({mode:'observe',chainId:4663,watches:store.items(),events:store.events(),monitor:monitor.snapshot(),scannerActive,discovery:discovery.snapshot()});
 const send=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(encode(value));};
 const assets=new Map([
  ['/',{type:'text/html; charset=utf-8',body:readFileSync(new URL('../public/observer.html',import.meta.url),'utf8').replace('__CONTROL_TOKEN__',control)}],
  ['/observer.js',{type:'text/javascript',body:readFileSync(new URL('../public/observer.js',import.meta.url),'utf8')}],
  ['/observer.css',{type:'text/css',body:readFileSync(new URL('../public/observer.css',import.meta.url),'utf8')}],
 ]);
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(closing){send(res,503,{error:'Shutting down'});return;}
  if(req.headers.host!==new URL(url).host || (req.headers.origin&&req.headers.origin!==url)){send(res,403,{error:'Untrusted origin'});return;}
  const request=new URL(req.url??'/',url),path=request.pathname,p=request.searchParams;
  try{
   if(req.method==='GET'){
    const asset=assets.get(path);if(asset){res.writeHead(200,{'content-type':asset.type});res.end(asset.body);return;}
    if(path==='/api/state'||path==='/api/export'){if(path.endsWith('export'))res.setHeader('Content-Disposition','attachment; filename="meerkat-observations.json"');send(res,200,state());return;}
   }
   if(req.method==='POST'){
    const token=req.headers['x-control-token'];if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(control)||!timingSafeEqual(Buffer.from(token),Buffer.from(control))){send(res,403,{error:'Control token required'});return;}
    if(path==='/api/watch/add'){send(res,200,await service.add(p.get('token')??'',p.get('quantity')??'',p.get('cost')??''));return;}
    if(path==='/api/watch/refresh'){send(res,200,await service.refresh((p.get('token')??'').toLowerCase()));return;}
    if(path==='/api/watch/archive'){store.archive((p.get('token')??'').toLowerCase());send(res,200,{ok:true});return;}
    if(path==='/api/monitor/pause'){await monitor.stop();send(res,200,{ok:true});return;}
    if(path==='/api/monitor/resume'){monitor.start();send(res,200,{ok:true});return;}
    if(path==='/api/scanner/start'){if(!scannerActive){scannerActive=true;void scan(++scannerGeneration);}send(res,200,{ok:true});return;}
    if(path==='/api/scanner/pause'){scannerActive=false;scannerGeneration++;if(scannerTimer)clearTimeout(scannerTimer);send(res,200,{ok:true});return;}
   }
   send(res,404,{error:'Not found'});
  }catch(e){send(res,400,{error:(e instanceof Error?e.message:'Request failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,240)});}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',resolve);});
 const address=server.address();if(!address||typeof address==='string')throw new Error('No server address');url=`http://127.0.0.1:${address.port}`;monitor.start();
 return {url,close:async()=>{closing=true;scannerActive=false;scannerGeneration++;if(scannerTimer)clearTimeout(scannerTimer);await monitor.stop();await discovery.settled();await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();});store.close();}};
}
