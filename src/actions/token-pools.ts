import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const tokenPoolsAction: Action = {
  name: "GET_TOKEN_POOLS",
  description:
    "Get the per-venue liquidity map for a Solana token from MadeOnSol — every DEX pool the token trades in, live vs parked, plus fragmentation and top-pool share. Each pool carries pool_address, dex, quote_mint, liquidity_usd, last_price_sol, last_swap_at, amm_id, and is_active; the summary rolls up pool_count, active_pool_count, dex_count, dexes, total_liquidity_usd, primary_pool, primary_dex, and top_pool_share_pct. PRO+.",
  similes: [
    "token pools",
    "liquidity pools",
    "where does this token trade",
    "which dexes",
    "liquidity map",
    "pool fragmentation",
    "top pool share",
    "primary pool",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(pool|pools|liquidity|venue|venues|dex|dexes|fragmentation)\b/i.test(text) && MINT_RE.test(text);
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

    const result = await client.getTokenPools(mint);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      mint: string;
      pools: Array<{
        pool_address: string;
        dex: string;
        quote_mint: string;
        liquidity_usd: number;
        last_price_sol: number;
        last_swap_at: string;
        amm_id: string;
        is_active: boolean;
      }>;
      summary: {
        pool_count: number;
        active_pool_count: number;
        dex_count: number;
        dexes: string[];
        total_liquidity_usd: number;
        primary_pool: string | null;
        primary_dex: string | null;
        top_pool_share_pct: number | null;
      };
    };
    const s = data.summary;

    if (!s || s.pool_count === 0) {
      callback?.({ text: `No pools found for ${mint.slice(0, 8)}….`, content: data });
      return undefined;
    }

    const share = s.top_pool_share_pct != null ? `${s.top_pool_share_pct.toFixed(1)}%` : "n/a";
    const summary = [
      `Pools for ${mint.slice(0, 8)}…: ${s.pool_count} pools (${s.active_pool_count} active) across ${s.dex_count} DEX${s.dex_count === 1 ? "" : "es"}`,
      `• Total liquidity: $${s.total_liquidity_usd.toLocaleString()}`,
      `• Primary: ${s.primary_dex ?? "n/a"} — top-pool share ${share}`,
    ].join("\n");

    callback?.({ text: summary, content: data });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Which DEX pools does 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU trade in, and how fragmented is the liquidity?" } },
      { name: "assistant", content: { text: "Here's the per-venue liquidity map for that token..." } },
    ],
  ] as Action["examples"],
};
