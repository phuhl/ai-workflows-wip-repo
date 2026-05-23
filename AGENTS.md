# AGENTS.md

## What this repo is

A central repository of **OpenCode AI skills** and **reusable GitHub Actions workflows** consumed by other repos. This repo itself is not an application — it has no app entrypoint, no build step, and no test suite.

Target repos copy wrapper workflow files from `wrappers/` into their own `.github/workflows/`. At CI time, `scripts/bootstrap-skills.ts` copies shared skills and plugins into the target repo's `.opencode/` (run via `npx tsx`).

## Skill format

Every skill is a directory under `.opencode/skills/<name>/` containing a `SKILL.md` with YAML frontmatter:

```yaml
---
name: <skill-name>
description: <one-line>
allowed-tools: Read, Glob, Grep, Bash, Todowrite
context: fork
agent: general-purpose
argument-hint: <hint>  # optional
---
```

Supporting files go in `references/` subdirectories. Skill frontmatter is required.

## Skill categories

Skills are split into two directories:

- **`.opencode/skills/`** — Skills consumed by target repos. Copied by `bootstrap-skills.ts` at CI time. These are the public workflow-facing skills.
- **`src/skills/`** — Internal skills for the ai-workflows repo itself. NOT copied by bootstrap. These are tooling for developing and testing the workflow system (e.g., `verify-e2e`).

Target repos never see internal skills. The `opencode.json` config includes both paths so the runtime loads all skills during local development.

System-level skills (like `skill-creator`, `create-code-review-skill`) live in `~/.config/opencode/skills/` and are also not copied.

## Shared infrastructure

Common resources used by multiple skills live under `.opencode/skills/_shared/`. Directories beginning with `_` are not treated as skills by the runtime.

### Shared references (`_shared/references/`)

Skills load these via `Read .opencode/skills/_shared/references/<name>.md` instead of inlining the same content:

- **`post-write-hook.md`** — Post-write formatting behavior (prettier, eslint, tsc).
- **`git-safety.md`** — Git safety rules (never stage protected directories).
- **`context-summary.md`** — Launches a subagent (via Task tool) to independently read issue body, issue comments, PR body, PR comments, and review comments, then returns a concise structured summary highlighting gotchas, past decisions, and unresolved feedback. Used by implement skills (`plan-and-implement`, `fix-pr`, `resolve-pr-conflicts`) before making any code changes. Supports reading pre-fetched files from `.ai-workflows/` when available (saves tokens).
- **`self-check.md`** — Runs the four audit skills (`code-review`, `verify-tests`, `code-guidelines-check`, `deduplication-check`) in parallel on a diff range, then iteratively fixes all `must-fix` and `should-fix` findings. Used by every code-changing skill (`plan-and-implement`, `fix-pr`, `fix-pr-ci`, `resolve-pr-conflicts`, `user-do`) after making changes, to validate the full PR before considering work done. Before running audits, ensures context files exist in `.ai-workflows/` so audits don't flag intentional decisions.
- **`review-context.md`** — Teaches audit skills how to read and respect developer intent from pre-fetched PR/issue context and code comments. All four audit skills load this reference before forming findings. Discards findings that contradict explicitly documented intent.

### Shared scripts (`_shared/scripts/`)

Skills invoke these via `npx tsx .opencode/skills/_shared/scripts/<name>.ts`:

- **`format-and-commit.ts`** — Stages files, runs prettier/eslint, commits with the given message, and pushes. Usage: `format-and-commit.ts "<message>" <file...>`. Exit codes: 0=success, 1=usage error.
- **`sync-base-branch.ts`** — Finds the PR for an issue number, checks out its head branch, and merges the latest base branch. Usage: `sync-base-branch.ts <issue-number>`. Exit codes: 0=success, 1=usage error, 2=no PR found, 3=merge conflict.
- **`check-off-subtask.ts`** — Finds the "## Subtasks" comment on an issue and checks off a checkbox. Usage: `check-off-subtask.ts <issue-number> "<subtask-text>" [repo]`. Exit codes: 0=success, 1=usage error, 2=no repo, 3=no subtasks comment found.
- **`post-review-reply.ts`** — Posts a reply to an existing code-line review comment thread using properly-typed JSON (in_reply_to as integer). Usage: `post-review-reply.ts <pr-number> <comment-id> "<body>"`. Exit codes: 0=success, 1=usage error.
- **`fetch-pr-context.ts`** — Pre-fetches PR body, PR comments, review comments, issue body, issue comments, changed file list, and code comments from changed files, saving them to `.ai-workflows/`. Also generates an initial `review-context.md`. Usage: `fetch-pr-context.ts <pr-number> [issue-number]`. Exit codes: 0=success, 1=usage error, 2=no PR/issue found. Run by workflows before the main `opencode` invocation so skills can read context without making their own `gh` calls.

## Skill reference files (per-repo customization)

Some skills reference files like `references/checklist.md`, `references/coverage-map.md`, or `references/gotchas.md`. These reference files are **deliberately not included** in the shared repo — they are placeholders for target repos to customize. When a skill references a file that doesn't exist, the skill falls back to generic behavior. Target repos can add these files under their local `.opencode/skills/<skill-name>/references/` to provide repo-specific guidance. The bootstrap script overlays local files on top of shared ones, so local reference files take precedence.

Having these reference files is **optional but recommended** — they improve skill performance by providing repo-specific context (e.g., coding conventions, known patterns, test gotchas) that the AI can use directly rather than having to infer from codebase exploration.

## Plugins

Two TypeScript plugins in `.opencode/plugins/`, consumed by the OpenCode CLI runtime via `@opencode-ai/plugin@1.14.24` (the only dependency, defined in `.opencode/package.json`):

- **`file-hook.ts`** — After every `write`/`edit` of a `.ts/.tsx/.js/.jsx/.mjs/.cjs` file, runs `prettier`, `eslint`, and `tsc --noEmit`. Non-blocking (only logs issues).
- **`git-guard.ts`** — Intercepts `git add` and `git commit`. Automatically unstages any **new** files (`--diff-filter=A`) from `.ai-workflows/`, `.opencode/skills/`, or `.opencode/plugins/`.

The bootstrap script copies plugins alongside skills. Target repos can override plugins by placing files in their own `.opencode/plugins/` (local wins over shared).

## Workflow architecture

- **Master router**: `reusable-opencode-master.yml` inspects event type and comment content, dispatches to the correct sub-workflow via conditional `if:` gates.
- **Complete-gate** (`reusable-opencode-complete-gate.yml`, 674 lines): The central orchestrator. Monitors CI, handles autofix loops (max 3 attempts per category), runs code review when CI passes. Uses a label state machine.
- **Common pattern**: Every workflow generates a GitHub App token, checks out this repo into `.ai-workflows/`, bootstraps skills, pre-fetches PR/issue context via `fetch-pr-context.ts`, installs `opencode-ai@1.14.24` globally, runs `opencode run --model opencode-go/deepseek-v4-pro`. The pre-fetch step saves raw context to `.ai-workflows/` so skills never need to call `gh` themselves — they read from files.

### Variants

- **`max`**: Used for code-writing workflows (plan-and-implement, fix-pr, do, plan, address-review, complete-gate).
- **`high`**: Used for code-review workflows.

## Wrappers

Target repos copy wrapper files from `wrappers/`:
- **Master wrapper** (`wrappers/master/opencode-master.yml`): Single file, subscribes to all triggers. Uses a union of all permissions.

The `workflow_run` trigger in the complete-gate wrapper listens for a specific CI workflow name (default `"Run API Tests"`). Target repos **must change** this to their longest-running required status check.

## PR label state machine

Two mutually exclusive labels on target repo PRs:
- **`auto-review`**: Bot is actively processing (CI monitoring, autofix, review).
- **`ready for review`**: Bot finished. PR ready for human review.

Additional: `opencode` (on issues triggers plan-and-implement), `autofix-attempts-N`, `autofix-exhausted`, `gate-running`.

## Autofix loop limit

The complete-gate allows **max 3 autofix attempts** per category (merge conflicts, CI failures). After 3, it adds `autofix-exhausted` and stops. Manual intervention required.

## Git safety — three-layer defense

Skills must **never** commit files from `.ai-workflows/`, `.opencode/skills/`, or `.opencode/plugins/`. Three protections:
1. Bootstrap writes `.gitignore` with `*` into bootstrapped directories.
2. The `git-guard` plugin unstages new files in protected directories.
3. Every skill instructs: always use `git add <specific-files>`, never `git add .` or `git add -A`.

## Skill behavior: no local test execution

Skills are told: "Do not run tests locally on target repositories." CI is the source of truth. Push changes and let CI verify. This avoids flaky local environments, missing test deps, or timeouts from large test suites.

## Review context flow

Audit skills (code-review, verify-tests, deduplication-check, code-guidelines-check) must never flag code changes that are explicitly documented as intentional. The context flow ensures this:

1. **Workflows pre-fetch context**: Before the main `opencode run`, the workflow calls `fetch-pr-context.ts <pr-number> [issue-number]` which saves PR body, issue body, review comments, changed file list, and code comments to `.ai-workflows/`.
2. **Skills read context**: All four audit skills load the `review-context.md` shared reference, which instructs them to check `.ai-workflows/review-context.md` and related files before forming judgments.
3. **Discard contradictory findings**: If the PR description, issue, or a code comment in the changed file explicitly documents the flagged behavior as intentional, the finding is discarded. A finding may only be kept as a "note" if a concrete bug or safety issue contradicts the stated intent.
4. **review-pr intent-filter**: As a safety net, `review-pr` applies an additional intent filter after receiving audit outputs, cross-referencing each finding against the PR description and code comments.

This mirrors the `context-summary.md` pattern used by implement skills, but for the review direction: instead of "read context before implementing," it's "read context before judging." Both now support pre-fetched `.ai-workflows/` files to save tokens.

## Verification scripts

This repo has two validation scripts used during CI:
- `scripts/verify-bullet-length.ts` — PR summary bullets must be ≤ 200 chars.
- `scripts/verify-no-unresolved-comments.ts` — All code-line review comment threads (any author) must have the bot as the last reply before finalizing. The bot username is auto-detected via `gh api /user` (fallback: `opencode[bot]`).

## Local test suite (this repo only)

Run before pushing changes to catch regressions early:

```bash
npm test                 # or: npx tsx tests/run.ts
```

The suite has four layers:

1. **Structural validation** (`tests/validate/`) — Checks skill frontmatter, reference integrity, tool permission requirements (detects if skills reference tools they haven't declared in `allowed-tools`), wrapper→workflow consistency, and YAML syntax across all `.yml` and `SKILL.md` files (vitest tests).
2. **Script tests** (`tests/scripts/`) — Vitest tests for `bootstrap-skills.ts`, `verify-bullet-length.ts`, `verify-no-unresolved-comments.ts`, `format-and-commit.ts`, `sync-base-branch.ts`, `check-off-subtask.ts`, `fetch-pr-context.ts`, and `post-review-reply.ts` (mocked `gh` CLI via vitest mocks/fixtures).
3. **Plugin unit tests** — Vitest tests for `file-hook.ts` and `git-guard.ts` (run from `.opencode/`).
4. **E2E tests** (`tests/e2e/`) — Integration tests that run against a dedicated dummy repository. A test runner script uses the `gh` CLI to simulate real user interactions (creating issues, labeling them, commenting `/oc` commands) and verifies that the workflows and skills execute correctly end-to-end. See the E2E test section below for setup and usage.

Prerequisites: `vitest` and `tsx` installed (run `npm install`).

## Conventions

- **Branch**: `master` (not `main`).
- **Commit style**: Conventional commits, lowercase prefix (`fix:`, `feat:`, `refactor:`).
- **Keep AGENTS.md in sync**: Any change that adds, removes, or renames skills, scripts, plugins, workflows, or changes their behavior must update AGENTS.md accordingly.
- **Keep docs in sync**: Any change that adds, removes, or renames a `/oc` command, workflow trigger, or user-facing behavior must update `README.md` and `USER_GUIDE.md` to reflect it.
- **Respect developer intent**: Audit skills must read PR/issue context (from pre-fetched `.ai-workflows/` files or directly) before forming findings. Any code change that is explicitly documented as intentional — in the PR description, issue discussion, or code comments — must NOT be flagged. This prevents review skills from flagging deliberate decisions (e.g., removing backwards-compat code) based on outdated assumptions.
- **Actor gating**: Workflows gate on allowed actors via configurable `ALLOWED_ACTORS` input (default `'phuhl'`). Gating can be bypassed per-repo via the `BYPASS_ACTOR_CHECK` input. Target repos configure `vars.ALLOWED_ACTORS` (comma-separated GitHub usernames) and optionally `vars.BYPASS_ACTOR_CHECK` (boolean) as repository variables. Private repos automatically bypass actor checks (`BYPASS_ACTOR_CHECK` defaults to `github.event.repository.private` in wrappers).
- **PR stacking**: Issue comments with "stack on #42" or "base on #42" cause `plan-and-implement` to use that PR's branch as the base.
- **OpenCode config**: `opencode.json` sets `skills.paths` to `[".opencode/skills"]` and allows `/tmp/**` via `external_directory` permission. Target repos need this too.
- **Tests for new files**: New scripts and plugins should include corresponding test files. Scripts in `scripts/` or `.opencode/skills/_shared/scripts/` get tests in `tests/scripts/`; plugins in `.opencode/plugins/` get tests in `.opencode/tests/`.

## E2E test suite (this repo only)

The E2E test suite verifies end-to-end workflow behavior by simulating real user actions against a dedicated dummy GitHub repository.

### Setup

1. **Create a dummy target repo** (e.g., `phuhl/ai-workflows-test-repo`) with the following content:
   - `.github/workflows/opencode-master.yml` — wrapper calling `reusable-opencode-master.yml`
   - `.github/workflows/run-tests.yml` — CI workflow named "Run All Tests"
   - `opencode.json` — OpenCode config
   - `package.json` with `vitest` and `tsx`
   - Dummy source code (`src/`) and tests (`tests/`)
   - Branch `master` (not `main`)
2. **Install the GitHub App** from `apparts-js/ai-workflows` on the dummy repo.
3. **Configure repo variables**: Set `ALLOWED_ACTORS` and optionally `BYPASS_ACTOR_CHECK` in the dummy repo's `Settings > Secrets and variables > Actions > Variables`.
4. **Create `.env`** in this repo's root:
   ```
   GITHUB_TOKEN=<tester-pat-with-read-write-access>
   TEST_REPO=phuhl/ai-workflows-test-repo
   ```
5. The `.env` file is gitignored and never committed.

### Running

```bash
# Setup only (comes from npm install)
npm install

# List available scenarios
npm run test:e2e -- --list

# Run a single scenario
npm run test:e2e -- --repo phuhl/ai-workflows-test-repo --scenario happy-path

# Run all scenarios
npm run test:e2e -- --repo phuhl/ai-workflows-test-repo --all

# Run specific scenarios
npm run test:e2e -- --repo phuhl/ai-workflows-test-repo --scenario happy-path --scenario plan-only
```

### Scenarios

| Scenario | Description |
|----------|-------------|
| `happy-path` | Issue labeled `opencode` → PR created → bot-authored code |
| `plan-only` | `/oc plan` on issue → plan comment, no PR created |
| `fix-pr` | `/oc fix-pr` on PR → bot responds |
| `code-review` | `/oc code-review` on PR → review comments |
| `user-do` | `/oc do <prompt>` → bot executes custom prompt |
| `autofix-exhausted` | Failing CI → 3 autofix attempts → exhausted label |
| `complete-gate` | `auto-review` label → gate processes PR |

### Architecture

```
tests/e2e/
├── run.ts                  # CLI entrypoint
├── engine.ts               # GitHub API abstraction via gh CLI
├── utils.ts                # Polling, retry, assertions
├── types.ts                # Shared types
└── scenarios/
    ├── index.ts            # Scenario registry
    ├── happy-path.ts
    ├── plan-only.ts
    ├── fix-pr.ts
    ├── code-review.ts
    ├── user-do.ts
    ├── autofix-exhausted.ts
    └── complete-gate.ts
```

The test runner uses the `gh` CLI with the tester's PAT. Each scenario:
1. **Setup** — Creates issues, PRs, or other preconditions
2. **Trigger** — Performs the action (label, comment, etc.)
3. **Wait** — Polls with backoff for expected outcomes
4. **Assertions** — Verifies structural properties (bot authored, labels correct, no errors, etc.)
5. **Cleanup** — Closes issues, deletes branches, etc.

## Key commands

```bash
# Run all local tests before pushing
npm test                     # or: npx tsx tests/run.ts

# Run only vitest tests
npx vitest run

# Run only plugin tests
cd .opencode && npx vitest run

# Run E2E tests (requires .env and test repo setup)
npm run test:e2e -- --repo <owner/repo> --all

# Verify bullet length for a PR summary
npx tsx scripts/verify-bullet-length.ts "bullet 1" "bullet 2"

# Verify all review comments are addressed on a PR
npx tsx scripts/verify-no-unresolved-comments.ts <pr-number>
```

## References

- `USER_GUIDE.md` — End-user tutorial for the OpenCode workflow (not for AI consumption).
- `README.md` — Setup instructions for target repos.
- `opencode.json` — OpenCode CLI config pointing to skill paths.
