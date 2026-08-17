import type { Action, IAgentRuntime, Memory, State, HandlerCallback, Content } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import type { TokenLocks } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(2)}%`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString()}`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "n/a");

export const tokenLocksAction: Action = {
  name: "GET_TOKEN_LOCKS",
  description:
    "Get the token locks & vesting contracts on a Solana mint from MadeOnSol — every on-chain Streamflow stream, Jupiter Lock vesting escrow and Bonfida token-vesting account, decoded from the locker programs' account state, plus a summary. Answers 'did the team lock, how much, until when, and can they pull it'. Each contract: program (streamflow | jupiter_lock | bonfida_vesting), kind (lock = whole amount at one date | vesting = cliff / periodic release), status (active | completed | cancelled | closed — derived at request time), sender / recipient, the schedule (start_at / cliff_at / end_at, period_seconds, continuous, amount_per_period, cliff_amount, perpetual), the terms (cancelable_by_sender — the locker can cancel, so funds are locked against the RECIPIENT not the locker; cancelable_by_recipient, transferable, can_topup) and a LIVE-derived view (locked_*, unlocked_*, withdrawn_*, claimable_*, next_unlock {at, kind cliff|period|final|tranche, amount}). summary: lock_count (exact), complete (false above 5000 contracts — newest 5000 considered), active_count, by_program / by_kind, distinct_lockers, locked / deposited totals (raw, ui, usd, % of supply), unlocking_7d_* / unlocking_30d_* forward schedule, nearest next_unlock, active_cancelable_by_sender. Every *_raw amount is a base-unit digit STRING; ui/usd/pct are null when decimals or price are unknown. LP LOCKS ARE NOT INCLUDED (token/vesting locks only). PRO+ — BASIC receives HTTP 403; keyed API only.",
  similes: [
    "token locks",
    "token vesting",
    "locked tokens",
    "team lock",
    "vesting schedule",
    "is the supply locked",
    "did the team lock",
    "can the team unlock",
    "streamflow lock",
    "jupiter lock",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    return /\b(lock|locks|locked|vesting|vest|vested)\b/i.test(text)
      && !/\b(unlock|unlocks|unlocking|upcoming|fee|fees)\b/i.test(text)
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
    const text = message.content?.text || "";
    const mint = text.match(MINT_RE)?.[1];
    if (!mint) {
      callback?.({ text: "Please include a token mint address." });
      return undefined;
    }
    const status = /\bactive\b/i.test(text) ? "active" : /\bcancell?ed\b/i.test(text) ? "cancelled" : /\bcompleted\b/i.test(text) ? "completed" : undefined;

    const result = await client.getTokenLocks(mint, status ? { status } : undefined);

    if (result.error) {
      callback?.({ text: result.status === 402
        ? "Authentication required. Set MADEONSOL_API_KEY — get one at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
        : result.status === 403
          ? "Token locks are PRO+ — this key's tier does not include them. Upgrade at https://madeonsol.com/pricing."
          : `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as TokenLocks;
    const s = data.summary;
    const sym = data.token?.symbol ? ` (${data.token.symbol})` : "";
    const rows = data.locks.slice(0, 5).map((l) => {
      const who = l.sender ? `${l.sender.slice(0, 6)}…` : "unknown locker";
      const to = l.recipient ? ` → ${l.recipient.slice(0, 6)}…` : "";
      const cancel = l.cancelable_by_sender ? " · CANCELABLE by sender" : "";
      const next = l.next_unlock ? ` · next ${l.next_unlock.kind} ${when(l.next_unlock.at)}` : "";
      return `  ${l.program} ${l.kind} [${l.status}] ${who}${to}: locked ${l.locked ?? l.locked_raw} (${pct(l.locked_pct_of_supply)} of supply, ${usd(l.locked_usd)}), ends ${when(l.end_at)}${next}${cancel}`;
    });
    const summary = [
      `Locks on ${mint.slice(0, 8)}…${sym}: ${s.lock_count} contract(s), ${s.active_count} active, ${s.distinct_lockers} distinct locker(s)${s.complete ? "" : ` (totals cover newest ${s.rows_considered})`}`,
      `• Locked now: ${s.locked ?? s.locked_raw} (${pct(s.locked_pct_of_supply)} of supply, ${usd(s.locked_usd)}) of ${s.deposited ?? s.deposited_raw} deposited`,
      `• Unlocking next 7d: ${s.unlocking_7d ?? s.unlocking_7d_raw} (${pct(s.unlocking_7d_pct_of_supply)}, ${usd(s.unlocking_7d_usd)}) · next 30d: ${s.unlocking_30d ?? s.unlocking_30d_raw} (${pct(s.unlocking_30d_pct_of_supply)}, ${usd(s.unlocking_30d_usd)})`,
      `• Next unlock: ${s.next_unlock ? `${s.next_unlock.kind} at ${when(s.next_unlock.at)} — ${s.next_unlock.amount ?? s.next_unlock.amount_raw} (${usd(s.next_unlock.amount_usd)})` : "none scheduled"}`,
      `• Active contracts the sender can still cancel: ${s.active_cancelable_by_sender} (a cancelable lock is a weaker promise — funds are locked against the recipient, not the locker)`,
      `• LP locks are NOT included — token/vesting locks only.`,
      ...(rows.length ? [`• Top ${rows.length} of ${data.locks.length} returned:`, ...rows] : []),
    ].join("\n");

    // Named interfaces lack the implicit index signature ContentValue wants; the payload is plain JSON.
    callback?.({ text: summary, content: data as unknown as Content });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Did the team lock NUGye8S6CV82ZNrauf5YfXL2xJxvSvfiMAvy2U1sAVk and can they pull it?" } },
      { name: "assistant", content: { text: "Here are the on-chain lock / vesting contracts on that mint and the forward unlock schedule..." } },
    ],
  ] as Action["examples"],
};
