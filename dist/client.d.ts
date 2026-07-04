/**
 * MadeOnSol API client.
 * Two auth modes: MadeOnSol API key (`msk_`, recommended) or x402 micropayments.
 *
 * v1.0 breaking change: RapidAPI auth has been removed (marketplace retired 2026-04-19).
 * Get a free `msk_` key at https://madeonsol.com/pricing.
 */
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
}
/** Transparent 0–100 rug-risk/safety score (higher = riskier). Returned by `getTokenRisk`. */
export interface TokenRisk {
    mint: string;
    risk_score: number;
    band: string;
    factors?: Array<{
        label: string;
        status: string;
        detail: string;
    }>;
    inputs?: Record<string, unknown>;
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
 * BASIC/TRADER get the `bundle` block only (`wallets: []`); PRO adds top-10 flags-only wallets;
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
}
/** A per-mint entry in the batch-risk response: a risk result (with `as_of`), or an error object. */
export type BatchRiskEntry = (TokenRisk & {
    as_of: string;
}) | {
    mint: string;
    error: "not_tracked" | "error";
};
/** Response of `getTokenRiskBatch`. `tokens` preserves de-duplicated input order; `count` = unique mints. */
export interface BatchRiskResponse {
    tokens: BatchRiskEntry[];
    count: number;
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
export declare class MadeOnSolClient {
    private baseUrl;
    private fetchFn;
    private authMode;
    private authHeaders;
    /** Most recent rate-limit headers, populated by every request. */
    lastRateLimit: RateLimitInfo;
    constructor(options?: MadeOnSolClientOptions);
    private captureRateLimit;
    query<T = unknown>(path: string, params?: Record<string, string | undefined>): Promise<{
        data?: T;
        error?: string;
        status: number;
    }>;
    getKolFeed(params?: {
        limit?: string;
        before?: string;
        action?: string;
        kol?: string;
        min_sol?: string;
        token_age_max_min?: string;
        exclude_sells?: string;
        min_kol_winrate?: string;
        strategy?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolLeaderboard(params?: {
        period?: string;
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /**
     * Get deployer alerts. The `tier` filter (elite/good/moderate/rising/cold)
     * is PRO/ULTRA only — BASIC callers passing it receive HTTP 403.
     * Cursor-paginated via `before` (preferred over `offset` at scale).
     */
    getDeployerAlerts(params?: {
        since?: string;
        before?: string;
        limit?: string;
        offset?: string;
        tier?: string;
        alert_type?: string;
        priority?: string;
        min_kol_buys?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolPairs(params?: {
        period?: string;
        min_shared?: string;
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolHotTokens(params?: {
        period?: string;
        min_kols?: string;
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolTrendingTokens(params?: {
        period?: string;
        min_kols?: string;
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolTokenEntryOrder(mint: string, params?: {
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolCompare(wallets: string[]): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolAlertsRecent(params?: {
        window?: string;
        types?: string;
        min_severity?: string;
        limit?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolPnl(wallet: string, params?: {
        period?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getKolTiming(wallet: string, params?: {
        period?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getDeployerTrajectory(wallet: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    private restRequest;
    createWebhook(params: {
        url: string;
        events: string[];
        filters?: Record<string, unknown>;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    listWebhooks(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    deleteWebhook(id: number): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    testWebhook(webhookId: number): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getStreamToken(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /** List the caller's live WebSocket streaming sessions across ws-streaming + dex-stream. PRO+. */
    getStreamSessions(): Promise<{
        data?: StreamSessionsResponse | undefined;
        error?: string;
        status: number;
    }>;
    /**
     * Force-evict (kill) a live WebSocket session by id — frees a connection slot.
     * Returns `{ evicted: true, id }`; 404 if no session with that id, 400 if `id` is
     * not a positive integer. PRO+.
     */
    deleteStreamSession(id: number | string): Promise<{
        data?: {
            evicted: true;
            id: string;
        } | undefined;
        error?: string;
        status: number;
    }>;
    getWalletTrackerWatchlist(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    addToWatchlist(walletAddress: string, label?: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    removeFromWatchlist(walletAddress: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletTrackerTrades(params?: {
        wallet?: string;
        action?: string;
        event_type?: string;
        limit?: string;
        before?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletStats(address: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletPnl(address: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletPositions(address: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletTrades(address: string, params?: {
        limit?: number;
        cursor?: string;
        action?: "buy" | "sell";
        token_mint?: string;
        since?: number;
        until?: number;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getWalletTrackerSummary(params?: {
        period?: string;
        wallet?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getAlphaLeaderboard(params?: {
        limit?: string;
        min_tokens?: string;
        min_pnl?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getAlphaWallet(wallet: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getAlphaLinked(wallet: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getTokenCapTable(mint: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    getTokenBuyerQuality(mint: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /** Transparent 0–100 rug-risk/safety score (higher = riskier) with band, explainable factors, and raw inputs. PRO+. */
    getTokenRisk(mint: string): Promise<{
        data?: TokenRisk | undefined;
        error?: string;
        status: number;
    }>;
    /**
     * Bundle-cohort holdings — which same-slot "bundle" wallets (≥3 buying in one slot)
     * bought a token and how much of supply they STILL hold (`held_pct_of_supply` is the
     * headline rug/insider signal, from confirmed on-chain data). BASIC/TRADER get the
     * `bundle` summary block only (`wallets: []`); PRO adds top-10 flags-only wallets;
     * ULTRA adds KOL identity, win rate, and bot confidence.
     */
    getTokenBundle(mint: string): Promise<{
        data?: TokenBundle | undefined;
        error?: string;
        status: number;
    }>;
    /** Historical OHLCV candles (1m/5m/15m/1h/4h/1d) aggregated from the trade firehose. PRO=OHLCV 30d; ULTRA=+net flow, liquidity delta, full history. PRO+. */
    getTokenCandles(mint: string, params?: {
        tf?: string;
        limit?: number;
        from?: string;
        to?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /**
     * Net buy/sell flow for a token over a rolling window (1h or 24h). Returns unique
     * wallet/buyer/seller counts, buy/sell trade counts, buy/sell/net SOL, and trades-per-wallet.
     * Default window is "1h". PRO+.
     */
    getTokenFlow(mint: string, params?: {
        window?: "1h" | "24h";
    }): Promise<{
        data?: TokenFlow | undefined;
        error?: string;
        status: number;
    }>;
    /** Bulk buyer-quality scoring for up to 50 mints. Shares the single-mint 5-min LRU cache. */
    getTokenBuyerQualityBatch(mints: string[]): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /**
     * Bulk rug-risk scoring for up to 50 mints (1–50). Each entry is the single-mint
     * risk shape plus an `as_of` ISO timestamp, or `{ mint, error: "not_tracked" }` for
     * untracked mints (untracked mints do NOT fail the batch). `tokens` preserves
     * de-duplicated input order; `count` = unique mints. Counts as 1 request. PRO/ULTRA only.
     */
    getTokenRiskBatch(mints: string[]): Promise<{
        data?: BatchRiskResponse | undefined;
        error?: string;
        status: number;
    }>;
    /** Comprehensive per-mint snapshot: price, MC, volume, deployer, KOL activity, age, blacklist. */
    getToken(mint: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /** Bulk lookup of up to 50 mints — same per-mint shape as getToken(). 10-20× cheaper than N sequential calls. */
    getTokenBatch(mints: string[]): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    copyTradeList(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    copyTradeGet(ruleId: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    copyTradeUpdate(ruleId: string, updates: Record<string, unknown>): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    copyTradeDelete(ruleId: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    coordinationAlertsList(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    coordinationAlertsGet(ruleId: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    coordinationAlertsUpdate(ruleId: string, updates: Record<string, unknown>): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    coordinationAlertsDelete(ruleId: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    firstTouchSubscriptionsList(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    firstTouchSubscriptionsGet(id: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    firstTouchSubscriptionsUpdate(id: string, updates: Record<string, unknown>): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    firstTouchSubscriptionsDelete(id: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    /** Get the authenticated caller's account, tier, and quota usage. */
    getMe(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
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
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    copyTradeSignals(params?: {
        rule_id?: string;
        limit?: string;
        since?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsList(): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsCreate(params: {
        token_mint: string;
        drop_pct: number;
        recovery_pct?: number;
        name?: string;
        delivery_mode?: "webhook" | "websocket" | "both";
        webhook_url?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsGet(id: number | string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsUpdate(id: number | string, updates: Record<string, unknown>): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsDelete(id: number | string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    priceAlertsEvents(params?: {
        alert_id?: number;
        event_type?: string;
        since?: string;
        limit?: number;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    scoutLeaderboard(params?: {
        limit?: number;
        scout_tier?: string;
        sort?: string;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    coordinationHistory(params?: {
        limit?: number;
        since?: string;
        min_score?: number;
    }): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    kolConsensus(mint: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
    peakHistory(mint: string): Promise<{
        data?: unknown;
        error?: string;
        status: number;
    }>;
}
