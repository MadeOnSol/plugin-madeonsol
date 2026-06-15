import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

export const deployerAlertsAction: Action = {
  name: "GET_DEPLOYER_ALERTS",
  description:
    "Get real-time Pump.fun deployer alerts from MadeOnSol. Shows new token launches from tracked elite/good deployers with stats, market cap, and KOL buy enrichment.",
  similes: [
    "deployer alerts",
    "pump fun launches",
    "new token alerts",
    "deployer tracker",
    "elite deployer tokens",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return /\b(deployer|pump\.?fun|launch|new token)/i.test(text) && /\b(alert|track|monitor|latest|recent)/i.test(text);
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
    const limit = text.match(/\b(\d+)\s*(alert|token|launch)/)?.[1] || "10";
    // Best-effort tier inference from the user's prompt — only sent to the API
    // when the user explicitly mentioned a tier. The tier filter requires
    // PRO/ULTRA on the caller's API key.
    const tierMatch = text.match(/\b(elite|good|moderate|rising|cold)\b/);
    const tier = tierMatch?.[1];

    const result = await client.getDeployerAlerts(tier ? { limit, tier } : { limit });

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as { alerts: Array<{ title: string; token_symbol: string; priority: string; market_cap_at_alert: number | null; deployers: { tier: string; bonding_rate: number | null; runner_rate?: number | null; labeled_tokens?: number | null; avg_time_to_bond_minutes?: number | null }; kol_buys: { count: number; kols: string[] } | null }> };
    const lines = (data.alerts || []).slice(0, 10).map((a) => {
      const deployer = a.deployers as unknown as { tier: string; bonding_rate: number | null; runner_rate?: number | null; labeled_tokens?: number | null };
      const mc = a.market_cap_at_alert ? `$${(a.market_cap_at_alert / 1000).toFixed(1)}k` : "?";
      const kols = a.kol_buys ? `${a.kol_buys.count} KOLs buying` : "";
      return `[${deployer?.tier}] ${a.token_symbol || "?"} — MC: ${mc}${kols ? ` | ${kols}` : ""}`;
    });

    callback?.({
      text: `Deployer Alerts:\n${lines.join("\n") || "No recent alerts."}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me the latest deployer alerts from Pump.fun" } },
      { name: "assistant", content: { text: "Here are the latest deployer alerts..." } },
    ],
  ] as Action["examples"],
};
