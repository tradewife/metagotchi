/**
 * Tests for Layer 4: Logger.
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TraceLogger } from "../../../src/cp-harness/layers/logger.js";
import type { ExecutionTrace, GotchaRecord, HarnessConfig, SolutionRecord } from "../../../src/cp-harness/types.js";

function makeConfig(tempDir: string): HarnessConfig {
	return {
		maxCandidates: 3,
		topKRetrieval: 5,
		maxContextTokens: 8000,
		enableVerifier: true,
		enableMetaLoop: false,
		language: "cpp",
		logDir: join(tempDir, "logs"),
		archiveDir: join(tempDir, "archive"),
		gotchasDir: join(tempDir, "gotchas"),
	};
}

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
	return {
		sessionId: "test-session-1",
		problemId: "test-problem-1",
		classifierOutput: {
			domain: "graph",
			subDomain: "shortest-path",
			difficulty: "medium",
			likelyAlgorithms: ["Dijkstra"],
			edgeCaseFlags: [],
			priorSolutionKeys: [],
			sprintContract: {
				algorithmClassification: "Dijkstra",
				complexityTarget: "O(N log N)",
				mandatoryEdgeCases: [],
				likelyAlgorithms: ["Dijkstra"],
				domain: "graph",
				subDomain: "shortest-path",
			},
		},
		retrievalContext: {
			priorSolutions: [],
			relevantGotchas: [],
			apiSnippets: [],
			templateCode: "",
		},
		promptPackage: {
			systemPrompt: "You are an elite competitive programmer.",
			userTurn: "Solve this problem.",
			contextTokenEstimate: 100,
			retrievalSummary: "Test retrieval",
		},
		rawModelOutputs: ["int main() { return 0; }"],
		candidateSolutions: ["int main() { return 0; }"],
		verificationResults: [],
		finalVerdict: "AC",
		finalScore: 1.0,
		totalContextTokens: 100,
		wallTimeMs: 500,
		timestamp: new Date().toISOString(),
		notes: "Test trace",
		...overrides,
	};
}

describe("TraceLogger", () => {
	let tempDir: string;
	let config: HarnessConfig;
	let logger: TraceLogger;

	beforeEach(() => {
		tempDir = join(tmpdir(), `cp-logger-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		config = makeConfig(tempDir);
		logger = new TraceLogger(config);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("logs a trace and returns the session directory path", async () => {
		const trace = makeTrace();
		const path = await logger.logTrace(trace);

		expect(path).toContain(trace.sessionId);
	});

	it("reads back a logged trace", async () => {
		const trace = makeTrace();
		await logger.logTrace(trace);

		const loaded = await logger.readTrace(trace.sessionId);
		expect(loaded.sessionId).toBe(trace.sessionId);
		expect(loaded.problemId).toBe(trace.problemId);
		expect(loaded.finalVerdict).toBe("AC");
	});

	it("throws when reading non-existent trace", async () => {
		await expect(logger.readTrace("non-existent")).rejects.toThrow("Trace not found");
	});

	it("lists traces", async () => {
		await logger.logTrace(makeTrace({ sessionId: "session-a" }));
		await logger.logTrace(makeTrace({ sessionId: "session-b" }));

		const ids = await logger.listTraces();
		expect(ids).toContain("session-a");
		expect(ids).toContain("session-b");
	});

	it("lists traces with filter", async () => {
		await logger.logTrace(
			makeTrace({
				sessionId: "session-graph",
				classifierOutput: { ...makeTrace().classifierOutput, domain: "graph" },
			}),
		);
		await logger.logTrace(
			makeTrace({
				sessionId: "session-dp",
				classifierOutput: { ...makeTrace().classifierOutput, domain: "dp" },
				finalVerdict: "WA",
			}),
		);

		const waIds = await logger.listTraces({ verdict: "WA" });
		expect(waIds).toContain("session-dp");
		expect(waIds).not.toContain("session-graph");
	});

	it("appends a new gotcha", async () => {
		const gotcha: GotchaRecord = {
			id: "test-new-gotcha",
			domain: "graph",
			subDomain: "*",
			pattern: "Test pattern",
			example: "Test example",
			fix: "Test fix",
			firstSeenAt: "test-problem",
			hitCount: 0,
			skillGenIndex: 1,
		};

		await logger.appendGotcha(gotcha);

		const gotchas = logger.loadGotchas();
		expect(gotchas.length).toBe(1);
		expect(gotchas[0].id).toBe("test-new-gotcha");
	});

	it("increments hitCount on duplicate gotcha", async () => {
		const gotcha: GotchaRecord = {
			id: "test-dup-gotcha",
			domain: "graph",
			subDomain: "*",
			pattern: "Dup pattern",
			example: "Dup example",
			fix: "Dup fix",
			firstSeenAt: "test-problem",
			hitCount: 3,
			skillGenIndex: 1,
		};

		await logger.appendGotcha(gotcha);
		await logger.appendGotcha({ ...gotcha, hitCount: 0 });

		const gotchas = logger.loadGotchas();
		expect(gotchas.length).toBe(1);
		expect(gotchas[0].hitCount).toBe(4);
	});

	it("archives a solution", async () => {
		const record: SolutionRecord = {
			key: "test-archive-key",
			problemTitle: "Test Problem",
			domain: "graph",
			subDomain: "shortest-path",
			difficulty: "medium",
			language: "cpp",
			code: "int main() { return 0; }",
			verdict: "AC",
			runTimeMs: 100,
			memoryMB: 10,
			notes: "Test solution",
			timestamp: new Date().toISOString(),
		};

		await logger.archiveSolution(record);

		// Verify the manifest was created
		const { existsSync, readFileSync } = await import("node:fs");
		const manifestPath = join(config.archiveDir, "manifest.json");
		expect(existsSync(manifestPath)).toBe(true);

		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest.entries.length).toBe(1);
		expect(manifest.entries[0].key).toBe("test-archive-key");
	});

	it("writes trace.json as flat JSON", async () => {
		const trace = makeTrace();
		await logger.logTrace(trace);

		const { readFileSync, existsSync } = await import("node:fs");
		const tracePath = join(config.logDir, "traces", trace.sessionId, "trace.json");
		expect(existsSync(tracePath)).toBe(true);

		const content = readFileSync(tracePath, "utf-8");
		const parsed = JSON.parse(content);

		// Verify flat structure — key fields should be top-level
		expect(parsed.sessionId).toBe(trace.sessionId);
		expect(parsed.finalVerdict).toBe("AC");
		expect(parsed.totalContextTokens).toBe(100);
	});

	it("saves candidate solution files", async () => {
		const trace = makeTrace({
			candidateSolutions: ["int main() { return 0; }", "int main() { return 1; }"],
			promptPackage: {
				...makeTrace().promptPackage,
				systemPrompt: "You are an elite competitive programmer. Language: C++",
			},
		});
		await logger.logTrace(trace);

		const { existsSync } = await import("node:fs");
		const solDir = join(config.logDir, "traces", trace.sessionId, "solutions");
		expect(existsSync(join(solDir, "candidate-0.cpp"))).toBe(true);
		expect(existsSync(join(solDir, "candidate-1.cpp"))).toBe(true);
	});

	it("saves verification result files", async () => {
		const trace = makeTrace({
			verificationResults: [
				{
					candidateIndex: 0,
					compilesOrParses: true,
					sampleCasesPassed: false,
					sampleCaseDetails: [],
					staticAnalysisWarnings: ["test warning"],
					estimatedComplexity: "O(n)",
					verdict: "WA",
				},
			],
		});
		await logger.logTrace(trace);

		const { existsSync, readFileSync } = await import("node:fs");
		const verifPath = join(config.logDir, "traces", trace.sessionId, "verification", "result-0.json");
		expect(existsSync(verifPath)).toBe(true);

		const result = JSON.parse(readFileSync(verifPath, "utf-8"));
		expect(result.verdict).toBe("WA");
	});
});
