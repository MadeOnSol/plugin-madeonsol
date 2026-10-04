import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

export const kolAlertsRecentAction: Action = {
  name: "GET_KOL_ALERTS_RECENT",
  description:
    "Get live KOL alerts from MadeOnSol — consensus clusters, fresh-token KOL buys, and heating-up wallets in one unified stream.",
  similes: [
    "kol alerts",
    "recent alerts",
    "kol signals",
    "whats happening now",
    "live kol feed",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(kol|smart money)\b/.test(text) && /\b(alert|signal|recent|live|now)\b/.test(text);
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
    const window = text.includes("24h") ? "24h" : text.includes("6h") ? "6h" : text.includes("1h") ? "1h" : "6h";

    const result = await client.getKolAlertsRecent({ window, limit: "20" });

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      alerts: Array<{ type: string; severity: string; token_symbol: string | null; kol_name: string | null; detected_at: string }>;
    };
    const lines = (data.alerts || []).slice(0, 10).map((a) => {
      const subject = a.token_symbol || a.kol_name || "—";
      return `[${a.severity}] ${a.type}: ${subject}`;
    });

    callback?.({
      text: `KOL alerts (${window}):\n${lines.join("\n") || "No alerts in window."}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What are the recent KOL alerts?" } },
      { name: "assistant", content: { text: "Here are the live KOL alerts..." } },
    ],
  ] as Action["examples"],
};
