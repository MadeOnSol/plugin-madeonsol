import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "@elizaos/core";
import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";

function getClient(runtime: IAgentRuntime): MadeOnSolClient {
  return ((runtime as unknown as Record<string, unknown>)[MADEONSOL_CLIENT_KEY] as MadeOnSolClient) ?? new MadeOnSolClient();
}

// Base58 wallet matcher — pulls a 32-44 char base58 string out of natural language.
const WALLET_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

function extractWallet(text: string): string | null {
  const m = text.match(WALLET_RE);
  return m ? m[0] : null;
}

export const walletStatsAction: Action = {
  name: "WALLET_STATS",
  description:
    "Get aggregate stats + cross-product flags (is_kol, is_alpha_tracked with bot_confidence, is_deployer) for any Solana wallet over the last 90 days. Works on any wallet — not just curated KOLs.",
  similes: [
    "wallet stats",
    "wallet info",
    "wallet profile",
    "check wallet",
    "is this wallet a kol",
    "is this wallet a deployer",
    "how many trades has this wallet made",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    if (!extractWallet(text)) return false;
    return /\b(wallet|address)\b/i.test(text) && /\b(stat|info|profile|check|details|about)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const wallet = extractWallet(message.content?.text || "");
    if (!wallet) {
      callback?.({ text: "Couldn't find a Solana wallet address in your message." });
      return undefined;
    }

    const client = getClient(runtime);
    const result = await client.getWalletStats(wallet);
    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      address: string;
      stats: { total_trades: number; buys: number; sells: number; bought_sol: number; sold_sol: number; unique_tokens: number; first_seen: string; last_seen: string } | null;
      flags: { is_kol: boolean; kol_name: string | null; is_alpha_tracked: boolean; bot_confidence: number | null; alpha_win_rate: number | null; is_deployer: boolean };
    };

    const flagSummary: string[] = [];
    if (data.flags.is_kol) flagSummary.push(`KOL${data.flags.kol_name ? ` (${data.flags.kol_name})` : ""}`);
    if (data.flags.is_alpha_tracked && data.flags.alpha_win_rate != null) {
      flagSummary.push(`alpha (${(data.flags.alpha_win_rate * 100).toFixed(0)}% wr)`);
    }
    if (data.flags.bot_confidence != null && data.flags.bot_confidence > 0.5) {
      flagSummary.push(`likely bot (${(data.flags.bot_confidence * 100).toFixed(0)}% conf)`);
    }
    if (data.flags.is_deployer) flagSummary.push("deployer");

    const tradeSummary = data.stats
      ? `${data.stats.total_trades} trades across ${data.stats.unique_tokens} tokens · ${data.stats.bought_sol.toFixed(1)} SOL in / ${data.stats.sold_sol.toFixed(1)} SOL out (90d)`
      : "no recorded trades in the 90d window";

    const flagsText = flagSummary.length ? `Flags: ${flagSummary.join(" · ")}\n` : "";

    callback?.({
      text: `${data.address.slice(0, 8)}…${data.address.slice(-4)}\n${flagsText}${tradeSummary}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Get stats for wallet ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk" } },
      { name: "assistant", content: { text: "Here's the wallet profile..." } },
    ],
  ] as Action["examples"],
};

export const walletPnlAction: Action = {
  name: "WALLET_PNL",
  description:
    "Get full FIFO cost-basis PnL for any Solana wallet — realized + unrealized SOL, profit factor, max drawdown, hold time stats, closed positions sorted by pnl desc, and open positions with live unrealized P&L. Works on any wallet, not just curated KOLs.",
  similes: [
    "wallet pnl",
    "wallet profit",
    "wallet loss",
    "is this wallet profitable",
    "how much did this wallet make",
    "wallet performance",
    "win rate of this wallet",
    "best trades of this wallet",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    if (!extractWallet(text)) return false;
    return /\b(pnl|profit|loss|winrate|win.rate|performance|best.trade)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const wallet = extractWallet(message.content?.text || "");
    if (!wallet) {
      callback?.({ text: "Couldn't find a Solana wallet address in your message." });
      return undefined;
    }

    const client = getClient(runtime);
    const result = await client.getWalletPnl(wallet);
    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      address: string;
      summary: { realized_sol: number; unrealized_sol: number; total_pnl_sol: number; wins: number; losses: number; win_rate: number | null; profit_factor: number | null; max_drawdown_sol: number; avg_hold_minutes: number | null; open_positions_count: number; closed_positions_count: number };
      closed_positions: Array<{ token_mint: string; pnl_sol: number; roi_pct: number | null; hold_minutes: number | null; result: string }>;
    };
    const s = data.summary;

    const winRateStr = s.win_rate != null ? `${(s.win_rate * 100).toFixed(0)}%` : "—";
    const pfStr = s.profit_factor != null ? s.profit_factor.toFixed(2) : "—";
    const holdStr = s.avg_hold_minutes != null ? `${s.avg_hold_minutes}m` : "—";

    const topWinners = data.closed_positions.slice(0, 3).filter((p) => p.pnl_sol > 0);
    const winnerLines = topWinners.map(
      (p) => `  ${p.token_mint.slice(0, 6)}… +${p.pnl_sol.toFixed(2)} SOL (${p.roi_pct?.toFixed(0) ?? "?"}% ROI, ${p.hold_minutes ?? "?"}m hold)`,
    );

    const lines = [
      `${data.address.slice(0, 8)}…${data.address.slice(-4)} — 90d PnL`,
      `Realized: ${s.realized_sol >= 0 ? "+" : ""}${s.realized_sol.toFixed(2)} SOL · Unrealized: ${s.unrealized_sol >= 0 ? "+" : ""}${s.unrealized_sol.toFixed(2)} SOL`,
      `Win rate: ${winRateStr} (${s.wins}W / ${s.losses}L) · Profit factor: ${pfStr} · Avg hold: ${holdStr}`,
      `Max drawdown: ${s.max_drawdown_sol.toFixed(2)} SOL · Open: ${s.open_positions_count} · Closed: ${s.closed_positions_count}`,
    ];
    if (winnerLines.length) lines.push("Top winners:", ...winnerLines);

    callback?.({ text: lines.join("\n"), content: data });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What's the PnL for ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk?" } },
      { name: "assistant", content: { text: "Here's the wallet's 90-day PnL..." } },
    ],
  ] as Action["examples"],
};

export const walletPositionsAction: Action = {
  name: "WALLET_POSITIONS",
  description:
    "List open positions for any Solana wallet with live unrealized P&L from the market-cap tracker. Lighter slice of WALLET_PNL — use when you only need the bags, not the full performance summary.",
  similes: [
    "wallet positions",
    "what is this wallet holding",
    "open bags",
    "current positions",
    "what tokens does this wallet own",
    "wallet bags",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    if (!extractWallet(text)) return false;
    return /\b(position|bag|holding|holds|owns|hold)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const wallet = extractWallet(message.content?.text || "");
    if (!wallet) {
      callback?.({ text: "Couldn't find a Solana wallet address in your message." });
      return undefined;
    }

    const client = getClient(runtime);
    const result = await client.getWalletPositions(wallet);
    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      address: string;
      positions: Array<{ token_mint: string; cost_basis_sol: number; current_value_sol: number | null; unrealized_sol: number | null; unrealized_pct: number | null }>;
    };

    if (!data.positions || data.positions.length === 0) {
      callback?.({ text: `${data.address.slice(0, 8)}… has no open positions in the 90-day window.`, content: data });
      return undefined;
    }

    // Top 10 by absolute cost basis
    const top = [...data.positions]
      .sort((a, b) => b.cost_basis_sol - a.cost_basis_sol)
      .slice(0, 10);

    const lines = top.map((p) => {
      const u = p.unrealized_sol;
      const tag = u == null ? "?" : u > 0 ? `+${u.toFixed(2)} (${p.unrealized_pct?.toFixed(0)}%)` : `${u.toFixed(2)} (${p.unrealized_pct?.toFixed(0)}%)`;
      return `  ${p.token_mint.slice(0, 8)}… cost ${p.cost_basis_sol.toFixed(2)} SOL · unrealized ${tag} SOL`;
    });

    callback?.({
      text: `${data.address.slice(0, 8)}… — ${data.positions.length} open position(s)\nTop ${top.length}:\n${lines.join("\n")}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What is wallet ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk holding?" } },
      { name: "assistant", content: { text: "Open positions..." } },
    ],
  ] as Action["examples"],
};

export const walletHoldingsAction: Action = {
  name: "WALLET_HOLDINGS",
  description:
    "Verified CURRENT on-chain holdings for any Solana wallet — the wallet's actual SPL + Token-2022 token accounts and SOL balance read straight from chain, enriched with price/MC/name/symbol, plus transfer_delta (on-chain amount − trade-derived net position, exposing non-swap flows like airdrops, insider funding, wallet-hopping). Distinct from WALLET_POSITIONS (trade-derived FIFO) — this is what the wallet actually holds right now. ULTRA only.",
  similes: [
    "wallet holdings",
    "current holdings",
    "on-chain holdings",
    "what does this wallet actually hold",
    "verified holdings",
    "wallet balances",
    "wallet token balances",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    if (!extractWallet(text)) return false;
    return /\b(holding|holdings|balance|balances|on.?chain|actually hold)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const wallet = extractWallet(message.content?.text || "");
    if (!wallet) {
      callback?.({ text: "Couldn't find a Solana wallet address in your message." });
      return undefined;
    }

    const client = getClient(runtime);
    const result = await client.getWalletHoldings(wallet);
    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      address: string;
      sol_balance: number;
      holdings: Array<{ mint: string; symbol: string | null; name: string | null; amount: number; value_usd: number | null; transfer_delta: number | null }>;
      summary: { token_accounts: number; non_zero: number; returned: number; priced: number; total_value_usd: number; truncated: boolean };
    };

    if (!data.holdings || data.holdings.length === 0) {
      callback?.({ text: `${data.address.slice(0, 8)}… holds ${data.sol_balance?.toFixed(2) ?? "?"} SOL and no priced token holdings.`, content: data });
      return undefined;
    }

    // Top 10 by USD value
    const top = [...data.holdings]
      .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0))
      .slice(0, 10);

    const lines = top.map((h) => {
      const label = h.symbol || h.mint.slice(0, 8) + "…";
      const val = h.value_usd != null ? `$${h.value_usd.toFixed(0)}` : "unpriced";
      const delta = h.transfer_delta != null && Math.abs(h.transfer_delta) > 0 ? ` · Δ ${h.transfer_delta > 0 ? "+" : ""}${h.transfer_delta.toFixed(2)}` : "";
      return `  ${label}  ${h.amount.toFixed(2)} (${val})${delta}`;
    });

    callback?.({
      text: `${data.address.slice(0, 8)}… — ${data.sol_balance?.toFixed(2) ?? "?"} SOL + ${data.summary.non_zero} token holding(s), total $${data.summary.total_value_usd?.toFixed(0) ?? "?"}\nTop ${top.length}:\n${lines.join("\n")}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "What does wallet ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk actually hold on-chain?" } },
      { name: "assistant", content: { text: "Current on-chain holdings..." } },
    ],
  ] as Action["examples"],
};

export const walletTradesAction: Action = {
  name: "WALLET_TRADES",
  description:
    "Get recent raw trades for any Solana wallet over the last 90 days. Filterable by action (buy/sell). Returns up to 50 most recent trades; use cursor pagination for more.",
  similes: [
    "wallet trades",
    "wallet history",
    "wallet activity",
    "recent trades",
    "what did this wallet trade",
    "wallet swaps",
  ],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text || "";
    if (!extractWallet(text)) return false;
    return /\b(trade|swap|activity|history|recent)\b/i.test(text);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: unknown,
    callback?: HandlerCallback,
  ) => {
    const text = message.content?.text || "";
    const wallet = extractWallet(text);
    if (!wallet) {
      callback?.({ text: "Couldn't find a Solana wallet address in your message." });
      return undefined;
    }

    const client = getClient(runtime);
    const lc = text.toLowerCase();
    const action = lc.includes("buy") && !lc.includes("buys and sells") ? "buy" : lc.includes("sell") ? "sell" : undefined;

    const result = await client.getWalletTrades(wallet, { limit: 50, ...(action ? { action } : {}) });
    if (result.error) {
      callback?.({ text: `Error: ${result.error}` });
      return undefined;
    }

    const data = result.data as {
      address: string;
      trades: Array<{ token_mint: string; action: string; sol_amount: number; token_amount: number; traded_at: string; tx_signature: string }>;
      has_more: boolean;
    };

    if (!data.trades || data.trades.length === 0) {
      callback?.({ text: `No trades found for ${data.address.slice(0, 8)}… (90-day window).`, content: data });
      return undefined;
    }

    const lines = data.trades.slice(0, 15).map((t) =>
      `  ${t.traded_at.slice(0, 16).replace("T", " ")}  ${t.action.toUpperCase()}  ${t.sol_amount.toFixed(2)} SOL  →  ${t.token_mint.slice(0, 8)}…`,
    );

    callback?.({
      text: `${data.address.slice(0, 8)}… — ${data.trades.length} recent ${action ?? "trade"}(s)${data.has_more ? " (more available)" : ""}:\n${lines.join("\n")}`,
      content: data,
    });
    return undefined;
  },

  examples: [
    [
      { name: "user1", content: { text: "Show recent buys for ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk" } },
      { name: "assistant", content: { text: "Here are the recent buys..." } },
    ],
  ] as Action["examples"],
};
