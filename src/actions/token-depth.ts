import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const tokenDepthAction: Action = {
  name: "GET_TOKEN_DEPTH",
  description:
    "Get per-pool price-impact / slippage for a Solana token from MadeOnSol — how much SOL moves the price N% and the impact of each buy size, per pool (not router-optimal). Each pool has spot_price_sol, fee_pct, quotes per SOL size (tokens_out, avg_price_sol, price_impact_pct) and to_move_price (SOL to move 1%/5%/10%). Unsupported pools (CLMM/DLMM/DBC) are flagged with a reason. PRO+.",
  similes: [
    "token depth",
    "price impact",
    "slippage",
    "market depth",
    "how much sol to move the price",
    "liquidity depth",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(depth|price impact|slippage|move the price)\b/i.test(text) && MINT_RE.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const mint = (message.content?.text || "").match(MINT_RE)?.[1];
    if (!mint) {
      callback?.({ text: "Please include a token mint address." });
      return undefined;
    }

    const result = await client.getTokenDepth(mint);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      found: boolean;
      primary_pool?: string | null;
      pools: Array<{
        pool_address: string;
        dex: string;
        quotes: Array<{ size_sol: number; price_impact_pct: number }>;
        to_move_price: { "1pct": number; "5pct": number; "10pct": number };
      }>;
      unsupported_pools: Array<{ pool_address: string; dex: string; reason: string }>;
    };

    if (!data.found) {
      callback?.({
        text: `No depth available for ${mint.slice(0, 8)}… — ${data.unsupported_pools.length > 0 ? "tracked pools can't be priced yet" : "no pools tracked"}.`,
        content: data,
      });
      return undefined;
    }

    const lines = data.pools.slice(0, 3).map((p) => {
      const impacts = p.quotes.map((q) => `${q.size_sol} SOL → ${q.price_impact_pct}%`).join(", ");
      return `• ${p.dex} ${p.pool_address.slice(0, 8)}… — impact: ${impacts}; to move 1%/5%/10%: ${p.to_move_price["1pct"].toFixed(2)}/${p.to_move_price["5pct"].toFixed(2)}/${p.to_move_price["10pct"].toFixed(2)} SOL`;
    });

    callback?.({
      text: `Depth for ${mint.slice(0, 8)}… (${data.pools.length} pool${data.pools.length === 1 ? "" : "s"}${data.unsupported_pools.length ? `, ${data.unsupported_pools.length} unsupported` : ""})\n${lines.join("\n")}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What's the price impact / depth for 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?" } },
      { name: "assistant", content: { text: "Here's the per-pool price impact for that token..." } },
    ],
  ] as Action["examples"],
};
