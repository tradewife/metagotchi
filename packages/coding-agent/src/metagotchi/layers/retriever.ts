/**
 * Layer 2a: Context Retrieval.
 *
 * Budget-enforced retrieval (40% of maxContextTokens).
 * Gotchas are NEVER dropped for budget reasons.
 */

import { getTemplate } from "../skills/algorithms.js";
import { formatApiRefsForPrompt, getApiRefs } from "../skills/api-refs.js";
import { filterGotchas, INITIAL_GOTCHAS, sortGotchasByHitCount } from "../skills/gotchas.js";
import type { SolutionArchive } from "../store/solution-archive.js";
import type { ClassifierOutput, GotchaRecord, HarnessConfig, RetrievalContext, SolutionRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Retriever {
	retrieve(classifier: ClassifierOutput, config: HarnessConfig): Promise<RetrievalContext>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface RetrieverOptions {
	archive: SolutionArchive;
	allGotchas?: GotchaRecord[];
}

export class ProblemRetriever implements Retriever {
	private readonly archive: SolutionArchive;
	private readonly allGotchas: GotchaRecord[];

	constructor(options: RetrieverOptions) {
		this.archive = options.archive;
		this.allGotchas = options.allGotchas ?? INITIAL_GOTCHAS;
	}

	async retrieve(classifier: ClassifierOutput, config: HarnessConfig): Promise<RetrievalContext> {
		const budget = Math.floor(config.maxContextTokens * 0.4);

		// 1. Retrieve prior solutions
		const priorSolutions = this.archive.query({
			domain: classifier.domain,
			subDomain: classifier.subDomain || undefined,
			language: config.language,
			limit: config.topKRetrieval,
		});

		// Also try to load by keys
		for (const key of classifier.priorSolutionKeys) {
			const record = this.archive.getByKey(key);
			if (record && !priorSolutions.some((s) => s.key === record.key)) {
				priorSolutions.push(record);
			}
		}

		// 2. Gotcha retrieval — NEVER capped, NEVER dropped
		const relevantGotchas = sortGotchasByHitCount(
			filterGotchas(this.allGotchas, classifier.domain, classifier.subDomain),
		);

		// 3. API snippets
		const apiRefs = getApiRefs(config.language);
		let apiSnippets = formatApiRefsForPrompt(apiRefs);

		// 4. Template code
		let templateCode = getTemplate(classifier.domain, config.language);

		// 5. Budget enforcement
		const retrievalParts = this.computeRetrievalTokens(priorSolutions, relevantGotchas, apiSnippets, templateCode);

		let totalTokens = retrievalParts.total;
		const _retrievalSummary = this.buildRetrievalSummary(priorSolutions, relevantGotchas, apiSnippets, templateCode);

		// Drop order: (a) lowest-ranked prior solutions, (b) shorten API snippets,
		// (c) truncate template — NEVER drop gotchas
		while (totalTokens > budget && priorSolutions.length > 1) {
			priorSolutions.pop();
			const updated = this.computeRetrievalTokens(priorSolutions, relevantGotchas, apiSnippets, templateCode);
			totalTokens = updated.total;
		}

		if (totalTokens > budget && apiSnippets.length > 1) {
			apiSnippets = apiSnippets.slice(0, 1);
			const updated = this.computeRetrievalTokens(priorSolutions, relevantGotchas, apiSnippets, templateCode);
			totalTokens = updated.total;
		}

		if (totalTokens > budget) {
			// Truncate template to skeleton only
			const lines = templateCode.split("\n");
			const skeletonLines = lines.filter(
				(line) =>
					line.includes("TODO") ||
					line.includes("main") ||
					line.includes("def ") ||
					line.includes("import") ||
					line.includes("#include") ||
					line.includes("using"),
			);
			templateCode = skeletonLines.join("\n");
		}

		return {
			priorSolutions,
			relevantGotchas,
			apiSnippets,
			templateCode,
		};
	}

	private computeRetrievalTokens(
		solutions: SolutionRecord[],
		gotchas: GotchaRecord[],
		apiSnippets: string[],
		templateCode: string,
	): { total: number } {
		let total = 0;
		for (const s of solutions) total += Math.ceil(s.code.length / 4);
		for (const g of gotchas) total += Math.ceil((g.pattern + g.example + g.fix).length / 4);
		for (const s of apiSnippets) total += Math.ceil(s.length / 4);
		total += Math.ceil(templateCode.length / 4);
		return { total };
	}

	private buildRetrievalSummary(
		solutions: SolutionRecord[],
		gotchas: GotchaRecord[],
		apiSnippets: string[],
		templateCode: string,
	): string {
		const parts: string[] = [];
		parts.push(`Retrieved ${solutions.length} prior solutions`);
		parts.push(`Retrieved ${gotchas.length} relevant gotchas`);
		parts.push(`Retrieved ${apiSnippets.length} API snippets`);
		parts.push(`Template: ${templateCode.split("\n").length} lines`);
		return parts.join("; ");
	}
}
