---
name: fix-pr-ci
description: Diagnose and fix failing CI checks on a pull request. Reads logs, fixes test/lint/build failures, re-triggers flaky runs, and confirms green. Use when CI is red on a PR, "fix the failing checks", "CI is broken", "tests are failing in the PR".
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Todowrite, Skill
context: fork
agent: general-purpose
argument-hint: [pr-number]
---

Fix the failing CI checks on PR `$ARGUMENTS`.

If no PR number was given, find the PR for the current branch:

```bash
gh pr view --json number -q .number
```

## Step 1 — Read the failing checks

```bash
gh pr checks <pr-number>
```

For each failing check, fetch the log:

```bash
gh run view <run-id> --log-failed
```

Read the errors carefully. Understand *what* failed and *why* before touching any code.

## Step 2 — Check out the branch

```bash
gh pr checkout <pr-number>
git pull
```

## Step 3 — Fix the failures

Work through each failure type:

- **Test failures**: understand what assertion broke. Fix the code, or the test if the test itself is wrong — but be honest about which one needs changing.
- **Lint / type errors**: fix the flagged lines.
- **Build errors**: fix compilation or missing-dependency issues.
- **Flaky / infra errors** (network timeouts, rate limits, unrelated service outages): re-trigger rather than changing code:

```bash
gh run rerun <run-id> --failed
```

After applying fixes, stage and push. **Do not run tests locally.**

Stage only the files you changed (avoid accidentally staging secrets):

```bash
npx tsx src/skills/_shared/scripts/format-and-commit.ts "fix: resolve CI failure – <what broke>" <specific-files>
```

## Step 4 — Confirm CI passes

```bash
gh pr checks <pr-number> --watch
```

If CI is green and the PR is still a draft, promote it:

```bash
gh pr ready <pr-number>
```

Report back: which checks were failing, what was fixed, and whether CI is now green.

## Step 5 — Run self-check audits

After CI is green, run self-check audits on the full PR diff:

```bash
PR_NUMBER=<pr-number>
BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
git fetch origin "$BASE"
MERGE_BASE=$(git merge-base "origin/$BASE" HEAD)
RANGE="${MERGE_BASE}..HEAD"
REF="#${PR_NUMBER}"
```

Read `src/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.

## Post-write hook

Read `src/skills/_shared/references/post-write-hook.md`.

Read `src/skills/_shared/references/git-safety.md`.
