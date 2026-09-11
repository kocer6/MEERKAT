import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createPublicClient,http,parseAbi,isAddress,encodeAbiParameters,parseAbiParameters,keccak256,type Address,type Hex} from 'viem';
import {factory,factoryAbi,launched} from './chain/abi.js';
import {encode} from './types.js';
import {buildRelationshipGraph} from './relationship-graph.js';
import {scoreToken} from './scoring.js';
const zero='0x0000000000000000000000000000000000000000';
// Selected event ABIs from pinned Bodkin/Canary MIT sources; read-only.
const curveEvents=parseAbi(['event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)','event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)','event CurveBuyRefunded(address indexed recipient,uint256 refundAmount)','event CurveCompleted()']);
const phaseEvents=parseAbi(['event LaunchSwept(address indexed token,uint256 quoteOut,uint256 tokenOut)','event PoolGraduated(address indexed token,uint256 positionId,uint256 tokenAmount,uint256 pairTokenAmount)']);
const poolEvent=parseAbi(['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)'])[0]!;
const transferEvent=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])[0]!;
export interface TokenEvent {id:string;kind:string;venue:string;blockNumber:string;blockHash:string;txHash:string;logIndex:number;at:number|null;initiator:string|null;actor:string|null;recipient:string|null;tokens:string|null;quote:string|null;details?:Record<string,string>}
export interface TokenProfile {token:string;name:string;symbol:string;decimals:number;curve:string;deployer:string;pairToken:string;phase:number;birthBlock:string;birthAt:number;head:string;poolId:string|null;poolManager:string;totalSupply:string;deployerBalance:string;creatorTaxBps:number;metadata:unknown;metadataError:string|null}
export interface HistoryState {profile:TokenProfile;cursor:string|null;status:'indexing'|'ready'|'error'|'paused';error:string|null;updatedAt:number}
export async function findLaunchBlock(head:bigint,read:(from:bigint,to:bigint)=>Promise<Array<{blockNumber:bigint|null}>>){
 const launches=await read(0n,head);if(launches.length!==1||launches[0]!.blockNumber===null)throw new Error('Launch block could not be verified from the Pons V2 factory event');return launches[0]!.blockNumber;
}
export async function rpcReadWithRetry<T>(read:()=>Promise<T>,pause:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T>{
 const waits=[2000,4000,8000,16000,30000];
 for(let attempt=0;attempt<=waits.length;attempt++)try{return await read();}catch(error){const code=(error as {code?:number}).code,message=error instanceof Error?error.message:'';if(attempt===waits.length||(code!==429&&!/Too Many Requests/i.test(message)))throw error;await pause(waits[attempt]!);}
 throw new Error('RPC retry exhausted');
}
export async function readLogsAdaptive<T>(from:bigint,to:bigint,read:(from:bigint,to:bigint)=>Promise<T[]>):Promise<T[]>{
 try{return await read(from,to);}catch(error){
  const details=String((error as {details?:unknown}).details??''),message=error instanceof Error?error.message:'';
  if(from===to||!/logs matched by query exceeds limit|more than \d+ results|response size exceeded|log query timed out/i.test(`${details} ${message}`))throw error;
  const middle=(from+to)/2n;
  return [...await readLogsAdaptive(from,middle,read),...await readLogsAdaptive(middle+1n,to,read)];
 }
}
export function summarizeWallets(events:TokenEvent[],birthAt:number,birthBlock?:string){
 const wallets=new Map<string,{address:string;buys:number;sells:number;spent:string;received:string;earlyBuyer:boolean;fastExit:boolean;firstBuy:number|null;firstBuyBlock:string|null;lastTrade:number;smartStatus:string;realizedPnl:null}>();
 for(const e of [...events].sort((a,b)=>(a.at??0)-(b.at??0)||Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||a.logIndex-b.logIndex)){
  if(!e.initiator || !['buy','sell'].includes(e.kind))continue;
  const address=e.initiator.toLowerCase();const w=wallets.get(address)??{address,buys:0,sells:0,spent:'0',received:'0',earlyBuyer:false,fastExit:false,firstBuy:null,firstBuyBlock:null,lastTrade:0,smartStatus:'insufficient cross-token evidence',realizedPnl:null};
  if(e.kind==='buy'){w.buys++;w.spent=(BigInt(w.spent)+BigInt(e.quote??0)).toString();w.firstBuyBlock??=e.blockNumber;if(e.at!==null){w.firstBuy??=e.at;w.earlyBuyer ||= e.at>=birthAt&&e.at-birthAt<=30000;}else if(birthBlock)w.earlyBuyer ||= BigInt(e.blockNumber)>=BigInt(birthBlock)&&BigInt(e.blockNumber)-BigInt(birthBlock)<=30n;}
  else{w.sells++;w.received=(BigInt(w.received)+BigInt(e.quote??0)).toString();w.fastExit ||= e.at!==null&&w.firstBuy!==null&&e.at>=w.firstBuy&&e.at-w.firstBuy<=300000;if(e.at===null&&w.firstBuyBlock!==null)w.fastExit ||= BigInt(e.blockNumber)>=BigInt(w.firstBuyBlock)&&BigInt(e.blockNumber)-BigInt(w.firstBuyBlock)<=300n;}
  if(e.at!==null)w.lastTrade=Math.max(w.lastTrade,e.at);wallets.set(address,w);
 }
 return [...wallets.values()].sort((a,b)=>(b.buys+b.sells)-(a.buys+a.sells));
}
export class HistoryStore {
 private db:DatabaseSync;
 constructor(file:string){if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS token_history(token TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS token_events(token TEXT,id TEXT,block INTEGER,value TEXT,PRIMARY KEY(token,id));');}
 close(){this.db.close();}
 state(token:string):HistoryState|undefined{const r=this.db.prepare('SELECT value FROM token_history WHERE token=?').get(token) as {value:string}|undefined;return r?JSON.parse(r.value):undefined;}
 tokens():string[]{return (this.db.prepare('SELECT token FROM token_history ORDER BY token').all() as {token:string}[]).map(row=>row.token);}
 save(s:HistoryState){this.db.prepare('INSERT INTO token_history VALUES (?,?) ON CONFLICT(token) DO UPDATE SET value=excluded.value').run(s.profile.token,encode(s));}
 events(token:string):TokenEvent[]{return (this.db.prepare('SELECT value FROM token_events WHERE token=? ORDER BY block,id').all(token) as {value:string}[]).map(r=>JSON.parse(r.value));}
 chunk(s:HistoryState,from:bigint,to:bigint,events:TokenEvent[]){this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM token_events WHERE token=? AND block>=? AND block<=?').run(s.profile.token,Number(from),Number(to));const insert=this.db.prepare('INSERT OR REPLACE INTO token_events VALUES (?,?,?,?)');for(const e of events)insert.run(s.profile.token,e.id,Number(e.blockNumber),encode(e));this.save(s);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export function historyReader(){
 const client=createPublicClient({transport:http(process.env.MEERKAT_RPC_URL??'https://rpc.mainnet.chain.robinhood.com',{timeout:15000,retryCount:1})});
 return {
 async profile(token:string):Promise<TokenProfile>{
  if(!isAddress(token)||token===zero)throw new Error('Invalid token');const read=async<T>(fn:()=>Promise<T>)=>{await new Promise(resolve=>setTimeout(resolve,100));return rpcReadWithRetry(fn);};if(await read(()=>client.getChainId())!==4663)throw new Error('Wrong RPC chain, expected 4663');const address=token as Address;
  const head=await read(()=>client.getBlockNumber({cacheTime:0})),r=await read(()=>client.readContract({address:factory,abi:factoryAbi,functionName:'getLaunchedToken',args:[address],blockNumber:head}));if(!r.exists)throw new Error('Token is not registered in Pons V2');
  const lo=await findLaunchBlock(head,(fromBlock,toBlock)=>read(()=>client.getLogs({address:factory,event:launched,args:{token:address},fromBlock,toBlock,strict:true})));
  const abi=parseAbi(['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)']);
  const c={address,abi,blockNumber:head};const name=await read(()=>client.readContract({...c,functionName:'name'})),symbol=await read(()=>client.readContract({...c,functionName:'symbol'})),decimals=await read(()=>client.readContract({...c,functionName:'decimals'})),supply=await read(()=>client.readContract({...c,functionName:'totalSupply'})),devBalance=await read(()=>client.readContract({...c,functionName:'balanceOf',args:[r.deployer]})),birth=await read(()=>client.getBlock({blockNumber:lo})),hook=await read(()=>client.readContract({address:factory,abi:parseAbi(['function memeHook() view returns(address)']),functionName:'memeHook',blockNumber:head})),manager=await read(()=>client.readContract({address:factory,abi:parseAbi(['function poolManager() view returns(address)']),functionName:'poolManager',blockNumber:head}));
  let metadata:unknown=null,metadataError:string|null=null;try{metadata=await read(()=>client.readContract({address,abi:parseAbi(['struct Socials {string twitter;string telegram;string discord;string website;string farcaster;}','function getTokenInfo() view returns(address tokenDeployer,string tokenLogo,string tokenDescription,Socials tokenSocials)']),functionName:'getTokenInfo',blockNumber:head}));}catch{metadataError='Token metadata unavailable';}
  const poolId=r.pairToken.toLowerCase()===zero?keccak256(encodeAbiParameters(parseAbiParameters('address,address,uint24,int24,address'),[zero,address,0,r.tickSpacing,hook])):null;
  return {token:token.toLowerCase(),name,symbol,decimals,curve:r.curve,deployer:r.deployer,pairToken:r.pairToken,phase:r.phase,birthBlock:lo.toString(),birthAt:Number(birth.timestamp)*1000,head:head.toString(),poolId,poolManager:manager,totalSupply:supply.toString(),deployerBalance:devBalance.toString(),creatorTaxBps:r.creatorTaxBps,metadata,metadataError};
 },
 async chunk(p:TokenProfile,from:bigint,to:bigint):Promise<TokenEvent[]>{
  const read=async<T>(fn:()=>Promise<T>)=>{await new Promise(resolve=>setTimeout(resolve,100));return rpcReadWithRetry(fn);};
  const curve=await readLogsAdaptive(from,to,(fromBlock,toBlock)=>read(()=>client.getLogs({address:p.curve as Address,events:curveEvents,fromBlock,toBlock,strict:true})));
  const phases=await readLogsAdaptive(from,to,(fromBlock,toBlock)=>read(()=>client.getLogs({address:factory,events:phaseEvents,fromBlock,toBlock,strict:true})));
  const transfers=await readLogsAdaptive(from,to,(fromBlock,toBlock)=>read(()=>client.getLogs({address:p.token as Address,event:transferEvent,fromBlock,toBlock,strict:true})));
  const pool=p.poolId?await readLogsAdaptive(from,to,(fromBlock,toBlock)=>read(()=>client.getLogs({address:p.poolManager as Address,event:poolEvent,args:{id:p.poolId as Hex},fromBlock,toBlock,strict:true}))):[];
  const logs=[...curve,...phases.filter(l=>l.args.token?.toLowerCase()===p.token),...transfers,...pool].filter(l=>!l.removed);
  const output:TokenEvent[]=[];
  for(const l of logs){if(l.blockNumber===null||!l.blockHash||!l.transactionHash||l.logIndex===null)continue;
   const block=l.blockNumber.toString(),args=l.args as Record<string,unknown>,name=l.eventName;const trade=name==='CurveBuy'||name==='CurveSell'||name==='Swap';
   let kind=name as string,tokens:string|null=null,quote:string|null=null;
   if(name==='CurveBuy'){kind='buy';tokens=String(args.tokensOut);quote=String(args.quoteIn);}
   if(name==='CurveSell'){kind='sell';tokens=String(args.tokensIn);quote=String(args.quoteOut);}
   if(name==='Swap'){const a=BigInt(String(args.amount0)),b=BigInt(String(args.amount1));kind=a<0n&&b>0n?'buy':a>0n&&b<0n?'sell':'swap';tokens=(b<0n?-b:b).toString();quote=(a<0n?-a:a).toString();}
   const actor=String(args.buyer??args.seller??args.sender??args.from??'')||null;
   output.push({id:`${l.blockHash}:${l.transactionHash}:${l.logIndex}`,kind,venue:name==='Swap'?'pool':name==='Transfer'?'token':name.startsWith('Curve')?'curve':'factory',blockNumber:block,blockHash:l.blockHash,txHash:l.transactionHash,logIndex:l.logIndex,at:null,initiator:trade&&name!=='Swap'?actor:null,actor,recipient:String(args.recipient??args.to??'')||null,tokens,quote,details:Object.fromEntries(Object.entries(args).map(([k,v])=>[k,String(v)]))});
  }
  return output;
 }
 };
}
export class TokenHistory {
 private pending=new Map<string,Promise<void>>();private stopped=false;
 constructor(readonly store:HistoryStore,private reader=historyReader()){}
 start(raw:string){if(!isAddress(raw))throw new Error('Invalid token address');const token=raw.toLowerCase();if(this.stopped)throw new Error('History service stopped');if(this.pending.has(token))return;
  if(this.pending.size>=2)throw new Error('Two history jobs already running');const work=this.run(token).finally(()=>this.pending.delete(token));this.pending.set(token,work);
 }
 result(token:string){token=token.toLowerCase();const state=this.store.state(token);const events=this.store.events(token);return {state:state??null,running:this.pending.has(token),events:events.slice(-500).reverse(),totalEvents:events.length,wallets:state?summarizeWallets(events,state.profile.birthAt,state.profile.birthBlock):[],score:state?scoreToken(state,events):null,relationships:state?buildRelationshipGraph(state.profile,events,{complete:state.status==='ready'}):null,coverage:'Curve trades, native ETH pool swaps, token transfers and factory phases. Curve buyer/seller addresses are attributed; pool swaps remain unattributed without trace evidence. Events use exact blocks and transactions; per-event timestamps are not fetched from the rate-limited public RPC. Up to cursor only; latest 500 events displayed.'};}
 private async run(token:string){let s=this.store.state(token);try{
  const profile=s&&s.status!=='ready'?s.profile:await this.reader.profile(token);s={profile,cursor:s?.cursor??null,status:'indexing',error:null,updatedAt:Date.now()};this.store.save(s);
  let from=s.cursor===null?BigInt(profile.birthBlock):BigInt(s.cursor)>BigInt(profile.birthBlock)+63n?BigInt(s.cursor)-63n:BigInt(profile.birthBlock);const head=BigInt(profile.head);
  if(from>head)throw new Error('RPC head behind saved history');
  while(from<=head&&!this.stopped){const to=from+4999n<head?from+4999n:head;const events=await this.reader.chunk(profile,from,to);s={...s,cursor:to.toString(),status:to===head?'ready':'indexing',updatedAt:Date.now()};this.store.chunk(s,from,to,events);from=to+1n;}
  if(this.stopped&&s.status==='indexing')this.store.save({...s,status:'paused'});
 }catch(e){const error=(e instanceof Error?e.message:'History read failed').split('\n')[0]!.replace(/https?:\/\/\S+/g,'[RPC endpoint]').slice(0,240);if(s)this.store.save({...s,status:'error',error});else this.failures.set(token,error);}}
 private failures=new Map<string,string>();
 error(token:string){return this.failures.get(token.toLowerCase())??null;}
 async close(){this.stopped=true;await Promise.allSettled(this.pending.values());this.store.close();}
}
