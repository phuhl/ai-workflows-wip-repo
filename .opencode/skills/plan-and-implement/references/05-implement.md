# Implement remaining work

## Goal
Complete the remaining unchecked subtasks: "Implement logic to pass tests" and "Update docs / README if needed".

## Prerequisites
- "Write stubs and failing tests" is already checked.

## Steps

1. Find the open PR and merge the latest base branch before working:
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
   git fetch origin
   git checkout $(gh pr view "$PR_NUMBER" --json headRefName -q .headRefName)
   git pull
   git merge origin/$BASE || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. For each unchecked subtask up to "Fix issues found in audit":
   a. Do the work (implement logic, refactor, write docs).
    b. Format and commit:
       ```bash
       git add <specific-files>
       npx prettier --write $(git diff --cached --name-only) 2>/dev/null || true
       git add $(git diff --cached --name-only) 2>/dev/null || true
       git commit -m "feat: <description> (#${ARGUMENTS})"
       git push
       ```
   c. Check off the subtask in the subtasks comment:
      - Find the subtasks comment:
        ```bash
        gh issue view "$ARGUMENTS" --json comments -q '.comments[] | select(.body | contains("## Subtasks")) | {id,body}'
        ```
      - Replace `- [ ] <exact text>` with `- [x] <exact text>`.
      - Update the comment:
        ```bash
        gh api "repos/${REPO}/issues/comments/${COMMENT_ID}" -X PATCH -f body="${UPDATED_COMMENT_BODY}"
        ```

3. **Ensure all subtasks up to "Fix issues found in audit" are checked.** The gate will retrigger this skill if any checkbox remains unchecked. Fetch the current subtasks comment and for any still-unchecked subtask among "Implement logic to pass tests" and "Update docs / README if needed":
   - If the subtask was intentionally completed in step 2, check it normally: replace `- [ ] <text>` with `- [x] <text>`.
   - If the subtask was **not applicable** (no docs or README changes were needed, or no further logic was required), check it with strikethrough: replace `- [ ] <text>` with `- [x] ~~<text>~~`.
   
   Update the subtasks comment with all changes applied:
   ```bash
   gh api "repos/${REPO}/issues/comments/${COMMENT_ID}" -X PATCH -f body="${UPDATED_COMMENT_BODY}"
   ```
   
   The final set of checked subtasks must include no remaining `- [ ]` items before "Fix issues found in audit".

4. Load `references/06-self-check.md` and continue in this session.
