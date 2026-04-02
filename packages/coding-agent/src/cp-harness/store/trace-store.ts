/**
 * Filesystem-backed execution trace store.
 *
 * Flat JSON traces, lazy stats with 60-second cache, search by domain/verdict/date.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionTrace, GotchaRecord, TraceQuery, TraceStoreStats } from "../types.js";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TraceStore {
	private readonly tracesDir: string;
	private statsCache: TraceStoreStats | null = null;
	private statsCacheTime = 0;
	private readonly STATS_TTL_MS = 60_000;

	constructor(tracesDir: string) {
		this.tracesDir = tracesDir;
		if (!existsSync(this.tracesDir)) {
			mkdirSync(this.tracesDir, { recursive: true });
		}
	}

	/**
	 * Save a trace. Returns the directory path.
	 */
	save(trace: ExecutionTrace): string {
		const sessionDir = join(this.tracesDir, trace.sessionId);
		mkdirSync(sessionDir, { recursive: true });

		// Write trace.json (flat JSON)
		writeFileSync(join(sessionDir, "trace.json"), JSON.stringify(trace, null, 2), "utf-8");

		// Write problem.txt
		writeFileSync(join(sessionDir, "problem.txt"), trace.problemId, "utf-8");

		// Write classifier.json
		writeFileSync(join(sessionDir, "classifier.json"), JSON.stringify(trace.classifierOutput, null, 2), "utf-8");

		// Write prompt.txt
		writeFileSync(
			join(sessionDir, "prompt.txt"),
			`${trace.promptPackage.systemPrompt}\n---\n${trace.promptPackage.userTurn}`,
			"utf-8",
		);

		// Write notes.txt
		writeFileSync(join(sessionDir, "notes.txt"), trace.notes, "utf-8");

		// Invalidate stats cache
		this.statsCache = null;

		return sessionDir;
	}

	/**
	 * Load a trace by sessionId.
	 */
	load(sessionId: string): ExecutionTrace | null {
		const tracePath = join(this.tracesDir, sessionId, "trace.json");
		if (!existsSync(tracePath)) return null;
		try {
			const raw = readFileSync(tracePath, "utf-8");
			return JSON.parse(raw) as ExecutionTrace;
		} catch {
			return null;
		}
	}

	/**
	 * Search traces by domain, verdict, and/or date.
	 */
	search(query: TraceQuery): ExecutionTrace[] {
		const maxResults = query.maxResults ?? 20;
		const results: ExecutionTrace[] = [];

		if (!existsSync(this.tracesDir)) return results;

		const sessions = readdirSync(this.tracesDir);
		for (const sessionId of sessions) {
			const trace = this.load(sessionId);
			if (!trace) continue;

			if (query.domain && trace.classifierOutput.domain !== query.domain) continue;
			if (query.verdict && trace.finalVerdict !== query.verdict) continue;
			if (query.since && trace.timestamp < query.since) continue;

			results.push(trace);
			if (results.length >= maxResults) break;
		}

		return results;
	}

	/**
	 * Compute aggregate stats. Cached for 60 seconds.
	 */
	stats(): TraceStoreStats {
		const now = Date.now();
		if (this.statsCache && now - this.statsCacheTime < this.STATS_TTL_MS) {
			return this.statsCache;
		}

		if (!existsSync(this.tracesDir)) {
			return this.emptyStats();
		}

		const sessions = readdirSync(this.tracesDir);
		let totalTraces = 0;
		let acCount = 0;
		let totalContextTokens = 0;
		const domainBreakdown: Record<string, number> = {};
		const _gotchaMap = new Map<string, GotchaRecord>();

		for (const sessionId of sessions) {
			const trace = this.load(sessionId);
			if (!trace) continue;

			totalTraces++;
			if (trace.finalVerdict === "AC") acCount++;
			totalContextTokens += trace.totalContextTokens;

			const domain = trace.classifierOutput.domain;
			domainBreakdown[domain] = (domainBreakdown[domain] ?? 0) + 1;
		}

		const acRate = totalTraces > 0 ? acCount / totalTraces : 0;
		const avgContextTokens = totalTraces > 0 ? Math.round(totalContextTokens / totalTraces) : 0;

		// Top gotchas — read from gotcha files if present
		const topGotchas = this.readTopGotchas();

		const result: TraceStoreStats = {
			totalTraces,
			acRate,
			avgContextTokens,
			domainBreakdown,
			topGotchas,
		};

		this.statsCache = result;
		this.statsCacheTime = now;

		return result;
	}

	/**
	 * List all session IDs.
	 */
	listSessionIds(): string[] {
		if (!existsSync(this.tracesDir)) return [];
		return readdirSync(this.tracesDir).sort();
	}

	private readTopGotchas(): GotchaRecord[] {
		// Gotchas are stored separately — this is a placeholder
		// The Logger layer handles gotcha persistence
		return [];
	}

	private emptyStats(): TraceStoreStats {
		return {
			totalTraces: 0,
			acRate: 0,
			avgContextTokens: 0,
			domainBreakdown: {},
			topGotchas: [],
		};
	}
}
