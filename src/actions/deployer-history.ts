import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const deployerHistoryAction: Action = {
  name: "GET_DEPLOYER_HISTORY",
  description:
    "Get a deployer's daily reputation time-series from MadeOnSol — backtest \"was this deployer elite when it launched token X?\" without look-ahead bias. Returns is_deployer, wallet, and snapshots[] (each date, tier, is_tracked, total_deployed, total_bonded, bonding_rate, recent_bond_rate, avg_peak_mc, best_token_peak_mc) for the last N days (1–365, default 90). PRO+.",
  similes: [
    "deployer history",
    "deployer reputation over time",
    "deployer tier history",
    "was this deployer elite",
    "deployer time series",
    "deployer backtest",
    "historical bonding rate",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(deployer|deploy|bond|bonding|reputation)\b/i.test(text) && WALLET_RE.test(text);
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
    const wallet = text.match(WALLET_RE)?.[1];
    if (!wallet) {
      callback?.({ text: "Please include a deployer wallet address." });
      return undefined;
    }

    const limitMatch = text.match(/\b(\d{1,3})\s*(?:day|days|d)\b/i);
    const limit = limitMatch ? Math.max(1, Math.min(365, parseInt(limitMatch[1], 10))) : undefined;

    const result = await client.getDeployerHistory(wallet, limit);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      is_deployer: boolean;
      wallet: string;
      snapshots: Array<{
        date: string;
        tier: string;
        is_tracked: boolean;
        total_deployed: number;
        total_bonded: number;
        bonding_rate: number;
        recent_bond_rate: number;
        avg_peak_mc: number;
        best_token_peak_mc: number;
      }>;
    };

    if (!data.is_deployer || data.snapshots.length === 0) {
      callback?.({ text: `No deployer history for ${wallet.slice(0, 8)}….`, content: data });
      return undefined;
    }

    const latest = data.snapshots[data.snapshots.length - 1];
    const rate = latest.bonding_rate != null ? `${(latest.bonding_rate * 100).toFixed(1)}%` : "n/a";
    const summary = [
      `Deployer history for ${wallet.slice(0, 8)}…: ${data.snapshots.length} daily snapshots`,
      `• Latest (${latest.date}): tier ${latest.tier}${latest.is_tracked ? " (tracked)" : ""}`,
      `• ${latest.total_bonded}/${latest.total_deployed} bonded (${rate})`,
    ].join("\n");

    callback?.({ text: summary, content: data });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show the deployer reputation history for 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU over the last 90 days." } },
      { name: "assistant", content: { text: "Here's the deployer's daily reputation time-series..." } },
    ],
  ] as Action["examples"],
};
