/**
 * Gotcha registry — HIGHEST PRIORITY skill file.
 *
 * Read this before every solve. Updated after every non-AC run.
 * The harness's accumulated institutional memory.
 */

import type { GotchaRecord, ProblemDomain } from "../types.js";

export const INITIAL_GOTCHAS: GotchaRecord[] = [
	{
		id: "cpp-int-overflow",
		domain: "math",
		subDomain: "*",
		pattern: "int overflow when multiplying two ints before assigning to long long",
		example: "long long ans = a * b; // WRONG if a,b are int and a*b > INT_MAX",
		fix: "long long ans = (long long)a * b;",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "cpp-cin-sync",
		domain: "*",
		subDomain: "*",
		pattern: "cin/cout without sync disable causes TLE on large I/O",
		example: "Reading 1e6 ints with cin without ios::sync_with_stdio(false)",
		fix: "ios::sync_with_stdio(false); cin.tie(nullptr); // at top of main()",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "graph-negative-dijkstra",
		domain: "graph",
		subDomain: "shortest-path",
		pattern: "Dijkstra used on graph with negative edge weights",
		example: "Applying Dijkstra when constraints say -10^9 ≤ w ≤ 10^9",
		fix: "Use Bellman-Ford or SPFA for negative weights. Check constraints for sign.",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "dp-modular-arithmetic",
		domain: "dp",
		subDomain: "*",
		pattern: "DP counting problem: forgot to apply MOD at each step",
		example: "dp[i] = dp[i-1] + dp[i-2]; // overflows for n > 40 without MOD",
		fix: "dp[i] = (dp[i-1] + dp[i-2]) % MOD;",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "python-recursion-limit",
		domain: "dp",
		subDomain: "*",
		pattern: "Python default recursion limit (1000) exceeded by deep DFS/memoization",
		example: "Recursive DFS on n=1e5 node tree in Python without setrecursionlimit",
		fix: "import sys; sys.setrecursionlimit(300000) — add at top of every recursive Python solution",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "geometry-floating-point",
		domain: "geometry",
		subDomain: "*",
		pattern: "Exact == comparison of floating point values causes WA",
		example: "if (dist == 0) // fails for dist = 1e-16",
		fix: "Use epsilon comparison: if (fabs(dist) < 1e-9)",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "interactive-flush",
		domain: "interactive",
		subDomain: "*",
		pattern: "Interactive problem output not flushed — judge hangs waiting",
		example: "cout << answer << '\\n'; // missing flush in interactive mode",
		fix: "cout << answer << endl; // or follow with cout.flush();",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "string-hash-collision",
		domain: "string",
		subDomain: "hashing",
		pattern: "Single polynomial hash collides on adversarial inputs",
		example: "Using single (base=31, mod=1e9+7) in competitive setting",
		fix: "Use double hashing with two independent (base, mod) pairs",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "cpp-endl-flush-tle",
		domain: "*",
		subDomain: "*",
		pattern: "Using endl in tight output loops causes TLE due to forced flush",
		example: "for (int i = 0; i < n; i++) cout << arr[i] << endl; // O(n) flushes",
		fix: "Use '\\n' instead of endl in loops. Only use endl/flush when protocol requires it.",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "cpp-priority-queue-direction",
		domain: "graph",
		subDomain: "shortest-path",
		pattern: "Default C++ priority_queue is max-heap; Dijkstra needs min-heap",
		example: "priority_queue<pair<int,int>> pq; // WRONG — pops largest dist first",
		fix: "priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<pair<ll,int>>> pq;",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
	{
		id: "python-large-io",
		domain: "*",
		subDomain: "*",
		pattern: "Python input() is slow for N > 1e4; causes TLE",
		example: "n = int(input()) in a loop for N=1e6",
		fix: "import sys; input = sys.stdin.readline — add at top of every large-input Python solution",
		firstSeenAt: "seed",
		hitCount: 0,
		skillGenIndex: 1,
	},
];

/** Current skill generation index — incremented when gotchas are mutated. */
export const currentSkillGenIndex = 1;

/**
 * Filter gotchas by domain and subDomain.
 * Wildcard "*" matches everything.
 */
export function filterGotchas(gotchas: GotchaRecord[], domain: ProblemDomain, subDomain: string): GotchaRecord[] {
	return gotchas.filter(
		(g) => (g.domain === "*" || g.domain === domain) && (g.subDomain === "*" || g.subDomain === subDomain),
	);
}

/**
 * Sort gotchas by hitCount descending (most impactful first).
 */
export function sortGotchasByHitCount(gotchas: GotchaRecord[]): GotchaRecord[] {
	return [...gotchas].sort((a, b) => b.hitCount - a.hitCount);
}

/**
 * Find an existing gotcha matching the same pattern in a given domain.
 */
export function findMatchingGotcha(
	gotchas: GotchaRecord[],
	domain: ProblemDomain,
	pattern: string,
): GotchaRecord | undefined {
	return gotchas.find((g) => (g.domain === "*" || g.domain === domain) && g.pattern === pattern);
}
