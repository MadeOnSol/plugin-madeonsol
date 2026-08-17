import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenLocksFeed, TokenLocksFeedParams } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString()}`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");

export const tokenLocksFeedAction: Action = {
  name: "GET_TOKEN_LOCKS_FEED",
  description:
    "Get the cross-token feed of NEW token lock / vesting contracts from MadeOnSol — who just locked tokens, of what mint, how much, until when — newest first, across ALL mints, from Streamflow, Jupiter Lock and Bonfida vesting. Each row has the same shape as a GET_TOKEN_LOCKS contract (program, kind, status, sender, recipient, amount_* / locked_* / claimable_*, schedule, terms, next_unlock, created_at, tx_signature) plus token {symbol, name, decimals, price_usd, market_cap_usd}. Poll with since (cursor pagination.next_since), page back with before, or subscribe to WS channel token:locks (event token:lock) for a push the moment the contract lands on-chain. Filters: mint, sender, recipient, program, kind, status, min_usd, min_pct_of_supply (the last three post-filter with a ×4 over-fetch), include_estimated='1' to include backfilled Jupiter Lock rows that have no on-chain creation time. Base-unit amounts are digit STRINGS; ui/usd/pct null when unknown. LP locks NOT included. PRO+ — BASIC receives HTTP 403; keyed API only.",
  similes: [
    "new token locks",
    "latest locks",
    "recent vesting contracts",
    "who just locked tokens",
    "lock feed",
    "newest locks",
    "biggest new locks",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(lock|locks|locked|vesting)\b/i.test(text)
      && /\b(new|newest|latest|recent|recently|just|feed|across|all tokens|biggest|largest)\b/i.test(text)
      && !/\b(unlock|unlocks|unlocking|upcoming|fee|fees)\b/i.test(text)
      && !MINT_RE.test(text);
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
    const params: TokenLocksFeedParams = { limit: 20 };
    const usdMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
    if (usdMatch) {
      const n = parseFloat(usdMatch[1].replace(/,/g, "")) * (usdMatch[2]?.toLowerCase() === "m" ? 1e6 : usdMatch[2]?.toLowerCase() === "k" ? 1e3 : 1);
      if (Number.isFinite(n) && n > 0) params.min_usd = n;
    }
    if (/\bstreamflow\b/i.test(text)) params.program = "streamflow";
    else if (/\bjupiter\b/i.test(text)) params.program = "jupiter_lock";
    else if (/\bbonfida\b/i.test(text)) params.program = "bonfida_vesting";
    if (/\bvesting\b/i.test(text) && !/\block(s|ed)?\b/i.test(text)) params.kind = "vesting";

    const result = await client.getTokenLocksFeed(params);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : result.status === 403
          ? "The token locks feed is PRO+ — this key's tier does not include it. Upgrade at https://madeonsol.com/pricing."
          : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenLocksFeed;
    const rows = data.locks.slice(0, 10).map((l) => {
      const sym = l.token?.symbol ?? l.mint.slice(0, 6) + "…";
      const who = l.sender ? `${l.sender.slice(0, 6)}…` : "unknown locker";
      const cancel = l.cancelable_by_sender ? " · cancelable by sender" : "";
      return `  ${when(l.created_at)} ${sym}: ${l.program} ${l.kind} by ${who} — ${l.amount ?? l.amount_raw} (${pct(l.amount_pct_of_supply)} of supply, ${usd(l.amount_usd)}), ends ${when(l.end_at)}${cancel}`;
    });
    const summary = [
      `Newest lock / vesting contracts (${data.pagination.count} returned${data.pagination.has_more ? ", more available" : ""}${params.min_usd ? `, ≥ ${usd(params.min_usd)}` : ""}${params.program ? `, ${params.program}` : ""}):`,
      ...(rows.length ? rows : ["  (none matched)"]),
      `• Poll with since=${data.pagination.next_since ?? "<next_since>"} or subscribe to WS channel token:locks for a push per new contract. LP locks are NOT included.`,
    ].join("\n");

    callback?.({ text: summary, content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me the newest token locks over $50k across all tokens" } },
      { name: "assistant", content: { text: "Here are the latest lock / vesting contracts, newest first..." } },
    ],
  ] as Action["examples"],
};
