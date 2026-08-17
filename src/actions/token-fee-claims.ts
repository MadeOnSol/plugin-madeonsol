import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenFeeClaims, TokenFeeClaimsParams } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");

export const tokenFeeClaimsAction: Action = {
  name: "GET_TOKEN_FEE_CLAIMS",
  description:
    "Get the pump.fun FEE-EVENT feed from MadeOnSol, newest first, across all coins: type = distribution (creator fees paid out pro-rata to the SharingConfig shareholders — fees redirected to others — with payouts[] {address, share_bps, amount} per address) | social_claim (fees earmarked for a platform identity — social.platform 2 = X, social.user_id = the platform-native numeric id — claimed to a recipient wallet; mint is NULL) | shares_created / shares_updated / shares_reset (SharingConfig changes, with shareholders[]) | creator_transferred (creator role moved; recipient = new creator) | creator_claim (the plain creator vault claim — per CREATOR, no mint; EXCLUDED unless requested via type). Each event: id, type, at, tx_signature, slot, mint, admin, actor (transaction signer), recipient, amount_raw (quote base units — SOL lamports unless a stable-quoted coin — as a digit STRING), amount, amount_usd, quote, social, shareholders, payouts, payload (full decoded Anchor event). Default 100%-to-creator configs and zero-amount distributions are NOT stored. Poll with since (cursor pagination.next_since), page back with before, or subscribe to WS channel token:fee_claims (event token:fee_claim). Filters: type (comma list), mint, recipient, actor, social_platform (2 = X), social_user_id, min_sol. HISTORY STARTS 2026-08-17. PRO+ — BASIC receives HTTP 403; keyed API only.",
  similes: [
    "fee claims",
    "fee events",
    "creator fee distributions",
    "social fee claims",
    "x account fee claims",
    "who claimed pump fees",
    "fee payouts",
    "pump fun fee feed",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(fee|fees)\b/i.test(text)
      && /\b(claim|claims|claimed|events?|distributions?|payouts?|feed|paid out|latest|recent)\b/i.test(text)
      && !/\b(shar(e|es|ing)|split|config)\b/i.test(text);
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
    const params: TokenFeeClaimsParams = { limit: 20 };
    const mint = text.match(MINT_RE)?.[1];
    if (mint) params.mint = mint;
    if (/\bsocial\b|\bx account\b|\btwitter\b/i.test(text)) params.type = "social_claim";
    else if (/\bdistributions?\b|\bpayouts?\b/i.test(text)) params.type = "distribution";
    else if (/\bcreator claims?\b|\bvault claims?\b/i.test(text)) params.type = "creator_claim";
    const solMatch = text.match(/([\d.]+)\s*sol\b/i);
    if (solMatch) {
      const n = parseFloat(solMatch[1]);
      if (Number.isFinite(n) && n > 0) params.min_sol = n;
    }

    const result = await client.getTokenFeeClaims(params);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : result.status === 403
          ? "The fee-claim feed is PRO+ — this key's tier does not include it. Upgrade at https://madeonsol.com/pricing."
          : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenFeeClaims;
    const rows = data.events.slice(0, 10).map((e) => {
      const coin = e.mint ? e.mint.slice(0, 6) + "…" : e.type === "social_claim" ? "(identity claim, no mint)" : "(no mint)";
      const amt = e.amount != null || e.amount_raw ? ` — ${e.amount ?? e.amount_raw} ${e.quote} (${usd(e.amount_usd)})` : "";
      const to = e.recipient ? ` → ${e.recipient.slice(0, 6)}…` : "";
      const social = e.social ? ` [${e.social.platform_label ?? `platform_${e.social.platform}`} id ${e.social.user_id}]` : "";
      const payouts = e.payouts?.length ? ` to ${e.payouts.length} shareholder(s)` : "";
      return `  ${when(e.at)} ${e.type} ${coin}${amt}${payouts}${to}${social}`;
    });
    const summary = [
      `pump.fun fee events (${data.pagination.count} returned${data.pagination.has_more ? ", more available" : ""}${params.type ? `, type=${params.type}` : ""}${params.mint ? `, mint ${params.mint.slice(0, 8)}…` : ""}${params.min_sol ? `, ≥ ${params.min_sol} SOL` : ""}):`,
      ...(rows.length ? rows : ["  (no events matched)"]),
      `• History starts 2026-08-17. Poll with since=${data.pagination.next_since ?? "<next_since>"} or subscribe to WS channel token:fee_claims. creator_claim (plain vault claims) is excluded unless asked for.`,
    ].join("\n");

    callback?.({ text: summary, content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me the latest pump.fun creator fee distributions above 1 SOL" } },
      { name: "assistant", content: { text: "Here are the most recent pump.fun fee events..." } },
    ],
  ] as Action["examples"],
};
