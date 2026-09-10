import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const sniperWatchlistListAction: Action = {
  name: "SNIPER_WATCHLIST_LIST",
  description: "List your custom sniper watchlist (tracked deployer wallets). PRO+/ULTRA.",
  similes: ["sniper watchlist", "tracked deployers", "my deployer watchlist"],
  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\bsniper (watchlist|list)|\btracked deployer/i.test(text) && /\b(list|show|get|my)\b/i.test(text);
  },
  handler: async (runtime: IAgentRuntime, _message: Memory, _state?: State, _options?: unknown, callback?: HandlerCallback) => {
    const result = await getClient(runtime).getSniperWatchlist();
    if (result.error) { callback?.({ text: `Error: ${result.error}` }); return undefined; }
    callback?.({ text: "Sniper watchlist retrieved." });
    return undefined;
  },
  examples: [[{ name: "user1", content: { text: "Show my sniper watchlist" } }, { name: "assistant", content: { text: "Here's your tracked deployer watchlist..." } }]] as Action["examples"],
};

export const sniperWatchlistAddAction: Action = {
  name: "SNIPER_WATCHLIST_ADD",
  description: "Add a deployer wallet to your sniper watchlist. PRO+/ULTRA.",
  similes: ["add to sniper watchlist", "track this deployer", "watch this deployer"],
  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(add|track|watch)\b.*\bdeployer/i.test(text) && WALLET_RE.test(text);
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: unknown, callback?: HandlerCallback) => {
    const wallet = (message.content?.text || "").match(WALLET_RE)?.[1];
    if (!wallet) { callback?.({ text: "Please include a deployer wallet address." }); return undefined; }
    const result = await getClient(runtime).addSniperWatchlist({ wallet });
    if (result.error) { callback?.({ text: `Error: ${result.error}` }); return undefined; }
    callback?.({ text: `Added ${wallet.slice(0, 8)}… to your sniper watchlist.` });
    return undefined;
  },
  examples: [[{ name: "user1", content: { text: "Track deployer 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1 for snipes" } }, { name: "assistant", content: { text: "Added that deployer to your sniper watchlist." } }]] as Action["examples"],
};

export const sniperWatchlistRemoveAction: Action = {
  name: "SNIPER_WATCHLIST_REMOVE",
  description: "Remove a deployer wallet from your sniper watchlist. PRO+/ULTRA.",
  similes: ["remove from sniper watchlist", "stop tracking this deployer", "untrack this deployer"],
  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(remove|untrack|stop tracking)\b.*\bdeployer/i.test(text) && WALLET_RE.test(text);
  },
  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State, _options?: unknown, callback?: HandlerCallback) => {
    const wallet = (message.content?.text || "").match(WALLET_RE)?.[1];
    if (!wallet) { callback?.({ text: "Please include a deployer wallet address." }); return undefined; }
    const result = await getClient(runtime).removeSniperWatchlist(wallet);
    if (result.error) { callback?.({ text: `Error: ${result.error}` }); return undefined; }
    callback?.({ text: `Removed ${wallet.slice(0, 8)}… from your sniper watchlist.` });
    return undefined;
  },
  examples: [[{ name: "user1", content: { text: "Stop tracking deployer 5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1" } }, { name: "assistant", content: { text: "Removed that deployer from your sniper watchlist." } }]] as Action["examples"],
};
