# TradeFarm

Trade-only terminal for graduated Flipt pools on Arc Testnet. Built with Next.js 14, TypeScript, Tailwind, wagmi, viem, Zustand, React Query, and Recharts.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in an injected wallet browser. TradeFarm requests Arc Testnet automatically.

```text
Network:     Arc Testnet
Chain ID:    5042002
RPC:         https://rpc.testnet.arc.io
Explorer:    https://testnet.arcscan.app
Flipt Hub:   0x4B33146F2bCc75574534374C85662f9E51C38Aca
Flipt USDC:  0x4F3b8005d6b3F4994a791D971bcD153E114D20c2 (6 decimals)
Native gas:  USDC (18 decimals)
```

## Routes

- `/` — three-column live pool terminal
- `/portfolio` — positions, balances, PnL, quick sell, and local trade history
- `/leaderboard` — wallets derived from router-linked Flipt USDC transfers
- `/bot` — one-position rotation engine, objectives, guardrails, session metrics, and 200-line execution log

## Contract handling

The deployed Flipt Hub exposes `allPairsLength`, `allPairs`, `getPair`, `launchCount`, `launches`, and `launchOf`; it does not expose the originally assumed `totalTokens` or `getBondingCurveState` methods. TradeFarm discovers graduated markets through the Hub pair registry and derives price and quotes from each pair's `getReserves` state.

Observed Arc transactions confirm:

- Pool buy selector: `0xc3b88b53`
- Sell selector: `0x6a272462` (`sell(address,uint256,uint256)`)
- Curve buy selector: `0xa59ac6dd`
- Graduate selector: `0xff6d8d05`

Contract safeguards:

- Flipt USDC inputs use `parseUnits(value, 6)`.
- Token inputs use `parseUnits(value, 18)`.
- Native gas is shown with `formatEther` only.
- Approval receipts are awaited before trade submission.
- Trade receipts are awaited before local state changes.
- Pool buys are accepted into local state only when the receipt contains exactly four ERC-20 `Transfer` logs.
- Confirmed receipt `Transfer` logs, rather than pre-trade quote estimates, populate purchased and received amounts.
- Trade history and an open bot position are persisted in browser localStorage.

## Live market runtime

`useTokenDiscovery` subscribes to raw Flipt Hub events over Arc WebSocket, resolves the transaction selector and token address, reads pool reserves, and updates the ticker, chart, and trade feed. It refreshes the selected pool every few seconds, syncs recent pools in bounded batches, and reconnects with exponential backoff.

The bounded scan is intentional: the live Hub contains more than twenty thousand pairs, so sending one browser RPC request per historical pair every loop would freeze mobile wallets and overload the public endpoint. The leaderboard similarly reads bounded 512-block windows, pairs verified Hub buy/sell events with their exact USDC `Transfer` logs, and stops after at most 500 matched trades; this stays below Arc RPC's result ceiling.

## Bot

The bot is a sequential rotation engine that runs only in the active browser tab with `setInterval`; there is no server worker or custody layer. Its runtime remains mounted while navigating between TradeFarm routes. It opens at most one bot position, waits for the buy receipt, manages that position, waits for the sell receipt, and then scans again after a short rotation delay. Sold tokens remain excluded for two complete scan iterations.

Auto mode evaluates recent graduated pools with at least 1,000 USDC liquidity and ranks reserve depth plus short-term price momentum. Manual mode resolves only the exact token address entered by the user and skips scanning. Entry size is capped by wallet balance, configured reserve share, and estimated pool impact.

Each session can target a recent-transfer leaderboard rank or realized-USDC profit. Reach mode stops at the objective; Defend mode pauses new entries while the estimated rank holds and resumes if it slips. The leaderboard rank is a clearly labeled TradeFarm estimate derived from recent router-linked Flipt USDC transfers, not an official final Flipt rank.

Position exits include take profit, stop loss, trailing stop, maximum hold time, stagnation, deadline, objective completion, and projected session drawdown. Session protections include maximum realized loss and a consecutive-loss circuit breaker. The scheduler never waits beyond the configured hold deadline even when the normal quote interval is longer. Transient Arc RPC failures now use exponential retries without abandoning an open position; submitted approval and trade hashes retry the same receipt before any failure is surfaced.

Stopping the bot prevents new actions but does not submit a sell merely because the user pressed Stop. Any already submitted wallet request is allowed to settle, and the open position remains available to resume or sell manually.

## Validation

```bash
npm run typecheck
npm run build
```
