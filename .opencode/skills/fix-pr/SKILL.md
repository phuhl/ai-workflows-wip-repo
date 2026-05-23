---
name: fix-pr
description: Fix a PR that has failing CI or unresolved review comments. Checks out the branch, merges base, handles merge conflicts, diagnoses, applies fixes, commits, and pushes. The calling workflow manages the 'auto-review' label.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Todowrite, Skill, Task
context: fork
agent: general-purpose
argument-hint: <pr-number> [ci-failing|review-comments]
---

You are invoked to fix a PR. The context is provided in `$ARGUMENTS`.

## Inputs
Parse `$ARGUMENTS` as: `<pr-number> <context>` where context is `ci-failing` or `review-comments`.

## Setup

1. Fetch PR metadata (note `base.ref` and `head.ref`):
   ```bash
   gh pr view <pr-number> --json baseRefName,headRefName,title,body
   ```
2. Check out the branch and merge the latest base:
   ```bash
   git fetch origin
   git checkout <head-ref>
   git pull
   git merge origin/<base-ref>
   ```
3. **If the merge succeeds** (no conflicts), proceed directly to "Check implementation completeness".
4. **If the merge produces conflicts** (merge exits non-zero), **do not attempt to resolve them inline.** Abort the merge and delegate to the `resolve-pr-conflicts` skill, which handles conflict resolution end-to-end via rebase:
   ```bash
   git merge --abort
   ```
   Then invoke:
   ```
   Skill("resolve-pr-conflicts", args="<pr-number>")
   ```
   After `resolve-pr-conflicts` completes (it rebases onto the base branch and force-pushes), pull the updated branch so you are back on the latest conflict-free state:
   ```bash
   git fetch origin
   git checkout <head-ref>
   git pull
   ```
   The branch is now up-to-date with the base. Proceed to "Check implementation completeness".

## Context summary

Before fixing anything, launch a subagent to distill the issue, comments, PR, and review feedback into a compact summary.

1. Find the associated issue number:
   ```bash
   ISSUE_NUM=$(gh pr view <pr-number> --json headRefName -q '.headRefName' | grep -oE '^[0-9]+' || true)

   if [ -z "$ISSUE_NUM" ]; then
     ISSUE_NUM=$(gh pr view <pr-number> --json body -q '.body' | grep -oEi '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]*#[0-9]+' | grep -oE '[0-9]+' | head -1)
   fi
   ```

2. Read `.opencode/skills/_shared/references/context-summary.md`.
3. Follow Step 1 and Step 2. Use `<pr-number>` (from `$ARGUMENTS`) for the PR number, `$ISSUE_NUM` for the issue (pass "no issue found" if empty), and determine the repo slug. The subagent will independently fetch all comments and return a concise summary.
4. After the subagent returns, note key gotchas to the user in 1–2 lines, then proceed.

## Check implementation completeness

Before attempting any fix, determine whether the implementation is actually finished.

1. If `$ISSUE_NUM` is not already set, find the associated issue:
   ```bash
   ISSUE_NUM=$(gh pr view <pr-number> --json headRefName -q '.headRefName' | grep -oE '^[0-9]+' || true)

   if [ -z "$ISSUE_NUM" ]; then
     ISSUE_NUM=$(gh pr view <pr-number> --json body -q '.body' | grep -oEi '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]*#[0-9]+' | grep -oE '[0-9]+' | head -1)
   fi
   ```

2. Count unchecked subtasks in the issue body **and** in issue comments:
   ```bash
   UNCHECKED_BODY=$(gh issue view "$ISSUE_NUM" --json body -q '.body' 2>/dev/null | grep -c '\- \[ \]' || true)
   UNCHECKED_COMMENTS=$(gh api "repos/{owner}/{repo}/issues/${ISSUE_NUM}/comments" --jq '.[].body' 2>/dev/null | grep -c '\- \[ \]' || true)
   UNCHECKED=$((UNCHECKED_BODY + UNCHECKED_COMMENTS))
   ```

3. **If unchecked subtasks exist** (`$UNCHECKED -gt 0`):
   - The implementation is not complete. **Hand off to `plan-and-implement` and stop.**
   - Invoke:
     ```
     Skill("plan-and-implement", args="$ISSUE_NUM")
     ```
   - **Do not proceed to Fix CI failures or Address review comments.** The auto-review gate will re-invoke `fix-pr` after `plan-and-implement` finishes.

4. **If all subtasks are checked** (or no associated issue was found):
   - Proceed to the relevant section below.

## Fix CI failures

If context is `ci-failing`: Load `references/ci-failing.md` and follow its instructions from top to bottom.

## Address review comments

If context is `review-comments`: Load `references/review-comments.md` and follow its instructions from top to bottom.

## Post-write hook

Read `.opencode/skills/_shared/references/post-write-hook.md`.

Read `.opencode/skills/_shared/references/git-safety.md`.

## After fixing

Push your changes after each fix (the reference files handle this per-item). The auto-review gate workflow will monitor CI and re-invoke you if further fixes are needed. **Do not run tests locally.**
