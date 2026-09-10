import { createServer, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Ledger } from './ledger.js';
import { PaperEngine } from './paper.js';
import { defaultRules } from './rules.js';
import { encode } from './types.js';
import { PonsDiscovery, rpcReader } from './chain/discovery.js';
import { inspectToken, marketReader, type MarketReader } from './chain/market.js';
import { parseEther } from 'viem';
import { assessEntry, MarketTrading, paperGasWei } from './market-trading.js';

export async function startServer(options: { port: number; database: string; discovery?: PonsDiscovery; market?: MarketReader }) {
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error('invalid port');
  const ledger = new Ledger(options.database, 1000000000000000000n, 500000000000000000n);
  ledger.recover(Date.now()); const engine = new PaperEngine(ledger, defaultRules);
  const controlToken = randomBytes(32).toString('hex');
  const assets = new Map([
    ['/', { type: 'text/html; charset=utf-8', body: readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace('__CONTROL_TOKEN__', controlToken) }],
    ['/app.js', { type: 'text/javascript; charset=utf-8', body: readFileSync(new URL('../public/app.js', import.meta.url), 'utf8') }],
    ['/style.css', { type: 'text/css; charset=utf-8', body: readFileSync(new URL('../public/style.css', import.meta.url), 'utf8') }],
    ['/assets/meerkat-desert.png', { type: 'image/png', body: readFileSync(new URL('../public/assets/meerkat-desert.png', import.meta.url)) }],
    ['/assets/press-start-2p.ttf', { type: 'font/ttf', body: readFileSync(new URL('../public/assets/press-start-2p.ttf', import.meta.url)) }],
  ]);
  const discovery = options.discovery ?? new PonsDiscovery(rpcReader());
  const market = options.market ?? marketReader(); let inspectionBusy = false;
  const trading = new MarketTrading(engine, market);
  let url = ''; let scenarioBusy = false; let marketActive = false; let marketRun = 0; let marketTimer: NodeJS.Timeout | undefined;
  const pollMarket = async (run: number) => {
    await discovery.refresh();
    if (marketActive && marketRun === run) marketTimer = setTimeout(() => { void pollMarket(run); }, 30000);
  };
  const send = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(encode(data)); };
  const snapshot = () => ({ mode: 'paper', source: 'mixed', paperGasWei, marketActive, market: discovery.snapshot(), account: ledger.account(), positions: ledger.positions(), events: ledger.events(), rules: engine.rules, scenarioBusy });
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== new URL(url).host || (req.headers.origin && req.headers.origin !== url)) { send(res, 403, { error: 'untrusted host or origin' }); return; }
    const path = new URL(req.url ?? '/', url).pathname;
    try {
      if (req.method === 'GET') {
        const asset = assets.get(path);
        if (asset) { res.writeHead(200, { 'content-type': asset.type }); res.end(asset.body); return; }
        if (path === '/api/state') { send(res, 200, snapshot()); return; }
        if (path === '/api/export') { res.setHeader('Content-Disposition', 'attachment; filename="meerkat-paper-journal.json"'); send(res, 200, snapshot()); return; }
      }
      if (req.method === 'POST') {
        const supplied = req.headers['x-control-token'];
        if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(controlToken) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(controlToken))) { send(res, 403, { error: 'control token required' }); return; }
        if (path === '/api/paper/close' || path === '/api/paper/observe') {
          const id = new URL(req.url!, url).searchParams.get('id') ?? '';
          try { send(res, 200, { position: path.endsWith('/close') ? await trading.close(id) : await trading.observe(id) }); }
          catch (error) { send(res, 400, { error: (error as Error).message.split('\n')[0]!.replace(/https?:\/\/\S+/g, '[RPC endpoint]') }); }
          return;
        }
        if (path === '/api/inspect' || path === '/api/paper/buy') {
          if (inspectionBusy) { send(res, 409, { error: 'An inspection is already running' }); return; }
          const params = new URL(req.url!, url).searchParams;
          const amount = params.get('amount') ?? '';
          if (!/^(?:0|1)(?:\.\d{1,18})?$/.test(amount)) throw new Error('Enter an ETH amount between 0 and 1, with at most 18 decimals');
          inspectionBusy = true;
          try {
            if (path === '/api/paper/buy') {
              const orderId = params.get('orderId') ?? '';
              if (!/^[a-zA-Z0-9-]{8,80}$/.test(orderId)) throw new Error('valid orderId required');
              send(res, 200, { position: await trading.buy(params.get('token') ?? '', parseEther(amount), orderId) });
            } else {
              const result = await inspectToken(market, params.get('token') ?? '', parseEther(amount));
              send(res, 200, { ...result, assessment: assessEntry(result, engine.rules) });
            }
          }
          catch (error) { send(res, 400, { error: (error as Error).message.split('\n')[0]!.replace(/https?:\/\/\S+/g, '[RPC endpoint]') }); }
          finally { inspectionBusy = false; }
          return;
        }
        if (path === '/api/market/start') {
          if (!marketActive) { marketActive = true; await pollMarket(++marketRun); }
          send(res, 200, discovery.snapshot()); return;
        }
        if (path === '/api/market/stop') {
          marketActive = false; marketRun++; if (marketTimer) clearTimeout(marketTimer);
          send(res, 200, { marketActive }); return;
        }
        if (path === '/api/demo') {
          if (scenarioBusy) { send(res, 409, { error: 'demo already running' }); return; }
          scenarioBusy = true;
          try {
            const p = await engine.buy({ token: '0x1111111111111111111111111111111111111111', symbol: 'DEMO', amountWei: 100000000000000000n, score: 80, openingTaxBps: 0, source: 'synthetic' }, randomUUID(), async () => ({ tokensOut: 1000000000000000000000n, spentWei: 100000000000000000n, gasWei: 0n, observedAt: Date.now(), source: 'synthetic' }));
            const position = await engine.observe(p.id, { ethOut: 140000000000000000n, gasWei: 0n, observedAt: Date.now(), source: 'synthetic' });
            send(res, 200, { position });
          } finally { scenarioBusy = false; }
          return;
        }
      }
      send(res, 404, { error: 'not found' });
    } catch (error) { send(res, 400, { error: error instanceof Error ? error.message : 'request failed' }); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(options.port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing bound address');
  url = `http://127.0.0.1:${address.port}`;
  return { url, close: () => new Promise<void>((resolve, reject) => {
    marketActive = false; marketRun++; if (marketTimer) clearTimeout(marketTimer);
    server.close(error => { ledger.close(); error ? reject(error) : resolve(); }); server.closeIdleConnections();
  }) };
}
