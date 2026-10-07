// COV-36: text rendering for GET_TOKEN_DEPTH. Pure (no imports) so it is unit-
// testable without the ElizaOS runtime. With a concentrated-liquidity depth
// model on (DLMM bins / Raydium CLMM ticks) a quote the loaded window cannot
// fill carries `status` and NULL numbers — render the status, never `null%`,
// and never call toFixed on a null `to_move_price` leg.
const STATUS_TEXT = {
    exceeds_loaded_ticks: "beyond loaded ticks",
    exceeds_loaded_bins: "beyond loaded bins",
    pool_liquidity_exhausted: "pool liquidity exhausted",
    price_out_of_range: "price out of range",
};
/** One quote: "<size> SOL → <impact>%" or "<size> SOL → <status>". */
export function formatDepthQuote(q) {
    if (typeof q.price_impact_pct === "number" && Number.isFinite(q.price_impact_pct) && (q.status == null || q.status === "filled")) {
        return `${q.size_sol} SOL → ${q.price_impact_pct}%`;
    }
    const s = q.status && q.status !== "filled" ? (STATUS_TEXT[q.status] ?? q.status.replace(/_/g, " ")) : "not quotable";
    return `${q.size_sol} SOL → ${s}`;
}
function sol(v) {
    return typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "n/a";
}
/** One pool line for the action's text reply. */
export function formatDepthPoolLine(p) {
    const impacts = p.quotes.map(formatDepthQuote).join(", ");
    const m = p.to_move_price ?? { "1pct": null, "5pct": null, "10pct": null };
    return `• ${p.dex} ${p.pool_address.slice(0, 8)}… — impact: ${impacts}; to move 1%/5%/10%: ${sol(m["1pct"])}/${sol(m["5pct"])}/${sol(m["10pct"])} SOL`;
}
