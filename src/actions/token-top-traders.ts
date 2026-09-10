import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

type TraderRow = {
  wallet_address: string;
  realized_pnl_sol: number;
  roi: number | null;
  is_kol: boolean;
  kol_name?: string | null;
};

export const tokenTopTradersAction: Action = {
  name: "GET_TOKEN_TOP_TRADERS",
  description:
    "Get the wallets that made (or lost) the most on a Solana token from MadeOnSol, ranked by realized PnL or ROI, enriched with KOL and alpha-wallet reputation. PRO/ULTRA.",
  similes: [
    "top traders",
    "biggest winners",
    "who profited",
    "who made money",
    "best traders on this token",
    "top wallets",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(top trader|biggest winner|who (made|profited)|best trader|top wallet)/i.test(text) && MINT_RE.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const text = message.content?.text || "";
    const mint = text.match(MINT_RE)?.[1];
    if (!mint) {
      callback?.({ text: "Please include a token mint address." });
      return undefined;
    }

    const result = await client.getTokenTopTraders(mint, { limit: 10 });
    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as { traders?: TraderRow[] } | undefined;
    const traders = data?.traders ?? [];
    if (traders.length === 0) {
      callback?.({ text: `No ranked traders found for ${mint.slice(0, 8)}…` });
      return undefined;
    }

    const lines = traders.slice(0, 10).map((t, i) => {
      const pnl = t.realized_pnl_sol >= 0 ? `+${t.realized_pnl_sol.toFixed(2)}` : t.realized_pnl_sol.toFixed(2);
      const tag = t.is_kol ? ` (KOL${t.kol_name ? `: ${t.kol_name}` : ""})` : "";
      return `${i + 1}. ${t.wallet_address.slice(0, 8)}…${tag} — ${pnl} SOL${t.roi != null ? ` (${(t.roi * 100).toFixed(0)}% ROI)` : ""}`;
    });

    callback?.({ text: `Top traders for ${mint.slice(0, 8)}…\n${lines.join("\n")}`, content: { ...data } });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Who are the top traders on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" } },
      { name: "assistant", content: { text: "Here are the top traders ranked by realized PnL..." } },
    ],
  ] as Action["examples"],
};
