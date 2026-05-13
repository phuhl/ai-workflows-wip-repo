# Finalize

## Goal
Merge base one final time, update the PR body with a reviewer summary, and stop. The workflow will add the `auto-review` label.

## Prerequisites
- All subtasks are checked.
- Self-check is clean (no `must-fix` items).

## Steps

1. Find the open PR and merge the latest base branch one final time:
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

2. Update the PR body with a reviewer summary that includes a 5-bullet implementation summary:
   - First, draft 5 bullet points describing the implementation. Each bullet must summarize one distinct aspect of what was built/changed. Keep each bullet **at most 200 characters**.
   - Verify each bullet's length with the verification script:
     ```bash
     bash .ai-workflows/scripts/verify-bullet-length.sh "<bullet1>" "<bullet2>" "<bullet3>" "<bullet4>" "<bullet5>"
     ```
   - If any bullet exceeds 200 chars, shorten it and re-verify until all pass.
   - Combine the bullets with the reviewer summary into the PR body:
     ```bash
     gh pr edit "$PR_NUMBER" --body "$(printf '%b' "<reviewer summary>\n\n## Implementation Summary\n- <bullet1>\n- <bullet2>\n- <bullet3>\n- <bullet4>\n- <bullet5>")"
     ```
   - **Note:** The `verify-bullet-length.sh` script is located in the shared `.ai-workflows/scripts/` directory (bootstrapped by the workflow). If not found, manually check each bullet with `echo "<bullet>" | wc -c` (must be ≤ 200).

3. **Leave the PR as draft.** The workflow will add the `auto-review` label; the `review-pr` skill will promote it to ready only if the automatic audits pass cleanly.

4. **Stop.**
