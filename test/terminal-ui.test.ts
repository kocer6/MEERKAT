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

test('terminal client has six route handlers and explicit address fallback',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 for(const route of ['radar','leaderboard','watchlist','activity','token','wallet'])assert.ok(js.includes(`/terminal/${route}`));
 assert.match(js,/OPEN AS WALLET/);
 assert.match(js,/OPEN AS TOKEN/);
 assert.match(js,/popstate/);
 assert.match(js,/captureViewState/);
});

test('leaderboard ranks all evidenced outcomes by default',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 assert.match(js,/get\('\/api\/radar\/leaderboard',\{window:'all',sort:'total-pnl',status:'all'\}\)/);
});

test('token and wallet entities use the shared red amber green score scale',()=>{
 const js=readFileSync('public/terminal.js','utf8'),css=readFileSync('public/terminal.css','utf8');
 assert.match(js,/function scoreTone/);assert.match(js,/score-low/);assert.match(js,/score-mid/);assert.match(js,/score-high/);
 assert.match(css,/\.score-low/);assert.match(css,/\.score-mid/);assert.match(css,/\.score-high/);
});

test('token dossier exposes market intelligence, participant pnl and tape',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 for(const label of ['MARKET INTELLIGENCE','SCORE & CONTRACT','BUYERS 60\+','WHO IS BUYING','WHO STILL HOLDS','THE TAPE'])assert.match(js,new RegExp(label));
 assert.match(js,/participantScores/);assert.match(js,/REALIZED P\/L/);
 assert.match(js,/LOSING/);
});

test('desktop readability floors are encoded in terminal CSS',()=>{
 const css=readFileSync('public/terminal.css','utf8');
 assert.match(css,/--body-size:17px/);assert.match(css,/--table-size:15px/);assert.match(css,/--meta-size:12px/);assert.match(css,/min-height:50px/);
 assert.doesNotMatch(css,/\.metric\{[^}]*border-radius:\s*(?:[1-9][0-9]|[2-9])px/);
});

test('terminal handles empty upstream responses and labels pending metadata honestly',()=>{
 const js=readFileSync('public/terminal.js','utf8');
 assert.match(js,/Service temporarily unavailable\. Retry in a moment\./);
 assert.match(js,/METADATA PENDING/);
 assert.match(js,/'RETRY'/);
 assert.doesNotMatch(js,/item\.symbol\|\|'UNKNOWN'/);
 assert.doesNotMatch(js,/await response\.json\(\)/);
});
