/**
 * Layer 5: Meta-Loop Proposer (disabled by default).
 *
 * Proposes and applies modifications to harness layers based on
 * aggregate trace analysis. Reads raw traces — never summaries.
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TraceStore } from "../store/trace-store.js";
import type { GotchaRecord, HarnessEdit, MetaAnalysis, ProblemDomain } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MetaProposer {
	analyze(traceStore: TraceStore): Promise<MetaAnalysis>;
	propose(analysis: MetaAnalysis): Promise<HarnessEdit[]>;
	apply(edits: HarnessEdit[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TraceMetaProposer implements MetaProposer {
	private readonly logDir: string;
	private readonly maxTraces: number;

	constructor(logDir: string, maxTraces = 50) {
		this.logDir = logDir;
		this.maxTraces = maxTraces;
	}

	async analyze(traceStore: TraceStore): Promise<MetaAnalysis> {
		const traces = traceStore.search({ maxResults: this.maxTraces });

		if (traces.length === 0) {
			return {
				worstDomains: [],
				topFailurePatterns: [],
				gotchaHits: [],
				contextBloat: false,
				retrievalQuality: 0,
			};
		}

		// Per-domain stats
		const domainStats = new Map<ProblemDomain, { total: number; ac: number }>();
		const failurePatterns: string[] = [];
		const gotchaHits: GotchaRecord[] = [];
		let totalContextTokens = 0;

		for (const trace of traces) {
			const domain = trace.classifierOutput.domain;
			const stats = domainStats.get(domain) ?? { total: 0, ac: 0 };
			stats.total++;
			if (trace.finalVerdict === "AC") stats.ac++;
			domainStats.set(domain, stats);

			// Collect failure patterns from notes
			if (trace.finalVerdict !== "AC" && trace.notes) {
				failurePatterns.push(trace.notes);
			}

			// Collect gotcha hits from retrieval context
			for (const gotcha of trace.retrievalContext.relevantGotchas) {
				if (gotcha.hitCount > 0) {
					gotchaHits.push(gotcha);
				}
			}

			totalContextTokens += trace.totalContextTokens;
		}

		// Worst domains: lowest AC rate (minimum 2 traces to qualify)
		const worstDomains: ProblemDomain[] = [];
		for (const [domain, stats] of domainStats) {
			if (stats.total >= 2) {
				worstDomains.push(domain);
			}
		}
		worstDomains.sort((a, b) => {
			const aRate = (domainStats.get(a)?.ac ?? 0) / (domainStats.get(a)?.total ?? 1);
			const bRate = (domainStats.get(b)?.ac ?? 0) / (domainStats.get(b)?.total ?? 1);
			return aRate - bRate;
		});

		// Extract top failure patterns (keyword frequency from notes)
		const topFailurePatterns = this.extractFailurePatterns(failurePatterns);

		// Sort gotcha hits by hitCount
		gotchaHits.sort((a, b) => b.hitCount - a.hitCount);
		const uniqueGotchaHits = [...new Map(gotchaHits.map((g) => [g.id, g])).values()].slice(0, 10);

		// Context bloat check
		const avgContextTokens = traces.length > 0 ? totalContextTokens / traces.length : 0;
		const contextBloat = avgContextTokens > 8000 * 0.8;

		// Retrieval quality: fraction of AC traces that used prior solutions
		let retrievalUsed = 0;
		let acCount = 0;
		for (const trace of traces) {
			if (trace.finalVerdict === "AC") {
				acCount++;
				if (trace.retrievalContext.priorSolutions.length > 0) {
					retrievalUsed++;
				}
			}
		}
		const retrievalQuality = acCount > 0 ? retrievalUsed / acCount : 0;

		return {
			worstDomains: worstDomains.slice(0, 5),
			topFailurePatterns: topFailurePatterns.slice(0, 10),
			gotchaHits: uniqueGotchaHits,
			contextBloat,
			retrievalQuality,
		};
	}

	async propose(analysis: MetaAnalysis): Promise<HarnessEdit[]> {
		const edits: HarnessEdit[] = [];

		// For worst domains, propose adding gotchas
		for (const domain of analysis.worstDomains.slice(0, 3)) {
			const pattern = analysis.topFailurePatterns.find((p) => p.toLowerCase().includes(domain));
			if (pattern) {
				edits.push({
					layer: "gotchas",
					editType: "add-gotcha",
					description: `Add gotcha for recurring ${domain} failure pattern`,
					diff: `+ { id: "auto-${domain}-${Date.now()}", domain: "${domain}", pattern: "${pattern.slice(0, 80)}" }`,
				});
			}
		}

		// If context bloat, propose tightening retrieval budget
		if (analysis.contextBloat) {
			edits.push({
				layer: "retriever",
				editType: "update-retrieval-ranking",
				description: "Reduce retrieval budget to avoid context overflow",
				diff: `- maxContextTokens * 0.4\n+ maxContextTokens * 0.3`,
			});
		}

		// If retrieval quality is low, propose updating ranking
		if (analysis.retrievalQuality < 0.3 && analysis.worstDomains.length > 0) {
			edits.push({
				layer: "retriever",
				editType: "update-retrieval-ranking",
				description: "Improve retrieval ranking to increase AC rate",
				diff: `+ Prioritize exact subDomain match more heavily`,
			});
		}

		return edits.slice(0, 3); // Max 3 edits per run
	}

	async apply(edits: HarnessEdit[]): Promise<void> {
		// Log the meta-loop run
		const metaDir = join(this.logDir, "meta");
		if (!existsSync(metaDir)) {
			const { mkdirSync } = await import("node:fs");
			mkdirSync(metaDir, { recursive: true });
		}

		const metaTracePath = join(metaDir, `meta-${Date.now()}.json`);
		writeFileSync(metaTracePath, JSON.stringify({ edits, timestamp: new Date().toISOString() }, null, 2), "utf-8");
	}

	private extractFailurePatterns(notes: string[]): string[] {
		const wordFreq = new Map<string, number>();
		const stopWords = new Set([
			"the",
			"a",
			"an",
			"is",
			"was",
			"are",
			"were",
			"and",
			"or",
			"in",
			"on",
			"at",
			"to",
			"for",
			"of",
			"with",
			"by",
			"from",
			"not",
			"no",
		]);

		for (const note of notes) {
			const words = note
				.toLowerCase()
				.split(/\W+/)
				.filter((w) => w.length > 3 && !stopWords.has(w));
			for (const word of words) {
				wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
			}
		}

		return [...wordFreq.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([word, count]) => `${word} (${count}x)`);
	}
}
