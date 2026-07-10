import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
export const tokenTradesAction = {
    name: "GET_TOKEN_TRADES",
    description: "Get the raw trade tape for a Solana token from MadeOnSol — every captured trade (buy/sell, SOL + token amounts, price, early-buyer rank), cursor-paginated newest first. Default window is the FULL history (tape starts 2026-04-12, pump.fun-pipeline scoped). Filterable by action (buy/sell). PRO+.",
    similes: [
        "token trades",
        "trade tape",
        "trade history for token",
        "who bought this token",
        "who sold this token",
        "recent trades on token",
        "token transactions",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(trade|trades|tape|bought|sold|transactions)\b/i.test(text) && MINT_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = message.content?.text || "";
        const mint = text.match(MINT_RE)?.[1];
        if (!mint) {
            callback?.({ text: "Please include a token mint address." });
            return undefined;
        }
        const lc = text.toLowerCase();
        const action = lc.includes("buy") || lc.includes("bought") ? "buy"
            : lc.includes("sell") || lc.includes("sold") ? "sell"
                : undefined;
        const result = await client.getTokenTrades(mint, { limit: 50, ...(action ? { action } : {}) });
        if (result.error) {
            callback?.({ text: result.status === 402
                    ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
                    : `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        if (!data.trades || data.trades.length === 0) {
            callback?.({ text: `No captured trades for ${mint.slice(0, 8)}… (tape starts 2026-04-12, pump.fun-pipeline scoped — absence means not observed).`, content: data });
            return undefined;
        }
        const lines = data.trades.slice(0, 15).map((t) => {
            const rank = t.early_buyer_rank != null ? `  #${t.early_buyer_rank} early` : "";
            return `  ${t.traded_at.slice(0, 16).replace("T", " ")}  ${t.action.toUpperCase()}  ${t.sol_amount.toFixed(2)} SOL  ${t.wallet_address.slice(0, 6)}…${rank}`;
        });
        callback?.({
            text: `${mint.slice(0, 8)}… — ${data.trades.length} ${action ?? "trade"}(s)${data.has_more ? " (more available)" : ""}:\n${lines.join("\n")}`,
            content: data,
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Show me recent trades on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" } },
            { name: "assistant", content: { text: "Here's the trade tape for that token..." } },
        ],
    ],
};
