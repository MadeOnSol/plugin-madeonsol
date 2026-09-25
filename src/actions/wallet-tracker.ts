import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

export const walletTrackerWatchlistAction: Action = {
  name: "WALLET_TRACKER_WATCHLIST",
  description:
    "List wallets in your MadeOnSol wallet watchlist with labels and remaining capacity.",
  similes: [
    "wallet watchlist",
    "tracked wallets",
    "my wallets",
    "wallet tracker list",
    "show tracked wallets",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(wallet.tracker|watchlist|tracked wallet)/i.test(text) && /\b(list|show|get|my)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const result = await client.getWalletTrackerWatchlist();

    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as { wallets: Array<{ wallet_address: string; label: string | null; added_at: string }>; count: number; limit: number; remaining: number };
    const lines = (data.wallets || []).map(
      (w) => `${w.label ? `[${w.label}] ` : ""}${w.wallet_address}`
    );

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
  ] as Action["examples"],
};

export const walletTrackerTradesAction: Action = {
  name: "WALLET_TRACKER_TRADES",
  description:
    "Get recent swap and transfer events from wallets in your MadeOnSol watchlist.",
  similes: [
    "wallet tracker trades",
    "tracked wallet activity",
    "watchlist trades",
    "wallet swaps",
    "wallet transfers",
    "what did my tracked wallets do",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(wallet.tracker|watchlist|tracked wallet)/i.test(text) && /\b(trade|swap|transfer|activity|buy|sell)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const text = (message.content?.text || "").toLowerCase();
    const action = text.includes("buy") ? "buy" : text.includes("sell") ? "sell" : undefined;

    const result = await client.getWalletTrackerTrades({ limit: "20", ...(action ? { action } : {}) });

    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    // Shape of GET /wallet-tracker/trades events. `action` is null on transfers.
    const data = result.data as {
      events: Array<{
        wallet_address: string;
        label: string | null;
        event_type: "swap" | "transfer";
        action: "buy" | "sell" | null;
        token_symbol: string | null;
        sol_amount: number | null;
        ingested_at: string;
      }>;
      count: number;
    };
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
  ] as Action["examples"],
};
