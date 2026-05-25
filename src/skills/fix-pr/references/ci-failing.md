# Fix CI failures

## Goal
Read the failed CI logs, understand the error, fix the root cause, and push.

## Steps

1. **Read the failed CI logs first.** Do not touch code until you understand what failed:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/get-failed-ci-log.ts <pr-number>
   ```
   Read the errors carefully. Understand *what* failed and *why* before making any changes.

2. Fix the root cause.

3. Format and commit:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/format-and-commit.ts "fix: resolve CI failure – <description> (#<issue_number>)" <specific-files>
   ```

4. If the `fix-pr-ci` skill is available, you may invoke it for deeper diagnostics:
   ```
   Skill("fix-pr-ci", args="<pr-number>")
   ```

5. Run self-check audits on the full PR diff:
   ```bash
   PR_NUMBER=<pr-number>
   BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
   git fetch origin "$BASE"
   MERGE_BASE=$(git merge-base "origin/$BASE" HEAD)
   RANGE="${MERGE_BASE}..HEAD"
   REF="#${PR_NUMBER}"
   ```
   Read `src/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.
