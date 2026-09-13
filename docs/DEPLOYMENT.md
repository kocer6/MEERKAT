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

The installer upgrades security packages; installs Node.js 24, Caddy, SQLite, UFW, and unattended upgrades; creates the unprivileged `meerkat` user; builds the current `origin/main`; installs systemd units; and opens only SSH, HTTP, and HTTPS in UFW.

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
sudo -u meerkat npm ci
sudo -u meerkat npm run typecheck
sudo -u meerkat npm test
sudo -u meerkat npm run build
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
sudo -u meerkat npm ci
sudo -u meerkat npm run build
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
