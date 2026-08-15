import type { Action } from "@elizaos/core";
/**
 * One action over the whole deployer-reputation surface — leaderboard, chain
 * stats, a single profile, that deployer's tokens, alert-volume stats, best
 * recent tokens, and fresh graduations. Routed by intent because these are all
 * "how good is this deployer / who are the good ones" questions.
 */
export declare const deployerHunterAction: Action;
