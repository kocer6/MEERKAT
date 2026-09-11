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
  actions.append(button('Analyze full history',()=>openToken(w.token)));const link=node('a','Open on Pons ↗');link.href='https://www.ponsfamily.com/launchpad/'+w.token;link.target='_blank';link.rel='noreferrer';actions.append(link);card.append(actions);$('watches').append(card);
 }
 const d=data.discovery;$('scanner-status').textContent=d.status==='error'?'Scanner error: '+d.error:d.blockNumber?'Scanned '+d.blockNumber+' / head '+(d.headBlock||d.blockNumber)+' · '+d.launches.length+' saved launches':'Connect to read the latest 2,000 blocks. Saved progress resumes on reconnect.';
 $('launches').replaceChildren();for(const l of d.launches.slice(0,15)){const row=node('div','','card row');row.append(node('span',l.token),button('Analyze token',()=>openToken(l.token)),button('Watch this token',()=>post('/api/watch/add',{token:l.token})));const pons=node('a','Open on Pons ↗');pons.href='https://www.ponsfamily.com/launchpad/'+l.token;pons.target='_blank';pons.rel='noreferrer';row.append(pons);$('launches').append(row);}
 $('events').replaceChildren();if(!data.events.length)$('events').append(node('p','Changes will appear here.','muted'));
 for(const e of data.events){const row=node('article','','event');row.append(node('strong',e.kind.replaceAll('-',' ')),node('p',e.detail.token||''),node('small',new Date(e.at).toLocaleString()));if(e.detail.error)row.append(node('p',e.detail.error,'bad'));if(e.detail.dropBps)row.append(node('p','Reserve fell '+e.detail.dropBps/100+'% · blocks '+e.detail.fromBlock+' → '+e.detail.blockNumber,'bad'));const detail=node('details','');detail.append(node('summary','Evidence'),node('pre',JSON.stringify(e.detail,null,2)));row.append(detail);$('events').append(row);}
}
$('add').addEventListener('submit',async e=>{e.preventDefault();$('add-button').disabled=true;$('action-status').textContent='Reading token from chain…';try{await post('/api/watch/add',Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();$('action-status').textContent='Token saved. Monitoring is '+(monitoring?'active.':'paused.');}catch(error){$('action-status').textContent=error.message;}finally{$('add-button').disabled=false;}});
$('monitor').addEventListener('click',async()=>{try{await post('/api/monitor/'+(monitoring?'pause':'resume'));await refresh();}catch(e){$('action-status').textContent=e.message;}});
$('scanner-control').addEventListener('click',async()=>{try{await post('/api/scanner/'+(scanning?'pause':'start'));await refresh();}catch(e){$('action-status').textContent=e.message;}});
async function poll(){try{await refresh();}catch(e){$('connection').textContent=e.message+' · displayed observations may be stale';}setTimeout(poll,5000);}void poll();

let selectedToken=null,selectedWallet=null;
async function openToken(token){selectedToken=token;selectedWallet=null;$('token-analysis').hidden=false;$('token-analysis').scrollIntoView({behavior:'smooth'});await post('/api/token/index',{token});await renderToken();}
async function renderToken(){
 if(!selectedToken)return;const requested=selectedToken;const r=await fetch('/api/token/history?token='+encodeURIComponent(requested));const data=await r.json();if(requested!==selectedToken)return;
 const panel=$('analysis-body');panel.replaceChildren();const s=data.state;
 panel.append(node('p',requested,'muted'));if(data.error)panel.append(node('p',data.error,'bad'));
 if(!s){panel.append(node('p',data.running?'Locating verified launch and reading metadata. First load may take a minute.':'History unavailable; check RPC diagnostics.'));return;}
 const p=s.profile;panel.append(node('h3',p.name+' ('+p.symbol+')'),node('p','Deployed '+new Date(p.birthAt).toLocaleString()+' · phase '+p.phase));
 const coverage=s.cursor?Number((BigInt(s.cursor)-BigInt(p.birthBlock)+1n)*10000n/(BigInt(p.head)-BigInt(p.birthBlock)+1n))/100:0;
 panel.append(node('p',(data.running?'INDEXING':s.status.toUpperCase())+' · '+coverage.toFixed(2)+'% · blocks '+p.birthBlock+' → '+(s.cursor||'pending')+' / '+p.head+' · '+data.totalEvents+' events'));
 if(s.error)panel.append(node('p',s.error,'bad'));
 panel.append(button(data.running?'Indexing in background':'Resume / update history',()=>post('/api/token/index',{token:requested})));
 const pons=node('a','Open token on Pons ↗');pons.href='https://www.ponsfamily.com/launchpad/'+requested;pons.target='_blank';pons.rel='noreferrer';panel.append(pons);
 panel.append(node('p','Deployer: '+p.deployer));
 const share=BigInt(p.totalSupply)>0n?Number(BigInt(p.deployerBalance)*10000n/BigInt(p.totalSupply))/100:null;
 panel.append(node('p','Deployer balance: '+(share===null?'unknown':share+'% of supply')+' · Creator tax: '+p.creatorTaxBps/100+'% · snapshot block '+p.head));
 const meta=node('details','');meta.append(node('summary','On-chain project metadata'),node('pre',p.metadataError||JSON.stringify(p.metadata,null,2)));panel.append(meta);
 panel.append(node('h3','Wallet behavior'),node('p','Grouped by transaction initiator, not proven beneficial owner. Early buyer: purchase within 30 seconds of launch. Fast exit: sell within 5 minutes of first observed buy. Behavioral flags do not prove bots or investment skill.','muted'));
 const table=node('div','','table-scroll'),t=node('table',''),head=node('tr','');for(const x of ['Initiator','Buys / sells','Quote spent / received','Behavior'])head.append(node('th',x));t.append(head);
 for(const w of data.wallets.slice(0,100)){const row=node('tr',''),address=node('td','');address.append(button(w.address.slice(0,8)+'…'+w.address.slice(-6),async()=>{selectedWallet=w.address;await renderToken();}));row.append(address,node('td',w.buys+' / '+w.sells),node('td',p.pairToken==='0x0000000000000000000000000000000000000000'?eth(w.spent)+' / '+eth(w.received):w.spent+' / '+w.received+' raw units'),node('td',[w.earlyBuyer?'Early buyer (sniper candidate)':'',w.fastExit?'Fast exit (flipper candidate)':'','Smart: not assessed'].filter(Boolean).join(' · ')));t.append(row);}table.append(t);panel.append(table);
 panel.append(node('p','Trade cash flows are not realized profit. Transfers, routing, gas and cross-token performance need reconciliation before a smart-money rating. '+data.coverage,'muted'));
 panel.append(node('h3',selectedWallet?'Transactions initiated by '+selectedWallet:'Lifecycle events'));if(selectedWallet)panel.append(button('Show all participants',async()=>{selectedWallet=null;await renderToken();}));
 for(const e of data.events.filter(e=>!selectedWallet||e.initiator?.toLowerCase()===selectedWallet)){const row=node('article','','event');row.append(node('strong',e.kind.toUpperCase()+' · '+e.venue),node('p',new Date(e.at).toLocaleString()+' · block '+e.blockNumber));if(e.initiator)row.append(node('p','Initiator '+e.initiator));if(e.actor)row.append(node('p','Event actor '+e.actor));if(e.recipient)row.append(node('p','Recipient '+e.recipient));if(e.quote!==null)row.append(node('p','Quote amount '+(p.pairToken==='0x0000000000000000000000000000000000000000'?eth(e.quote):e.quote+' raw units')));const link=node('a','Transaction evidence ↗');link.href='https://robinhoodchain.blockscout.com/tx/'+e.txHash;link.target='_blank';link.rel='noreferrer';row.append(link);const detail=node('details','');detail.append(node('summary','Raw event'),node('pre',JSON.stringify(e,null,2)));row.append(detail);panel.append(row);}
}
$('analyze-form').addEventListener('submit',async e=>{e.preventDefault();try{await openToken($('analyze-address').value.trim());}catch(error){$('analysis-body').textContent=error.message;}});
async function pollAnalysis(){try{await renderToken();}catch(e){$('analysis-status').textContent=e.message;}setTimeout(pollAnalysis,5000);}void pollAnalysis();
