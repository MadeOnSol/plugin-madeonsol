import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
export const sniperWatchlistListAction = {
    name: "SNIPER_WATCHLIST_LIST",
    description: "List your custom sniper watchlist (tracked deployer wallets). PRO+/ULTRA.",
    similes: ["sniper watchlist", "tracked deployers", "my deployer watchlist"],
    validate: async (_runtime, message) => {
        const text = (message.content?.text || "").toLowerCase();
        return /\bsniper (watchlist|list)|\btracked deployer/i.test(text) && /\b(list|show|get|my)\b/i.test(text);
    },
    handler: async (runtime, _message, _state, _options, callback) => {
        const result = await getClient(runtime).getSniperWatchlist();
        if (result.error) {
            callback?.({ text: `Error: ${result.error}` });
            return undefined;
        }
        callback?.({ text: "Sniper watchlist retrieved." });
        return undefined;
    },
    examples: [[{ name: "user1", content: { text: "Show my sniper watchlist" } }, { name: "assistant", content: { text: "Here's your tracked deployer watchlist..." } }]],
};
export const sniperWatchlistAddAction = {
    name: "SNIPER_WATCHLIST_ADD",
    description: "Add a deployer wallet to your sniper watchlist. PRO+/ULTRA.",
    similes: ["add to sniper watchlist", "track this deployer", "watch this deployer"],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(add|track|watch)\b.*\bdeployer/i.test(text) && WALLET_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const wallet = (message.content?.text || "").match(WALLET_RE)?.[1];
        if (!wallet) {
            callback?.({ text: "Please include a deployer wallet address." });
            return undefined;
        }
        const result = await getClient(runtime).addSniperWatchlist({ wallet });
        if (result.error) {
            callback?.({ text: `Error: ${result.error}` });
            return undefined;
        }
        callback?.({ text: `Added ${wallet.slice(0, 8)}… to your sniper watchlist.` });
        return undefined;
    },
    examples: [[{ name: "user1", content: { text: "Track deployer 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1 for snipes" } }, { name: "assistant", content: { text: "Added that deployer to your sniper watchlist." } }]],
};
export const sniperWatchlistRemoveAction = {
    name: "SNIPER_WATCHLIST_REMOVE",
    description: "Remove a deployer wallet from your sniper watchlist. PRO+/ULTRA.",
    similes: ["remove from sniper watchlist", "stop tracking this deployer", "untrack this deployer"],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(remove|untrack|stop tracking)\b.*\bdeployer/i.test(text) && WALLET_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const wallet = (message.content?.text || "").match(WALLET_RE)?.[1];
        if (!wallet) {
            callback?.({ text: "Please include a deployer wallet address." });
            return undefined;
        }
        const result = await getClient(runtime).removeSniperWatchlist(wallet);
        if (result.error) {
            callback?.({ text: `Error: ${result.error}` });
            return undefined;
        }
        callback?.({ text: `Removed ${wallet.slice(0, 8)}… from your sniper watchlist.` });
        return undefined;
    },
    examples: [[{ name: "user1", content: { text: "Stop tracking deployer 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1" } }, { name: "assistant", content: { text: "Removed that deployer from your sniper watchlist." } }]],
};
