/**
 * Domain skill bundles — algorithm templates, constraint maps, and keyword routing.
 *
 * The constraint→algorithm map comment block must appear at the top of every
 * generated template.
 */

import type { Language, ProblemDomain } from "../types.js";

// ---------------------------------------------------------------------------
// Constraint → Algorithm Map (included in every generated template)
// ---------------------------------------------------------------------------

export const CONSTRAINT_ALGORITHM_MAP = `// === CONSTRAINT → ALGORITHM MAP ===
// n ≤ 12        : bitmask DP or brute force  O(2^n * n)
// n ≤ 100       : O(n^3) Floyd-Warshall, matrix ops
// n ≤ 1000      : O(n^2) DP, O(n^2) Bellman-Ford
// n ≤ 1e5       : O(n log n) — sort, segment tree, Dijkstra, BFS
// n ≤ 1e6       : O(n) — linear DP, BFS on implicit graph, sieve
// n ≤ 1e9       : O(log n) — binary search, matrix exponentiation
// n ≤ 1e18      : O(log^2 n) or O(sqrt(n)) — number theory`;

// ---------------------------------------------------------------------------
// Domain routing table
// ---------------------------------------------------------------------------

export interface DomainEntry {
	domain: ProblemDomain;
	subDomains: string[];
	likelyAlgorithms: string[];
	keywords: string[];
}

export const DOMAIN_ROUTING_TABLE: DomainEntry[] = [
	{
		domain: "graph",
		subDomains: ["shortest-path", "flow", "scc", "bipartite", "mst", "topo-sort"],
		likelyAlgorithms: ["Dijkstra", "BFS", "Bellman-Ford", "Kahn", "Tarjan", "Edmonds-Karp"],
		keywords: [
			"graph",
			"node",
			"vertex",
			"edge",
			"adjacency",
			"path",
			"tree",
			"shortest",
			"connected",
			"component",
			"bipartite",
			"flow",
			"topological",
			"spanning",
			"DFS",
			"BFS",
			"Dijkstra",
			"minimum spanning",
		],
	},
	{
		domain: "dp",
		subDomains: ["knapsack", "interval", "bitmask", "tree-dp", "digit-dp"],
		likelyAlgorithms: ["Memoization", "Tabulation", "SOS-DP"],
		keywords: [
			"dynamic programming",
			"DP",
			"memo",
			"tabul",
			"knapsack",
			"subsequence",
			"substring",
			"interval",
			"bitmask",
			"state",
			"transition",
			"digit",
			"tree DP",
		],
	},
	{
		domain: "math",
		subDomains: ["number-theory", "combinatorics", "geometry", "linear-algebra"],
		likelyAlgorithms: ["Sieve", "FFT", "GCD", "Matrix-exp", "CRT"],
		keywords: [
			"prime",
			"divisor",
			"GCD",
			"LCM",
			"modular",
			"modulo",
			"MOD",
			"factorial",
			"combination",
			"permutation",
			"totient",
			"CRT",
			"Euler",
			"Fermat",
			"sieve",
			"FFT",
			"matrix exponentiation",
			"number theory",
			"combinatorics",
			"binomial",
		],
	},
	{
		domain: "string",
		subDomains: ["suffix-array", "hashing", "automaton", "palindrome"],
		likelyAlgorithms: ["KMP", "Z-function", "Aho-Corasick", "Manacher"],
		keywords: [
			"string",
			"substring",
			"prefix",
			"suffix",
			"pattern",
			"matching",
			"KMP",
			"Z-function",
			"Aho-Corasick",
			"Manacher",
			"palindrome",
			"hash",
			"rolling hash",
			"suffix array",
			"trie",
			"automaton",
		],
	},
	{
		domain: "data-structure",
		subDomains: ["segment-tree", "fenwick", "dsu", "sparse-table", "treap"],
		likelyAlgorithms: ["Lazy propagation", "Persistent DS", "Offline"],
		keywords: [
			"segment tree",
			"Fenwick",
			"BIT",
			"DSU",
			"union find",
			"sparse table",
			"treap",
			"heap",
			"priority queue",
			"range query",
			"lazy propagation",
			"persistent",
			"offline query",
		],
	},
	{
		domain: "greedy",
		subDomains: ["exchange-argument", "interval-scheduling", "heap"],
		likelyAlgorithms: [],
		keywords: ["greedy", "optimal", "sort and", "exchange", "interval", "scheduling", "heap", "priority"],
	},
	{
		domain: "geometry",
		subDomains: ["convex-hull", "sweep-line", "intersection"],
		likelyAlgorithms: ["Graham", "Jarvis", "Shamos-Hoey"],
		keywords: [
			"point",
			"line",
			"polygon",
			"circle",
			"convex hull",
			"sweep line",
			"intersection",
			"area",
			"distance",
			"angle",
			"geometry",
			"coordinate",
			"plane",
		],
	},
	{
		domain: "interactive",
		subDomains: ["query-response", "binary-search-interactive"],
		likelyAlgorithms: ["Adaptive binary search", "Game theory"],
		keywords: ["interactive", "query", "response", "judge", "flush", "guess", "binary search", "interaction"],
	},
];

// ---------------------------------------------------------------------------
// Keyword → domain lookup (used by classifier Stage 1, 0 tokens)
// ---------------------------------------------------------------------------

const keywordDomainMap = new Map<string, ProblemDomain>();
for (const entry of DOMAIN_ROUTING_TABLE) {
	for (const kw of entry.keywords) {
		keywordDomainMap.set(kw.toLowerCase(), entry.domain);
	}
}

/**
 * Look up the most likely domain from a list of keywords.
 * Returns `"unknown"` if no keywords match.
 */
export function classifyByKeywords(text: string): ProblemDomain {
	const lower = text.toLowerCase();
	const counts = new Map<ProblemDomain, number>();

	for (const entry of DOMAIN_ROUTING_TABLE) {
		for (const kw of entry.keywords) {
			if (lower.includes(kw.toLowerCase())) {
				counts.set(entry.domain, (counts.get(entry.domain) ?? 0) + 1);
			}
		}
	}

	let best: ProblemDomain = "unknown";
	let bestCount = 0;
	for (const [domain, count] of counts) {
		if (count > bestCount) {
			best = domain;
			bestCount = count;
		}
	}

	return best;
}

/**
 * Get the domain entry for a given domain.
 */
export function getDomainEntry(domain: ProblemDomain): DomainEntry | undefined {
	return DOMAIN_ROUTING_TABLE.find((e) => e.domain === domain);
}

/**
 * Infer complexity target from constraint text.
 * Parses the largest N value and maps to the appropriate complexity.
 */
export function inferComplexityTarget(constraints: string): string {
	const nMatch = constraints.match(/n\s*[≤<=]\s*(\d[\d.e+]+)/i);
	if (!nMatch) return "unknown — no N constraint found";

	const n = Number.parseFloat(nMatch[1].replace("e+", "e").replace("E+", "e"));
	if (Number.isNaN(n)) return "unknown — could not parse N";

	if (n <= 12) return "O(2^n * n) — bitmask or brute force";
	if (n <= 100) return "O(n^3) — cubic DP or Floyd-Warshall";
	if (n <= 1000) return "O(n^2) — quadratic DP or Bellman-Ford";
	if (n <= 1e5) return "O(n log n) — sort, segment tree, Dijkstra, BFS";
	if (n <= 1e6) return "O(n) — linear scan, sieve, BFS on implicit graph";
	if (n <= 1e9) return "O(log n) — binary search, matrix exponentiation";
	return "O(log^2 n) or O(sqrt(n)) — number theory";
}

// ---------------------------------------------------------------------------
// Code templates per domain + language
// ---------------------------------------------------------------------------

interface TemplateEntry {
	domain: ProblemDomain;
	language: Language;
	code: string;
}

function cppTemplate(skeleton: string): string {
	return `#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
typedef pair<ll,int> pli;

${CONSTRAINT_ALGORITHM_MAP}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

${skeleton}

    return 0;
}`;
}

function pythonTemplate(skeleton: string): string {
	return `import sys
sys.setrecursionlimit(300000)
input = sys.stdin.readline

# === CONSTRAINT → ALGORITHM MAP ===
# n ≤ 12        : bitmask DP or brute force  O(2^n * n)
# n ≤ 100       : O(n^3) Floyd-Warshall, matrix ops
# n ≤ 1000      : O(n^2) DP, O(n^2) Bellman-Ford
# n ≤ 1e5       : O(n log n) — sort, segment tree, Dijkstra, BFS
# n ≤ 1e6       : O(n) — linear DP, BFS on implicit graph, sieve
# n ≤ 1e9       : O(log n) — binary search, matrix exponentiation
# n ≤ 1e18      : O(log^2 n) or O(sqrt(n)) — number theory

def main():
${skeleton}

if __name__ == "__main__":
    main()`;
}

const TEMPLATES: TemplateEntry[] = [
	{
		domain: "graph",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    int n, m;
    cin >> n >> m;
    // Build graph adjacency list
    // Apply algorithm (Dijkstra, BFS, etc.)
    // Output result`),
	},
	{
		domain: "graph",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    n, m = map(int, input().split())
    # Build graph adjacency list
    # Apply algorithm (Dijkstra, BFS, etc.)
    # Output result`),
	},
	{
		domain: "dp",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    int n;
    cin >> n;
    // Define DP state and transition
    // Remember: apply MOD at each step for counting problems
    // Output result`),
	},
	{
		domain: "dp",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    n = int(input())
    # Define DP state and transition
    # Remember: apply MOD at each step for counting problems
    # Output result`),
	},
	{
		domain: "math",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    // Watch for: int overflow — cast to long long before multiplication
    // long long ans = (long long)a * b;
    const int MOD = 1e9 + 7;
    // Output result`),
	},
	{
		domain: "math",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    MOD = 10**9 + 7
    # Python handles big integers natively
    # Output result`),
	},
	{
		domain: "string",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    string s;
    cin >> s;
    int n = s.size();
    // Apply string algorithm (KMP, Z-function, hashing, etc.)
    // Output result`),
	},
	{
		domain: "string",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    s = input().strip()
    n = len(s)
    # Apply string algorithm (KMP, Z-function, hashing, etc.)
    # Output result`),
	},
	{
		domain: "data-structure",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    int n, q;
    cin >> n >> q;
    // Build data structure (segment tree, Fenwick, DSU, etc.)
    // Process queries
    // Output result`),
	},
	{
		domain: "data-structure",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    n, q = map(int, input().split())
    # Build data structure (segment tree, Fenwick, DSU, etc.)
    # Process queries
    # Output result`),
	},
	{
		domain: "greedy",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    int n;
    cin >> n;
    // Sort and apply greedy strategy
    // Output result`),
	},
	{
		domain: "greedy",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    n = int(input())
    # Sort and apply greedy strategy
    # Output result`),
	},
	{
		domain: "geometry",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic
    // Use epsilon comparison: fabs(a - b) < 1e-9
    // Watch for floating point precision
    // Output result`),
	},
	{
		domain: "geometry",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic
    # Use abs(a - b) < 1e-9 for floating point comparison
    # Output result`),
	},
	{
		domain: "interactive",
		language: "cpp",
		code: cppTemplate(`    // TODO: solver logic — INTERACTIVE
    // IMPORTANT: flush after every output in interactive problems
    // cout << answer << endl; // or cout.flush();
    int n;
    cin >> n;
    // Interactive loop: query, read response, decide
    // Output result`),
	},
	{
		domain: "interactive",
		language: "python",
		code: pythonTemplate(`    # TODO: solver logic — INTERACTIVE
    # IMPORTANT: flush after every output in interactive problems
    # print(answer, flush=True)
    n = int(input())
    # Interactive loop: query, read response, decide
    # Output result`),
	},
];

/**
 * Get the code template for a domain + language combination.
 * Returns a generic template if no specific one exists.
 */
export function getTemplate(domain: ProblemDomain, language: Language): string {
	const match = TEMPLATES.find((t) => t.domain === domain && t.language === language);
	if (match) return match.code;

	// Generic fallback
	if (language === "cpp") {
		return cppTemplate(`    // TODO: solver logic`);
	}
	return pythonTemplate(`    # TODO: solver logic`);
}

/**
 * Get the list of likely algorithms for a domain.
 */
export function getLikelyAlgorithms(domain: ProblemDomain): string[] {
	return getDomainEntry(domain)?.likelyAlgorithms ?? [];
}
