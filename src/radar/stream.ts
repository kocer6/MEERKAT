import type {ServerResponse} from 'node:http';
import type {RadarFeed,RadarService,RadarWindow} from './service.js';

type Query={feed:RadarFeed;window:RadarWindow;cursor:null};
type Channel={query:Query;clients:Set<ServerResponse>;revision:number|null;readAt:number;payload:string};

/** One database revision poll per process, shared by every connected viewer. */
export class RadarStream {
 private channels=new Map<string,Channel>();
 private timer:NodeJS.Timeout|null=null;
 constructor(private radar:RadarService,private revision:()=>number|null){}
 subscribe(res:ServerResponse,query:Query){
  const key=`${query.feed}:${query.window}`;
  let channel=this.channels.get(key);
  if(!channel){channel={query,clients:new Set(),revision:null,readAt:0,payload:''};this.channels.set(key,channel);}
  // Read before committing SSE headers so ordinary API errors remain JSON responses.
  let payload:string;
  try{const revision=this.revision();payload=JSON.stringify(this.radar.signals(query));if(!channel.clients.size){channel.payload=payload;channel.revision=revision;channel.readAt=Date.now();}}
  catch(error){if(!channel.clients.size)this.channels.delete(key);throw error;}
  channel.clients.add(res);
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.on('close',()=>{channel!.clients.delete(res);if(!channel!.clients.size&&this.channels.get(key)===channel)this.channels.delete(key);if(!this.channels.size&&this.timer){clearInterval(this.timer);this.timer=null;}});
  res.write('retry: 2000\n\n');this.write(res,`event: snapshot\ndata: ${payload}\n\n`);
  if(!this.timer){this.timer=setInterval(()=>this.tick(),1000);this.timer.unref();}
 }
 private write(res:ServerResponse,frame:string){
  if(res.destroyed||res.writableEnded)return;
  // Slow clients reconnect to a current snapshot instead of accumulating unbounded buffers.
  if(res.writableNeedDrain){res.end();return;}
  res.write(frame);
 }
 private tick(){
  try{
   const revision=this.revision(),now=Date.now();
   for(const channel of this.channels.values()){
    if(revision===channel.revision&&now-channel.readAt<15000)continue;
    const payload=JSON.stringify(this.radar.signals(channel.query)),changed=payload!==channel.payload;
    channel.revision=revision;channel.readAt=now;channel.payload=payload;
    const frame=changed?`event: snapshot\ndata: ${payload}\n\n`:`event: heartbeat\ndata: {}\n\n`;
    for(const res of channel.clients)this.write(res,frame);
   }
  }catch{
   // EventSource reconnects and receives a full snapshot after transient DB errors.
   this.close();
  }
 }
 close(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const channel of this.channels.values())for(const res of channel.clients)res.end();this.channels.clear();}
}
