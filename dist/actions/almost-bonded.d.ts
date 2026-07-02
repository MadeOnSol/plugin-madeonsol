import type { Action } from "@elizaos/core";
/**
 * Scan pre-bond pump.fun tokens approaching graduation, ranked by velocity.
 * Heuristics pulled from the user prompt: "fast"/"accelerating" → sort by
 * velocity, "soon"/"closest" → sort by ETA, "elite deployer" → deployer_tier.
 */
export declare const almostBondedAction: Action;
