export type DepthQuote = {
    size_sol: number;
    price_impact_pct: number | null;
    status?: string;
};
export type DepthPool = {
    pool_address: string;
    dex: string;
    quotes: DepthQuote[];
    to_move_price: {
        "1pct": number | null;
        "5pct": number | null;
        "10pct": number | null;
    };
};
/** One quote: "<size> SOL → <impact>%" or "<size> SOL → <status>". */
export declare function formatDepthQuote(q: DepthQuote): string;
/** One pool line for the action's text reply. */
export declare function formatDepthPoolLine(p: DepthPool): string;
