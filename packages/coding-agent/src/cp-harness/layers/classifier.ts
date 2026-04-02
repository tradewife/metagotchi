/**
 * Layer 1: Problem Classifier / Planner.
 *
 * Two-stage classification:
 *   Stage 1: Pattern-match on keyword signals (0 tokens)
 *   Stage 2: Fallback model call using only constraints + examples (≤500 tokens)
 *
 * Emits a SprintContract — the formal agreement between Planner and Generator.
 */

import {
	classifyByKeywords,
	getDomainEntry,
	getLikelyAlgorithms,
	inferComplexityTarget,
} from "../skills/algorithms.js";
import type { SolutionArchive } from "../store/solution-archive.js";
import type { ClassifierOutput, ProblemDomain, ProblemSpec, SprintContract } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Classifier {
	classify(problem: ProblemSpec): Promise<ClassifierOutput>;
}

// ---------------------------------------------------------------------------
// Edge case detectors per domain
// ---------------------------------------------------------------------------

const DOMAIN_EDGE_CASE_CHECKERS: Record<string, (text: string) => string[]> = {
	graph: (text) => {
		const flags: string[] = [];
		if (/negative|weight/i.test(text) && /dijkstra/i.test(text)) flags.push("negative-weights-dijkstra");
		if (/directed/i.test(text) && /undirected/i.test(text)) flags.push("directed-ambiguous");
		if (/disconnected/i.test(text)) flags.push("disconnected-graph");
		if (/self.loop|self-loop/i.test(text)) flags.push("self-loops");
		if (/multi.?graph/i.test(text)) flags.push("multi-edges");
		if (/1\s*[≤<=]\s*\|V\||\|V\|\s*[≤<=]\s*1/i.test(text)) flags.push("single-node");
		return flags;
	},
	dp: (text) => {
		const flags: string[] = [];
		if (/mod|modulo|\bMOD\b/i.test(text)) flags.push("modular-arithmetic");
		if (/10\^9\s*\+\s*7/i.test(text)) flags.push("mod-1e9+7");
		if (/large/i.test(text) && /n/i.test(text)) flags.push("large-n");
		if (/empty/i.test(text) || /0\s*[≤<=]\s*n/i.test(text)) flags.push("empty-input");
		return flags;
	},
	math: (text) => {
		const flags: string[] = [];
		if (/overflow|10\^18|10\^9/i.test(text)) flags.push("overflow");
		if (/prime/i.test(text)) flags.push("prime-handling");
		if (/gcd|lcm/i.test(text)) flags.push("gcd-lcm");
		if (/negative/i.test(text)) flags.push("negative-values");
		return flags;
	},
	geometry: (text) => {
		const flags: string[] = [];
		if (/float|double|precision|decimal/i.test(text)) flags.push("floating-point");
		if (/collinear|overlap|tangent/i.test(text)) flags.push("degenerate-case");
		if (/integer.*point/i.test(text)) flags.push("integer-coordinates");
		return flags;
	},
	string: (text) => {
		const flags: string[] = [];
		if (/empty.*string/i.test(text)) flags.push("empty-string");
		if (/case.?sensitive/i.test(text) === false && /string/i.test(text)) flags.push("case-sensitivity");
		if (/palindrome/i.test(text)) flags.push("odd-length");
		return flags;
	},
	"data-structure": (text) => {
		const flags: string[] = [];
		if (/range.*query|point.*update/i.test(text)) flags.push("range-query");
		if (/offline/i.test(text)) flags.push("offline-processing");
		if (/persistent/i.test(text)) flags.push("persistent-ds");
		return flags;
	},
	greedy: (text) => {
		const flags: string[] = [];
		if (/tie|equal/i.test(text)) flags.push("tie-breaking");
		if (/sort/i.test(text)) flags.push("sort-order");
		return flags;
	},
	interactive: (text) => {
		const flags: string[] = [];
		flags.push("flush-required");
		if (/binary.*search/i.test(text)) flags.push("binary-search-interactive");
		return flags;
	},
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface ClassifierOptions {
	archive: SolutionArchive;
	modelCall?: (prompt: string) => Promise<string>;
}

export class ProblemClassifier implements Classifier {
	private readonly archive: SolutionArchive;
	private readonly modelCall?: (prompt: string) => Promise<string>;

	constructor(options: ClassifierOptions) {
		this.archive = options.archive;
		this.modelCall = options.modelCall;
	}

	async classify(problem: ProblemSpec): Promise<ClassifierOutput> {
		// Stage 1: Keyword-based classification (0 tokens)
		const fullText = `${problem.title} ${problem.statement} ${problem.constraints}`;
		let domain: ProblemDomain = classifyByKeywords(fullText);

		let subDomain = "";
		let difficulty: ClassifierOutput["difficulty"] = "medium";
		let likelyAlgorithms: string[] = [];

		if (domain !== "unknown") {
			const entry = getDomainEntry(domain);
			if (entry) {
				// Try to identify subDomain from keywords
				subDomain = this.detectSubDomain(fullText, entry.subDomains);
				likelyAlgorithms = getLikelyAlgorithms(domain);
			}
		} else {
			// Stage 2: Model fallback (≤500 tokens)
			const modelResult = await this.modelFallback(problem);
			if (modelResult) {
				domain = modelResult.domain;
				subDomain = modelResult.subDomain;
				difficulty = modelResult.difficulty;
				likelyAlgorithms = modelResult.likelyAlgorithms;
			}
		}

		// Detect difficulty from constraints
		difficulty = this.inferDifficulty(problem.constraints, difficulty);

		// Edge case detection
		const edgeCaseFlags = this.detectEdgeCases(domain, fullText);

		// Prior solution lookup
		const priorSolutionKeys = this.findPriorSolutions(domain, subDomain, problem.constraints);

		// Generate Sprint Contract
		const sprintContract = this.buildSprintContract(
			domain,
			subDomain,
			problem.constraints,
			edgeCaseFlags,
			likelyAlgorithms,
		);

		return {
			domain,
			subDomain,
			difficulty,
			likelyAlgorithms,
			edgeCaseFlags,
			priorSolutionKeys,
			sprintContract,
		};
	}

	private detectSubDomain(text: string, candidates: string[]): string {
		const lower = text.toLowerCase();
		let best = "";
		let bestCount = 0;

		for (const sub of candidates) {
			// Count how many words from the subDomain name appear in the text
			const words = sub.split(/[-\s]+/);
			let count = 0;
			for (const word of words) {
				if (lower.includes(word.toLowerCase())) count++;
			}
			if (count > bestCount) {
				best = sub;
				bestCount = count;
			}
		}

		return best;
	}

	private inferDifficulty(
		constraints: string,
		fallback: ClassifierOutput["difficulty"],
	): ClassifierOutput["difficulty"] {
		const nMatch = constraints.match(/n\s*[≤<=]\s*(\d[\d.e+]+)/i);
		if (!nMatch) return fallback;

		const n = Number.parseFloat(nMatch[1].replace("e+", "e").replace("E+", "e"));
		if (Number.isNaN(n)) return fallback;

		if (n <= 20) return "easy";
		if (n <= 1e5) return "medium";
		if (n <= 1e9) return "hard";
		return "extreme";
	}

	private detectEdgeCases(domain: ProblemDomain, text: string): string[] {
		const flags: string[] = [];

		// Domain-specific checkers
		const checker = DOMAIN_EDGE_CASE_CHECKERS[domain];
		if (checker) {
			flags.push(...checker(text));
		}

		// Universal checks
		if (/n\s*=\s*0|n\s*[≤<=]\s*0|0\s*[≤<=]\s*n/i.test(text)) flags.push("n-zero");
		if (/n\s*=\s*1|n\s*[≤<=]\s*1|1\s*[≤<=]\s*n/i.test(text)) flags.push("n-one");
		if (/max.*int|10\^9|INT_MAX/i.test(text)) flags.push("max-integers");
		if (/negative/i.test(text)) flags.push("negative-values");

		return flags;
	}

	private findPriorSolutions(domain: ProblemDomain, subDomain: string, constraints: string): string[] {
		const key = this.archive.fingerprint(domain, subDomain, constraints);
		const existing = this.archive.getByKey(key);
		if (existing) return [existing.key];

		// Search for similar solutions
		const similar = this.archive.query({ domain, subDomain, limit: 3 });
		return similar.map((s) => s.key);
	}

	private buildSprintContract(
		domain: ProblemDomain,
		subDomain: string,
		constraints: string,
		edgeCaseFlags: string[],
		likelyAlgorithms: string[],
	): SprintContract {
		const algorithmClassification =
			likelyAlgorithms.length > 0 ? likelyAlgorithms.join(" / ") : `${subDomain || domain} — algorithm TBD`;

		const complexityTarget = inferComplexityTarget(constraints);

		const mandatoryEdgeCases = edgeCaseFlags.map((flag) => {
			switch (flag) {
				case "n-zero":
					return "N=0 (empty input / no elements)";
				case "n-one":
					return "N=1 (single element — boundary)";
				case "max-integers":
					return "All values at maximum constraint (overflow check)";
				case "negative-values":
					return "All negative values";
				case "overflow":
					return "Intermediate calculations exceed 32-bit int range";
				case "floating-point":
					return "Floating point edge cases (near-zero, collinear)";
				case "flush-required":
					return "Interactive: flush output after every query";
				case "modular-arithmetic":
					return "Apply MOD at every DP transition step";
				case "mod-1e9+7":
					return "Use MOD = 10^9+7 consistently";
				case "empty-string":
					return "Empty string input";
				case "single-node":
					return "Graph with single node";
				case "disconnected-graph":
					return "Disconnected graph components";
				default:
					return flag;
			}
		});

		return {
			algorithmClassification,
			complexityTarget,
			mandatoryEdgeCases,
			likelyAlgorithms,
			domain,
			subDomain,
		};
	}

	private async modelFallback(problem: ProblemSpec): Promise<{
		domain: ProblemDomain;
		subDomain: string;
		difficulty: ClassifierOutput["difficulty"];
		likelyAlgorithms: string[];
	} | null> {
		if (!this.modelCall) return null;

		const prompt = `Classify this competitive programming problem.
Constraints: ${problem.constraints}
Examples: ${problem.examples.map((e) => `IN: ${e.input} OUT: ${e.output}`).join("; ")}

Reply in this exact format:
DOMAIN: <domain>
SUBDOMAIN: <subdomain>
DIFFICULTY: <easy|medium|hard|extreme>
ALGORITHMS: <comma-separated>`;

		try {
			const response = await this.modelCall(prompt);
			return this.parseModelResponse(response);
		} catch {
			return null;
		}
	}

	private parseModelResponse(response: string): {
		domain: ProblemDomain;
		subDomain: string;
		difficulty: ClassifierOutput["difficulty"];
		likelyAlgorithms: string[];
	} | null {
		const domainMatch = response.match(/DOMAIN:\s*(.+)/i);
		const subMatch = response.match(/SUBDOMAIN:\s*(.+)/i);
		const diffMatch = response.match(/DIFFICULTY:\s*(.+)/i);
		const algoMatch = response.match(/ALGORITHMS:\s*(.+)/i);

		if (!domainMatch) return null;

		const domain = domainMatch[1].trim().toLowerCase() as ProblemDomain;
		const validDomains: ProblemDomain[] = [
			"graph",
			"dp",
			"math",
			"geometry",
			"string",
			"data-structure",
			"greedy",
			"combinatorics",
			"number-theory",
			"interactive",
			"ml-data",
			"systems",
			"unknown",
		];

		if (!validDomains.includes(domain)) return null;

		return {
			domain,
			subDomain: subMatch?.[1].trim() ?? "",
			difficulty: (diffMatch?.[1].trim() as ClassifierOutput["difficulty"]) ?? "medium",
			likelyAlgorithms:
				algoMatch?.[1]
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean) ?? [],
		};
	}
}
