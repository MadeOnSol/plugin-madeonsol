/**
 * MadeOnSol API client.
 * Two auth modes: MadeOnSol API key (`msk_`, recommended) or x402 micropayments.
 *
 * v1.0 breaking change: RapidAPI auth has been removed (marketplace retired 2026-04-19).
 * Get a free `msk_` key at https://madeonsol.com/pricing.
 */

const DEFAULT_BASE = "https://madeonsol.com";

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
      this.authHeaders = { Authorization: `Bearer ${options.apiKey}`, "User-Agent": "plugin-madeonsol/1.11.0" };
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
    return this.restRequest("GET", `/alpha/wallet/${encodeURIComponent(wallet)}`);
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
    return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/risk`);
  }

  /** Bulk buyer-quality scoring for up to 50 mints. Shares the single-mint 5-min LRU cache. */
  getTokenBuyerQualityBatch(mints: string[]) {
    return this.restRequest("POST", "/tokens/batch/buyer-quality", { mints });
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
    return this.restRequest("GET", "/copy-trade/rules");
  }

  copyTradeCreate(params: {
    name: string;
    source_wallet: string;
    is_active?: boolean;
    webhook_url?: string;
    delivery?: "webhook" | "websocket" | "both";
    filters?: Record<string, unknown>;
  }) {
    return this.restRequest("POST", "/copy-trade/rules", params);
  }

  copyTradeGet(ruleId: string) {
    return this.restRequest("GET", `/copy-trade/rules/${encodeURIComponent(ruleId)}`);
  }

  copyTradeUpdate(ruleId: string, updates: Record<string, unknown>) {
    return this.restRequest("PATCH", `/copy-trade/rules/${encodeURIComponent(ruleId)}`, updates);
  }

  copyTradeDelete(ruleId: string) {
    return this.restRequest("DELETE", `/copy-trade/rules/${encodeURIComponent(ruleId)}`);
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

  copyTradeSignals(params?: { rule_id?: string; limit?: string; since?: string }) {
    const qs = new URLSearchParams();
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.restRequest("GET", `/copy-trade/signals${query}`);
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
