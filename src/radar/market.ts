export interface RadarMarket {
 token:string;name:string|null;symbol:string|null;source:'geckoterminal'|'dexscreener';
 priceUsd:number|null;liquidityUsd:number|null;volume24hUsd:number|null;marketCapUsd:number|null;fdvUsd:number|null;
 fetchedAt:number;
}
const amount=(value:unknown):number|null=>{if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=0?number:null;};
const label=(value:unknown)=>typeof value==='string'&&value.trim()?value.slice(0,200):null;

export function marketReader(request:typeof fetch=fetch){
 return async(tokens:string[]):Promise<RadarMarket[]>=>{
  if(!tokens.length)return [];if(tokens.length>30||tokens.some(token=>!/^0x[0-9a-f]{40}$/i.test(token)))throw new Error('Invalid market batch');
  const wanted=new Set(tokens.map(token=>token.toLowerCase())),found=new Map<string,RadarMarket>();let answered=0;
  const read=async(url:string)=>{const response=await request(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Market source HTTP ${response.status}`);return response.json();};
  try{
   const body=await read(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/multi/${tokens.join(',')}`);
   if(!Array.isArray(body.data))throw new Error('Invalid GeckoTerminal response');answered++;
   for(const item of body.data){const a=item.attributes,token=typeof a?.address==='string'?a.address.toLowerCase():'';if(!wanted.has(token)||item.id!==`robinhood_${token}`)continue;
    found.set(token,{token,name:label(a.name),symbol:label(a.symbol),source:'geckoterminal',priceUsd:amount(a.price_usd),liquidityUsd:amount(a.total_reserve_in_usd),volume24hUsd:amount(a.volume_usd?.h24),marketCapUsd:amount(a.market_cap_usd),fdvUsd:amount(a.fdv_usd),fetchedAt:Date.now()});
   }
  }catch{/* The independently requested secondary source may still cover this batch. */}
  const missing=tokens.filter(token=>found.get(token)?.priceUsd==null);
  if(missing.length)try{
   const pairs=await read(`https://api.dexscreener.com/tokens/v1/robinhood/${missing.join(',')}`);if(!Array.isArray(pairs))throw new Error('Invalid DexScreener response');answered++;
   const selected=new Map<string,RadarMarket>();
   for(const p of pairs){const token=typeof p.baseToken?.address==='string'?p.baseToken.address.toLowerCase():'';if(p.chainId!=='robinhood'||!wanted.has(token)||!missing.includes(token))continue;
    const row:RadarMarket={token,name:label(p.baseToken.name),symbol:label(p.baseToken.symbol),source:'dexscreener',priceUsd:amount(p.priceUsd),liquidityUsd:amount(p.liquidity?.usd),volume24hUsd:amount(p.volume?.h24),marketCapUsd:amount(p.marketCap),fdvUsd:amount(p.fdv),fetchedAt:Date.now()};
    if(!selected.has(token)||(row.liquidityUsd??-1)>(selected.get(token)!.liquidityUsd??-1))selected.set(token,row);
   }
   for(const [token,row] of selected)if(row.priceUsd!==null||!found.has(token))found.set(token,row);
  }catch{/* Keep a successful primary response and its explicit missing fields. */}
  if(!answered)throw new Error('Market enrichment sources unavailable');
  return [...found.values()];
 };
}
