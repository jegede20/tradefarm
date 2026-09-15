# TradeFarm

A dark, trade-only Web3 terminal for Arc Testnet. Built with Next.js 14 App Router, TypeScript, Tailwind, wagmi, viem, Zustand, React Query, and Recharts.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and connect an injected EIP-1193 wallet. TradeFarm requests Arc Testnet automatically.

```text
Network:  Arc Testnet
Chain ID: 5042002
RPC:      https://rpc.testnet.arc.io
Explorer: https://testnet.arcscan.app
```

## Routes

- `/` — three-column live trading terminal
- `/portfolio` — positions, balances, PnL, quick sell, and locally persisted trade history
- `/leaderboard` — top wallets derived from the latest 500 router-linked USDC Transfer events
- `/bot` — in-browser auto-scan/manual trading loop and 200-line terminal log

## Contract safety rules

- USDC contract inputs use `parseUnits(value, 6)`.
- Meme-token contract inputs use `parseUnits(value, 18)`.
- USDC display values use `formatUnits(value, 6)`.
- Token display values use `formatUnits(value, 18)`.
- Native gas balance is displayed with `formatEther` only.
- Approvals and trades are awaited before client state is changed.
- A BUY is accepted into local state only after its successful receipt contains exactly four `Transfer` logs.
- Confirmed deployment selectors `0xc3b88b53` (buy) and `0xcf6bc454` (sell) are prepended to ABI-encoded `(address,uint256,uint256)` parameters. This is intentional because those deployment selectors differ from selectors derived from the supplied human-readable function names.

## Live data

`useTokenDiscovery` uses Arc's WebSocket endpoint. It maintains a router Transfer subscription, per-token Transfer subscriptions for live trade inference, block-driven price refreshes, and exponential-backoff reconnection. Seed market data keeps the interface useful when the public testnet or a preview browser is offline; live discoveries are upserted into the same store.

## Bot execution

The bot is entirely browser-side. `useBotRunner` starts a `setInterval`, scans all router tokens, filters graduated/illiquid/zero-supply curves, scores momentum and normalized liquidity, and executes through the same receipt-safe trading actions used by the dashboard. A sold token receives a two-iteration cooldown. Closing or refreshing the browser stops the loop.

## Validation

```bash
npm run typecheck
npm run build
```
