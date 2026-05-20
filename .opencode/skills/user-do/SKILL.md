---
name: user-do
description: Execute an arbitrary user prompt on an issue or PR. Triggered by '/oc do <prompt>'.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Todowrite
context: fork
agent: general-purpose
argument-hint: #<number> <prompt>
---

You are invoked because someone commented `/oc do <prompt>` on an issue or PR.

## Inputs
`$ARGUMENTS` contains the invocation text with the issue/PR number. The user's prompt is in `/tmp/opencode-do-prompt.txt`.

```bash
NUMBER=$(echo "$ARGUMENTS" | grep -oP '#\K\d+' | head -1)
PROMPT=$(cat /tmp/opencode-do-prompt.txt 2>/dev/null || echo "$ARGUMENTS")
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
4. **Before committing**, always format:
   ```bash
   git add <specific-files>
   npx prettier --write $(git diff --cached --name-only) 2>/dev/null || true
   npx eslint --fix $(git diff --cached --name-only) 2>/dev/null || true
   git add $(git diff --cached --name-only) 2>/dev/null || true
   git commit -m "<descriptive message>"
   git push
   ```
5. **After finishing**, post a brief comment summarizing what was done.

## Post-write hook

After every file write or edit, the `file-hook` plugin runs automatically:
- `npx prettier --write <file>` — formats the file
- `npx eslint <file>` — lints the file
- `npx tsc --noEmit` — type-checks the entire project

The hook does **not** block the write — it only logs issues found. When the plugin is unavailable, manually run these checks before committing:
```bash
npx prettier --write <file>
npx eslint <file>
npx tsc --noEmit
```

**Git safety**: Never stage or commit files from `.ai-workflows/`, `.opencode/skills/`, or `.opencode/plugins/`. The `git-guard` plugin automatically unstages any such files. Always use `git add <specific-files>`, never `git add .` or `git add -A`.

## Principles
- Do exactly what the user asked — no more, no less.
- If the prompt is ambiguous, do your best interpretation and explain what you did.
- If the task is impossible or you lack information, post a comment explaining why.
- Never access files outside the repository workspace.
