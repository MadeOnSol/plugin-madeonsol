import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const tokenBundleAction: Action = {
  name: "GET_TOKEN_BUNDLE",
  description:
    "Get bundle-cohort holdings for a Solana token from MadeOnSol — the same-slot \"bundle\" wallets (≥3 buying in one slot) that bought a token and how much of supply they STILL hold (the rug/insider signal, from confirmed on-chain data). Returns wallet_count, bundle_kind, held_pct_of_supply (headline), fully_exited, and per-wallet flags. BASIC get the summary block only; PRO adds top-10 flags; ULTRA adds KOL identity + win rate.",
  similes: [
    "token bundle",
    "bundle wallets",
    "bundle cohort",
    "same slot buyers",
    "insider holdings",
    "how much do bundlers hold",
    "bundle held percent",
    "sniper bundle",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(bundle|bundler|bundled|same.?slot|insider)\b/i.test(text) && MINT_RE.test(text);
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

    const result = await client.getTokenBundle(mint);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      mint: string;
      bundle: {
        wallet_count: number;
        bundle_kind: "atomic_tx" | "same_slot" | "none";
        held_ratio: number | null;
        held_pct_of_supply: number | null;
        fully_exited: boolean;
        buy_volume: number;
        tokens_held: number;
      };
    };
    const b = data.bundle;

    if (b.bundle_kind === "none" || b.wallet_count === 0) {
      callback?.({ text: `No bundle cohort detected for ${mint.slice(0, 8)}….`, content: data });
      return undefined;
    }

    const pct = b.held_pct_of_supply != null ? `${(b.held_pct_of_supply * 100).toFixed(2)}%` : "n/a";
    const summary = [
      `Bundle cohort for ${mint.slice(0, 8)}… (${b.bundle_kind}): ${b.wallet_count} wallets still hold ${pct} of supply${b.fully_exited ? " — fully exited" : ""}`,
      `• Buy volume: ${b.buy_volume}`,
    ].join("\n");

    callback?.({ text: summary, content: data });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "How much do the bundle wallets still hold on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?" } },
      { name: "assistant", content: { text: "Here's the bundle-cohort holdings for that token..." } },
    ],
  ] as Action["examples"],
};
