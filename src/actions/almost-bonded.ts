import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

/**
 * Scan pre-bond pump.fun tokens approaching graduation, ranked by velocity.
 * Heuristics pulled from the user prompt: "fast"/"accelerating" → sort by
 * velocity, "soon"/"closest" → sort by ETA, "elite deployer" → deployer_tier.
 */
export const almostBondedAction: Action = {
  name: "MADEONSOL_ALMOST_BONDED",
  description:
    "Find pre-bond pump.fun tokens near graduation, ranked by velocity (Δprogress/min). Returns mint, symbol, bonding progress %, velocity, ETA-to-bond, stalled flag, and deployer tier. PRO/ULTRA only.",
  similes: [
    "almost bonded",
    "about to graduate",
    "near graduation",
    "tokens about to bond",
    "almost graduated",
    "pre-bond tokens",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(almost bonded|about to graduate|near graduation|about to bond|pre-?bond|almost graduated)\b/.test(text);
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

    const params: {
      limit?: string;
      sort?: string;
      deployer_tier?: string;
      min_velocity_pct_per_min?: string;
    } = { limit: "10" };

    if (/soon|closest|fastest to bond|eta/.test(text)) params.sort = "eta_asc";
    else if (/accelerat|fast|velocity|momentum/.test(text)) params.sort = "velocity_desc";
    if (/elite/.test(text)) params.deployer_tier = "elite";

    const result = await client.getAlmostBonded(params);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      tokens?: Array<{
        mint: string;
        symbol?: string | null;
        name?: string | null;
        progress_pct?: number | null;
        velocity_pct_per_min?: number | null;
        eta_minutes?: number | null;
        stalled?: boolean | null;
        deployer_tier?: string | null;
      }>;
    };

    const tokens = (data.tokens || []).slice(0, 10);
    const lines = tokens.map((t, i) => {
      const label = t.symbol || t.name || "?";
      const prog = t.progress_pct != null && isFinite(t.progress_pct) ? `${t.progress_pct.toFixed(1)}%` : "?";
      const vel = t.velocity_pct_per_min != null && isFinite(t.velocity_pct_per_min)
        ? ` @ ${t.velocity_pct_per_min >= 0 ? "+" : ""}${t.velocity_pct_per_min.toFixed(2)}%/min`
        : "";
      const eta = t.eta_minutes != null && isFinite(t.eta_minutes) ? ` (ETA ~${t.eta_minutes}m)` : "";
      const tier = t.deployer_tier ? ` [${t.deployer_tier}]` : "";
      return `${i + 1}. ${label} ${t.mint.slice(0, 8)}… — ${prog} bonded${vel}${eta}${tier}`;
    });

    callback?.({
      text: tokens.length
        ? `Almost-bonded pump.fun tokens:\n${lines.join("\n")}`
        : "No pre-bond tokens matched those filters.",
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me pump.fun tokens about to graduate, fastest first" } },
      { name: "assistant", content: { text: "Here are the almost-bonded tokens ranked by velocity..." } },
    ],
  ] as Action["examples"],
};
