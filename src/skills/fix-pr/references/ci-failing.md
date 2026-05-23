# Fix CI failures

## Goal
Read the failed CI logs, understand the error, fix the root cause, and push.

## Steps

1. **Read the failed CI logs first.** Do not touch code until you understand what failed:
   ```bash
   BRANCH=$(gh pr view <pr-number> --json headRefName -q '.headRefName')
   RUN_ID=$(gh run list --branch "$BRANCH" --status failure --limit 1 --json databaseId -q '.[0].databaseId')
   gh run view "$RUN_ID" --log-failed
   ```
   Read the errors carefully. Understand *what* failed and *why* before making any changes.

2. Fix the root cause.

3. Format and commit:
   ```bash
   npx tsx src/skills/_shared/scripts/format-and-commit.ts "fix: resolve CI failure – <description> (#<issue_number>)" <specific-files>
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
