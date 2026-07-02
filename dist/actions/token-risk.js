import { MadeOnSolClient } from "../client.js";
import { MADEONSOL_CLIENT_KEY } from "../index.js";
function getClient(runtime) {
    return runtime[MADEONSOL_CLIENT_KEY] ?? new MadeOnSolClient();
}
const MINT_RE = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/;
export const tokenRiskAction = {
    name: "GET_TOKEN_RISK",
    description: "Get a transparent 0–100 rug-risk/safety score for a Solana token from MadeOnSol (higher = riskier). Returns a band (safe/caution/danger) and an explainable factors breakdown. PRO+.",
    similes: [
        "token risk",
        "is this a rug",
        "rug risk",
        "safety score",
        "how safe is this token",
        "risk score",
    ],
    validate: async (_runtime, message) => {
        const text = message.content?.text || "";
        return /\b(risk|rug|safe|safety|danger)\b/i.test(text) && MINT_RE.test(text);
    },
    handler: async (runtime, message, _state, _options, callback) => {
        const client = getClient(runtime);
        const mint = (message.content?.text || "").match(MINT_RE)?.[1];
        if (!mint) {
            callback?.({ text: "Please include a token mint address." });
            return undefined;
        }
        const result = await client.getTokenRisk(mint);
        if (result.error) {
            callback?.({ text: result.status === 402
                    ? "Authentication required. Set MADEONSOL_API_KEY — free at https://madeonsol.com/pricing — or SVM_PRIVATE_KEY."
                    : `Error: ${result.error}` });
            return undefined;
        }
        const data = result.data;
        const lines = (data.factors || [])
            .filter((f) => f.status !== "ok")
            .map((f) => `• ${f.label} [${f.status}] — ${f.detail}`);
        callback?.({
            text: `Risk score for ${mint.slice(0, 8)}…: ${data.risk_score}/100 (${data.band})${lines.length ? `\n${lines.join("\n")}` : ""}`,
            content: data,
        });
        return undefined;
    },
    examples: [
        [
            { name: "user1", content: { text: "Is 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU a rug? Check the risk score." } },
            { name: "assistant", content: { text: "Here's the rug-risk score for that token..." } },
        ],
    ],
};
