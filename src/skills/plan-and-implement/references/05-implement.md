# Implement remaining work

## Goal
Complete the remaining unchecked subtasks: "Implement logic to pass tests" and "Update docs / README if needed".

## Prerequisites
- "Write stubs and failing tests" is already checked.

## Steps

1. Find the open PR and merge the latest base branch before working:
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   npx tsx src/skills/_shared/scripts/sync-base-branch.ts "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. **Address pending code-line review comments before implementing** (add to your todo list):
   - Run the shared todo-list builder to get unresolved review comments:
     ```bash
     npx tsx .opencode/skills/_shared/scripts/build-review-todo-list.ts
     ```
   - For each item in the `todos` array (skip `triaged: true` items):
     - If the suggestion is valid → implement, commit, push.
     - If not appropriate → reply with explanation via `npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts "$PR_NUMBER" <id> "<explanation>"`.
   - Verify after addressing:
     ```bash
     npx tsx .ai-workflows/scripts/verify-no-unresolved-comments.ts "$PR_NUMBER" "$REPO"
     ```
     If the script reports unresolved comments, repeat until clean, then check off this todo item.

3. For each unchecked subtask up to "Fix issues found in audit":
     a. Do the work (implement logic, refactor, write docs).
     b. Format and commit:
        ```bash
        npx tsx src/skills/_shared/scripts/format-and-commit.ts "feat: <description> (#${ARGUMENTS})" <specific-files>
        ```
     c. Post a PR comment describing what was done in this commit:
        ```bash
        gh pr comment "$PR_NUMBER" --body "$(printf '%b' "**<subtask>**: <description of what changed and why>\n\nCommit: $(git rev-parse --short HEAD)")"
        ```
     d. Check off the subtask in the subtasks comment:
        ```bash
        npx tsx src/skills/_shared/scripts/check-off-subtask.ts "$ARGUMENTS" "<exact text>" "$REPO"
        ```

4. **Ensure all subtasks up to "Fix issues found in audit" are checked.** The gate will retrigger this skill if any checkbox remains unchecked. Fetch the current subtasks comment and for any still-unchecked subtask among "Implement logic to pass tests" and "Update docs / README if needed":
   - If the subtask was intentionally completed in step 3, check it with:
     ```bash
     npx tsx src/skills/_shared/scripts/check-off-subtask.ts "$ARGUMENTS" "<text>" "$REPO"
     ```
   - If the subtask was **not applicable** (no docs or README changes were needed, or no further logic was required), manually update the subtasks comment with strikethrough syntax `- [x] ~~<text>~~`.

   The final set of checked subtasks must include no remaining `- [ ]` items before "Fix issues found in audit".

5. Load `references/06-self-check.md` and continue in this session.
