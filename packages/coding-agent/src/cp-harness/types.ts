/**
 * Core types for the Competitive Programming Harness.
 *
 * All shared interfaces and enums used across layers, skills, and store.
 */

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

export type ProblemDomain =
	| "graph"
	| "dp"
	| "math"
	| "geometry"
	| "string"
	| "data-structure"
	| "greedy"
	| "combinatorics"
	| "number-theory"
	| "interactive"
	| "ml-data"
	| "systems"
	| "unknown";

export type Difficulty = "easy" | "medium" | "hard" | "extreme";

export type Verdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "PARTIAL" | "PENDING";

export type Language = "cpp" | "python" | "java" | "rust" | "typescript";

// ---------------------------------------------------------------------------
// Problem & Sprint Contract
// ---------------------------------------------------------------------------

export interface ProblemSpec {
	id: string;
	title: string;
	statement: string;
	constraints: string;
	examples: Array<{ input: string; output: string }>;
	timeLimit: number; // ms
	memoryLimit: number; // MB
	language: Language;
}

export interface SprintContract {
	algorithmClassification: string; // e.g. "Segment Tree with Lazy Propagation"
	complexityTarget: string; // e.g. "O(N log N)"
	mandatoryEdgeCases: string[]; // e.g. ["N=1", "disconnected graph"]
	likelyAlgorithms: string[];
	domain: ProblemDomain;
	subDomain: string;
}

// ---------------------------------------------------------------------------
// Classifier output
// ---------------------------------------------------------------------------

export interface ClassifierOutput {
	domain: ProblemDomain;
	subDomain: string; // e.g. "shortest-path", "tree-dp", "segment-tree"
	difficulty: Difficulty;
	likelyAlgorithms: string[]; // ordered by confidence
	edgeCaseFlags: string[]; // e.g. "overflow", "empty-input"
	priorSolutionKeys: string[]; // keys into solution archive
	sprintContract: SprintContract;
}

// ---------------------------------------------------------------------------
// Retrieval context
// ---------------------------------------------------------------------------

export interface RetrievalContext {
	priorSolutions: SolutionRecord[];
	relevantGotchas: GotchaRecord[];
	apiSnippets: string[];
	templateCode: string;
}

// ---------------------------------------------------------------------------
// Prompt package
// ---------------------------------------------------------------------------

export interface PromptPackage {
	systemPrompt: string;
	userTurn: string;
	contextTokenEstimate: number;
	retrievalSummary: string; // what was retrieved and why (logged, not sent to model)
}

// ---------------------------------------------------------------------------
// Solution record
// ---------------------------------------------------------------------------

export interface SolutionRecord {
	key: string; // SHA256(domain + subDomain + constraintSignature)
	problemTitle: string;
	domain: ProblemDomain;
	subDomain: string;
	difficulty: Difficulty;
	language: Language;
	code: string;
	verdict: Verdict;
	runTimeMs: number;
	memoryMB: number;
	notes: string;
	timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Gotcha record
// ---------------------------------------------------------------------------

export interface GotchaRecord {
	id: string;
	domain: ProblemDomain | "*"; // "*" = cross-domain
	subDomain: string | "*";
	pattern: string;
	example: string;
	fix: string;
	firstSeenAt: string;
	hitCount: number;
	skillGenIndex: number;
}

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

export interface VerificationResult {
	candidateIndex: number;
	compilesOrParses: boolean;
	sampleCasesPassed: boolean;
	sampleCaseDetails: Array<{
		input: string;
		expected: string;
		got: string;
		pass: boolean;
	}>;
	staticAnalysisWarnings: string[];
	estimatedComplexity: string; // e.g. "O(n log n)"
	verdict: Verdict;
}

// ---------------------------------------------------------------------------
// Execution trace
// ---------------------------------------------------------------------------

export interface ExecutionTrace {
	sessionId: string;
	problemId: string;
	classifierOutput: ClassifierOutput;
	retrievalContext: RetrievalContext;
	promptPackage: PromptPackage;
	rawModelOutputs: string[];
	candidateSolutions: string[];
	verificationResults: VerificationResult[];
	finalVerdict: Verdict;
	finalScore: number; // 0–1
	totalContextTokens: number;
	wallTimeMs: number;
	timestamp: string;
	notes: string;
}

// ---------------------------------------------------------------------------
// Harness configuration
// ---------------------------------------------------------------------------

export interface HarnessConfig {
	maxCandidates: number; // default 3
	topKRetrieval: number; // default 5
	maxContextTokens: number; // default 8000
	enableVerifier: boolean; // default true
	enableMetaLoop: boolean; // default false
	language: Language;
	logDir: string;
	archiveDir: string;
	gotchasDir: string;
}

// ---------------------------------------------------------------------------
// Trace store query & stats
// ---------------------------------------------------------------------------

export interface TraceQuery {
	domain?: ProblemDomain;
	verdict?: Verdict;
	since?: string; // ISO timestamp
	maxResults?: number; // default 20
}

export interface TraceStoreStats {
	totalTraces: number;
	acRate: number;
	avgContextTokens: number;
	domainBreakdown: Record<string, number>;
	topGotchas: GotchaRecord[];
}

// ---------------------------------------------------------------------------
// Solution archive query
// ---------------------------------------------------------------------------

export interface ArchiveQuery {
	domain?: ProblemDomain;
	subDomain?: string;
	difficulty?: Difficulty;
	language?: Language;
	limit?: number; // default 5
}

// ---------------------------------------------------------------------------
// Meta-loop types
// ---------------------------------------------------------------------------

export interface MetaAnalysis {
	worstDomains: ProblemDomain[];
	topFailurePatterns: string[];
	gotchaHits: GotchaRecord[];
	contextBloat: boolean;
	retrievalQuality: number;
}

export interface HarnessEdit {
	layer: "classifier" | "retriever" | "prompter" | "verifier" | "gotchas" | "algorithms";
	editType: "add-gotcha" | "update-template" | "update-keyword-map" | "update-retrieval-ranking";
	description: string;
	diff: string;
}
