import {startObserver} from '../src/observer-server.js';
import {writeFileSync} from 'node:fs';
const app=await startObserver({port:0,database:':memory:'});
try{
 const html=await(await fetch(app.url)).text();const token=/name="control-token" content="([a-f0-9]+)"/.exec(html)![1]!;
 const address='0x074ee0b9c9c5d15a8e924c770907d066cf921745';
 const result=await fetch(app.url+'/api/watch/add?token='+address,{method:'POST',headers:{'x-control-token':token}});const watch=await result.json();if(!result.ok)throw new Error(watch.error);
 const refreshed=await fetch(app.url+'/api/watch/refresh?token='+address,{method:'POST',headers:{'x-control-token':token}});if(!refreshed.ok)throw new Error(await refreshed.text());
 const state=await(await fetch(app.url+'/api/state')).json();
 writeFileSync('docs/evidence/observer-live-2026-09-11.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:state.mode,watch:state.watches[0],eventKinds:state.events.map((e:{kind:string})=>e.kind)},null,2)+'\n');
 console.log(JSON.stringify({mode:state.mode,symbol:watch.snapshot.symbol,block:watch.snapshot.blockNumber,status:watch.status,phase:watch.snapshot.phase}));
}finally{await app.close();}
