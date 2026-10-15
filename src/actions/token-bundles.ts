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

type Cluster = {
  slot: number;
  at: string;
  phase: "launch" | "later" | "unknown";
  minutes_after_launch: number | null;
  wallet_count: number;
  new_wallets: number;
  atomic_txs: number;
  sol_volume: number | null;
};

export const tokenBundlesAction: Action = {
  name: "GET_TOKEN_BUNDLES",
  description:
    "List every coordinated buy cluster on a Solana token from MadeOnSol: slots in a 1h/6h/24h window where at least min_wallets (default 3) distinct wallets bought, the launch bundle and clusters that enter later. Per cluster: slot, time, phase, wallet_count, new_wallets, atomic_txs, SOL volume. Only stored buys count (0.05 SOL / $3.50 floor); summary.baseline shows buys per active slot, so a cluster is evidence, not a verdict. PRO+, API key only.",
  similes: [
    "bundle clusters",
    "coordinated buys",
    "later bundles",
    "new bundles",
    "buy clusters",
    "same slot clusters",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(bundles|clusters?|coordinated buy)/i.test(text) && MINT_RE.test(text);
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

    const result = await client.getTokenBundles(mint, { window, limit: 10 });
    if (result.error) {
      callback?.({ text: authError(result) });
      return undefined;
    }

    const data = result.data as { window?: string; clusters?: Cluster[]; summary?: { cluster_count?: number; launch_clusters?: number; later_clusters?: number } } | undefined;
    const clusters = data?.clusters ?? [];
    if (clusters.length === 0) {
      callback?.({ text: `No coordinated buy clusters on ${mint.slice(0, 8)}… in the last ${data?.window ?? "24h"}.`, content: { ...data } });
      return undefined;
    }

    const s = data?.summary;
    const lines = clusters.slice(0, 10).map((c) =>
      `• ${c.at} (${c.phase}): ${c.wallet_count} wallets, ${c.new_wallets} new, ${c.atomic_txs} atomic tx${c.sol_volume != null ? `, ${c.sol_volume.toFixed(2)} SOL` : ""}`,
    );
    callback?.({
      text: `Buy clusters on ${mint.slice(0, 8)}… (${data?.window ?? "24h"}): ${s?.cluster_count ?? clusters.length} total, ${s?.launch_clusters ?? 0} at launch, ${s?.later_clusters ?? 0} later\n${lines.join("\n")}`,
      content: { ...data },
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Any coordinated buy clusters on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU in the last 6h?" } },
      { name: "assistant", content: { text: "Here are the buy clusters on that token..." } },
    ],
  ] as Action["examples"],
};
