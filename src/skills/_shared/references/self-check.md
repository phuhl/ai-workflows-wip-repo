# Self-Check Audits

## Goal

Run the same audits that `review-pr` runs — `code-review`, `verify-tests`, `code-guidelines-check`, and `deduplication-check` — and fix any `must-fix` and `should-fix` findings.

## Prerequisites

Set by the caller before loading this reference:

- `$RANGE` — a git commit range to audit (e.g., `abc123..HEAD`).
- `$REF` — a reference string for commit messages (e.g., `#42`).

## Steps

### 0. Ensure review context is available

Before running audits, check if the workflow has pre-fetched context files in `.ai-workflows/`. The workflow runs `fetch-pr-context.ts` before invoking opencode. Verify files exist:

```bash
if [ -f .ai-workflows/review-context.md ]; then echo "review-context available"; fi
if [ -f .ai-workflows/pr-body.md ]; then echo "pr-body available"; fi
if [ -f .ai-workflows/code-comments.md ]; then echo "code-comments available"; fi
```

If no context files exist (e.g., running on a branch without a PR), the audit skills will still work but may flag intentional decisions. This is acceptable for self-check — the skills load `review-context.md` which tells them to read code comments directly when pre-fetched files are absent.

The audit skills (`code-review`, `deduplication-check`, `code-guidelines-check`, `verify-tests`) automatically read context from `.ai-workflows/` via the `review-context.md` shared reference.

### 1. Run the four audit skills in parallel

Launch all four at the same time using the Skill tool:

```
Skill("code-review", args=RANGE)
Skill("verify-tests", args=RANGE)
Skill("code-guidelines-check", args=RANGE)
Skill("deduplication-check", args=RANGE)
```

Save each skill's output to a temp file immediately as they return. Do not run them sequentially — they are independent and should execute in parallel.

### 2. Parse actionable findings

Read each audit output. Extract every finding from the **Actionable findings** section where severity is `must-fix` or `should-fix`.

### 3. Fix findings

For each `must-fix` or `should-fix` finding:

- Apply the suggested fix using `Write` or `Edit`.
- Format and commit:

```bash
npx tsx src/skills/_shared/scripts/format-and-commit.ts "fix: resolve self-check finding – <description> (${REF})" <specific-files>
```

### 4. Repeat until clean

Re-run the four audits (step 1). Repeat steps 1–4 until no `must-fix` or `should-fix` items remain in any audit output.

### 5. Severity rules

- **must-fix**: Always fix. These are blocking and must be resolved.
- **should-fix**: Fix if the edit is straightforward. If a `should-fix` item requires significant refactoring or has unclear trade-offs, you may defer it.
- **note**: Leave for the human reviewer. Do not block on these.
