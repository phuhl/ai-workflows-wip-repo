# Address review comments

## Goal
Address every unresolved comment on the PR — both code-line review comments AND main-thread PR comments — regardless of author. Track each one as a todo item so none are skipped. A comment is only considered "resolved" if it has a reply that clearly addresses it (fix implemented, explanation of why it is a non-issue, or explicit resolution). Verify with script at the end.

## Steps

### 1. Run the todo-list builder

This script reads the pre-fetched PR context, determines the bot username, filters to unresolved comments (threads where the last reply is not from the bot, PR comments without a bot reply, excluding status/progress messages), and checks for user triage (thumbs-down reactions on bot comments).

```bash
npx tsx .opencode/skills/fix-pr/references/scripts/build-todo-list.ts
```

The output is JSON:
```json
{
  "bot_user": "<string>",
  "todos": [
    {
      "type": "review",
      "id": <number>,
      "text": "Review comment from <user> on <file>:<line> — \"<body>\"",
      "author": "<user>",
      "path": "<file>",
      "line": <number>,
      "triaged": <true|false>
    },
    {
      "type": "pr_comment",
      "id": <number>,
      "text": "PR comment from <user> — \"<body>\"",
      "author": "<user>",
      "triaged": false
    }
  ]
}
```

### 2. Build the todo list

Use the `todowrite` tool to create ONE todo item per entry in the `todos` array. Use the `text` field as the todo content. Mark items with `triaged: true` as `cancelled` immediately — the user already rejected the bot's suggestion.

### 3. Process each todo item

Set the current item to `in_progress`, handle it, then mark it `completed`. Work through them one at a time.

**For each comment, decide how to respond:**

- **Code change requested (suggestion is valid)** — implement the change, then commit and reply:
   ```bash
   npx tsx src/skills/_shared/scripts/format-and-commit.ts "fix: address review comment – <description>" <specific-files>
   npx tsx src/skills/_shared/scripts/post-review-reply.ts <pr-number> <comment_id> "Addressed in commit: <description>"
   ```

- **Push-back (suggestion is not appropriate, current code is intentional)** — reply explaining why:
   For code-line comments:
   ```bash
   npx tsx src/skills/_shared/scripts/post-review-reply.ts <pr-number> <comment_id> "<explanation>"
   ```
   For main-thread comments:
   ```bash
   gh pr comment <pr-number> --body "<explanation>"
   ```

- **Question** — reply with your answer (use the same reply methods as push-back).

### 4. Verify

After all todo items are completed, run the verification script:
```bash
npx tsx .ai-workflows/scripts/verify-no-unresolved-comments.ts <pr-number> "{owner}/{repo}"
```
If it reports unresolved comments, add them as new todo items and address them. Re-read `.ai-workflows/pr-review-comments.json` to understand the full thread context — use `in_reply_to_id` to trace the thread chain. **Base your action on the most recent human reply in the thread**, not just the original comment. For every comment addressed in the verification pass, you MUST post a reply explaining what action was taken (and why), just as in step 3.

### 5. Post summary

```bash
gh pr comment <pr-number> --body "All review comments addressed. Changes made:
- <bullet list of what was done>"
```

### 6. Run self-check audits

After all comments are addressed and the summary is posted, run self-check audits on the full PR diff:

```bash
PR_NUMBER=<pr-number>
BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
git fetch origin "$BASE"
MERGE_BASE=$(git merge-base "origin/$BASE" HEAD)
RANGE="${MERGE_BASE}..HEAD"
REF="#${PR_NUMBER}"
```

Read `src/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.
