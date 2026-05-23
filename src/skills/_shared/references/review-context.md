# Review Context

Before forming judgments about code changes, you MUST read and respect the intent behind those changes.

## Step 1 — Check for pre-fetched context

The workflow may have pre-fetched PR/issue data and saved it under `.ai-workflows/`. Check for these files and read what's available:

1. **`.ai-workflows/review-context.md`** — Distilled summary of PR goals, design decisions, and constraints. If this file exists, read it first. It contains the most important context you need.

2. **`.ai-workflows/pr-body.md`** — The full PR description. Read this to understand the stated goals and approach.

3. **`.ai-workflows/issue-body.md`** — The original issue. Read if available, to understand what was asked for.

4. **`.ai-workflows/code-comments.md`** — All comments found in the changed files. Read this to find deliberate decisions documented in the code itself.

5. **`.ai-workflows/changed-files.txt`** — List of files changed in this PR.

## Step 2 — Read code comments in the changed files

Even when pre-fetched context is available, you must also read the actual changed files directly. Pay specific attention to:

- **Comments near removed code** — the developer may have left a comment explaining *why* something was removed ("remove backwards compat — v2 no longer needs this").
- **Comments near added code** — non-obvious patterns may have a comment explaining the rationale.
- **TODO/FIXME comments** — these are intentional gaps, not oversights.

## Step 3 — Discard findings that contradict stated intent

After forming your initial findings, check each one against the context you gathered:

**Discard a finding if** any of the following explicitly document the flagged behavior as intentional:

1. The PR description says the flagged behavior is by design
2. The issue discussion states the flagged behavior is desired
3. A code comment in the changed file explains *why* the code is written that way
4. A review comment thread on the PR has already discussed and decided on this approach

**If intent is documented but you still believe it's wrong:**

- You may include it as a **note** (lowest severity) explaining the tradeoff
- You must cite the documented intent and explain why it might still be a concern
- Do NOT mark it as `must-fix` or `should-fix`

## Step 4 — Apply the intent-aware principle

Remember: your job is to review code **in context**, not in a vacuum. Good code is code that achieves its stated goals correctly and safely. A pattern that looks wrong in isolation might be exactly right given the constraints documented in the PR or code comments.

**The golden rule: if the developer has explicitly documented *why* they made a choice, assume it's valid unless you can find a concrete bug or safety issue that contradicts their stated reasoning.**
