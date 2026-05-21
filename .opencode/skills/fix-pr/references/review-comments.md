# Address review comments

## Goal
Address every unresolved comment on the PR — both code-line review comments AND main-thread PR comments — regardless of author. Track each one as a todo item so none are skipped. A comment is only considered "resolved" if it has a reply that clearly addresses it (fix implemented, explanation of why it is a non-issue, or explicit resolution). Verify with script at the end.

## Steps

### 0. Detect the bot username

The GH_TOKEN is the GitHub App token, so `gh api /user` returns the bot.
```bash
BOT_USER=$(gh api /user -q '.login' 2>/dev/null || echo "opencode[bot]")
echo "Bot user: ${BOT_USER}"
```

### 1. Fetch all comments

Fetch code-line review comments (save to a temp file):
```bash
gh api "repos/{owner}/{repo}/pulls/<pr-number>/comments" --jq '[.[] | {id, path, line, body, in_reply_to_id, user: .user.login, created_at}]' > /tmp/review_comments.json
```

Fetch main-thread PR comments (not review comments):
```bash
gh pr view <pr-number> --json comments -q '.comments[] | {id, body, author: .author.login, created_at}' > /tmp/pr_comments.json
```

### 2. Build the todo list

Use the `todowrite` tool to create ONE todo item per comment that needs attention. Do not group or batch them — each comment must be its own item.

**Code-line review comments** — include if ALL of these are true:
- `in_reply_to_id` is null (thread starter, not a reply)
- The **last** reply in the thread is NOT from `"$BOT_USER"`. To determine this: find all comments where `in_reply_to_id` == this comment's `id`, sort them by `id` ascending, and check the `user.login` of the last one. If the last reply is from `"$BOT_USER"`, the thread is already handled — skip it. If the last reply is from anyone else (including a human who replied after the bot), the comment needs attention.

**Main-thread PR comments** — include if:
- Does NOT already have a reply from `"$BOT_USER"`
- Is NOT a workflow progress/status update (content matches patterns like `**OpenCode**`, `✅`, `❌`, `⚠️` combined with "finished", "failed", "error", or "started")

Format each todo item as:
```
Review comment from <user> on <file>:<line> — "<truncated body>"
```
or for main-thread comments:
```
PR comment from <user> — "<truncated body>"
```

### 3. Process each todo item

Set the current item to `in_progress`, handle it, then mark it `completed`. Work through them one at a time.

**For each comment, first check for user triage on bot comments:**

If the comment author is `"$BOT_USER"`, fetch reactions:
```bash
gh api "repos/{owner}/{repo}/pulls/comments/<comment_id>/reactions" --jq '[.[] | select(.content == "-1") | {user: .user.login, content}]'
```
If there is a thumbs-down (`-1` / `THUMBS_DOWN`) reaction from a human user (not `"$BOT_USER"`):
- **Reply and skip.** The user has manually triaged this bot suggestion as not applicable:
  ```bash
  npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts <pr-number> <comment_id> "User triaged this suggestion out — skipping."
  ```
- Mark the todo item `completed` — no code changes needed.

If no user triage (no thumbs-down, or comment is from a human), proceed to address the comment:

- **Code change requested (suggestion is valid)** — implement the change, then reply to the comment so it is marked as resolved:
   ```bash
   npx tsx .opencode/skills/_shared/scripts/format-and-commit.ts "fix: address review comment – <description>" <specific-files>
   ```
  Then reply to the comment thread:
  ```bash
  npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts <pr-number> <comment_id> "Addressed in commit: <description>"
  ```

- **Push-back (suggestion is not appropriate, current code is intentional)** — reply explaining why:
  For code-line comments:
  ```bash
  npx tsx .opencode/skills/_shared/scripts/post-review-reply.ts <pr-number> <comment_id> "<explanation of why the current code is correct or intentional>"
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
If it reports unresolved comments, add them as new todo items and address them. **When re-processing a comment from the verification stage, you MUST read the full thread — not just the original comment body.** Fetch all replies to understand the human follow-up context:

```bash
# Read the full thread for comment <id>
gh api "repos/{owner}/{repo}/pulls/comments" --jq ".[] | select(.id == <id> or .in_reply_to_id == <id>) | {id, user: .user.login, body}" | jq -s 'sort_by(.id)'
```

Base your action on the **most recent human reply in the thread**, not just the original comment. For every comment addressed in the verification pass, you MUST post a reply explaining what action was taken (and why), just as in step 3.

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

Read `.opencode/skills/_shared/references/self-check.md` and follow its instructions from top to bottom.
