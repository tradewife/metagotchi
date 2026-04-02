<!-- OSS_WEEKEND_START -->
# 🏖️ OSS Weekend

**Issue tracker reopens Monday, April 6, 2026.**

OSS weekend runs Friday, March 27, 2026 through Monday, April 6, 2026. New issues are auto-closed during this time. For support, join [Discord](https://discord.com/invite/3cU7Bz4UPx).
<!-- OSS_WEEKEND_END -->

---

<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/tradewife/metagotchi/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/tradewife/metagotchi/ci.yml?style=flat-square&branch=main" /></a>
</p>

# Metagotchi

> Deterministic competitive programming harness

Metagotchi is a deterministic competitive programming harness. The harness always runs first—it classifies problems, builds sprint contracts, retrieves high-signal context, enforces token budgets, verifies candidates, logs raw traces, and optionally performs outer-loop harness search.

**Core principle: The harness is law; skills are library shelves.**

A harness is executable infrastructure that governs what information the model sees and when it sees it. A skill is a reusable knowledge artifact that can be consulted or injected, but it is not the control plane itself.

---

## Architecture

Metagotchi has two always-on layers and one optional-but-runtime-controlled layer.

### Layer 1: Persistent Policy Context

Injected unconditionally through repository-level context files (`AGENTS.md`) and system prompt configuration. This is where global rules live: additive edits first, raw traces over summaries, verification before confidence, and explicit role boundaries between planner, generator, and evaluator.

### Layer 2: Pre-Session Runtime Orchestration

The harness lives in TypeScript under `packages/coding-agent/src/metagotchi/`. This runtime does the actual work before the model sees the problem: classification, sprint-contract creation, retrieval, prompt assembly, candidate generation strategy, verification, and logging.

### Layer 3: Outer-Loop Meta-Learning (Optional)

If `enableMetaLoop=true`, Metagotchi instantiates `MetaProposer` and performs filesystem-first harness search over prior candidates, traces, and scores. The proposer never optimizes from compressed summaries alone—it inspects raw artifacts via the filesystem and proposes additive, causally targeted harness edits.

---

## The Solve Pipeline

Every solve follows this deterministic order:

1. Receive `ProblemSpec`
2. **Classify** — Infer domain, sub-domain, difficulty, edge cases → build `SprintContract`
3. **Retrieve** — Fetch gotchas, prior solutions, API refs, and code templates
4. **Build Prompt** — Assemble under token budget, preserve gotchas and risk blocks
5. **Generate** — Produce candidate solutions under the contract
6. **Verify** — Compile check, sample execution, static analysis, ranking
7. **Log** — Raw trace persisted to filesystem
8. **Archive** — Store AC solutions or increment gotchas on failure
9. **Meta-loop** (optional) — Outer-loop harness search using filesystem evidence

---

## Architectural Model

Metagotchi implements a strict **Planner / Generator / Evaluator** separation:

| Role | Component | Responsibility |
|------|-----------|-----------------|
| Planner | `layers/classifier.ts` | Classify problem, build SprintContract |
| Generator | Model via prompt package | Produce candidate solutions |
| Evaluator | `layers/verifier.ts` | Verify candidates, assign verdicts |
| Memory | `layers/logger.ts`, `store/*` | Persist raw traces, gotchas, archives |
| Meta-optimizer | `meta/proposer.ts` | Propose harness edits (when enabled) |

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Problem Classification** | Infers domain, sub-domain, difficulty, and edge cases |
| **Sprint Contracts** | Binding execution agreements: algorithm, complexity, edge cases |
| **Gotchas** | Institutional memory of failure patterns (14+ seeded) |
| **Verification Pipeline** | Compile, sample, static analysis, complexity red-flags |
| **Token Budgets** | Difficulty-based: easy 10k, medium 9k, hard 7.5k, extreme 6k |
| **Meta-Loop** | Optional outer-loop optimization via `MetaProposer` |

---

## Sprint Contract

The `SprintContract` is the central execution agreement between the planner and the generator:

- `algorithmClassification` / `likelyAlgorithms`
- `complexityTarget`
- `mandatoryEdgeCases`
- `domain` / `subDomain`
- `difficulty`
- `tokenBudget`
- `likelyFailureModes`
- `retrievalQuery`

---

## Gotchas System

The gotchas registry is Metagotchi's highest-priority reusable memory. Seeded patterns include:

- `g-cpp-int-overflow` — int overflow when multiplying before assigning to long long
- `g-cpp-cin-sync` — cin/cout without sync disable causes TLE
- `g-graph-negative-dijkstra` — Dijkstra on graphs with negative weights
- `g-dp-modular-arithmetic` — DP counting forgot MOD at each step
- `g-python-recursion-limit` — Python DFS hits default limit (1000)
- `g-geometry-floating-point` — Float comparison without epsilon
- `g-endl-flush-tle` — std::endl flushes buffer causing TLE
- `g-priority-queue-direction` — PQ heap direction wrong for Dijkstra
- `g-python-large-io-tle` — Python input() is slow on large I/O
- ... and more

**Non-negotiable: The gotchas block is never truncated.** When prompt size exceeds budget, Metagotchi drops retrieved solutions first, then compresses lower-priority context. Gotchas and risk warnings stay.

---

## Verification Pipeline

Metagotchi must verify before it believes:

1. Compile / parse check
2. Sample case execution under timeout
3. Static analysis against known gotchas
4. Optional complexity review / red-flag check
5. Verdict assignment and candidate ranking

---

## Installation

Metagotchi is bundled with `@mariozechner/pi-coding-agent`. No separate install needed.

```bash
npm install -g @mariozechner/pi-coding-agent
```

The harness is accessed programmatically via the `metagotchi` subpath:

```typescript
import { HarnessRunner, type HarnessConfig, type ProblemSpec } from '@mariozechner/pi-coding-agent/metagotchi';
```

---

## Programmatic Usage

```typescript
const problem: ProblemSpec = {
  id: 'codeforces-1234a',
  title: 'A + B',
  statement: 'Given two integers A and B, print their sum.',
  constraints: '1 ≤ A, B ≤ 10^9',
  examples: [{ input: '1 2', output: '3' }],
  timeLimit: 1000,
  memoryLimit: 256,
  language: 'cpp',
};

const config: HarnessConfig = {
  maxCandidates: 3,
  topKRetrieval: 5,
  maxContextTokens: 8000,
  enableVerifier: true,
  enableMetaLoop: false,
  language: 'cpp',
  logDir: './logs',
  archiveDir: './archive',
  gotchasDir: './gotchas',
};

const harness = new HarnessRunner(config, modelStream);
const trace = await harness.solve(problem);

console.log(trace.finalVerdict); // 'AC', 'WA', 'TLE', etc.
```

**modelStream** is your LLM function:

```typescript
const modelStream = async (prompt: string): Promise<string> => {
  // Call your LLM (OpenAI, Anthropic, etc.)
  // Return the model's response text
};
```

---

## Repository Structure

```
packages/coding-agent/src/metagotchi/
├── index.ts              # Public re-exports
├── types.ts              # SprintContract, GotchaRecord, etc.
├── harness.ts            # HarnessRunner orchestration
├── layers/
│   ├── classifier.ts    # Problem classification
│   ├── retriever.ts      # Context retrieval
│   ├── prompter.ts       # Prompt assembly
│   ├── verifier.ts       # Candidate verification
│   └── logger.ts         # Raw trace logging
├── skills/
│   ├── gotchas.ts        # 14+ failure patterns
│   ├── algorithms.ts     # Domain templates
│   └── api-refs.ts       # Language API snippets
├── store/
│   ├── trace-store.ts    # Filesystem trace persistence
│   └── solution-archive.ts
├── meta/
│   └── proposer.ts       # Outer-loop optimizer
└── scripts/
    └── validate.ts       # Smoke test (<5s)
```

---

## Non-Negotiable Rules

1. **Start additive, not rewriting.** Regressions are cheaper to control when changes are narrow.
2. **Inspect raw traces before theorizing.** Never optimize from summaries alone.
3. **Protect gotchas.** Never drop the gotcha block to save tokens.
4. **Protect verification.** Do not skip compile/sample/static checks.
5. **Isolate confounds.** Do not change multiple causal dimensions at once.
6. **Keep filesystem history queryable.** The meta-loop depends on grep-able logs.
7. **Do not move deterministic behavior into optional skills.** If it must always happen, it belongs in runtime or persistent context.

---

See [metagotchi-docs.md](metagotchi-docs.md) for the full specification.

---

## Packages

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot for pi |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web chat components |
| **[@mariozechner/pi-pods](packages/pods)** | vLLM deployment CLI |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) for project rules.

## Development

```bash
npm install
npm run build
npm run check
./test.sh
./pi-test.sh
```

## License

MIT