# Address review comments

## Goal
Address every unresolved comment on the PR — both code-line review comments AND main-thread PR comments — regardless of author. Track each one as a todo item so none are skipped. A comment is only considered "resolved" if it has a reply that clearly addresses it (fix implemented, explanation of why it is a non-issue, or explicit resolution). Verify with script at the end.

## Steps

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
- Does NOT already have a reply from `"opencode[bot]"` (use the full comments list to cross-check: is there any comment where `in_reply_to_id` == this comment's `id` and `user.login` == `"opencode[bot]"`?)

**Main-thread PR comments** — include if:
- Does NOT already have a reply from `"opencode[bot]"`
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

If the comment author is `"opencode[bot]"`, fetch reactions:
```bash
gh api "repos/{owner}/{repo}/pulls/comments/<comment_id>/reactions" --jq '[.[] | select(.content == "-1") | {user: .user.login, content}]'
```
If there is a thumbs-down (`-1` / `THUMBS_DOWN`) reaction from a human user (not `"opencode[bot]"`):
- **Reply and skip.** The user has manually triaged this bot suggestion as not applicable:
  ```bash
  gh api "repos/{owner}/{repo}/pulls/<pr-number>/comments" -f body="User triaged this suggestion out — skipping." -f in_reply_to=<comment_id>
  ```
- Mark the todo item `completed` — no code changes needed.

If no user triage (no thumbs-down, or comment is from a human), proceed to address the comment:

- **Code change requested (suggestion is valid)** — implement the change, then reply to the comment so it is marked as resolved:
  ```bash
  git add <specific-files>
  npx prettier --write $(git diff --cached --name-only) 2>/dev/null || true
  npx eslint --fix $(git diff --cached --name-only) 2>/dev/null || true
  git add $(git diff --cached --name-only) 2>/dev/null || true
  git commit -m "fix: address review comment – <description>"
  git push
  ```
  Then reply to the comment thread:
  ```bash
  gh api "repos/{owner}/{repo}/pulls/<pr-number>/comments" -f body="Addressed in commit: <description>" -f in_reply_to=<comment_id>
  ```

- **Push-back (suggestion is not appropriate, current code is intentional)** — reply explaining why:
  For code-line comments:
  ```bash
  gh api "repos/{owner}/{repo}/pulls/<pr-number>/comments" -f body="<explanation of why the current code is correct or intentional>" -f in_reply_to=<comment_id>
  ```
  For main-thread comments:
  ```bash
  gh pr comment <pr-number> --body "<explanation>"
  ```

- **Question** — reply with your answer (use the same reply methods as push-back).

### 4. Verify

After all todo items are completed, run the verification script:
```bash
bash .ai-workflows/scripts/verify-no-unresolved-comments.sh <pr-number> "{owner}/{repo}"
```
If it reports unresolved comments, add them as new todo items and address them.

### 5. Post summary

```bash
gh pr comment <pr-number> --body "All review comments addressed. Changes made:
- <bullet list of what was done>"
```
