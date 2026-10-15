import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const WINDOW_RE = /\b(1h|6h|24h)\b/i;
function authError(result) {
    return result.status === 401 || result.status === 402
        ? "This endpoint needs a MadeOnSol API key. Set MADEONSOL_API_KEY — https://madeonsol.com/pricing. It is not available with x402 payments."
        : `Error: ${result.error}`;
}
export const kolTokenTradesAction = {
    name: "GET_KOL_TOKEN_TRADES",
    description: "List every stored KOL trade on one Solana token from MadeOnSol, newest first: KOL name, wallet, side, SOL and token amounts, price and market cap at the trade, signature, time. Keyset paged with next_cursor. BASIC gets a 5-minute delay and 20 rows. KOL trades below the persistence floor (0.05 SOL / $3.50 stable leg) are not stored. API key only.",
    similes: [
        "kol trades on token",
        "which kols traded",
        "kol buys and sells on this token",
        "kol activity on token",
        "kols trading this token",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\bkols?\b/i.test(text) && /\b(trades?|traded|trading|buys?|sells?|sold|bought)\b/i.test(text) && MINT_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = message.content?.text || "";
        const mint = text.match(MINT_RE)?.[1];
        if (!mint) {
            callback?.({ text: "Please include a token mint address." });
            return undefined;
        }
        const action = /\bsells?\b|\bsold\b/i.test(text) && !/\bbuys?\b|\bbought\b/i.test(text)
            ? "sell"
            : /\bbuys?\b|\bbought\b/i.test(text) && !/\bsells?\b|\bsold\b/i.test(text) ? "buy" : undefined;
        const result = await client.getKolTokenTrades(mint, { limit: 20, action });
        if (result.error) {
            callback?.({ text: authError(result) });
            return undefined;
        }
        const data = result.data;
        const trades = data?.trades ?? [];
        if (trades.length === 0) {
            callback?.({ text: `No stored KOL trades on ${mint.slice(0, 8)}….`, content: { ...data } });
            return undefined;
        }
        const lines = trades.slice(0, 20).map((t) => {
            const who = t.kol_name ?? `${t.wallet.slice(0, 8)}…`;
            const sol = t.sol_amount != null ? ` ${t.sol_amount.toFixed(2)} SOL` : "";
            const mc = t.market_cap_usd_at_trade != null ? ` @ $${Math.round(t.market_cap_usd_at_trade).toLocaleString()} MC` : "";
            return `• ${t.traded_at} ${who} ${t.action}${sol}${mc}`;
        });
        callback?.({
            text: `KOL trades on ${mint.slice(0, 8)}…\n${lines.join("\n")}${data?.has_more ? "\n(more available via next_cursor)" : ""}`,
            content: { ...data },
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Show the KOL trades on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" } },
            { name: "assistant", content: { text: "Here are the KOL trades on that token, newest first..." } },
        ],
    ],
};
