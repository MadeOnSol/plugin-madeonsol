import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
export const walletTrackerWatchlistAction = {
    name: "WALLET_TRACKER_WATCHLIST",
    description: "List wallets in your MadeOnSol wallet watchlist with labels and remaining capacity.",
    similes: [
        "wallet watchlist",
        "tracked wallets",
        "my wallets",
        "wallet tracker list",
        "show tracked wallets",
    ],
    validate: async (_runtime, message) => {
        const text = (message.content?.text || "").toLowerCase();
        return /\b(wallet.tracker|watchlist|tracked wallet)/i.test(text) && /\b(list|show|get|my)\b/i.test(text);
    },
    handler: async (runtime, _message, _state, _options, callback) => {
        const client = getClient(runtime);
        const result = await client.getWalletTrackerWatchlist();
        if (result.error) {
            callback?.({ text: `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        const lines = (data.wallets || []).map((w) => `${w.label ? `[${w.label}] ` : ""}${w.wallet_address}`);
        callback?.({
            text: lines.length
                ? `Tracked wallets (${data.count}/${data.limit}):\n${lines.join("\n")}\n${data.remaining} slot(s) remaining.`
                : `No wallets tracked yet. Limit: ${data.limit}.`,
            content: data,
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Show my wallet tracker watchlist" } },
            { name: "assistant", content: { text: "Here are your tracked wallets..." } },
        ],
    ],
};
export const walletTrackerTradesAction = {
    name: "WALLET_TRACKER_TRADES",
    description: "Get recent swap and transfer events from wallets in your MadeOnSol watchlist.",
    similes: [
        "wallet tracker trades",
        "tracked wallet activity",
        "watchlist trades",
        "wallet swaps",
        "wallet transfers",
        "what did my tracked wallets do",
    ],
    validate: async (_runtime, message) => {
        const text = (message.content?.text || "").toLowerCase();
        return /\b(wallet.tracker|watchlist|tracked wallet)/i.test(text) && /\b(trade|swap|transfer|activity|buy|sell)\b/i.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = (message.content?.text || "").toLowerCase();
        const action = text.includes("buy") ? "buy" : text.includes("sell") ? "sell" : undefined;
        const result = await client.getWalletTrackerTrades({ limit: "20", ...(action ? { action } : {}) });
        if (result.error) {
            callback?.({ text: `Error: ${result.error}` });
            return undefined;
        }
        // Shape of GET /wallet-tracker/trades events. `action` is null on transfers.
        const data = result.data;
        const lines = (data.events || []).slice(0, 15).map((e) => {
            const who = e.label || e.wallet_address.slice(0, 8);
            const sol = e.sol_amount == null ? "?" : Number(e.sol_amount).toFixed(2);
            return e.event_type === "transfer" || e.action == null
                ? `${who} transfer of ${sol} SOL`
                : `${who} ${e.action} ${e.token_symbol || "?"} for ${sol} SOL`;
        });
        callback?.({
            text: lines.length
                ? `Recent wallet tracker events:\n${lines.join("\n")}`
                : "No recent events for your tracked wallets.",
            content: data,
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "What did my tracked wallets trade recently?" } },
            { name: "assistant", content: { text: "Here are the latest trades from your watchlist..." } },
        ],
    ],
};
