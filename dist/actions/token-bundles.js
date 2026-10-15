import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const WINDOW_RE = /\b(1h|6h|24h)\b/i;
function authError(result) {
    return result.status === 401 || result.status === 402
        ? "This endpoint needs a MadeOnSol API key (PRO+). Set MADEONSOL_API_KEY — https://madeonsol.com/pricing. It is not available with x402 payments."
        : `Error: ${result.error}`;
}
export const tokenBundlesAction = {
    name: "GET_TOKEN_BUNDLES",
    description: "List every coordinated buy cluster on a Solana token from MadeOnSol: slots in a 1h/6h/24h window where at least min_wallets (default 3) distinct wallets bought, the launch bundle and clusters that enter later. Per cluster: slot, time, phase, wallet_count, new_wallets, atomic_txs, SOL volume. Only stored buys count (0.05 SOL / $3.50 floor); summary.baseline shows buys per active slot, so a cluster is evidence, not a verdict. PRO+, API key only.",
    similes: [
        "bundle clusters",
        "coordinated buys",
        "later bundles",
        "new bundles",
        "buy clusters",
        "same slot clusters",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(bundles|clusters?|coordinated buy)/i.test(text) && MINT_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = message.content?.text || "";
        const mint = text.match(MINT_RE)?.[1];
        if (!mint) {
            callback?.({ text: "Please include a token mint address." });
            return undefined;
        }
        const window = text.match(WINDOW_RE)?.[1]?.toLowerCase();
        const result = await client.getTokenBundles(mint, { window, limit: 10 });
        if (result.error) {
            callback?.({ text: authError(result) });
            return undefined;
        }
        const data = result.data;
        const clusters = data?.clusters ?? [];
        if (clusters.length === 0) {
            callback?.({ text: `No coordinated buy clusters on ${mint.slice(0, 8)}… in the last ${data?.window ?? "24h"}.`, content: { ...data } });
            return undefined;
        }
        const s = data?.summary;
        const lines = clusters.slice(0, 10).map((c) => `• ${c.at} (${c.phase}): ${c.wallet_count} wallets, ${c.new_wallets} new, ${c.atomic_txs} atomic tx${c.sol_volume != null ? `, ${c.sol_volume.toFixed(2)} SOL` : ""}`);
        callback?.({
            text: `Buy clusters on ${mint.slice(0, 8)}… (${data?.window ?? "24h"}): ${s?.cluster_count ?? clusters.length} total, ${s?.launch_clusters ?? 0} at launch, ${s?.later_clusters ?? 0} later\n${lines.join("\n")}`,
            content: { ...data },
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Any coordinated buy clusters on 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU in the last 6h?" } },
            { name: "assistant", content: { text: "Here are the buy clusters on that token..." } },
        ],
    ],
};
