import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;

const pct = (n: unknown) => (typeof n === "number" ? `${(n * 100).toFixed(0)}%` : "?");
const usd = (n: unknown) => (typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "?");

type Row = Record<string, unknown>;

/**
 * One action over the whole deployer-reputation surface — leaderboard, chain
 * stats, a single profile, that deployer's tokens, alert-volume stats, best
 * recent tokens, and fresh graduations. Routed by intent because these are all
 * "how good is this deployer / who are the good ones" questions.
 */
export const deployerHunterAction: Action = {
  name: "GET_DEPLOYER_HUNTER",
  description:
    "Pump.fun deployer reputation from MadeOnSol — the leaderboard of graded deployers, chain-wide deployer stats, a single deployer's profile and launch history, alert-volume stats with per-tier market-cap-multiplier distributions, the best recent tokens from ranked deployers, and fresh graduations. Compare bonding_rate (lifetime) against recent_bond_rate (rolling) — the gap is the signal. PRO+.",
  similes: [
    "deployer leaderboard",
    "best pump.fun deployers",
    "deployer reputation",
    "deployer profile",
    "tokens by this deployer",
    "recently bonded tokens",
    "deployer stats",
    "top deployers",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    if (!/\b(deployer|deployers|bonded|bonding|graduat)/.test(text)) return false;
    // The dedicated history/trajectory actions own those two intents.
    if (/\b(history|time series|over time|trajectory|streak)\b/.test(text)) return false;
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const client = getClient(runtime);
    const raw = message.content?.text || "";
    const text = raw.toLowerCase();
    const wallet = raw.match(WALLET_RE)?.[1];

    const fail = (e: unknown) => {
      callback?.({ text: `Could not reach the deployer-hunter API: ${(e as Error).message}` });
      return undefined;
    };

    try {
      // Single deployer — profile, or its token list when asked for launches.
      if (wallet) {
        if (/\b(tokens?|launches|launched|deployed|coins?)\b/.test(text)) {
          const d = (await client.getDeployerTokens(wallet, { limit: 25 })) as Row;
          const tokens = (d.tokens as Row[]) ?? [];
          if (!tokens.length) {
            callback?.({ text: `No tokens recorded for deployer ${wallet.slice(0, 8)}….`, content: d as unknown as Record<string, never> });
            return undefined;
          }
          const rows = tokens.slice(0, 15).map((t) =>
            `  ${(t.symbol as string) || (t.mint as string).slice(0, 8)} — ${t.bonded ? "bonded" : "not bonded"}${t.peak_market_cap_usd ? `, peak ${usd(t.peak_market_cap_usd)}` : ""}`,
          );
          callback?.({
            text: [`Tokens deployed by ${wallet.slice(0, 8)}… (${d.count} of ${d.total}):`, ...rows].join("\n"),
            content: d as unknown as Record<string, never>,
          });
          return undefined;
        }

        const p = (await client.getDeployerProfile(wallet)) as Row;
        // An untracked wallet answers 200 with zeroed counters — say so plainly
        // rather than reporting "0% bond rate" as if it were a track record.
        if (!p.total_deployed) {
          callback?.({
            text: `${wallet.slice(0, 8)}… has no recorded Pump.fun deploys — it is not a tracked deployer (the API returns an empty profile rather than a 404).`,
            content: p as unknown as Record<string, never>,
          });
          return undefined;
        }
        const lines = [
          `Deployer ${wallet.slice(0, 8)}… — tier ${p.tier}`,
          `Bond rate ${pct(p.bonding_rate)} lifetime vs ${pct(p.recent_bond_rate)} recent · ${p.total_bonded}/${p.total_deployed} bonded`,
        ];
        if (typeof p.runner_rate === "number") {
          const labeled = (p.labeled_tokens as number) ?? 0;
          lines.push(
            labeled >= 3
              ? `Runner rate ${pct(p.runner_rate)} across ${labeled} labeled tokens`
              : `Runner rate ${pct(p.runner_rate)} — only ${labeled} labeled token(s), too few to be meaningful`,
          );
        }
        if (p.avg_time_to_bond_minutes) lines.push(`Average time to bond: ${p.avg_time_to_bond_minutes} min`);
        callback?.({ text: lines.join("\n"), content: p as unknown as Record<string, never> });
        return undefined;
      }

      // Fresh graduations.
      if (/\b(recent bonds?|just bonded|recently bonded|new graduat|fresh graduat)/.test(text)) {
        const d = (await client.getDeployerRecentBonds({ limit: 15 })) as Row;
        const tokens = (d.tokens as Row[]) ?? [];
        const rows = tokens.slice(0, 12).map((t) => {
          const dep = (t.deployers as Row) ?? {};
          return `  ${(t.token_symbol as string) || (t.token_mint as string).slice(0, 8)} — bonded in ${t.time_to_bond_minutes ?? "?"}min, peak ${usd(t.peak_market_cap)} [${dep.tier ?? "?"}]`;
        });
        const out = [`Recently bonded tokens from tracked deployers:`, ...rows];
        if (d.next_since) out.push(`Poll forward with since=${d.next_since}`);
        callback?.({ text: out.join("\n"), content: d as unknown as Record<string, never> });
        return undefined;
      }

      // Best performers.
      if (/\b(best|top performing|biggest|highest multiple|best tokens?)\b/.test(text)) {
        const d = (await client.getDeployerBestTokens({ limit: 10 })) as Row;
        const tokens = (d.tokens as Row[]) ?? [];
        const rows = tokens.slice(0, 10).map((t) =>
          `  ${(t.token_symbol as string) || (t.token_mint as string).slice(0, 8)} — peak ${usd(t.peak_market_cap)}${t.mc_multiplier ? ` (${(t.mc_multiplier as number).toFixed(1)}×)` : ""} [${t.deployer_tier}]`,
        );
        callback?.({ text: [`Best tokens from ranked deployers (${d.period}):`, ...rows].join("\n"), content: d as unknown as Record<string, never> });
        return undefined;
      }

      // Alert-volume + multiplier distribution.
      if (/\b(alert stats|alert volume|how often|multiplier|10x|hit rate)\b/.test(text)) {
        const d = (await client.getDeployerAlertStats()) as Row;
        const br = (d.bond_rate as Row) ?? {};
        const m = (d.multiplier as Row) ?? {};
        callback?.({
          text: [
            `Deployer alert stats (${d.period}):`,
            `  ${br.total_bonded}/${br.total_deploys} deploys bonded (${pct(br.rate)})`,
            `  Of ${m.total_with_mc} with market caps: ${m.pct_2x}% 2×, ${m.pct_5x}% 5×, ${m.pct_10x}% 10×, ${m.pct_50x}% 50×`,
            `  Average multiple ${typeof m.avg_multiplier === "number" ? m.avg_multiplier.toFixed(1) : "?"}×, best ${typeof m.best_multiplier === "number" ? m.best_multiplier.toFixed(1) : "?"}×`,
          ].join("\n"),
          content: d as unknown as Record<string, never>,
        });
        return undefined;
      }

      // Chain-wide stats.
      if (/\b(chain|ecosystem|overall|how many deployers|stats)\b/.test(text) && !/leaderboard|best|top/.test(text)) {
        const d = (await client.getDeployerStats()) as Row;
        const tiers = (d.tiers as Row) ?? {};
        callback?.({
          text: [
            `Deployer ecosystem: ${d.tracked_count} tracked, ${d.bonds_detected} bonds detected, chain bond rate ${pct(d.bond_rate)}`,
            `  Tiers — elite ${tiers.elite}, good ${tiers.good}, rising ${tiers.rising}`,
            `  Signals today: ${d.signals_today}`,
          ].join("\n"),
          content: d as unknown as Record<string, never>,
        });
        return undefined;
      }

      // Default: the leaderboard.
      const sort = /\brecent\b/.test(text) ? "recent" : /\btotal\b/.test(text) ? "total_bonded" : "bonding_rate";
      const tier = /\belite\b/.test(text) ? "elite" : /\bgood\b/.test(text) ? "good" : /\brising\b/.test(text) ? "rising" : undefined;
      const d = (await client.getDeployerLeaderboard({ sort, tier, limit: 15 })) as Row;
      const deployers = (d.deployers as Row[]) ?? [];
      const rows = deployers.slice(0, 12).map((x, i) =>
        `${i + 1}. ${(x.wallet_address as string).slice(0, 8)}… [${x.tier}] — ${pct(x.bonding_rate)} lifetime / ${pct(x.recent_bond_rate)} recent, ${x.total_bonded}/${x.total_tokens_deployed} bonded`,
      );
      callback?.({
        text: [`Deployer leaderboard (sort: ${sort}${tier ? `, tier: ${tier}` : ""}, ${d.total} ranked):`, ...rows].join("\n"),
        content: d as unknown as Record<string, never>,
      });
      return undefined;
    } catch (e) {
      return fail(e);
    }
  },

  examples: [
    [
      { name: "user1", content: { text: "Show me the top pump.fun deployers." } },
      { name: "assistant", content: { text: "Here is the deployer leaderboard..." } },
    ],
    [
      { name: "user1", content: { text: "What tokens has that deployer launched?" } },
      { name: "assistant", content: { text: "Here are the tokens from that deployer..." } },
    ],
  ] as Action["examples"],
};
