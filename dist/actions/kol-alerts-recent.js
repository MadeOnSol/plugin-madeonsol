import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
export const kolAlertsRecentAction = {
    name: "GET_KOL_ALERTS_RECENT",
    description: "Get live KOL alerts from MadeOnSol — consensus clusters, fresh-token KOL buys, and heating-up wallets in one unified stream.",
    similes: [
        "kol alerts",
        "recent alerts",
        "kol signals",
        "whats happening now",
        "live kol feed",
    ],
    validate: async (_runtime, message) => {
        const text = (message.content?.text || "").toLowerCase();
        return /\b(kol|smart money)\b/.test(text) && /\b(alert|signal|recent|live|now)\b/.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const text = (message.content?.text || "").toLowerCase();
        const window = text.includes("24h") ? "24h" : text.includes("6h") ? "6h" : text.includes("1h") ? "1h" : "6h";
        const result = await client.getKolAlertsRecent({ window, limit: "20" });
        if (result.error) {
            callback?.({ text: result.status === 402
                    ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
                    : `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        const lines = (data.alerts || []).slice(0, 10).map((a) => {
            const subject = a.token_symbol || a.kol_name || "—";
            return `[${a.severity}] ${a.type}: ${subject}`;
        });
        callback?.({
            text: `KOL alerts (${window}):\n${lines.join("\n") || "No alerts in window."}`,
            content: data,
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "What are the recent KOL alerts?" } },
            { name: "assistant", content: { text: "Here are the live KOL alerts..." } },
        ],
    ],
};
