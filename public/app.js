const $ = id => document.getElementById(id);
const control = document.querySelector('meta[name="control-token"]').content;
const eth = value => { const n = BigInt(value); const sign = n < 0n ? '−' : ''; const a = n < 0n ? -n : n; return sign + (a / 10n ** 18n).toString() + '.' + (a % 10n ** 18n).toString().padStart(18, '0').slice(0, 4); };
const el = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; };
async function refresh() {
  const response = await fetch('/api/state'); if (!response.ok) throw new Error('Local engine unavailable');
  const data = await response.json();
  monitorActive=data.monitor.active; $('monitor-toggle').textContent=monitorActive?'Pause position monitoring':'Resume position monitoring'; $('monitor-status').textContent=monitorActive?'Automatic position quotes every 15 seconds after the previous cycle. TP/SL/trailing/hold rules active.':'Position monitoring paused. Automatic exits are not evaluated.';
  $('balance').textContent = eth(data.account.balanceWei) + ' ETH';
  const pnl = data.positions.reduce((sum, p) => sum + BigInt(p.realizedPnlWei), 0n);
  $('pnl').textContent = (pnl > 0n ? '+' : '') + eth(pnl) + ' ETH'; $('pnl').className = pnl >= 0n ? 'green' : '';
  const open = data.positions.filter(p => p.status !== 'closed').length;
  $('open').textContent = String(open).padStart(2, '0'); $('position-count').textContent = String(open);
  $('budget').textContent = eth(BigInt(data.account.spentWei) + BigInt(data.account.reservedWei)) + ' ETH';
  $('empty-positions').hidden = data.positions.length > 0;
  $('position-rows').replaceChildren();
  for (const p of [...data.positions].reverse()) {
    const tr = document.createElement('tr'); const asset = el('td', p.symbol); asset.append(el('small', p.source.toUpperCase() + ' · PAPER')); tr.append(asset);
    for (const text of [p.status.toUpperCase(), eth(p.costWei) + ' ETH', eth(p.lastValueWei) + ' ETH', (BigInt(p.realizedPnlWei) > 0n ? '+' : '') + eth(p.realizedPnlWei) + ' ETH', p.exitReason || '—']) tr.append(el('td', text));
    const actions=el('td','');
    if(p.source==='chain' && p.status==='open') {
      for(const [label,action] of [['Update quote','observe'],['Close paper position','close']]) {
        const button=el('button',label,'inspect-launch'); button.addEventListener('click',async()=>{
          button.disabled=true;
          try { const response=await fetch('/api/paper/'+action+'?id='+encodeURIComponent(p.id),{method:'POST',headers:{'x-control-token':control}}); const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();$('paper-status').textContent='Position '+result.position.status+'. Quote and journal updated.'; }
          catch(error){$('paper-status').textContent=error.message;}
          finally{button.disabled=false;}
        });actions.append(button);
      }
      const health=data.monitor.positions[p.id]; actions.append(el('small',health?.status==='error'?'QUOTE ERROR · '+health.error:monitorActive?'Monitoring active':'Monitoring paused'));
      actions.append(el('small','Last valuation: '+new Date(p.updatedAt).toLocaleTimeString()));
      actions.append(el('small','Unrealized: '+eth(BigInt(p.lastValueWei)-BigInt(p.costWei))+' ETH'));
    }
    tr.append(actions); $('position-rows').append(tr);
  }
  $('events').replaceChildren();
  if (!data.events.length) $('events').append(el('p', 'No events yet. Your decisions will appear here.', 'muted'));
  for (const event of [...data.events].reverse().slice(0, 60)) {
    const row = el('div', '', 'event'); row.append(el('time', new Date(event.at).toLocaleTimeString()), el('span', '', 'dot'));
    const content = document.createElement('div'); content.append(el('strong', event.kind.replaceAll('-', ' ')));
    const d = event.detail; let detail = d.reason || d.error || (d.quote?.source === 'chain' ? 'Chain quote · paper fill' : 'Paper event');
    if (d.quote) detail += d.quote.tokensOut ? ' · input ' + eth(d.quote.spentWei) + ' ETH' : ' · output ' + eth(d.quote.ethOut) + ' ETH';
    if (d.reserveWei) detail = 'Reserved ' + eth(d.reserveWei) + ' ETH before obtaining a quote';
    if (d.valueWei) detail = 'Net position value ' + eth(d.valueWei) + ' ETH';
    content.append(el('small', detail)); row.append(content); $('events').append(row);
  }
  $('health').textContent = 'LOCAL ENGINE CONNECTED · PAPER EXECUTION';
  renderMarket(data);
}
$('run-demo').addEventListener('click', async () => {
  const button = $('run-demo'); button.disabled = true; $('message').textContent = 'Running the paper scenario…';
  try {
    const response = await fetch('/api/demo', { method: 'POST', headers: { 'x-control-token': control } }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Scenario failed');
    await refresh(); $('message').textContent = 'Scenario complete. Open the decision trail to inspect every step.';
  } catch (error) { $('message').textContent = error.message; }
  finally { button.disabled = false; }
});
refresh().catch(error => { $('health').textContent = error.message; });

let marketActive = false;
function renderMarket(data) {
  marketActive = data.marketActive;
  $('market-toggle').textContent = marketActive ? 'Pause chain reads' : 'Connect chain feed ↗';
  const market = data.market;
  const age = market.observedAt ? Math.max(0, Math.floor((Date.now() - market.observedAt) / 1000)) : null;
  $('market-status').textContent = market.status === 'error'
    ? 'RPC error — displayed observations may be stale. ' + market.error
    : market.observedAt ? `${marketActive ? 'Polling every 30s' : 'Paused'} · block ${market.blockNumber} · observed ${age}s ago · ${market.checkedFactoryRecord ? 'factory ABI checked' : 'no event available for ABI check'}`
    : 'Not connected. This reads public launch events; it does not place orders.';
  $('launch-rows').replaceChildren();
  for (const launch of market.launches.slice(0, 15)) {
    const row = document.createElement('tr');
    const token = document.createElement('td'); const link = el('a', launch.token.slice(0, 8) + '…' + launch.token.slice(-6) + ' ↗');
    link.href = 'https://robinhoodchain.blockscout.com/token/' + launch.token; link.target = '_blank'; link.rel = 'noreferrer'; token.append(link); const inspect = el('button', 'Inspect', 'inspect-launch'); inspect.addEventListener('click', () => { inspectionVersion++; inspectedEntry=null; $('paper-buy').disabled=true; $('inspect-token').value = launch.token; $('inspect-result').replaceChildren(); $('inspect-status').textContent = 'Set an amount, then inspect for a current quote.'; $('inspection').scrollIntoView({ behavior: 'smooth' }); }); token.append(inspect); row.append(token);
    row.append(el('td', launch.pairToken === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'Other pair'), el('td', launch.blockNumber), el('td', launch.deployer.slice(0, 8) + '…' + launch.deployer.slice(-6)));
    const tx = document.createElement('td'); const txLink = el('a', 'View transaction ↗'); txLink.href = 'https://robinhoodchain.blockscout.com/tx/' + launch.txHash; txLink.target = '_blank'; txLink.rel = 'noreferrer'; tx.append(txLink); row.append(tx); $('launch-rows').append(row);
  }
  $('market-empty').hidden = market.launches.length > 0;
}
$('market-toggle').addEventListener('click', async () => {
  $('market-toggle').disabled = true;
  $('market-status').textContent = marketActive ? 'Pausing…' : 'Checking chain, factory and launch records…';
  try {
    const result = await fetch('/api/market/' + (marketActive ? 'stop' : 'start'), { method: 'POST', headers: { 'x-control-token': control } });
    if (!result.ok) throw new Error('Market control failed'); await refresh();
  } catch (error) { $('market-status').textContent = error.message; }
  finally { $('market-toggle').disabled = false; }
});
setInterval(() => { refresh().catch(error => { $('health').textContent = error.message; }); }, 5000);

let monitorActive=true;
let inspectionVersion = 0; let inspectedEntry = null;
$('inspect-form').addEventListener('input', () => { inspectionVersion++; inspectedEntry=null; $('paper-buy').disabled=true; $('inspect-result').replaceChildren(); $('inspect-status').textContent = 'Inputs changed. Inspect again for a current quote.'; });
$('inspect-form').addEventListener('submit', async event => {
  event.preventDefault(); inspectedEntry=null; $('paper-buy').disabled=true; const version = ++inspectionVersion;
  $('inspect-submit').disabled = true; $('inspect-result').replaceChildren(); $('inspect-status').textContent = 'Reading a single chain block and checking the curve…';
  try {
    const query = new URLSearchParams({ token: $('inspect-token').value.trim(), amount: $('inspect-amount').value.trim() });
    const response = await fetch('/api/inspect?' + query, { method: 'POST', headers: { 'x-control-token': control } });
    const result = await response.json(); if (version !== inspectionVersion) return;
    if (!response.ok) throw new Error(result.error);
    $('inspect-status').textContent = `${result.symbol} · block ${result.blockNumber} · ${new Date(result.observedAt).toLocaleTimeString()} · ${result.reasons.length ? result.reasons.join('; ') : 'Curve quotes available'}`;
    const amount = (value, decimals) => { const n = BigInt(value); const unit = 10n ** BigInt(decimals); return (n / unit).toString() + (decimals ? '.' + (n % unit).toString().padStart(decimals, '0').slice(0, 6) : ''); };
    const rows = [
      ['Token', result.token], ['Phase', ['Curve', 'Swept', 'Pool', 'Rescued'][result.phase] || 'Unknown'],
      ['Opening tax', result.openingTaxBps === null ? 'Unknown — buy quote blocked' : result.openingTaxBps / 100 + '%'],
      ['Protocol / creator fee', result.feeBps === null ? 'Unavailable' : result.feeBps / 100 + '% / ' + result.creatorTaxBps / 100 + '%'],
      ['Real ETH reserve', result.realQuoteReserveWei === null ? 'Unknown' : eth(result.realQuoteReserveWei) + ' ETH'],
      ['Quoted tokens', result.buy ? amount(result.buy.tokensOut, result.decimals) + ' ' + result.symbol : 'Unavailable'],
      ['Quoted spend / refund', result.buy ? amount(result.buy.spentWei, 18) + ' / ' + amount(result.buy.refundWei, 18) + ' ETH' : 'Unavailable'],
      ['Sell estimate at same block', result.sellBackWei === null ? 'Unavailable' : amount(result.sellBackWei, 18) + ' ETH'],
    ];
    for (const [label, value] of rows) { const row = document.createElement('div'); row.append(el('dt', label), el('dd', value)); $('inspect-result').append(row); }
    $('inspect-result').append(el('p', result.quoteModel, 'muted'));
    for(const check of result.assessment.checks) $('inspect-result').append(el('p',(check.pass?'PASS · ':'BLOCK · ')+check.label,'muted'));
    $('inspect-result').append(el('p',result.assessment.scope,'muted'));
    inspectedEntry={token:result.token,amount:$('inspect-amount').value.trim(),orderId:crypto.randomUUID()};
    $('paper-buy').disabled=!result.assessment.eligible;
    $('paper-status').textContent=result.assessment.eligible?'Entry checks passed. Opening rechecks a fresh quote.':'Entry blocked by the checks above.';
  } catch (error) { if (version === inspectionVersion) $('inspect-status').textContent = error.message; }
  finally { $('inspect-submit').disabled = false; }
});

$('paper-buy').addEventListener('click',async()=>{
 if(!inspectedEntry)return; const entry=inspectedEntry; $('paper-buy').disabled=true;
 try{const response=await fetch('/api/paper/buy?'+new URLSearchParams(entry),{method:'POST',headers:{'x-control-token':control}});const result=await response.json();if(!response.ok)throw new Error(result.error);
 inspectedEntry=null;await refresh();$('paper-status').textContent='Paper position opened. Automatic monitoring follows the status in Positions; Update quote and Close remain available.';
 }catch(error){$('paper-status').textContent=error.message+' Inspect again before retrying.';}
});

$('monitor-toggle').addEventListener('click',async()=>{const b=$('monitor-toggle');b.disabled=true;try{const r=await fetch('/api/monitor/'+(monitorActive?'stop':'start'),{method:'POST',headers:{'x-control-token':control}});if(!r.ok)throw new Error('Monitor control failed');await refresh();}catch(e){$('monitor-status').textContent=e.message;}finally{b.disabled=false;}});
