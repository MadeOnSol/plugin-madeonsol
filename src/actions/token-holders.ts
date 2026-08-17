import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenHolders } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);

export const tokenHoldersAction: Action = {
  name: "GET_TOKEN_HOLDERS",
  description:
    "Get the live holder census + concentration for a Solana token from MadeOnSol — WHO HOLDS NOW (GET_TOKEN_RISK/cap-table = who bought first). Read live from the ledger: every token account of the mint (mint-scoped getProgramAccounts) merged per owner, so concentration.holder_count is EXACT (distinct non-zero owners minus excluded pools/curves/burns); it is null ONLY when the provider refuses the census for a mega-cap — then a top-20 getTokenLargestAccounts fallback with source.census_fallback_reason set — never estimated from trades. Every disclosed owner carries labels[] from MadeOnSol wallet intelligence (deployer / kol / early_buyer / buyer / bundle / bot / dump_cluster; empty = unknown to us, NOT verified clean). Liquidity pools, bonding curves, vaults and burns are EXCLUDED from the circulating denominator and NAMED in excluded[] (reason = pool + dex + pool_address | bonding_curve | burn | program_account); concentration splits them into pool_pct / burned_pct / program_pct over TOTAL supply, while top1/10/20/50/100_share and deployer/kol/early_buyer/bundle/bot/dump_cluster_pct are over circulating. amount_raw / supply_raw / circulating_raw are raw u64 STRINGS. Disclosure PRO ranks 1–10, ULTRA 1–50, BUSINESS 1–100 (maths tier-independent). Big established tokens: first call may be HTTP 503 holder_scan_in_progress (retry_after_seconds 20) — the scan continues and is cached, the retry is instant. PRO+.",
  similes: [
    "token holders",
    "holder count",
    "how many holders",
    "top holders",
    "holder concentration",
    "who holds this token",
    "whale concentration",
    "top 10 holders",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(holder|holders|holds|holding|whale|whales|concentration)\b/i.test(text) && MINT_RE.test(text);
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

    const result = await client.getTokenHolders(mint);

    if (result.error) {
      if (result.status === 503 && /holder_scan_in_progress/.test(result.error)) {
        callback?.({ text: `Holder scan still running for ${mint.slice(0, 8)}… — large established tokens take 5–30 s to enumerate upstream. The scan continues and is cached; retry in ~20 s and the answer is instant.` });
        return undefined;
      }
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenHolders;
    const c = data.concentration;

    const holderCount = c.holder_count != null
      ? `${c.holder_count.toLocaleString()} holders (exact, census)`
      : `holder count not observable (${data.source.census_fallback_reason ?? "provider refused census"} — top-20 view only)`;
    const top = data.holders.slice(0, 5).map((h) => {
      const tags = h.labels.length ? ` [${h.labels.join(", ")}${h.kol_name ? `: ${h.kol_name}` : ""}]` : "";
      return `  #${h.rank} ${h.owner.slice(0, 6)}… ${pct(h.pct_of_circulating)} of circulating${tags}`;
    });
    const excludedLine = data.excluded.length
      ? `• Excluded from circulating: ${data.excluded.map((e) => `${e.reason}${e.dex ? ` (${e.dex})` : ""} ${pct(e.pct_of_supply)}`).join(", ")}`
      : "• Excluded from circulating: none";
    const summary = [
      `Holders of ${mint.slice(0, 8)}… (slot ${data.slot ?? "n/a"}): ${holderCount}`,
      `• Top 1 / 10 / 20 share of circulating: ${pct(c.top1_share)} / ${pct(c.top10_share)} / ${pct(c.top20_share)}`,
      `• Deployer ${pct(c.deployer_pct)} · KOL ${pct(c.kol_pct)} · early buyers ${pct(c.early_buyer_pct)} · bundle ${pct(c.bundle_pct)} · bots ${pct(c.bot_pct)}`,
      excludedLine,
      `• Top ${Math.min(5, data.holders.length)} of ${data.count} disclosed (tier cap ${data.disclosed}):`,
      ...top,
    ].join("\n");

    // Named interfaces lack the implicit index signature ContentValue wants; the payload is plain JSON.
    callback?.({ text: summary, content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "How many holders does 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU have and how concentrated is it?" } },
      { name: "assistant", content: { text: "Here's the live holder census and concentration for that token..." } },
    ],
  ] as Action["examples"],
};
