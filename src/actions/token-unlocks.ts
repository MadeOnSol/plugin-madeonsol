import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenUnlocks, TokenUnlocksParams } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const WITHIN_RE = /\b(1h|6h|24h|3d|7d|14d|30d|90d)\b/i;

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString()}`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");

function pickWithin(text: string): TokenUnlocksParams["within"] | undefined {
  const m = text.match(WITHIN_RE)?.[1]?.toLowerCase() as TokenUnlocksParams["within"] | undefined;
  if (m) return m;
  if (/\b(today|next 24 ?hours?|24 ?hours?)\b/i.test(text)) return "24h";
  if (/\b(this|next) week\b|\b7 ?days?\b/i.test(text)) return "7d";
  if (/\b(this|next) month\b|\b30 ?days?\b/i.test(text)) return "30d";
  if (/\bnext hour\b/i.test(text)) return "1h";
  return undefined;
}

export const tokenUnlocksAction: Action = {
  name: "GET_TOKEN_UNLOCKS",
  description:
    "Get upcoming token UNLOCK EVENTS from MadeOnSol — across all active lock / vesting contracts (Streamflow, Jupiter Lock, Bonfida) inside a window: cliffs, periodic releases (hourly or coarser) and final unlocks — i.e. which tokens have locked supply hitting the market this week, how much, from whose lock. One entry per active contract = its NEXT unlock event in the window: unlock_at, in_seconds, event (cliff | period | final | tranche), amount_raw / amount / amount_usd / amount_pct_of_supply for that event, plus window_amount_* = that contract's TOTAL release over the whole window, mint, token {symbol, price_usd, market_cap_usd} and lock (subset of the GET_TOKEN_LOCKS row: lock_account, program, kind, sender, recipient, cancelable_by_sender). Continuous per-second streams (Streamflow payroll) contribute only their cliff / final events. within = 1h | 6h | 24h | 3d | 7d | 14d | 30d | 90d (default 7d); sort = soonest (default) | largest_usd | largest_pct; filters mint / program / kind / min_usd / min_pct_of_supply. Base-unit amounts are digit STRINGS; usd null when price unknown or phantom (implied MC > $100B). Token/vesting locks only — LP locks not included. PRO+ — BASIC receives HTTP 403; keyed API only.",
  similes: [
    "upcoming unlocks",
    "token unlocks",
    "unlock schedule",
    "unlocks this week",
    "vesting cliffs",
    "what unlocks soon",
    "biggest unlocks",
    "supply hitting the market",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(unlock|unlocks|unlocking|cliff|cliffs)\b/i.test(text) && !/\b(fee|fees)\b/i.test(text);
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
    const params: TokenUnlocksParams = { limit: 20 };
    const within = pickWithin(text);
    if (within) params.within = within;
    const mint = text.match(MINT_RE)?.[1];
    if (mint) params.mint = mint;
    if (/\b(biggest|largest|top)\b/i.test(text)) params.sort = /\b(pct|percent|% of supply|share of supply)\b/i.test(text) ? "largest_pct" : "largest_usd";
    if (/\bstreamflow\b/i.test(text)) params.program = "streamflow";
    else if (/\bjupiter\b/i.test(text)) params.program = "jupiter_lock";
    else if (/\bbonfida\b/i.test(text)) params.program = "bonfida_vesting";
    const usdMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
    if (usdMatch) {
      const n = parseFloat(usdMatch[1].replace(/,/g, "")) * (usdMatch[2]?.toLowerCase() === "m" ? 1e6 : usdMatch[2]?.toLowerCase() === "k" ? 1e3 : 1);
      if (Number.isFinite(n) && n > 0) params.min_usd = n;
    }

    const result = await client.getTokenUnlocks(params);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : result.status === 403
          ? "Upcoming unlocks are PRO+ — this key's tier does not include them. Upgrade at https://madeonsol.com/pricing."
          : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenUnlocks;
    const rows = data.unlocks.slice(0, 10).map((u) => {
      const sym = u.token?.symbol ?? u.mint.slice(0, 6) + "…";
      const hrs = Math.round(u.in_seconds / 360) / 10;
      const who = u.lock?.sender ? ` from ${u.lock.sender.slice(0, 6)}…` : "";
      const cancel = u.lock?.cancelable_by_sender ? " · cancelable by sender" : "";
      return `  ${when(u.unlock_at)} (in ${hrs}h) ${sym}: ${u.event} of ${u.amount ?? u.amount_raw} (${pct(u.amount_pct_of_supply)} of supply, ${usd(u.amount_usd)}) via ${u.lock?.program ?? "?"}${who}; ${usd(u.window_amount_usd)} total over the window${cancel}`;
    });
    const summary = [
      `Upcoming unlocks within ${data.window.within} (${when(data.window.from)} → ${when(data.window.to)}): ${data.pagination.total_in_window} event(s) in window, showing ${data.pagination.count}${params.sort ? `, sorted by ${params.sort}` : ", soonest first"}${params.mint ? ` for ${params.mint.slice(0, 8)}…` : ""}:`,
      ...(rows.length ? rows : ["  (no unlock events in this window)"]),
      `• One entry per active contract = its NEXT event; window_amount = that contract's total release over the whole window. Per-second streams contribute only cliff/final events. LP locks not included.`,
    ].join("\n");

    callback?.({ text: summary, content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What are the biggest token unlocks this week?" } },
      { name: "assistant", content: { text: "Here are the upcoming unlock events in the next 7 days, largest first..." } },
    ],
  ] as Action["examples"],
};
