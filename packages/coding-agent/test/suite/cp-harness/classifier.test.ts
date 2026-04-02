/**
 * Tests for Layer 1: Problem Classifier.
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProblemClassifier } from "../../../src/cp-harness/layers/classifier.js";
import { SolutionArchive } from "../../../src/cp-harness/store/solution-archive.js";
import type { ProblemSpec } from "../../../src/cp-harness/types.js";

function makeProblem(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
	return {
		id: "test-1",
		title: "Test Problem",
		statement: "Find the shortest path in a graph.",
		constraints: "1 ≤ N ≤ 100000",
		examples: [{ input: "3 3\n1 2 1\n2 3 2\n1 3", output: "3" }],
		timeLimit: 2000,
		memoryLimit: 256,
		language: "cpp",
		...overrides,
	};
}

describe("ProblemClassifier", () => {
	let tempDir: string;
	let archive: SolutionArchive;
	let classifier: ProblemClassifier;

	beforeEach(() => {
		tempDir = join(tmpdir(), `cp-classifier-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		archive = new SolutionArchive(join(tempDir, "archive"));
		classifier = new ProblemClassifier({ archive });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("classifies graph problems by keywords", async () => {
		const problem = makeProblem({
			title: "Shortest Path",
			statement: "Given a weighted graph with N nodes and M edges, find the shortest path from node 1 to node N.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("graph");
		expect(result.likelyAlgorithms.length).toBeGreaterThan(0);
	});

	it("classifies DP problems by keywords", async () => {
		const problem = makeProblem({
			title: "Knapsack",
			statement:
				"Given N items with weights and values, select items to maximize value under weight constraint using dynamic programming.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("dp");
	});

	it("classifies math problems by keywords", async () => {
		const problem = makeProblem({
			title: "Prime Factorization",
			statement: "Find the number of prime factors of N using sieve of Eratosthenes.",
			constraints: "1 ≤ N ≤ 10^6",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("math");
	});

	it("classifies string problems by keywords", async () => {
		const problem = makeProblem({
			title: "Pattern Matching",
			statement: "Find all occurrences of a pattern in a string using KMP algorithm.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("string");
	});

	it("classifies greedy problems by keywords", async () => {
		const problem = makeProblem({
			title: "Interval Scheduling",
			statement: "Select the maximum number of non-overlapping intervals using a greedy approach.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("greedy");
	});

	it("classifies geometry problems by keywords", async () => {
		const problem = makeProblem({
			title: "Convex Hull",
			statement: "Compute the convex hull of a set of points in the plane.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("geometry");
	});

	it("classifies data-structure problems by keywords", async () => {
		const problem = makeProblem({
			title: "Range Sum Query",
			statement:
				"Process range sum queries on an array using a Fenwick tree BIT segment tree for point updates and range queries.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("data-structure");
	});

	it("classifies interactive problems by keywords", async () => {
		const problem = makeProblem({
			title: "Guess the Number",
			statement: "Guess a hidden number using interactive binary search queries to the judge.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("interactive");
	});

	it("returns unknown for unrecognized problems without model fallback", async () => {
		const problem = makeProblem({
			title: "Something Random",
			statement: "Do something with some data.",
		});

		const result = await classifier.classify(problem);
		expect(result.domain).toBe("unknown");
	});

	it("uses model fallback when keyword match fails", async () => {
		let modelCalled = false;
		const classifierWithModel = new ProblemClassifier({
			archive,
			modelCall: async (_prompt: string) => {
				modelCalled = true;
				return "DOMAIN: graph\nSUBDOMAIN: shortest-path\nDIFFICULTY: medium\nALGORITHMS: Dijkstra, BFS";
			},
		});

		const problem = makeProblem({
			title: "Unknown Problem",
			statement: "Do something with some completely unrelated items.",
		});

		const result = await classifierWithModel.classify(problem);
		expect(modelCalled).toBe(true);
		expect(result.domain).toBe("graph");
		expect(result.subDomain).toBe("shortest-path");
	});

	it("detects edge cases for graph domain", async () => {
		const problem = makeProblem({
			title: "Graph with negatives",
			statement: "Find shortest path in a graph with negative edge weights using Dijkstra.",
		});

		const result = await classifier.classify(problem);
		expect(result.edgeCaseFlags).toContain("negative-weights-dijkstra");
	});

	it("detects edge cases for DP domain", async () => {
		const problem = makeProblem({
			title: "DP Mod",
			statement: "Count paths modulo 10^9+7 using dynamic programming.",
		});

		const result = await classifier.classify(problem);
		expect(result.edgeCaseFlags).toContain("modular-arithmetic");
		expect(result.edgeCaseFlags).toContain("mod-1e9+7");
	});

	it("emits SprintContract with mandatory edge cases", async () => {
		const problem = makeProblem({
			title: "Graph Problem",
			statement: "Find shortest path. Handle disconnected components and single nodes.",
			constraints: "1 ≤ N ≤ 100000",
		});

		const result = await classifier.classify(problem);
		expect(result.sprintContract).toBeDefined();
		expect(result.sprintContract.mandatoryEdgeCases.length).toBeGreaterThan(0);
		expect(result.sprintContract.algorithmClassification).toBeDefined();
		expect(result.sprintContract.complexityTarget).toContain("O(");
	});

	it("infers difficulty from constraints", async () => {
		const easy = makeProblem({ constraints: "1 ≤ N ≤ 10" });
		const hard = makeProblem({ constraints: "1 ≤ N ≤ 1000000000" });

		const easyResult = await classifier.classify(easy);
		const hardResult = await classifier.classify(hard);

		expect(easyResult.difficulty).toBe("easy");
		expect(hardResult.difficulty).toBe("hard");
	});

	it("detects N=0 and N=1 edge cases", async () => {
		const problem = makeProblem({
			title: "Edge Case Test",
			statement: "Process N items where 0 ≤ N ≤ 1000.",
		});

		const result = await classifier.classify(problem);
		expect(result.edgeCaseFlags).toContain("n-zero");
	});
});
