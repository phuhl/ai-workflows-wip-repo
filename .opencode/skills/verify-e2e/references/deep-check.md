# Deep check procedures

Use these procedures when performing Phase 2 deep verification of E2E test results.

## Fetching workflow data

```bash
# List all workflow runs for the repo
gh run list --repo <repo> --limit 20 --json databaseId,name,conclusion,event,createdAt,headBranch

# Get jobs for a specific run (includes sub-workflow jobs)
gh api "repos/<repo>/actions/runs/<run-id>/jobs" --jq '.jobs[] | {name, conclusion}'

# Download full logs for a run
gh run view <run-id> --repo <repo> --log 2>/dev/null
```

## Comment quality checks

### Fetching all bot comments

Before checking comment quality, fetch all comments from every issue and PR involved in the scenario:

```bash
# Fetch issue comments
gh api "repos/<repo>/issues/<issue-number>/comments" \
  --jq '.[] | {id, body, user: .user.login, created_at}' --paginate > /tmp/e2e-issue-comments.json

# Fetch PR conversation comments (also via issues endpoint)
gh api "repos/<repo>/issues/<pr-number>/comments" \
  --jq '.[] | {id, body, user: .user.login, created_at}' --paginate > /tmp/e2e-pr-comments.json

# Fetch PR review comments (inline diff comments)
gh api "repos/<repo>/pulls/<pr-number>/comments" \
  --jq '.[] | {id, body, user: .user.login, created_at}' --paginate > /tmp/e2e-review-comments.json
```

Filter to bot comments only: `jq 'select(.user | test("\\[bot\\]" or "/app"))' <comment-file>`.

### Check each bot comment

For each bot comment (author matching `[bot]` or `app/`), run these checks:

### Check 1: Run ID link present
```
PATTERN: https://github.com/<repo>/actions/runs/\d+
```
Every progress/status comment must contain at least one run ID link. Exceptions: substantive code review comments and subtask checklists.

### Check 2: Update-in-place
```
PATTERN: PATCH .../issues/comments/<comment-id>
```
Look for `gh api .../issues/comments/<id> -X PATCH` in the run logs. The initial progress comment ID should be saved (via `echo "comment_id=..." >> "$GITHUB_OUTPUT"`) and later updated. If a run creates a progress comment but never updates it, flag it.

### Check 3: No literal `\n`
```
PATTERN: \\\\n (double-escaped newline in JSON)
```
Search for `\\\\n` in comment bodies. This indicates the body was constructed with escaped newlines that weren't expanded.

### Check 4: No raw JSON
```
PATTERN: ^{[\s\S]*}$ (comment body is entirely JSON)
```
Comments should be markdown, not raw JSON blobs.

## Log analysis patterns

### Failed API calls
```
grep -iE "HTTP 403|HTTP 404|HTTP 422|Resource not accessible|Not Found|permission denied" <log>
```
Known false positives (do NOT flag):
- `check-runs` API returning 403 on private repos (no `checks:read` scope)
- `branch protection` API returning 403 (no `administration:read` scope)
- `|| true` guarded commands that fall back to alternative logic

### Missing tools
```
grep -iE "command not found|npm install -g|npx" <log>
```
Verify the workflow installs tools before using them:
- `npx tsx` requires `tsx` in `package.json` or global install
- `opencode` requires `npm install -g opencode-ai@...`

### Unresolved expressions
```
grep -F '${{' <log>
```
Any literal `${{ }}` in logs means the expression wasn't evaluated by GitHub Actions. This is a configuration error.

### CI deadlock check
```
grep -i "opencode" <log>
```
The complete-gate's CI polling loop must explicitly exclude OpenCode-named check runs. Verify the jq filter contains `ascii_downcase | contains("opencode") | not`.

## State machine checks

### Concurrency guard (no parallel gate runs)
```
# Check how many complete-gate jobs overlapped in time for the same PR.
# Fetch all runs for the branch, extract complete-gate job start/end times,
# and check for overlapping intervals.
```
If two or more `complete-gate` (reusable workflow) jobs ran simultaneously for the same PR, the concurrency guard has failed. This is a **FAIL** — multiple parallel gate runs produce duplicate comments, conflicting label changes, and race conditions.

To detect:
1. Get all workflow runs for the PR's head branch: `gh run list --repo <repo> --branch <branch> --json databaseId,createdAt,updatedAt`
2. For each run, check which jobs ran: `gh api repos/<repo>/actions/runs/<run-id>/jobs --jq '.jobs[] | select(.name | contains("complete-gate")) | {name, startedAt, completedAt}'`
3. If any two `complete-gate` jobs have overlapping `[startedAt, completedAt]` intervals, flag as FAIL.
4. Also check for **cancelled** complete-gate jobs — these indicate a concurrency conflict where one run was cancelled because another was already running.

### Autofix attempt tracking
```
grep "autofix-attempts" <log>
```
Count the number of autofix attempts. Must be ≤ 3 per category (conflicts, CI). After 3, `autofix-exhausted` must be added and no more attempts made.

### Label state sequence
Check that labels follow the expected sequence:
1. Issue labeled `opencode` → workflow runs
2. PR created → `auto-review` added
3. CI passes → `review-pr` runs
4. CI passes → `auto-review` removed, `ready for review` added, `autofix-attempts-*` reset
5. CI fails + implementation complete → `fix-pr` runs, `autofix-attempts-N` incremented
6. CI fails + implementation incomplete → `plan-and-implement` runs
7. After 3 failures → `autofix-exhausted` added
8. `gate-running` removed at end (or `always()` step)

### No stuck gate
```
grep "gate-running" <log>
```
The `gate-running` label must be removed when the gate finishes. If it persists for > 15 minutes after the gate run completes, the state machine is stuck.

## Context usage check

### Pre-fetched context files
Verify that the workflow ran `fetch-pr-context.ts` and the files exist:
```bash
grep "fetch-pr-context" <log>
```

### Skill `gh` calls
Count `gh` calls made by the skill itself (after `opencode run` starts). If pre-fetched context files exist but the skill still makes `gh issue view` / `gh pr view` / `gh api repos/.../issues/...` calls, flag it unless the data is genuinely not in the pre-fetched files.

## Report format

For each check, produce a line item:
```
- [PASS] <check description>
- [FAIL] <check description> — <specific evidence>
```
