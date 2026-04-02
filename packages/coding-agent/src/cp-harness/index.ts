// packages/coding-agent/src/cp-harness/index.ts
// Re-exports only. No implementation here.

export { defaultConfig, HarnessRunner, type ModelStreamFn } from "./harness.js";
export type { Classifier } from "./layers/classifier.js";
export type { Logger } from "./layers/logger.js";
export type { Prompter, PrompterOptions } from "./layers/prompter.js";
export type { Retriever } from "./layers/retriever.js";
export type { Verifier } from "./layers/verifier.js";
export type { MetaProposer } from "./meta/proposer.js";
export type {
	ArchiveQuery,
	ClassifierOutput,
	Difficulty,
	ExecutionTrace,
	GotchaRecord,
	HarnessConfig,
	HarnessEdit,
	Language,
	MetaAnalysis,
	ProblemDomain,
	ProblemSpec,
	PromptPackage,
	RetrievalContext,
	SolutionRecord,
	SprintContract,
	TraceQuery,
	TraceStoreStats,
	Verdict,
	VerificationResult,
} from "./types.js";
