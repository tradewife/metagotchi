# Metagotchi: Deterministic Competitive Programming Harness for Pi

Metagotchi is Pi wrapped in a deterministic harness optimized for competitive programming. It classifies problems, builds sprint contracts, retrieves high-signal context, verifies outputs, and logs raw traces for diagnosis and meta-learning.

**Core principle: The harness is law; skills are library shelves.**

Metagotchi is not "Pi plus some helpful optional skills." Metagotchi is Pi inside a harness that always runs. The harness plans, retrieves, verifies, and logs. Pi focuses on generation within those constraints.

---

## What Metagotchi Does

**Every solve follows the same deterministic order:**

1. Classify the problem → build `SprintContract`
2. Retrieve gotchas, prior solutions, API refs, and templates
3. Assemble prompt under token budget, preserving gotchas and risk blocks
4. Pi generates candidate solutions
5. Verify: compile, sample cases, static analysis, ranking
6. Log raw trace to filesystem
7. Archive AC solutions or update gotchas on failure
8. Optional: outer-loop harness search (if enabled)

None of these steps are optional or negotiable. The harness runs every time.

---

## Why Metagotchi Exists

The original competitive programming harness spec showed that raw execution traces outperform compressed summaries, and Meta-Harness demonstrated that harness-level optimization with full diagnostic access can improve outcomes by 7.7 points on some tasks while using 4× fewer tokens.

Metagotchi embodies these lessons: what matters is not just the base model, but what context it sees, what constraints are enforced, and how failures become durable memory.

---

## Getting Best Results

### What Users Must Provide

- **Full problem statement** with all original detail (do not pre-trim edge case text)
- **All constraints** (time limit, memory limit, n ranges, value ranges, etc.)
- **All examples** with exact input/output format
- **Target language** (C++, Python, Java, Rust, TypeScript)

### What Users Should Know

1. **The gotchas block is not optional.** If the prompt contains `⚠ GOTCHA: std::endl causes TLE`, then use '\n' instead of endl. Gotchas are failure patterns the harness has seen before.

2. **The risk block is not optional.** If the prompt contains `⚠ RISK: floating point epsilon wrong — use 1e-9`, then use 1e-9, not 1e-6.

3. **The sprint contract is the agreement.** If the contract says "algorithm: Dijkstra, complexity: O(n log n)", then use Dijkstra and stay within that complexity. Do not use Bellman-Ford because it "feels simpler."

4. **Verification is not cosmetic.** The verifier will check compile, sample output, timeout behavior, and gotcha patterns. Trust it. Do not claim your code is correct because it "looks right."

5. **Raw traces are queryable memory.** The harness logs everything to the filesystem in queryable format. These traces are used for diagnosis and harness improvement. Keep them.

### For Stronger Results Over Time

- **Archive AC solutions.** The retriever uses them for priors. More AC examples in the archive → better retrieval → better prompts.
- **Review failure traces.** When a solve fails, the trace is logged. Review it. If a new failure pattern emerges, the harness may add a new gotcha.
- **Keep gotchas updated.** As the gotchas registry grows, solve quality typically improves because Pi sees more of the institutional memory.
- **Let the meta-loop run if enabled.** If `enableMetaLoop=true`, Metagotchi proposes harness improvements using filesystem evidence from prior runs. These proposals compound over time.

---

## Repository Structure

All Metagotchi code lives under `packages/coding-agent/src/metagotchi/`:

| File | Purpose |
|---|---|
| `harness.ts` | Main orchestration |
| `types.ts` | Interfaces: SprintContract, GotchaRecord, HarnessCandidate, MetaProposal |
| `layers/classifier.ts` | Classify → build sprint contract |
| `layers/retriever.ts` | Fetch context and gotchas |
| `layers/prompter.ts` | Build prompt package, enforce budget |
| `layers/verifier.ts` | Verify: compile, sample, static, ranking |
| `layers/logger.ts` | Log raw traces |
| `skills/gotchas.ts` | Seeded gotcha registry (14+ entries) |
| `skills/algorithms.ts` | Domain templates and constraint map |
| `skills/api-refs.ts` | Language-specific API snippets |
| `store/solution-archive.ts` | Indexed AC solution archive |
| `store/trace-store.ts` | Filesystem-backed trace persistence |
| `meta/proposer.ts` | Outer-loop harness optimizer |
| `scripts/validate.ts` | Smoke test (7 assertions, <5s) |

---

## The Sprint Contract

Before Pi generates code, the classifier builds a `SprintContract`. This is the execution agreement.

The contract includes:

- **Domain** / **SubDomain** — What kind of problem (e.g., `graph` / `shortest-path`)
- **Algorithm** — Likely algorithms (e.g., Dijkstra, BFS)
- **Complexity Target** — Expected time/space (e.g., O(n log n))
- **Mandatory Edge Cases** — Cases you must handle (e.g., "empty input", "n=1")
- **Difficulty** — Problem difficulty (easy/medium/hard/extreme)
- **Token Budget** — Your context allowance for this solve
- **Likely Failure Modes** — Domain-specific gotchas to avoid
- **Retrieval Query** — What was used to find similar problems

**The contract is binding.** If it says "Dijkstra" and "O(n log n)", then use Dijkstra and stay within O(n log n). You are not being limited; you are being structured.

---

## Gotchas: Institutional Memory

The gotchas registry is the harness's accumulated failure memory.

**Current seeded gotchas include:**

- `g-cpp-int-overflow` — int overflow when multiplying before assigning to long long
- `g-cpp-cin-sync` — cin/cout without sync disable causes TLE on large I/O
- `g-graph-negative-dijkstra` — Dijkstra on graphs with negative weights (use Bellman-Ford)
- `g-dp-modular-arithmetic` — DP counting: forgot MOD at each step
- `g-python-recursion-limit` — Python DFS hits default limit (1000); set to 300000
- `g-geometry-floating-point` — Float comparison without epsilon (use 1e-9)
- `g-interactive-flush` — Interactive output not flushed; judge hangs
- `g-string-hash-collision` — Single hash collides; use double hashing
- `g-endl-flush-tle` — std::endl flushes buffer causing TLE (use '\n')
- `g-priority-queue-direction` — PQ heap direction wrong for Dijkstra (max-heap vs min-heap)
- `g-python-large-io-tle` — Python input() is slow on large I/O (use sys.stdin.readline)
- ... and more as they are discovered

When the harness injects `⚠ GOTCHA: [pattern]`, it means: this is a failure pattern. Do not repeat it.

---

## Verification Pipeline

The verifier runs automatically after each candidate is generated:

1. **Compile / Parse Check** — Does the code parse and compile without errors?
2. **Sample Case Execution** — Does it produce the correct output on all provided examples?
3. **Static Analysis** — Does the code match any known gotcha patterns (e.g., int overflow, cout/cin mixing)?
4. **Complexity Red-Flag** — Is the estimated complexity within the sprint contract target?
5. **Candidate Ranking** — When multiple candidates exist, rank by: AC > partial > no warnings > shorter code.

Verdicts: `AC` (all pass), `WA` (wrong answer), `TLE` (timeout), `MLE` (memory), `RE` (runtime error), `CE` (compile error), `PARTIAL` (some samples pass).

**Do not argue with the verifier.** If it says the code times out, the code times out.

---

## Token Budget

Metagotchi assigns a token budget for the initial prompt based on problem difficulty:

| Difficulty | Token Budget |
|---|---|
| easy | 10,000 |
| medium | 9,000 |
| hard | 7,500 |
| extreme | 6,000 |
| Hard ceiling | 8,000 |

The prompter respects this budget. When context is too large, it drops prior solutions first, compresses API snippets, then truncates the template.

**The gotcha and risk blocks are never truncated.** They are mandatory and always included.

---

## Filesystem-as-Context

Metagotchi treats the local filesystem as long-term memory.

Every solve produces a trace directory containing:

- `trace.json` — Full structured trace (queryable by grep)
- `problem.txt` — Original problem statement
- `classifier.json` — Classification output and sprint contract
- `retrieval.json` — What was retrieved and why
- `prompt.txt` — Full prompt sent to model
- `solutions/candidate-*.cpp` (or .py, .java) — Candidate code
- `verification/result-*.json` — Verification results
- `notes.txt` — Failure analysis if not AC

These traces are queryable, searchable, and used by:
- Humans reviewing failures
- The meta-loop harness proposer (if enabled)
- Future retrieval to find similar problems

**Do not delete traces casually.** They are training data for the harness.

---

## Meta-Loop (Optional)

If `enableMetaLoop=true`, Metagotchi instantiates `MetaProposer` for outer-loop harness search.

The proposer:
- Reads all prior candidate code and execution traces from the filesystem
- Detects regressions (where new candidates score worse than parents)
- Identifies Pareto frontier candidates (accuracy vs. token cost trade-off)
- Proposes additive harness edits to address observed failure patterns
- Never edits based on summaries; only raw evidence

**Critical invariant:** The proposer makes one causal change at a time and logs confounds explicitly. This prevents hidden regressions.

If enabled, the meta-loop compounds harness quality over multiple solves on similar problem classes.

---

## Do Not Do These Things

1. **Do not skip verification.** Do not claim code is correct because it "looks right". Wait for the verifier.
2. **Do not ignore gotchas.** Do not rationalize: "int overflow won't happen because n is small". The gotcha says it will; follow it.
3. **Do not overshoot the token budget.** The budget is there to keep context signal-to-noise high. Respect it.
4. **Do not make multiple simultaneous changes to harness code.** Change one causal dimension, test, log confounds if needed.
5. **Do not delete trace files.** They are evidence for diagnosis and meta-learning.
6. **Do not put mandatory harness logic in skills.** If a behavior must always happen, it belongs in the TypeScript runtime or `AGENTS.md`.
7. **Do not trust the first candidate.** Verification exists to catch mistakes the generator made.

---

## Quick Start

```typescript
import { HarnessRunner, type HarnessConfig, type ProblemSpec } from '@mariozechner/pi-coding-agent/metagotchi';

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

const harness = new HarnessRunner(config, model);
const trace = await harness.solve(problem);

console.log(trace.finalVerdict); // 'AC' if successful
```

---

## Monitoring and Debugging

Check logs at `{logDir}/traces/{sessionId}/`:

- `trace.json` for full diagnostic data
- `prompt.txt` to see what the model received
- `solutions/` for candidate code
- `verification/` for test results
- `notes.txt` for failure analysis

Use `scripts/validate.ts` to smoke test the harness:

```bash
npm run check
npx ts-node src/metagotchi/scripts/validate.ts
```

Expected: "✓ All assertions passed" in <5s, exit 0.

---

## One-Line Summary

**Metagotchi is a deterministic competitive programming harness for Pi: the runtime plans, retrieves, verifies, logs, and learns, while Pi focuses on generation inside those constraints.**

---

## Using Metagotchi with Existing Pi Installations

Metagotchi can be used with any Pi, Claude Code, or OpenCode installation that has access to the `HarnessRunner` API.

### Installation

Install the npm package:

```bash
npm install -g @mariozechner/pi-coding-agent
```

### Programmatic Usage

```typescript
import { HarnessRunner, type HarnessConfig, type ProblemSpec } from '@mariozechner/pi-coding-agent/metagotchi';

// Define your problem
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

// Configure the harness
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

// Create a model stream function for your provider
const modelStream = async (messages: any[], options: any) => {
  // Your LLM call here - return async iterable of tokens
};

// Run the harness
const harness = new HarnessRunner(config, modelStream);
const trace = await harness.solve(problem);

console.log(trace.finalVerdict); // 'AC' if successful
```

### With Pi SDK

If you're using the Pi SDK, you can integrate Metagotchi into your agent session:

```typescript
import { createAgentSessionRuntime } from '@mariozechner/pi-coding-agent';
import { HarnessRunner, type HarnessConfig } from '@mariozechner/pi-coding-agent/metagotchi';

// ... set up auth, model registry ...

const runtime = await createAgentSessionRuntime({
  // ... your config
});

// Add Metagotchi as a tool or extension
```

---

End README