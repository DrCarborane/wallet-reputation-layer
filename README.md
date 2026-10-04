# Wallet Reputation Layer

A frontend tool that fetches real on-chain data for any Ethereum address or ENS name and surfaces rich heuristic signals — wallet age, activity, capital, behavior, and type — without reducing them to a single good/bad score.

---

## What it does

Paste any Ethereum wallet address (`0x...`) or ENS name (`vitalik.eth`) and get:

| Signal | Source |
|---|---|
| **Wallet age** | First transaction timestamp (nonce-0 detection via Blockscout) |
| **Transaction history** | Full tx count + failure rate via Blockscout counters |
| **Capital** | Current ETH + ERC-20 token portfolio (live prices) + historical outflows at block-time ETH/USD rates |
| **Counterparties** | Unique addresses interacted with (sampled) |
| **Protocol diversity** | Unique smart contracts called |
| **Contract interaction level** | Proportion of txs that call contracts |
| **Sybil probability** | Heuristic based on age, tx count, and counterparty count |
| **Payment reliability** | Success rate out of 100 |
| **Wallet type** | Individual / Treasury / Exchange / Bot / Smart Contract / Power User |

All data is read-only from public APIs. No wallet connection required.

---

## Problem it solves

On-chain reputation is fragmented and hard to read. This tool aggregates the most meaningful heuristic signals into a single view, useful for:

- Due diligence on counterparties
- Sybil filtering for airdrops or allowlists
- Understanding an address before interacting with it
- Portfolio and wallet research

---

## Architecture

```
Browser
  └── React + Vite + TypeScript
        ├── src/walletReputation.ts   — data layer (all API calls + classification logic)
        └── src/App.tsx               — UI

Data sources (public, no API key required)
  ├── Blockscout v2 API (eth.blockscout.com)   — transactions, balances, token holdings
  ├── api.ensideas.com                         — ENS forward resolution
  └── cloudflare-eth.com                       — Ethereum mainnet RPC (bytecode detection)
```

No backend. No wallet connection. No API keys required.

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) v1.x

### Install

```bash
bun install
```

### Configure (optional)

```bash
cp .env.example .env
# Edit .env if you want to override the default RPC URL
```

### Run

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Building for production

```bash
bun run build
```

Output goes to `dist/`. Deploy that folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

---

## Lint and typecheck

```bash
bun run check
```

---

## Key files

| Path | Purpose |
|---|---|
| `src/walletReputation.ts` | All data fetching, ENS resolution, classification helpers, formatters |
| `src/App.tsx` | Full UI — search bar, result cards, loading states |
| `src/index.css` | Design tokens (Arc Dark theme) |
| `contracts/` | Foundry scaffold (unused by the frontend — present for extensibility) |

---

## Limitations

- Wallet age is exact when the nonce-0 transaction is within the first 1,000 transactions. For wallets with more history it shows the oldest sampled transaction and labels it as estimated.
- Payment reliability failure count is scaled from a sample; very active wallets may show a slightly imprecise ratio.
- Token portfolio values depend on Blockscout's exchange rate data; illiquid tokens with no rate are excluded.
- Exploit exposure currently returns "None detected" as a placeholder — integration with a public exploit registry is a planned extension.

---

## License

MIT
