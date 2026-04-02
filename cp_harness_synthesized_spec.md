# Elite Competitive Programming Harness
## Synthesized Full Specification — Handover Document for the Pi Coding Agent

> **This document is the single source of truth. Read it in full before writing a single line of code.**
> Location: `packages/coding-agent/src/cp-harness/` within the `pi-mono` monorepo.
> The agent implementing this must follow **Pi Agent Integration Rules (Part 15)** at all times.

---

## Executive Summary

This document specifies a competitive programming (CP) harness built within the `pi-mono` monorepo under `packages/coding-agent`. The harness is a stateful program `H` that wraps the Pi Coding Agent (base model `M`, frozen) and governs every piece of context `M` sees — from problem classification through retrieval, prompt construction, solution generation, multi-agent verification, and post-run logging.

**The core empirical insight driving design**: raw execution traces outperform summaries as feedback. Full filesystem access to prior candidates beats scalar-score-only or summary-only interfaces by >10 accuracy points. The harness must be built to support this diagnostic loop from day one.

**The three-agent "GAN" loop** (Planner → Generator → Evaluator) is the operating model. Responsibilities are strictly decoupled. The Pi Coding Agent is always the **Generator** — it never acts as Planner or Evaluator simultaneously.

The harness does **not** modify the model. It shapes the information environment around it.

---

## Part 1 — Architectural Overview

### 1.1 Harness as a Stateful Program

A harness is a stateful program `H` that wraps a language model `M`. Given a task instance `x`, it executes a rollout `ρ(M, H, x)`: constructing prompts for `M`, receiving responses, updating state, and logging traces.

The objective function is:

```
H* = argmax_H E_{x ~ X} [ r(ρ(M, H, x), x) ]
```

For competitive programming, `r` maps verdicts to scores: AC = 1.0, PARTIAL = score/100, WA/TLE/MLE/RE/CE = 0.0. Secondary objective: minimize context tokens consumed per solve.

### 1.2 Harness Layers

The harness consists of five composable layers, each independently upgradeable and exposing a typed TypeScript interface:

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 5 — Meta-Loop (outer search / self-improvement)        │
│  LAYER 4 — Logging & Trace Store (filesystem)                 │
│  LAYER 3 — Verification & Validation (The Skeptic)            │
│  LAYER 2 — Prompt Construction & Retrieval (Context Engine)   │
│  LAYER 1 — Problem Classification & Triage (The Strategist)   │
└──────────────────────────────────────────────────────────────┘
                     ↕ calls ↕
             Base Model M (frozen — Pi Coding Agent)
```

Layers are composed by reference, never monolithically. Each layer can be swapped without touching adjacent layers.

### 1.3 The Three-Agent GAN Loop

| Agent | Role | Identity |
|---|---|---|
| **Planner (Strategist)** | Analyzes problem, emits Sprint Contract | Harness Layer 1 (Classifier) |
| **Generator** | Implements solution per Sprint Contract | Pi Coding Agent (`M`) |
| **Evaluator (Skeptic)** | Attempts to break the generated solution | Harness Layer 3 (Verifier) |

The Planner and Evaluator are harness code — deterministic, tool-driven, never LLM self-evaluation. This avoids self-evaluation bias.

### 1.4 Repository Integration

All code lives at: `packages/coding-agent/src/cp-harness/`

The harness reuses existing pi-mono infrastructure — do not reinvent:
- `packages/ai` — provider-agnostic model streaming
- `packages/coding-agent/src/core/model-resolver.ts` — model selection (read-only import)
- `packages/coding-agent/test/suite/harness.ts` + faux provider — test infrastructure
- `packages/coding-agent/test/suite/regressions/` — per-issue regression tests

Do **not** introduce new root-level dependencies without updating `package.json` at the repo root and running `npm run check`.

---

## Part 2 — Directory Structure

```
packages/coding-agent/
└── src/
    └── cp-harness/
        ├── index.ts                  # Public API surface — re-exports only
        ├── types.ts                  # All shared interfaces and enums
        ├── harness.ts                # Main HarnessRunner class (entry point)
        │
        ├── layers/
        │   ├── classifier.ts         # Layer 1: Problem triage (Planner)
        │   ├── retriever.ts          # Layer 2a: Context retrieval
        │   ├── prompter.ts           # Layer 2b: Prompt construction
        │   ├── verifier.ts           # Layer 3: Solution verification (Evaluator)
        │   └── logger.ts             # Layer 4: Trace logging
        │
        ├── skills/
        │   ├── algorithms.ts         # Sub-domain templates + constraint→algorithm map
        │   ├── gotchas.ts            # HIGHEST PRIORITY — failure patterns (seed + runtime)
        │   ├── api-refs.ts           # Language-specific API refs (gotchas-first format)
        │   └── verification.ts       # Stress-test / verification script templates
        │
        ├── store/
        │   ├── trace-store.ts        # Filesystem-backed execution trace store
        │   └── solution-archive.ts   # Indexed AC solution archive
        │
        └── meta/
            └── proposer.ts           # Layer 5: Meta-loop harness proposer (disabled by default)

packages/coding-agent/
└── test/
    └── suite/
        └── cp-harness/
            ├── classifier.test.ts
            ├── retriever.test.ts
            ├── prompter.test.ts
            ├── verifier.test.ts
            ├── logger.test.ts
            ├── harness.test.ts
            └── regressions/          # Per-issue regression tests (append-only)
```

All files use standard top-level imports. No inline `await import()`. No dynamic imports for types.

---

## Part 3 — Filesystem Layout (Runtime)

The harness runtime writes to three configurable directories:

```
{logDir}/
└── traces/
    └── {sessionId}/
        ├── trace.json          # Full ExecutionTrace — flat JSON, grep-able
        ├── problem.txt         # Raw problem statement
        ├── classifier.json     # ClassifierOutput
        ├── retrieval.json      # RetrievalContext (what was retrieved and why)
        ├── prompt.txt          # Full prompt package sent to model
        ├── sprint_contract.json  # Planner's Sprint Contract
        ├── solutions/
        │   ├── candidate-0.{ext}
        │   ├── candidate-1.{ext}
        │   └── ...
        ├── verification/
        │   ├── result-0.json
        │   └── ...
        └── notes.txt           # Human/agent failure analysis

{archiveDir}/
└── solutions/
    └── {key}.json              # SolutionRecord indexed by fingerprint
    └── manifest.json           # Fast-listing index (no full solution bodies)

{gotchasDir}/
└── gotchas.json                # Array<GotchaRecord> — append-only, never delete
```

**Key rule**: traces are **append-only**. Never delete. Compress with gzip after 30 days. The meta-loop depends on full history.

---

## Part 4 — Core Types (`types.ts`)

```typescript
// packages/coding-agent/src/cp-harness/types.ts

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

export interface ProblemSpec {
  id: string;
  title: string;
  statement: string;
  constraints: string;
  examples: Array<{ input: string; output: string }>;
  timeLimit: number;       // ms
  memoryLimit: number;     // MB
  language: Language;
}

export interface SprintContract {
  algorithmClassification: string;    // e.g. "Segment Tree with Lazy Propagation"
  complexityTarget: string;           // e.g. "O(N log N)"
  mandatoryEdgeCases: string[];       // e.g. ["N=1", "disconnected graph", "max integers"]
  likelyAlgorithms: string[];
  domain: ProblemDomain;
  subDomain: string;
}

export interface ClassifierOutput {
  domain: ProblemDomain;
  subDomain: string;           // e.g. "shortest-path", "tree-dp", "segment-tree"
  difficulty: Difficulty;
  likelyAlgorithms: string[];  // ordered by confidence
  edgeCaseFlags: string[];     // e.g. "overflow", "empty-input", "negative-weights"
  priorSolutionKeys: string[]; // keys into solution archive
  sprintContract: SprintContract;
}

export interface RetrievalContext {
  priorSolutions: SolutionRecord[];   // top-k by similarity
  relevantGotchas: GotchaRecord[];    // domain-specific failure patterns
  apiSnippets: string[];              // language-specific API hints
  templateCode: string;               // scaffolded code for domain/language
}

export interface PromptPackage {
  systemPrompt: string;
  userTurn: string;
  contextTokenEstimate: number;
  retrievalSummary: string;           // what was retrieved and why (logged, not sent to model)
}

export interface SolutionRecord {
  key: string;             // SHA256(domain + subDomain + constraintSignature)
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
  timestamp: string;       // ISO 8601
}

export interface GotchaRecord {
  id: string;
  domain: ProblemDomain | "*";  // "*" = cross-domain
  subDomain: string | "*";
  pattern: string;         // short description of the failure pattern
  example: string;         // concrete code or scenario that triggers it
  fix: string;             // how to avoid or fix it
  firstSeenAt: string;     // problem ID where this was first observed
  hitCount: number;        // how many times this has caused failures
  skillGenIndex: number;   // version stamp to prevent stale rewards
}

export interface ExecutionTrace {
  sessionId: string;
  problemId: string;
  classifierOutput: ClassifierOutput;
  retrievalContext: RetrievalContext;
  promptPackage: PromptPackage;
  rawModelOutputs: string[];   // full model turns — NOT summarized
  candidateSolutions: string[];
  verificationResults: VerificationResult[];
  finalVerdict: Verdict;
  finalScore: number;          // 0–1
  totalContextTokens: number;
  wallTimeMs: number;
  timestamp: string;
  notes: string;               // failure analysis if not AC
}

export interface VerificationResult {
  candidateIndex: number;
  compilesOrParses: boolean;
  sampleCasesPassed: boolean;
  sampleCaseDetails: Array<{ input: string; expected: string; got: string; pass: boolean }>;
  staticAnalysisWarnings: string[];
  estimatedComplexity: string;  // e.g. "O(n log n)" — model self-reported
  verdict: Verdict;
}

export interface HarnessConfig {
  maxCandidates: number;        // default 3 — generate N solutions, verify, pick best
  topKRetrieval: number;        // default 5 — similar prior solutions to retrieve
  maxContextTokens: number;     // default 8000 — context budget
  enableVerifier: boolean;      // default true
  enableMetaLoop: boolean;      // default false — set true for meta-harness mode
  language: Language;
  logDir: string;               // filesystem path for trace store
  archiveDir: string;           // filesystem path for solution archive
  gotchasDir: string;           // filesystem path for gotcha registry
}
```

---

## Part 5 — Layer 1: Problem Classifier / Planner (`layers/classifier.ts`)

### Purpose
Classify the problem and emit a **Sprint Contract** — the formal agreement between Planner and Generator. No code is written until the Sprint Contract exists.

### Contract

```typescript
export interface Classifier {
  classify(problem: ProblemSpec): Promise<ClassifierOutput>;
}
```

### Sprint Contract Fields (mandatory output)
- `algorithmClassification`: specific algorithm name, not just domain (e.g., "Centroid Decomposition", not "graph")
- `complexityTarget`: big-O with concrete reasoning from the constraint value (e.g., "O(N log N) because N=10^5 allows ~1.7M ops at 10^8/s")
- `mandatoryEdgeCases`: pre-written test cases that MUST pass — generated by the Planner before the Generator writes code

### Implementation Rules

1. **Two-stage classification**:
   - Stage 1: Pattern-match on keyword signals (keyword→domain map lives in `skills/algorithms.ts`). Cost: 0 tokens.
   - Stage 2 (fallback if Stage 1 returns `"unknown"`): Single model call using ONLY the constraint block and examples — not the full statement. Budget: ≤500 tokens.
2. **Edge case detection**: For each domain, apply domain-specific checkers from `skills/gotchas.ts`. All detected flags become `edgeCaseFlags` — forwarded to the prompter and injected into the prompt verbatim.
3. **Prior solution lookup**: Query `store/solution-archive.ts` by domain + subDomain. Populate `priorSolutionKeys`.
4. **Token cost hard limit**: If the model call for Stage 2 exceeds 500 tokens, fix the keyword map in `skills/algorithms.ts` — do not increase the budget.

### Domain Routing Table

| Domain | Sub-domains | Likely Algorithms |
|---|---|---|
| `graph` | shortest-path, flow, scc, bipartite, mst, topo-sort | Dijkstra, BFS, Bellman-Ford, Kahn, Tarjan, Edmonds-Karp |
| `dp` | knapsack, interval, bitmask, tree-dp, digit-dp | Memoization, tabulation, SOS-DP |
| `math` | number-theory, combinatorics, geometry, linear-algebra | Sieve, FFT, GCD, matrix-exp, CRT |
| `string` | suffix-array, hashing, automaton, palindrome | KMP, Z-function, Aho-Corasick, Manacher |
| `data-structure` | segment-tree, fenwick, dsu, sparse-table, treap | Lazy propagation, persistent DS, offline |
| `greedy` | exchange-argument, interval-scheduling, heap | — |
| `geometry` | convex-hull, sweep-line, intersection | Graham, Jarvis, Shamos-Hoey |
| `interactive` | query-response, binary-search-interactive | Adaptive binary search, game theory |

---

## Part 6 — Layer 2a: Retriever (`layers/retriever.ts`)

### Purpose
Given a `ClassifierOutput`, retrieve the most relevant prior solutions, gotchas, API snippets, and domain code template. Enforce strict token budget.

### Contract

```typescript
export interface Retriever {
  retrieve(classifier: ClassifierOutput, config: HarnessConfig): Promise<RetrievalContext>;
}
```

### Retrieval Rules

1. **Solution retrieval**: Query `store/solution-archive.ts` using `priorSolutionKeys`. Rank by:
   (1) exact `subDomain` match, (2) same difficulty, (3) most recent AC timestamp, (4) shortest code (elegance proxy). Return top-`config.topKRetrieval`.
2. **Gotcha retrieval**: Filter `skills/gotchas.ts` by `domain` and `subDomain` (wildcard `"*"` matches everything). Sort by `hitCount` descending. **Return all matches — no cap.** Gotchas are small and high-value. Never drop them for budget reasons.
3. **API snippets**: From `skills/api-refs.ts`, keyed by `language` + algorithm family. For `cpp`/`shortest-path`, include the `priority_queue<pair<ll,int>, ..., greater<>>` idiom and `INT_MAX` guard.
4. **Template code**: From `skills/algorithms.ts`, return the scaffolded template for `domain`/`language`. Templates must include: headers, `main()`, fast I/O boilerplate, algorithmic skeleton with `// TODO: solver logic` comment markers.
5. **Token budget enforcement**:
   - Total retrieved context ≤ `config.maxContextTokens * 0.4` (40% budget reserved for retrieval).
   - If over budget: drop lowest-ranked prior solutions first, then shorten API snippets to one-liners, then truncate template to skeleton only.
   - **Never drop gotchas or edge case flags.**
6. **Math domain — lexical retrieval**: For `domain === "math"`, prefer BM25-style keyword matching (technique keywords: "totient", "CRT", "primitive root") over semantic similarity. Prior math solutions are most useful when they share technique keywords early in their `notes` field.
7. **Populate `retrievalSummary`**: Describe what was retrieved and why. This string is logged in the trace and read by the meta-loop for diagnosis — it is never sent to the model.

---

## Part 7 — Layer 2b: Prompter (`layers/prompter.ts`)

### Purpose
Construct the exact prompt package sent to the Generator. This layer is the final arbiter of what the model sees.

### Contract

```typescript
export interface Prompter {
  build(
    problem: ProblemSpec,
    classifier: ClassifierOutput,
    context: RetrievalContext,
    config: HarnessConfig
  ): PromptPackage;
}
```

### System Prompt Template

```
You are an elite competitive programmer solving problems at ICPC World Finals / IOI difficulty.

## Task
Solve the competitive programming problem below. Output ONLY the final solution code. No prose, no explanation.

## Language
{language}

## Domain Hints (pre-classified — trust these)
Domain: {domain} / {subDomain}
Algorithm target: {algorithmClassification}
Complexity target: {complexityTarget}
Likely algorithms (ranked by confidence): {likelyAlgorithms}

## Sprint Contract — Mandatory Edge Cases
The following edge cases MUST be handled. They will be tested:
{mandatoryEdgeCases — numbered list}

## Critical Gotchas — DO NOT repeat these failures
{gotchas — format each as:
  PATTERN: <short description>
  EXAMPLE: <concrete trigger code>
  FIX: <how to avoid>
}

## Prior Solutions (similar problems — verified AC)
{priorSolutions — code only, annotated with problem title and algorithm used}

## Code Template
{templateCode}

## API Reference
{apiSnippets}

## Constraint Analysis
{constraints}
{constraint→algorithm mapping note from algorithms.ts}

## Output Format
Return ONLY valid {language} code. Requirements:
1. Read from stdin, write to stdout
2. Handle ALL edge cases listed in the Sprint Contract above
3. Stay within {timeLimit}ms / {memoryLimit}MB
4. Use the algorithm(s) consistent with the complexity target above
5. In C++: always use `ios::sync_with_stdio(false); cin.tie(nullptr);` at top of main()
```

### Prompter Implementation Rules

1. **Token estimation**: Use 4-chars-per-token heuristic. If `contextTokenEstimate > config.maxContextTokens`, apply drop order: (a) drop lowest-ranked prior solutions, (b) shorten API snippets to one-liners, (c) truncate template to skeleton. **Never drop gotchas or edge case flags.**
2. **Draft-then-verify staging**: Build prompts for two model turns. Turn 1: generate solution. Turn 2 (triggered by verifier failure): regenerate with the full failure trace appended — exact WA diff, static analysis warnings, and a directive to address the specific failure.
3. **Multi-candidate prompting**: When `config.maxCandidates > 1`, generate N independent candidates by varying: algorithm hint order, temperature signal in prompt ("prefer the simplest correct approach" / "prefer the most robust approach"), and whether the template is included.
4. **Interactive problems**: If `domain === "interactive"`, append a mandatory interactive protocol block: explain judge interaction protocol, flush requirements (`endl` or `cout.flush()` after every output), and that the solution must not buffer.
5. **Additive editing**: When iterating on a failing candidate within one session, **append failure info to the prompt — never rewrite from scratch.** Only perform a full rewrite if two consecutive additive iterations both fail.

---

## Part 8 — Layer 3: Verifier / Evaluator (`layers/verifier.ts`)

### Purpose
The Skeptic. Attempt to break the Generator's code. Catch all failures before any submission. Total verification time budget: <5 seconds per candidate.

### Contract

```typescript
export interface Verifier {
  verify(
    solution: string,
    problem: ProblemSpec,
    language: Language
  ): Promise<VerificationResult>;
}
```

### Verification Pipeline (ordered, fail-fast)

1. **Compilation / parse check**: Compile (C++/Java/Rust) or parse (Python/TS). On failure: `compilesOrParses = false`, `verdict = "CE"`, return immediately. No further steps.
2. **Sample case execution**: Run each `problem.examples` pair in a subprocess. Hard timeout: `problem.timeLimit * 2` ms (kill at 2× limit). Capture stdout. Compare against expected output **after stripping trailing whitespace and newlines**. Set `sampleCasesPassed` and populate `sampleCaseDetails`.
3. **Static analysis warnings** — scan code text for known gotcha patterns:
   - C++: uninitialized loop variables; `int` multiplication assigned to `int` before `long long` cast; `scanf/printf` mixed with `cin/cout` without sync disable; using `endl` in tight loops (forces flush)
   - Python: missing `sys.setrecursionlimit`; using `input()` instead of `sys.stdin` for large N; integer division `/` where `//` was intended
   - Java: `int` overflow in intermediate expressions; missing `BufferedReader` for large I/O
   - All languages: output format verification (trailing spaces, extra newlines, precision for floats)
4. **Complexity self-report**: One small model call asking the Generator to estimate its own time complexity. Store as `estimatedComplexity`. If estimated complexity exceeds the constraint-implied bound from `skills/algorithms.ts`, flag as `TLE_RISK` in `staticAnalysisWarnings`.
5. **Verdict assignment**: `AC` if sample cases pass and no red-flag warnings. `WA` if sample cases fail. `TLE` if subprocess timed out. `RE` if subprocess crashed (non-zero exit). `CE` if step 1 failed.
6. **Candidate ranking** (used by HarnessRunner): AC > highest partial sample pass rate > fewest static warnings > shortest code.

### Skepticism Rules
- Be skeptical of LLM-generated output format. Verify trailing spaces, precision (check for `fixed << setprecision(N)` on float outputs), case sensitivity, and whether the problem expects 1-indexed or 0-indexed output.
- The evaluator must verify output formats exactly — a single trailing space on a wrong answer is a WA.

---

## Part 9 — Layer 4: Trace Logger (`layers/logger.ts`)

### Purpose
Log every execution trace to the filesystem in a queryable, grep-able format. The feedback channel for the meta-loop and post-mortems.

### Contract

```typescript
export interface Logger {
  logTrace(trace: ExecutionTrace): Promise<string>;        // returns path to trace directory
  readTrace(sessionId: string): Promise<ExecutionTrace>;
  listTraces(filter?: Partial<ExecutionTrace>): Promise<string[]>;  // returns sessionIds
  appendGotcha(gotcha: GotchaRecord): Promise<void>;
  archiveSolution(record: SolutionRecord): Promise<void>;
}
```

### Implementation Rules

1. **Raw traces, not summaries**: Store full model outputs, full prompt text, all candidate code — verbatim. The meta-loop reads raw traces via `grep` and `cat`. Compressed summaries defeat the diagnostic purpose.
2. **Flat JSON**: `trace.json` uses flat JSON (no nested blobs). Every key is top-level. This enables `grep -r "domain: graph" traces/` to work across the full history.
3. **Gotcha auto-update**: After each non-AC run, the HarnessRunner calls `analyzeFailure()`. If a new pattern is detected, `appendGotcha()` is called. Existing gotchas matching the failure pattern have their `hitCount` incremented.
4. **Solution archival**: After every AC run, `archiveSolution()` is called automatically by HarnessRunner. Solutions are indexed by fingerprint: `SHA256(domain + subDomain + normalizedConstraintString)`.
5. **Append-only**: Never delete or overwrite traces. Old traces compressed with gzip after 30 days.
6. **Skill versioning**: Each trace stamped with the `skillGenIndex` of the gotchas library at time of solve. Prevents stale rewards from contaminating the meta-learning buffer.

---

## Part 10 — Context Management: Reset & Handoff Protocol

To eliminate **context anxiety** (the tendency for models to prematurely wrap up work as context limits approach), the harness uses context resets at defined boundaries.

### Reset Triggers
- Every new sub-task or significant iteration within a multi-step solve
- Any time `totalContextTokens` exceeds 80% of `config.maxContextTokens`

### Handoff Artifact (JSON, written to `sprint_contracts/{sessionId}-handoff.json`)

```json
{
  "currentCodeState": "<verbatim latest candidate code>",
  "verifiedInsights": ["<insight 1 from previous session>", "..."],
  "remainingContractSteps": ["<step 1>", "..."],
  "lastVerdict": "WA",
  "failureAnalysis": "<specific reason for last failure>",
  "attemptNumber": 2
}
```

### Filesystem-as-Context
The local filesystem is the agent's primary memory. Do not dump logs into the prompt. Instead, point the agent to specific file paths (e.g., `logs/traces/abc123/notes.txt`) using **progressive disclosure** — reveal only the specific trace file needed for the current iteration, not the entire history.

---

## Part 11 — Main Runner (`harness.ts`)

### Contract

```typescript
export class HarnessRunner {
  constructor(config: HarnessConfig, model: /* packages/ai provider */);
  async solve(problem: ProblemSpec): Promise<ExecutionTrace>;
  private async analyzeFailure(trace: ExecutionTrace): Promise<GotchaRecord | null>;
}
```

### Solve Pipeline (ordered, each step mandatory)

```
1.  classify(problem)
      → ClassifierOutput + SprintContract

2.  retrieve(classifierOutput, config)
      → RetrievalContext (budget-enforced)

3.  prompter.build(problem, classifierOutput, context, config)
      → PromptPackage

4.  [Loop: up to config.maxCandidates iterations]
      a. Stream model with promptPackage    → candidateSolution (raw string)
      b. verifier.verify(candidateSolution) → VerificationResult
      c. if verdict === "AC": break early
      d. if not AC:
           - append failure trace to next prompt turn (additive, not rewrite)
           - if two consecutive additive failures: perform full prompt rewrite
           - note confound if >1 dimension changed between candidates

5.  Select best candidate (ranking: AC > partial pass rate > warnings > length)

6.  logger.logTrace(fullTrace)

7.  if AC: logger.archiveSolution(record)

8.  else: analyzeFailure(trace)
           → if new pattern found: logger.appendGotcha(newGotcha)
           → always: increment hitCount on matching existing gotchas

9.  return ExecutionTrace
```

### Confound Isolation Rule
If two edits were made between consecutive failing candidates (e.g., changed algorithm hint AND changed template), mark as `CONFOUNDED` in `notes.txt`. On the next iteration, revert to changing only one dimension at a time. This mirrors the Meta-Harness principle: isolate confounds before iterating.

### Additive Editing Rule
Append failure information to the existing prompt — never rewrite from scratch unless two consecutive additive iterations both fail. Lower regression risk.

---

## Part 12 — Skills Library (`skills/`)

### `gotchas.ts` — HIGHEST PRIORITY FILE

Read this before every solve. Updated after every non-AC run. The harness's accumulated institutional memory.

**Initial Seed Registry** (expand via runtime learning):

```typescript
export const INITIAL_GOTCHAS: GotchaRecord[] = [
  {
    id: "cpp-int-overflow",
    domain: "math", subDomain: "*",
    pattern: "int overflow when multiplying two ints before assigning to long long",
    example: "long long ans = a * b; // WRONG if a,b are int and a*b > INT_MAX",
    fix: "long long ans = (long long)a * b;",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "cpp-cin-sync",
    domain: "*", subDomain: "*",
    pattern: "cin/cout without sync disable causes TLE on large I/O",
    example: "Reading 1e6 ints with cin without ios::sync_with_stdio(false)",
    fix: "ios::sync_with_stdio(false); cin.tie(nullptr); // at top of main()",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "graph-negative-dijkstra",
    domain: "graph", subDomain: "shortest-path",
    pattern: "Dijkstra used on graph with negative edge weights",
    example: "Applying Dijkstra when constraints say -10^9 ≤ w ≤ 10^9",
    fix: "Use Bellman-Ford or SPFA for negative weights. Check constraints for sign.",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "dp-modular-arithmetic",
    domain: "dp", subDomain: "*",
    pattern: "DP counting problem: forgot to apply MOD at each step",
    example: "dp[i] = dp[i-1] + dp[i-2]; // overflows for n > 40 without MOD",
    fix: "dp[i] = (dp[i-1] + dp[i-2]) % MOD;",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "python-recursion-limit",
    domain: "dp", subDomain: "*",
    pattern: "Python default recursion limit (1000) exceeded by deep DFS/memoization",
    example: "Recursive DFS on n=1e5 node tree in Python without setrecursionlimit",
    fix: "import sys; sys.setrecursionlimit(300000) — add at top of every recursive Python solution",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "geometry-floating-point",
    domain: "geometry", subDomain: "*",
    pattern: "Exact == comparison of floating point values causes WA",
    example: "if (dist == 0) // fails for dist = 1e-16",
    fix: "Use epsilon comparison: if (fabs(dist) < 1e-9)",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "interactive-flush",
    domain: "interactive", subDomain: "*",
    pattern: "Interactive problem output not flushed — judge hangs waiting",
    example: "cout << answer << '\\n'; // missing flush in interactive mode",
    fix: "cout << answer << endl; // or follow with cout.flush();",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "string-hash-collision",
    domain: "string", subDomain: "hashing",
    pattern: "Single polynomial hash collides on adversarial inputs",
    example: "Using single (base=31, mod=1e9+7) in competitive setting",
    fix: "Use double hashing with two independent (base, mod) pairs",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "cpp-endl-flush-tle",
    domain: "*", subDomain: "*",
    pattern: "Using endl in tight output loops causes TLE due to forced flush",
    example: "for (int i = 0; i < n; i++) cout << arr[i] << endl; // O(n) flushes",
    fix: "Use '\\n' instead of endl in loops. Only use endl/flush when protocol requires it.",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "cpp-priority-queue-direction",
    domain: "graph", subDomain: "shortest-path",
    pattern: "Default C++ priority_queue is max-heap; Dijkstra needs min-heap",
    example: "priority_queue<pair<int,int>> pq; // WRONG — pops largest dist first",
    fix: "priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<pair<ll,int>>> pq;",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
  {
    id: "python-large-io",
    domain: "*", subDomain: "*",
    pattern: "Python input() is slow for N > 1e4; causes TLE",
    example: "n = int(input()) in a loop for N=1e6",
    fix: "import sys; input = sys.stdin.readline — add at top of every large-input Python solution",
    firstSeenAt: "seed", hitCount: 0, skillGenIndex: 1,
  },
];
```

### `algorithms.ts` — Domain Skill Bundles

Contains per-domain: code templates (C++ preferred), complexity bounds, and the constraint→algorithm mapping rule. The following comment block **must** appear at the top of every generated template:

```cpp
// === CONSTRAINT → ALGORITHM MAP ===
// n ≤ 12        : bitmask DP or brute force  O(2^n * n)
// n ≤ 100       : O(n^3) Floyd-Warshall, matrix ops
// n ≤ 1000      : O(n^2) DP, O(n^2) Bellman-Ford
// n ≤ 1e5       : O(n log n) — sort, segment tree, Dijkstra, BFS
// n ≤ 1e6       : O(n) — linear DP, BFS on implicit graph, sieve
// n ≤ 1e9       : O(log n) — binary search, matrix exponentiation
// n ≤ 1e18      : O(log^2 n) or O(sqrt(n)) — number theory
```

### `api-refs.ts` — API References (Gotchas-First Format)

Every entry **leads with the gotcha**, then provides the reference snippet. Structure:

```typescript
{
  language: "cpp",
  algorithm: "priority-queue",
  gotcha: "Default pq is max-heap. For Dijkstra (min-heap) use greater<>.",
  snippet: `priority_queue<pair<ll,int>, vector<pair<ll,int>>, greater<pair<ll,int>>> pq;`
}
```

### `verification.ts` — Stress-Test Harness Template

Pre-built stress-test scaffolding: generates random inputs, runs brute-force and optimized solutions in parallel, diffs outputs. Instantiated per problem by HarnessRunner when `enableVerifier = true` and a brute-force exists.

---

## Part 13 — Trace Store (`store/trace-store.ts`)

### Contract

```typescript
export interface TraceStore {
  save(trace: ExecutionTrace): Promise<string>;   // returns directory path
  load(sessionId: string): Promise<ExecutionTrace>;
  search(query: TraceQuery): Promise<ExecutionTrace[]>;
  stats(): Promise<TraceStoreStats>;
}

export interface TraceQuery {
  domain?: ProblemDomain;
  verdict?: Verdict;
  since?: string;      // ISO timestamp
  maxResults?: number; // default 20
}

export interface TraceStoreStats {
  totalTraces: number;
  acRate: number;
  avgContextTokens: number;
  domainBreakdown: Record<ProblemDomain, number>;
  topGotchas: GotchaRecord[];  // sorted by hitCount desc
}
```

Implementation: filesystem-backed JSON. Synchronous reads during retrieval only (avoid async complexity). Stats computed lazily, cached 60 seconds.

---

## Part 14 — Solution Archive (`store/solution-archive.ts`)

### Contract

```typescript
export interface SolutionArchive {
  store(record: SolutionRecord): Promise<void>;
  query(opts: ArchiveQuery): Promise<SolutionRecord[]>;
  fingerprint(domain: ProblemDomain, subDomain: string, constraints: string): string;
}

export interface ArchiveQuery {
  domain?: ProblemDomain;
  subDomain?: string;
  difficulty?: Difficulty;
  language?: Language;
  limit?: number;   // default 5
}
```

**Indexing strategy**:
- Primary index: `fingerprint` = `SHA256(domain + subDomain + normalizedConstraintString)`
- Secondary index: flat JSON manifest at `{archiveDir}/manifest.json` — array of `{ key, domain, subDomain, difficulty, language, timestamp }` for fast listing without loading full solution bodies.

---

## Part 15 — Meta-Loop Proposer (`meta/proposer.ts`)

**Disabled by default** (`config.enableMetaLoop = false`). Activate for self-improvement mode after batch evaluation runs.

### Purpose
Propose and apply modifications to the harness's own layers — classifier keyword map, gotchas registry, retrieval ranking, prompt templates — based on aggregate trace analysis.

### Contract

```typescript
export interface MetaProposer {
  analyze(store: TraceStore): Promise<MetaAnalysis>;
  propose(analysis: MetaAnalysis): Promise<HarnessEdit[]>;
  apply(edits: HarnessEdit[]): Promise<void>;
}

export interface MetaAnalysis {
  worstDomains: ProblemDomain[];      // domains with lowest AC rate
  topFailurePatterns: string[];        // recurring patterns in WA/TLE trace notes
  gotchaHits: GotchaRecord[];          // gotchas that fired most (sorted desc)
  contextBloat: boolean;               // true if avgContextTokens > 80% of limit
  retrievalQuality: number;            // 0–1: fraction of retrieved solutions used in AC
}

export interface HarnessEdit {
  layer: "classifier" | "retriever" | "prompter" | "verifier" | "gotchas" | "algorithms";
  editType: "add-gotcha" | "update-template" | "update-keyword-map" | "update-retrieval-ranking";
  description: string;
  diff: string;   // unified diff format
}
```

### Meta-Loop Protocol

1. Read all traces for the last N sessions (default N=50) from `TraceStore`.
2. Compute `MetaAnalysis`: group by domain, compute per-domain AC rates, extract recurring failure patterns from raw `notes.txt` files using keyword frequency analysis.
3. For each `worstDomain`: inspect the 5 most recent failing traces **in full** — read classifier output, retrieval context, and exact model output. **Do not summarize — reason over raw content.**
4. Propose ≤3 `HarnessEdit` items per meta-loop run. Prefer **additive edits** (add a gotcha, extend a keyword map) over rewrites.
5. Apply edits. Run the fast verification test suite. If tests pass, commit edits to harness files.
6. Log the meta-loop run as a special trace with `sessionId` prefixed `meta-`.

**Key rule**: The meta-proposer reads prior traces via `grep` and `cat` equivalents — never pre-processed summaries. Full trace access (not scalar scores or LLM summaries) is the critical ingredient for effective harness search.

---

## Part 16 — Testing Requirements

All tests: `packages/coding-agent/test/suite/cp-harness/`  
Run command: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/suite/cp-harness/`  
Use faux provider from `test/suite/harness.ts`. **No real API keys. No paid tokens. Ever.**

### Required Test Files

| File | What to Cover |
|---|---|
| `classifier.test.ts` | Keyword routing for all 8 domains; edge case detection per domain; fallback to model call; ≤500 token budget |
| `retriever.test.ts` | Retrieval ranking order; budget enforcement (40% cap); gotcha priority (never dropped); math BM25 path |
| `prompter.test.ts` | Token budget enforcement and drop order; draft-then-verify staging; multi-candidate variation; interactive protocol injection |
| `verifier.test.ts` | CE detection (malformed C++); WA detection (wrong sample output); TLE detection (subprocess timeout); static analysis overflow catch; AC on correct solution |
| `logger.test.ts` | Trace serialization (flat JSON); gotcha append; archive indexing via manifest; append-only enforcement |
| `harness.test.ts` | Full end-to-end solve pipeline with faux provider; early AC break; failure→gotcha path; additive prompt editing; confound isolation |

### Coverage Requirements

| File | Minimum Coverage |
|---|---|
| `classifier.ts` | ≥90% line coverage |
| `verifier.ts` | ≥90% line coverage (most safety-critical) |
| `logger.ts` | ≥80% line coverage |
| `harness.ts` | All happy-path + top-3 failure modes covered |

---

## Part 17 — Pi Agent Integration Rules

These rules govern how the Pi agent works on this package. They are **additive** to the base rules in `AGENTS.md`.

### Reading Before Editing (Hard Rule)
Before modifying any file in `src/cp-harness/`, read that file in **full** using the read tool with `offset + limit` for ranged reads on long files. Never use `sed/cat` to read. This is non-negotiable.

### Commit Protocol
- Label: `pkg:coding-agent` on all related issues and PRs
- Commit message format: `feat(cp-harness): <description>` / `fix(cp-harness): <description>`
- Only stage files **you** modified in this session: `git add <specific-path>` — never `git add .` or `git add -A`
- Include `fixes #<number>` when applicable
- Run `npm run check` from repo root after every code change. Fix all errors before committing.
- `npm run build` and `npm run check` are used for consistency checks — use them.

### Changelog
Entries go under `packages/coding-agent/CHANGELOG.md` in `## [Unreleased]`. Use `### Added` for new harness features; `### Fixed` for gotcha registry updates and bug fixes.

### Test Rule
Every new layer function must have at least one test. Create or modify the test file, run it immediately, iterate until it passes.

### Forbidden Operations
- `npm run dev`, `npm test` (use `npx tsx ... vitest` directly)
- Using real API keys or paid tokens in tests
- `git add -A`, `git add .`, `git reset --hard`, `git stash`
- Inline dynamic imports (`await import(...)` for types)
- `any` type unless explicitly documented with a `// REASON: ...` comment
- Touching files outside `src/cp-harness/` and `test/suite/cp-harness/` without explicit instruction

---

## Part 18 — Implementation Priority Order

Implement in this exact sequence. Each layer must be testable before the next is built on it.

| Step | File | Why First |
|---|---|---|
| 1 | `types.ts` | No logic — pure interfaces. All other files import from here. |
| 2 | `skills/gotchas.ts` | Seed the gotcha registry. Classifier and Retriever depend on it. |
| 3 | `skills/algorithms.ts` | Domain templates + constraint→algorithm map. Classifier depends on it. |
| 4 | `skills/api-refs.ts` | Language snippets. Retriever depends on it. |
| 5 | `store/solution-archive.ts` | Archive with fingerprint indexing. Classifier + Retriever depend on it. |
| 6 | `store/trace-store.ts` | Filesystem trace store. Logger depends on it. |
| 7 | `layers/classifier.ts` | Layer 1. Keyword routing + model fallback. |
| 8 | `layers/retriever.ts` | Layer 2a. Budget-enforced retrieval. |
| 9 | `layers/prompter.ts` | Layer 2b. Prompt construction + token budget. |
| 10 | `layers/verifier.ts` | Layer 3. Compile/run/static-analysis pipeline. |
| 11 | `layers/logger.ts` | Layer 4. Trace logging + gotcha auto-update. |
| 12 | `harness.ts` | Main orchestrator. Depends on all layers. |
| 13 | `index.ts` | Public re-exports only. |
| 14 | Full test suite | All test files per Section 16. |
| 15 | `meta/proposer.ts` | Meta-loop last. Depends on everything. |

---

## Part 19 — Public API (`index.ts`)

```typescript
// packages/coding-agent/src/cp-harness/index.ts
// Re-exports only. No implementation here.

export { HarnessRunner } from "./harness.js";
export type {
  ProblemSpec,
  SprintContract,
  ClassifierOutput,
  RetrievalContext,
  PromptPackage,
  SolutionRecord,
  GotchaRecord,
  ExecutionTrace,
  VerificationResult,
  HarnessConfig,
  ProblemDomain,
  Difficulty,
  Verdict,
  Language,
} from "./types.js";
export type { Classifier } from "./layers/classifier.js";
export type { Retriever } from "./layers/retriever.js";
export type { Prompter } from "./layers/prompter.js";
export type { Verifier } from "./layers/verifier.js";
export type { Logger } from "./layers/logger.js";
export type { MetaProposer } from "./meta/proposer.js";
```

---

## Part 20 — Pre-Solve Harness Checklist

Run this mental checklist before every solve. It is not optional.

```
[ ] Problem classified — domain, subDomain, difficulty confirmed
[ ] Sprint Contract emitted — algorithmClassification + complexityTarget populated
[ ] Gotchas loaded — domain-specific gotchas retrieved, hitCounts noted
[ ] Retrieval budget — total retrieved context ≤ 40% of maxContextTokens
[ ] Edge cases flagged — all detected flags injected into prompt verbatim
[ ] Template selected — scaffolded code matches domain + language
[ ] Constraint analysis done — n-value checked against algorithm O() map
[ ] Verifier enabled — sample cases will run before returning result
[ ] Trace directory created — sessionId assigned, logDir initialized
[ ] Handoff artifact ready — in case context reset is needed mid-solve
```

---

## Appendix A — Failure Mode Reference

| Failure | Root Cause | Harness Response |
|---|---|---|
| WA on edge case | Edge case not in `edgeCaseFlags` | Add gotcha, re-classify with updated keyword map |
| TLE | Algorithm O() mismatch with n-constraint | Update constraint→algorithm map in `algorithms.ts` |
| CE | Language-specific syntax error | Add static analysis check to `verifier.ts` |
| Prompt token overflow | Too many prior solutions retrieved | Tighten retrieval budget (lower the 40% threshold) |
| Gotcha not retrieved | Domain mismatch in gotcha `domain` field | Change domain to `"*"` for cross-domain patterns |
| Meta-loop regression | Two edits made simultaneously | Revert to baseline; isolate confound; change one dimension per iteration |
| Output format WA | Trailing space / precision / newline mismatch | Add format verification to verifier static analysis |
| Context anxiety (premature wrap-up) | Context window filling up | Trigger context reset + handoff artifact immediately |

---

## Appendix B — Scope Boundaries

**In scope — touch freely:**
- All files under `packages/coding-agent/src/cp-harness/`
- Test files under `packages/coding-agent/test/suite/cp-harness/`
- `packages/coding-agent/CHANGELOG.md`

**Read-only — import from, never modify:**
- `packages/coding-agent/src/core/model-resolver.ts`
- `packages/coding-agent/test/suite/harness.ts`

**Out of scope — do not touch without explicit instruction:**
- Other packages (`packages/ai/`, `packages/tui/`, `packages/mom/`, etc.)
- `packages/coding-agent/src/` files outside `cp-harness/`
- Root `package.json` (ask before adding dependencies)

---

*End of Specification. This harness is a live system — it evolves its own skills and retrieval policies as it encounters new competitive programming challenges. Every non-AC run must make the harness smarter.*
