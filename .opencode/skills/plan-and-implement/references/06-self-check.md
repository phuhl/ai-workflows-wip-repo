# Self-check before finalizing

## Goal
Run the same audits that `review-pr` runs and fix any `must-fix` findings before finalizing. **First, ensure every code-line review comment on the PR has been addressed.**

## Prerequisites
- All implementation subtasks are checked.

## Steps

### 0. Address PR code-line review comments (add to your todo list)

Before running audits, ensure every code-line review comment on this PR is handled. Track this with the todowrite tool:

1. Detect the bot username and fetch all code-line review comments:
   ```bash
   BOT_USER=$(gh api /user -q '.login' 2>/dev/null || echo "opencode[bot]")
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   gh api "repos/${REPO}/pulls/${PR_NUMBER}/comments" --jq '.[] | {id, path, line, body, in_reply_to_id, user: .user.login}'
   ```

2. Filter to keep only **thread-starter** comments where `in_reply_to_id` is null and `user` is not `"$BOT_USER"`. These are the comments from human reviewers that need your attention.

3. For each such comment:
   - **If the suggestion is valid** — implement the code change. Format, commit, push:
     ```bash
     bash .opencode/skills/_shared/scripts/format-and-commit.sh "fix: address review comment — <description> (#${ARGUMENTS})" <specific-files>
     ```
   - **If the suggestion is not appropriate** — reply explaining why the current code is correct or intentional:
     ```bash
     bash .opencode/skills/_shared/scripts/post-review-reply.sh "$PR_NUMBER" <comment_id> "<explanation>"
     ```
   - **If the comment is a question** — reply with your answer.

4. After all are addressed, run the verification script:
   ```bash
   bash .ai-workflows/scripts/verify-no-unresolved-comments.sh "$PR_NUMBER" "$REPO"
   ```
   If it reports unresolved comments, address them and re-verify until clean.

5. Check off the todo item for review comment resolution before proceeding.

### 1. Find PR and merge base
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   bash .opencode/skills/_shared/scripts/sync-base-branch.sh "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. Determine the diff range:
   ```bash
   BASE=$(git merge-base origin/master HEAD)
   RANGE="${BASE}..HEAD"
   ```

3. Run the four audit skills **in parallel** and capture their outputs:
   Launch all four at the same time using the Skill tool:
   ```
   Skill("code-review", args=RANGE)
   Skill("verify-tests", args=RANGE)
   Skill("code-guidelines-check", args=RANGE)
   Skill("deduplication-check", args=RANGE)
   ```
   Save each skill's output to a temp file immediately as they return. Do not run them sequentially — they are independent and should execute in parallel.

4. Parse the **Actionable findings** sections for `**severity:** must-fix` and `**severity:** should-fix`.

5. For each `must-fix` or `should-fix` finding:
   - Apply the provided fix using `Write` or `Edit`.
    - Format and commit:
      ```bash
      bash .opencode/skills/_shared/scripts/format-and-commit.sh "fix: resolve self-check finding – <description> (#${ARGUMENTS})" <specific-files>
      ```

6. Re-run the four audits. Repeat steps 4–6 until no `must-fix` or `should-fix` items remain.

7. Also fix any `should-fix` findings that can be addressed with straightforward edits. If a `should-fix` item requires significant refactoring or has unclear trade-offs, you may defer it. `note` items may be left for the human reviewer; do not block finalization on them.

8. Check off "Fix issues found in audit" in the subtasks comment.

9. Load `references/07-finalize.md` and continue in this session.
