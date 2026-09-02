import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

export const deployerRewardsAction: Action = {
  name: "GET_DEPLOYER_REWARDS",
  description:
    "pump.fun creator-fee rewards for a wallet from MadeOnSol, answered two ways that are never merged: collected (what actually reached the wallet) and attributed (every payout on the tokens it deployed, split to_self/to_others). Each money field is {sol, usdc, usd}; usd is null (never a silent 0) when a SOL amount exists and no SOL price was available. Works for non-deployers too. PRO+.",
  similes: [
    "deployer creator fees",
    "how much did this deployer earn",
    "deployer fee rewards",
    "creator fee income",
    "who got the creator fees",
    "redirected fees",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(creator fee|fee reward|deployer earn|fee income|redirect(ed)? fee)\b/i.test(text) && WALLET_RE.test(text);
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
      callback?.({ text: "Please include a wallet address." });
      return undefined;
    }

    const result = await client.getDeployerRewards(wallet);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      is_deployer: boolean;
      wallet: string;
      collected: { sol: number; usdc: number; usd: number | null };
      attributed: { sol: number; usdc: number; usd: number | null; redirected_pct: number | null; tokens_with_payouts: number };
    };

    const usd = (m: { sol: number; usdc: number; usd: number | null }) =>
      m.usd != null ? `$${m.usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${m.sol.toFixed(2)} SOL${m.usdc ? ` + ${m.usdc.toFixed(2)} USDC` : ""}`;

    const lines = [
      `Creator-fee rewards for ${wallet.slice(0, 8)}…${!data.is_deployer ? " (not a tracked deployer)" : ""}:`,
      `• Collected: ${usd(data.collected)}`,
      `• Attributed to its ${data.attributed.tokens_with_payouts} launch(es) with payouts: ${usd(data.attributed)}`,
    ];
    if (data.attributed.redirected_pct != null && data.attributed.redirected_pct > 0) {
      lines.push(`• ${data.attributed.redirected_pct.toFixed(0)}% of that was redirected away from the deployer's own wallet`);
    }

    callback?.({ text: lines.join("\n"), content: data });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "How much in creator fees has 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU earned?" } },
      { name: "assistant", content: { text: "Checking that wallet's creator-fee rewards..." } },
    ],
  ] as Action["examples"],
};
