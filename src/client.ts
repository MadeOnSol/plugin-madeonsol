/**
 * MadeOnSol API client.
 * Two auth modes: MadeOnSol API key (`msk_`, recommended) or x402 micropayments.
 *
 * v1.0 breaking change: RapidAPI auth has been removed (marketplace retired 2026-04-19).
 * Get a free `msk_` key at https://madeonsol.com/pricing.
 */

import { VERSION } from "./version.js";

const DEFAULT_BASE = "https://madeonsol.com";

/**
 * Build a query string from optional params, dropping anything unset.
 *
 * An omitted argument must not reach the wire: the routes use strict Zod
 * schemas, so `?tier=` (empty) is rejected with a 400 rather than read as
 * "not supplied".
 */
function buildQs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type AuthMode = "madeonsol" | "x402" | "none";

export interface MadeOnSolClientOptions {
  baseUrl?: string;
  /** MadeOnSol API key — get one free at https://madeonsol.com/pricing. Preferred. */
  apiKey?: string;
  /** x402 payment-enabled fetch (for AI agents with SVM_PRIVATE_KEY). */
  fetchFn?: typeof fetch;
}

export interface RateLimitInfo {
  limit?: string;
  remaining?: string;
  reset?: string;
  requestId?: string;
}

/** Net buy/sell flow for a token over a rolling window. Returned by `getTokenFlow`. */
export interface TokenFlow {
  mint: string;
  window: "1h" | "24h";
  from: number;
  unique_wallets: number;
  unique_buyers: number;
  unique_sellers: number;
  buy_count: number;
  sell_count: number;
  total_trades: number;
  buy_sol: number;
  sell_sol: number;
  net_sol: number;
  trades_per_wallet: number;
  /** v1.19.4 — trade-coverage disclosure; when `in_scope` is false the zero counts mean "not covered", not "no activity". */
  coverage?: TradeCoverage;
}

/**
 * Deployer self-activity block on `getTokenRisk` (v1.19). Create-tx self-buy snapshot +
 * dev-sell rollup + a LIVE on-chain holdings check ("is the dev wallet empty NOW").
 * `null` on the parent means the mint has no deployer-pipeline row — absent, not clean.
 */
export interface TokenRiskDev {
  wallet: string | null;
  launchpad: string | null;
  deployed_at: string | null;
  /** Create-tx self-buy snapshot — null on rows pre-dating the rollup or launchlab. */
  buy_sol: number | null;
  buy_tokens: number | null;
  buy_supply_pct: number | null;
  /** Post-create buys on the dev's own mint (catches the same-second-separate-tx dev buy). */
  bought_tokens_after: number | null;
  sold_tokens: number | null;
  sold_sol: number | null;
  first_sell_at: string | null;
  last_sell_at: string | null;
  /** Live on-chain holdings (cached RPC read); null = RPC unavailable right now. */
  holdings_tokens: number | null;
  /** Holdings as % of supply — pump.fun 1B denominator; null for other launchpads. */
  holdings_supply_pct: number | null;
  /** Is the dev wallet empty NOW (<1 token)? null when holdings unknown. */
  wallet_empty: boolean | null;
  /** Tokens left the dev wallet WITHOUT a sell; null = unknown, never a guess. */
  transferred_out: boolean | null;
}

/**
 * Trade-coverage honesty block (v1.19.4). The trade tape starts 2026-04-12
 * (`history_start`, unix sec) and is launchpad-pipeline scoped (`scope`).
 * `in_scope`: `true` = persisted trades exist for the mint/wallet · `false` =
 * outside the write-gate (read zeros as "not covered", NOT "no activity") ·
 * `null` = probe unavailable. `note` explains the gap when `in_scope` is
 * `false`/`null`. Absent on older cached responses.
 */
export type TradeCoverage = {
  history_start: number;
  scope: string;
  in_scope?: boolean | null;
  note?: string;
};

/** Transparent 0–100 rug-risk/safety score (higher = riskier). Returned by `getTokenRisk`. */
export interface TokenRisk {
  mint: string;
  risk_score: number;
  band: string;
  factors?: Array<{ label: string; status: string; detail: string }>;
  inputs?: Record<string, unknown>;
  /** v1.19 — deployer self-activity block (null = no deployer-pipeline row). Single-mint endpoint only. */
  dev?: TokenRiskDev | null;
  /** v1.19.4 — trade-coverage disclosure (single-mint endpoint). Its `note` names the split: trade-derived sub-fields are pipeline-scoped, on-chain sub-fields are unaffected. */
  coverage?: TradeCoverage;
  as_of?: string;
}

/** One bundle-cohort wallet. ULTRA callers additionally get `kol_name`, `win_rate`, `bot_confidence`, `tokens_held`. */
export interface TokenBundleWallet {
  rank: number;
  wallet: string;
  held_ratio: number | null;
  has_sold: boolean;
  atomic: boolean;
  is_kol: boolean;
  kol_name?: string;
  win_rate?: number;
  bot_confidence?: number;
  tokens_held?: number;
}

/**
 * Bundle-cohort holdings for a token. `held_pct_of_supply` is the headline rug/insider
 * signal: how much of supply the same-slot "bundle" wallets STILL hold. Returned by `getTokenBundle`.
 * BASIC get the `bundle` block only (`wallets: []`); PRO adds top-10 flags-only wallets;
 * ULTRA adds KOL identity + win rate + bot confidence.
 */
export interface TokenBundle {
  mint: string;
  bundle: {
    wallet_count: number;
    bundle_kind: "atomic_tx" | "same_slot" | "none";
    held_ratio: number | null;
    /** HEADLINE — fraction of total supply the bundle cohort still holds (0–1, or null). */
    held_pct_of_supply: number | null;
    fully_exited: boolean;
    buy_volume: number;
    tokens_held: number;
  };
  wallets: TokenBundleWallet[];
  /** v1.19.4 — trade-coverage disclosure (absent on older cached responses). */
  coverage?: TradeCoverage;
}

/** A per-mint entry in the batch-risk response: a risk result (with `as_of`), or an error object. */
export type BatchRiskEntry =
  | (TokenRisk & { as_of: string })
  | { mint: string; error: "not_tracked" | "error" };

/** Response of `getTokenRiskBatch`. `tokens` preserves de-duplicated input order; `count` = unique mints. */
export interface BatchRiskResponse {
  tokens: BatchRiskEntry[];
  count: number;
}

/** One DEX pool a token trades in. Returned inside `getTokenPools`. */
export interface TokenPool {
  pool_address: string;
  dex: string;
  quote_mint: string;
  liquidity_usd: number;
  last_price_sol: number;
  last_swap_at: string;
  amm_id: string;
  is_active: boolean;
}

/**
 * Per-venue liquidity map for a token — every DEX pool it trades in, live vs parked,
 * fragmentation + top-pool share. Returned by `getTokenPools`.
 */
export interface TokenPools {
  mint: string;
  pools: TokenPool[];
  summary: {
    pool_count: number;
    active_pool_count: number;
    dex_count: number;
    dexes: string[];
    total_liquidity_usd: number;
    primary_pool: string | null;
    primary_dex: string | null;
    top_pool_share_pct: number | null;
  };
}

/** One buy-size quote inside a `getTokenDepth` pool. */
export interface TokenDepthQuote {
  size_sol: number;
  tokens_out: number;
  avg_price_sol: number;
  price_impact_pct: number;
}

/** A pool with computable depth, inside `getTokenDepth`. */
export interface TokenDepthPool {
  pool_address: string;
  dex: string;
  quote_mint: string;
  pool_model: string | null;
  liquidity_usd: number | null;
  is_active: boolean;
  depth_available: true;
  model: string;
  fee_pct: number;
  /** "stream" = stored stream reserves; "live_rpc" = live curve virtual reserves (pump.fun/bonk). */
  source: "stream" | "live_rpc";
  reserves_age_ms: number;
  spot_price_sol: number;
  quotes: TokenDepthQuote[];
  /** SOL required to move the pool's spot price by 1% / 5% / 10%. */
  to_move_price: { "1pct": number; "5pct": number; "10pct": number };
}

/** A tracked pool we can't compute depth for — honesty marker with a `reason`. */
export interface TokenDepthUnsupportedPool {
  pool_address: string;
  dex: string;
  quote_mint: string;
  pool_model: string | null;
  liquidity_usd: number | null;
  is_active: boolean;
  reason: string;
}

/**
 * Per-pool price-impact / slippage for a token — "how much SOL to move price N%".
 * Impact is per-pool, NOT router-optimal. Returned by `getTokenDepth`.
 * `found: false` (empty pools) means no pools are tracked for the mint.
 */
export interface TokenDepth {
  mint: string;
  found: boolean;
  sol_usd?: number | null;
  sizes_sol: number[];
  primary_pool?: string | null;
  pools: TokenDepthPool[];
  unsupported_pools: TokenDepthUnsupportedPool[];
  note?: string;
}

/** One ranked holder inside `getTokenHolders` (owner wallet, token accounts merged). */
export interface TokenHolderEntry {
  rank: number;
  owner: string;
  token_accounts: string[];
  /** Raw u64 as a decimal STRING — never a float. */
  amount_raw: string;
  amount: number | null;
  pct_of_supply: number | null;
  /** Share of supply minus pools / bonding curves / burns. */
  pct_of_circulating: number | null;
  /** From MadeOnSol wallet intelligence. Empty = unknown to us, NOT verified clean. */
  labels: Array<"deployer" | "kol" | "early_buyer" | "buyer" | "bundle" | "bot" | "dump_cluster">;
  kol_name: string | null;
  early_buyer_rank: number | null;
  bot_confidence: "none" | "low" | "medium" | "high" | null;
  historical_win_rate: number | null;
}

/**
 * An owner EXCLUDED from the circulating denominator, named where we can:
 * `pool` (dex + pool_address set) | `bonding_curve` (pump.fun / LaunchLab) | `burn` |
 * `program_account` (off-curve owner we could not attribute).
 */
export interface TokenHolderExcluded {
  owner: string;
  token_accounts: string[];
  amount_raw: string;
  pct_of_supply: number | null;
  reason: "pool" | "bonding_curve" | "burn" | "program_account";
  dex: string | null;
  pool_address: string | null;
}

/**
 * Live holder census + concentration — who holds NOW. Returned by `getTokenHolders`.
 * `concentration.holder_count` is EXACT (census) and null ONLY when the provider
 * refused the census (see `source.census_fallback_reason`) — never trade-estimated.
 * Raw amounts are u64 STRINGS. Disclosure PRO 10 / ULTRA 50 / BUSINESS 100.
 */
export interface TokenHolders {
  mint: string;
  slot: number | null;
  as_of: string;
  holders: TokenHolderEntry[];
  count: number;
  disclosed: number;
  excluded: TokenHolderExcluded[];
  concentration: {
    holder_count: number | null;
    holder_count_source: "census" | null;
    token_accounts_nonzero: number | null;
    supply_raw: string | null;
    circulating_raw: string | null;
    decimals: number | null;
    top1_share: number | null;
    top10_share: number | null;
    top20_share: number | null;
    top50_share: number | null;
    top100_share: number | null;
    pool_and_program_pct: number | null;
    pool_pct: number | null;
    burned_pct: number | null;
    program_pct: number | null;
    deployer_pct: number | null;
    kol_pct: number | null;
    early_buyer_pct: number | null;
    bundle_pct: number | null;
    bot_pct: number | null;
    dump_cluster_pct: number | null;
    distinct_owners_in_top20: number;
    ranked_owners_available: number;
  };
  deployer: { wallet: string; tier: string; bonding_rate: number | null } | null;
  source: {
    method: "getProgramAccounts_census" | "getTokenLargestAccounts";
    token_program: string | null;
    rpc_cap: number;
    commitment: string;
    scan_ms: number | null;
    census_fallback_reason: string | null;
    note: string;
  };
}

// ── Token locks & vesting (GET /tokens/{mint}/locks, /tokens/locks, /tokens/unlocks — PRO+, keyed API only) ──

export type TokenLockProgram = "streamflow" | "jupiter_lock" | "bonfida_vesting";
export type TokenLockKind = "lock" | "vesting";
export type TokenLockStatus = "active" | "completed" | "cancelled" | "closed";
export type TokenUnlockEventKind = "cliff" | "period" | "final" | "tranche";

/** The next unlock event of a contract (or the nearest one across a mint's contracts). */
export interface TokenLockNextUnlock {
  at: string;
  kind: TokenUnlockEventKind;
  /** Base units as a digit STRING. */
  amount_raw: string;
  amount: number | null;
  amount_usd: number | null;
  /** Only on the summary-level `next_unlock`. */
  lock_account?: string;
}

/**
 * One on-chain lock / vesting contract with a live-derived view (computed at request time).
 * `*_raw` = base units as digit STRINGS — never coerce to a float; ui / usd / pct are null when
 * decimals or price are unknown. LP locks are NOT included in this feature.
 */
export interface TokenLock {
  /** The contract account (Streamflow stream / Jupiter VestingEscrow / Bonfida vesting account). */
  lock_account: string;
  program: TokenLockProgram;
  /** lock = whole amount at one date; vesting = cliff and/or periodic release. */
  kind: TokenLockKind;
  /** Derived at request time. */
  status: TokenLockStatus;
  mint: string;
  /** Creator / locker (Bonfida has none on-chain). */
  sender: string | null;
  recipient: string | null;
  name: string | null;
  amount_raw: string;
  amount: number | null;
  amount_usd: number | null;
  amount_pct_of_supply: number | null;
  /** Still locked right now (amount − unlocked-so-far); 0 unless active. */
  locked_raw: string;
  locked: number | null;
  locked_usd: number | null;
  locked_pct_of_supply: number | null;
  unlocked_raw: string;
  unlocked: number | null;
  /** Claimed so far. */
  withdrawn_raw: string;
  withdrawn: number | null;
  /** Unlocked but not yet withdrawn. */
  claimable_raw: string;
  claimable: number | null;
  start_at: string | null;
  cliff_at: string | null;
  /** Fully unlocked at; null = perpetual / no schedule. */
  end_at: string | null;
  period_seconds: number | null;
  /** period < 1h (per-second stream). */
  continuous: boolean;
  amount_per_period_raw: string | null;
  amount_per_period: number | null;
  cliff_amount_raw: string | null;
  cliff_amount: number | null;
  perpetual: boolean;
  next_unlock: TokenLockNextUnlock | null;
  /** The locker can cancel — funds are locked against the recipient, not the locker. */
  cancelable_by_sender: boolean | null;
  cancelable_by_recipient: boolean | null;
  transferable: boolean | null;
  can_topup: boolean | null;
  cancelled_at: string | null;
  created_at: string | null;
  /** Backfilled row with no on-chain creation time (Jupiter Lock). */
  created_at_estimated: boolean;
  tx_signature: string | null;
}

/** Token facts joined onto lock rows / unlock events. */
export interface TokenLockTokenInfo {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  price_usd: number | null;
  market_cap_usd: number | null;
}

/** Response of `getTokenLocks(mint)` — every lock/vesting contract on ONE mint + summary. */
export interface TokenLocks {
  mint: string;
  token: TokenLockTokenInfo & { supply: number | null; facts_resolved: boolean };
  summary: {
    /** Exact count of contracts on the mint. */
    lock_count: number;
    /** false when the mint holds more than 5000 contracts — totals then cover the newest 5000 (rows_considered). */
    complete: boolean;
    rows_considered: number;
    active_count: number;
    by_program: Record<string, number>;
    by_kind: Record<string, number>;
    distinct_lockers: number;
    locked_raw: string;
    locked: number | null;
    locked_usd: number | null;
    locked_pct_of_supply: number | null;
    deposited_raw: string;
    deposited: number | null;
    deposited_usd: number | null;
    unlocking_7d_raw: string;
    unlocking_7d: number | null;
    unlocking_7d_usd: number | null;
    unlocking_7d_pct_of_supply: number | null;
    unlocking_30d_raw: string;
    unlocking_30d: number | null;
    unlocking_30d_usd: number | null;
    unlocking_30d_pct_of_supply: number | null;
    next_unlock: TokenLockNextUnlock | null;
    active_cancelable_by_sender: number;
  };
  locks: TokenLock[];
  meta?: Record<string, unknown>;
}

/** Response of `getTokenLocksFeed(params)` — newest lock/vesting contracts across all mints. */
export interface TokenLocksFeed {
  locks: Array<TokenLock & { token: TokenLockTokenInfo }>;
  pagination: { limit: number; count: number; has_more: boolean; next_since: string | null; next_before: string | null };
  /** WebSocket pointer for the `token:locks` channel (event `token:lock`). */
  stream?: { channel: string; url?: string; [k: string]: unknown };
  meta?: Record<string, unknown>;
}

/** One upcoming unlock event inside `getTokenUnlocks(params)`. */
export interface TokenUnlockEvent {
  unlock_at: string;
  in_seconds: number;
  event: TokenUnlockEventKind;
  amount_raw: string;
  amount: number | null;
  amount_usd: number | null;
  amount_pct_of_supply: number | null;
  /** This contract's total release over the whole window. */
  window_amount_raw: string;
  window_amount: number | null;
  window_amount_usd: number | null;
  window_amount_pct_of_supply: number | null;
  mint: string;
  token: TokenLockTokenInfo;
  /** The contract this event belongs to (subset of the `TokenLock` row). */
  lock: Partial<TokenLock> & { lock_account: string; program: TokenLockProgram };
}

/** Response of `getTokenUnlocks(params)`. */
export interface TokenUnlocks {
  window: { within: string; from: string; to: string };
  unlocks: TokenUnlockEvent[];
  pagination: { limit: number; count: number; total_in_window: number; has_more: boolean };
  meta?: Record<string, unknown>;
}

// ── pump.fun creator-fee sharing / claims (GET /tokens/{mint}/fee-shares, /tokens/fee-claims — PRO+, keyed API only) ──

/** A platform identity (SocialFeePda) that fees are earmarked for. platform 2 = X; user_id is the platform-native numeric id, not the handle. */
export interface FeeShareSocial {
  platform: number;
  /** "x" for platform 2; `platform_<n>` until observed. */
  platform_label: string | null;
  user_id: string;
  lifetime_claimed_raw: string;
  lifetime_claimed: number | null;
  lifetime_claimed_usd: number | null;
  last_claimed_at: string | null;
}

/** One shareholder / recipient of a pump.fun SharingConfig. */
export interface FeeShareholder {
  address: string;
  share_bps: number | null;
  share_pct: number | null;
  /** The config admin (normally the coin creator). */
  is_admin: boolean;
  /** Address is a pump_fees SocialFeePda — fees earmarked for a platform identity. */
  is_social_pda: boolean;
  social: FeeShareSocial | null;
  /** Quote base units (SOL lamports unless a stable-quoted coin) as a digit STRING. */
  received_raw: string;
  received: number | null;
  received_usd: number | null;
  payout_count: number;
  last_payout_at: string | null;
}

/** Response of `getTokenFeeShares(mint)`. Event history (distributions / history) starts 2026-08-17. */
export interface TokenFeeShares {
  mint: string;
  /** null only when the live read failed on every RPC endpoint (see `config_error`). */
  config: {
    sharing_config: string;
    admin: string | null;
    admin_revoked: boolean | null;
    status: string | null;
    version: number | null;
    /** 100% to the admin — no redirect. A real answer, not "no data". */
    is_default: boolean | null;
    redirected_bps: number;
    redirected_pct: number;
    social_bps: number;
    social_pct: number;
    shareholders: FeeShareholder[];
    /** stream = our table (only NON-default configs are stored); chain = live PDA read. */
    source: "stream" | "chain";
    updated_at: string | null;
  } | null;
  config_pda: string;
  config_error: string | null;
  quote: { symbol: string; decimals: number; sol_usd: number | null };
  distributions: {
    count: number;
    total_raw: string;
    total: number | null;
    total_usd: number | null;
    last_at: string | null;
    recipients: FeeShareholder[];
    past_recipients: FeeShareholder[];
    payouts_considered: number;
    payouts_truncated: boolean;
  };
  /** Config changes + creator transfers, newest first. */
  history: Array<Record<string, unknown>>;
  recent_distributions: Array<{
    at: string;
    tx_signature: string;
    amount_raw: string;
    amount: number | null;
    amount_usd: number | null;
    shareholders: Array<Record<string, unknown>>;
    actor: string | null;
  }>;
  meta?: Record<string, unknown>;
}

export type TokenFeeEventType =
  | "shares_created"
  | "shares_updated"
  | "shares_reset"
  | "distribution"
  | "social_pda_created"
  | "social_claim"
  | "creator_transferred"
  | "creator_claim";

/** One pump.fun fee event inside `getTokenFeeClaims(params)`. */
export interface TokenFeeEvent {
  id: number;
  type: TokenFeeEventType;
  at: string;
  tx_signature: string;
  slot: number | null;
  /** NULL for social claims and creator vault claims (per identity / per creator). */
  mint: string | null;
  admin: string | null;
  /** Transaction signer. */
  actor: string | null;
  recipient: string | null;
  /** Quote base units (SOL lamports unless a stable-quoted coin) as a digit STRING. */
  amount_raw: string | null;
  amount: number | null;
  amount_usd: number | null;
  quote: string;
  social: { platform: number; platform_label: string | null; user_id: string; pda: string | null } | null;
  shareholders: Array<{ address: string; share_bps: number }> | null;
  /** distribution only: pro-rata amount per shareholder. */
  payouts: Array<{ address: string; share_bps: number; amount_raw: string; amount: number | null; amount_usd: number | null }> | null;
  /** Full decoded Anchor event. */
  payload: Record<string, unknown> | null;
}

/** Response of `getTokenFeeClaims(params)`. History starts 2026-08-17. */
export interface TokenFeeClaims {
  events: TokenFeeEvent[];
  pagination: { limit: number; count: number; has_more: boolean; next_since: string | null; next_before: string | null };
  /** WebSocket pointer for the `token:fee_claims` channel (event `token:fee_claim`). */
  stream?: { channel: string; url?: string; [k: string]: unknown };
  meta?: Record<string, unknown>;
}

export interface TokenLocksParams {
  status?: TokenLockStatus;
  program?: TokenLockProgram;
  /** 1–500, default 200. */
  limit?: number;
}

export interface TokenLocksFeedParams {
  /** ISO 8601 — only contracts created after this instant (pagination.next_since). */
  since?: string;
  /** ISO 8601 — page back (pagination.next_before). */
  before?: string;
  mint?: string;
  sender?: string;
  recipient?: string;
  program?: TokenLockProgram;
  kind?: TokenLockKind;
  status?: TokenLockStatus;
  /** Deposited amount ≥ (needs a known price; post-filter). */
  min_usd?: number;
  /** 0–100 (post-filter). */
  min_pct_of_supply?: number;
  /** "1" to include backfilled Jupiter Lock rows (estimated created_at); excluded by default. */
  include_estimated?: "1" | "0" | "true" | "false" | boolean;
  /** 1–100, default 50. */
  limit?: number;
}

export interface TokenUnlocksParams {
  within?: "1h" | "6h" | "24h" | "3d" | "7d" | "14d" | "30d" | "90d";
  mint?: string;
  program?: TokenLockProgram;
  kind?: TokenLockKind;
  /** Next-event amount ≥ (needs a known price). */
  min_usd?: number;
  min_pct_of_supply?: number;
  sort?: "soonest" | "largest_usd" | "largest_pct";
  /** 1–200, default 50. */
  limit?: number;
}

export interface TokenFeeClaimsParams {
  /** Comma list of event types (default: all except creator_claim). */
  type?: string;
  mint?: string;
  /** Payout / claim recipient wallet, or new creator. */
  recipient?: string;
  /** Transaction signer. */
  actor?: string;
  /** Raw platform id (2 = X). */
  social_platform?: number;
  /** Platform-native numeric user id. */
  social_user_id?: string;
  /** Amount floor in SOL. */
  min_sol?: number;
  since?: string;
  before?: string;
  /** 1–100, default 50. */
  limit?: number;
}

/** One daily reputation snapshot for a deployer. Returned inside `getDeployerHistory`. */
export interface DeployerSnapshot {
  date: string;
  tier: string;
  is_tracked: boolean;
  total_deployed: number;
  total_bonded: number;
  bonding_rate: number;
  recent_bond_rate: number;
  avg_peak_mc: number;
  best_token_peak_mc: number;
}

/**
 * A deployer's daily reputation time-series — backtest "was this deployer elite when
 * it launched token X?" without look-ahead bias. Returned by `getDeployerHistory`.
 */
export interface DeployerHistory {
  is_deployer: boolean;
  wallet: string;
  snapshots: DeployerSnapshot[];
}

/** Rolling dump-cluster stats for a wallet (trailing 42 days, refreshed daily). `null` = no cohort record. */
export interface DumpClusterStats {
  dump_cohorts: number;
  runner_cohorts: number;
  total_cohorts: number;
  as_of: string;
}

/**
 * One wallet's reputation flags. Values match the `flags` block of `getWalletStats` exactly.
 * All flags are pump.fun-pipeline scoped — `false` means "not observed by our pipeline",
 * NOT verified clean. `is_bundler` is a lifetime flag; `is_dumper` is a rolling 42-day window.
 */
export interface WalletClassification {
  address: string;
  is_sniper: boolean;
  is_bundler: boolean;
  is_dumper: boolean;
  is_kol: boolean;
  kol_name: string | null;
  /** Bot-likelihood grade — a STRING enum, never a number. */
  bot_confidence: "none" | "low" | "medium" | "high" | null;
  dump_cluster: DumpClusterStats | null;
}

/** Response of `classifyWallets`. */
export interface WalletClassifyResponse {
  wallets: WalletClassification[];
  count: number;
  as_of: string;
}

/** One trade on a token's trade tape. Returned inside `getTokenTrades`. */
export interface TokenTradeEntry {
  tx_signature: string;
  wallet_address: string;
  action: "buy" | "sell";
  sol_amount: number;
  token_amount: number;
  /** THIS trade's executed price: `sol_amount / token_amount`. Because `sol_amount`
   *  is the wallet's net SOL movement, it is the trader's all-in effective rate —
   *  swap fee and any account rent included — not the pool mid. `null` for dust and
   *  zero-SOL legs. Split from the canonical price on 2026-08-16. */
  price_sol: number | null;
  /** {@link TokenTradeEntry.price_sol} in USD. */
  price_usd: number | null;
  /** Canonical pool price sampled near this trade's slot — one value per token per
   *  update, so every trade in a slot shares it. Use for a per-token series; use
   *  `price_sol` for cost basis and PnL. */
  market_price_sol: number | null;
  /** {@link TokenTradeEntry.market_price_sol} in USD. */
  market_price_usd: number | null;
  early_buyer_rank: number | null;
  slot: number | null;
  block_time: number;
  traded_at: string;
}

/**
 * Mint-scoped trade tape (cursor-paginated, newest first). `coverage` is the honesty
 * block: the tape starts 2026-04-12 (`history_start`, unix sec) and is pump.fun-pipeline
 * scoped (`scope`) — trades outside that pipeline are not on the tape. Returned by `getTokenTrades`.
 */
export interface TokenTrades {
  mint: string;
  trades: TokenTradeEntry[];
  next_cursor: string | null;
  has_more: boolean;
  filters: { action: "buy" | "sell" | null; wallet: string | null; since: number; until: number };
  coverage: TradeCoverage;
}

/** A live WebSocket streaming session. Returned by `getStreamSessions`. */
export interface StreamSession {
  id: string;
  service: "ws-streaming" | "dex-stream";
  tier: string;
  channels: string[];
  connected_at: string;
  remote_ip: string | null;
  messages_sent: number;
}

/** Response of `getStreamSessions`. */
export interface StreamSessionsResponse {
  sessions: StreamSession[];
  count: number;
}

export class MadeOnSolClient {
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private authMode: AuthMode;
  private authHeaders: Record<string, string>;

  /** Most recent rate-limit headers, populated by every request. */
  lastRateLimit: RateLimitInfo = {};

  constructor(options: MadeOnSolClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.authHeaders = {};

    if (options.apiKey) {
      this.authMode = "madeonsol";
      this.authHeaders = { Authorization: `Bearer ${options.apiKey}`, "User-Agent": `plugin-madeonsol/${VERSION}` };
    } else if (options.fetchFn) {
      this.authMode = "x402";
    } else {
      this.authMode = "none";
      console.warn(
        "\n[madeonsol] MadeOnSolClient constructed without apiKey or fetchFn — every request will fail.\n" +
        "  → Get a free key (200 req/day, no card) at https://madeonsol.com/pricing\n" +
        "  → Then: new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY })\n",
      );
    }
  }

  private captureRateLimit(res: Response) {
    this.lastRateLimit = {
      limit: res.headers.get("X-RateLimit-Limit") ?? undefined,
      remaining: res.headers.get("X-RateLimit-Remaining") ?? undefined,
      reset: res.headers.get("X-RateLimit-Reset") ?? undefined,
      requestId: res.headers.get("X-Request-Id") ?? undefined,
    };
  }

  async query<T = unknown>(path: string, params?: Record<string, string | undefined>): Promise<{ data?: T; error?: string; status: number }> {
    const apiPath = this.authMode === "x402" || this.authMode === "none"
      ? path
      : path.replace("/api/x402/", "/api/v1/");
    const url = new URL(apiPath, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const res = this.authMode === "x402"
      ? await this.fetchFn(url.toString(), { method: "GET" })
      : await this.fetchFn(url.toString(), { method: "GET", headers: this.authHeaders });

    this.captureRateLimit(res);

    if (res.status === 402) {
      const body = await res.json();
      return { error: `Payment required: ${JSON.stringify(body.accepts?.[0] || body)}`, status: 402 };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { error: text, status: res.status };
    }

    const data = await res.json() as T;
    return { data, status: res.status };
  }

  getKolFeed(params?: { limit?: string; before?: string; action?: string; kol?: string; min_sol?: string; token_age_max_min?: string; exclude_sells?: string; min_kol_winrate?: string; strategy?: string }) {
    return this.query("/api/x402/kol/feed", params);
  }

  getKolCoordination(params?: {
    period?: string;
    min_kols?: string;
    limit?: string;
    /** v1.1 — include WIF/BONK/POPCAT etc. ("true" | "false", default "false") */
    include_majors?: string;
    /** v1.1 — peak-density window in minutes (1-60, default 15) */
    window_minutes?: string;
    /** v1.1 — minimum composite coordination_score (0-100) */
    min_score?: string;
    min_avg_winrate?: string;
    unique_strategies?: string;
  }) {
    return this.query("/api/x402/kol/coordination", params);
  }

  getKolLeaderboard(params?: { period?: string; limit?: string }) {
    return this.query("/api/x402/kol/leaderboard", params);
  }

  /**
   * Get deployer alerts. The `tier` filter (elite/good/moderate/rising/cold)
   * is PRO/ULTRA only — BASIC callers passing it receive HTTP 403.
   * Cursor-paginated via `before` (preferred over `offset` at scale).
   */
  getDeployerAlerts(params?: { since?: string; before?: string; limit?: string; offset?: string; tier?: string; alert_type?: string; priority?: string; min_kol_buys?: string }) {
    return this.query("/api/x402/deployer-hunter/alerts", params);
  }

  getKolPairs(params?: { period?: string; min_shared?: string; limit?: string }) {
    return this.query("/api/x402/kol/pairs", params);
  }

  getKolHotTokens(params?: { period?: string; min_kols?: string; limit?: string }) {
    return this.query("/api/x402/kol/tokens/hot", params);
  }

  getKolTrendingTokens(params?: { period?: string; min_kols?: string; limit?: string }) {
    return this.query("/api/x402/kol/tokens/trending", params);
  }

  getKolTokenEntryOrder(mint: string, params?: { limit?: string }) {
    return this.query(`/api/x402/kol/tokens/${encodeURIComponent(mint)}/entry-order`, params);
  }

  getKolCompare(wallets: string[]) {
    return this.query("/api/x402/kol/compare", { wallets: wallets.join(",") });
  }

  getKolAlertsRecent(params?: { window?: string; types?: string; min_severity?: string; limit?: string }) {
    return this.query("/api/x402/kol/alerts/recent", params);
  }

  getKolPnl(wallet: string, params?: { period?: string }) {
    const qs = params?.period ? `?period=${params.period}` : "";
    return this.restRequest("GET", `/kol/${wallet}/pnl${qs}`);
  }

  getKolTiming(wallet: string, params?: { period?: string }) {
    const qs = params?.period ? `?period=${params.period}` : "";
    return this.restRequest("GET", `/kol/${wallet}/timing${qs}`);
  }

  getDeployerTrajectory(wallet: string) {
    return this.restRequest("GET", `/deployer-hunter/${wallet}/trajectory`);
  }

  /**
   * A deployer's daily reputation time-series — backtest "was this deployer elite when
   * it launched token X?" without look-ahead bias. Returns `is_deployer`, `wallet`, and
   * `snapshots[]` (each `date`, `tier`, `is_tracked`, `total_deployed`, `total_bonded`,
   * `bonding_rate`, `recent_bond_rate`, `avg_peak_mc`, `best_token_peak_mc`).
   * `limit` is the number of days (1–365, default 90). PRO+.
   */
  getDeployerHistory(wallet: string, limit?: number) {
    const qs = limit !== undefined ? `?limit=${limit}` : "";
    return this.restRequest<DeployerHistory>("GET", `/deployer-hunter/${encodeURIComponent(wallet)}/history${qs}`);
  }

  // ── Deployer hunter: reputation, leaderboard, outcomes (msk_ key only) ──
  //
  // "Bonding" is the pump.fun graduation event. `bonding_rate` is LIFETIME,
  // `recent_bond_rate` is the ROLLING recent window — the gap between them is
  // the signal, not either alone. `runner_rate` needs `labeled_tokens >= 3`.

  /** Chain-wide deployer stats — tracked count, bonds detected, bond rate, tier counts. */
  getDeployerStats() {
    return this.restRequest("GET", "/deployer-hunter/stats");
  }

  /**
   * Deployer reputation leaderboard, excluding unranked deployers. Compare
   * `bonding_rate` (lifetime) against `recent_bond_rate` (rolling) — a deployer
   * at 0.40 lifetime and 0.05 recent is cooling off.
   */
  getDeployerLeaderboard(params?: { tier?: string; sort?: string; limit?: number; offset?: number }) {
    const qs = buildQs(params);
    return this.restRequest("GET", `/deployer-hunter/leaderboard${qs}`);
  }

  /**
   * One deployer's profile. An UNTRACKED wallet returns zeroed counters, not a
   * 404 — check `total_deployed` before drawing a conclusion.
   */
  getDeployerProfile(wallet: string) {
    return this.restRequest("GET", `/deployer-hunter/${encodeURIComponent(wallet)}`);
  }

  /** Every token one deployer launched, with time-to-bond and peak MC. */
  getDeployerTokens(wallet: string, params?: { limit?: number; offset?: number; only_bonded?: boolean }) {
    const qs = buildQs(params);
    return this.restRequest("GET", `/deployer-hunter/${encodeURIComponent(wallet)}/tokens${qs}`);
  }

  /** Alert volume plus per-tier bond-rate and MC-multiplier distributions. */
  getDeployerAlertStats(params?: { period?: string }) {
    const qs = buildQs(params);
    return this.restRequest("GET", `/deployer-hunter/alert-stats${qs}`);
  }

  /** Best recent tokens from ranked (non-unranked) deployers, by peak MC multiple. */
  getDeployerBestTokens(params?: { period?: string; limit?: number }) {
    const qs = buildQs(params);
    return this.restRequest("GET", `/deployer-hunter/best-tokens${qs}`);
  }

  /**
   * Fresh graduations from tracked deployers. Poll incrementally: pass the
   * previous response's `next_since` back as `since`.
   */
  getDeployerRecentBonds(params?: { limit?: number; since?: string; tier?: string; peak_mc_min?: number }) {
    const qs = buildQs(params);
    return this.restRequest("GET", `/deployer-hunter/recent-bonds${qs}`);
  }

  // ── REST helper (used by webhooks, streaming, alpha, copy-trade, wallet-tracker) ──

  private async restRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<{ data?: T; error?: string; status: number }> {
    if (this.authMode !== "madeonsol") {
      return { error: "MadeOnSol API key required for this endpoint. Get a free `msk_` key at https://madeonsol.com/pricing", status: 401 };
    }
    const res = await this.fetchFn(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    this.captureRateLimit(res);
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      return { error: text, status: res.status };
    }
    return { data: await res.json() as T, status: res.status };
  }

  // ── Webhook management (PRO/ULTRA) ──

  createWebhook(params: { url: string; events: string[]; filters?: Record<string, unknown> }) {
    return this.restRequest("POST", "/webhooks", params);
  }

  listWebhooks() {
    return this.restRequest("GET", "/webhooks");
  }

  deleteWebhook(id: number) {
    return this.restRequest("DELETE", `/webhooks/${id}`);
  }

  testWebhook(webhookId: number) {
    return this.restRequest("POST", "/webhooks/test", { webhook_id: webhookId });
  }

  getStreamToken() {
    return this.restRequest("POST", "/stream/token");
  }

  // ── Live WebSocket sessions (PRO/ULTRA) ──

  /** List the caller's live WebSocket streaming sessions across ws-streaming + dex-stream. PRO+. */
  getStreamSessions() {
    return this.restRequest<StreamSessionsResponse>("GET", "/stream/sessions");
  }

  /**
   * Force-evict (kill) a live WebSocket session by id — frees a connection slot.
   * Returns `{ evicted: true, id }`; 404 if no session with that id, 400 if `id` is
   * not a positive integer. PRO+.
   */
  deleteStreamSession(id: number | string) {
    return this.restRequest<{ evicted: true; id: string }>("DELETE", `/stream/sessions/${id}`);
  }

  // ── Wallet Tracker ──

  getWalletTrackerWatchlist() {
    return this.restRequest("GET", "/wallet-tracker/watchlist");
  }

  addToWatchlist(walletAddress: string, label?: string) {
    return this.restRequest("POST", "/wallet-tracker/watchlist", { wallet_address: walletAddress, ...(label ? { label } : {}) });
  }

  removeFromWatchlist(walletAddress: string) {
    return this.restRequest("DELETE", `/wallet-tracker/watchlist/${encodeURIComponent(walletAddress)}`);
  }

  getWalletTrackerTrades(params?: { wallet?: string; action?: string; event_type?: string; limit?: string; before?: string }) {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) qs.set(k, v);
      }
    }
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/wallet-tracker/trades${query}`);
  }

  // ── Universal wallet endpoints (PRO+, any wallet — not just curated KOLs) ──

  getWalletStats(address: string) {
    return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}`);
  }

  getWalletPnl(address: string) {
    return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/pnl`);
  }

  getWalletPositions(address: string) {
    return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/positions`);
  }

  /**
   * Verified CURRENT on-chain holdings for any wallet — the wallet's actual SPL + Token-2022
   * token accounts and SOL balance read straight from chain, enriched with price/MC/name/symbol,
   * plus `transfer_delta` (on-chain amount − trade-derived net position, exposing non-swap flows
   * like airdrops, insider funding, wallet-hopping). Distinct from `getWalletPositions` (trade-derived
   * FIFO): holdings = what the wallet actually holds right now. `limit` 1–500 (default 200);
   * `min_value_usd` ≥0 (default 0). ULTRA only.
   */
  getWalletHoldings(address: string, params?: { limit?: number; min_value_usd?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.min_value_usd !== undefined) qs.set("min_value_usd", String(params.min_value_usd));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/holdings${query}`);
  }

  getWalletTrades(address: string, params?: { limit?: number; cursor?: string; action?: "buy" | "sell"; token_mint?: string; since?: number; until?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.action) qs.set("action", params.action);
    if (params?.token_mint) qs.set("token_mint", params.token_mint);
    if (params?.since !== undefined) qs.set("since", String(params.since));
    if (params?.until !== undefined) qs.set("until", String(params.until));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/trades${query}`);
  }

  /**
   * Bulk wallet reputation flags for 1–100 addresses in one request (POST /wallet/batch/classify).
   * Each entry matches the `flags` block of `getWalletStats`: `is_sniper`, `is_bundler` (lifetime),
   * `is_dumper` (rolling 42d), `is_kol` + `kol_name`, `bot_confidence` ("none"/"low"/"medium"/"high"
   * string enum), and `dump_cluster` cohort stats. Flags are pump.fun-pipeline scoped — `false`
   * means "not observed", NOT verified clean. PRO+.
   */
  classifyWallets(wallets: string[]) {
    return this.restRequest<WalletClassifyResponse>("POST", "/wallet/batch/classify", { wallets });
  }

  /**
   * Mint-scoped trade tape — every captured trade for a token, cursor-paginated newest first
   * (GET /tokens/{mint}/trades). Filter by `action`, `wallet`, and a `since`/`until` unix-seconds
   * window; unlike `getWalletTrades` (90-day default) the default window is the FULL history.
   * Coverage honesty: the tape starts 2026-04-12 and is pump.fun-pipeline scoped — see the
   * response's `coverage` block. PRO+.
   */
  getTokenTrades(mint: string, params?: { limit?: number; cursor?: string; action?: "buy" | "sell"; wallet?: string; since?: number; until?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.action) qs.set("action", params.action);
    if (params?.wallet) qs.set("wallet", params.wallet);
    if (params?.since !== undefined) qs.set("since", String(params.since));
    if (params?.until !== undefined) qs.set("until", String(params.until));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenTrades>("GET", `/tokens/${encodeURIComponent(mint)}/trades${query}`);
  }

  getWalletTrackerSummary(params?: { period?: string; wallet?: string }) {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    if (params?.wallet) qs.set("wallet", params.wallet);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/wallet-tracker/summary${query}`);
  }

  // ── Alpha Wallet Intelligence ──

  getAlphaLeaderboard(params?: { limit?: string; min_tokens?: string; min_pnl?: string }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/alpha/leaderboard${query}`);
  }

  getAlphaWallet(wallet: string) {
    return this.restRequest("GET", `/alpha/${encodeURIComponent(wallet)}`);
  }

  getAlphaLinked(wallet: string) {
    return this.restRequest("GET", `/alpha/${encodeURIComponent(wallet)}/linked`);
  }

  // ── Token Quality ──

  getTokenCapTable(mint: string) {
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/cap-table`);
  }

  getTokenBuyerQuality(mint: string) {
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/buyer-quality`);
  }

  /** Transparent 0–100 rug-risk/safety score (higher = riskier) with band, explainable factors, and raw inputs. PRO+. */
  getTokenRisk(mint: string) {
    return this.restRequest<TokenRisk>("GET", `/tokens/${encodeURIComponent(mint)}/risk`);
  }

  /**
   * Bundle-cohort holdings — which same-slot "bundle" wallets (≥3 buying in one slot)
   * bought a token and how much of supply they STILL hold (`held_pct_of_supply` is the
   * headline rug/insider signal, from confirmed on-chain data). BASIC get the
   * `bundle` summary block only (`wallets: []`); PRO adds top-10 flags-only wallets;
   * ULTRA adds KOL identity, win rate, and bot confidence.
   */
  getTokenBundle(mint: string) {
    return this.restRequest<TokenBundle>("GET", `/tokens/${encodeURIComponent(mint)}/bundle`);
  }

  /**
   * Per-venue liquidity map — every DEX pool a token trades in, live vs parked, with
   * fragmentation and top-pool share. Each pool carries `pool_address`, `dex`,
   * `quote_mint`, `liquidity_usd`, `last_price_sol`, `last_swap_at`, `amm_id`, and
   * `is_active`; `summary` rolls up `pool_count`, `active_pool_count`, `dex_count`,
   * `dexes`, `total_liquidity_usd`, `primary_pool`, `primary_dex`, and `top_pool_share_pct`. PRO+.
   */
  getTokenPools(mint: string) {
    return this.restRequest<TokenPools>("GET", `/tokens/${encodeURIComponent(mint)}/pools`);
  }

  /**
   * Per-pool price-impact / slippage — "how much SOL moves this token's price N%"
   * and the impact of each buy size, per pool (NOT router-optimal). Each computable
   * pool carries `spot_price_sol`, `fee_pct`, a `quotes[]` entry per requested SOL
   * size (`tokens_out`, `avg_price_sol`, `price_impact_pct`), and `to_move_price`
   * (SOL to move price 1%/5%/10%). Constant-product pools come from stream reserves
   * (`source: "stream"`); pump.fun/bonk curves from a live read of the curve's
   * virtual reserves (`source: "live_rpc"`). Pools we can't price honestly (CLMM/
   * Orca/DLMM, Meteora-DBC, unclassified) land in `unsupported_pools[]` with a
   * `reason` instead of a wrong number. `sizes` — up to 8 SOL buy sizes (each >0
   * and ≤10000; default [0.5, 1, 5, 10]). PRO+.
   */
  getTokenDepth(mint: string, params?: { sizes?: number[] }) {
    const qs = new URLSearchParams();
    if (params?.sizes && params.sizes.length > 0) qs.set("sizes", params.sizes.join(","));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenDepth>("GET", `/tokens/${encodeURIComponent(mint)}/depth${query}`);
  }

  /**
   * Live holder census + concentration — who holds NOW (`getTokenCapTable` = who
   * bought first). Read live from the ledger at `confirmed`: every token account of
   * the mint (mint-scoped `getProgramAccounts`), merged per owner. `concentration.holder_count`
   * is EXACT (distinct non-zero owners minus excluded pools/curves/burns) and null ONLY
   * when the provider refuses the census for a mega-cap (then `source.method` is
   * `getTokenLargestAccounts`, `source.census_fallback_reason` is set and only the top-20
   * view is served) — never estimated from trades. Each disclosed owner carries `labels[]`
   * (deployer / kol / early_buyer / buyer / bundle / bot / dump_cluster; empty = unknown,
   * NOT verified clean). Pools, bonding curves and burns are EXCLUDED from the circulating
   * denominator and NAMED in `excluded[]` (`pool` + dex + pool_address | `bonding_curve` |
   * `burn` | `program_account`). `amount_raw` / `supply_raw` / `circulating_raw` are raw u64
   * STRINGS. Disclosure PRO 1–10, ULTRA 1–50, BUSINESS 1–100; the maths is tier-independent.
   * Large established tokens may first return HTTP 503 `holder_scan_in_progress`
   * (`retry_after_seconds: 20`) — the scan continues and is cached, the retry is instant. PRO+.
   */
  getTokenHolders(mint: string) {
    return this.restRequest<TokenHolders>("GET", `/tokens/${encodeURIComponent(mint)}/holders`);
  }

  /**
   * Token locks & vesting on ONE mint — every Streamflow / Jupiter Lock / Bonfida vesting
   * contract decoded from the locker programs' account state, with the schedule, the terms
   * (`cancelable_by_sender` = the locker can pull it — funds are locked against the recipient,
   * not the locker) and a LIVE-derived view (`locked_*`, `claimable_*`, `next_unlock`, `status`),
   * plus a `summary` (locked / deposited totals, `unlocking_7d_*` / `unlocking_30d_*`, nearest
   * `next_unlock`, `active_cancelable_by_sender`). Answers "did the team lock, how much, until
   * when, and can they pull it". Base-unit amounts are digit STRINGS; ui/usd/pct null when
   * decimals or price are unknown (`token.facts_resolved`). `status` / `program` filter the list
   * only — the summary always covers all rows. **LP locks are NOT included.** PRO+ (keyed API only).
   */
  getTokenLocks(mint: string, params?: TokenLocksParams) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.program) qs.set("program", params.program);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenLocks>("GET", `/tokens/${encodeURIComponent(mint)}/locks${query}`);
  }

  /**
   * Cross-token feed of NEW lock / vesting contracts, newest first (same row shape as
   * `getTokenLocks` + `token {symbol, price_usd, market_cap_usd}`). Poll with `since`
   * (cursor `pagination.next_since`), page back with `before`, or subscribe to WS channel
   * `token:locks` (event `token:lock`) for a push the moment the contract lands. `min_usd` /
   * `min_pct_of_supply` / `status` post-filter (×4 over-fetch, pages may be short). Backfilled
   * Jupiter Lock rows (`created_at_estimated`) are excluded unless `include_estimated: "1"`.
   * LP locks NOT included. PRO+ (keyed API only).
   */
  getTokenLocksFeed(params?: TokenLocksFeedParams) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenLocksFeed>("GET", `/tokens/locks${query}`);
  }

  /**
   * Upcoming unlock EVENTS across all active lock / vesting contracts inside `within`
   * (1h | 6h | 24h | 3d | 7d | 14d | 30d | 90d, default 7d) — one entry per contract = its next
   * cliff / period / final / tranche event, with `amount_*` for that event and `window_amount_*`
   * (total release over the whole window). Continuous per-second streams contribute only their
   * cliff / final events. `sort` soonest (default) | largest_usd | largest_pct. Base-unit amounts
   * are digit STRINGS; usd null when price unknown (or phantom, implied MC > $100B). LP locks NOT
   * included. PRO+ (keyed API only).
   */
  getTokenUnlocks(params?: TokenUnlocksParams) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenUnlocks>("GET", `/tokens/unlocks${query}`);
  }

  /**
   * pump.fun creator-fee sharing on ONE coin — the on-chain SharingConfig (PDA
   * ["sharing-config", mint] of the pump_fees program): admin, status, `shareholders[]` with
   * `share_bps`, `is_admin`, `is_social_pda` (fees earmarked for a platform identity — `social.platform`
   * 2 = X, `user_id` = the platform-native numeric id, not the handle) and per-recipient received
   * totals, `redirected_bps` (share going to non-admin addresses), `social_bps`, `is_default: true`
   * = 100% to the creator (a real answer). `source` = "stream" (our table — only non-default
   * configs are stored) or "chain" (live PDA read; `config_error` set if every endpoint failed).
   * Plus `distributions` rollup (recipients, past_recipients), `history[]` (config created /
   * updated / reset, creator transferred) and `recent_distributions[]`. Amounts are quote base
   * units (SOL lamports unless a stable-quoted coin) as digit STRINGS. **Event history starts
   * 2026-08-17.** PRO+ (keyed API only).
   */
  getTokenFeeShares(mint: string) {
    return this.restRequest<TokenFeeShares>("GET", `/tokens/${encodeURIComponent(mint)}/fee-shares`);
  }

  /**
   * pump.fun fee-event feed, newest first, across all coins: `distribution` (creator fees paid
   * pro-rata to the SharingConfig shareholders, with `payouts[]` per address), `social_claim`
   * (fees for a platform identity — platform 2 = X — claimed to a recipient wallet; `mint` null),
   * `shares_created` / `shares_updated` / `shares_reset`, `creator_transferred`, and
   * `creator_claim` (plain creator vault claim, per creator, no mint — EXCLUDED unless requested
   * via `type`). Default 100%-to-creator configs and zero-amount distributions are not stored.
   * Poll with `since` (cursor `pagination.next_since`) or subscribe to WS channel
   * `token:fee_claims` (event `token:fee_claim`). Amounts are quote base units as digit STRINGS.
   * **History starts 2026-08-17.** PRO+ (keyed API only).
   */
  getTokenFeeClaims(params?: TokenFeeClaimsParams) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest<TokenFeeClaims>("GET", `/tokens/fee-claims${query}`);
  }

  /** Historical OHLCV candles (1m/5m/15m/1h/4h/1d) aggregated from the trade firehose. PRO=OHLCV 30d; ULTRA=+net flow, liquidity delta, full history. PRO+. */
  getTokenCandles(mint: string, params?: { tf?: string; limit?: number; from?: string; to?: string }) {
    const qs = new URLSearchParams();
    if (params?.tf) qs.set("tf", params.tf);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/candles${query}`);
  }

  /**
   * Net buy/sell flow for a token over a rolling window (1h or 24h). Returns unique
   * wallet/buyer/seller counts, buy/sell trade counts, buy/sell/net SOL, and trades-per-wallet.
   * Default window is "1h". PRO+.
   */
  getTokenFlow(mint: string, params?: { window?: "1h" | "24h" }) {
    const qs = params?.window ? `?window=${params.window}` : "";
    return this.restRequest<TokenFlow>("GET", `/tokens/${encodeURIComponent(mint)}/flow${qs}`);
  }

  /** Bulk buyer-quality scoring for up to 50 mints. Shares the single-mint 5-min LRU cache. */
  getTokenBuyerQualityBatch(mints: string[]) {
    return this.restRequest("POST", "/tokens/batch/buyer-quality", { mints });
  }

  /**
   * Bulk rug-risk scoring for up to 50 mints (1–50). Each entry is the single-mint
   * risk shape plus an `as_of` ISO timestamp, or `{ mint, error: "not_tracked" }` for
   * untracked mints (untracked mints do NOT fail the batch). `tokens` preserves
   * de-duplicated input order; `count` = unique mints. Counts as 1 request. PRO/ULTRA only.
   */
  getTokenRiskBatch(mints: string[]) {
    return this.restRequest<BatchRiskResponse>("POST", "/tokens/batch/risk", { mints });
  }

  // ── Token intelligence (/token/{mint}) ──

  /** Comprehensive per-mint snapshot: price, MC, volume, deployer, KOL activity, age, blacklist. */
  getToken(mint: string) {
    return this.restRequest("GET", `/token/${encodeURIComponent(mint)}`);
  }

  /** Bulk lookup of up to 50 mints — same per-mint shape as getToken(). 10-20× cheaper than N sequential calls. */
  getTokenBatch(mints: string[]) {
    return this.restRequest("POST", "/token/batch", { mints });
  }

  // ── Copy-Trade Rules (PRO/ULTRA) ──

  copyTradeList() {
    return this.restRequest("GET", "/copytrade/subscriptions");
  }

  copyTradeCreate(params: {
    /** 1-50 wallets to copy trades from. */
    source_wallets: string[];
    /** Required. Fixed SOL amount, proportional multiplier, or percent of source — per sizing_mode. */
    sizing_amount: number;
    name?: string;
    min_trade_sol?: number;
    only_action?: "buy" | "sell" | "both";
    sizing_mode?: "fixed" | "proportional" | "percent_source";
    delivery_mode?: "webhook" | "websocket" | "both";
    webhook_url?: string;
    min_mc_usd?: number | null;
    max_mc_usd?: number | null;
  }) {
    return this.restRequest("POST", "/copytrade/subscriptions", params);
  }

  copyTradeGet(ruleId: string) {
    return this.restRequest("GET", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`);
  }

  copyTradeUpdate(ruleId: string, updates: Record<string, unknown>) {
    return this.restRequest("PATCH", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`, updates);
  }

  copyTradeDelete(ruleId: string) {
    return this.restRequest("DELETE", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`);
  }

  // ── Coordination alerts (PRO/ULTRA, v1.1) ──

  coordinationAlertsList() {
    return this.restRequest("GET", "/kol/coordination/alerts");
  }

  coordinationAlertsCreate(params: {
    name?: string;
    min_kols?: number;
    window_minutes?: number;
    min_score?: number;
    include_majors?: boolean;
    cooldown_min?: number;
    score_jump_break?: number;
    delivery_mode?: "websocket" | "webhook" | "both";
    webhook_url?: string;
  }) {
    return this.restRequest("POST", "/kol/coordination/alerts", params);
  }

  coordinationAlertsGet(ruleId: string) {
    return this.restRequest("GET", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`);
  }

  coordinationAlertsUpdate(ruleId: string, updates: Record<string, unknown>) {
    return this.restRequest("PATCH", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`, updates);
  }

  coordinationAlertsDelete(ruleId: string) {
    return this.restRequest("DELETE", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`);
  }

  // ── First-touch signal ──

  firstTouches(params?: {
    since?: string;
    before?: string;
    limit?: number;
    kol?: string;
    min_kol_winrate_7d?: number;
    min_scout_tier?: "S" | "A" | "B" | "C";
    min_n_touches?: number;
    strategy?: "scalper" | "day_trader" | "swing_trader" | "hodler" | "mixed";
    token_age_max_min?: number;
    min_first_buy_sol?: number;
    mint_suffix?: string;
    preset?: "scout" | "fresh_launch";
    include?: string;
  }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/kol/first-touches${query}`);
  }

  firstTouchSubscriptionsList() {
    return this.restRequest("GET", "/kol/first-touches/subscriptions");
  }

  firstTouchSubscriptionsCreate(params: {
    name?: string;
    filters?: {
      kol?: string;
      mint_suffix?: string;
      min_first_buy_sol?: number;
      min_scout_tier?: "S" | "A" | "B" | "C";
      min_n_touches?: number;
    };
    delivery_mode?: "websocket" | "webhook" | "both";
    webhook_url?: string;
  }) {
    return this.restRequest("POST", "/kol/first-touches/subscriptions", params);
  }

  firstTouchSubscriptionsGet(id: string) {
    return this.restRequest("GET", `/kol/first-touches/subscriptions/${encodeURIComponent(id)}`);
  }

  firstTouchSubscriptionsUpdate(id: string, updates: Record<string, unknown>) {
    return this.restRequest("PATCH", `/kol/first-touches/subscriptions/${encodeURIComponent(id)}`, updates);
  }

  firstTouchSubscriptionsDelete(id: string) {
    return this.restRequest("DELETE", `/kol/first-touches/subscriptions/${encodeURIComponent(id)}`);
  }

  // ── Account info ──

  /** Get the authenticated caller's account, tier, and quota usage. */
  getMe() {
    return this.restRequest("GET", "/me");
  }

  // ── Token discovery / scanner ──

  /**
   * List tokens with filters (mc band, liquidity, momentum, DEX, age, etc.).
   * Default `min_liq` is 2000 server-side. Returns up to ~50 tokens per call.
   */
  getTokensList(params?: {
    limit?: string;
    offset?: string;
    primary_dex?: string;
    min_mc?: string;
    max_mc?: string;
    min_liq?: string;
    max_age_min?: string;
    mc_change_1h_min_pct?: string;
    mc_change_1h_max_pct?: string;
    /** v1.10 — minimum liquidity-to-MC ratio (0-1). */
    min_liq_mc_ratio?: string;
    /** v1.10 — maximum liquidity-to-MC ratio (0-1). */
    max_liq_mc_ratio?: string;
    /** v1.10 — filter by deployer tier: "elite" | "good" | "moderate" | "rising" | "cold" | "unranked". */
    deployer_tier?: string;
    sort?: string;
    order?: string;
  }) {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) qs.set(k, v);
      }
    }
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/tokens${query}`);
  }

  /**
   * v1.14 — Pre-bond pump.fun tokens approaching graduation, ranked by velocity
   * (Δprogress/min): "95% and accelerating" beats "92% stalled". Each token is
   * enriched with its deployer's reputation tier. `progress_pct` is from on-chain
   * real_token_reserves; `velocity_pct_per_min` is null until a 5m snapshot exists;
   * `eta_minutes` is a linear projection. PRO/ULTRA only.
   */
  getAlmostBonded(params?: {
    min_progress?: string;
    max_progress?: string;
    min_velocity_pct_per_min?: string;
    max_age_minutes?: string;
    deployer_tier?: string;
    authority_revoked?: string;
    min_liq?: string;
    sort?: string;
    limit?: string;
  }) {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) qs.set(k, v);
      }
    }
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/tokens/almost-bonded${query}`);
  }

  copyTradeSignals(params?: { rule_id?: string; limit?: string; since?: string }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/copytrade/signals${query}`);
  }

  // ── Price alerts (PRO/ULTRA, v1.9) ──

  priceAlertsList() {
    return this.restRequest("GET", "/price-alerts");
  }

  priceAlertsCreate(params: {
    token_mint: string;
    drop_pct: number;
    recovery_pct?: number;
    name?: string;
    delivery_mode?: "webhook" | "websocket" | "both";
    webhook_url?: string;
  }) {
    return this.restRequest("POST", "/price-alerts", params);
  }

  priceAlertsGet(id: number | string) {
    return this.restRequest("GET", `/price-alerts/${id}`);
  }

  priceAlertsUpdate(id: number | string, updates: Record<string, unknown>) {
    return this.restRequest("PATCH", `/price-alerts/${id}`, updates);
  }

  priceAlertsDelete(id: number | string) {
    return this.restRequest("DELETE", `/price-alerts/${id}`);
  }

  priceAlertsEvents(params?: { alert_id?: number; event_type?: string; since?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/price-alerts/events${query}`);
  }

  // ── v1.9 new endpoints ──

  scoutLeaderboard(params?: { limit?: number; scout_tier?: string; sort?: string }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/kol/scouts/leaderboard${query}`);
  }

  coordinationHistory(params?: { limit?: number; since?: string; min_score?: number }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/kol/coordination/history${query}`);
  }

  kolConsensus(mint: string) {
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/kol-consensus`);
  }

  peakHistory(mint: string) {
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/peak-history`);
  }
}
