/**
 * Tests for the main HarnessRunner — end-to-end solve pipeline.
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, HarnessRunner } from "../../../src/cp-harness/harness.js";
import type { ProblemSpec } from "../../../src/cp-harness/types.js";

function makeProblem(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
	return {
		id: "sum-problem",
		title: "A + B Problem",
		statement: "Given two integers a and b, print their sum.",
		constraints: "1 ≤ a, b ≤ 10^9",
		examples: [
			{ input: "3 5", output: "8" },
			{ input: "100 200", output: "300" },
		],
		timeLimit: 1000,
		memoryLimit: 256,
		language: "cpp",
		...overrides,
	};
}

const CORRECT_CPP_SOLUTION = `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;

describe("HarnessRunner", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `cp-harness-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("solves a simple problem with AC on first candidate", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const runner = new HarnessRunner(config, async () => CORRECT_CPP_SOLUTION);
		const trace = await runner.solve(makeProblem());

		expect(trace.finalVerdict).toBe("AC");
		expect(trace.finalScore).toBe(1.0);
		expect(trace.candidateSolutions.length).toBe(1);
		expect(trace.verificationResults.length).toBe(1);
		expect(trace.classifierOutput).toBeDefined();
		expect(trace.retrievalContext).toBeDefined();
		expect(trace.rawModelOutputs.length).toBe(1);
	}, 30000);

	it("breaks early on AC without generating more candidates", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 3,
			language: "cpp",
		});

		let callCount = 0;
		const runner = new HarnessRunner(config, async () => {
			callCount++;
			return CORRECT_CPP_SOLUTION;
		});

		await runner.solve(makeProblem());

		expect(callCount).toBe(1);
	}, 30000);

	it("generates multiple candidates when first fails", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 3,
			language: "cpp",
		});

		const wrongSolution = `#include <bits/stdc++.h>
using namespace std;
int main() { int a, b; cin >> a >> b; cout << a - b << '\\n'; return 0; }`;

		let callCount = 0;
		const runner = new HarnessRunner(config, async () => {
			callCount++;
			if (callCount <= 1) return wrongSolution;
			return CORRECT_CPP_SOLUTION;
		});

		const trace = await runner.solve(makeProblem());

		expect(callCount).toBe(2);
		expect(trace.finalVerdict).toBe("AC");
		expect(trace.candidateSolutions.length).toBe(2);
	}, 30000);

	it("archives solution after AC", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const runner = new HarnessRunner(config, async () => CORRECT_CPP_SOLUTION);
		await runner.solve(makeProblem());

		// Check manifest exists
		const { existsSync, readFileSync } = await import("node:fs");
		const manifestPath = join(config.archiveDir, "manifest.json");
		expect(existsSync(manifestPath)).toBe(true);

		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest.entries.length).toBeGreaterThan(0);
	}, 30000);

	it("extracts code from markdown code blocks", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const wrappedSolution = `Here is my solution:

\`\`\`cpp
${CORRECT_CPP_SOLUTION}
\`\`\`

This solves the problem efficiently.`;

		const runner = new HarnessRunner(config, async () => wrappedSolution);
		const trace = await runner.solve(makeProblem());

		expect(trace.finalVerdict).toBe("AC");
	}, 30000);

	it("handles WA failure with failure notes", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const wrongSolution = `#include <bits/stdc++.h>
using namespace std;
int main() { int a, b; cin >> a >> b; cout << 0 << '\\n'; return 0; }`;

		const runner = new HarnessRunner(config, async () => wrongSolution);
		const trace = await runner.solve(makeProblem());

		expect(trace.finalVerdict).toBe("WA");
		expect(trace.finalScore).toBe(0.0);
		expect(trace.notes).toContain("WA");
	}, 30000);

	it("handles CE failure gracefully", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const brokenSolution = `#include <bits/stdc++.h>
int main() { cout << "missing semicolon" return 0; }`;

		const runner = new HarnessRunner(config, async () => brokenSolution);
		const trace = await runner.solve(makeProblem());

		expect(trace.finalVerdict).toBe("CE");
		expect(trace.notes).toContain("CE");
	}, 30000);

	it("produces valid trace with all required fields", async () => {
		const config = defaultConfig({
			logDir: join(tempDir, "logs"),
			archiveDir: join(tempDir, "archive"),
			gotchasDir: join(tempDir, "gotchas"),
			maxCandidates: 1,
			language: "cpp",
		});

		const runner = new HarnessRunner(config, async () => CORRECT_CPP_SOLUTION);
		const trace = await runner.solve(makeProblem());

		expect(trace.sessionId).toBeDefined();
		expect(trace.problemId).toBe("sum-problem");
		expect(trace.wallTimeMs).toBeGreaterThan(0);
		expect(trace.timestamp).toBeDefined();
		expect(trace.totalContextTokens).toBeGreaterThan(0);
		expect(trace.candidateSolutions.length).toBeGreaterThan(0);
		expect(trace.rawModelOutputs.length).toBeGreaterThan(0);
	}, 30000);
});
