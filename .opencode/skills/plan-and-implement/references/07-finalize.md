# Finalize

## Goal
Merge base one final time, post an implementation summary as a PR comment (leaving the PR body with its "Closes #X" line intact), and stop. The workflow will add the `auto-review` label.

## Prerequisites
- All subtasks are checked.
- Self-check is clean (no `must-fix` items).

## Steps

1. Find the open PR and merge the latest base branch one final time:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/sync-base-branch.ts "$ARGUMENTS" || {
     echo "Merge conflicts detected. Stopping."
     exit 1
   }
   ```
   If merge conflicts occur, invoke `resolve-pr-conflicts` and stop.

2. Post a PR comment with a reviewer summary and 5-bullet implementation summary. **Do not overwrite the PR body** — it must keep its "Closes #${ARGUMENTS}" line for issue linking.
   - First, draft 5 bullet points describing the implementation. Each bullet must summarize one distinct aspect of what was built/changed. Keep each bullet **at most 200 characters**.
   - Verify each bullet's length with the verification script:
     ```bash
     npx tsx .ai-workflows/scripts/verify-bullet-length.ts "<bullet1>" "<bullet2>" "<bullet3>" "<bullet4>" "<bullet5>"
     ```
   - If any bullet exceeds 200 chars, shorten it and re-verify until all pass.
   - Post the summary as a PR comment:
     ```bash
     gh pr comment "$PR_NUMBER" --body "$(printf '%b' "## Implementation Summary\n- <bullet1>\n- <bullet2>\n- <bullet3>\n- <bullet4>\n- <bullet5>")"
     ```
   - **Note:** The `verify-bullet-length.ts` script is located in the shared `.ai-workflows/scripts/` directory (bootstrapped by the workflow). If not found, manually check each bullet with `echo "<bullet>" | wc -c` (must be ≤ 200).

3. **Leave the PR as draft.** The workflow will add the `auto-review` label; the `review-pr` skill will promote it to ready only if the automatic audits pass cleanly.

4. **Stop.**
