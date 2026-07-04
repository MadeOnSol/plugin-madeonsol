# @madeonsol/plugin-madeonsol

[![npm version](https://img.shields.io/npm/v/@madeonsol/plugin-madeonsol?style=flat-square)](https://www.npmjs.com/package/@madeonsol/plugin-madeonsol)
[![npm downloads](https://img.shields.io/npm/dm/@madeonsol/plugin-madeonsol?style=flat-square)](https://www.npmjs.com/package/@madeonsol/plugin-madeonsol)
[![ElizaOS](https://img.shields.io/badge/ElizaOS-plugin-blueviolet?style=flat-square)](https://elizaos.github.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

> 📚 **[API docs](https://madeonsol.com/api-docs)** · 💰 **[Free API key](https://madeonsol.com/pricing)** · 🤖 **[ElizaOS](https://github.com/elizaOS/eliza)**

ElizaOS plugin for [MadeOnSol](https://madeonsol.com) — Solana KOL trading intelligence, deployer analytics, and wallet tracking.

> Real-time Solana trading intelligence: track 1,069 KOL wallets with <3s latency, score 23,000+ Pump.fun deployers, expose bundle-cohort held-% of supply (the rug/insider signal), surface deshred deploy signals ~500ms before on-chain confirmation, detect multi-KOL coordination, and stream every DEX trade. Free tier: 200 requests/day, every endpoint — no signup payment. Get a key at [madeonsol.com/pricing](https://madeonsol.com/pricing).

> **New in 1.16.0** — **Bundle-cohort holdings.** New action `GET_TOKEN_BUNDLE` + `client.getTokenBundle(mint)` (`GET /tokens/{mint}/bundle`) — which same-slot "bundle" wallets (≥3 buying in one slot) bought a token and how much of supply they STILL hold, straight from confirmed on-chain data. The `bundle` block carries `wallet_count`, `bundle_kind` (`atomic_tx`/`same_slot`/`none`), `held_ratio`, **`held_pct_of_supply`** (the headline rug/insider signal, 0–1 or null), `fully_exited`, `buy_volume`, and `tokens_held`. Tier-gated: BASIC/TRADER get the `bundle` block only (`wallets: []`); PRO adds a top-10 flags-only `wallets[]` (`rank`, `held_ratio`, `has_sold`, `atomic`, `is_kol`); ULTRA adds identity (`kol_name`, `win_rate`, `bot_confidence`, `tokens_held`).
>
> **New in 1.15.0** — **Batch risk scoring + live WebSocket session control.** Two client methods: `client.getTokenRiskBatch(mints)` scores up to 50 mints in one call (`POST /tokens/batch/risk`) — each entry is the single-mint risk shape plus an `as_of` timestamp, or `{ mint, error: "not_tracked" }` for untracked mints (which don't fail the batch); returns `{ tokens, count }` in de-duplicated input order and counts as one request. And `client.getStreamSessions()` lists your live WebSocket sessions (`{ id, service, tier, channels, connected_at, remote_ip, messages_sent }`) while `client.deleteStreamSession(id)` force-evicts one by id to free a connection slot. Both PRO/ULTRA only.
>
> **New in 1.14.0** — **Almost-bonded discovery + trending sorts.** New action `MADEONSOL_ALMOST_BONDED` + `client.getAlmostBonded(params)` — pre-bond pump.fun tokens near graduation, ranked by velocity (Δprogress/min): "95% and accelerating" beats "92% stalled". Each token carries `progress_pct`, `velocity_pct_per_min`, `eta_minutes`, `stalled`, `real_sol_reserves`, `market_cap_usd`, `liquidity_usd`, `authorities_revoked`, `deployer_tier`, and `age_minutes`. Params: `min_progress`, `max_progress`, `min_velocity_pct_per_min`, `max_age_minutes`, `deployer_tier`, `authority_revoked`, `min_liq`, `sort` (velocity_desc / progress_desc / eta_asc), `limit`. PRO/ULTRA only. Plus `client.getTokensList({ sort })` gains four momentum sorts — `mc_change_5m_desc`, `mc_change_1h_desc`, `volume_1h_desc`, and `trending` (composite recent-volume × positive-momentum rank).
>
> **New in 1.13.0** — **Token net flow.** New action `GET_TOKEN_FLOW` + `client.getTokenFlow(mint, { window })` — net buy/sell flow over a rolling window (`1h` default, or `24h`): `unique_wallets`, `unique_buyers`, `unique_sellers`, `buy_count`, `sell_count`, `total_trades`, `buy_sol`, `sell_sol`, `net_sol`, `trades_per_wallet`. PRO+. Deployer alerts now also surface `deployer_sol_balance` — the deployer wallet's SOL balance at alert time (`null` for historical rows).
>
> **New in 1.12.0** — **Token OHLCV candles.** New action `GET_TOKEN_CANDLES` + `client.getTokenCandles(mint, { tf, limit, from, to })` — historical price candles (1m/5m/15m/1h/4h/1d) aggregated from the on-chain trade firehose. Each candle has `t/open/high/low/close/volume_usd/trades/market_cap_usd`. PRO returns OHLCV for the last 30 days; ULTRA adds buy/sell volume + count splits, net flow, MEV volume, open/close liquidity, high/low MC, and full history. PRO/ULTRA only.
>
> **New in 1.11.0** — **Token risk score.** New action `GET_TOKEN_RISK` + `client.getTokenRisk(mint)` — a transparent 0–100 rug-risk/safety score (higher = riskier) with a `band` (safe/caution/danger), an explainable `factors[]` array, and the raw `inputs` (mint/freeze authority, liquidity, liq-to-MC ratio, transfer fee, launch cohort, deployer bond rate, KOL signal, blacklist). PRO/ULTRA only.
>
> **New in 1.10.0** — `client.getTokensList()` gains three new filter params: `min_liq_mc_ratio`, `max_liq_mc_ratio`, and `deployer_tier`. Response items now include `liquidity_to_mc_ratio` and `deployer_tier`. KOL leaderboard entries now include `median_hold_minutes_30d` and `percentile_early_entry_30d`. Token endpoints now return `liquidity_to_mc_ratio`, `launch_cohort_sol`, and `launch_cohort_size`.
>
> **New in 1.9.3** — Deployer alerts now surface `runner_rate` + `labeled_tokens` (fraction of a deployer's labeled tokens that ran vs dumped, gate on `labeled_tokens` ≥3) and `avg_time_to_bond_minutes`.

> **New in 1.9.2** — **Dump-cluster detection.** Buyer-quality breakdown now includes `dump_cluster_count` (3+ dump-cluster wallets in the first-20 → 94% historical dump rate vs 61% base) and `recycled_early_buyer_count`, on all tiers. The API also pushes every pump.fun graduation in real time (`token:graduations` WS channel).

> **New in 1.9** — **Price alerts, scout leaderboard, coordination history, wallet derived stats.** `PRICE_ALERTS_*` actions (PRO=5, ULTRA=25 rules). `SCOUT_LEADERBOARD`, `KOL_CONSENSUS`, `PEAK_HISTORY`, `COORDINATION_HISTORY`. `WALLET_STATS` now returns `derived`: win_rate, roi, verdict, biggest_miss.
>
> **New in 1.8** — **Universal Wallet API.** `WALLET_STATS`, `WALLET_PNL`, `WALLET_POSITIONS`, `WALLET_TRADES` — FIFO cost-basis PnL and raw trades for any Solana wallet. PRO+. Cache hits free.
>
> **New in 1.7.0** *(2026-05-12)* — **Account introspection + token scanner actions.** Two new actions: `meAction` (`GET_MADEONSOL_ACCOUNT`) reports the caller's tier, daily/burst quota, and webhook / copy-trade / coord-rule slot counts; `tokensListAction` (`LIST_MADEONSOL_TOKENS`) scans the Solana token universe by MC, liquidity, 1h momentum, and primary DEX. New client methods: `client.getMe()` and `client.getTokensList(params)`. Token responses now expose **velocity / MEV-share enrichment** fields. The `/tokens` scanner applies a default `min_liq=2000` so the agent isn't drowned in dust pools by default. `/token/{mint}` HTTP 400s now return structured `code` / `reason` / `example` / `docs` so the agent can self-correct bad mints. Deprecated `avg_entry_mc_usd` has been removed from all leaderboard payloads.

## Quick start (10 seconds)

```bash
npm install @madeonsol/plugin-madeonsol
```

```ts
import { madeOnSolPlugin } from "@madeonsol/plugin-madeonsol";
const agent = { plugins: [madeOnSolPlugin], settings: { MADEONSOL_API_KEY: "msk_..." } }; // free tier at https://madeonsol.com/pricing
// Then ask the agent: "What are KOLs buying right now?"
```

## Authentication

Three options (in priority order):

| Method | Setting | Best for |
|---|---|---|
| **MadeOnSol API key** (recommended) | `MADEONSOL_API_KEY` | Developers — [get a free key](https://madeonsol.com/pricing) |
| x402 micropayments | `SVM_PRIVATE_KEY` | AI agents with Solana wallets |

## What it does

Gives your ElizaOS agent access to MadeOnSol's Solana intelligence API.

| Action | Description |
|--------|-------------|
| `GET_KOL_FEED` | Real-time KOL trade feed (1,000+ wallets) |
| `GET_KOL_COORDINATION` | Multi-KOL convergence (v1.1 — peak-density, exits, 0-100 score) |
| `GET_KOL_LEADERBOARD` | KOL PnL/win-rate rankings (180 days of history) |
| `GET_DEPLOYER_ALERTS` | Pump.fun deployer alerts with KOL enrichment |
| `WALLET_TRACKER_WATCHLIST` | List your tracked wallets and remaining capacity |
| `WALLET_TRACKER_TRADES` | Recent swaps and transfers from your watchlist |
| `GET_MADEONSOL_ACCOUNT` | Your tier, daily quota, burst limit, and slot usage *(new in 1.7.0)* |
| `LIST_MADEONSOL_TOKENS` | Scan tokens by MC, liquidity, 1h momentum, primary DEX, plus momentum sorts (`mc_change_5m_desc`/`mc_change_1h_desc`/`volume_1h_desc`/`trending`) *(new in 1.7.0)* |
| `MADEONSOL_ALMOST_BONDED` | **New 1.14** · Pre-bond pump.fun tokens near graduation, ranked by velocity — `progress_pct`, `velocity_pct_per_min`, `eta_minutes`, `stalled`, `deployer_tier` (PRO+) |
| `WALLET_STATS` | **New 1.8** · Stats + cross-product flags (is_kol, is_alpha_tracked + bot_confidence, is_deployer) for any wallet (PRO+) |
| `WALLET_PNL` | **New 1.8** · Full FIFO PnL — realized + unrealized, profit factor, drawdown, hold times, top winners (PRO+) |
| `WALLET_POSITIONS` | **New 1.8** · Open positions with live unrealized SOL from market-cap tracker (PRO+) |
| `WALLET_TRADES` | **New 1.8** · Recent trades for any wallet, filtered by action (PRO+) |
| `GET_TOKEN_RISK` | **New 1.11** · Transparent 0–100 rug-risk/safety score with band + explainable factors (PRO+) |
| `GET_TOKEN_CANDLES` | **New 1.12** · Historical OHLCV candles (1m–1d). PRO=OHLCV 30d; ULTRA=+net flow, liquidity delta, full history (PRO+) |
| `GET_TOKEN_FLOW` | **New 1.13** · Net buy/sell flow over a 1h/24h window — unique wallets/buyers/sellers, buy/sell counts, buy/sell/net SOL, trades-per-wallet (PRO+) |
| `GET_TOKEN_BUNDLE` | **New 1.16** · Bundle-cohort holdings — same-slot "bundle" wallets and their `held_pct_of_supply` (rug/insider signal). BASIC/TRADER=summary; PRO=top-10 flags; ULTRA=+KOL identity |

## Install

```bash
npm install @madeonsol/plugin-madeonsol
```

> x402 peer deps (`@x402/fetch @x402/svm @x402/core @solana/kit @scure/base`) are only needed when using `SVM_PRIVATE_KEY`.

## Usage

```typescript
import { madeOnSolPlugin } from "@madeonsol/plugin-madeonsol";

const agent = {
  plugins: [madeOnSolPlugin],
  settings: {
    // Option 1: API key — get one free at madeonsol.com/pricing
    MADEONSOL_API_KEY: "msk_your_api_key_here",

    // Option 2: x402 micropayments (AI agents)
    // SVM_PRIVATE_KEY: "your_base58_solana_private_key",
  },
};
```

### v1.1 Coordination alerts (programmatic)

The `GET_KOL_COORDINATION` action surfaces the v1.1 `coordination_score`, `peak_kols`, and `exited_count` fields. For **push alerts** (fires within ~1s of a qualifying trade via WS `kol:coordination` channel + HMAC-signed webhook), use the client directly from a custom action:

```ts
import { MadeOnSolClient } from "@madeonsol/plugin-madeonsol";

const client = new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY });
const res = await client.coordinationAlertsCreate({
  name: "fresh pump cluster",
  min_kols: 4,
  window_minutes: 15,
  min_score: 70,
  include_majors: false,
  cooldown_min: 60,
  score_jump_break: 10,
  delivery_mode: "both",
  webhook_url: "https://you.com/hooks/coord",
});
// store res.data.webhook_secret — shown ONCE
```

PRO=5 rules, ULTRA=20. Also available: `coordinationAlertsList()`, `coordinationAlertsGet(id)`, `coordinationAlertsUpdate(id, updates)`, `coordinationAlertsDelete(id)`.

### First-touch signal *(new in 1.3)*

Every "first KOL buy on a token mint" event — when a tracked KOL is the first of the cohort to touch a token. Filterable by **scout tier** (S/A/B/C from `mv_kol_scout_score`), KOL winrate, token age, mint suffix.

**Backtest:** S-tier scouts attract ≥3 follow-on KOLs within 4h ~50% of the time vs ~14% baseline (38d / 491k buys).

```ts
import { MadeOnSolClient } from "@madeonsol/plugin-madeonsol";
const client = new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY });

// REST query
const { events } = await client.firstTouches({ preset: "scout", min_scout_tier: "S", limit: 20 });

// Webhook subscription (Ultra) — push delivery, HMAC-signed
const { subscription, webhook_secret } = await client.firstTouchSubscriptionsCreate({
  name: "S-tier scouts on pump tokens",
  filters: { min_scout_tier: "S", mint_suffix: "pump" },
  delivery_mode: "webhook",
  webhook_url: "https://you.com/hooks/scout",
});
// store webhook_secret — shown ONCE
```

ULTRA only for subscriptions — up to 10 active. CRUD: `firstTouchSubscriptionsList()`, `firstTouchSubscriptionsGet(id)`, `firstTouchSubscriptionsUpdate(id, updates)`, `firstTouchSubscriptionsDelete(id)`.

> **Don't poll — push.** Median lead time before the second KOL is 12 seconds. WebSocket channel: `kol:first_touches`.

### Price alerts *(new in 1.9)*

CRUD for token dip/recovery price alerts. Fires when a token's market cap crosses your threshold. PRO=5 rules, ULTRA=25.

| Action | Description |
|---|---|
| `PRICE_ALERTS_LIST` | List your price alert rules |
| `PRICE_ALERTS_CREATE` | Create a dip/recovery alert rule |
| `PRICE_ALERTS_DELETE` | Delete a price alert rule |

```ts
import { MadeOnSolClient } from "@madeonsol/plugin-madeonsol";
const client = new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY });

const { alert, webhook_secret } = await client.priceAlertsCreate({
  name: "SOL dip buy",
  token_mint: "So11111111111111111111111111111111111111112",
  condition: "below",
  threshold_mc_usd: 5_000_000_000,
  cooldown_min: 120,
  delivery_mode: "both",
  webhook_url: "https://you.com/hooks/price",
});
// store webhook_secret — shown ONCE
```

Also available: `priceAlertsList()`, `priceAlertsGet(id)`, `priceAlertsUpdate(id, updates)`, `priceAlertsDelete(id)`.

### Scout leaderboard & KOL consensus *(new in 1.9)*

| Action | Description |
|---|---|
| `SCOUT_LEADERBOARD` | Top scout-tier KOLs ranked by first-touch follow-on rate, win rate, and ROI (PRO+) |
| `KOL_CONSENSUS` | Tokens with the strongest KOL agreement signal (PRO+) |
| `PEAK_HISTORY` | Historical peak-density windows for a token (PRO+) |
| `COORDINATION_HISTORY` | Global coordination event log (PRO+) |

### Token net flow *(new in 1.13)*

`GET_TOKEN_FLOW` (or `client.getTokenFlow(mint, { window })`) returns net buy/sell flow over a rolling `1h` (default) or `24h` window. PRO+.

```ts
import { MadeOnSolClient } from "@madeonsol/plugin-madeonsol";
const client = new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY });

const { data } = await client.getTokenFlow("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", { window: "24h" });
// { mint, window, from, unique_wallets, unique_buyers, unique_sellers,
//   buy_count, sell_count, total_trades, buy_sol, sell_sol, net_sol, trades_per_wallet }
console.log(`Net ${data.net_sol} SOL across ${data.unique_wallets} wallets`);
```

> Deployer alerts (`GET_DEPLOYER_ALERTS` / `client.getDeployerAlerts()`) now include `deployer_sol_balance` — the deployer wallet's SOL balance at alert time (`null` for historical rows).

### Batch risk scoring & WebSocket session control *(new in 1.15)*

Score up to 50 mints in one request, and list/kill your live WebSocket sessions — both client-only, PRO/ULTRA.

```ts
import { MadeOnSolClient } from "@madeonsol/plugin-madeonsol";
const client = new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY });

// Bulk rug-risk — one request, up to 50 mints
const { data } = await client.getTokenRiskBatch([mintA, mintB, mintC]);
// { tokens: [ { mint, risk_score, band, factors, inputs, as_of } | { mint, error: "not_tracked" } ], count }

// Live WebSocket sessions
const { data: s } = await client.getStreamSessions();
// { sessions: [ { id, service, tier, channels, connected_at, remote_ip, messages_sent } ], count }
await client.deleteStreamSession(s.sessions[0].id); // → { evicted: true, id }
```

### Wallet derived stats *(new in 1.9)*

`WALLET_STATS` now returns a `stats` object with derived fields: `win_rate` (0-1), `roi`, `verdict` ("strong" | "profitable" | "neutral" | "losing"), and `biggest_miss` (token with the highest post-exit gain the wallet missed).

Your agent can then respond to queries like:
- "What are KOLs buying right now?"
- "Show me the KOL leaderboard this week"
- "What tokens are multiple KOLs accumulating?"
- "Any new deployer alerts from Pump.fun?"
- "Show my wallet tracker watchlist"
- "What did my tracked wallets trade recently?"

## Tiers

| Tier | Price | Wallets tracked | Requests/day |
|------|-------|-----------------|--------------|
| BASIC (free) | $0 | 10 | 200 |
| PRO | €43/mo (€430/yr) ≈ $49 | 50 | 10,000 |
| ULTRA | €131/mo (€1310/yr) ≈ $149 | 100 + WS events | 100,000 |

Free tier returns the full REST response shape on every endpoint — real wallets, TX signatures, full precision. Paid tiers unlock webhooks, WebSockets, rule engines, and ULTRA-only data depth. Get a key at [madeonsol.com/pricing](https://madeonsol.com/pricing).

## Also Available

| Platform | Package |
|---|---|
| TypeScript SDK | [`madeonsol`](https://www.npmjs.com/package/madeonsol) on npm |
| Rust SDK | [`madeonsol`](https://crates.io/crates/madeonsol) on crates.io |
| Python (LangChain, CrewAI) | [`madeonsol-x402`](https://pypi.org/project/madeonsol-x402/) on PyPI |
| MCP Server (Claude, Cursor) | [`mcp-server-madeonsol`](https://www.npmjs.com/package/mcp-server-madeonsol) · [Smithery](https://smithery.ai/servers/madeonsol/solana-kol-intelligence) · [Glama](https://glama.ai/mcp/servers/madeonsol/mcp-server-madeonsol) |
| Solana Agent Kit | [`solana-agent-kit-plugin-madeonsol`](https://www.npmjs.com/package/solana-agent-kit-plugin-madeonsol) |

## License

MIT
