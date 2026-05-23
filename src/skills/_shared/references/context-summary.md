# Context summary

Before making any code changes, launch a subagent to independently gather and summarize the full context — issue, issue comments, PR, PR comments, and review comments. This isolates the noise from the main context and produces a compact, actionable brief that highlights pitfalls and past decisions.

## Why this matters

- Raw issue/PR comments can be verbose, contradictory, or contain outdated suggestions
- A focused subagent reads everything and distills only what matters for implementation
- Previous review feedback, failed attempts, and design decisions in comments are surfaced so you don't repeat mistakes

## Step 0 — Check for pre-fetched context

Before calling `gh`, check if a previous step (e.g., the workflow's `fetch-pr-context.ts` script) has already saved the data to `.ai-workflows/`. If these files exist, read them directly instead of calling `gh` — it saves tokens and is faster:

```
if [ -f .ai-workflows/pr-body.md ]; then echo "pre-fetched pr-body available"; fi
if [ -f .ai-workflows/pr-comments.json ]; then echo "pre-fetched pr-comments available"; fi
if [ -f .ai-workflows/pr-review-comments.json ]; then echo "pre-fetched review comments available"; fi
if [ -f .ai-workflows/issue-body.md ]; then echo "pre-fetched issue-body available"; fi
if [ -f .ai-workflows/issue-comments.json ]; then echo "pre-fetched issue-comments available"; fi
if [ -f .ai-workflows/review-context.md ]; then echo "pre-fetched review-context available"; fi
```

If all are available, read them with Read tool and skip `gh` calls in Step 2. If any are missing, proceed with the `gh` commands below for those specific items.

## Step 1 — Determine the parameters

You need the issue number, PR number (if it exists), and repo slug. Use these bash commands:

```bash
REPO=$(git remote get-url origin | sed -E 's/.*github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/\1\/\2/')
```

If the issue number isn't already known (e.g., `$ARGUMENTS` in plan-and-implement), derive it:

```bash
ISSUE_NUM="<put the issue number here>"
```

If a PR exists:

```bash
PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ISSUE_NUM}-\")) | .number" 2>/dev/null || echo "")
```

## Step 2 — Launch the subagent

Use the **Task** tool with a `general` subagent type. The prompt must include the exact issue number, PR number, and repo so the subagent can make its own `gh` calls.

```
## Context summary for the original agent to then use for implement work.

Gather full context for issue #<ISSUE_NUM> (PR #<PR_NUMBER> if it exists, otherwise say "no PR yet") in repo <REPO>.

First, check if the calling context already has pre-fetched files in `.ai-workflows/`. If files like `.ai-workflows/pr-body.md`, `.ai-workflows/pr-comments.json`, `.ai-workflows/pr-review-comments.json`, `.ai-workflows/issue-body.md`, `.ai-workflows/issue-comments.json` exist, read them with the Read tool directly. Only use `gh` commands for items that are NOT already available as pre-fetched files.

If you must use `gh` commands, use these:

1. **Issue body**: `gh issue view <ISSUE_NUM> --json title,body`
2. **Issue comments**: `gh issue view <ISSUE_NUM> --json comments -q '.comments[] | {author: .author.login, body, createdAt}'`
3. **If a PR exists:**
   - PR body: `gh pr view <PR_NUMBER> --json title,body,baseRefName,headRefName,state,isDraft`
   - PR comments (main thread): `gh pr view <PR_NUMBER> --json comments -q '.comments[] | {author: .author.login, body, createdAt}'`
   - PR review comments (code-line): `gh api "repos/<REPO>/pulls/<PR_NUMBER>/comments" --jq '.[] | {id, path, line, body, in_reply_to_id, user: .user.login, author_association, createdAt}'`

Read ALL comments. Build a concise, structured summary. Focus on information that changes how implementation should be done.

Return the summary in this exact format:

## Issue: <title> (#<number>)

### Description
<1–2 sentence summary of what the issue is about>

### Critical gotchas / pitfalls
- <specific things to avoid or watch out for — errors made in previous attempts, constraints that were discovered late, etc.>
- <only include items that directly affect how the implementation should be done>

### Relevant discussions & decisions
- <design decisions from comments, e.g. "decided to use library X instead of Y">
- <feedback that changed the approach>
- <any rejected approaches and why they were rejected>

### Constraints from comments
- <hard requirements stated in comments, e.g. "must not break the public API", "keep it under 100 lines">
- <backward-compatibility requirements, etc.>

### PR status (if exists)
- PR number, branch, base branch, draft/ready
- Current CI status (if relevant)
- Summary of outstanding review feedback
- Unresolved review threads (comment ID, file:line, summary)

### Stacking
- <If this is stacked on another PR/issue, note the dependency>
```

The subagent returns this summary to you. Use it to guide every decision you make during implementation.

## Step 3 — Brief the user

After receiving the subagent's summary, communicate the most important takeaway to the user in 1–2 lines (e.g., "Key gotcha: must handle HTTP/2 trailers — previous attempt failed because they were ignored").
