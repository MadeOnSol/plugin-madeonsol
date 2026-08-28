import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const usd = (v) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString()}`);
const mult = (v) => (v == null ? "n/a" : `${v.toFixed(1)}×`);
const when = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");
export const tokenSurgesAction = {
    name: "GET_TOKEN_SURGES",
    description: "Get token surges & revivals from MadeOnSol — token momentum fires, newest first, across ALL mints. kind=surge: a token < 30 min old whose market cap runs hard vs its LAUNCH MC — tier early (≤10 min, ≥$12k, ≥3× launch) | strong (≤30 min, ≥$30k, ≥6× launch and ≥2× the 3-min low) | breakout (≤2 min, ≥$45k, ≥8×); each tier fires once per mint and must be SUSTAINED ≥10 s (a one-tick bundle mark is a spike, not a surge). kind=revival: no 1-minute trade candle for ≥24 h, then confirmed by the tape (≥5 buys, ≥$500 buy volume, MC ≥1.5× the pre-dormancy close) — never by a price mark; tier is null. Both need liquidity ≥$1.5k and ≥2% of MC, and the MC gained must be paid for by buy volume. Each row: tape (buys/sells/volume; unique_buyers null outside trade coverage — never an inferred zero), kol buyers, early_buyers (bundled / sold / sniper wallets), deployer reputation, risk_flags[] (bundled_launch, few_buyers, wash_pattern, thin_liquidity, cold_deployer, sniper_heavy, early_buyers_exiting, sell_pressure, no_tape_trades, no_prior_price, mint_authority_active, transfer_fee — empty = no flag raised, NOT verified clean) and outcome (+1 h MC / peak / low multiples) once ≥65 min old. stats='1' adds per-(kind, tier) hit-rates — out-of-sample. Filters kind, tier, mint, launchpad, deployer_tier, min_mc_usd/max_mc_usd, min_buys, exclude_flags (comma list), only_clean; cursors since/before. Pushed live on WS channel token:surges (events token:surge / token:revival). Retention 60 d. PRO+ — BASIC receives HTTP 403; keyed API only.",
    similes: [
        "token surges",
        "surging tokens",
        "what is pumping right now",
        "breakout tokens",
        "tokens running hard",
        "revived tokens",
        "dormant tokens waking up",
        "momentum alerts",
        "surge hit rate",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(surge|surges|surging|breakout|breakouts|revival|revivals|revived|reviving|momentum|running hard|pumping)\b/i.test(text)
            && !/\b(lock|locks|locked|unlock|unlocks|vesting|fee|fees)\b/i.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = message.content?.text || "";
        const params = { limit: 20 };
        const mintMatch = text.match(MINT_RE);
        if (mintMatch)
            params.mint = mintMatch[1];
        if (/\b(revival|revivals|revived|reviving|dormant|woke|waking|wake up|came back)\b/i.test(text))
            params.kind = "revival";
        else if (/\b(surge|surges|surging|breakout|breakouts|running hard|pumping)\b/i.test(text))
            params.kind = "surge";
        if (params.kind === "surge") {
            if (/\bbreakout/i.test(text))
                params.tier = "breakout";
            else if (/\bstrong\b/i.test(text))
                params.tier = "strong";
            else if (/\bearly\b/i.test(text))
                params.tier = "early";
        }
        if (/\b(clean|no flags|without (risk )?flags|unflagged)\b/i.test(text))
            params.only_clean = "1";
        if (/\b(hit rate|hit-rate|stats|statistics|how often|success rate)\b/i.test(text))
            params.stats = "1";
        const usdMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
        if (usdMatch) {
            const n = parseFloat(usdMatch[1].replace(/,/g, "")) * (usdMatch[2]?.toLowerCase() === "m" ? 1e6 : usdMatch[2]?.toLowerCase() === "k" ? 1e3 : 1);
            if (Number.isFinite(n) && n > 0)
                params.min_mc_usd = n;
        }
        const result = await client.getTokenSurges(params);
        if (result.error) {
            callback?.({ text: result.status === 402
                    ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
                    : result.status === 403
                        ? "Token surges & revivals are PRO+ — this key's tier does not include them. Upgrade at https://madeonsol.com/pricing."
                        : `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        const rows = data.events.slice(0, 10).map((e) => {
            const sym = e.symbol ?? e.mint.slice(0, 6) + "…";
            const label = e.kind === "surge" ? `surge/${e.tier ?? "?"}` : "revival";
            const vs = e.kind === "surge" ? `${mult(e.mc_multiple)} launch MC` : `${mult(e.mc_vs_prev_multiple)} pre-dormancy MC, dormant ${e.dormant_hours ?? "?"} h`;
            const tape = e.tape?.available ? `${e.tape.buys ?? "?"} buys / ${e.tape.sells ?? "?"} sells, ${usd(e.tape.buy_volume_usd)} buy vol` : "no tape yet";
            const buyers = e.tape?.wallet_data_available ? `, ${e.tape.unique_buyers} unique buyers` : "";
            const kol = e.kol?.buyers ? `, ${e.kol.buyers} KOL${e.kol.buyers === 1 ? "" : "s"}` : "";
            const flags = e.risk_flags?.length ? e.risk_flags.join(", ") : "none";
            const outcome = e.outcome ? ` · +1h ${mult(e.outcome.mc_1h_multiple)} (peak ${mult(e.outcome.peak_1h_multiple)})` : "";
            return `  ${when(e.fired_at)} ${sym} ${label} — MC ${usd(e.market_cap_usd)} (${vs}), liq ${usd(e.liquidity_usd)}, ${tape}${buyers}${kol}, deployer ${e.deployer_tier ?? "unknown"} · flags: ${flags}${outcome}`;
        });
        const stats = data.stats?.rows?.length
            ? [`Hit-rates (last ${data.stats.days} d, fires ≥ 65 min old):`, ...data.stats.rows.map((s) => `  ${s.kind}${s.tier ? `/${s.tier}` : ""}: ${s.with_outcome}/${s.fires} scored, up after 1h ${s.up_1h_pct ?? "n/a"}%, median peak ${mult(s.median_peak_multiple)}, doubled ${s.doubled_1h_pct ?? "n/a"}%`)]
            : [];
        const summary = [
            `Token momentum fires (${data.pagination.count} returned${data.pagination.has_more ? ", more available" : ""}${params.kind ? `, ${params.kind}` : ""}${params.tier ? ` ${params.tier}` : ""}${params.min_mc_usd ? `, MC ≥ ${usd(params.min_mc_usd)}` : ""}${params.only_clean ? ", no risk flags" : ""}):`,
            ...(rows.length ? rows : ["  (none matched)"]),
            ...stats,
            `• Empty flags = no flag raised, not verified clean. Poll with since=${data.pagination.next_since ?? "<next_since>"} or subscribe to WS channel token:surges for a push per fire.`,
        ].join("\n");
        callback?.({ text: summary, content: data });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Which tokens are surging right now with no risk flags?" } },
            { name: "assistant", content: { text: "Here are the latest token momentum fires, newest first..." } },
        ],
        [
            { name: "user1", content: { text: "Show me revived tokens — dormant coins that woke up today" } },
            { name: "assistant", content: { text: "Here are the latest confirmed revivals..." } },
        ],
    ],
};
