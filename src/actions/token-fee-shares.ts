import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenFeeShares } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const pctOf = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");

export const tokenFeeSharesAction: Action = {
  name: "GET_TOKEN_FEE_SHARES",
  description:
    "Get the pump.fun creator-fee SHARING config of a coin from MadeOnSol — who receives what share of its creator fees. Decodes the on-chain SharingConfig of the pump_fees program (PDA ['sharing-config', mint]): admin, status, shareholders[] with share_bps / share_pct, is_admin (the config admin, normally the coin creator), is_social_pda (the address is a pump_fees SocialFeePda — fees earmarked for a platform identity such as an X account: social.platform 2 = X, social.user_id = the platform-native NUMERIC id, not the handle, lifetime_claimed), and per-recipient received totals; redirected_bps (share going to non-admin addresses), social_bps, is_default:true = 100% to the creator (a REAL answer, not 'no data'), source 'stream' (our table — only non-default configs are stored) or 'chain' (live PDA read; config null + config_error only if every RPC endpoint failed). Plus distributions rollup (count, total, recipients, past_recipients no longer in the split), history[] (config created / updated / reset, creator transferred — newest first) and recent_distributions[]. Amounts are quote base units (SOL lamports unless a stable-quoted coin) as digit STRINGS; usd null when unknown. EVENT HISTORY STARTS 2026-08-17 — the config itself is current on-chain state. PRO+ — BASIC receives HTTP 403; keyed API only.",
  similes: [
    "fee shares",
    "creator fee sharing",
    "who gets the creator fees",
    "fee split",
    "sharing config",
    "creator fee recipients",
    "fees redirected",
    "pump fun fee sharing",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(fee|fees)\b/i.test(text)
      && /\b(shar(e|es|ed|ing)|split|recipients?|redirect(ed)?|config|who gets|goes? to)\b/i.test(text)
      && MINT_RE.test(text);
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
      callback?.({ text: "Please include a pump.fun coin mint address." });
      return undefined;
    }

    const result = await client.getTokenFeeShares(mint);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : result.status === 403
          ? "Fee sharing is PRO+ — this key's tier does not include it. Upgrade at https://madeonsol.com/pricing."
          : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenFeeShares;
    const c = data.config;
    const lines: string[] = [];
    if (!c) {
      lines.push(`Fee sharing for ${mint.slice(0, 8)}…: config could not be read (${data.config_error ?? "unknown error"}) — PDA ${data.config_pda}.`);
    } else if (c.is_default) {
      lines.push(`Fee sharing for ${mint.slice(0, 8)}…: DEFAULT config — 100% of creator fees go to the admin/creator ${c.admin ? c.admin.slice(0, 6) + "…" : ""} (source: ${c.source}). Nothing is redirected.`);
    } else {
      lines.push(`Fee sharing for ${mint.slice(0, 8)}…: ${c.shareholders.length} shareholder(s), ${(c.redirected_pct ?? 0).toFixed(2)}% redirected away from the admin, ${(c.social_pct ?? 0).toFixed(2)}% to social identities (source: ${c.source}, status ${c.status ?? "n/a"})`);
      for (const sh of c.shareholders.slice(0, 8)) {
        const tag = sh.is_admin ? " [admin]" : sh.is_social_pda ? ` [social${sh.social ? `: ${sh.social.platform_label ?? `platform_${sh.social.platform}`} id ${sh.social.user_id}` : ""}]` : "";
        lines.push(`  ${sh.address.slice(0, 6)}…${tag}: ${pctOf(sh.share_pct)} — received ${sh.received ?? sh.received_raw} ${data.quote.symbol} (${usd(sh.received_usd)}) over ${sh.payout_count} payout(s)`);
      }
    }
    const d = data.distributions;
    lines.push(`• Distributions since 2026-08-17: ${d.count} payout(s), ${d.total ?? d.total_raw} ${data.quote.symbol} (${usd(d.total_usd)}), last ${when(d.last_at)}${d.payouts_truncated ? " (rollup truncated)" : ""}`);
    if (d.past_recipients?.length) lines.push(`• Past recipients no longer in the split: ${d.past_recipients.length}`);
    lines.push(`• Config change log entries: ${data.history.length} (history starts 2026-08-17)`);

    callback?.({ text: lines.join("\n"), content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Who gets the creator fees of E2rQLGJxb1pq4u4AoXSAmqTbspupMXfgfbJsXU5npump — is the fee split redirected?" } },
      { name: "assistant", content: { text: "Here is the on-chain pump.fun fee-sharing config for that coin..." } },
    ],
  ] as Action["examples"],
};
