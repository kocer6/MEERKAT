#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'Run deploy/install.sh as root.' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git gnupg sqlite3 ufw unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

install -d -m 0755 /usr/share/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
chmod 0644 /usr/share/keyrings/nodesource.gpg
architecture=$(dpkg --print-architecture)
cat >/etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_24.x
Suites: nodistro
Components: main
Architectures: $architecture
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF

curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list

apt-get update
apt-get install -y nodejs caddy
node_major=$(node --version | sed -E 's/^v([0-9]+).*/\1/')
if [[ "$node_major" != '24' ]]; then
  echo "Node.js 24 is required; installed $(node --version)" >&2
  exit 1
fi

if ! id meerkat >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/meerkat --shell /usr/sbin/nologin meerkat
fi
install -d -m 0755 -o meerkat -g meerkat /opt/meerkat
install -d -m 0750 -o meerkat -g meerkat /var/lib/meerkat
install -d -m 0750 -o root -g meerkat /etc/meerkat
install -d -m 0700 -o root -g root /var/backups/meerkat

if [[ ! -d /opt/meerkat/app/.git ]]; then
  runuser -u meerkat -- git clone https://github.com/kocer6/MEERKAT.git /opt/meerkat/app
else
  runuser -u meerkat -- git -C /opt/meerkat/app fetch origin main
  runuser -u meerkat -- git -C /opt/meerkat/app checkout main
  runuser -u meerkat -- git -C /opt/meerkat/app merge --ff-only origin/main
fi

if [[ ! -f /etc/meerkat/meerkat.env ]]; then
  install -m 0640 -o root -g meerkat /opt/meerkat/app/deploy/meerkat.env.example /etc/meerkat/meerkat.env
fi

runuser -u meerkat -- bash -lc 'cd /opt/meerkat/app && npm ci && npm run typecheck && npm test && npm run build'
install -m 0644 /opt/meerkat/app/deploy/meerkat.service /etc/systemd/system/meerkat.service
install -m 0755 /opt/meerkat/app/deploy/meerkat-backup /usr/local/sbin/meerkat-backup
install -m 0644 /opt/meerkat/app/deploy/meerkat-backup.service /etc/systemd/system/meerkat-backup.service
install -m 0644 /opt/meerkat/app/deploy/meerkat-backup.timer /etc/systemd/system/meerkat-backup.timer
install -m 0644 /opt/meerkat/app/deploy/Caddyfile /etc/caddy/Caddyfile

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

systemctl daemon-reload
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now unattended-upgrades.service
systemctl enable --now meerkat.service
systemctl enable --now caddy.service
systemctl reload caddy.service
systemctl enable --now meerkat-backup.timer

ufw allow OpenSSH || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl is-active --quiet meerkat.service
curl -fsS -H 'Host: meerkat.my' http://127.0.0.1:4664/healthz
printf '\nMEERKAT installed at commit %s\n' "$(git -C /opt/meerkat/app rev-parse HEAD)"
