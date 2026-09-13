# Public deployment checkpoint — 2026-09-13

This checkpoint records the first verified MEERKAT deployment at [meerkat.my](https://meerkat.my/). It is operational evidence for the service, not a promise of uninterrupted availability or a claim that every token is completely indexed.

## Release and process boundary

- deployed Git commit: `52566c2`;
- Ubuntu 22.04 VPS with the application running as the unprivileged `meerkat` user;
- checksum-verified Node.js `24.21.0` installed under `/opt/meerkat/node` without replacing the host's system Node.js;
- application listener restricted to `127.0.0.1:4664`;
- Caddy is the public HTTP/HTTPS listener;
- `meerkat.service`, `caddy.service`, and `meerkat-backup.timer` were active and enabled;
- no failed systemd unit was reported after deployment.

The production update ran `npm ci`, TypeScript type checking, all 124 tests, and the production build before restarting the service.

## DNS, TLS and public boundary

The Porkbun authoritative resolver plus `1.1.1.1` and `8.8.8.8` returned the VPS address for the apex. `www.meerkat.my` resolves through the apex.

Verified HTTP behavior:

- `http://meerkat.my/` returns `308` to `https://meerkat.my/`;
- `https://www.meerkat.my/terminal?...` returns `301` to the same path and query on the apex;
- HTTPS `HEAD /`, `GET /`, `HEAD /terminal`, and `/healthz` return `200`;
- `/api/state` returns `404` in public mode;
- HSTS, Content Security Policy, no-sniff, and no-store headers are present.

Caddy obtained certificates for the apex and `www` names after the DNS change.

## Persisted index restart

HOP OUT (`0x78f13072b0f6ebc7fd0b5359c9b4e09c6160cff8`) had a partially completed history before the production restart. Starting the same public index job after restart reused the persisted profile and cursor and completed the captured head `61,975,786`.

The completed dossier reported:

- `6,486` persisted events;
- `45` attributed curve participants;
- `73` reconstructed non-core current holders;
- token score `84/100`, high confidence;
- `26` creator-fee sweeps totaling `1.177461500182357592 ETH`.

The score remained withheld while coverage was incomplete and changed to ready only when the captured head was reached.

## Backup recovery check

The systemd backup job created `/var/backups/meerkat/observer-20260913T130544Z.sqlite`. A copy was opened at a temporary restore path. `PRAGMA quick_check` returned `ok`, and the restored database contained one token history. The live database also returned `ok`. The temporary restore copy was removed after the check.

## Remaining operational limits

Public indexing is bounded per client and globally, so a busy deployment can queue or reject new work with an explicit response. Wallet dossiers cover histories indexed by this installation. The public RPC can still rate-limit work; saved cursors allow a later request to resume it. Service hardening currently receives a `6.8 MEDIUM` exposure score from `systemd-analyze security`; additional sandboxing must be tested against SQLite writes, DNS, and outbound RPC before tightening it.
