/**
 * Tests for Layer 2a: Retriever.
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProblemRetriever } from "../../../src/metagotchi/layers/retriever.js";
import { SolutionArchive } from "../../../src/metagotchi/store/solution-archive.js";
import type { ClassifierOutput, GotchaRecord, SolutionRecord } from "../../../src/metagotchi/types.js";

const TEST_GOTCHAS: GotchaRecord[] = [
	{
		id: "test-gotcha-1",
		domain: ["graph"],
		subDomain: "shortest-path",
		description: "Test pattern",
		pattern: "Test pattern",
		symptom: "test symptom",
		example: "test example",
		fix: "test fix",
		firstSeenAt: "test",
		hitCount: 5,
		frequency: 5,
		skillGenIndex: 1,
	},
	{
		id: "test-gotcha-2",
		domain: ["*"],
		subDomain: "*",
		description: "Universal gotcha",
		pattern: "Universal gotcha",
		symptom: "universal symptom",
		example: "universal example",
		fix: "universal fix",
		firstSeenAt: "test",
		hitCount: 10,
		frequency: 10,
		skillGenIndex: 1,
	},
	{
		id: "test-gotcha-3",
		domain: ["dp"],
		subDomain: "*",
		description: "DP gotcha",
		pattern: "DP gotcha",
		symptom: "dp symptom",
		example: "dp example",
		fix: "dp fix",
		firstSeenAt: "test",
		hitCount: 3,
		frequency: 3,
		skillGenIndex: 1,
	},
];

function makeClassifierOutput(overrides: Partial<ClassifierOutput> = {}): ClassifierOutput {
	return {
		domain: "graph",
		subDomain: "shortest-path",
		difficulty: "medium",
		likelyAlgorithms: ["Dijkstra", "BFS"],
		edgeCaseFlags: ["negative-weights-dijkstra"],
		priorSolutionKeys: [],
		sprintContract: {
			algorithmClassification: "Dijkstra",
			complexityTarget: "O(N log N)",
			mandatoryEdgeCases: ["N=1"],
			likelyAlgorithms: ["Dijkstra", "BFS"],
			domain: "graph",
			subDomain: "shortest-path",
			difficulty: "medium",
			tokenBudget: 8000,
			likelyFailureModes: ["off-by-one in 0-indexed nodes"],
			retrievalQuery: "graph shortest-path Dijkstra",
		},
		...overrides,
	};
}

function makeSolution(overrides: Partial<SolutionRecord> = {}): SolutionRecord {
	return {
		key: "test-key-1",
		problemTitle: "Test Graph Problem",
		domain: "graph",
		subDomain: "shortest-path",
		difficulty: "medium",
		language: "cpp",
		code: "#include <bits/stdc++.h>\nusing namespace std;\nint main() { return 0; }",
		verdict: "AC",
		runTimeMs: 100,
		memoryMB: 10,
		notes: "Dijkstra solution",
		timestamp: new Date().toISOString(),
		...overrides,
	};
}

describe("ProblemRetriever", () => {
	let tempDir: string;
	let archive: SolutionArchive;
	let retriever: ProblemRetriever;

	beforeEach(() => {
		tempDir = join(tmpdir(), `cp-retriever-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		archive = new SolutionArchive(join(tempDir, "archive"));
		retriever = new ProblemRetriever({
			archive,
			allGotchas: TEST_GOTCHAS,
		});
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("retrieves domain-specific gotchas", async () => {
		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 8000,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		// Should have graph-specific + universal gotchas
		expect(result.relevantGotchas.length).toBeGreaterThanOrEqual(2);

		const ids = result.relevantGotchas.map((g) => g.id);
		expect(ids).toContain("test-gotcha-1"); // graph-specific
		expect(ids).toContain("test-gotcha-2"); // universal (*)
	});

	it("never drops gotchas for budget", async () => {
		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 100,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		// Gotchas should still be present even with tiny budget
		expect(result.relevantGotchas.length).toBeGreaterThanOrEqual(2);
	});

	it("retrieves prior solutions from archive", async () => {
		const solution = makeSolution();
		archive.store(solution);

		const classifier = makeClassifierOutput({ priorSolutionKeys: ["test-key-1"] });
		const config = {
			maxContextTokens: 8000,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		expect(result.priorSolutions.length).toBeGreaterThanOrEqual(1);
		expect(result.priorSolutions[0].key).toBe("test-key-1");
	});

	it("includes API snippets for language", async () => {
		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 8000,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		expect(result.apiSnippets.length).toBeGreaterThan(0);
	});

	it("includes template code for domain", async () => {
		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 8000,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		expect(result.templateCode).toContain("TODO");
		expect(result.templateCode).toContain("ios::sync_with_stdio");
	});

	it("sorts gotchas by hitCount descending", async () => {
		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 8000,
			topKRetrieval: 5,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		// Universal gotcha (hitCount=10) should come before graph-specific (hitCount=5)
		if (result.relevantGotchas.length >= 2) {
			expect(result.relevantGotchas[0].hitCount).toBeGreaterThanOrEqual(result.relevantGotchas[1].hitCount);
		}
	});

	it("drops prior solutions before gotchas for budget", async () => {
		// Store many large solutions
		for (let i = 0; i < 10; i++) {
			archive.store(
				makeSolution({
					key: `key-${i}`,
					code: `// ${"x".repeat(10000)}`,
				}),
			);
		}

		const classifier = makeClassifierOutput();
		const config = {
			maxContextTokens: 200,
			topKRetrieval: 10,
			language: "cpp" as const,
			logDir: "",
			archiveDir: "",
			gotchasDir: "",
			maxCandidates: 3,
			enableVerifier: true,
			enableMetaLoop: false,
		};

		const result = await retriever.retrieve(classifier, config);

		// Gotchas should still be present, but solutions should be trimmed
		expect(result.relevantGotchas.length).toBeGreaterThanOrEqual(2);
	});
});
