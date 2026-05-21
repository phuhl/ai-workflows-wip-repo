# AGENTS.md

## What this repo is

A central repository of **OpenCode AI skills** and **reusable GitHub Actions workflows** consumed by other repos. This repo itself is not an application — it has no app entrypoint, no build step, and no test suite.

Target repos copy wrapper workflow files from `wrappers/` into their own `.github/workflows/`. At CI time, `scripts/bootstrap-skills.ts` copies shared skills and plugins into the target repo's `.opencode/` (run via `npx tsx`).

## Directory ownership

| Directory | Purpose | Edited here? |
|---|---|---|---|
| `.github/workflows/` | Reusable workflows (called by target repos via `uses:`) | Yes |
| `.opencode/skills/` | Shared AI skill definitions (Markdown + YAML frontmatter) | Yes |
| `.opencode/skills/_shared/` | Shared references and scripts used by multiple skills | Yes |
| `.opencode/plugins/` | Shared OpenCode plugins (TypeScript, consumed at runtime) | Yes |
| `scripts/` | Bootstrap and verification TypeScript scripts | Yes |
| `wrappers/` | Target-repo workflow wrappers (copied, not called directly) | Yes |

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

## Shared infrastructure

Common resources used by multiple skills live under `.opencode/skills/_shared/`. Directories beginning with `_` are not treated as skills by the runtime.

### Shared references (`_shared/references/`)

Skills load these via `Read .opencode/skills/_shared/references/<name>.md` instead of inlining the same content:

- **`post-write-hook.md`** — Post-write formatting behavior (prettier, eslint, tsc).
- **`git-safety.md`** — Git safety rules (never stage protected directories).
- **`context-summary.md`** — Launches a subagent (via Task tool) to independently read issue body, issue comments, PR body, PR comments, and review comments, then returns a concise structured summary highlighting gotchas, past decisions, and unresolved feedback. Used by implement skills (`plan-and-implement`, `fix-pr`, `resolve-pr-conflicts`) before making any code changes.
- **`self-check.md`** — Runs the four audit skills (`code-review`, `verify-tests`, `code-guidelines-check`, `deduplication-check`) in parallel on a diff range, then iteratively fixes all `must-fix` and `should-fix` findings. Used by every code-changing skill (`plan-and-implement`, `fix-pr`, `fix-pr-ci`, `resolve-pr-conflicts`, `user-do`) after making changes, to validate the full PR before considering work done.

### Shared scripts (`_shared/scripts/`)

Skills invoke these via `npx tsx .opencode/skills/_shared/scripts/<name>.ts`:

- **`format-and-commit.ts`** — Stages files, runs prettier/eslint, commits with the given message, and pushes. Usage: `format-and-commit.ts "<message>" <file...>`. Exit codes: 0=success, 1=usage error.
- **`sync-base-branch.ts`** — Finds the PR for an issue number, checks out its head branch, and merges the latest base branch. Usage: `sync-base-branch.ts <issue-number>`. Exit codes: 0=success, 1=usage error, 2=no PR found, 3=merge conflict.
- **`check-off-subtask.ts`** — Finds the "## Subtasks" comment on an issue and checks off a checkbox. Usage: `check-off-subtask.ts <issue-number> "<subtask-text>" [repo]`. Exit codes: 0=success, 1=usage error, 2=no repo, 3=no subtasks comment found.
- **`post-review-reply.ts`** — Posts a reply to an existing code-line review comment thread using properly-typed JSON (in_reply_to as integer). Usage: `post-review-reply.ts <pr-number> <comment-id> "<body>"`. Exit codes: 0=success, 1=usage error.

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
- **Common pattern**: Every workflow generates a GitHub App token, checks out this repo into `.ai-workflows/`, bootstraps skills, installs `opencode-ai@1.14.24` globally, runs `opencode run --model opencode-go/deepseek-v4-pro`.

### Variants

- **`max`**: Used for code-writing workflows (plan-and-implement, fix-pr, do, plan, address-review, complete-gate).
- **`high`**: Used for code-review workflows.

## Wrappers

Target repos copy wrapper files from `wrappers/`:
- **Master wrapper** (`wrappers/master/opencode-master.yml`): Single file, subscribes to all triggers. Uses a union of all permissions. Recommended.
- **Individual wrappers** (`wrappers/individual/`): One per trigger with narrower permissions.

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

## Verification scripts

This repo has two validation scripts used during CI:
- `scripts/verify-bullet-length.ts` — PR summary bullets must be ≤ 200 chars.
- `scripts/verify-no-unresolved-comments.ts` — All code-line review comment threads (any author) must have the bot as the last reply before finalizing. The bot username is auto-detected via `gh api /user` (fallback: `opencode[bot]`).

## Local test suite (this repo only)

Run before pushing changes to catch regressions early:

```bash
npm test                 # or: npx tsx tests/run.ts
```

The suite has three layers:

1. **Structural validation** (`tests/validate/`) — Checks skill frontmatter, reference integrity, tool permission requirements (detects if skills reference tools they haven't declared in `allowed-tools`), wrapper→workflow consistency, and YAML syntax across all `.yml` and `SKILL.md` files (vitest tests).
2. **Script tests** (`tests/scripts/`) — Vitest tests for `bootstrap-skills.ts`, `verify-bullet-length.ts`, `verify-no-unresolved-comments.ts`, `format-and-commit.ts`, `sync-base-branch.ts`, and `check-off-subtask.ts` (mocked `gh` CLI via vitest mocks/fixtures).
3. **Plugin unit tests** — Vitest tests for `file-hook.ts` and `git-guard.ts` (run from `.opencode/`).

Prerequisites: `vitest` and `tsx` installed (run `npm install`).

## Conventions

- **Branch**: `master` (not `main`).
- **Commit style**: Conventional commits, lowercase prefix (`fix:`, `feat:`, `refactor:`).
- **Keep AGENTS.md in sync**: Any change that adds, removes, or renames skills, scripts, plugins, workflows, or changes their behavior must update AGENTS.md accordingly.
- **Keep docs in sync**: Any change that adds, removes, or renames a `/oc` command, workflow trigger, or user-facing behavior must update `README.md` and `USER_GUIDE.md` to reflect it.
- **Actor gating**: All workflows gate on `github.actor == 'phuhl'` (hardcoded, known temporary limitation).
- **PR stacking**: Issue comments with "stack on #42" or "base on #42" cause `plan-and-implement` to use that PR's branch as the base.
- **OpenCode config**: `opencode.json` sets `skills.paths` to `[".opencode/skills"]` and allows `/tmp/**` via `external_directory` permission. Target repos need this too.

## Key commands

```bash
# Run all local tests before pushing
npm test                     # or: npx tsx tests/run.ts

# Run only vitest tests
npx vitest run

# Run only plugin tests
cd .opencode && npx vitest run

# Verify bullet length for a PR summary
npx tsx scripts/verify-bullet-length.ts "bullet 1" "bullet 2"

# Verify all review comments are addressed on a PR
npx tsx scripts/verify-no-unresolved-comments.ts <pr-number>
```

## References

- `USER_GUIDE.md` — End-user tutorial for the OpenCode workflow (not for AI consumption).
- `README.md` — Setup instructions for target repos.
- `opencode.json` — OpenCode CLI config pointing to skill paths.
