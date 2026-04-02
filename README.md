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
  <a href="https://github.com/badlogic/pi-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/badlogic/pi-mono/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

# Metagotchi

> Deterministic competitive programming harness. Built on Pi.

Metagotchi is a competitive programming harness that classifies problems, builds sprint contracts, retrieves high-signal context, verifies outputs, logs raw traces for diagnosis, and learns from failures via an optional meta-loop.

**Core principle: The core is law; skills are library shelves.**

---

## What Metagotchi Does

**Every solve follows the same deterministic order:**

1. Classify the problem → build `SprintContract`
2. Retrieve gotchas, prior solutions, API refs, and templates
3. Assemble prompt under token budget, preserving gotchas and risk blocks
4. Generate candidate solutions
5. Verify: compile, sample cases, static analysis, ranking
6. Log raw trace to filesystem
7. Archive AC solutions or update gotchas on failure
8. Optional: outer-loop harness search (if enabled)

None of these steps are optional or negotiable. The core runs every time.

---

## Features

- **Problem Classification** — Infers domain, sub-domain, difficulty, and edge cases
- **Sprint Contracts** — Binding execution agreements specifying algorithm, complexity, and edge cases
- **Gotchas** — Institutional memory of failure patterns (14+ seeded patterns)
- **Verification Pipeline** — Compile check, sample execution, static analysis, complexity red-flags
- **Token Budget** — Difficulty-based budgets (easy: 10k, medium: 9k, hard: 7.5k, extreme: 6k)
- **Meta-Loop** — Optional outer-loop optimization using filesystem evidence

---

## Installation

```bash
npm install -g @mariozechner/pi-coding-agent
```

## Programmatic Usage

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

const harness = new HarnessRunner(config, modelStream);
const trace = await harness.solve(problem);

console.log(trace.finalVerdict); // 'AC' if successful
```

See [packages/coding-agent/src/metagotchi/README.md](packages/coding-agent/src/metagotchi/README.md) for detailed documentation.

---

## Packages

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot that delegates messages to the pi coding agent |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |
| **[@mariozechner/pi-pods](packages/pods)** | CLI for managing vLLM deployments on GPU pods |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT