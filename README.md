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
- Positions persist their wallet, Hub pair, and exact raw token amount; trade history and bot state remain browser-local and are scoped to the originating wallet.
- Missing persisted pair metadata is recovered from the live Hub registry before quoting or trading.
- A global balance reconciler removes closed positions and negligible residual dust, including while the bot is stopped, but yields to an in-flight TradeFarm sell until its confirmed receipt has settled local state.

## Live market runtime

`useTokenDiscovery` subscribes to raw Flipt Hub events over Arc WebSocket and decodes the indexed token/wallet plus exact token and USDC amounts directly from verified Hub buy/sell logs. It does not issue a transaction or receipt request for every event. Startup reads six bounded 256-block windows (about thirteen minutes at Arc's observed block rate), retains a deduplicated fifteen-minute/5,000-row trade feed, and ranks two-way, multi-wallet activity over the latest ten minutes. Hub pairs, token metadata, supplies, and reserves for up to 64 activity-ranked markets are resolved with two Multicall3 requests. WebSocket traffic remains subscription-only; bounded backfills and Multicall3 reads use HTTP to avoid Arc's WebSocket `eth_getLogs` burst limit. Live market updates are debounced, the selected pool refreshes every few seconds, recovery backfills run periodically, and WebSocket failures reconnect with exponential backoff and a fresh full activity sync.

The bounded activity scan is intentional: the live Hub contains more than twenty thousand pairs, so sending one browser RPC request per historical pair or per trade would freeze mobile wallets and overload the public endpoint. The leaderboard similarly uses the HTTP read path for bounded 256-block windows, requests each window's Hub and USDC logs concurrently, pairs verified Hub buy/sell events with their exact USDC `Transfer` logs, and stops after at most 500 matched trades. All sampled wallets remain available for an exact connected-wallet sample rank while only the top 50 are rendered in the table. Transient RPC failures use bounded exponential retry, concurrent consumers share one in-flight request, and the last verified result remains usable from a ten-minute browser cache.

## Bot

The bot is a sequential rotation engine that runs only in the active browser tab with `setInterval`; there is no server worker or custody layer. Its runtime remains mounted while navigating between TradeFarm routes. It opens at most one bot position, waits for the buy receipt, manages that position, waits for the sell receipt, and then scans again after a short rotation delay. Sold tokens remain excluded for two complete scan iterations. Stop and wallet/account changes are checked again immediately before each transaction submission.

Auto mode no longer chooses from shallow pools by reserve rank alone. It first indexes and activity-ranks recent markets, then requires: a Hub-verified graduated token/pair mapping; configurable minimum USDC depth; recent trades spread across multiple two-minute buckets; at least two distinct traders; verified sell flow sufficient to cover the intended position; buy pressure inside a configured minimum/maximum range; bounded single-wallet flow; bounded creator holdings read from the Hub launch record; reserve-snapshot momentum/volatility within configured limits; acceptable entry impact; an executable quote for closing the complete intended position within the same impact limit; and a configurable percentage of LP supply held by the pair itself. Impact-sensitive Hub event average prices are used for flow accounting but never as reserve-price momentum samples.

Profit-first mode observes at least four reserve samples over at least sixty seconds and requires positive reserve momentum before entry. Rank-volume mode keeps the safety and sell-coverage gates but favors larger executable turnover in deeper pools, rejects entries below a bounded useful-turnover floor, and logs estimated gross volume and round-trip cost. Gross-volume ranking can still lose money through pool fees and slippage. Survivors receive a transparent 0–100 mode-specific score, and selection/rejection reasons are written to the terminal log.

These checks reduce exposure to thin liquidity, creator concentration, one-wallet manipulation, unverified pools, pump chasing, and pools without observed two-way execution. They cannot guarantee profit or prove that a token will never rug; public-chain heuristics can be evaded and market conditions can change after entry. Manual mode resolves only the exact token address entered by the user and skips scanning, while retaining the graduated-pool, creator, LP, liquidity, and executable full-position entry/exit safety gates. Entry size is capped by wallet balance, configured reserve share, and estimated pool impact.

Each session can target a recent-transfer leaderboard rank or realized-USDC profit. Reach mode stops at the objective; Defend mode pauses new entries while the estimated rank holds and resumes if it slips. The leaderboard rank is a clearly labeled TradeFarm estimate derived from recent router-linked Flipt USDC transfers, not an official final Flipt rank.

Position exits include take profit, stop loss, trailing stop, maximum hold time, stagnation, deadline, objective completion, and projected session drawdown. Stagnation is not armed until the configured minimum hold period. Session protections include maximum realized loss and a consecutive-loss circuit breaker, and every automatic stop names the exact objective or guardrail that fired. The scheduler never waits beyond the configured hold deadline even when the normal quote interval is longer. Transient Arc RPC failures use exponential retries without abandoning an open position; submitted approval and trade hashes retry the same receipt before any failure is surfaced.

Stopping the bot prevents new actions but does not submit a sell merely because the user pressed Stop. Any already submitted wallet request is allowed to settle, and the open position remains available to resume or sell manually.

## Transaction authorization

The current injected-wallet path is **wallet-confirmed**, not unattended: the scanner and position manager run automatically, but every approval, buy, and sell still requires the connected wallet to sign. TradeFarm performs a read-only `wallet_getCapabilities` check and reports whether the connected wallet advertises a session/delegation API; detection does not silently activate or claim an unattended session. TradeFarm never requests or stores a private key or seed phrase and never switches execution to a different ranking address.

Secure same-address unattended execution must be activated only through a wallet that can grant an Arc-compatible, scoped and expiring smart-account/session permission (for example an EIP-7702/7715-compatible flow) plus supported bundler infrastructure. Ordinary injected JSON-RPC accounts generally cannot authorize an arbitrary delegate from a dApp. Until a compatible wallet/provider flow is configured and verified, the UI explicitly identifies execution as wallet-confirmed rather than claiming autonomous signing.

## Validation

```bash
npm run typecheck
npm run build
```
