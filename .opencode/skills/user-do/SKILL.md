---
name: user-do
description: Execute an arbitrary user prompt on an issue or PR. Triggered by '/oc do <prompt>'.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Todowrite, Skill
context: fork
agent: general-purpose
argument-hint: #<number> <prompt>
---

You are invoked because someone commented `/oc do <prompt>` on an issue or PR.

## Inputs
`$ARGUMENTS` contains the invocation text with the issue/PR number. The user's prompt is in `.opencode/do-prompt.txt`.

```bash
NUMBER=$(echo "$ARGUMENTS" | grep -oP '#\K\d+' | head -1)
PROMPT=$(cat .opencode/do-prompt.txt 2>/dev/null || echo "$ARGUMENTS")
```

## Setup

1. Determine repo slug:
   ```bash
   REPO=$(git remote get-url origin | sed -E 's/.*github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/\1\/\2/')
   ```

2. Read the issue/PR context:
   ```bash
   if [ -n "$NUMBER" ]; then
     gh issue view "$NUMBER" --json title,body 2>/dev/null || gh pr view "$NUMBER" --json title,body 2>/dev/null || true
   fi
   ```

## Instructions

1. **Read the user's prompt carefully.** It is in the `$PROMPT` variable. Understand what they are asking you to do.
2. **Explore the codebase** to understand the relevant files and patterns before making changes.
3. **Execute the user's instructions.** You have full git write access — you can modify files, push commits, create PR comments, and interact with the repository.
4. **Before committing**, always use the shared format-and-commit script:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/format-and-commit.ts "<descriptive message>" <specific-files>
   ```
5. **After finishing**, post a brief comment summarizing what was done.

6. **Run self-check audits** on the changes you made:

   Determine the diff range — if on a PR branch, use the full PR diff; otherwise use the changes from this session:
   ```bash
   PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null || echo "")
   if [ -n "$PR_NUMBER" ]; then
     BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
     git fetch origin "$BASE"
     MERGE_BASE=$(git merge-base "origin/$BASE" HEAD)
     RANGE="${MERGE_BASE}..HEAD"
     REF="#${PR_NUMBER}"
   else
     RANGE="HEAD~1..HEAD"
     REF="do"
   fi
   ```
   Read `.opencode/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.

## Post-write hook

Read `.opencode/skills/_shared/references/post-write-hook.md`.

Read `.opencode/skills/_shared/references/git-safety.md`.

## Principles
- Do exactly what the user asked — no more, no less.
- If the prompt is ambiguous, do your best interpretation and explain what you did.
- If the task is impossible or you lack information, post a comment explaining why.
- Never access files outside the repository workspace.
