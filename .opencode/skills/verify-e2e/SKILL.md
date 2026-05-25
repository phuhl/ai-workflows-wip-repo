---
name: verify-e2e
description: Run an E2E test scenario against a dummy repo, deep-verify workflow comments, logs, and state transitions, and produce a structured pass/fail report. Triggered by '/oc verify-e2e <scenario>' or invoked as a skill for autonomous testing. Use whenever the user asks to run e2e tests, verify a scenario end-to-end, test the workflow, debug CI behavior, or validate that skills and workflows work correctly.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Todowrite, Task
context: fork
agent: general-purpose
argument-hint: <scenario-name> [prompt]
---

# E2E Verification

Your job is to run an E2E test scenario and deeply verify that everything worked correctly — not just the scenario assertions, but also the quality of the workflow's output: comments, logs, state transitions, and tool usage.

## Inputs

Parse `$ARGUMENTS` as: `<scenario-name> [prompt]`

- `scenario-name`: one of `happy-path`, `plan-only`, `fix-pr`, `code-review`, `user-do`, `autofix-exhausted`, `complete-gate`, or `all`
- `prompt`: optional. Free-form text describing specific changes to look for. Passed through to the verification logic.

If no `.env` file is present, read it from `/workspace/.env` (the ai-workflows repo root, not the target repo).

## Phase 0 — Deploy changes to wip repo

Before running E2E, you must deploy the current code changes to the wip repo so the test repo exercises them. The test repo's `opencode-master.yml` wrapper references the wip repo, NOT the main `apparts-js/ai-workflows` repo. This is the critical feedback loop: push → test → fix → repeat.

### 0a. Push local changes to wip

Read the wip repo URL from `.env`:

```bash
grep WIP_REPO_URL /workspace/.env | cut -d= -f2
# e.g. https://github.com/phuhl/ai-workflows-wip-repo
```

The ai-workflows repo should already have a `wip` remote pointing there. Push current branch to wip master:

```bash
git push wip master
```

If the push fails (e.g. remote not configured), set it up:

```bash
WIP_URL=$(grep WIP_REPO_URL /workspace/.env | cut -d= -f2)
GITHUB_TOKEN=$(grep GITHUB_TOKEN /workspace/.env | cut -d= -f2)
WIP_AUTH_URL=$(echo "$WIP_URL" | sed "s|https://|https://x-access-token:${GITHUB_TOKEN}@|")
git remote add wip "$WIP_AUTH_URL" 2>/dev/null || true
git push wip master
```

### 0b. Verify the test repo is wired to wip

Confirm the test repo's wrapper points to the wip repo:

```bash
TEST_REPO=$(grep TEST_REPO /workspace/.env | cut -d= -f2)
gh api "repos/${TEST_REPO}/contents/.github/workflows/opencode-master.yml" --jq '.content' | base64 -d | grep 'uses:'
```

Expected: all `uses:` lines must reference `phuhl/ai-workflows-wip-repo` (not `apparts-js/ai-workflows`). If any reference the main repo, update the test repo's wrapper to point at wip.

Also verify the wip repo's reusable workflows sub-references are self-consistent (point to wip, not main repo):

```bash
WIP_REPO=$(echo "$WIP_URL" | sed 's|https://github.com/||')
gh api "repos/${WIP_REPO}/contents/.github/workflows/reusable-opencode-master.yml" --jq '.content' | base64 -d | grep 'uses:'
```

If sub-workflow references point to `apparts-js/ai-workflows` instead of the wip repo, edit the wip repo's master router to use the wip repo for all `uses:` refs. (This should already be done — verify it.)

### 0c. Verify wip is ahead of or equal to origin

```bash
git fetch origin --no-tags
git log wip/master..origin/master --oneline
```

If origin/master has commits not on wip/master, either push those to wip as well or note that the test will exercise stale code.

## Phase 1 — Run the scenario

1. Read the `.env` file to determine the test repo:
   ```bash
   grep TEST_REPO /workspace/.env | cut -d= -f2
   ```

2. Run the scenario via the E2E test runner:
   ```bash
   npx tsx /workspace/tests/e2e/run.ts --repo <test-repo> --scenario <scenario-name>
   ```
   Capture both stdout and stderr. Note the issue number and PR number from the output (they are logged during setup/trigger steps).

3. If the test runner returns non-zero, note the failure but continue to Phase 2 — the deep verification may reveal the root cause.

## Phase 2 — Deep verification

For each workflow run triggered by the scenario, verify the following. Read `.opencode/skills/verify-e2e/references/deep-check.md` for detailed check procedures.

### 2a. Comment quality

For every bot comment posted on the issue/PR:

- **Run ID link**: Every progress comment must contain a link to the GitHub Actions run (e.g. `https://github.com/<repo>/actions/runs/<run_id>`). The link enables one-click debugging.
- **Update, don't spam**: "starts running" / "is processing" / "in progress" comments must be **updated** (via `gh api PATCH`) when the run finishes, not left stale. A single thread should contain the full lifecycle. Check that an initial progress comment exists and that a later update (or final status) is present.
- **No literal `\n`**: Comments must use actual newlines, not escaped `\n` literals. Scan for `\\n` in comment bodies.
- **No raw JSON**: Comments must not contain raw JSON output from tools. They should be human-readable markdown.
- **Summary inline**: The final status update should appear in the same comment thread as the initial progress comment. Do not count separate "finished" comments as failures, but prefer the update-in-place pattern.

### 2b. Log analysis

For every workflow run triggered by the scenario, fetch the logs:

```bash
gh run view <run-id> --repo <repo> --log
```

Inspect the logs for:

- **Failed GitHub API calls**: grep for `HTTP 403`, `HTTP 404`, `HTTP 422`, `Resource not accessible`, `Not Found`. Failed API calls in `|| true` or `try/catch` contexts may be intentional fallbacks — flag only if they result in missing output.
- **Permission issues**: grep for `permission denied`, `403`, `Resource not accessible by personal access token`. Distinguish between expected permission errors (the `check-runs` API on private repos) and unexpected ones (failed to checkout repo, failed to push).
- **Tool availability**: grep for `command not found`, `npx: command not found`, `tsx: command not found`, `opencode: command not found`. The workflow must install required tools (`npx tsx`, `opencode-ai`) before using them.
- **Unresolved placeholders**: grep for `${{ }}` appearing literally in output — this means an expression wasn't evaluated.
- **Timeout/failure patterns**: grep for `Timeout`, `timed out`, `Killed`, `out of memory`.

### 2c. State machine correctness

- **No parallel gate runs**: Check that only ONE `complete-gate` reusable workflow job ran at a time for a given PR. If multiple gate jobs overlapped (producing duplicate comments, conflicting labels), the concurrency guard failed. See the "Concurrency guard" check in `references/deep-check.md` for the detection procedure. **This is a FAIL** if found.
- **No infinite loops**: Check that the complete-gate doesn't re-trigger itself indefinitely. The total number of autofix attempts must be ≤ 3 per category. Check for `gate-running` label removal.
- **Label transitions**: Verify the label state machine transitions correctly:
  - `opencode` label on issue → `plan-and-implement` runs
  - `auto-review` label on PR → `complete-gate` runs
  - After complete-gate finishes: `auto-review` removed, `ready for review` or `autofix-exhausted` added
  - `gate-running` must be removed after complete-gate finishes
- **PR promotion**: After `review-pr` runs and CI passes, verify `gh pr ready` was called (check logs for `gh pr ready`).
- **Cancelled jobs**: A `complete-gate` job with conclusion `cancelled` indicates a concurrency conflict. Flag as FAIL.

### 2d. Context-aware verification

- **Use pre-fetched context**: Skills must read from `.ai-workflows/` files (created by `fetch-pr-context.ts`) rather than making their own `gh` calls. grep the logs for `gh issue view`, `gh pr view`, `gh api` calls made by the skill itself (not by the workflow setup steps). If the skill makes its own `gh` calls when `.ai-workflows/` files exist, flag it — unless the data genuinely isn't in the pre-fetched files.
- **Skill dispatch**: Verify the correct skill was dispatched for the event:
  - `issue_comment` + `/oc plan` → `plan` skill
  - `issues` + `opencode` label → `plan-and-implement` skill
  - `issue_comment` + `/oc do` → `user-do` skill
  - `pull_request` + `auto-review` label → `complete-gate`

### 2e. Cross-cutting concerns

- **Git safety**: Verify no files from `.ai-workflows/`, `.opencode/skills/`, or `.opencode/plugins/` were committed. grep the logs for `git add` and check the PR diff.
- **Bootstrap output**: Check that `bootstrap-skills.ts` ran successfully (grep for `Skills bootstrapped` in logs).
- **No CI deadlock**: The complete-gate must not wait for its own OpenCode checks. grep for `contains("opencode")` in the check-runs polling logic and verify it excludes OpenCode-named checks.

## Phase 3 — Cleanup

After verification, close the test issue and any associated PR:

```bash
gh issue close <issue-number> --repo <test-repo>
gh pr close <pr-number> --repo <test-repo> 2>/dev/null || true
```

Delete the PR branch:
```bash
gh api "repos/<test-repo>/git/refs/heads/<branch>" -X DELETE 2>/dev/null || true
```

## Phase 4 — Report

Read `.opencode/skills/verify-e2e/references/report-template.md` for the report format.

Produce a structured markdown report with these sections:

1. **Scenario result**: Pass/fail, duration, scenario name
2. **Scenario assertions**: The assertion results from the test runner
3. **Comment quality**: For each bot comment, whether it passes quality checks (run link, updated not spammed, no literal `\n`, no raw JSON)
4. **Log findings**: For each workflow run, any issues found (API errors, permission issues, missing tools)
5. **State machine**: Label transitions observed, any stuck states or excessive retries
6. **Context & dispatch**: Whether pre-fetched context was used, correct skill dispatched
7. **Overall verdict**: `PASS` if all checks pass; `FAIL` with specifics if any checks fail

If the caller provided a `[prompt]`, append a "Prompt-specific checks" section covering only the requested items.

## Parallel safety

This skill runs in a `fork` context. Scenario setup/cleanup is self-contained per issue — each run creates its own issue and cleans it up. Multiple concurrent invocations are safe as long as they run different scenarios (so each creates a unique issue).

## Notes

- The skill reads `.env` from `/workspace/.env` (the ai-workflows repo root, not the dummy repo). If not available, try `$HOME/.env` or the calling repo's root.
- If `gh` is not authenticated, export `GH_TOKEN` from the `.env` file before running commands.
- If the test repo doesn't exist or is misconfigured, report the setup gap instead of failing silently.
