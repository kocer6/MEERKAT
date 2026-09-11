const $=id=>document.getElementById(id),control=document.querySelector('meta[name="control-token"]').content;
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const eth=value=>{if(value===null||value===undefined)return 'Unavailable';const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'−':'')+(a/10n**18n)+'.'+(a%10n**18n).toString().padStart(18,'0').slice(0,8)+' ETH';};
let monitoring=true,scanning=false;
async function post(path,params={}){const r=await fetch(path+'?'+new URLSearchParams(params),{method:'POST',headers:{'x-control-token':control}});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
function button(label,action){const b=node('button',label);b.addEventListener('click',async()=>{b.disabled=true;try{await action();await refresh();}catch(e){$('action-status').textContent=e.message;}finally{b.disabled=false;}});return b;}
async function refresh(){
 const r=await fetch('/api/state');if(!r.ok)throw new Error('Local service unavailable');const data=await r.json();
 $('connection').textContent='Connected · real chain reads · '+data.watches.length+' watched tokens';
 monitoring=data.monitor.active;scanning=data.scannerActive;$('monitor').textContent=monitoring?'Pause monitoring':'Resume monitoring';$('scanner-control').textContent=scanning?'Pause scanner':'Connect scanner';
 $('monitor-status').textContent=monitoring?'Automatic refresh every 15 seconds after each cycle. Saved watches resume on server start.':'Paused. Values below are last observations and are not updating.';
 $('watches').replaceChildren();if(!data.watches.length)$('watches').append(node('p','No watched tokens yet. Add a token above or choose a launch below.','muted'));
 for(const w of data.watches){const s=w.snapshot,card=node('article','','card');card.append(node('h3',s?.symbol||w.token),node('p',w.token,'muted'));
  const age=s?Math.max(0,Math.floor((Date.now()-s.observedAt)/1000)):null;
  card.append(node('p',w.status==='error'?'DATA ERROR · '+w.error:age>60?'STALE · last successful observation '+age+' seconds ago':'Observed '+age+' seconds ago',w.status==='error'||age>60?'bad':'good'));
  if(s){card.append(node('p','Phase: '+(['Curve','Graduating','Pool','Rescued'][s.phase]||'Unknown')+' · Block '+s.blockNumber));
   card.append(node('p','Real curve reserve: '+eth(s.realQuoteReserveWei)+' · Opening tax: '+(s.openingTaxBps===null?'unknown':s.openingTaxBps/100+'%')));
   if(w.quantity){card.append(node('p','Manual position · entry cost '+eth(w.costWei)+' · estimated proceeds '+eth(s.sellBackWei)));
    if(s.sellBackWei!==null)card.append(node('p','Estimated P&L before gas: '+eth(BigInt(s.sellBackWei)-BigInt(w.costWei))));
   }
   for(const reason of s.reasons)card.append(node('p',reason,'bad'));
  }
  const actions=node('div','','buttons');actions.append(button('Refresh',()=>post('/api/watch/refresh',{token:w.token})),button('Remove from watchlist',()=>post('/api/watch/archive',{token:w.token})));
  const link=node('a','View token ↗');link.href='https://robinhoodchain.blockscout.com/token/'+w.token;link.target='_blank';link.rel='noreferrer';actions.append(link);card.append(actions);$('watches').append(card);
 }
 const d=data.discovery;$('scanner-status').textContent=d.status==='error'?'Scanner error: '+d.error:d.blockNumber?'Scanned '+d.blockNumber+' / head '+(d.headBlock||d.blockNumber)+' · '+d.launches.length+' saved launches':'Connect to read the latest 2,000 blocks. Saved progress resumes on reconnect.';
 $('launches').replaceChildren();for(const l of d.launches.slice(0,15)){const row=node('div','','card row');row.append(node('span',l.token),button('Watch this token',()=>post('/api/watch/add',{token:l.token})));$('launches').append(row);}
 $('events').replaceChildren();if(!data.events.length)$('events').append(node('p','Changes will appear here.','muted'));
 for(const e of data.events){const row=node('article','','event');row.append(node('strong',e.kind.replaceAll('-',' ')),node('p',e.detail.token||''),node('small',new Date(e.at).toLocaleString()));if(e.detail.error)row.append(node('p',e.detail.error,'bad'));if(e.detail.dropBps)row.append(node('p','Reserve fell '+e.detail.dropBps/100+'% · blocks '+e.detail.fromBlock+' → '+e.detail.blockNumber,'bad'));const detail=node('details','');detail.append(node('summary','Evidence'),node('pre',JSON.stringify(e.detail,null,2)));row.append(detail);$('events').append(row);}
}
$('add').addEventListener('submit',async e=>{e.preventDefault();$('add-button').disabled=true;$('action-status').textContent='Reading token from chain…';try{await post('/api/watch/add',Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();$('action-status').textContent='Token saved. Monitoring is '+(monitoring?'active.':'paused.');}catch(error){$('action-status').textContent=error.message;}finally{$('add-button').disabled=false;}});
$('monitor').addEventListener('click',async()=>{try{await post('/api/monitor/'+(monitoring?'pause':'resume'));await refresh();}catch(e){$('action-status').textContent=e.message;}});
$('scanner-control').addEventListener('click',async()=>{try{await post('/api/scanner/'+(scanning?'pause':'start'));await refresh();}catch(e){$('action-status').textContent=e.message;}});
async function poll(){try{await refresh();}catch(e){$('connection').textContent=e.message+' · displayed observations may be stale';}setTimeout(poll,5000);}void poll();
