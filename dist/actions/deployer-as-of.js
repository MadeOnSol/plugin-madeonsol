import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const WALLET_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
export const deployerAsOfAction = {
    name: "GET_DEPLOYER_AS_OF",
    description: "A pump.fun deployer's reputation exactly as it stood on a given date from MadeOnSol — the latest write-on-change snapshot at or before it, so an agent backtests without look-ahead bias. Returns is_deployer, requested_date, as_of, and snapshot (or null when nothing existed yet at or before that date — nothing is ever synthesized). date defaults to today and must be >= 2026-04-07. PRO+.",
    similes: [
        "deployer reputation as of a date",
        "deployer point in time",
        "what tier was this deployer on",
        "deployer backtest snapshot",
        "deployer reputation on that day",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(deployer|deploy|bond|bonding|reputation)\b/i.test(text) && /\b(as of|on \d|point.in.time|snapshot)\b/i.test(text) && WALLET_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = message.content?.text || "";
        const wallet = text.match(WALLET_RE)?.[1];
        if (!wallet) {
            callback?.({ text: "Please include a deployer wallet address." });
            return undefined;
        }
        const date = text.match(DATE_RE)?.[1];
        const result = await client.getDeployerAsOf(wallet, date);
        if (result.error) {
            callback?.({ text: result.status === 402
                    ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
                    : `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        if (!data.is_deployer) {
            callback?.({ text: `${wallet.slice(0, 8)}… isn't a tracked deployer.`, content: data });
            return undefined;
        }
        if (!data.as_of || !data.snapshot) {
            callback?.({
                text: `No reputation snapshot for ${wallet.slice(0, 8)}… at or before ${data.requested_date}${data.first_snapshot_date ? ` (tracking began ${data.first_snapshot_date})` : ""}.`,
                content: data,
            });
            return undefined;
        }
        const s = data.snapshot;
        const rate = s.bonding_rate != null ? `${(s.bonding_rate * 100).toFixed(1)}%` : "n/a";
        const summary = [
            `Deployer ${wallet.slice(0, 8)}… as of ${data.requested_date}:`,
            `• Tier ${s.tier ?? "unknown"}, bonding rate ${rate}`,
            s.carried ? `• (state recorded ${s.snapshot_date}, unchanged since)` : `• (recorded that day)`,
        ].join("\n");
        callback?.({ text: summary, content: data });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "What tier was deployer 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU on as of 2026-08-01?" } },
            { name: "assistant", content: { text: "Checking that deployer's reputation as of 2026-08-01..." } },
        ],
    ],
};
