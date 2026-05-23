# Create PR and write stubs

## Goal
Create a branch, push it, open a draft PR, check off "Open draft PR", and immediately write stubs and failing tests.

## Steps

### Create PR

1. If no branch exists yet, determine the base branch. The `$BASE_BRANCH` variable was set in the skill setup from stacking instructions in the issue, or defaults to `master`. Fall back if not set:
   ```bash
   BASE_BRANCH="${BASE_BRANCH:-master}"
   git fetch origin
   git checkout "$BASE_BRANCH" && git pull
   git checkout -b ${ARGUMENTS}-<short-slug>
   git push -u origin ${ARGUMENTS}-<short-slug>
   ```

2. Create a draft PR:
   ```bash
   PR_BODY="Work in progress — see issue #${ARGUMENTS} for context.

   Closes #${ARGUMENTS}"
   gh pr create \
     --draft \
     --title "<concise title>" \
     --body "$PR_BODY" \
     --head "${ARGUMENTS}-<short-slug>" \
     --base "$BASE_BRANCH"
   ```

3. Find the PR number:
   ```bash
   PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
   ```

4. Check off "Open draft PR" in the subtasks comment:
   ```bash
   npx tsx src/skills/_shared/scripts/check-off-subtask.ts "$ARGUMENTS" "Open draft PR" "$REPO"
   ```

### Write stubs and failing tests

5. Merge the latest base branch before working:
   ```bash
   npx tsx src/skills/_shared/scripts/sync-base-branch.ts "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

6. Write stubs and failing tests.

7. Format and commit:
   ```bash
   npx tsx src/skills/_shared/scripts/format-and-commit.ts "feat: add stubs and failing tests (#${ARGUMENTS})" <specific-files>
   ```

8. Check off "Write stubs and failing tests" in the subtasks comment (same comment as step 4).

9. **STOP.** Do not proceed to the next subtask in this session. The workflow will re-add the `auto-review` label and the gate will monitor CI. If it fails, `fix-pr` will hand off back here.
