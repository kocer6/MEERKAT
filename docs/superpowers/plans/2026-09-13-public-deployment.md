# MEERKAT Public Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing MEERKAT landing page and evidence terminal at `https://meerkat.my` with bounded public indexing, private operator controls, durable SQLite storage, HTTPS, backups, and verified restart recovery.

**Architecture:** Keep one Node.js process and one SQLite database. Caddy terminates public HTTP/TLS and proxies to MEERKAT on loopback; an in-process admission controller limits and deduplicates asynchronous index work while public mode removes the browser control token and hides local operator endpoints.

**Tech Stack:** Node.js 24, TypeScript 5.9, `node:http`, `node:sqlite`, `node:test`, Caddy, systemd, Ubuntu 22.04, Porkbun DNS.

**Spec:** `docs/superpowers/specs/2026-09-13-public-deployment-design.md`

## Global Constraints

- The public service accepts public token and wallet addresses without an account.
- The service contains no private key, signer, approval, transaction construction, or broadcast path.
- Node listens only on `127.0.0.1:4664`; Caddy alone owns public ports 80 and 443.
- Production state is `/var/lib/meerkat/observer.sqlite`; code lives at `/opt/meerkat/app`.
- At most two index jobs run, at most twenty distinct jobs wait, and one client may admit five new jobs per ten minutes.
- Application changes reach `origin/main` before deployment.
- Public operator routes return `404`; maintenance is performed through SSH and systemd.
- Existing local mode and its tests continue to work.

## File map

- `src/token-history.ts`: expose index-job settlement and a bounded SQLite health probe.
- `src/index-admission.ts`: validate, deduplicate, rate-limit, queue, and drain public index requests.
- `src/observer-server.ts`: deployment options, trusted-host/origin handling, public route policy, health route, and client-IP extraction.
- `src/cli.ts`: map environment variables into observer deployment options.
- `public/terminal.html`: make the control-token meta tag removable in public mode.
- `public/terminal.js`: send a control header only when local HTML supplies one.
- `test/token-history.test.ts`: settlement and database-health contracts.
- `test/index-admission.test.ts`: admission behavior in isolation.
- `test/observer-server.test.ts`: public-mode route, host, origin, health, and secret-removal integration tests.
- `deploy/Caddyfile`: apex HTTPS proxy and canonical `www` redirect.
- `deploy/meerkat.service`: hardened systemd application unit.
- `deploy/meerkat.env.example`: explicit production environment contract without secrets.
- `deploy/meerkat-backup`: online SQLite backup, integrity check, and retention.
- `deploy/meerkat-backup.service`: one-shot backup unit.
- `deploy/meerkat-backup.timer`: daily backup schedule.
- `deploy/install.sh`: repeatable Ubuntu package, user, directory, checkout, build, and unit installation.
- `docs/DEPLOYMENT.md`: operator install, update, rollback, backup, restore-test, and DNS guide.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/LOCAL-SETUP.md`, `SECURITY.md`, `PLAN.md`, `HANDOFF.md`: public-hosting status and documentation links.

---

### Task 1: Expose index settlement and SQLite health

**Files:**
- Modify: `src/token-history.ts:60-136`
- Modify: `test/token-history.test.ts`

**Interfaces:**
- Produces: `HistoryStore.health(): boolean`.
- Produces: `TokenHistory.start(raw: string): Promise<void>`; a duplicate active token returns the same Promise and a completed run resolves after its final state is persisted.
- Consumes: existing `TokenHistory.run(token): Promise<void>` behavior, including internal error persistence.

- [ ] **Step 1: Write failing tests for settlement and health**

Add tests that use the real in-memory store and a controlled reader:

```ts
test('history start returns the active job and settles after persistence',async()=>{
 const store=new HistoryStore(':memory:'),reader={profile:async()=>profile,chunk:async()=>events};
 const history=new TokenHistory(store,reader);
 const first=history.start(profile.token),duplicate=history.start(profile.token);
 assert.equal(first,duplicate);
 await first;
 assert.equal(store.state(profile.token)?.status,'ready');
 await history.close();
});

test('history store health executes a SQLite probe',()=>{
 const store=new HistoryStore(':memory:');
 try{assert.equal(store.health(),true);}finally{store.close();}
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --import tsx --test --test-name-pattern="history start returns|history store health" test/token-history.test.ts`

Expected: compilation/test failure because `start` returns `void` and `health` does not exist.

- [ ] **Step 3: Implement the minimum contracts**

Add the health probe:

```ts
health(){return (this.db.prepare('SELECT 1 AS ok').get() as {ok:number}).ok===1;}
```

Change `TokenHistory.start` so duplicate work returns the stored Promise and new work returns the Promise after inserting it into `pending`:

```ts
start(raw:string):Promise<void>{
 if(!isAddress(raw))throw new Error('Invalid token address');
 const token=raw.toLowerCase();
 if(this.stopped)throw new Error('History service stopped');
 const active=this.pending.get(token);if(active)return active;
 if(this.pending.size>=2)throw new Error('Two history jobs already running');
 this.failures.delete(token);
 const existing=this.store.state(token);
 if(existing&&existing.indexVersion!==historyIndexVersion)this.store.restart({...existing,status:'indexing',error:null,updatedAt:Date.now()});
 const work=this.run(token).finally(()=>this.pending.delete(token));
 this.pending.set(token,work);
 return work;
}
```

- [ ] **Step 4: Run focused and full token-history tests**

Run: `node --import tsx --test test/token-history.test.ts`

Expected: all token-history tests pass and no unhandled Promise rejection appears.

- [ ] **Step 5: Commit the isolated contract change**

```bash
git add src/token-history.ts test/token-history.test.ts
git commit -m "refactor: expose token index settlement"
```

---

### Task 2: Add the public index admission controller

**Files:**
- Create: `src/index-admission.ts`
- Create: `test/index-admission.test.ts`

**Interfaces:**
- Consumes: `start(token: string): Promise<void>` supplied by `TokenHistory.start`.
- Produces: `new IndexAdmission(start, options)`.
- Produces: `admit(rawToken: string, clientId: string, now?: number): { state: 'started'|'active'|'queued'; token: string }`.
- Produces: `IndexAdmissionError` with `status: 400|429`, `retryAfter?: number`, and a public-safe message.

- [ ] **Step 1: Write failing behavioral tests**

Create real deferred jobs instead of mocking internal maps:

```ts
test('admission validates, deduplicates, queues and drains jobs',async()=>{
 const releases=new Map<string,()=>void>(),started:string[]=[];
 const admission=new IndexAdmission(token=>new Promise<void>(resolve=>{started.push(token);releases.set(token,resolve);}),{maxActive:2,maxQueued:20,maxPerWindow:5,windowMs:600000});
 assert.throws(()=>admission.admit('bad','client'),(error:IndexAdmissionError)=>error.status===400);
 assert.equal(admission.admit(a,'client').state,'started');
 assert.equal(admission.admit(a,'client').state,'active');
 assert.equal(admission.admit(b,'client').state,'started');
 assert.equal(admission.admit(c,'client').state,'queued');
 releases.get(a)!();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(started,[a,b,c]);
});

test('admission enforces client and queue limits',()=>{
 const admission=new IndexAdmission(()=>new Promise<void>(()=>{}),{maxActive:1,maxQueued:1,maxPerWindow:2,windowMs:600000});
 admission.admit(a,'client',0);
 admission.admit(b,'client',1);
 assert.throws(()=>admission.admit(c,'client',2),(error:IndexAdmissionError)=>error.status===429&&error.retryAfter===600);
 assert.throws(()=>admission.admit(c,'other',2),(error:IndexAdmissionError)=>error.status===429);
});
```

Use three nonzero 40-byte EVM addresses for `a`, `b`, and `c`. Add a test that a queued duplicate returns `queued` without consuming another rate-limit admission.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --import tsx --test test/index-admission.test.ts`

Expected: module-not-found failure for `src/index-admission.ts`.

- [ ] **Step 3: Implement the controller**

Implement a focused class with these private collections:

```ts
private active=new Map<string,Promise<void>>();
private queued:string[]=[];
private queuedSet=new Set<string>();
private admissions=new Map<string,number[]>();
```

`admit` must:

1. reject invalid and zero addresses with `IndexAdmissionError(400, 'Invalid token address')`;
2. normalize with `rawToken.toLowerCase()`;
3. return `active` or `queued` before recording a rate-limit hit;
4. retain only timestamps where `at > now-windowMs`;
5. reject the sixth new admission with status `429` and `retryAfter = Math.max(1, Math.ceil((oldest+windowMs-now)/1000))`;
6. start immediately when `active.size < maxActive`;
7. otherwise enqueue unless `queued.length >= maxQueued`;
8. attach `.finally(() => { active.delete(token); drain(); })` and swallow only the controller's observation branch, because `TokenHistory` persists its own error state.

Do not add timers, persistence, Redis, or generic middleware.

- [ ] **Step 4: Run focused tests**

Run: `node --import tsx --test test/index-admission.test.ts`

Expected: all admission tests pass.

- [ ] **Step 5: Commit the admission controller**

```bash
git add src/index-admission.ts test/index-admission.test.ts
git commit -m "feat: bound public token indexing"
```

---

### Task 3: Integrate public mode into the observer server

**Files:**
- Modify: `src/observer-server.ts`
- Modify: `src/cli.ts`
- Modify: `public/terminal.html`
- Modify: `public/terminal.js`
- Modify: `test/observer-server.test.ts`

**Interfaces:**
- Consumes: `IndexAdmission.admit(token, clientId)` from Task 2.
- Produces: `startObserver({ port, database, market?, discovery?, publicMode?, publicOrigin?, trustedHosts? })`.
- Produces environment variables `MEERKAT_PUBLIC`, `MEERKAT_PUBLIC_ORIGIN`, and `MEERKAT_TRUSTED_HOSTS`.
- Produces `GET /healthz` and public-mode routing described by the spec.

- [ ] **Step 1: Add failing public-mode integration tests**

Add a helper so every public test supplies the expected host:

```ts
const publicFetch=(app:{url:string},path:string,init:RequestInit={})=>fetch(app.url+path,{...init,headers:{host:'meerkat.my','x-forwarded-for':'198.51.100.10',...init.headers}});
```

Add tests covering:

```ts
test('public mode exposes analysis without leaking local controls',async()=>{
 const app=await startObserver({port:0,database:':memory:',publicMode:true,publicOrigin:'https://meerkat.my',trustedHosts:['meerkat.my','www.meerkat.my']});
 try{
  const terminal=await (await publicFetch(app,'/terminal')).text();
  assert.doesNotMatch(terminal,/control-token|__CONTROL_TOKEN__/);
  assert.equal((await publicFetch(app,'/healthz')).status,200);
  assert.equal((await publicFetch(app,'/api/state')).status,404);
  assert.equal((await publicFetch(app,'/api/watch/add?token=bad',{method:'POST'})).status,404);
  assert.equal((await publicFetch(app,'/api/token/index?token=bad',{method:'POST'})).status,400);
  assert.equal((await publicFetch(app,'/',{headers:{host:'evil.example'}})).status,403);
  assert.equal((await publicFetch(app,'/',{headers:{origin:'https://evil.example'}})).status,403);
 }finally{await app.close();}
});
```

Retain existing tests proving local mode still embeds and requires its control token. Add a `429` integration test by injecting an admission policy with smaller limits or by exposing admission limits through test-only `startObserver` options typed as normal dependency injection, never through production environment variables.

- [ ] **Step 2: Run the observer tests and verify RED**

Run: `node --import tsx --test test/observer-server.test.ts`

Expected: TypeScript rejects the new options and current HTML still contains the control token.

- [ ] **Step 3: Implement host, origin, and route policy**

In `startObserver`:

- keep the bind address `127.0.0.1`;
- derive local trusted host only after `server.address()` is known;
- in public mode require an HTTPS `publicOrigin` and a nonempty trusted-host list;
- compare `req.headers.host?.toLowerCase()` against exact normalized entries;
- accept `Origin` only when absent or exactly equal to `publicOrigin`;
- render terminal HTML by removing the complete control-token meta tag in public mode and replacing the placeholder in local mode;
- instantiate one `IndexAdmission(token => history.start(token), limits)`;
- dispatch public-safe routes before local operator routes;
- set `Retry-After` from `IndexAdmissionError.retryAfter` on a `429` response;
- use `req.socket.remoteAddress` locally and the first normalized `x-forwarded-for` value publicly;
- return `404` for operator routes in public mode;
- make `/healthz` call `historyStore.health()` without RPC access.

Do not bind Node to `0.0.0.0` and do not trust arbitrary forwarded hosts.

- [ ] **Step 4: Make the terminal header conditional**

Keep the existing local meta placeholder but change the JavaScript bootstrap and POST helper:

```js
const control=document.querySelector('meta[name="control-token"]')?.content||'';
async function post(path,params={}){
 const headers=control?{'x-control-token':control}:{};
 const response=await fetch(path+'?'+new URLSearchParams(params),{method:'POST',headers});
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||'Request failed');
 return body;
}
```

No other browser flow changes in this task.

- [ ] **Step 5: Map CLI environment configuration**

Parse the environment exactly once in `src/cli.ts`:

```ts
const publicMode=process.env.MEERKAT_PUBLIC==='1';
const app=await startObserver({
 port:Number(process.env.PORT??4664),
 database:process.env.MEERKAT_DB??'data/observer.sqlite',
 publicMode,
 publicOrigin:publicMode?process.env.MEERKAT_PUBLIC_ORIGIN:undefined,
 trustedHosts:publicMode?(process.env.MEERKAT_TRUSTED_HOSTS??'').split(',').map(value=>value.trim()).filter(Boolean):undefined,
});
```

Reject a non-finite or out-of-range port before starting the server.

- [ ] **Step 6: Run focused and full application verification**

Run:

```bash
node --import tsx --test test/observer-server.test.ts test/index-admission.test.ts test/token-history.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all commands pass; the full suite reports at least the existing 115 tests plus the new coverage.

- [ ] **Step 7: Commit public application mode**

```bash
git add src/observer-server.ts src/cli.ts public/terminal.html public/terminal.js test/observer-server.test.ts
git commit -m "feat: add safe public observer mode"
```

---

### Task 4: Add deployment artifacts and operator documentation

**Files:**
- Create: `deploy/Caddyfile`
- Create: `deploy/meerkat.service`
- Create: `deploy/meerkat.env.example`
- Create: `deploy/meerkat-backup`
- Create: `deploy/meerkat-backup.service`
- Create: `deploy/meerkat-backup.timer`
- Create: `deploy/install.sh`
- Create: `docs/DEPLOYMENT.md`
- Modify: `test/docs.test.ts`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/LOCAL-SETUP.md`
- Modify: `SECURITY.md`
- Modify: `PLAN.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: public environment variables from Task 3.
- Produces: `meerkat.service`, `meerkat-backup.service`, and `meerkat-backup.timer` systemd units.
- Produces: Caddy virtual hosts for `meerkat.my` and `www.meerkat.my`.

- [ ] **Step 1: Add failing documentation and deployment contract tests**

Extend `test/docs.test.ts` to require the deployment guide and exact artifacts:

```ts
for(const file of ['docs/DEPLOYMENT.md','deploy/Caddyfile','deploy/meerkat.service','deploy/meerkat.env.example','deploy/meerkat-backup','deploy/meerkat-backup.service','deploy/meerkat-backup.timer','deploy/install.sh']){
 assert.equal(existsSync(file),true,`${file} must exist`);
}
const unit=readFileSync('deploy/meerkat.service','utf8');
assert.match(unit,/User=meerkat/);
assert.match(unit,/127\.0\.0\.1/);
assert.doesNotMatch(unit,/PRIVATE_KEY|SEED|MNEMONIC/);
const caddy=readFileSync('deploy/Caddyfile','utf8');
assert.match(caddy,/meerkat\.my/);
assert.match(caddy,/reverse_proxy 127\.0\.0\.1:4664/);
```

- [ ] **Step 2: Run docs tests and verify RED**

Run: `node --import tsx --test test/docs.test.ts`

Expected: failure because the deployment artifacts do not exist.

- [ ] **Step 3: Write the Caddy and environment contracts**

`deploy/Caddyfile` must contain an apex reverse proxy with request-body protection and a canonical redirect:

```caddy
www.meerkat.my {
  redir https://meerkat.my{uri} permanent
}

meerkat.my {
  request_body {
    max_size 16KB
  }
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  reverse_proxy 127.0.0.1:4664
}
```

`deploy/meerkat.env.example` contains only:

```ini
NODE_ENV=production
PORT=4664
MEERKAT_PUBLIC=1
MEERKAT_PUBLIC_ORIGIN=https://meerkat.my
MEERKAT_TRUSTED_HOSTS=meerkat.my,www.meerkat.my
MEERKAT_DB=/var/lib/meerkat/observer.sqlite
MEERKAT_RPC_URL=https://rpc.mainnet.chain.robinhood.com
```

- [ ] **Step 4: Write the hardened application unit**

The service must use `/usr/bin/node /opt/meerkat/app/dist/src/cli.js serve`, `User=meerkat`, `Group=meerkat`, `EnvironmentFile=/etc/meerkat/meerkat.env`, `WorkingDirectory=/opt/meerkat/app`, `Restart=on-failure`, and `RestartSec=5`. Apply `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateDevices=true`, and `ReadWritePaths=/var/lib/meerkat`.

Do not grant Linux capabilities. Order the service after `network-online.target` and install it into `multi-user.target`.

- [ ] **Step 5: Write online backup and timer artifacts**

`deploy/meerkat-backup` must run as root with `set -euo pipefail`, create a mode-0700 backup directory, call:

```bash
sqlite3 /var/lib/meerkat/observer.sqlite ".timeout 5000" ".backup '/var/backups/meerkat/observer-${stamp}.sqlite'"
sqlite3 "$backup" "PRAGMA quick_check; SELECT count(*) FROM token_history;"
find /var/backups/meerkat -type f -name 'observer-*.sqlite' -mtime +7 -delete
```

The one-shot service uses `UMask=0077`. The timer uses `OnCalendar=daily`, `Persistent=true`, and `RandomizedDelaySec=15m`.

- [ ] **Step 6: Write the repeatable installer**

`deploy/install.sh` must:

- require root and exit otherwise;
- install `git`, `curl`, `ca-certificates`, `gnupg`, `sqlite3`, and `ufw`;
- configure maintained NodeSource Node.js 24 and official Caddy apt repositories;
- create the locked `meerkat` user and required directories;
- clone `https://github.com/kocer6/MEERKAT.git` into `/opt/meerkat/app` only when absent, otherwise fast-forward `main`;
- copy the environment example only when `/etc/meerkat/meerkat.env` does not exist;
- run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` as `meerkat`;
- install units and scripts with explicit ownership and modes;
- validate Caddy before reload;
- enable `meerkat`, `caddy`, and the backup timer;
- allow `OpenSSH`, `80/tcp`, and `443/tcp` in UFW before enabling it.

The installer must not change SSH authentication, DNS, or root credentials. Those steps require separate verification so a script failure cannot lock out the operator.

- [ ] **Step 7: Document install, update, rollback, and recovery**

`docs/DEPLOYMENT.md` must provide exact commands for:

- SSH-key bootstrap and second-session verification;
- disabling `PasswordAuthentication` only after key login succeeds;
- running `deploy/install.sh`;
- local health checks with `curl -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz`;
- Porkbun apex `A` and `www` `CNAME` records;
- service, Caddy, firewall, and listening-socket inspection;
- fast-forward update and previous-commit rollback;
- manual backup, backup listing, temporary restore verification, and production restore while the service is stopped.

Link this guide from the README documentation table. Update architecture/security/local setup and project handoff status without claiming the site is live before external verification.

- [ ] **Step 8: Run documentation and full verification**

Run:

```bash
node --import tsx --test test/docs.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all commands pass and every local Markdown link resolves.

- [ ] **Step 9: Commit and push the deployable release**

```bash
git add deploy docs README.md SECURITY.md PLAN.md HANDOFF.md test/docs.test.ts
git commit -m "ops: add production deployment kit"
git push origin main
git ls-remote origin refs/heads/main
```

Expected: the remote `main` hash equals local `HEAD`.

---

### Task 5: Bootstrap and harden VPS access

**Files:**
- Create outside repository: `%USERPROFILE%/.ssh/meerkat_xorek_ed25519`
- Modify on VPS: `/root/.ssh/authorized_keys`
- Modify on VPS: `/etc/ssh/sshd_config.d/60-meerkat-hardening.conf`

**Interfaces:**
- Consumes: XorekCloud VMmanager web console and public IP `2.26.61.52`.
- Produces: verified key-only SSH access from the local workstation.

- [ ] **Step 1: Generate a dedicated local key if absent**

Run:

```powershell
ssh-keygen -t ed25519 -a 64 -f "$env:USERPROFILE/.ssh/meerkat_xorek_ed25519" -C "meerkat-xorek-2026-09-13"
```

Do not overwrite an existing key. Keep the private key local and copy only the `.pub` content through the provider console.

- [ ] **Step 2: Install the public key through VMmanager console**

In the authenticated VMmanager console, log in as root, create `/root/.ssh` with mode `0700`, append the exact public key as one line to `/root/.ssh/authorized_keys`, set mode `0600`, and leave the console open.

- [ ] **Step 3: Verify a separate key-authenticated SSH session**

Run:

```powershell
ssh -i "$env:USERPROFILE/.ssh/meerkat_xorek_ed25519" -o IdentitiesOnly=yes root@2.26.61.52 "id; hostnamectl; uname -a"
```

Expected: UID 0 and Ubuntu host facts, without a password prompt.

- [ ] **Step 4: Rotate the exposed root password**

Use `passwd` inside the provider console. Generate the replacement locally, enter it only into the console, and do not save it in the repository, shell history, task response, or application environment.

- [ ] **Step 5: Disable SSH password authentication**

Write:

```text
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
```

to `/etc/ssh/sshd_config.d/60-meerkat-hardening.conf`, run `sshd -t`, reload `ssh`, and verify a new key-authenticated session before closing the console.

- [ ] **Step 6: Capture the security baseline**

Run `ss -lntup`, `ufw status verbose`, `systemctl --failed`, `df -h`, and `free -h`. Record only non-secret results in the deployment evidence section of `HANDOFF.md` after the deployment is complete.

---

### Task 6: Install MEERKAT and verify loopback production

**Files:**
- Deploy repository to: `/opt/meerkat/app`
- Create from template: `/etc/meerkat/meerkat.env`
- Persist database at: `/var/lib/meerkat/observer.sqlite`

**Interfaces:**
- Consumes: verified key SSH from Task 5 and deployment artifacts from Task 4.
- Produces: healthy MEERKAT and Caddy services before DNS cutover.

- [ ] **Step 1: Run the installer at the verified Git commit**

Clone `origin/main`, confirm `git rev-parse HEAD` matches the remote hash captured in Task 4, then run `sudo bash deploy/install.sh`.

- [ ] **Step 2: Verify configuration and confinement**

Run:

```bash
systemctl is-active meerkat caddy
systemctl is-enabled meerkat caddy meerkat-backup.timer
systemd-analyze security meerkat.service
ss -lntup
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: meerkat.my' http://127.0.0.1:4664/api/state
```

Expected: both services active, Node only on `127.0.0.1:4664`, health `200`, and public `/api/state` `404`.

- [ ] **Step 3: Verify restart persistence**

Start indexing HOP OUT through loopback using token `0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8`, wait until a cursor is persisted, record that cursor, restart `meerkat.service`, and verify the same or later cursor appears afterward.

- [ ] **Step 4: Run and verify an online backup**

Start `meerkat-backup.service`, require a successful unit exit, locate the newest backup, run `sqlite3 "$backup" 'PRAGMA quick_check;'`, and require exactly `ok`.

- [ ] **Step 5: Inspect failure logs before DNS**

Run `journalctl -u meerkat -u caddy --since '-15 minutes' --no-pager` and resolve any startup, permission, database, proxy, or RPC errors before changing DNS.

---

### Task 7: Configure DNS, obtain TLS, and perform public acceptance

**Files:**
- Modify externally: Porkbun DNS for `meerkat.my`
- Modify after verification: `HANDOFF.md`, `PLAN.md`, and `README.md`

**Interfaces:**
- Consumes: healthy loopback deployment from Task 6.
- Produces: canonical public service at `https://meerkat.my` and verified project status in GitHub.

- [ ] **Step 1: Apply exact Porkbun records**

Remove conflicting parking records for `@` and `www`. Create:

```text
A      @      2.26.61.52
CNAME  www    meerkat.my
```

Do not add `AAAA` because no tested IPv6 address is configured.

- [ ] **Step 2: Verify authoritative and recursive DNS**

Use `Resolve-DnsName meerkat.my`, `Resolve-DnsName www.meerkat.my`, and an independent public resolver. Require the apex to return `2.26.61.52` and `www` to resolve through the apex.

- [ ] **Step 3: Verify certificates and redirects**

Run:

```bash
curl -fsSI http://meerkat.my/terminal?token=0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8
curl -fsSI https://www.meerkat.my/terminal?token=0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8
curl -fsS https://meerkat.my/healthz
```

Require HTTPS, a valid certificate, canonical apex redirects preserving path/query, HSTS, and `{ "status": "ok" }`.

- [ ] **Step 4: Exercise the real public product flow**

Through the public domain:

- open landing and terminal on desktop and 390×844 mobile viewport;
- analyze HOP OUT and confirm an accepted/active index response;
- reload and confirm persisted progress;
- open Overview, Fee Flow, Relationships, Wallets & Holders, and Timeline;
- load a 50-event timeline page and one filter;
- open a wallet dossier from a relationship node and navigate back;
- verify Ponsfamily and Blockscout links;
- request public operator routes and require `404`.

- [ ] **Step 5: Record evidence and publish final status**

Update `PLAN.md`, `HANDOFF.md`, and README hosting status with the public URL, deployed commit, service/restart result, backup integrity result, and browser smoke result. Do not publish IP authentication details, passwords, keys, or internal logs.

- [ ] **Step 6: Run final repository and external verification**

Run locally:

```bash
npm run typecheck
npm test
npm run build
git diff --check
git status --short
```

Commit and push the evidence update, verify remote `main` equals local `HEAD`, then repeat public `/healthz`, landing, terminal, token history, timeline, and wallet dossier checks against that exact commit.

