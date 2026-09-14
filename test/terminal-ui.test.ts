import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('terminal exposes four destinations and no Analyze navigation',()=>{
 const html=readFileSync('public/terminal.html','utf8');
 assert.match(html,/data-route="\/terminal\/radar"/);
 assert.match(html,/data-route="\/terminal\/leaderboard"/);
 assert.match(html,/data-route="\/terminal\/watchlist"/);
 assert.match(html,/data-route="\/terminal\/activity"/);
 assert.doesNotMatch(html,/>\s*ANALYZE\s*</i);
 assert.match(html,/id="global-search"/);
});

test('terminal client has six route handlers and explicit wallet fallback',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 for(const route of ['radar','leaderboard','watchlist','activity','token','wallet'])assert.ok(js.includes(`/terminal/${route}`));
 assert.match(js,/OPEN AS WALLET/);
 assert.match(js,/popstate/);
 assert.match(js,/captureViewState/);
});

test('leaderboard ranks all evidenced outcomes by default',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 assert.match(js,/get\('\/api\/radar\/leaderboard',\{window:'all',sort:'total-pnl',status:'all'\}\)/);
});

test('entity links are green only on hover or focus',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/\.entity-link\{[^}]*color:var\(--sand\)/);
 assert.match(css,/\.entity-link:is\(:hover,:focus-visible\)\{[^}]*color:var\(--green\)/);
});

test('desktop readability floors are encoded in terminal CSS',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/--body-size:17px/);assert.match(css,/--table-size:15px/);assert.match(css,/--meta-size:12px/);assert.match(css,/min-height:50px/);
 assert.doesNotMatch(css,/\.metric\{[^}]*border-radius:\s*(?:[1-9][0-9]|[2-9])px/);
});
