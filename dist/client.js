/**
 * MadeOnSol API client.
 * Two auth modes: MadeOnSol API key (`msk_`, recommended) or x402 micropayments.
 *
 * v1.0 breaking change: RapidAPI auth has been removed (marketplace retired 2026-04-19).
 * Get a free `msk_` key at https://madeonsol.com/pricing.
 */
const DEFAULT_BASE = "https://madeonsol.com";
export class MadeOnSolClient {
    baseUrl;
    fetchFn;
    authMode;
    authHeaders;
    /** Most recent rate-limit headers, populated by every request. */
    lastRateLimit = {};
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || DEFAULT_BASE;
        this.fetchFn = options.fetchFn || globalThis.fetch;
        this.authHeaders = {};
        if (options.apiKey) {
            this.authMode = "madeonsol";
            this.authHeaders = { Authorization: `Bearer ${options.apiKey}`, "User-Agent": "plugin-madeonsol/1.15.0" };
        }
        else if (options.fetchFn) {
            this.authMode = "x402";
        }
        else {
            this.authMode = "none";
            console.warn("\n[madeonsol] MadeOnSolClient constructed without apiKey or fetchFn — every request will fail.\n" +
                "  → Get a free key (200 req/day, no card) at https://madeonsol.com/pricing\n" +
                "  → Then: new MadeOnSolClient({ apiKey: process.env.MADEONSOL_API_KEY })\n");
        }
    }
    captureRateLimit(res) {
        this.lastRateLimit = {
            limit: res.headers.get("X-RateLimit-Limit") ?? undefined,
            remaining: res.headers.get("X-RateLimit-Remaining") ?? undefined,
            reset: res.headers.get("X-RateLimit-Reset") ?? undefined,
            requestId: res.headers.get("X-Request-Id") ?? undefined,
        };
    }
    async query(path, params) {
        const apiPath = this.authMode === "x402" || this.authMode === "none"
            ? path
            : path.replace("/api/x402/", "/api/v1/");
        const url = new URL(apiPath, this.baseUrl);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined)
                    url.searchParams.set(k, v);
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
        const data = await res.json();
        return { data, status: res.status };
    }
    getKolFeed(params) {
        return this.query("/api/x402/kol/feed", params);
    }
    getKolCoordination(params) {
        return this.query("/api/x402/kol/coordination", params);
    }
    getKolLeaderboard(params) {
        return this.query("/api/x402/kol/leaderboard", params);
    }
    /**
     * Get deployer alerts. The `tier` filter (elite/good/moderate/rising/cold)
     * is PRO/ULTRA only — BASIC callers passing it receive HTTP 403.
     * Cursor-paginated via `before` (preferred over `offset` at scale).
     */
    getDeployerAlerts(params) {
        return this.query("/api/x402/deployer-hunter/alerts", params);
    }
    getKolPairs(params) {
        return this.query("/api/x402/kol/pairs", params);
    }
    getKolHotTokens(params) {
        return this.query("/api/x402/kol/tokens/hot", params);
    }
    getKolTrendingTokens(params) {
        return this.query("/api/x402/kol/tokens/trending", params);
    }
    getKolTokenEntryOrder(mint, params) {
        return this.query(`/api/x402/kol/tokens/${encodeURIComponent(mint)}/entry-order`, params);
    }
    getKolCompare(wallets) {
        return this.query("/api/x402/kol/compare", { wallets: wallets.join(",") });
    }
    getKolAlertsRecent(params) {
        return this.query("/api/x402/kol/alerts/recent", params);
    }
    getKolPnl(wallet, params) {
        const qs = params?.period ? `?period=${params.period}` : "";
        return this.restRequest("GET", `/kol/${wallet}/pnl${qs}`);
    }
    getKolTiming(wallet, params) {
        const qs = params?.period ? `?period=${params.period}` : "";
        return this.restRequest("GET", `/kol/${wallet}/timing${qs}`);
    }
    getDeployerTrajectory(wallet) {
        return this.restRequest("GET", `/deployer-hunter/${wallet}/trajectory`);
    }
    // ── REST helper (used by webhooks, streaming, alpha, copy-trade, wallet-tracker) ──
    async restRequest(method, path, body) {
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
        return { data: await res.json(), status: res.status };
    }
    // ── Webhook management (PRO/ULTRA) ──
    createWebhook(params) {
        return this.restRequest("POST", "/webhooks", params);
    }
    listWebhooks() {
        return this.restRequest("GET", "/webhooks");
    }
    deleteWebhook(id) {
        return this.restRequest("DELETE", `/webhooks/${id}`);
    }
    testWebhook(webhookId) {
        return this.restRequest("POST", "/webhooks/test", { webhook_id: webhookId });
    }
    getStreamToken() {
        return this.restRequest("POST", "/stream/token");
    }
    // ── Live WebSocket sessions (PRO/ULTRA) ──
    /** List the caller's live WebSocket streaming sessions across ws-streaming + dex-stream. PRO+. */
    getStreamSessions() {
        return this.restRequest("GET", "/stream/sessions");
    }
    /**
     * Force-evict (kill) a live WebSocket session by id — frees a connection slot.
     * Returns `{ evicted: true, id }`; 404 if no session with that id, 400 if `id` is
     * not a positive integer. PRO+.
     */
    deleteStreamSession(id) {
        return this.restRequest("DELETE", `/stream/sessions/${id}`);
    }
    // ── Wallet Tracker ──
    getWalletTrackerWatchlist() {
        return this.restRequest("GET", "/wallet-tracker/watchlist");
    }
    addToWatchlist(walletAddress, label) {
        return this.restRequest("POST", "/wallet-tracker/watchlist", { wallet_address: walletAddress, ...(label ? { label } : {}) });
    }
    removeFromWatchlist(walletAddress) {
        return this.restRequest("DELETE", `/wallet-tracker/watchlist/${encodeURIComponent(walletAddress)}`);
    }
    getWalletTrackerTrades(params) {
        const qs = new URLSearchParams();
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined)
                    qs.set(k, v);
            }
        }
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/wallet-tracker/trades${query}`);
    }
    // ── Universal wallet endpoints (PRO+, any wallet — not just curated KOLs) ──
    getWalletStats(address) {
        return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}`);
    }
    getWalletPnl(address) {
        return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/pnl`);
    }
    getWalletPositions(address) {
        return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/positions`);
    }
    getWalletTrades(address, params) {
        const qs = new URLSearchParams();
        if (params?.limit !== undefined)
            qs.set("limit", String(params.limit));
        if (params?.cursor)
            qs.set("cursor", params.cursor);
        if (params?.action)
            qs.set("action", params.action);
        if (params?.token_mint)
            qs.set("token_mint", params.token_mint);
        if (params?.since !== undefined)
            qs.set("since", String(params.since));
        if (params?.until !== undefined)
            qs.set("until", String(params.until));
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/wallet/${encodeURIComponent(address)}/trades${query}`);
    }
    getWalletTrackerSummary(params) {
        const qs = new URLSearchParams();
        if (params?.period)
            qs.set("period", params.period);
        if (params?.wallet)
            qs.set("wallet", params.wallet);
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/wallet-tracker/summary${query}`);
    }
    // ── Alpha Wallet Intelligence ──
    getAlphaLeaderboard(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, v);
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/alpha/leaderboard${query}`);
    }
    getAlphaWallet(wallet) {
        return this.restRequest("GET", `/alpha/${encodeURIComponent(wallet)}`);
    }
    getAlphaLinked(wallet) {
        return this.restRequest("GET", `/alpha/${encodeURIComponent(wallet)}/linked`);
    }
    // ── Token Quality ──
    getTokenCapTable(mint) {
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/cap-table`);
    }
    getTokenBuyerQuality(mint) {
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/buyer-quality`);
    }
    /** Transparent 0–100 rug-risk/safety score (higher = riskier) with band, explainable factors, and raw inputs. PRO+. */
    getTokenRisk(mint) {
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/risk`);
    }
    /** Historical OHLCV candles (1m/5m/15m/1h/4h/1d) aggregated from the trade firehose. PRO=OHLCV 30d; ULTRA=+net flow, liquidity delta, full history. PRO+. */
    getTokenCandles(mint, params) {
        const qs = new URLSearchParams();
        if (params?.tf)
            qs.set("tf", params.tf);
        if (params?.limit !== undefined)
            qs.set("limit", String(params.limit));
        if (params?.from)
            qs.set("from", params.from);
        if (params?.to)
            qs.set("to", params.to);
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/candles${query}`);
    }
    /**
     * Net buy/sell flow for a token over a rolling window (1h or 24h). Returns unique
     * wallet/buyer/seller counts, buy/sell trade counts, buy/sell/net SOL, and trades-per-wallet.
     * Default window is "1h". PRO+.
     */
    getTokenFlow(mint, params) {
        const qs = params?.window ? `?window=${params.window}` : "";
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/flow${qs}`);
    }
    /** Bulk buyer-quality scoring for up to 50 mints. Shares the single-mint 5-min LRU cache. */
    getTokenBuyerQualityBatch(mints) {
        return this.restRequest("POST", "/tokens/batch/buyer-quality", { mints });
    }
    /**
     * Bulk rug-risk scoring for up to 50 mints (1–50). Each entry is the single-mint
     * risk shape plus an `as_of` ISO timestamp, or `{ mint, error: "not_tracked" }` for
     * untracked mints (untracked mints do NOT fail the batch). `tokens` preserves
     * de-duplicated input order; `count` = unique mints. Counts as 1 request. PRO/ULTRA only.
     */
    getTokenRiskBatch(mints) {
        return this.restRequest("POST", "/tokens/batch/risk", { mints });
    }
    // ── Token intelligence (/token/{mint}) ──
    /** Comprehensive per-mint snapshot: price, MC, volume, deployer, KOL activity, age, blacklist. */
    getToken(mint) {
        return this.restRequest("GET", `/token/${encodeURIComponent(mint)}`);
    }
    /** Bulk lookup of up to 50 mints — same per-mint shape as getToken(). 10-20× cheaper than N sequential calls. */
    getTokenBatch(mints) {
        return this.restRequest("POST", "/token/batch", { mints });
    }
    // ── Copy-Trade Rules (PRO/ULTRA) ──
    copyTradeList() {
        return this.restRequest("GET", "/copytrade/subscriptions");
    }
    copyTradeCreate(params) {
        return this.restRequest("POST", "/copytrade/subscriptions", params);
    }
    copyTradeGet(ruleId) {
        return this.restRequest("GET", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`);
    }
    copyTradeUpdate(ruleId, updates) {
        return this.restRequest("PATCH", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`, updates);
    }
    copyTradeDelete(ruleId) {
        return this.restRequest("DELETE", `/copytrade/subscriptions/${encodeURIComponent(ruleId)}`);
    }
    // ── Coordination alerts (PRO/ULTRA, v1.1) ──
    coordinationAlertsList() {
        return this.restRequest("GET", "/kol/coordination/alerts");
    }
    coordinationAlertsCreate(params) {
        return this.restRequest("POST", "/kol/coordination/alerts", params);
    }
    coordinationAlertsGet(ruleId) {
        return this.restRequest("GET", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`);
    }
    coordinationAlertsUpdate(ruleId, updates) {
        return this.restRequest("PATCH", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`, updates);
    }
    coordinationAlertsDelete(ruleId) {
        return this.restRequest("DELETE", `/kol/coordination/alerts/${encodeURIComponent(ruleId)}`);
    }
    // ── First-touch signal ──
    firstTouches(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, String(v));
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/kol/first-touches${query}`);
    }
    firstTouchSubscriptionsList() {
        return this.restRequest("GET", "/kol/first-touches/subscriptions");
    }
    firstTouchSubscriptionsCreate(params) {
        return this.restRequest("POST", "/kol/first-touches/subscriptions", params);
    }
    firstTouchSubscriptionsGet(id) {
        return this.restRequest("GET", `/kol/first-touches/subscriptions/${encodeURIComponent(id)}`);
    }
    firstTouchSubscriptionsUpdate(id, updates) {
        return this.restRequest("PATCH", `/kol/first-touches/subscriptions/${encodeURIComponent(id)}`, updates);
    }
    firstTouchSubscriptionsDelete(id) {
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
    getTokensList(params) {
        const qs = new URLSearchParams();
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined)
                    qs.set(k, v);
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
    getAlmostBonded(params) {
        const qs = new URLSearchParams();
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined)
                    qs.set(k, v);
            }
        }
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/tokens/almost-bonded${query}`);
    }
    copyTradeSignals(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, v);
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/copytrade/signals${query}`);
    }
    // ── Price alerts (PRO/ULTRA, v1.9) ──
    priceAlertsList() {
        return this.restRequest("GET", "/price-alerts");
    }
    priceAlertsCreate(params) {
        return this.restRequest("POST", "/price-alerts", params);
    }
    priceAlertsGet(id) {
        return this.restRequest("GET", `/price-alerts/${id}`);
    }
    priceAlertsUpdate(id, updates) {
        return this.restRequest("PATCH", `/price-alerts/${id}`, updates);
    }
    priceAlertsDelete(id) {
        return this.restRequest("DELETE", `/price-alerts/${id}`);
    }
    priceAlertsEvents(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, String(v));
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/price-alerts/events${query}`);
    }
    // ── v1.9 new endpoints ──
    scoutLeaderboard(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, String(v));
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/kol/scouts/leaderboard${query}`);
    }
    coordinationHistory(params) {
        const qs = new URLSearchParams();
        if (params)
            for (const [k, v] of Object.entries(params))
                if (v !== undefined)
                    qs.set(k, String(v));
        const query = qs.toString() ? `?${qs.toString()}` : "";
        return this.restRequest("GET", `/kol/coordination/history${query}`);
    }
    kolConsensus(mint) {
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/kol-consensus`);
    }
    peakHistory(mint) {
        return this.restRequest("GET", `/tokens/${encodeURIComponent(mint)}/peak-history`);
    }
}
