/**
 * Main HarnessRunner — orchestrates all five layers.
 *
 * Solve pipeline:
 *   1. classify(problem)
 *   2. retrieve(classifierOutput, config)
 *   3. prompter.build(...)
 *   4. [Loop] stream model → verify → iterate
 *   5. Select best candidate
 *   6. logTrace
 *   7. archiveSolution (if AC)
 *   8. analyzeFailure (if not AC)
 *   9. return ExecutionTrace
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { ProblemClassifier } from "./layers/classifier.js";
import { TraceLogger } from "./layers/logger.js";
import { ProblemPrompter } from "./layers/prompter.js";
import { ProblemRetriever } from "./layers/retriever.js";
import { SolutionVerifier } from "./layers/verifier.js";
import { MetaProposer } from "./meta/proposer.js";
import { INITIAL_GOTCHAS } from "./skills/gotchas.js";
import { SolutionArchive } from "./store/solution-archive.js";
import type { ExecutionTrace, GotchaRecord, HarnessConfig, ProblemSpec, Verdict, VerificationResult } from "./types.js";

// ---------------------------------------------------------------------------
// Model interface (injected)
// ---------------------------------------------------------------------------

export type ModelStreamFn = (prompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export function defaultConfig(overrides?: Partial<HarnessConfig>): HarnessConfig {
	return {
		maxCandidates: 3,
		topKRetrieval: 5,
		maxContextTokens: 8000,
		enableVerifier: true,
		enableMetaLoop: false,
		language: "cpp",
		logDir: "/tmp/cp-harness-logs",
		archiveDir: "/tmp/cp-harness-archive",
		gotchasDir: "/tmp/cp-harness-gotchas",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// HarnessRunner
// ---------------------------------------------------------------------------

export class HarnessRunner {
	private readonly config: HarnessConfig;
	private readonly modelStream: ModelStreamFn;
	private readonly classifier: ProblemClassifier;
	private readonly retriever: ProblemRetriever;
	private readonly prompter: ProblemPrompter;
	private readonly verifier: SolutionVerifier;
	private readonly logger: TraceLogger;
	private readonly metaProposer?: MetaProposer;

	constructor(config: HarnessConfig, modelStream: ModelStreamFn) {
		this.config = config;
		this.modelStream = modelStream;

		const archive = new SolutionArchive(config.archiveDir);
		const logger = new TraceLogger(config);

		this.classifier = new ProblemClassifier({ archive });
		this.retriever = new ProblemRetriever({ archive });
		this.prompter = new ProblemPrompter();
		this.verifier = new SolutionVerifier();
		this.logger = logger;

		if (config.enableMetaLoop) {
			this.metaProposer = new MetaProposer(
				path.join(config.archiveDir, "../harnesses"),
				config.logDir,
			);
		}
	}

	async solve(problem: ProblemSpec): Promise<ExecutionTrace> {
		const sessionId = `solve-${Date.now()}-${randomUUID().slice(0, 8)}`;
		const startTime = Date.now();

		// 1. Classify
		const classifierOutput = await this.classifier.classify(problem);

		// 2. Retrieve
		const retrievalContext = await this.retriever.retrieve(classifierOutput, this.config);

		// 3. Build initial prompt
		let promptPackage = this.prompter.build(problem, classifierOutput, retrievalContext, this.config);

		// 4. Generate and verify candidates
		const candidateSolutions: string[] = [];
		const verificationResults: VerificationResult[] = [];
		const rawModelOutputs: string[] = [];
		let finalVerdict: Verdict = "PENDING";
		let consecutiveAdditiveFailures = 0;
		let lastFailedCode: string | undefined;

		for (let i = 0; i < this.config.maxCandidates; i++) {
			// Build prompt for this candidate
			if (i > 0) {
				const lastResult = verificationResults[verificationResults.length - 1];
				const isFullRewrite = consecutiveAdditiveFailures >= 2;

				promptPackage = this.prompter.build(problem, classifierOutput, retrievalContext, this.config, {
					candidateIndex: i,
					totalCandidates: this.config.maxCandidates,
					failureResult: lastResult,
					failedCode: lastFailedCode,
					isFullRewrite,
				});
			}

			// Stream model
			const rawOutput = await this.modelStream(`${promptPackage.systemPrompt}\n${promptPackage.userTurn}`);
			rawModelOutputs.push(rawOutput);

			// Extract code from model output
			const code = this.extractCode(rawOutput, this.config.language);
			candidateSolutions.push(code);

			// Verify
			if (this.config.enableVerifier) {
				const result = await this.verifier.verify(code, problem, this.config.language);
				result.candidateIndex = i;
				verificationResults.push(result);

				if (result.verdict === "AC") {
					finalVerdict = "AC";
					break;
				}

				lastFailedCode = code;
				consecutiveAdditiveFailures++;

				if (consecutiveAdditiveFailures >= 2) {
					// Full rewrite resets counter
					consecutiveAdditiveFailures = 0;
				}
			} else {
				finalVerdict = "PENDING";
			}
		}

		// 5. Select best candidate
		const bestIndex = this.selectBestCandidate(verificationResults);
		if (finalVerdict === "PENDING" && verificationResults.length > 0) {
			finalVerdict = verificationResults[bestIndex].verdict;
		}

		// Compute final score
		const finalScore = this.computeScore(finalVerdict, verificationResults[bestIndex]);

		// Compute total context tokens
		const totalContextTokens = promptPackage.contextTokenEstimate;

		// Build trace
		const wallTimeMs = Date.now() - startTime;
		const notes =
			finalVerdict !== "AC"
				? this.buildFailureNotes(verificationResults[bestIndex], problem)
				: "Solved successfully.";

		const trace: ExecutionTrace = {
			sessionId,
			problemId: problem.id,
			classifierOutput,
			retrievalContext,
			promptPackage,
			rawModelOutputs,
			candidateSolutions,
			verificationResults,
			finalVerdict,
			finalScore,
			totalContextTokens,
			wallTimeMs,
			timestamp: new Date().toISOString(),
			notes,
		};

		// 6. Log trace
		await this.logger.logTrace(trace);

		// 7. Archive solution if AC
		if (finalVerdict === "AC") {
			await this.logger.archiveSolution({
				key: new SolutionArchive(this.config.archiveDir).fingerprint(
					classifierOutput.domain,
					classifierOutput.subDomain,
					problem.constraints,
				),
				problemTitle: problem.title,
				domain: classifierOutput.domain,
				subDomain: classifierOutput.subDomain,
				difficulty: classifierOutput.difficulty,
				language: this.config.language,
				code: candidateSolutions[bestIndex],
				verdict: "AC",
				runTimeMs: 0,
				memoryMB: 0,
				notes: "Auto-archived after AC",
				timestamp: new Date().toISOString(),
			});
		}

		// 8. Analyze failure
		if (finalVerdict !== "AC") {
			const newGotcha = await this.analyzeFailure(trace);
			if (newGotcha) {
				await this.logger.appendGotcha(newGotcha);
			}

			// Increment hitCount on matching existing gotchas
			await this.incrementMatchingGotchas(trace);
		}

		return trace;
	}

	private extractCode(output: string, language: string): string {
		// Try to extract code from markdown code blocks
		const extMap: Record<string, string[]> = {
			cpp: ["cpp", "c++", "c"],
			python: ["python", "py"],
			java: ["java"],
			rust: ["rust", "rs"],
			typescript: ["typescript", "ts"],
		};

		const extensions = extMap[language] ?? [language];

		// Pattern: ```language ... ```
		for (const ext of extensions) {
			const pattern = new RegExp(`\`\`\`${ext.replace(/[+*]/g, "\\$&")}\\s*\\n([\\s\\S]*?)\\n\`\`\``, "i");
			const match = output.match(pattern);
			if (match) return match[1].trim();
		}

		// Try generic code block
		const genericMatch = output.match(/```\s*\n([\s\S]*?)\n```/);
		if (genericMatch) return genericMatch[1].trim();

		// Return raw output
		return output.trim();
	}

	private selectBestCandidate(results: VerificationResult[]): number {
		if (results.length === 0) return 0;

		let bestIdx = 0;

		for (let i = 1; i < results.length; i++) {
			const best = results[bestIdx];
			const current = results[i];

			// AC > highest partial pass rate > fewest warnings > shortest code
			if (this.verdictRank(current.verdict) > this.verdictRank(best.verdict)) {
				bestIdx = i;
				continue;
			}
			if (this.verdictRank(current.verdict) < this.verdictRank(best.verdict)) {
				continue;
			}

			// Compare sample pass rates
			const bestPassRate = this.samplePassRate(best);
			const curPassRate = this.samplePassRate(current);
			if (curPassRate > bestPassRate) {
				bestIdx = i;
				continue;
			}

			// Fewer warnings
			if (current.staticAnalysisWarnings.length < best.staticAnalysisWarnings.length) {
				bestIdx = i;
			}
		}

		return bestIdx;
	}

	private verdictRank(v: Verdict): number {
		switch (v) {
			case "AC":
				return 4;
			case "PARTIAL":
				return 3;
			case "PENDING":
				return 2;
			case "WA":
				return 1;
			case "TLE":
				return 1;
			case "MLE":
				return 1;
			case "RE":
				return 1;
			case "CE":
				return 0;
			default:
				return 0;
		}
	}

	private samplePassRate(result: VerificationResult): number {
		if (result.sampleCaseDetails.length === 0) return 0;
		const passed = result.sampleCaseDetails.filter((d) => d.pass).length;
		return passed / result.sampleCaseDetails.length;
	}

	private computeScore(verdict: Verdict, result?: VerificationResult): number {
		if (verdict === "AC") return 1.0;
		if (verdict === "PARTIAL" && result) {
			return this.samplePassRate(result);
		}
		return 0.0;
	}

	private buildFailureNotes(result: VerificationResult | undefined, _problem: ProblemSpec): string {
		if (!result) return "No verification performed.";

		const parts: string[] = [];
		parts.push(`Verdict: ${result.verdict}`);

		if (result.sampleCaseDetails.length > 0) {
			const failed = result.sampleCaseDetails.filter((d) => !d.pass);
			if (failed.length > 0) {
				parts.push(`Failed ${failed.length}/${result.sampleCaseDetails.length} sample cases`);
				for (const d of failed.slice(0, 3)) {
					parts.push(`  Expected: "${d.expected}"`);
					parts.push(`  Got: "${d.got}"`);
				}
			}
		}

		if (result.staticAnalysisWarnings.length > 0) {
			parts.push(`Warnings: ${result.staticAnalysisWarnings.join("; ")}`);
		}

		// Confound isolation check
		if (result.staticAnalysisWarnings.length > 1) {
			parts.push("CONFOUNDED: multiple dimensions changed — isolate on next iteration");
		}

		return parts.join("\n");
	}

	private async analyzeFailure(trace: ExecutionTrace): Promise<GotchaRecord | null> {
		if (trace.verificationResults.length === 0) return null;

		const lastResult = trace.verificationResults[trace.verificationResults.length - 1];
		const domain = trace.classifierOutput.domain;

		// Detect new gotcha patterns from failure
		if (lastResult.verdict === "WA") {
			// Check if any static warnings correlate with the failure
			for (const warning of lastResult.staticAnalysisWarnings) {
				if (warning.includes("OVERFLOW")) {
					return {
						id: `runtime-overflow-${Date.now()}`,
						domain: [domain],
						subDomain: trace.classifierOutput.subDomain || "*",
						description: "Integer overflow in intermediate calculation",
						pattern: "Integer overflow in intermediate calculation",
						symptom: "WA on large test cases due to integer overflow",
						example: trace.candidateSolutions[trace.candidateSolutions.length - 1]?.slice(0, 200) ?? "",
						fix: "Cast to larger integer type before arithmetic operations",
						frequency: 1,
						firstSeenAt: trace.problemId,
						hitCount: 1,
						skillGenIndex: 1,
					};
				}
				if (warning.includes("TLE_RISK")) {
					return {
						id: `runtime-tle-${Date.now()}`,
						domain: [domain],
						subDomain: trace.classifierOutput.subDomain || "*",
						description: "Time limit exceeded due to suboptimal algorithm or I/O",
						pattern: "Time limit exceeded due to suboptimal algorithm or I/O",
						symptom: "TLE despite correct algorithm",
						example: trace.candidateSolutions[trace.candidateSolutions.length - 1]?.slice(0, 200) ?? "",
						fix: "Use faster I/O and ensure algorithm complexity matches constraint-derived target",
						frequency: 1,
						firstSeenAt: trace.problemId,
						hitCount: 1,
						skillGenIndex: 1,
					};
				}
			}
		}

		return null;
	}

	private async incrementMatchingGotchas(trace: ExecutionTrace): Promise<void> {
		const lastResult = trace.verificationResults[trace.verificationResults.length - 1];
		if (!lastResult) return;

		// Check static warnings against known gotchas
		for (const warning of lastResult.staticAnalysisWarnings) {
			const warningLower = warning.toLowerCase();

			for (const gotcha of INITIAL_GOTCHAS) {
				if (gotcha.domain.includes(trace.classifierOutput.domain) || gotcha.domain.includes("*")) {
					if (warningLower.includes(gotcha.id.replace(/-/g, " "))) {
						await this.logger.appendGotcha({
							...gotcha,
							hitCount: gotcha.hitCount + 1,
						});
					}
				}
			}
		}
	}
}
