---
name: plan-and-implement
description: Plan, subdivide, and implement a GitHub issue end-to-end. Triggered when an issue is labeled 'opencode'. Creates subtasks, opens a branch and draft PR, merges base regularly, handles merge conflicts, implements with TDD, pushes regularly, self-checks with the same audits used in code review, and marks the PR complete when finished.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
context: fork
agent: general-purpose
argument-hint: <issue-number>
---

You are invoked to drive an issue labeled `opencode` to completion.

## Inputs
- `$ARGUMENTS` contains the issue number.

## Setup

1. Determine repo slug:
   ```bash
   REPO=$(git remote get-url origin | sed -E 's/.*github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/\1\/\2/')
   OWNER=$(echo "$REPO" | cut -d/ -f1)
   ```
2. **Read the issue and all its comments.** The original issue text must never be modified. Subtasks are tracked in a separate bot comment.
   ```bash
   gh issue view "$ARGUMENTS" --json body,title,state,comments -q '.body'
   gh issue view "$ARGUMENTS" --json comments -q '.comments[].body'
   ```

## State detection

- **No subtasks**: No comment on the issue contains `## Subtasks`.
- **No PR**: No open PR whose head is `{owner}:${ARGUMENTS}-*`.
- **In progress**: Open draft PR exists with unchecked subtasks.
- **Done**: All subtasks checked.

## Plan

If no subtasks exist, decompose the issue into small, committable steps.

**Important:** The original issue body must remain untouched. Post subtasks as a new comment instead.

1. Post a comment with the subtasks:
   ```bash
   gh issue comment "$ARGUMENTS" --body "## Subtasks
   - [ ] Write stubs and failing tests
   - [ ] Implement logic to pass tests
   - [ ] Update docs / README if needed
   - [ ] Open draft PR
   - [ ] Fix issues found in audit
   - [ ] CI passes and PR is ready for review"
   ```

## Create PR

If no branch/PR exists:
```bash
git fetch origin
git checkout master && git pull
git checkout -b ${ARGUMENTS}-<short-slug>
git push -u origin ${ARGUMENTS}-<short-slug>
```

Create a draft PR:
```bash
PR_BODY="Work in progress — see issue #${ARGUMENTS} for context.

Closes #${ARGUMENTS}"
gh pr create \
  --draft \
  --title "<concise title>" \
  --body "$PR_BODY" \
  --head "${ARGUMENTS}-<short-slug>" \
  --base master

PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
```

Check off "Open draft PR" in the subtasks comment (do not modify the issue body).

## Merge base branch before implementing

Before starting any work on an existing branch, keep it up to date with its base to avoid conflicts later.

1. Fetch PR metadata to get `base.ref`.
2. Check out the branch and merge the latest base:
   ```bash
   git fetch origin
   git checkout <branch-name>
   git pull
   git merge origin/<base-branch>
   ```
3. **If the merge produces conflicts**, resolve each file thoughtfully:
   - Open the file and look for `<<<<<<< HEAD`, `=======`, `>>>>>>> origin/...` markers.
   - `HEAD` is your branch's code; `origin/<base-branch>` is the incoming base.
   - When both sides contain real logic, merge them into a correct result rather than blindly picking one side.
   - `git add <file>` after resolving each one.
   - When all conflicts are resolved, commit the merge:
     ```bash
     git commit -m "chore: merge ${BASE_BRANCH} into ${BRANCH}"
     git push
     ```
4. If the merge conflict resolution is complex or you are unsure, invoke the `resolve-pr-conflicts` skill for assistance:
   ```
   Skill("resolve-pr-conflicts", args="<pr-number>")
   ```

## Implement

Find the open PR:
```bash
PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ARGUMENTS}-\")) | .number")
```

### Write stubs and failing tests
If this subtask is unchecked:
1. Write stubs and failing tests.
2. Commit and push:
   ```bash
   git add <specific-files>
   git commit -m "feat: add stubs and failing tests (#${ARGUMENTS})"
   git push
   ```
3. Check off the subtask in the comments.
4. **Stop.** Do not proceed to the next subtask in this session. The workflow will re-add the `complete` label and the gate will monitor CI. If it fails, `fix-pr` will hand off back here.

### Remaining subtasks
If "Write stubs and failing tests" is already checked, proceed with the remaining unchecked subtasks up to "Fix issues found in audit":
1. Do the work (implement → refactor → docs).
2. Commit and push:
   ```bash
   git add <specific-files>
   git commit -m "feat: <description> (#${ARGUMENTS})"
   git push
   ```
3. Check off the subtask in the comments.

For each subtask, update the subtasks comment:
- Read all comments to find the one containing `## Subtasks`:
  ```bash
  gh issue view "$ARGUMENTS" --json comments -q '.comments[] | select(.body | contains("## Subtasks")) | {id,body}'
  ```
- Replace `- [ ] <exact text>` with `- [x] <exact text>` inside that comment body.
- Edit the comment via the API (preserving the original issue body):
  ```bash
  gh api "repos/${REPO}/issues/comments/${COMMENT_ID}" -X PATCH -f body="${UPDATED_COMMENT_BODY}"
  ```

## Self-check before finalizing

Before promoting the PR, run the same audits that `review-pr` runs and fix any `must-fix` findings inline. This prevents the CI gate from immediately rejecting the PR.

1. Determine the diff range:
   ```bash
   BASE=$(git merge-base origin/master HEAD)
   RANGE="${BASE}..HEAD"
   ```
2. Run the three audit skills and capture their outputs:
   ```
   Skill("code-review", args=RANGE)
   Skill("verify-tests", args=RANGE)
   Skill("code-guidelines-check", args=RANGE)
   ```
3. Parse the **Actionable findings** sections for `**severity:** must-fix`.
4. For each `must-fix` finding:
    - Apply the provided fix using `Write` or `Edit`.
    - Commit and push:
      ```bash
      git add <specific-files>
      git commit -m "fix: resolve self-check finding – <description> (#${ARGUMENTS})"
      git push
      ```
5. Re-run the three audits. Repeat steps 3–5 until no `must-fix` items remain.
6. If `should-fix` or `note` items remain that you cannot address quickly, leave them for the human reviewer; do not block finalization on them.

## Finalize

When all subtasks are checked and the self-check is clean:
1. Merge base branch one final time (same steps as above) to ensure the PR is up to date.
2. Update the PR body with a reviewer summary:
   ```bash
   gh pr edit "$PR_NUMBER" --body "..."
   ```
   **Leave the PR as draft.** The workflow will add the `complete` label; the `review-pr` skill will promote it to ready only if the automatic audits pass cleanly.

## Principles
- Push every commit. Each push is a checkpoint.
- Never check off a subtask if tests are failing.
- If interrupted, re-running this skill on the same issue will resume from the first unchecked subtask.
- Always merge the base branch before starting work to minimize conflicts.
- **Do not run tests locally.** The target repository's CI workflows are the source of truth for test results. Push changes and let CI verify them.
