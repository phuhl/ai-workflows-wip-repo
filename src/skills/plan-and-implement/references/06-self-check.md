# Self-check before finalizing

## Goal
Run the same audits that `review-pr` runs and fix any `must-fix` findings before finalizing. **First, ensure every code-line review comment on the PR has been addressed.**

## Prerequisites
- All implementation subtasks are checked.

## Steps

### 0. Address PR code-line review comments (add to your todo list)

Before running audits, ensure every code-line review comment on this PR is handled.

1. Run the shared todo-list builder to get unresolved review comments:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/build-review-todo-list.ts
   ```

2. For each item in the `todos` array (skip `triaged: true` items):
   - **If the suggestion is valid** — implement the code change. Format, commit, push:
     ```bash
     npx tsx .opencode/skills/_shared/scripts/format-and-commit.ts "fix: address review comment — <description> (#${ARGUMENTS})" <specific-files>
     ```
   - **If the suggestion is not appropriate** — reply explaining why:
     ```bash
     npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts "$PR_NUMBER" <comment_id> "<explanation>"
     ```
   - **If the comment is a question** — reply with your answer.

3. After all are addressed, run the verification script:
   ```bash
   npx tsx .ai-workflows/scripts/verify-no-unresolved-comments.ts "$PR_NUMBER" "$REPO"
   ```
   If it reports unresolved comments, address them and re-verify until clean.

4. Check off the todo item for review comment resolution before proceeding.

### 1. Find PR and merge base
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   npx tsx src/skills/_shared/scripts/sync-base-branch.ts "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. Set variables for the shared self-check:
   ```bash
   BASE=$(git merge-base origin/master HEAD)
   RANGE="${BASE}..HEAD"
   REF="#${ARGUMENTS}"
   ```

3. Run self-check audits:
   Read `src/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.

4. Check off "Fix issues found in audit" in the subtasks comment.

5. Load `references/07-finalize.md` and continue in this session.
