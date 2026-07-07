import { kolFeedAction } from "./actions/kol-feed.js";
import { kolCoordinationAction } from "./actions/kol-coordination.js";
import { kolLeaderboardAction } from "./actions/kol-leaderboard.js";
import { deployerAlertsAction } from "./actions/deployer-alerts.js";
import { walletTrackerWatchlistAction, walletTrackerTradesAction } from "./actions/wallet-tracker.js";
import { kolTokenEntryOrderAction } from "./actions/kol-token-entry-order.js";
import { kolCompareAction } from "./actions/kol-compare.js";
import { kolAlertsRecentAction } from "./actions/kol-alerts-recent.js";
import { tokenRiskAction } from "./actions/token-risk.js";
import { tokenBundleAction } from "./actions/token-bundle.js";
import { tokenPoolsAction } from "./actions/token-pools.js";
import { deployerHistoryAction } from "./actions/deployer-history.js";
import { tokenCandlesAction } from "./actions/token-candles.js";
import { tokenFlowAction } from "./actions/token-flow.js";
import { meAction } from "./actions/me.js";
import { tokensListAction } from "./actions/tokens-list.js";
import { almostBondedAction } from "./actions/almost-bonded.js";
import { walletStatsAction, walletPnlAction, walletPositionsAction, walletHoldingsAction, walletTradesAction } from "./actions/wallet.js";
import { MadeOnSolClient } from "./client.js";
/** Key used to store the initialized client on the runtime */
export const MADEONSOL_CLIENT_KEY = "madeonsol:client";
export const madeOnSolPlugin = {
    name: "madeonsol",
    description: "Query Solana KOL trading intelligence and deployer analytics from MadeOnSol. Tracks 1,000+ KOL wallets and 15,500+ Pump.fun deployers.",
    actions: [
        kolFeedAction,
        kolCoordinationAction,
        kolLeaderboardAction,
        deployerAlertsAction,
        walletTrackerWatchlistAction,
        walletTrackerTradesAction,
        kolTokenEntryOrderAction,
        kolCompareAction,
        kolAlertsRecentAction,
        tokenRiskAction,
        tokenBundleAction,
        tokenPoolsAction,
        deployerHistoryAction,
        tokenCandlesAction,
        tokenFlowAction,
        meAction,
        tokensListAction,
        almostBondedAction,
        walletStatsAction,
        walletPnlAction,
        walletPositionsAction,
        walletHoldingsAction,
        walletTradesAction,
    ],
    /**
     * Initialize the MadeOnSol client.
     * Auth priority: MADEONSOL_API_KEY > SVM_PRIVATE_KEY (x402).
     * Get a free `msk_` API key at madeonsol.com/pricing — no wallet needed.
     *
     * v1.0 breaking change: RAPIDAPI_KEY support has been removed
     * (MadeOnSol RapidAPI marketplace was retired 2026-04-19).
     */
    init: async (_config, runtime) => {
        const baseUrl = String(runtime.getSetting?.("MADEONSOL_API_URL") || "https://madeonsol.com");
        const apiKey = runtime.getSetting?.("MADEONSOL_API_KEY");
        const privateKey = runtime.getSetting?.("SVM_PRIVATE_KEY");
        let fetchFn;
        if (apiKey) {
            console.log("[madeonsol] Using MadeOnSol API key (Bearer auth)");
        }
        else if (privateKey) {
            try {
                const { wrapFetchWithPayment } = await import("@x402/fetch");
                const { x402Client } = await import("@x402/core/client");
                const { ExactSvmScheme } = await import("@x402/svm/exact/client");
                const { createKeyPairSignerFromBytes } = await import("@solana/kit");
                const { base58 } = await import("@scure/base");
                const signer = await createKeyPairSignerFromBytes(base58.decode(privateKey));
                const client = new x402Client();
                client.register("solana:*", new ExactSvmScheme(signer));
                fetchFn = wrapFetchWithPayment(fetch, client);
                console.log(`[madeonsol] x402 payments enabled, wallet: ${signer.address}`);
            }
            catch (err) {
                console.warn("[madeonsol] x402 payment setup failed:", err);
            }
        }
        else {
            console.warn("[madeonsol] No auth configured — every API call will fail.\n" +
                "  → Get a free MADEONSOL_API_KEY (200 req/day, no card) at https://madeonsol.com/pricing\n" +
                "  → Or set SVM_PRIVATE_KEY for x402 micropayments.");
        }
        const madeOnSolClient = new MadeOnSolClient({ baseUrl, apiKey, fetchFn });
        runtime[MADEONSOL_CLIENT_KEY] = madeOnSolClient;
    },
};
export default madeOnSolPlugin;
export { MadeOnSolClient } from "./client.js";
export { kolFeedAction, kolCoordinationAction, kolLeaderboardAction, deployerAlertsAction };
export { walletTrackerWatchlistAction, walletTrackerTradesAction };
export { kolTokenEntryOrderAction, kolCompareAction, kolAlertsRecentAction, tokenRiskAction, tokenBundleAction, tokenPoolsAction, deployerHistoryAction, tokenCandlesAction, tokenFlowAction };
export { meAction, tokensListAction, almostBondedAction };
export { walletStatsAction, walletPnlAction, walletPositionsAction, walletHoldingsAction, walletTradesAction };
