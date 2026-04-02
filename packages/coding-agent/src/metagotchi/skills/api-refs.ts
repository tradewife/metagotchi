/**
 * Language-specific API references in gotchas-first format.
 *
 * Every entry leads with the gotcha, then provides the reference snippet.
 */

import type { Language } from "../types.js";

export interface ApiRef {
	language: Language;
	algorithm: string;
	gotcha: string;
	snippet: string;
}

export const API_REFS: ApiRef[] = [
	// --- C++ ---
	{
		language: "cpp",
		algorithm: "priority-queue",
		gotcha: "Default pq is max-heap. For Dijkstra (min-heap) use greater<>.",
		snippet: `priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<pair<ll,int>>> pq;`,
	},
	{
		language: "cpp",
		algorithm: "fast-io",
		gotcha: "cin/cout without sync disable causes TLE on large I/O.",
		snippet: `ios::sync_with_stdio(false); cin.tie(nullptr);`,
	},
	{
		language: "cpp",
		algorithm: "int-overflow",
		gotcha: "int overflow when multiplying two ints before assigning to long long.",
		snippet: `long long ans = (long long)a * b;`,
	},
	{
		language: "cpp",
		algorithm: "endl-flush",
		gotcha: "Using endl in tight output loops causes TLE due to forced flush.",
		snippet: `cout << value << '\\n'; // NOT endl in loops`,
	},
	{
		language: "cpp",
		algorithm: "min-element",
		gotcha: "min_element returns iterator, not value. Dereference it.",
		snippet: `auto it = min_element(v.begin(), v.end()); ll val = *it;`,
	},
	{
		language: "cpp",
		algorithm: "lower-bound",
		gotcha: "lower_bound requires sorted range. Returns iterator to first >= value.",
		snippet: `auto it = lower_bound(v.begin(), v.end(), target);`,
	},
	{
		language: "cpp",
		algorithm: "bitset",
		gotcha: "bitset size must be compile-time constant. Use vector<bool> for dynamic.",
		snippet: `bitset<1000001> visited;`,
	},
	// --- Python ---
	{
		language: "python",
		algorithm: "fast-io",
		gotcha: "input() is slow for N > 1e4; causes TLE.",
		snippet: `import sys; input = sys.stdin.readline`,
	},
	{
		language: "python",
		algorithm: "recursion-limit",
		gotcha: "Default recursion limit (1000) too low for deep DFS/memoization.",
		snippet: `import sys; sys.setrecursionlimit(300000)`,
	},
	{
		language: "python",
		algorithm: "integer-division",
		gotcha: "Python 3 / returns float. Use // for integer division.",
		snippet: `result = a // b  # integer division, not a / b`,
	},
	{
		language: "python",
		algorithm: "deque",
		gotcha: "list.pop(0) is O(n). Use collections.deque for BFS.",
		snippet: `from collections import deque; q = deque(); q.append(x); x = q.popleft()`,
	},
	{
		language: "python",
		algorithm: "defaultdict",
		gotcha: "dict[key] raises KeyError if key missing. Use defaultdict.",
		snippet: `from collections import defaultdict; d = defaultdict(int); d[key] += 1`,
	},
	// --- Java ---
	{
		language: "java",
		algorithm: "fast-io",
		gotcha: "Scanner is slow for large input. Use BufferedReader.",
		snippet: `BufferedReader br = new BufferedReader(new InputStreamReader(System.in));`,
	},
	{
		language: "java",
		algorithm: "int-overflow",
		gotcha: "int overflows at ~2.1e9. Use long for intermediate calculations.",
		snippet: `long ans = (long)a * b; // cast before multiply`,
	},
	{
		language: "java",
		algorithm: "array-sort",
		gotcha: "Arrays.sort on objects uses O(n^2) for nearly sorted. Use Collections.sort.",
		snippet: `Arrays.sort(arr); // primitives — dual-pivot quicksort O(n log n)`,
	},
	// --- Rust ---
	{
		language: "rust",
		algorithm: "fast-io",
		gotcha: "println! is slow in tight loops. Use BufWriter.",
		snippet: `let out = BufWriter::new(io::stdout()); writeln!(out, "{}", ans).unwrap();`,
	},
	{
		language: "rust",
		algorithm: "overflow",
		gotcha: "Rust panics on overflow in debug. Use wrapping_* or checked_*.",
		snippet: `let ans = a.wrapping_mul(b); // or a.checked_mul(b)`,
	},
	// --- TypeScript ---
	{
		language: "typescript",
		algorithm: "fast-io",
		gotcha: "console.log is slow for large output. Buffer and write once.",
		snippet: `const lines: string[] = []; lines.push(String(ans)); process.stdout.write(lines.join('\\n'));`,
	},
	{
		language: "typescript",
		algorithm: "bigint",
		gotcha: "JS numbers are float64 — lose precision above 2^53. Use BigInt.",
		snippet: `const ans = BigInt(a) * BigInt(b);`,
	},
];

/**
 * Get API refs filtered by language and optional algorithm.
 */
export function getApiRefs(language: Language, algorithm?: string): ApiRef[] {
	return API_REFS.filter((r) => r.language === language && (algorithm === undefined || r.algorithm === algorithm));
}

/**
 * Format API refs as snippet strings for prompt injection.
 */
export function formatApiRefsForPrompt(refs: ApiRef[]): string[] {
	return refs.map((r) => `// ${r.gotcha}\n${r.snippet}`);
}
