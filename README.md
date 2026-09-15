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
- `/bot` — in-browser recent-pool scanner and execution log

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
- Trade history is persisted in browser localStorage.

## Live market runtime

`useTokenDiscovery` subscribes to raw Flipt Hub events over Arc WebSocket, resolves the transaction selector and token address, reads pool reserves, and updates the ticker, chart, and trade feed. It refreshes the selected pool every few seconds, syncs recent pools in bounded batches, and reconnects with exponential backoff.

The bounded scan is intentional: the live Hub contains more than twenty thousand pairs, so sending one browser RPC request per historical pair every loop would freeze mobile wallets and overload the public endpoint.

## Bot

The bot runs in the active browser tab with `setInterval`. Auto mode evaluates recent graduated pools with at least 1,000 USDC liquidity and ranks reserve depth plus short-term price momentum. Manual mode resolves the exact token entered by the user. Sold tokens remain on cooldown for two scan iterations.

## Validation

```bash
npm run typecheck
npm run build
```
