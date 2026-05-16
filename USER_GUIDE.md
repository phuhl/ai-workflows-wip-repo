# User Guide

This guide explains how to use the OpenCode automation from a user's perspective, following the lifecycle of an issue and pull request.

---

## OpenCode Workflow

### Label State Machine

OpenCode uses two labels to track the lifecycle of a PR:

| Label | Meaning |
|---|---|
| **`auto-review`** | The bot is actively processing this PR. When present, the complete-gate workflow monitors CI, fixes failures, and runs automated code review. |
| **`ready for review`** | The bot has finished its work. A human reviewer should now look at the PR. This label is added regardless of whether CI passed or failed. |

**How the labels move:**

- When the AI starts working (plan-and-implement, fix-pr, address-review), it adds `auto-review` and removes `ready for review`.
- When the complete-gate finishes in a terminal state (CI passed, or autofix exhausted), it removes `auto-review` and adds `ready for review`.
- A PR should never have both labels at the same time.

---

### Step 1: Create an issue and label it

**Workflow:** `reusable-opencode-plan-and-implement.yml`

**What to do:**

1. Create a GitHub issue describing the work you want done.
2. Add the label `opencode` to the issue.

**Who can trigger this:**
Only `phuhl` can label an issue to start the workflow.

**What happens:**

1. The AI fetches the issue. It reads the issue body and **all comments** on both the issue and any existing PR. This prevents repeating mistakes that were already pointed out.
2. If there are no subtasks, it breaks the work into small steps and posts them as a **comment** on the issue. The original issue body is never modified.
3. **Stacking:** If any comment on the issue says to stack on or base on another PR (e.g. "stack on #42"), the AI uses that PR's branch as the base instead of `master`.
4. It creates a branch and a **draft PR** using the determined base branch.
5. Before writing any code, it merges the latest base branch into the feature branch to prevent future conflicts.
6. It writes stubs and failing tests. Before committing, it runs both `npx prettier --write` and `npx eslint --fix` to catch formatting and lint issues locally.
7. It commits, pushes, and **stops** — all in the same session as PR creation. The workflow adds the `auto-review` label so the CI gate can monitor the build.
5. When the `auto-review` label is added to the PR, the gate triggers and first checks whether the implementation is finished by looking for unchecked subtasks in the issue comments.
6. If any subtasks are still open, the gate **removes the `auto-review` label** and hands off back to the AI to resume implementation — regardless of whether CI passed or failed.
7. Before implementing each subtask, the AI checks for **pending code-line review comments** on the PR and addresses any that are unresolved (implements suggestions or replies with explanations). It tracks this as a todo item.
8. It implements the remaining subtasks, commits and pushes after each one. Each implementation commit is accompanied by a PR comment describing what was done. Every commit runs both `prettier` and `eslint --fix` before pushing.
9. Before finishing, it runs a self-check by auditing its own code with the same checks used in code review. It looks for test coverage gaps, correctness issues, and guideline violations. Any `must-fix` finding is fixed, committed, and re-checked before proceeding.
10. After all subtasks and self-checks are done, it merges the base one final time, posts a **5-bullet implementation summary** (each bullet ≤ 200 chars) as a PR comment, and stops. The PR body with its "Closes #X" line is preserved for issue linking. The workflow **re-adds the `auto-review` label**. The PR remains a draft — the automatic review gate will promote it if the audits pass cleanly.

**What you see:**

- A new branch appears.
- A draft PR is opened with "Work in progress" in the body.
- A bot comment on the issue gets a `## Subtasks` section with checkboxes.
- As the AI works, checkboxes are checked off in the comment and commits appear.

---

### Step 1.5: Get a plan before implementing

**Workflow:** `reusable-opencode-plan.yml`

**What to do:**

1. Open the issue in GitHub.
2. Leave a comment with `/oc plan`.

**What happens:**

1. The AI reads the issue body and all comments.
2. It explores the codebase to understand the project structure, relevant modules, and existing patterns.
3. It posts a comment with a structured plan:
   - **Plan:** A concise 3–5 sentence summary of the approach, referencing specific files and functions.
   - **Risk analysis:** Each risk with likelihood, impact, and mitigation.
   - **Options considered:** Tradeoffs between different implementation strategies (if applicable).

**When to use this:**

- Before labeling an issue with `opencode`, when you want a human review of the plan first.
- When the issue is underspecified — the plan comment will flag missing details.

---

### Step 2: Automatic review when implementation is done

**Workflow:** `reusable-opencode-complete-gate.yml`

**What to do:**
Nothing. This happens automatically when the `auto-review` label is added to a PR, or when CI status checks complete on a PR that already has the `auto-review` label.

**What happens:**

1. The workflow first checks if the PR has merge conflicts. If so, it resolves them (including running `prettier` and `eslint --fix` after conflict resolution).
2. It waits for CI checks to finish. After all reported checks complete, it queries the **branch protection API** to verify that every **required status check** has reported and passed. This prevents the gate from mislabeling a PR as "CI passing" when a required check hasn't even started.
3. If CI is failing (any check failed, or a required check is missing/failing), it removes the `auto-review` label, fixes the failures, and re-adds the `auto-review` label.
4. If CI is passing, it runs the review workflow inline.
5. When the gate reaches a terminal state — whether CI passed, or autofix attempts are exhausted — it removes `auto-review` and adds `ready for review`.
6. The AI fetches the PR metadata and determines the diff range.
7. It runs three audits on its own code:
   - `verify-tests` to check test coverage.
   - `code-review` to check correctness and safety.
   - `code-guidelines-check` to check conventions.
8. It parses the findings:
   - Findings that map to a specific line in the diff are posted as inline review comments via `gh api`.
   - General findings are posted as a single PR comment via `gh pr comment`.
9. It automatically requests `phuhl` as a reviewer — regardless of whether findings were posted.
10. If **no findings** were posted, it promotes the PR from draft to ready for review.
11. If findings were posted, the PR is left as-is (draft or ready). The audit only posts comments — it does not automatically fix the findings. A human or the address-review workflow must act on them.

**What you see:**

- A reviewer is always requested.
- If clean: the PR is promoted from draft to ready for review.
- If issues found: inline comments and a general PR comment appear. The PR does not change until someone addresses the comments.

---

### Step 3: Automatic fixes for problems

**Workflows:** `reusable-opencode-complete-gate.yml` (CI failures), `reusable-opencode-address-review.yml` (review comments), `reusable-opencode-fix-pr.yml` (manual `/oc fix-pr`)

**What to do:**
Nothing. This happens automatically when the workflow detects problems.

**Workflow triggers:**

- **`reusable-opencode-complete-gate.yml`** — when the `auto-review` label is added to a PR.
- **`reusable-opencode-address-review.yml`** — when `phuhl` submits a review with `changes_requested` or `commented`, or when `phuhl` comments `/oc address-review` on a PR.
- **`reusable-opencode-fix-pr.yml`** — when `phuhl` comments `/oc fix-pr` on a PR.

**What happens when CI is failing:**
When the auto-review gate detects failing CI checks:

1. The AI checks out the branch and merges the latest base.
2. If merge conflicts appear, it resolves them thoughtfully.
3. It checks whether the implementation is complete by looking at unchecked subtasks in the issue comments.
4. If implementation is not finished (unchecked subtasks exist), it hands off to `plan-and-implement` to resume work instead of trying to patch half-finished stubs.
5. If implementation is finished, it reads the failed CI logs (`gh run view --log-failed`) to understand the exact error, then fixes the root cause.
6. It runs `npx prettier --write` and `npx eslint --fix` on changed files, then commits and pushes the fix.
7. The `auto-review` label is re-added (and `ready for review` is removed), which triggers another check run and the cycle repeats.

> **Autofix limits:** After 3 failed fix attempts, the workflow stops trying and posts an exhaustion warning on the PR. Manual intervention is required at that point.

**What happens when review comments are unresolved:**
When `phuhl` submits a review on the PR (or comments `/oc address-review`):

1. The `auto-review` and `ready for review` labels are removed.
2. The AI checks out the branch and merges the latest base.
3. It fetches all unresolved code-line review comments via the GitHub API.
4. For each comment requiring a code change: it makes the change, runs `prettier` and `eslint --fix`, commits, and pushes.
5. For each comment that is a question or where the current code is intentional: it replies with an explanation directly on the comment thread.
6. After all comments are addressed, it runs a verification script to confirm no unresolved code-line comments remain.
7. It posts a summary comment listing all changes made.
8. The `auto-review` label is re-added (and `ready for review` is removed), triggering the review again.

> **Loop risk:** This loop is bounded by phuhl's willingness to submit additional reviews. Each cycle requires a new human review action.

**What you see:**

- New commits appear addressing the issues.
- Replies appear on review comments.
- CI turns green.

---

### Step 4: Manually request a review

**Workflow:** `reusable-opencode-code-review.yml`

**What to do:**

1. Open the pull request in GitHub.
2. Leave a comment with `/oc code-review`.

**Who can trigger this:**
Only `phuhl` can trigger the review workflow — other users' comments are ignored.

**What happens:**
This triggers the same audit process described in Step 2:

1. The AI runs the three audits.
2. Findings are posted as inline comments or a general PR comment.
3. A reviewer is always requested.
4. If clean, the PR is promoted from draft to ready for review.
5. If issues are found, the PR is left as-is. The audit only posts comments — it does not automatically fix the findings.

**When to use this:**

- If you pushed additional commits after the AI finished.
- If you want to re-run the audit before merging.

---

## General Capabilities

These skills can be triggered by asking the AI directly.

### Commands available via PR comments

These commands can be typed as a comment on a pull request (only `phuhl` can trigger them):

| Command | What it does |
|---|---|
| `/oc code-review` | Runs automated code review and posts findings as inline comments |
| `/oc fix-pr` | Fixes failing CI checks on the PR |
| `/oc address-review` | Addresses all unresolved code-line review comments |
| `/oc plan` | Reads an issue and posts a structured plan with risk analysis |
| `/oc complete-gate` | Manually triggers the complete-gate evaluation |

### Review code changes

**What to do:**
Give the AI a commit range, or ask it to review a PR or file.

**What happens:**

1. The AI reads the diff to see exactly what changed.
2. It reads the surrounding source and test files to understand the repo's patterns.
3. It applies a repo-specific checklist if one exists.
4. It gives you a report with two sections:
   - **Must fix:** Bugs, safety issues, or broken patterns. Each finding includes the exact file and line, plus a ready-to-apply code fix.
   - **Should fix:** Inconsistencies or fragile code. Each finding also includes a ready-to-apply fix.
5. If there are no issues in a section, that section is omitted.

### Audit test coverage

**What to do:**
Give the AI a commit range, or ask it to check tests.

**What happens:**

1. The AI identifies which source files changed.
2. For each source file, it lists every public method, switch case, and conditional branch.
3. It maps those targets to the matching test files.
4. It checks for:
   - **Missing tests:** A method or branch with no test at all.
   - **Thin coverage:** Only the happy path is tested; edge cases are missing.
   - **Correctness issues:** A test exists but is written in a way that lets bugs slip through.
5. It gives you a report with a concrete test skeleton for every gap, ready to copy and paste.

### Fix failing CI

**What to do:**
Tell the AI to fix the PR.

- Example: _"Fix the failing checks on PR #7"_ or _"CI is broken."_

**What happens:**

1. The AI reads the list of failing checks on the PR.
2. It fetches the logs for each failing check (`gh run view --log-failed`) to understand the exact error.
3. It checks out the branch.
4. It fixes each failure type:
   - **Tests failing:** It figures out which assertion broke and fixes the code (or the test, if the test is wrong).
   - **Lint / type errors:** It fixes the flagged lines.
   - **Build errors:** It fixes compilation or missing dependency issues.
   - **Flaky / infra errors:** It re-triggers the run instead of changing code.
5. It commits with a clear message and pushes.
6. It watches CI until it turns green (`gh pr checks --watch`).
7. If the PR was still a draft, it promotes it to ready-for-review.

### Resolve merge conflicts

**What to do:**
Tell the AI the PR has conflicts.

- Example: _"Resolve conflicts on PR #7"_ or _"This branch is out of date."_

**What happens:**

1. The AI checks out the PR branch.
2. It identifies the base branch and rebases onto it.
3. If Git pauses for conflicts:
   - It opens each conflicted file.
   - It merges the real logic from both sides into a correct result instead of blindly picking one side.
   - It stages the resolved files and continues the rebase.
4. After the rebase completes, it runs `prettier` and `eslint --fix` on all changed files to prevent formatting-related CI failures.
5. It force-pushes safely (`--force-with-lease`) and confirms the PR is now mergeable.
6. It watches CI re-run automatically.
