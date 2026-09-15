import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startObserver} from '../src/observer-server.js';
import {RadarStore} from '../src/radar/store.js';
import type {RadarFeedRow} from '../src/radar/service.js';

const row=(id:number,buys=1):RadarFeedRow=>({token:`0x${id.toString(16).padStart(40,'0')}`,curve:`0x${(id+1000).toString(16).padStart(40,'0')}`,name:`Token ${id}`,symbol:`T${id}`,state:'scored',pairToken:'0x0000000000000000000000000000000000000000',launchBlock:String(id),ageMs:null,phase:0,participants:2,buys,sells:1,buyFlow:'100',sellFlow:'10',missingInputs:[],updatedAt:Date.now(),radarStrength:id});

async function nextSnapshot(reader:ReadableStreamDefaultReader<Uint8Array>){
 const timeout=AbortSignal.timeout(6000);let text='';
 while(!timeout.aborted){const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>timeout.addEventListener('abort',()=>reject(new Error('Stream timed out')),{once:true}))]);if(part.done)throw new Error('Stream closed');text+=new TextDecoder().decode(part.value);const frames=text.split('\n\n');text=frames.pop()!;for(const frame of frames)if(frame.includes('event: snapshot'))return JSON.parse(frame.split('\n').find(line=>line.startsWith('data: '))!.slice(6));}
 throw new Error('Stream timed out');
}

test('live Radar streams new, changed and removed rows from another DB writer, reconnects and closes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'meerkat-live-')),database=join(directory,'test.sqlite'),writer=new RadarStore(database);writer.saveView('feed-rows',[row(1)]);
 const app=await startObserver({port:0,database,radarAutoStart:false});let closed=false;let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await fetch(app.url+'/api/radar/stream?feed=fresh&window=all');assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/text\/event-stream/);assert.equal(response.headers.get('x-accel-buffering'),'no');reader=response.body!.getReader();
  assert.deepEqual((await nextSnapshot(reader)).items.map((item:RadarFeedRow)=>item.token),[row(1).token]);
  writer.saveView('feed-rows',[row(1,7),row(2)]);
  const second=await fetch(app.url+'/api/radar/stream?feed=fresh&window=all'),secondReader=second.body!.getReader();assert.equal((await nextSnapshot(secondReader)).items[0].symbol,'T2');await secondReader.cancel();
  const changed=await nextSnapshot(reader);assert.deepEqual(changed.items.map((item:RadarFeedRow)=>[item.symbol,item.buys]),[['T2',1],['T1',7]]);
  writer.saveView('feed-rows',[]);assert.deepEqual((await nextSnapshot(reader)).items,[]);
  await reader.cancel();reader=undefined;writer.saveView('feed-rows',[row(3)]);
  const reconnect=await fetch(app.url+'/api/radar/stream?feed=signals&window=all');reader=reconnect.body!.getReader();assert.equal((await nextSnapshot(reader)).items[0].symbol,'T3');
  assert.equal((await fetch(app.url+'/api/radar/stream?feed=invalid')).status,400);
  await app.close();closed=true;const end=await reader.read();assert.equal(end.done,true);reader=undefined;
 }finally{await reader?.cancel();if(!closed)await app.close();writer.close();rmSync(directory,{recursive:true,force:true});}
});
