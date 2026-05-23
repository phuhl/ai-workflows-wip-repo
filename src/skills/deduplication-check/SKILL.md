---
name: deduplication-check
description: Scan recent changes for unnecessary code duplication against the unchanged existing codebase. Flag duplications, suggest deduplications, and for judgment calls give short pro/contra reasoning.
allowed-tools: Read, Glob, Grep, Bash, Todowrite
context: fork
agent: general-purpose
argument-hint: <from-commit>..<to-commit>
---

# Deduplication Check

Your job is to scan the changes in `$ARGUMENTS` (a git commit range like `abc123..def456`) for unnecessary code duplication, including duplication of patterns that already exist elsewhere in the unchanged codebase.

## Before checking

Read `src/skills/_shared/references/review-context.md` and follow all its instructions. Never flag code that is explicitly documented as intentionally duplicated or kept separate for a documented reason.

## How to approach the check

1. **Identify what changed.** Use the commit range from `$ARGUMENTS`:
   ```bash
   git diff $ARGUMENTS
   ```
   Note the files and the specific lines added or modified.

2. **Compare against the existing codebase.** For each changed file:
   - Look for similar blocks of code **within the same file** that could be extracted into a shared function.
   - Look for patterns in the new code that **already exist elsewhere in the repo** (in unchanged files) — search with Grep for key function signatures, logic patterns, or structural similarities.
   - Focus on logic duplication, not boilerplate or necessary repetition (e.g., type definitions, imports, or configuration).

3. **Determine severity.** For each finding:
   - **must-fix**: Exact or near-exact copy-paste within the same file or module. There is an obvious extraction that has no downside.
   - **should-fix**: Significant overlap with existing code. Deduplication would reduce maintenance burden but requires a small refactor.
   - **judgment-call**: Similar logic exists but deduplication involves tradeoffs (e.g., different callers with subtly different needs, introduces an abstraction that may be premature, or the deduplicated version would be harder to read).

## Report format

```
## Summary
<one paragraph: what changed and the overall duplication assessment>

## Must fix
<only present if there are must-fix issues>

### <short title>
**File:** `path/to/file.ts`, line <N>
**Problem:** <what is duplicated and where>
**Fix:**
\`\`\`typescript
<deduplicated code or refactored version>
\`\`\`

## Should fix
<only present if there are should-fix issues>

### <short title>
**File:** `path/to/file.ts`, line <N>
**Problem:** <what is duplicated and where>
**Fix:**
\`\`\`typescript
<deduplicated code or refactored version>
\`\`\`

## Judgment calls
<only present if there are judgment-call items>

### <short title>
**File:** `path/to/file.ts`, line <N>
**Observation:** <what the duplication is and why it might or might not matter>
**Pro deduplication:** <one line>
**Contra deduplication:** <one line>
**Recommendation:** <lean one way or neutral>
```

## Actionable findings
<only present if there are findings that map to specific lines>

### <short title>
- **file:** `path/to/file.ts`
- **line:** [N]
- **severity:** must-fix | should-fix | judgment-call
- **problem:** <what is duplicated and where>
- **fix:**
  ```typescript
  <deduplicated code>
  ```
- **pro/contra:** (only for judgment-call) pro: <one line> | contra: <one line>

Omit a section entirely if it has no findings. Every must-fix and should-fix finding must include a ready-to-apply code fix.

## Principles
- Do not flag necessary repetition (boilerplate, configuration, type definitions, standard patterns).
- Do not flag duplication when the PR description, issue, or a code comment explicitly documents that two pieces of code are intentionally kept separate for different use cases, backward-compat boundaries, or ownership domains.
- When suggesting a shared function extraction, show where it would live and how both call sites would use it.
- For judgment calls, keep pro/contra to exactly one line each. Do not argue for one side — just present the facts and let the caller decide.
