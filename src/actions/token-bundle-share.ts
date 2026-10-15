import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const WINDOW_RE = /\b(1h|6h|24h)\b/i;

function authError(result: { error?: string; status: number }): string {
  return result.status === 401 || result.status === 402
    ? "This endpoint needs a MadeOnSol API key (PRO+). Set MADEONSOL_API_KEY — https://madeonsol.com/pricing. It is not available with x402 payments."
    : `Error: ${result.error}`;
}

export const tokenBundleShareAction: Action = {
  name: "GET_TOKEN_BUNDLE_SHARE",
  description:
    "Get one figure for a Solana token from MadeOnSol: bundled_pct_of_supply_now, the share of supply held right now by every bundle wallet (launch bundle plus the window's buy clusters, each wallet once), read from chain balances. Null with a reason (held_now.incomplete_reason) unless every wallet was read, never a partial sum. Cached 30 s per token. PRO+, API key only.",
  similes: [
    "bundle share",
    "bundled supply now",
    "how much supply do bundles hold now",
    "bundle held now",
    "bundled percent of supply",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(bundle.?share|bundled.{0,20}(supply|percent|pct|share)|bundle.{0,30}\bnow\b)/i.test(text) && MINT_RE.test(text);
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
    const window = text.match(WINDOW_RE)?.[1]?.toLowerCase() as "1h" | "6h" | "24h" | undefined;

    const result = await client.getTokenBundleShare(mint, { window });
    if (result.error) {
      callback?.({ text: authError(result) });
      return undefined;
    }

    const data = result.data as {
      window?: string;
      bundled_pct_of_supply_now: number | null;
      scope?: string;
      wallets?: { total?: number; verified?: number; holding?: number };
      held_now?: { incomplete_reason?: string | null };
    };
    const w = data.wallets;
    if (data.bundled_pct_of_supply_now == null) {
      const reason = data.held_now?.incomplete_reason ?? "not every wallet could be read";
      callback?.({ text: `Bundle share for ${mint.slice(0, 8)}… is unavailable: ${reason}${w ? ` (${w.verified ?? 0}/${w.total ?? 0} wallets read)` : ""}.`, content: data });
      return undefined;
    }

    const pct = (data.bundled_pct_of_supply_now * 100).toFixed(2);
    callback?.({
      text: `Bundle wallets hold ${pct}% of ${mint.slice(0, 8)}… supply now (${w?.holding ?? "?"} of ${w?.total ?? "?"} wallets still holding, window ${data.window ?? "24h"}${data.scope === "launch_cohort_only" ? ", launch bundle only" : ""}).`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What is the bundle share of supply now on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?" } },
      { name: "assistant", content: { text: "Bundle wallets hold 12.40% of that token's supply now..." } },
    ],
  ] as Action["examples"],
};
