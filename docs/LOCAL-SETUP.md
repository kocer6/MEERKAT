# Local setup

## Requirements

- Node.js `24.x`
- npm (included with Node)
- Git
- Internet access to a Robinhood Chain JSON-RPC endpoint

## Install and start

```sh
git clone https://github.com/kocer6/MEERKAT.git
cd MEERKAT
npm ci
npm start
```

Open `http://127.0.0.1:4664/`. The command serves the landing page and terminal from the local machine.

## Configuration

All variables are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4664` | Local HTTP port |
| `MEERKAT_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | Robinhood Chain JSON-RPC endpoint |
| `MEERKAT_DB` | `data/observer.sqlite` | Local SQLite database path |

PowerShell example:

```powershell
$env:MEERKAT_RPC_URL = "https://your-rpc.example"
$env:PORT = "4664"
npm start
```

Bash example:

```sh
MEERKAT_RPC_URL=https://your-rpc.example PORT=4664 npm start
```

Do not put a private key in this project. The active product does not need or read one.

## Build and run packaged JavaScript

```sh
npm run build
npm run start:built
```

## Update

Stop the process, then:

```sh
git pull --ff-only
npm ci
npm run build
```

The database remains under `data/` unless `MEERKAT_DB` points elsewhere.

## Back up or reset local data

Stop MEERKAT before copying or removing the database. To back up, copy `observer.sqlite` and any adjacent `observer.sqlite-wal` / `observer.sqlite-shm` files together. To reset all locally indexed histories and watch state, move those files out of `data/` and start again.

## Troubleshooting

**The token is rejected.** The address must be a registered Pons V2 token on chain ID 4663. A generic ERC-20 address is intentionally unsupported.

**Indexing reports a rate limit.** The public RPC can throttle historical log reads. Restart the job or use another Robinhood Chain RPC; committed chunks and the cursor remain local.

**Wallet mode returns no activity.** Index one or more relevant token histories first. Wallet mode currently searches only the histories stored by this installation.

**The port is in use.** Set another `PORT`, restart, and open that port in the browser.

**A conclusion matters financially.** Follow the displayed transaction link and verify it against an independent chain data source. MEERKAT is evidence tooling, not financial advice.

