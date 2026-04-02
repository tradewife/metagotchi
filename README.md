<!-- OSS_WEEKEND_START -->
# 🏖️ OSS Weekend

**Issue tracker reopens Monday, April 6, 2026.**

OSS weekend runs Friday, March 27, 2026 through Monday, April 6, 2026. New issues are auto-closed during this time. For support, join [Discord](https://discord.com/invite/3cU7Bz4UPx).
<!-- OSS_WEEKEND_END -->

---

<p align="center">
  <a href="https://shittycodingagent.ai">
    <img src="https://shittycodingagent.ai/logo.svg" alt="pi logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/tradewife/metagotchi/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/tradewife/metagotchi/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

# Metagotchi

> Deterministic competitive programming harness. Built on Pi.

Metagotchi is Pi operating under a deterministic competitive programming harness. The harness always runs first—it classifies problems, builds sprint contracts, retrieves high-signal context, verifies outputs, logs raw traces, and optionally learns from failures.

**Core principle: The harness is law; skills are library shelves.**

A harness is executable infrastructure that governs what information the model sees and when it sees it. A skill is a reusable knowledge artifact that can be consulted or injected, but it is not the control plane itself.

---

## The Solve Pipeline

Every solve follows this deterministic order:

1. **Classify** — Infer domain, sub-domain, difficulty, edge cases → build `SprintContract`
2. **Retrieve** — Fetch gotchas, prior solutions, API refs, and code templates
3. **Build Prompt** — Assemble under token budget, preserve gotchas and risk blocks
4. **Generate** — Produce candidate solutions under the contract
5. **Verify** — Compile check, sample execution, static analysis, ranking
6. **Log** — Raw trace persisted to filesystem
7. **Archive** — Store AC solutions or increment gotchas on failure
8. **Meta-loop** (optional) — Outer-loop harness search using filesystem evidence

None of these steps are optional. The harness runs every time.

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

## Architecture

Metagotchi implements a strict **Planner / Generator / Evaluator** separation:

| Role | Component | Responsibility |
|------|-----------|-----------------|
| Planner | `layers/classifier.ts` | Classify problem, build SprintContract |
| Generator | Pi (via prompt package) | Produce candidate solutions |
| Evaluator | `layers/verifier.ts` | Verify candidates, assign verdicts |
| Memory | `layers/logger.ts`, `store/*` | Persist raw traces, gotchas, archives |
| Meta-optimizer | `meta/proposer.ts` | Propose harness edits (when enabled) |

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

## Using with Existing Pi Installations

Metagotchi integrates with any Pi, Claude Code, or OpenCode installation that has access to the `HarnessRunner` API. Install `@mariozechner/pi-coding-agent` and import from the `metagotchi` subpath.

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

## Attribution

Metagotchi is built on [Pi](https://pi.dev), a minimal terminal coding harness created by Mario Zechner. Metagotchi extends Pi with a deterministic competitive programming control plane while preserving Pi's extensibility through skills, prompt templates, and extensions.

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