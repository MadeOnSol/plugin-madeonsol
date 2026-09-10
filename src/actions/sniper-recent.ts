import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

export const sniperRecentAction: Action = {
  name: "GET_SNIPER_RECENT",
  description:
    "Get the deshred pre-confirm pump.fun deploy feed from MadeOnSol — new token launches surfaced ~500ms before on-chain confirmation, from elite/good tier deployers. PRO/ULTRA.",
  similes: ["sniper feed", "recent deploys", "new pump.fun launches", "elite deployer launches", "fresh deploys"],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(sniper|recent deploy|new launch|fresh deploy|elite deployer)/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const result = await client.getSniperRecent({ limit: 10 });
    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }
    const data = result.data as { deploys?: Array<{ token_mint?: string; deployer_wallet?: string; deployer_tier?: string }> } | undefined;
    const deploys = data?.deploys ?? [];
    if (deploys.length === 0) {
      callback?.({ text: "No recent sniper deploys found." });
      return undefined;
    }
    const lines = deploys.slice(0, 10).map((d, i) => `${i + 1}. ${d.token_mint?.slice(0, 8)}… — deployer ${d.deployer_wallet?.slice(0, 8)}… (${d.deployer_tier ?? "unranked"})`);
    callback?.({ text: `Recent sniper deploys:\n${lines.join("\n")}`, content: { ...data } });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me recent elite deployer launches" } },
      { name: "assistant", content: { text: "Here are the most recent deploys from tracked deployers..." } },
    ],
  ] as Action["examples"],
};
