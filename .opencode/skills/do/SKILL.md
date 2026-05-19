---
name: do
description: Execute an arbitrary user prompt on an issue or PR. Triggered by '/oc do <prompt>'.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
context: fork
agent: general-purpose
argument-hint: <issue-or-pr-number> with prompt: <prompt>
---

You are invoked because someone commented `/oc do <prompt>` on an issue or PR.

## Inputs
Parse `$ARGUMENTS` as: `issue/PR #<number> with prompt: <prompt>`.

## Setup

1. Extract the number and prompt from `$ARGUMENTS`:
   ```bash
   NUMBER=$(echo "$ARGUMENTS" | grep -oP '#\K\d+' | head -1)
   PROMPT=$(echo "$ARGUMENTS" | sed -E 's/.*with prompt: //')
   ```

2. Determine repo slug:
   ```bash
   REPO=$(git remote get-url origin | sed -E 's/.*github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/\1\/\2/')
   ```

3. Read the issue/PR context:
   ```bash
   if [ -n "$NUMBER" ]; then
     gh issue view "$NUMBER" --json title,body 2>/dev/null || gh pr view "$NUMBER" --json title,body 2>/dev/null || true
   fi
   ```

## Instructions

1. **Read the user's prompt carefully.** It is in `$ARGUMENTS`. Understand what they are asking you to do.
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

## Principles
- Do exactly what the user asked — no more, no less.
- If the prompt is ambiguous, do your best interpretation and explain what you did.
- If the task is impossible or you lack information, post a comment explaining why.
- Never access files outside the repository workspace.
