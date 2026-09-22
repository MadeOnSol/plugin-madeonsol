import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

export const kolLeaderboardAction: Action = {
  name: "GET_KOL_LEADERBOARD",
  description:
    "Get KOL performance rankings from MadeOnSol — top Solana KOLs ranked by PnL, volume, and win rate.",
  similes: [
    "kol leaderboard",
    "best performing kols",
    "top kol traders",
    "kol rankings",
    "who is the best kol",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(kol|smart money)\b/.test(text) && /\b(leaderboard|ranking|top|best|perform|pnl|win rate)/i.test(text);
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
    const period = text.includes("today") ? "today" : text.includes("30d") || text.includes("month") ? "30d" : "7d";

    const result = await client.getKolLeaderboard({ period, limit: "10" });

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    // x402 serves `pnl_sol`; with an API key the call is rewritten to /api/v1, which serves `pnl`.
    // win_rate is a percentage (0–100) on both routes.
    const data = result.data as { leaderboard: Array<{ name: string; pnl_sol?: number | null; pnl?: number | null; buy_count: number; sell_count: number; win_rate: number | null }> };
    const lines = (data.leaderboard || []).map((k, i) => {
      const raw = k.pnl_sol ?? k.pnl;
      const pnl = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
      const pnlText = pnl == null ? "PnL n/a" : `${pnl > 0 ? "+" : ""}${pnl.toFixed(2)} SOL PnL`;
      const wr = k.win_rate != null && Number.isFinite(Number(k.win_rate)) ? `, ${Number(k.win_rate).toFixed(0)}% WR` : "";
      return `${i + 1}. ${k.name}: ${pnlText} (${k.buy_count}B/${k.sell_count}S${wr})`;
    });

    callback?.({
      text: `KOL Leaderboard (${period}):\n${lines.join("\n") || "No data for this period."}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me the top performing KOLs this week" } },
      { name: "assistant", content: { text: "Here are the top KOLs by PnL..." } },
    ],
  ] as Action["examples"],
};
