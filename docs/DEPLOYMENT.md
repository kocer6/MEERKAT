# Public deployment

This guide publishes MEERKAT on one Ubuntu 22.04 VPS behind Caddy. The production application remains bound to loopback and stores evidence in SQLite. The reference host is `meerkat.my`; replace it only if the corresponding application allowlist and Caddyfile are changed together.

## 1. Bootstrap SSH access

Generate one dedicated Ed25519 key on the operator's Windows workstation. Do not overwrite an existing file.

```powershell
ssh-keygen -t ed25519 -a 64 -f "$env:USERPROFILE/.ssh/meerkat_xorek_ed25519" -C "meerkat-xorek-2026-09-13"
Get-Content "$env:USERPROFILE/.ssh/meerkat_xorek_ed25519.pub"
```

Open the provider's web console and log in as root. Paste only the single public-key line printed by the second command:

```bash
install -d -m 0700 /root/.ssh
printf '%s\n' 'PASTE_THE_PUBLIC_KEY_LINE_HERE' >> /root/.ssh/authorized_keys
chmod 0600 /root/.ssh/authorized_keys
```

Keep the provider console open and verify a separate workstation session:

```powershell
ssh -i "$env:USERPROFILE/.ssh/meerkat_xorek_ed25519" -o IdentitiesOnly=yes root@2.26.61.52 "id; hostnamectl; uname -a"
```

After that succeeds, rotate any password that has been shared or displayed. Add the SSH policy:

```bash
cat >/etc/ssh/sshd_config.d/60-meerkat-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
EOF
sshd -t
systemctl reload ssh
```

Open one more key-authenticated session before closing the provider console. This prevents an SSH typo from locking out the server.

## 2. Install the release

From the provider console or verified SSH session:

```bash
git clone https://github.com/kocer6/MEERKAT.git /tmp/meerkat-bootstrap
cd /tmp/meerkat-bootstrap
bash deploy/install.sh
```

The installer places a checksum-verified Node.js 24 runtime under `/opt/meerkat/node`, installs Caddy, SQLite, UFW, and unattended upgrades, creates the unprivileged `meerkat` user, builds the current `origin/main`, installs systemd units, and opens SSH, HTTP, and HTTPS in UFW. It does not replace the system Node.js runtime used by other services.

The active configuration is `/etc/meerkat/meerkat.env`. It must remain mode `0640`, owned by `root:meerkat`. MEERKAT needs no private key or wallet secret.

## 3. Verify before DNS

```bash
systemctl is-active meerkat caddy
systemctl is-enabled meerkat caddy meerkat-backup.timer
systemctl --failed
systemd-analyze security meerkat.service
ss -lntup
ufw status verbose
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: meerkat.my' http://127.0.0.1:4664/api/state
```

Node must listen only on `127.0.0.1:4664`. The health response must be `{"status":"ok"}` and the public-mode operator route must return `404`.

Inspect recent logs without printing the environment file:

```bash
journalctl -u meerkat -u caddy --since '-15 minutes' --no-pager
```

## 4. Configure Porkbun DNS

Remove parking records that conflict with `@` or `www`, then create:

| Type | Host | Answer |
| --- | --- | --- |
| `A` | `@` | `2.26.61.52` |
| `CNAME` | `www` | `meerkat.my` |

Do not add an `AAAA` record until IPv6 is configured and tested on the VPS.

Verify from Windows:

```powershell
Resolve-DnsName meerkat.my -Type A
Resolve-DnsName www.meerkat.my
Resolve-DnsName meerkat.my -Type A -Server 1.1.1.1
```

Caddy obtains certificates after DNS reaches the VPS. Follow its log while the first certificate is issued:

```bash
journalctl -u caddy -f
```

## 5. Verify the public service

```bash
curl -fsSI http://meerkat.my/
curl -fsSI 'https://www.meerkat.my/terminal?token=0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8'
curl -fsS https://meerkat.my/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://meerkat.my/api/state
```

HTTP and `www` must redirect to the canonical HTTPS apex while preserving the path and query. Health must return `200`; `/api/state` must return `404` publicly.

Open the landing page and terminal in desktop and mobile viewports. Analyze a real Pons V2 token, reload after a cursor is persisted, exercise all five dossier tabs, load one Timeline page and filter, open a wallet dossier from the relationship map, navigate back, and verify the Ponsfamily and Blockscout links.

## Update

Record the current commit before updating:

```bash
cd /opt/meerkat/app
git rev-parse HEAD
sudo -u meerkat git fetch origin main
sudo -u meerkat git merge --ff-only origin/main
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm ci
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm run typecheck
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm test
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm run build
systemctl start meerkat-backup.service
systemctl restart meerkat.service
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
```

## Roll back application code

Use the exact previously recorded commit. This release introduces no destructive database migration.

```bash
systemctl stop meerkat.service
cd /opt/meerkat/app
sudo -u meerkat git checkout PREVIOUS_VERIFIED_COMMIT
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm ci
sudo -u meerkat env PATH=/opt/meerkat/node/bin:/usr/bin:/bin npm run build
systemctl start meerkat.service
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
```

Return to the maintained branch after diagnosing the failed release:

```bash
sudo -u meerkat git checkout main
```

## Back up and test recovery

Run an online backup without stopping the service:

```bash
systemctl start meerkat-backup.service
systemctl status meerkat-backup.service --no-pager
ls -lh /var/backups/meerkat
```

Test the newest backup at a temporary path:

```bash
backup=$(find /var/backups/meerkat -type f -name 'observer-*.sqlite' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
restore_test=$(mktemp --suffix=.sqlite)
cp "$backup" "$restore_test"
sqlite3 "$restore_test" 'PRAGMA quick_check; SELECT count(*) FROM token_history;'
rm -f "$restore_test"
```

The first output line must be `ok`.

To restore production, stop the application, preserve the current database and WAL companions, install a verified backup with the service account ownership, then start and health-check:

```bash
systemctl stop meerkat.service
install -m 0640 -o meerkat -g meerkat "$backup" /var/lib/meerkat/observer.sqlite.restore
mv /var/lib/meerkat/observer.sqlite /var/lib/meerkat/observer.sqlite.before-restore
rm -f /var/lib/meerkat/observer.sqlite-wal /var/lib/meerkat/observer.sqlite-shm
mv /var/lib/meerkat/observer.sqlite.restore /var/lib/meerkat/observer.sqlite
systemctl start meerkat.service
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
```

Keep `observer.sqlite.before-restore` until the restored service and representative dossiers have been checked.


## Separated Radar workers (2026-09-14)

Production uses one SQLite WAL database and three independent services:

- `meerkat-indexer.service` runs `radar-collect`: factory/market log collection, cursor commits and indexed position accounting. It makes no metadata or quote calls and does not build leaderboards.
- `meerkat-enrich.service` runs `radar-enrich`: bounded contract profiles, curve position quotes and public GeckoTerminal/DexScreener batches. Existing profiles and market snapshots become eligible for refresh after five minutes; queue capacity and source availability determine actual freshness. Each field keeps its source/time and missing values remain missing.
- `meerkat-project.service` runs `radar-project`: drains versioned token work, recomputes evidence scores and patches the feed every five seconds when capacity permits. Full leaderboards refresh on a five-minute clock. It does not call RPC or external market APIs.

`radar_projection_queue` is committed with collected events and successful enrichment. Scores are computed from a read-only WAL snapshot; only prepared results use a short write transaction. Versioned acknowledgements prevent newer work being lost; interrupted processing is retried. Metadata results verify the launch still exists; quote writes compare the original position before updating. API `/api/radar/status` exposes each worker's status and pending projections. Web remains read-only with `MEERKAT_RADAR=0`.

Market batches contain at most 30 token addresses on Robinhood Chain. GeckoTerminal is first; DexScreener is the fallback. Token identity and chain must match. Market cap and FDV are separate, and indicative USD snapshots never replace executable curve quotes or invent wallet P/L. Source failures preserve the last successful snapshot and are retried after the cooldown.

Upgrade: pull/build/test, install all three units from `deploy/`, run `systemctl daemon-reload`, restart the existing collector and web, and enable/start `meerkat-enrich.service meerkat-project.service`. Stop the old combined indexer before starting the split workers. `radar-index` remains a combined local compatibility command; do not run it against the production database alongside the split workers. Rollback: stop enrichment/projection, restore the previous code/unit and restart the previous indexer; additive queue/market tables can remain.
