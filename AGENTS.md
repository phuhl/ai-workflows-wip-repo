# AGENTS.md

## What this repo is

A central repository of **OpenCode AI skills** and **reusable GitHub Actions workflows** consumed by other repos. This repo itself is not an application — it has no app entrypoint, no build step, and no test suite.

Target repos copy wrapper workflow files from `wrappers/` into their own `.github/workflows/`. At CI time, `scripts/bootstrap-skills.sh` copies shared skills and plugins into the target repo's `.opencode/`.

## Directory ownership

| Directory | Purpose | Edited here? |
|---|---|---|
| `.github/workflows/` | Reusable workflows (called by target repos via `uses:`) | Yes |
| `.opencode/skills/` | Shared AI skill definitions (Markdown + YAML frontmatter) | Yes |
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
context: fork          # always fork — each invocation is a fresh process
agent: general-purpose
argument-hint: <hint>  # optional
---
```

Supporting files go in `references/` subdirectories. Skill frontmatter is required.

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

## No local test execution

Skills are told: "Do not run tests locally." CI is the source of truth. Push changes and let CI verify.

## Verification scripts (not tests)

This repo has two validation scripts used during CI:
- `scripts/verify-bullet-length.sh` — PR summary bullets must be ≤ 200 chars.
- `scripts/verify-no-unresolved-comments.sh` — All code-line review comment threads (any author) must have `opencode[bot]` as the last reply before finalizing.

## Conventions

- **Branch**: `master` (not `main`).
- **Commit style**: Conventional commits, lowercase prefix (`fix:`, `feat:`, `refactor:`).
- **Keep AGENTS.md in sync**: Any change that adds, removes, or renames skills, scripts, plugins, workflows, or changes their behavior must update AGENTS.md accordingly.
- **Actor gating**: All workflows gate on `github.actor == 'phuhl'` (hardcoded, known temporary limitation).
- **PR stacking**: Issue comments with "stack on #42" or "base on #42" cause `plan-and-implement` to use that PR's branch as the base.
- **OpenCode config**: `opencode.json` sets `skills.paths` to `[".opencode/skills"]` and allows `/tmp/**` via `external_directory` permission. Target repos need this too.

## Key commands

There are no build/test/lint commands for this repo itself. The only relevant commands:

```bash
# Validate a skill or workflow change (manual review — no automated checks)
# Verify bullet length for a PR summary
bash scripts/verify-bullet-length.sh "bullet 1" "bullet 2"

# Verify all review comments are addressed on a PR
bash scripts/verify-no-unresolved-comments.sh <pr-number>
```

## References

- `USER_GUIDE.md` — End-user tutorial for the OpenCode workflow (not for AI consumption).
- `README.md` — Setup instructions for target repos.
- `opencode.json` — OpenCode CLI config pointing to skill paths.
