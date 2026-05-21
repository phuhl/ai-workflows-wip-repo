# Implement remaining work

## Goal
Complete the remaining unchecked subtasks: "Implement logic to pass tests" and "Update docs / README if needed".

## Prerequisites
- "Write stubs and failing tests" is already checked.

## Steps

1. Find the open PR and merge the latest base branch before working:
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   npx tsx .opencode/skills/_shared/scripts/sync-base-branch.ts "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. **Address pending code-line review comments before implementing** (add to your todo list):
   - Detect the bot username and fetch all PR code-line review comments:
     ```bash
     BOT_USER=$(gh api /user -q '.login' 2>/dev/null || echo "opencode[bot]")
     gh api "repos/${REPO}/pulls/${PR_NUMBER}/comments" --jq '.[] | {id, path, line, body, in_reply_to_id, user: .user.login}'
     ```
   - For each thread-starter (`in_reply_to_id` is null, `user` is not `"$BOT_USER"`) that has no replies:
     - If the suggestion is valid → implement, commit, push.
      - If not appropriate → reply with explanation via `npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts "$PR_NUMBER" <id> "<explanation>"`.
   - Verify after addressing:
     ```bash
     npx tsx .ai-workflows/scripts/verify-no-unresolved-comments.ts "$PR_NUMBER" "$REPO"
     ```
     If the script reports unresolved comments, repeat until clean, then check off this todo item.

3. **Re-read the subtasks comment** and use its sub-items as the implementation guide. The planning phase added task-specific sub-items under each mandatory checkbox that describe exactly what to build. Work through each sub-item systematically. Each sub-item should correspond to one committable change.

4. For each unchecked mandatory subtask up to "Fix issues found in audit":
     a. For each sub-item under this mandatory checkbox (in order), do the work described.
     b. Format and commit after completing one or more sub-items:
        ```bash
        npx tsx .opencode/skills/_shared/scripts/format-and-commit.ts "feat: <description> (#${ARGUMENTS})" <specific-files>
        ```
     c. Post a PR comment describing what was done:
        ```bash
        gh pr comment "$PR_NUMBER" --body "$(printf '%b' "**<subtask>**: <description of what changed and why>\n\nCommit: $(git rev-parse --short HEAD)")"
        ```
     d. When all sub-items under a mandatory checkbox are complete, check off the parent checkbox:
        ```bash
        npx tsx .opencode/skills/_shared/scripts/check-off-subtask.ts "$ARGUMENTS" "<exact text>" "$REPO"
        ```

5. **Ensure all mandatory subtasks up to "Fix issues found in audit" are checked.** The gate will retrigger this skill if any checkbox remains unchecked. Fetch the current subtasks comment and for any still-unchecked mandatory subtask ("Implement logic to pass tests" and "Update docs / README if needed"):
   - If the subtask was intentionally completed in step 4, check it with:
     ```bash
     npx tsx .opencode/skills/_shared/scripts/check-off-subtask.ts "$ARGUMENTS" "<text>" "$REPO"
     ```
   - If the subtask was **not applicable** (no docs or README changes were needed, or no further logic was required), manually update the subtasks comment with strikethrough syntax `- [x] ~~<text>~~`.

   The final set of checked subtasks must include no remaining `- [ ]` items before "Fix issues found in audit".

6. Load `references/06-self-check.md` and continue in this session.
