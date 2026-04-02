/**
 * Tests for Layer 2b: Prompter.
 */

import { describe, expect, it } from "vitest";
import { ProblemPrompter } from "../../../src/cp-harness/layers/prompter.js";
import type {
	ClassifierOutput,
	ProblemSpec,
	RetrievalContext,
	VerificationResult,
} from "../../../src/cp-harness/types.js";

function makeProblem(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
	return {
		id: "test-1",
		title: "Shortest Path",
		statement: "Find the shortest path from node 1 to node N in a weighted graph.",
		constraints: "1 ≤ N ≤ 100000\n1 ≤ M ≤ 200000",
		examples: [{ input: "3 3\n1 2 1\n2 3 2\n1 3", output: "3" }],
		timeLimit: 2000,
		memoryLimit: 256,
		language: "cpp",
		...overrides,
	};
}

function makeClassifier(overrides: Partial<ClassifierOutput> = {}): ClassifierOutput {
	return {
		domain: "graph",
		subDomain: "shortest-path",
		difficulty: "medium",
		likelyAlgorithms: ["Dijkstra", "BFS"],
		edgeCaseFlags: ["negative-weights-dijkstra", "max-integers"],
		priorSolutionKeys: [],
		sprintContract: {
			algorithmClassification: "Dijkstra with priority queue",
			complexityTarget: "O(N log N)",
			mandatoryEdgeCases: ["N=1 (single node)", "All values at maximum constraint"],
			likelyAlgorithms: ["Dijkstra", "BFS"],
			domain: "graph",
			subDomain: "shortest-path",
		},
		...overrides,
	};
}

function makeContext(overrides: Partial<RetrievalContext> = {}): RetrievalContext {
	return {
		priorSolutions: [],
		relevantGotchas: [
			{
				id: "test-gotcha",
				domain: "graph",
				subDomain: "*",
				pattern: "Dijkstra used on graph with negative edge weights",
				example: "Applying Dijkstra when constraints say -10^9 ≤ w ≤ 10^9",
				fix: "Use Bellman-Ford or SPFA for negative weights.",
				firstSeenAt: "test",
				hitCount: 5,
				skillGenIndex: 1,
			},
		],
		apiSnippets: [
			"// Default pq is max-heap. For Dijkstra (min-heap) use greater<>.\npriority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<pair<ll,int>>> pq;",
		],
		templateCode:
			"#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // TODO: solver logic\n    return 0;\n}",
		...overrides,
	};
}

const defaultConfig = {
	maxContextTokens: 8000,
	topKRetrieval: 5,
	language: "cpp" as const,
	maxCandidates: 3,
	enableVerifier: true,
	enableMetaLoop: false,
	logDir: "/tmp",
	archiveDir: "/tmp",
	gotchasDir: "/tmp",
};

describe("ProblemPrompter", () => {
	it("builds a complete prompt with all sections", () => {
		const prompter = new ProblemPrompter();
		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig);

		expect(pkg.systemPrompt).toContain("elite competitive programmer");
		expect(pkg.systemPrompt).toContain("Domain Hints");
		expect(pkg.systemPrompt).toContain("graph");
		expect(pkg.systemPrompt).toContain("Sprint Contract");
		expect(pkg.systemPrompt).toContain("N=1");
		expect(pkg.systemPrompt).toContain("Critical Gotchas");
		expect(pkg.systemPrompt).toContain("Output Format");
		expect(pkg.userTurn).toContain("Shortest Path");
		expect(pkg.contextTokenEstimate).toBeGreaterThan(0);
	});

	it("estimates tokens using 4-chars-per-token", () => {
		const prompter = new ProblemPrompter();
		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig);

		const totalLength = pkg.systemPrompt.length + pkg.userTurn.length;
		const expectedEstimate = Math.ceil(totalLength / 4);
		expect(pkg.contextTokenEstimate).toBe(expectedEstimate);
	});

	it("enforces token budget by dropping sections", () => {
		const prompter = new ProblemPrompter();
		const largeContext = makeContext({
			priorSolutions: Array.from({ length: 20 }, (_, i) => ({
				key: `key-${i}`,
				problemTitle: `Problem ${i}`,
				domain: "graph" as const,
				subDomain: "shortest-path",
				difficulty: "medium" as const,
				language: "cpp" as const,
				code: `// ${"x".repeat(5000)}`,
				verdict: "AC" as const,
				runTimeMs: 100,
				memoryMB: 10,
				notes: `Solution ${i}`,
				timestamp: new Date().toISOString(),
			})),
		});

		const smallConfig = { ...defaultConfig, maxContextTokens: 500 };
		const pkg = prompter.build(makeProblem(), makeClassifier(), largeContext, smallConfig);

		expect(pkg.contextTokenEstimate).toBeLessThanOrEqual(smallConfig.maxContextTokens + 100);
	});

	it("never drops gotchas for budget", () => {
		const prompter = new ProblemPrompter();
		const tinyConfig = { ...defaultConfig, maxContextTokens: 100 };

		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), tinyConfig);

		// Even with tiny budget, gotchas section should remain
		// (it may get cut off by overall truncation but the section header stays)
		expect(pkg.systemPrompt).toContain("Critical Gotchas");
		expect(pkg.systemPrompt).toContain("Sprint Contract");
	});

	it("varies approach for multi-candidate prompting", () => {
		const prompter = new ProblemPrompter();
		const multiConfig = { ...defaultConfig, maxCandidates: 3 };

		const pkg0 = prompter.build(makeProblem(), makeClassifier(), makeContext(), multiConfig, {
			candidateIndex: 0,
			totalCandidates: 3,
		});
		const pkg1 = prompter.build(makeProblem(), makeClassifier(), makeContext(), multiConfig, {
			candidateIndex: 1,
			totalCandidates: 3,
		});

		expect(pkg0.systemPrompt).toContain("simplest correct approach");
		expect(pkg1.systemPrompt).toContain("most robust approach");
	});

	it("includes template for even-indexed candidates", () => {
		const prompter = new ProblemPrompter();

		const pkg0 = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig, {
			candidateIndex: 0,
			totalCandidates: 3,
		});
		const pkg1 = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig, {
			candidateIndex: 1,
			totalCandidates: 3,
		});

		expect(pkg0.systemPrompt).toContain("Code Template");
		expect(pkg1.systemPrompt).not.toContain("Code Template");
	});

	it("injects interactive protocol block", () => {
		const prompter = new ProblemPrompter();
		const interactiveClassifier = makeClassifier({ domain: "interactive" });

		const pkg = prompter.build(makeProblem(), interactiveClassifier, makeContext(), defaultConfig);

		expect(pkg.systemPrompt).toContain("Interactive Protocol");
		expect(pkg.systemPrompt).toContain("flush");
	});

	it("appends failure info in additive editing mode", () => {
		const prompter = new ProblemPrompter();
		const failureResult: VerificationResult = {
			candidateIndex: 0,
			compilesOrParses: true,
			sampleCasesPassed: false,
			sampleCaseDetails: [{ input: "3\n1 2\n2 3", expected: "5", got: "4", pass: false }],
			staticAnalysisWarnings: ["POTENTIAL_OVERFLOW: int overflow detected"],
			estimatedComplexity: "O(n)",
			verdict: "WA",
		};

		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig, {
			candidateIndex: 1,
			failureResult,
			failedCode: "int main() { int a = 1000000; int b = 1000000; return a * b; }",
		});

		expect(pkg.userTurn).toContain("Previous Attempt Failed");
		expect(pkg.userTurn).toContain("Expected:\n5");
		expect(pkg.userTurn).toContain("Got:\n4");
		expect(pkg.userTurn).toContain("POTENTIAL_OVERFLOW");
		expect(pkg.userTurn).toContain("int main()");
	});

	it("switches to full rewrite after two failures", () => {
		const prompter = new ProblemPrompter();
		const failureResult: VerificationResult = {
			candidateIndex: 0,
			compilesOrParses: true,
			sampleCasesPassed: false,
			sampleCaseDetails: [],
			staticAnalysisWarnings: [],
			estimatedComplexity: "O(n)",
			verdict: "WA",
		};

		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig, {
			candidateIndex: 2,
			failureResult,
			failedCode: "bad code",
			isFullRewrite: true,
		});

		expect(pkg.userTurn).toContain("FULL REWRITE REQUIRED");
	});

	it("includes C++ fast I/O in output format", () => {
		const prompter = new ProblemPrompter();

		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig);

		expect(pkg.systemPrompt).toContain("ios::sync_with_stdio(false)");
	});

	it("produces retrieval summary", () => {
		const prompter = new ProblemPrompter();

		const pkg = prompter.build(makeProblem(), makeClassifier(), makeContext(), defaultConfig);

		expect(pkg.retrievalSummary).toContain("gotchas");
		expect(pkg.retrievalSummary).toContain("API snippets");
	});
});
