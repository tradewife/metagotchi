# Cake Harness Specification

## Deterministic competitive programming harness for Pi

Cake is a **harnessed Pi**: a deterministic competitive programming control plane wrapped around the Pi coding agent. The harness always runs first. It classifies the problem, constructs the sprint contract, retrieves high-signal context, enforces token budgets, verifies candidates, logs raw traces, and optionally performs outer-loop harness search. The model does **not** decide whether these components run; they are part of the runtime itself.[file:1][file:22][file:3]

This document is the canonical handoff spec for the current system after the migration pass. It supersedes any framing that treats the harness as an optional skill bundle. Skills remain useful, but only as support artifacts that the harness reads and injects. The deterministic execution path is: **AGENTS.md / system prompt → pre-session TypeScript pipeline → model call → verification → logging → meta-loop**.[file:22][file:6][file:3]

## Core principle

**The harness is law; skills are library shelves.** A harness is executable infrastructure that governs what information the model sees and when it sees it. A skill is a reusable knowledge artifact, script bundle, or reference module that can be consulted or injected, but it is not the control plane itself.[file:1][file:6][file:3]

For Cake, anything that must always persist belongs in one of three places: the unconditional context layer (`AGENTS.md` / system prompt), the pre-session TypeScript runtime, or the post-run trace and meta-learning pipeline. Anything placed only in a skill must be treated as optional support material, even if highly valuable.[file:22][file:6]

## System identity

- **Agent name:** Cake
- **Definition:** Cake is Pi operating under a deterministic competitive programming harness.[file:22]
- **Purpose:** Maximize competitive programming solve rate while minimizing avoidable regressions, context waste, and repeated failure modes.[file:1][file:3]
- **Base model policy:** The base model is fixed; performance gains come from better harnessing, not weight changes during normal operation.[file:1][file:3]

## Deterministic architecture

Cake has two always-on layers and one optional-but-runtime-controlled layer.

### Always-on layer 1: persistent policy context

The persistent policy context is injected unconditionally through repository-level context files and system prompt configuration. This is where global rules live: additive edits first, raw traces over summaries, verification before confidence, and explicit role boundaries between planner, generator, and evaluator. Because this layer is loaded before task execution, the model cannot opt out of it.[file:22]

This layer should be represented by:

- `AGENTS.md` at the repo or working-root level for cross-agent compatibility.[file:22]
- Optional Pi-specific system prompt appenders if the runtime supports them.[file:22]
- No critical control-flow logic in skills.[file:6]

### Always-on layer 2: pre-session runtime orchestration

The real harness lives in TypeScript under `packages/coding-agent/src/cp-harness/`. This runtime does the actual work before the model sees the problem: classification, sprint-contract creation, retrieval, prompt assembly, candidate generation strategy, verification, and logging.[file:1][file:22]

The model is not asked whether to classify, whether to retrieve gotchas, or whether to verify. Those steps are executed by the runtime and their outputs are assembled into the prompt package that Pi receives.[file:1][file:22]

### Runtime-controlled layer 3: outer-loop meta-learning

The meta-loop is optional at configuration time but deterministic once enabled. If `enableMetaLoop=true`, Cake instantiates `MetaProposer` and performs filesystem-first harness search over prior candidates, traces, and scores. The proposer never optimizes from compressed summaries alone; it inspects raw artifacts via the filesystem and proposes additive, causally targeted harness edits.[file:22][file:3]

## Skills in Cake

Skills still exist, but their role is sharply limited.

### What skills are for

In Cake, skills are reference modules the harness reads and injects. They are not the execution path. Appropriate skill content includes:

- Gotchas libraries
- Algorithm templates
- Language/API idioms
- Verification helpers
- Domain reference files
- Script bundles used by verifier or retriever[ file:1][file:6]

Anthropic’s skill guidance is still useful here: the highest-signal content is gotchas, skills benefit from progressive disclosure, and scripts inside skill directories are valuable because they let the agent compose instead of reconstruct boilerplate. But those lessons apply to support artifacts, not to the harness’s control flow.[file:6]

### What skills are not for

Do **not** put the following only in a skill file if you expect deterministic behavior:

- Problem classification policy
- Sprint contract schema
- Token budget enforcement
- Candidate verification pipeline
- Logging requirements
- Meta-loop invariants
- Core solve ordering
- Safety-critical or regression-critical constraints[ file:22]

If a rule must always hold, it belongs in `AGENTS.md`, the runtime code, or both.[file:22]

## Architectural model

Cake implements a strict planner-generator-evaluator separation using the migrated harness structure.

| Role | Runtime owner | Responsibility | Deterministic status |
|---|---|---|---|
| Planner | `layers/classifier.ts` | Classify domain, set SprintContract, infer difficulty, token budget, likely failures, retrieval query | Always-on [file:22] |
| Generator | Pi coding agent via prompt package | Produce candidate solutions under the contract | Always-on [file:1][file:22] |
| Evaluator | `layers/verifier.ts` | Compile/parse, sample test, static warnings, candidate ranking | Always-on when verifier enabled [file:1][file:22] |
| Memory | `layers/logger.ts`, `store/*` | Persist raw traces, gotchas, archived AC solutions | Always-on [file:1][file:22] |
| Meta-optimizer | `meta/proposer.ts` | Propose future harness edits from filesystem evidence | Deterministic when enabled [file:22][file:3] |

This preserves the conceptual tri-agent decomposition from the alternative spec while grounding it in concrete TypeScript components and filesystem contracts.[file:1][file:2][file:22]

## Repository layout

Cake lives in:

```text
packages/coding-agent/src/cp-harness/
  index.ts
  types.ts
  harness.ts
  layers/
    classifier.ts
    retriever.ts
    prompter.ts
    verifier.ts
    logger.ts
  skills/
    algorithms.ts
    gotchas.ts
    api-refs.ts
    verification.ts
  store/
    trace-store.ts
    solution-archive.ts
  meta/
    proposer.ts
  scripts/
    validate.ts
```

This is the runtime nucleus. `AGENTS.md` should sit at the repo root or relevant working root so every agent session inherits the same top-level rules.[file:1][file:22]

## Execution flow

The solve pipeline is deterministic and ordered.

1. Receive `ProblemSpec`.
2. Run classifier.
3. Build `SprintContract`.
4. Retrieve prior solutions, gotchas, API snippets, and templates.
5. Build prompt package under token budget.
6. Generate one or more candidates.
7. Verify candidates.
8. Rank/select best candidate.
9. Log full raw trace.
10. Archive AC solutions or append/increment gotchas on failure.
11. If enabled, expose results to the meta-loop for future harness proposals.[file:1][file:22]

At no point should the model itself decide whether steps 2–10 happen. The only stochastic component is candidate generation, not whether the harness logic executes.[file:1][file:22]

## Sprint contract

The `SprintContract` is the central execution agreement between the planner and the generator. It is no longer a soft planning note; it is a first-class typed object created by the classifier and consumed by retrieval and prompt construction.[file:22]

The migrated contract must include:

- `algorithmClassification`
- `complexityTarget`
- `mandatoryEdgeCases`
- `likelyAlgorithms`
- `domain`
- `subDomain`
- `difficulty`
- `tokenBudget`
- `likelyFailureModes`
- `retrievalQuery`[file:22]

This contract is the harness’s deterministic problem interpretation. The model should be told to solve under it, not invited to redefine it casually.[file:22]

## Token budget policy

Cake uses classifier-derived token budgets for the initial solve prompt. The migrated rule is:

```ts
min(8000, max(2000, 10000 - difficultyPenalty))
```

with penalties by difficulty class, and `config.maxContextTokens` retained only as a hard ceiling fallback.[file:22]

This means prompt size is a function of the classified problem, not just a static config constant. Harder tasks still receive bounded context, but the harness remains disciplined about cost and distraction.[file:22]

## Retrieval policy

Retrieval is subordinate to the sprint contract and must preserve the highest-signal artifacts first.

### Retrieval priorities

1. Relevant gotchas
2. Mandatory edge cases / risk framing from sprint contract
3. Closest prior AC solutions
4. Language/API snippets
5. Code template scaffold[ file:1][file:22]

### Non-negotiable rule

**The gotchas block is never truncated.** When prompt size exceeds budget, Cake drops retrieved solutions first, then compresses lower-priority context. Gotchas and risk warnings stay.[file:22]

### Prompt formatting rules

- Gotchas are serialized with `⚠ GOTCHA:` prefixes.[file:22]
- Domain-specific failure modes are serialized immediately after as `⚠ RISK:` lines.[file:22]
- The prompt package must remain within `sprintContract.tokenBudget`, subject to the hard fallback ceiling.[file:22]

## Gotchas system

The gotchas registry is Cake’s highest-priority reusable memory. This aligns with both the original harness spec and Anthropic’s observed best practice that gotchas are usually the highest-signal part of any skill or reusable instruction set.[file:1][file:6]

### Current gotcha model

`GotchaRecord` now supports:

- multi-domain applicability via `domain: Array<ProblemDomain | "*">`
- `description` plus legacy `pattern`
- `symptom` for failure identification
- `frequency` as alias of `hitCount`
- `skillGenIndex` for version-aware learning[ file:22]

### Seed priorities

The seeded registry must include classical CP failure modes and the newly added high-impact entries:

- `g-endl-flush-tle`
- `g-priority-queue-direction`
- `g-python-large-io-tle`[file:22]

These are especially important because they capture high-frequency latent failures where the algorithm may be correct but the implementation still loses due to I/O flushing, heap direction, or Python input overhead.[file:22]

### Update policy

On non-AC results, Cake should analyze the failure, increment matching gotchas where appropriate, and append a new gotcha when a materially new failure pattern is discovered. Gotchas are append-friendly institutional memory; they should grow conservatively but continuously.[file:1]

## Verification policy

Cake must verify before it believes. The verifier is not cosmetic — it is the skeptical counterweight to generation.[file:1][file:2]

### Verification stages

1. Compile / parse check
2. Sample case execution under timeout
3. Static analysis against known gotchas
4. Optional cheap complexity review / red-flag check
5. Verdict assignment and candidate ranking[ file:1]

### Design principle

This is conceptually similar to what Anthropic calls product verification skills: deterministic or script-backed validation that improves output reliability. In Cake, however, that verification is baked into the runtime rather than left as a user-invoked skill.[file:6][file:22]

## Logging and memory

Cake must log **raw traces, not summaries**. This rule comes from both the original harness spec and Meta-Harness: compressed summaries often erase the causal evidence needed to diagnose why a harness or candidate failed.[file:1][file:3]

### What must be persisted

Per run, persist at minimum:

- full problem statement
- classifier output
- sprint contract
- retrieval context
- prompt package
- raw model outputs
- candidate solutions
- verification results
- final verdict and score
- notes / failure analysis[ file:1]

### Why this matters

Meta-Harness shows that exposing source code, execution traces, and scores through the filesystem gives a proposer much richer diagnostic leverage than memoryless or summary-only optimization methods. In demanding settings, the proposer may inspect dozens of files per iteration rather than consume a single compressed report.[file:3]

## Filesystem-as-context

Cake should treat the local filesystem as the real long-term memory substrate.[file:2][file:3]

This means:

- log everything in queryable files
- prefer raw artifacts over polished summaries
- store candidate source, reasoning, scores, and traces in stable directories
- allow grep-style and file-based retrieval for the meta-loop
- use progressive disclosure: inspect only the relevant parts of history rather than packing everything into one prompt[ file:2][file:3][file:6]

This is one of the deepest alignments between the two original specs and the Meta-Harness paper.[file:1][file:2][file:3]

## Meta-loop policy

The outer loop is implemented by `MetaProposer` and should remain filesystem-first, additive, and confound-aware.[file:22][file:3]

### Hard invariants

- Inspect the last 3 regressions before proposing.[file:22]
- Prefer additive edits over rewrites.[file:22]
- Never optimize on the test set; search only on the search set.[file:22][file:3]
- For large files, use capped reads rather than giant prompt stuffing.[file:22]
- Track Pareto frontier candidates rather than just a single scalar winner.[file:22][file:3]

### Search philosophy

Meta-Harness argues that the proposer should reason directly over prior code and execution traces, not over thin summaries generated by an outer controller. Cake should preserve that philosophy.[file:3]

## AGENTS.md policy

`AGENTS.md` is the universal, cross-agent entry point for persistent Cake behavior. It should contain only rules that truly must apply every session.[file:22]

### What belongs in AGENTS.md

- Cake identity and mission
- additive-edit-first policy
- raw-traces-over-summaries rule
- deterministic solve ordering
- requirement to respect SprintContract
- rule that gotchas and risk blocks are mandatory
- verification-before-confidence rule
- meta-loop invariants if meta mode is enabled
- command checklist for `npm run check` and validate script before completion[ file:22]

### What does not belong there

- giant algorithm encyclopedias
- verbose template code
- long API references
- duplicate copies of existing TypeScript logic
- anything better stored as indexed support material[ file:6]

`AGENTS.md` should be short, sharp, and universal. The harness code does the heavy lifting.[file:22]

## Separation of concerns

| Concern | Correct home | Why |
|---|---|---|
| Always-on execution rules | `AGENTS.md` / system prompt | Must persist across sessions [file:22] |
| Deterministic orchestration | `harness.ts` + `layers/*` | Runtime must enforce, not suggest [file:1][file:22] |
| Reusable failure memory | `skills/gotchas.ts` + logs | Structured, retrievable support memory [file:1][file:6] |
| Historical solve archive | `store/solution-archive.ts` | Retrieval substrate [file:1] |
| Raw run history | `layers/logger.ts` / trace store | Needed for diagnosis and meta-search [file:1][file:3] |
| Harness self-improvement | `meta/proposer.ts` | Outer-loop code-space search [file:22][file:3] |

## Non-negotiable implementation rules

1. **Start additive, not rewriting.** Regressions are cheaper to control when changes are narrow and attributable.[file:22][file:3]
2. **Inspect raw traces before theorizing.** Never optimize from summaries alone when raw evidence exists.[file:1][file:3]
3. **Protect gotchas.** Never drop the gotcha block to save tokens.[file:22]
4. **Protect verification.** Do not skip compile/sample/static checks because the candidate “looks right.”[file:1]
5. **Isolate confounds.** Do not change multiple causal dimensions at once unless explicitly intended and logged.[file:1][file:3]
6. **Keep filesystem history queryable.** The meta-loop depends on grep-able logs and readable candidate directories.[file:2][file:3]
7. **Do not move deterministic behavior into optional skills.** If it must always happen, it belongs in runtime or persistent context.[file:22][file:6]

## Acceptance state after migration

The migration report indicates the following state is already achieved and should now be treated as baseline truth for further work:

- `SprintContract` expanded with `difficulty`, `tokenBudget`, `likelyFailureModes`, `retrievalQuery`.[file:22]
- `GotchaRecord` upgraded to multi-domain array shape with `description`, `symptom`, and `frequency`.[file:22]
- `layers/classifier.ts` now populates domain risk and budget fields.[file:22]
- `layers/prompter.ts` now uses `sprintContract.tokenBudget`, preserves gotchas, and emits `⚠ GOTCHA:` plus `⚠ RISK:` blocks.[file:22]
- `skills/gotchas.ts` aligned to the new shape and seeded with the three additional high-value records.[file:22]
- `meta/proposer.ts` replaced by a filesystem-first `MetaProposer` with Pareto and regression support.[file:22]
- `scripts/validate.ts` exists as a fast smoke test.[file:22]
- `harness.ts` wires `MetaProposer` when `enableMetaLoop=true`.[file:22]
- zero type errors, zero biome errors, full tests passing, validate exiting 0.[file:22]

Future work should build on this baseline rather than reopen settled migration details.[file:22]

## Handoff instruction to the agent

Treat Cake as a deterministic competitive programming runtime around Pi. Do not reinterpret it as a menu of optional skills. When extending the system:

- keep the control plane in `AGENTS.md` and TypeScript runtime
- keep support knowledge in indexed skills and stores
- preserve raw trace logging
- prefer additive edits
- make every change testable in isolation
- optimize the harness, not just the latest solution[ file:1][file:22][file:3]

That is the canonical operating model.
