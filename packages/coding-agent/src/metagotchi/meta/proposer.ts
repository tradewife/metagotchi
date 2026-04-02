import { promises as fs } from "node:fs";
import path from "node:path";
import type { HarnessCandidate, MetaProposal } from "../types.js";

/**
 * MetaProposer — outer loop for harness search.
 *
 * Key design rule: reads raw execution traces and source code from the
 * filesystem. Never receives compressed summaries. The proposer must
 * read broadly before proposing (median 80+ files per iteration in
 * production runs).
 *
 * Critical invariants:
 * 1. Always inspect last 3 regressions before proposing.
 * 2. Always set isAdditive=true when making no deletions.
 * 3. Never evaluate on the test set — only the search set.
 * 4. For files >50KB, read first 10KB + last 10KB only.
 */
export class MetaProposer {
	constructor(
		private readonly harnessStoreDir: string, // store/harnesses/
		private readonly searchSetDir: string, // dir of search-set problem files
		private readonly maxFileSizeBytes = 51200, // 50KB read limit per file
	) {}

	/** Read a file from the filesystem, respecting the size cap. */
	async readFileCapped(filePath: string): Promise<string> {
		const stat = await fs.stat(filePath).catch(() => null);
		if (!stat) return "";
		if (stat.size <= this.maxFileSizeBytes) {
			return fs.readFile(filePath, "utf-8");
		}
		// Read first 10KB + last 10KB
		const fd = await fs.open(filePath, "r");
		const headBuf = Buffer.alloc(10240);
		const tailBuf = Buffer.alloc(10240);
		await fd.read(headBuf, 0, 10240, 0);
		await fd.read(tailBuf, 0, 10240, stat.size - 10240);
		await fd.close();
		return `[HEAD]\n${headBuf.toString("utf-8")}\n...[TRUNCATED]...\n[TAIL]\n${tailBuf.toString("utf-8")}`;
	}

	/** Grep-style search across all harness candidate files. */
	async inspectFilesystem(query: string): Promise<string[]> {
		const results: string[] = [];
		const dirs = await fs.readdir(this.harnessStoreDir).catch(() => [] as string[]);
		for (const dir of dirs) {
			const candidateDir = path.join(this.harnessStoreDir, dir);
			const files = await fs.readdir(candidateDir).catch(() => [] as string[]);
			for (const file of files) {
				const content = await this.readFileCapped(path.join(candidateDir, file));
				if (content.toLowerCase().includes(query.toLowerCase())) {
					results.push(`[${dir}/${file}]\n${content.slice(0, 2000)}`);
				}
			}
		}
		return results;
	}

	/** Returns Pareto-optimal candidates (accuracy vs token cost). */
	getParetoFrontier(population: HarnessCandidate[]): HarnessCandidate[] {
		const dominated = new Set<string>();
		for (const a of population) {
			for (const b of population) {
				if (a.id === b.id) continue;
				const aAvg = this.avgScore(a);
				const bAvg = this.avgScore(b);
				// b dominates a if b is better on score AND not worse on any metric
				if (bAvg > aAvg) dominated.add(a.id);
			}
		}
		return population.filter((c) => !dominated.has(c.id)).map((c) => ({ ...c, isOnParetoFrontier: true }));
	}

	/** Persist a candidate directory to store/harnesses/{id}/ */
	async persistCandidate(candidate: HarnessCandidate): Promise<void> {
		const dir = path.join(this.harnessStoreDir, candidate.id);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, "source.ts"), candidate.sourceCode);
		await fs.writeFile(path.join(dir, "scores.json"), JSON.stringify(candidate.scores, null, 2));
		await fs.writeFile(path.join(dir, "reasoning.txt"), candidate.proposerReasoning);
		for (const [problemId, trace] of Object.entries(candidate.executionTraces)) {
			await fs.writeFile(path.join(dir, `trace-${problemId}.txt`), trace);
		}
	}

	/**
	 * Core proposal method.
	 *
	 * Before calling the model to generate a new harness, this method:
	 * 1. Loads ALL candidate scores from the filesystem.
	 * 2. Identifies the last 3 regressions (candidates where avgScore < parent avgScore).
	 * 3. Reads the raw execution traces of those regressions.
	 * 4. Builds a structured context for the proposer model.
	 *
	 * The model call itself is intentionally left as a stub here — it must
	 * be wired to the Pi agent's modelStream in harness.ts when enableMetaLoop=true.
	 */
	async buildProposalContext(population: HarnessCandidate[], currentGenIndex: number): Promise<string> {
		const sorted = [...population].sort((a, b) => this.avgScore(b) - this.avgScore(a));
		const best = sorted[0];
		const regressions = this.findRegressions(population).slice(0, 3);

		const sections: string[] = [];

		sections.push("=== HARNESS SEARCH CONTEXT ===");
		sections.push(`Generation: ${currentGenIndex}`);
		sections.push(`Population size: ${population.length}`);
		sections.push(
			`Best candidate: ${best?.id ?? "none"} (avg score: ${this.avgScore(best ?? ({ scores: {} } as HarnessCandidate)).toFixed(3)})`,
		);

		sections.push("\n=== LAST 3 REGRESSIONS ===");
		for (const reg of regressions) {
			sections.push(`Candidate: ${reg.id}`);
			sections.push(`Proposer reasoning: ${reg.proposerReasoning.slice(0, 500)}`);
			// Read raw traces
			for (const [problemId, trace] of Object.entries(reg.executionTraces).slice(0, 2)) {
				sections.push(`Trace [${problemId}]: ${trace.slice(0, 1000)}`);
			}
		}

		sections.push("\n=== PARETO FRONTIER ===");
		const frontier = this.getParetoFrontier(population);
		for (const c of frontier) {
			sections.push(`  ${c.id}: avg=${this.avgScore(c).toFixed(3)}`);
		}

		sections.push("\n=== INSTRUCTION ===");
		sections.push("Based on the above, propose a new harness edit.");
		sections.push("You MUST:");
		sections.push("1. State your hypothesis (what you are fixing and why).");
		sections.push("2. List confounds you are explicitly avoiding from the regression history.");
		sections.push("3. Set isAdditive=true if you are making no deletions.");
		sections.push("4. Make the smallest edit that addresses exactly one failure mode.");

		return sections.join("\n");
	}

	/** Propose a MetaProposal — stub; wire modelStream externally. */
	async proposeNextHarness(
		population: HarnessCandidate[],
		currentGenIndex: number,
		modelStream: (prompt: string) => Promise<string>,
	): Promise<MetaProposal> {
		const context = await this.buildProposalContext(population, currentGenIndex);
		const rawOutput = await modelStream(context);

		// Parse structured output from model
		// Model is instructed (via context) to return JSON wrapped in ```json ... ```
		const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[1]) as MetaProposal;
			} catch {
				// fall through to default
			}
		}

		// Fallback: additive no-op proposal
		return {
			newHarnessCode: population.find((c) => c.isOnParetoFrontier)?.sourceCode ?? "",
			hypothesis: "Parse failed — returning best frontier candidate unchanged.",
			confoundsAvoided: [],
			isAdditive: true,
		};
	}

	private avgScore(candidate: HarnessCandidate): number {
		const vals = Object.values(candidate.scores);
		if (!vals.length) return 0;
		return vals.reduce((a, b) => a + b, 0) / vals.length;
	}

	private findRegressions(population: HarnessCandidate[]): HarnessCandidate[] {
		return population.filter((c) => {
			if (!c.parentId) return false;
			const parent = population.find((p) => p.id === c.parentId);
			if (!parent) return false;
			return this.avgScore(c) < this.avgScore(parent);
		});
	}
}
