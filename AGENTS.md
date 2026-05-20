# AGENTS.md

## What this repo is

A central repository of **OpenCode AI skills** and **reusable GitHub Actions workflows** consumed by other repos. This repo itself is not an application — it has no app entrypoint, no build step, and no test suite.

Target repos copy wrapper workflow files from `wrappers/` into their own `.github/workflows/`. At CI time, `scripts/bootstrap-skills.sh` copies shared skills and plugins into the target repo's `.opencode/`.

## Directory ownership

| Directory | Purpose | Edited here? |
|---|---|---|---|
| `.github/workflows/` | Reusable workflows (called by target repos via `uses:`) | Yes |
| `.opencode/skills/` | Shared AI skill definitions (Markdown + YAML frontmatter) | Yes |
| `.opencode/skills/_shared/` | Shared references and scripts used by multiple skills | Yes |
| `.opencode/plugins/` | Shared OpenCode plugins (TypeScript, consumed at runtime) | Yes |
| `scripts/` | Bootstrap and verification shell scripts | Yes |
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

### Shared scripts (`_shared/scripts/`)

Skills invoke these via `bash .opencode/skills/_shared/scripts/<name>.sh`:

- **`format-and-commit.sh`** — Stages files, runs prettier/eslint, commits with the given message, and pushes. Usage: `format-and-commit.sh "<message>" <file...>`. Exit codes: 0=success, 1=usage error.
- **`sync-base-branch.sh`** — Finds the PR for an issue number, checks out its head branch, and merges the latest base branch. Usage: `sync-base-branch.sh <issue-number>`. Exit codes: 0=success, 1=usage error, 2=no PR found, 3=merge conflict.
- **`check-off-subtask.sh`** — Finds the "## Subtasks" comment on an issue and checks off a checkbox. Usage: `check-off-subtask.sh <issue-number> "<subtask-text>" [repo]`. Exit codes: 0=success, 1=usage error, 2=no repo, 3=no subtasks comment found.
- **`post-review-reply.sh`** — Posts a reply to an existing code-line review comment thread using properly-typed JSON (in_reply_to as integer). Usage: `post-review-reply.sh <pr-number> <comment-id> "<body>"`. Exit codes: 0=success, 1=usage error.

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
- `scripts/verify-bullet-length.sh` — PR summary bullets must be ≤ 200 chars.
- `scripts/verify-no-unresolved-comments.sh` — All code-line review comment threads (any author) must have the bot as the last reply before finalizing. The bot username is auto-detected via `gh api /user` (fallback: `opencode[bot]`).

## Local test suite (this repo only)

Run before pushing changes to catch regressions early:

```bash
npm test                 # or: bash tests/run.sh
```

The suite has three layers:

1. **Structural validation** (`tests/validate/`) — Checks skill frontmatter, reference integrity, wrapper→workflow consistency, and YAML syntax across all `.yml` and `SKILL.md` files.
2. **Shell script tests** (`tests/scripts/`) — Tests `bootstrap-skills.sh`, `verify-bullet-length.sh`, `verify-no-unresolved-comments.sh`, `format-and-commit.sh`, `sync-base-branch.sh`, and `check-off-subtask.sh` (mocked `gh` CLI via `tests/helpers/mock-gh` with fixture JSON).
3. **Plugin unit tests** (`tests/plugins/`) — Vitest tests for `file-hook.ts` and `git-guard.ts` (run from `.opencode/`).

Prerequisites: `vitest` installed in `.opencode/` (already present), Python `yaml` module for YAML validation (`pip install pyyaml` if missing).

## Conventions

- **Branch**: `master` (not `main`).
- **Commit style**: Conventional commits, lowercase prefix (`fix:`, `feat:`, `refactor:`).
- **Keep AGENTS.md in sync**: Any change that adds, removes, or renames skills, scripts, plugins, workflows, or changes their behavior must update AGENTS.md accordingly.
- **Actor gating**: All workflows gate on `github.actor == 'phuhl'` (hardcoded, known temporary limitation).
- **PR stacking**: Issue comments with "stack on #42" or "base on #42" cause `plan-and-implement` to use that PR's branch as the base.
- **OpenCode config**: `opencode.json` sets `skills.paths` to `[".opencode/skills"]` and allows `/tmp/**` via `external_directory` permission. Target repos need this too.

## Key commands

```bash
# Run all local tests before pushing
npm test                     # or: bash tests/run.sh

# Run only structural validation
bash tests/validate/check-skill-frontmatter.sh
bash tests/validate/check-references.sh
bash tests/validate/check-wrapper-consistency.sh
bash tests/validate/check-yaml-syntax.sh

# Run only shell script tests
bash tests/scripts/test-bootstrap-skills.sh
bash tests/scripts/test-verify-bullet-length.sh
bash tests/scripts/test-verify-no-unresolved-comments.sh
bash tests/scripts/test-format-and-commit.sh
bash tests/scripts/test-sync-base-branch.sh
bash tests/scripts/test-check-off-subtask.sh

# Run only plugin tests
cd .opencode && npx vitest run

# Verify bullet length for a PR summary
bash scripts/verify-bullet-length.sh "bullet 1" "bullet 2"

# Verify all review comments are addressed on a PR
bash scripts/verify-no-unresolved-comments.sh <pr-number>
```

## References

- `USER_GUIDE.md` — End-user tutorial for the OpenCode workflow (not for AI consumption).
- `README.md` — Setup instructions for target repos.
- `opencode.json` — OpenCode CLI config pointing to skill paths.
