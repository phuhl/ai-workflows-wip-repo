# User Guide

This guide explains how to use the OpenCode automation from a user's perspective, following the lifecycle of an issue and pull request.

---

## OpenCode Workflow

### Step 1: Create an issue and label it

**What to do:**

1. Create a GitHub issue describing the work you want done.
2. Add the label `opencode` to the issue.

**Who can trigger this:**
Only `phuhl` can label an issue to start the workflow.

**What happens:**

1. The AI fetches the issue. If there are no subtasks, it breaks the work into small steps and appends them to the issue body.
2. It creates a branch and a **draft PR**.
3. Before writing any code, it merges the latest base branch into the feature branch to prevent future conflicts.
4. It implements each subtask using TDD and commits and pushes after each subtask is complete. For example, it writes all stubs and failing tests for the first subtask, then commits once. It does not commit after every individual file.
5. Before finishing, it runs a self-check by auditing its own code with the same checks used in code review. It looks for test coverage gaps, correctness issues, and guideline violations. Any `must-fix` finding is fixed, committed, and re-checked before proceeding.
6. After all subtasks and self-checks are done, it merges the base one final time, updates the PR body, and adds a `complete` label. The PR remains a draft — the automatic review gate will promote it if the audits pass cleanly.

**What you see:**

- A new branch appears.
- A draft PR is opened with "Work in progress" in the body.
- The issue body gets a `## Subtasks` section with checkboxes.
- As the AI works, checkboxes are checked off and commits appear.

---

### Step 2: Automatic review when implementation is done

**What to do:**
Nothing. This happens automatically when the AI adds the `complete` label.

**What happens:**

1. The workflow first checks if the PR has merge conflicts. If so, it resolves them.
2. It waits for CI checks to finish.
3. If CI is failing, it removes the `complete` label, fixes the failures, and re-adds the `complete` label.
4. If CI is passing, it runs the review workflow inline.
5. The AI fetches the PR metadata and determines the diff range.
6. It runs three audits on its own code:
   - `verify-tests` to check test coverage.
   - `code-review` to check correctness and safety.
   - `code-guidelines-check` to check conventions.
7. It parses the findings:
   - Findings that map to a specific line in the diff are posted as inline review comments.
   - General findings are posted as a single PR comment.
8. It automatically requests `phuhl` as a reviewer — regardless of whether findings were posted.
9. If **no findings** were posted, it promotes the PR from draft to ready for review.
10. If findings were posted, the PR is left as-is (draft or ready). The audit only posts comments — it does not automatically fix the findings. A human or the address-review workflow must act on them.

**What you see:**

- A reviewer is always requested.
- If clean: the PR is promoted from draft to ready for review.
- If issues found: inline comments and a general PR comment appear. The PR does not change until someone addresses the comments.

---

### Step 3: Automatic fixes for problems

**What to do:**
Nothing. This happens automatically when the workflow detects problems.

**Workflow triggers:**

- The complete gate — when a CI check completes on a PR that has the `complete` label (and the associated issue has the `opencode` label).
- The address review workflow — when `phuhl` submits a review with `changes_requested` or `commented`.

**What happens when CI is failing:**
When the complete gate detects failing CI checks:

1. The AI checks out the branch and merges the latest base.
2. If merge conflicts appear, it resolves them thoughtfully.
3. It discovers the test runner, reproduces the failure locally, and fixes the root cause.
4. It commits and pushes the fix.
5. It runs a final local test.
6. The `complete` label is re-added, which triggers another check run and the cycle repeats.

> **Autofix limits:** After 3 failed fix attempts, the workflow stops trying and posts an exhaustion warning on the PR. Manual intervention is required at that point.

**What happens when review comments are unresolved:**
When `phuhl` submits a review on the PR:

1. The `complete` label is removed.
2. The AI checks out the branch and merges the latest base.
3. It fetches all unresolved comments.
4. For each comment requiring a code change: it makes the change, runs tests, commits, and pushes.
5. For each comment that is a question: it replies on the PR.
6. For each outdated comment: it ignores it.
7. It posts a summary comment listing all changes made.
8. It runs a final local test.
9. The `complete` label is re-added, triggering the review again.

> **Loop risk:** This loop is bounded by phuhl's willingness to submit additional reviews. Each cycle requires a new human review action.

**What you see:**

- New commits appear addressing the issues.
- Replies appear on review comments.
- CI turns green.

---

### Step 4: Manually request a review

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
2. It fetches the logs for each failing check to understand the exact error.
3. It checks out the branch.
4. It fixes each failure type:
   - **Tests failing:** It figures out which assertion broke and fixes the code (or the test, if the test is wrong).
   - **Lint / type errors:** It fixes the flagged lines.
   - **Build errors:** It fixes compilation or missing dependency issues.
   - **Flaky / infra errors:** It re-triggers the run instead of changing code.
5. It runs tests locally to confirm everything passes.
6. It commits with a clear message, pushes, and watches CI until it turns green.
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
4. It runs the full test suite to catch any regressions introduced by the merge.
5. It commits any post-rebase fixes.
6. It force-pushes safely (`--force-with-lease`) and confirms the PR is now mergeable.
7. It watches CI re-run automatically.
