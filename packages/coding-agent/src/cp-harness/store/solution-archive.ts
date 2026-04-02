/**
 * Filesystem-backed solution archive with fingerprint indexing.
 *
 * Primary index: SHA256(domain + subDomain + normalizedConstraintString)
 * Secondary index: manifest.json for fast listing without loading full bodies.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArchiveQuery, Difficulty, Language, ProblemDomain, SolutionRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Manifest entry (lightweight — no code body)
// ---------------------------------------------------------------------------

interface ManifestEntry {
	key: string;
	problemTitle: string;
	domain: ProblemDomain;
	subDomain: string;
	difficulty: Difficulty;
	language: Language;
	timestamp: string;
}

interface Manifest {
	entries: ManifestEntry[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SolutionArchive {
	private readonly archiveDir: string;
	private readonly solutionsDir: string;
	private manifest: Manifest;

	constructor(archiveDir: string) {
		this.archiveDir = archiveDir;
		this.solutionsDir = join(archiveDir, "solutions");
		if (!existsSync(this.solutionsDir)) {
			mkdirSync(this.solutionsDir, { recursive: true });
		}
		this.manifest = this.loadManifest();
	}

	/**
	 * Generate a fingerprint key from domain + subDomain + constraints.
	 */
	fingerprint(domain: ProblemDomain, subDomain: string, constraints: string): string {
		const raw = `${domain}:${subDomain}:${constraints.trim()}`;
		return createHash("sha256").update(raw).digest("hex");
	}

	/**
	 * Store a solution record.
	 */
	store(record: SolutionRecord): void {
		// Write full solution
		const filePath = join(this.solutionsDir, `${record.key}.json`);
		writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");

		// Update manifest
		const existing = this.manifest.entries.findIndex((e) => e.key === record.key);
		const entry: ManifestEntry = {
			key: record.key,
			problemTitle: record.problemTitle,
			domain: record.domain,
			subDomain: record.subDomain,
			difficulty: record.difficulty,
			language: record.language,
			timestamp: record.timestamp,
		};

		if (existing >= 0) {
			this.manifest.entries[existing] = entry;
		} else {
			this.manifest.entries.push(entry);
		}

		this.saveManifest();
	}

	/**
	 * Query solutions by domain, subDomain, difficulty, language.
	 * Returns full SolutionRecords, sorted by: subDomain match, same difficulty,
	 * most recent AC timestamp, shortest code.
	 */
	query(opts: ArchiveQuery): SolutionRecord[] {
		const limit = opts.limit ?? 5;

		// Filter manifest entries
		const matching = this.manifest.entries.filter((e) => {
			if (opts.domain && e.domain !== opts.domain) return false;
			if (opts.subDomain && e.subDomain !== opts.subDomain) return false;
			if (opts.difficulty && e.difficulty !== opts.difficulty) return false;
			if (opts.language && e.language !== opts.language) return false;
			return true;
		});

		// Load full records
		const records = matching.map((e) => this.loadRecord(e.key)).filter((r): r is SolutionRecord => r !== null);

		// Sort: AC first, then subDomain exact match, same difficulty, recent, short code
		records.sort((a, b) => {
			// AC verdicts first
			if (a.verdict === "AC" && b.verdict !== "AC") return -1;
			if (a.verdict !== "AC" && b.verdict === "AC") return 1;

			// SubDomain match (exact match preferred)
			if (opts.subDomain) {
				const aMatch = a.subDomain === opts.subDomain ? 1 : 0;
				const bMatch = b.subDomain === opts.subDomain ? 1 : 0;
				if (aMatch !== bMatch) return bMatch - aMatch;
			}

			// Same difficulty preferred
			if (opts.difficulty) {
				const aMatch = a.difficulty === opts.difficulty ? 1 : 0;
				const bMatch = b.difficulty === opts.difficulty ? 1 : 0;
				if (aMatch !== bMatch) return bMatch - aMatch;
			}

			// Most recent first
			const aTime = new Date(a.timestamp).getTime();
			const bTime = new Date(b.timestamp).getTime();
			if (aTime !== bTime) return bTime - aTime;

			// Shortest code preferred (elegance proxy)
			return a.code.length - b.code.length;
		});

		return records.slice(0, limit);
	}

	/**
	 * Get solution by fingerprint key.
	 */
	getByKey(key: string): SolutionRecord | null {
		return this.loadRecord(key);
	}

	private loadRecord(key: string): SolutionRecord | null {
		const filePath = join(this.solutionsDir, `${key}.json`);
		if (!existsSync(filePath)) return null;
		try {
			const raw = readFileSync(filePath, "utf-8");
			return JSON.parse(raw) as SolutionRecord;
		} catch {
			return null;
		}
	}

	private loadManifest(): Manifest {
		const manifestPath = join(this.archiveDir, "manifest.json");
		if (existsSync(manifestPath)) {
			try {
				const raw = readFileSync(manifestPath, "utf-8");
				return JSON.parse(raw) as Manifest;
			} catch {
				// Corrupted manifest — start fresh
			}
		}
		return { entries: [] };
	}

	private saveManifest(): void {
		const manifestPath = join(this.archiveDir, "manifest.json");
		writeFileSync(manifestPath, JSON.stringify(this.manifest, null, 2), "utf-8");
	}
}
