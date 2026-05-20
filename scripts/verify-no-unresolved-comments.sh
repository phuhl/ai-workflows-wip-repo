#!/usr/bin/env bash
# Verify that no code-line review comments on a PR are left unaddressed.
# A comment is "addressed" if the last reply in its thread is from the bot.
#
# Usage: bash verify-no-unresolved-comments.sh <pr-number> [repo] [bot-user]
# Exits with 0 if clean, 1 if unresolved comments remain.

set -euo pipefail

PR_NUMBER="$1"
REPO="${2:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")}"
BOT_USER_RAW="${3:-$(gh api /user -q '.login' 2>/dev/null || echo "")}"
if [ -z "$BOT_USER_RAW" ] || [ "$BOT_USER_RAW" = "null" ]; then
  BOT_USER="opencode[bot]"
else
  BOT_USER="$BOT_USER_RAW"
fi

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: bash verify-no-unresolved-comments.sh <pr-number> [repo] [bot-user]"
  exit 2
fi

if [ -z "$REPO" ]; then
  echo "Error: could not determine repository. Pass it as the second argument."
  exit 2
fi

echo "=== Checking unresolved code-line review comments on PR #${PR_NUMBER} in ${REPO} ==="
echo "Bot user for resolution check: ${BOT_USER}"

# Fetch all review comments and group by thread
ALL_COMMENTS=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}/comments" --jq '.' 2>/dev/null || echo "[]")

if [ "$ALL_COMMENTS" = "[]" ] || [ -z "$ALL_COMMENTS" ]; then
  echo "No code-line review comments found."
  exit 0
fi

# Thread starters: all comments that start a thread (in_reply_to_id == null), regardless of author
THREAD_STARTERS=$(echo "$ALL_COMMENTS" | jq '[.[] | select(.in_reply_to_id == null)]')
STARTER_IDS=$(echo "$THREAD_STARTERS" | jq -r '.[].id')

if [ -z "$STARTER_IDS" ] || [ "$STARTER_IDS" = "" ]; then
  echo "No code-line review comment threads found."
  exit 0
fi

UNRESOLVED=0
for ID in $STARTER_IDS; do
  # A comment is addressed only if the LAST reply in the thread is from the bot.
  # This ensures that follow-up human replies (e.g. "this is still broken") are not
  # mistaken for a resolved thread.
  LAST_REPLY_USER=$(echo "$ALL_COMMENTS" | jq -r "[.[] | select(.in_reply_to_id == ${ID})] | sort_by(.id) | last | .user.login // \"\"")
  if [ "$LAST_REPLY_USER" != "$BOT_USER" ]; then
    COMMENT_INFO=$(echo "$ALL_COMMENTS" | jq -r ".[] | select(.id == ${ID}) | \"  id=${ID}  file=\(.path):\(.line // \"?\")\"")
    echo "UNRESOLVED: $COMMENT_INFO"
    BODY_PREVIEW=$(echo "$ALL_COMMENTS" | jq -r ".[] | select(.id == ${ID}) | .body[:120]")
    echo "            ${BODY_PREVIEW}"
    UNRESOLVED=$((UNRESOLVED + 1))
  fi
done

echo ""
if [ "$UNRESOLVED" -gt 0 ]; then
  echo "${UNRESOLVED} code-line review comment(s) remain unaddressed."
  echo "Reply to each (implement the change or explain why not) before finalizing."
  exit 1
fi

echo "All code-line review comments have been addressed (last reply is from ${BOT_USER})."
exit 0
