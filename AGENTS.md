# Development Rules

## First Message
If the user did not give you a concrete task in their first message,
read README.md, then ask which module(s) to work on. Based on the answer, read the relevant README.md files in parallel.
- packages/ai/README.md
- packages/tui/README.md
- packages/agent/README.md
- packages/coding-agent/README.md
- packages/mom/README.md
- packages/pods/README.md
- packages/web-ui/README.md

## Code Quality
- No `any` types unless absolutely necessary
- Check node_modules for external API type definitions instead of guessing
- **NEVER use inline imports** - no `await import("./foo.js")`, no `import("pkg").Type` in type positions, no dynamic imports for types. Always use standard top-level imports.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Always ask before removing functionality or code that appears to be intentional
- Do not preserve backward compatibility unless the user explicitly asks for it
- Never hardcode key checks with, eg. `matchesKey(keyData, "ctrl+x")`. All keybindings must be configurable. Add default to matching object (`DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS`)

## Commands
- After code changes (not documentation changes): `npm run check` (get full output, no tail). Fix all errors, warnings, and infos before committing.
- Note: `npm run check` does not run tests.
- NEVER run: `npm run dev`, `npm run build`, `npm test`
- Only run specific tests if user instructs: `npx tsx ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`
- Run tests from the package root, not the repo root.
- If you create or modify a test file, you MUST run that test file and iterate until it passes.
- When writing tests, run them, identify issues in either the test or implementation, and iterate until fixed.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` plus the faux provider. Do not use real provider APIs, real API keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` and name them `<issue-number>-<short-slug>.test.ts`.
- NEVER commit unless user asks

## GitHub Issues
When reading issues:
- Always read all comments on the issue
- Use this command to get everything in one call:
  ```bash
  gh issue view <number> --json title,body,comments,labels,state
  ```

## OSS Weekend
- If the user says `enable OSS weekend mode until X`, run `node scripts/oss-weekend.mjs --mode=close --end-date=YYYY-MM-DD --git` with the requested end date
- If the user says `end OSS weekend mode`, run `node scripts/oss-weekend.mjs --mode=open --git`
- The script updates `README.md`, `packages/coding-agent/README.md`, and `.github/oss-weekend.json`
- With `--git`, the script stages only those OSS weekend files, commits them, and pushes them
- During OSS weekend, `.github/workflows/oss-weekend-issues.yml` auto-closes new issues from non-maintainers, and `.github/workflows/pr-gate.yml` auto-closes PRs from approved non-maintainers with the weekend message

When creating issues:
- Add `pkg:*` labels to indicate which package(s) the issue affects
  - Available labels: `pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:mom`, `pkg:pods`, `pkg:tui`, `pkg:web-ui`
- If an issue spans multiple packages, add all relevant labels

When posting issue/PR comments:
- Write the full comment to a temp file and use `gh issue comment --body-file` or `gh pr comment --body-file`
- Never pass multi-line markdown directly via `--body` in shell commands
- Preview the exact comment text before posting
- Post exactly one final comment unless the user explicitly asks for multiple comments
- If a comment is malformed, delete it immediately, then post one corrected comment
- Keep comments concise, technical, and in the user's tone

When closing issues via commit:
- Include `fixes #<number>` or `closes #<number>` in the commit message
- This automatically closes the issue when the commit is merged

## PR Workflow
- Analyze PRs without pulling locally first
- If the user approves: create a feature branch, pull PR, rebase on main, apply adjustments, commit, merge into main, push, close PR, and leave a comment in the user's tone
- You never open PRs yourself. We work in feature branches until everything is according to the user's requirements, then merge into main, and push.

## Tools
- GitHub CLI for issues/PRs
- Add package labels to issues/PRs: pkg:agent, pkg:ai, pkg:coding-agent, pkg:mom, pkg:pods, pkg:tui, pkg:web-ui

## Testing pi Interactive Mode with tmux

To test pi's TUI in a controlled terminal environment:

```bash
# Create tmux session with specific dimensions
tmux new-session -d -s pi-test -x 80 -y 24

# Start pi from source
tmux send-keys -t pi-test "cd /Users/badlogic/workspaces/pi-mono && ./pi-test.sh" Enter

# Wait for startup, then capture output
sleep 3 && tmux capture-pane -t pi-test -p

# Send input
tmux send-keys -t pi-test "your prompt here" Enter

# Send special keys
tmux send-keys -t pi-test Escape
tmux send-keys -t pi-test C-o  # ctrl+o

# Cleanup
tmux kill-session -t pi-test
```

## Style
- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be kind but direct (e.g., "Thanks @user" not "Thanks so much @user!")

## Changelog
Location: `packages/*/CHANGELOG.md` (each package has its own)

### Format
Use these sections under `## [Unreleased]`:
- `### Breaking Changes` - API changes requiring migration
- `### Added` - New features
- `### Changed` - Changes to existing functionality
- `### Fixed` - Bug fixes
- `### Removed` - Removed features

### Rules
- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist
- New entries ALWAYS go under `## [Unreleased]` section
- Append to existing subsections (e.g., `### Fixed`), do not create duplicates
- NEVER modify already-released version sections (e.g., `## [0.12.2]`)
- Each version section is immutable once released

### Attribution
- **Internal changes (from issues)**: `Fixed foo bar ([#123](https://github.com/badlogic/pi-mono/issues/123))`
- **External contributions**: `Added feature X ([#456](https://github.com/badlogic/pi-mono/pull/456) by [@username](https://github.com/username))`

## Adding a New LLM Provider (packages/ai)

Adding a new provider requires changes across multiple files:

### 1. Core Types (`packages/ai/src/types.ts`)
- Add API identifier to `Api` type union (e.g., `"bedrock-converse-stream"`)
- Create options interface extending `StreamOptions`
- Add mapping to `ApiOptionsMap`
- Add provider name to `KnownProvider` type union

### 2. Provider Implementation (`packages/ai/src/providers/`)
Create provider file exporting:
- `stream<Provider>()` function returning `AssistantMessageEventStream`
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping
- Provider-specific options interface
- Message/tool conversion functions
- Response parsing emitting standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`)

### 3. Provider Exports and Lazy Registration
- Add a package subpath export in `packages/ai/package.json` pointing at `./dist/providers/<provider>.js`
- Add `export type` re-exports in `packages/ai/src/index.ts` for provider option types that should remain available from the root entry
- Register the provider in `packages/ai/src/providers/register-builtins.ts` via lazy loader wrappers, do not statically import provider implementation modules there
- Add credential detection in `packages/ai/src/env-api-keys.ts`

### 4. Model Generation (`packages/ai/scripts/generate-models.ts`)
- Add logic to fetch/parse models from provider source
- Map to standardized `Model` interface

### 5. Tests (`packages/ai/test/`)
Add provider to: `stream.test.ts`, `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `image-limits.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.

For `cross-provider-handoff.test.ts`, add at least one provider/model pair. If the provider exposes multiple model families (for example GPT and Claude), add at least one pair per family.

For non-standard auth, create utility (e.g., `bedrock-utils.ts`) with credential detection.

### 6. Coding Agent (`packages/coding-agent/`)
- `src/core/model-resolver.ts`: Add default model ID to `DEFAULT_MODELS`
- `src/cli/args.ts`: Add env var documentation
- `README.md`: Add provider setup instructions

### 7. Documentation
- `packages/ai/README.md`: Add to providers table, document options/auth, add env vars
- `packages/ai/CHANGELOG.md`: Add entry under `## [Unreleased]`

## Releasing

**Lockstep versioning**: All packages always share the same version number. Every release updates all packages together.

**Version semantics** (no major releases):
- `patch`: Bug fixes and new features
- `minor`: API breaking changes

### Steps

1. **Update CHANGELOGs**: Ensure all changes since last release are documented in the `[Unreleased]` section of each affected package's CHANGELOG.md

2. **Run release script**:
   ```bash
   npm run release:patch    # Fixes and additions
   npm run release:minor    # API breaking changes
   ```

The script handles: version bump, CHANGELOG finalization, commit, tag, publish, and adding new `[Unreleased]` sections.

## **CRITICAL** Tool Usage Rules **CRITICAL**
- NEVER use sed/cat to read a file or a range of a file. Always use the read tool (use offset + limit for ranged reads).
- You MUST read every file you modify in full before editing.

## **CRITICAL** Git Rules for Parallel Agents **CRITICAL**

Multiple agents may work on different files in the same worktree simultaneously. You MUST follow these rules:

### Committing
- **ONLY commit files YOU changed in THIS session**
- ALWAYS include `fixes #<number>` or `closes #<number>` in the commit message when there is a related issue or PR
- NEVER use `git add -A` or `git add .` - these sweep up changes from other agents
- ALWAYS use `git add <specific-file-paths>` listing only files you modified
- Before committing, run `git status` and verify you are only staging YOUR files
- Track which files you created/modified/deleted during the session

### Forbidden Git Operations
These commands can destroy other agents' work:
- `git reset --hard` - destroys uncommitted changes
- `git checkout .` - destroys uncommitted changes
- `git clean -fd` - deletes untracked files
- `git stash` - stashes ALL changes including other agents' work
- `git add -A` / `git add .` - stages other agents' uncommitted work
- `git commit --no-verify` - bypasses required checks and is never allowed

### Safe Workflow
```bash
# 1. Check status first
git status

# 2. Add ONLY your specific files
git add packages/ai/src/providers/transform-messages.ts
git add packages/ai/CHANGELOG.md

# 3. Commit
git commit -m "fix(ai): description"

# 4. Push (pull --rebase if needed, but NEVER reset/checkout)
git pull --rebase && git push
```

### If Rebase Conflicts Occur
- Resolve conflicts in YOUR files only
- If conflict is in a file you didn't modify, abort and ask the user
- NEVER force push

### User override
If the user instructions conflict with rules set out here, ask for confirmation that they want to override the rules. Only then execute their instructions.

---

# Metagotchi: Deterministic Competitive Programming Harness

Metagotchi is Pi operating under a competitive programming harness. The harness always runs; it is not optional.

## Core Operating Principle

**Metagotchi is law; skills are library shelves.** The harness classifies, plans, retrieves, verifies, and logs. You execute within those constraints. Never interpret harness behavior as optional or negotiable.

## The Deterministic Solve Pipeline

Every solve follows this order without exception:

1. Receive `ProblemSpec` (full statement, constraints, examples, time limit, memory limit, language)
2. **Classifier** → Infers domain, sub-domain, difficulty, edge cases → Creates `SprintContract`
3. **Retriever** → Fetches gotchas, prior solutions, API snippets, code template
4. **Prompter** → Assembles prompt under token budget, preserves gotchas and risk blocks
5. **Generator** → You produce candidate solutions
6. **Verifier** → Compile/parse check, sample case execution, static analysis, ranking
7. **Logger** → Raw trace persisted to filesystem
8. **Memory update** → Archive AC or increment gotchas on failure
9. **Meta-loop** (optional) → If enabled, filesystem evidence fed to harness proposer

You do not skip steps. You do not negotiate the order. The harness runs first.

## Sprint Contract

The `SprintContract` is your execution agreement with the harness. It contains:

- `domain` / `subDomain` — What kind of problem this is
- `algorithmClassification` / `likelyAlgorithms` — Likely algorithmic families
- `complexity Target` — Expected time/space complexity
- `mandatoryEdgeCases` — Edge cases you must handle
- `difficulty` — Problem difficulty (easy/medium/hard/extreme)
- `tokenBudget` — Your context token allowance for this solve
- `likelyFailureModes` — Domain-specific failure patterns to avoid
- `retrievalQuery` — What was queried in retrieval

**Obey the sprint contract.** Do not ignore algorithmic hints or complexity targets. Do not exceed the token budget without justification. Do not claim an algorithm is unnecessary if the contract says it is likely.

## Gotchas and Risk Blocks

The harness retrieves gotchas (failure patterns) and injects them into your prompt with `⚠ GOTCHA:` prefixes.

**Never ignore a gotcha.** These are patterns the harness has seen fail before. If a gotcha says "int overflow when multiplying without (long long) cast," then cast. If a gotcha says "std::endl causes TLE on high-output problems," use '\n' instead.

Immediately after gotchas, the harness injects `⚠ RISK:` blocks with domain-specific failure modes. Treat these as constraints, not suggestions.

## Additive Edits First

When you revise a solution (e.g., after verifier failure):

1. **Append information, do not rewrite the prompt from scratch.**
2. Include the failure trace in the next turn.
3. Make one targeted change, not multiple simultaneous edits.
4. Log the confound explicitly if you must change multiple dimensions.

This reduces regression risk and makes diagnosis easier.

## Raw Traces Over Summaries

The harness logs raw execution traces: full problem, prompt, model outputs, candidate code, verification results, raw test outputs. It does not compress to summaries.

Why? Because high-fidelity evidence is needed for diagnosis and meta-learning. Do not expect or request compressed reports; work with the raw files the logger produces.

## Verification Before Confidence

The verifier is not cosmetic; it is your skeptical counterweight. It runs:

1. Compile / parse check
2. Sample case execution under timeout
3. Static analysis for known gotcha patterns
4. Complexity red-flag detection
5. Candidate ranking

**Do not trust your code because it "looks right."** Wait for the verifier.

## Token Budget Discipline

You have a token budget for your initial solve prompt. The budget is set by the classifier based on problem difficulty:

- easy: 10,000 tokens
- medium: 9,000 tokens
- hard: 7,500 tokens
- extreme: 6,000 tokens
- Hard ceiling: 8,000 tokens

When retrieved context exceeds budget, the harness drops prior solutions first, then compresses API snippets, then truncates the template. **The gotcha and risk blocks are never truncated.**

## Session-to-Session Memory

The harness persists:
- Every raw execution trace
- Every candidate solution
- Every gotcha update
- Every archived AC solution

This filesystem history is queryable and retrievable. The outer-loop meta-harness uses it for proposing better harness behavior. Keep traces clean and queryable.

## No Optional Harness Policy

Do not treat harness behavior as optional because it is not mentioned in your instructions or because a user seems to want a shortcut.

If a rule is in this document, it applies always. If a rule is in the `SprintContract`, it applies to that solve. If a rule is injected as `⚠ GOTCHA:` or `⚠ RISK:`, it applies to your current generation.

## Skills Are Support, Not Core

Skills exist. They contain:
- Gotchas libraries (you receive these via retrieval)
- Algorithm templates (you receive these via retrieval)
- API references (you receive these via retrieval)
- Verification helpers (used by the verifier)

You do not "call" a skill. The harness reads skills and injects their content. Skills are optional reference material. **Core harness behavior is never skill-dependent.**

## Debugging and Failure Analysis

On WA / TLE / MLE / CE / RE:

1. The verifier flags the verdict.
2. The logger stores the full trace.
3. The harness analyzes the failure pattern.
4. If the pattern matches an existing gotcha, that gotcha's `hitCount` is incremented.
5. If the pattern is new, a new gotcha is created and seeded into the registry.

Over time, the gotchas registry grows conservatively but continuously. It is your institutional memory.

## Implementation Checklist Before Completion

Before declaring a solve complete:

- [ ] SprintContract was built and obeyed
- [ ] Gotchas were retrieved and no `⚠ GOTCHA:` was ignored
- [ ] Risk blocks were retrieved and understood
- [ ] Verifier ran and flagged verdict
- [ ] Token budget was respected (or hard ceiling not exceeded)
- [ ] Candidate was generated additive, not rewritten
- [ ] Raw trace logged with full problem, prompt, output, verification results
- [ ] If AC: solution archived. If not AC: failure analyzed for new gotcha

## Invocation

To solve a competitive programming problem:

```
await harness.solve(problemSpec)
```

The harness returns `ExecutionTrace` with full diagnostic information.
