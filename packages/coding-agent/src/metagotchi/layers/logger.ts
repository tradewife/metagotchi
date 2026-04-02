/**
 * Layer 4: Trace Logger.
 *
 * Raw traces, not summaries. Flat JSON. Append-only.
 * Gotcha auto-update on non-AC runs. Solution archival on AC runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { currentSkillGenIndex } from "../skills/gotchas.js";
import { SolutionArchive } from "../store/solution-archive.js";
import { TraceStore } from "../store/trace-store.js";
import type { ExecutionTrace, GotchaRecord, HarnessConfig, SolutionRecord, TraceQuery } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Logger {
	logTrace(trace: ExecutionTrace): Promise<string>;
	readTrace(sessionId: string): Promise<ExecutionTrace>;
	listTraces(filter?: Partial<TraceQuery>): Promise<string[]>;
	appendGotcha(gotcha: GotchaRecord): Promise<void>;
	archiveSolution(record: SolutionRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TraceLogger implements Logger {
	private readonly traceStore: TraceStore;
	private readonly solutionArchive: SolutionArchive;
	private readonly gotchasDir: string;

	constructor(config: HarnessConfig) {
		const tracesDir = join(config.logDir, "traces");
		this.traceStore = new TraceStore(tracesDir);
		this.solutionArchive = new SolutionArchive(config.archiveDir);
		this.gotchasDir = config.gotchasDir;

		if (!existsSync(this.gotchasDir)) {
			mkdirSync(this.gotchasDir, { recursive: true });
		}
	}

	async logTrace(trace: ExecutionTrace): Promise<string> {
		// Save full solutions to disk
		const sessionDir = this.traceStore.save(trace);

		// Save candidate solutions
		const solutionsDir = join(sessionDir, "solutions");
		if (!existsSync(solutionsDir)) {
			mkdirSync(solutionsDir, { recursive: true });
		}
		for (let i = 0; i < trace.candidateSolutions.length; i++) {
			const ext = this.getExtension(trace.promptPackage);
			writeFileSync(join(solutionsDir, `candidate-${i}.${ext}`), trace.candidateSolutions[i], "utf-8");
		}

		// Save verification results
		if (trace.verificationResults.length > 0) {
			const verifDir = join(sessionDir, "verification");
			if (!existsSync(verifDir)) {
				mkdirSync(verifDir, { recursive: true });
			}
			for (let i = 0; i < trace.verificationResults.length; i++) {
				writeFileSync(
					join(verifDir, `result-${i}.json`),
					JSON.stringify(trace.verificationResults[i], null, 2),
					"utf-8",
				);
			}
		}

		return sessionDir;
	}

	async readTrace(sessionId: string): Promise<ExecutionTrace> {
		const trace = this.traceStore.load(sessionId);
		if (!trace) {
			throw new Error(`Trace not found: ${sessionId}`);
		}
		return trace;
	}

	async listTraces(filter?: Partial<TraceQuery>): Promise<string[]> {
		if (!filter || Object.keys(filter).length === 0) {
			return this.traceStore.listSessionIds();
		}

		const traces = this.traceStore.search(filter);
		return traces.map((t) => t.sessionId);
	}

	async appendGotcha(gotcha: GotchaRecord): Promise<void> {
		const gotchasPath = join(this.gotchasDir, "gotchas.json");

		let gotchas: GotchaRecord[] = [];
		if (existsSync(gotchasPath)) {
			try {
				const raw = readFileSync(gotchasPath, "utf-8");
				gotchas = JSON.parse(raw) as GotchaRecord[];
			} catch {
				gotchas = [];
			}
		}

		// Check for duplicate
		const existing = gotchas.findIndex(
			(g) => g.id === gotcha.id || (g.domain === gotcha.domain && g.pattern === gotcha.pattern),
		);

		if (existing >= 0) {
			// Increment hitCount on existing
			gotchas[existing].hitCount++;
			gotchas[existing].skillGenIndex = currentSkillGenIndex;
		} else {
			// Append new
			gotchas.push({
				...gotcha,
				skillGenIndex: currentSkillGenIndex,
			});
		}

		writeFileSync(gotchasPath, JSON.stringify(gotchas, null, 2), "utf-8");
	}

	async archiveSolution(record: SolutionRecord): Promise<void> {
		this.solutionArchive.store(record);
	}

	/**
	 * Load all gotchas from the gotchas directory.
	 */
	loadGotchas(): GotchaRecord[] {
		const gotchasPath = join(this.gotchasDir, "gotchas.json");
		if (!existsSync(gotchasPath)) return [];

		try {
			const raw = readFileSync(gotchasPath, "utf-8");
			return JSON.parse(raw) as GotchaRecord[];
		} catch {
			return [];
		}
	}

	private getExtension(_prompt: { systemPrompt: string }): string {
		const sys = _prompt.systemPrompt;
		if (sys.includes("C++") || sys.includes("cpp")) return "cpp";
		if (sys.includes("Python")) return "py";
		if (sys.includes("Java")) return "java";
		if (sys.includes("Rust")) return "rs";
		if (sys.includes("TypeScript")) return "ts";
		return "txt";
	}
}
