/**
 * Layer 2b: Prompt Construction.
 *
 * Constructs the exact PromptPackage sent to the Generator.
 * Token estimation: 4-chars-per-token heuristic.
 * Supports multi-candidate variation and additive editing.
 */

import type {
	ClassifierOutput,
	HarnessConfig,
	ProblemSpec,
	PromptPackage,
	RetrievalContext,
	VerificationResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Prompter {
	build(
		problem: ProblemSpec,
		classifier: ClassifierOutput,
		context: RetrievalContext,
		config: HarnessConfig,
		options?: PrompterOptions,
	): PromptPackage;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PrompterOptions {
	candidateIndex?: number;
	totalCandidates?: number;
	failureResult?: VerificationResult;
	failedCode?: string;
	isFullRewrite?: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ProblemPrompter implements Prompter {
	build(
		problem: ProblemSpec,
		classifier: ClassifierOutput,
		context: RetrievalContext,
		config: HarnessConfig,
		options: PrompterOptions = {},
	): PromptPackage {
		const candidateIdx = options.candidateIndex ?? 0;
		const totalCandidates = options.totalCandidates ?? 1;

		const systemPrompt = this.buildSystemPrompt(problem, classifier, context, config, candidateIdx, totalCandidates);

		let userTurn = this.buildUserTurn(problem, classifier, config);

		// Additive editing: append failure info
		if (options.failureResult && options.failedCode) {
			userTurn += this.buildFailureBlock(options.failureResult, options.failedCode, options.isFullRewrite);
		}

		const fullPrompt = `${systemPrompt}\n${userTurn}`;
		const contextTokenEstimate = Math.ceil(fullPrompt.length / 4);

		const retrievalSummary = this.buildRetrievalSummary(context);

		const pkg: PromptPackage = {
			systemPrompt,
			userTurn,
			contextTokenEstimate,
			retrievalSummary,
		};

		// Token budget enforcement
		return this.enforceTokenBudget(pkg, config.maxContextTokens, context);
	}

	private buildSystemPrompt(
		problem: ProblemSpec,
		classifier: ClassifierOutput,
		context: RetrievalContext,
		config: HarnessConfig,
		candidateIndex: number,
		totalCandidates: number,
	): string {
		const parts: string[] = [];

		parts.push("You are an elite competitive programmer solving problems at ICPC World Finals / IOI difficulty.");

		parts.push("## Task");
		parts.push(
			"Solve the competitive programming problem below. Output ONLY the final solution code. No prose, no explanation.",
		);

		parts.push("## Language");
		parts.push(config.language);

		parts.push("## Domain Hints (pre-classified — trust these)");
		parts.push(`Domain: ${classifier.domain} / ${classifier.subDomain || "general"}`);
		parts.push(`Algorithm target: ${classifier.sprintContract.algorithmClassification}`);
		parts.push(`Complexity target: ${classifier.sprintContract.complexityTarget}`);
		parts.push(`Likely algorithms (ranked by confidence): ${classifier.likelyAlgorithms.join(", ")}`);

		// Sprint Contract — Mandatory Edge Cases
		if (classifier.sprintContract.mandatoryEdgeCases.length > 0) {
			parts.push("## Sprint Contract — Mandatory Edge Cases");
			parts.push("The following edge cases MUST be handled. They will be tested:");
			classifier.sprintContract.mandatoryEdgeCases.forEach((ec, i) => {
				parts.push(`${i + 1}. ${ec}`);
			});
		}

		// Critical Gotchas
		if (context.relevantGotchas.length > 0) {
			parts.push("## Critical Gotchas — DO NOT repeat these failures");
			for (const g of context.relevantGotchas) {
				parts.push(`PATTERN: ${g.pattern}`);
				parts.push(`EXAMPLE: ${g.example}`);
				parts.push(`FIX: ${g.fix}`);
				parts.push("");
			}
		}

		// Prior Solutions
		if (context.priorSolutions.length > 0) {
			parts.push("## Prior Solutions (similar problems — verified AC)");
			for (const sol of context.priorSolutions) {
				parts.push(`### ${sol.problemTitle} (${sol.subDomain}, ${sol.difficulty})`);
				parts.push(`\`\`\`${config.language}`);
				parts.push(sol.code);
				parts.push("```");
				parts.push("");
			}
		}

		// Code Template
		if (candidateIndex % 2 === 0) {
			// Include template for even-indexed candidates
			parts.push("## Code Template");
			parts.push(`\`\`\`${config.language}`);
			parts.push(context.templateCode);
			parts.push("```");
		}

		// API Reference
		if (context.apiSnippets.length > 0) {
			parts.push("## API Reference");
			for (const snippet of context.apiSnippets) {
				parts.push(snippet);
			}
		}

		// Constraint Analysis
		parts.push("## Constraint Analysis");
		parts.push(problem.constraints);
		parts.push(classifier.sprintContract.complexityTarget);

		// Output Format
		parts.push("## Output Format");
		parts.push(`Return ONLY valid ${config.language} code. Requirements:`);
		parts.push("1. Read from stdin, write to stdout");
		parts.push("2. Handle ALL edge cases listed in the Sprint Contract above");
		parts.push(`3. Stay within ${problem.timeLimit}ms / ${problem.memoryLimit}MB`);
		parts.push("4. Use the algorithm(s) consistent with the complexity target above");
		if (config.language === "cpp") {
			parts.push("5. In C++: always use `ios::sync_with_stdio(false); cin.tie(nullptr);` at top of main()");
		}

		// Multi-candidate variation
		if (totalCandidates > 1) {
			parts.push("## Approach Variation");
			if (candidateIndex === 0) {
				parts.push("Prefer the simplest correct approach.");
			} else if (candidateIndex === 1) {
				parts.push("Prefer the most robust approach — optimize for correctness over elegance.");
			} else {
				parts.push("Try a different algorithmic approach than the obvious one.");
			}
		}

		// Interactive protocol
		if (classifier.domain === "interactive") {
			parts.push("## Interactive Protocol");
			parts.push("This is an interactive problem. You MUST:");
			parts.push("- Flush output after every query (use `endl` or `flush()` in C++, `flush=True` in Python)");
			parts.push("- Do NOT buffer output");
			parts.push("- Read judge responses after each query before proceeding");
		}

		return parts.join("\n");
	}

	private buildUserTurn(problem: ProblemSpec, _classifier: ClassifierOutput, _config: HarnessConfig): string {
		const parts: string[] = [];

		parts.push(`# ${problem.title}`);
		parts.push("");
		parts.push(problem.statement);
		parts.push("");

		// Examples
		if (problem.examples.length > 0) {
			parts.push("## Examples");
			for (const ex of problem.examples) {
				parts.push(`Input:\n${ex.input}`);
				parts.push(`Output:\n${ex.output}`);
				parts.push("");
			}
		}

		return parts.join("\n");
	}

	private buildFailureBlock(result: VerificationResult, failedCode: string, isFullRewrite?: boolean): string {
		const parts: string[] = [];

		if (isFullRewrite) {
			parts.push("\n## FULL REWRITE REQUIRED");
			parts.push("The previous approach failed twice with additive edits. Start fresh.");
		} else {
			parts.push("\n## Previous Attempt Failed — Fix It");
			parts.push("Do NOT rewrite from scratch. Modify the previous solution to fix the specific failure.");
		}

		parts.push(`\n### Verdict: ${result.verdict}`);

		if (result.sampleCaseDetails.length > 0) {
			parts.push("\n### Failed Sample Cases:");
			for (const detail of result.sampleCaseDetails) {
				if (!detail.pass) {
					parts.push(`Input:\n${detail.input}`);
					parts.push(`Expected:\n${detail.expected}`);
					parts.push(`Got:\n${detail.got}`);
					parts.push("");
				}
			}
		}

		if (result.staticAnalysisWarnings.length > 0) {
			parts.push("\n### Static Analysis Warnings:");
			for (const w of result.staticAnalysisWarnings) {
				parts.push(`- ${w}`);
			}
		}

		parts.push("\n### Previous Code:");
		parts.push("```");
		parts.push(failedCode);
		parts.push("```");

		return parts.join("\n");
	}

	private enforceTokenBudget(pkg: PromptPackage, maxTokens: number, _context: RetrievalContext): PromptPackage {
		let systemPrompt = pkg.systemPrompt;

		while (Math.ceil((systemPrompt + pkg.userTurn).length / 4) > maxTokens) {
			// Drop order: (a) prior solutions, (b) API snippets, (c) template
			if (systemPrompt.includes("## Prior Solutions")) {
				systemPrompt = this.removeSection(systemPrompt, "## Prior Solutions");
				continue;
			}
			if (systemPrompt.includes("## API Reference")) {
				systemPrompt = this.removeSection(systemPrompt, "## API Reference");
				continue;
			}
			if (systemPrompt.includes("## Code Template")) {
				systemPrompt = this.removeSection(systemPrompt, "## Code Template");
				continue;
			}
			break;
		}

		// NEVER drop gotchas or edge case flags
		return {
			...pkg,
			systemPrompt,
			contextTokenEstimate: Math.ceil((systemPrompt + pkg.userTurn).length / 4),
		};
	}

	private removeSection(text: string, header: string): string {
		const start = text.indexOf(header);
		if (start === -1) return text;

		// Find the next ## section
		const nextSection = text.indexOf("\n## ", start + header.length);
		if (nextSection === -1) {
			return text.slice(0, start);
		}
		return text.slice(0, start) + text.slice(nextSection);
	}

	private buildRetrievalSummary(context: RetrievalContext): string {
		const parts: string[] = [];
		parts.push(`Retrieved ${context.priorSolutions.length} prior solutions`);
		parts.push(`Retrieved ${context.relevantGotchas.length} relevant gotchas`);
		parts.push(`Retrieved ${context.apiSnippets.length} API snippets`);
		parts.push(`Template: ${context.templateCode.split("\n").length} lines`);
		return parts.join("; ");
	}
}
