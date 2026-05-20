#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <pr-number> <in-reply-to-comment-id> <body>"
  exit 1
fi

PR_NUMBER="$1"
COMMENT_ID="$2"
BODY="$3"

jq -n \
  --argjson in_reply_to "$COMMENT_ID" \
  --arg body "$BODY" \
  '{
    body: $body,
    in_reply_to: $in_reply_to
  }' | gh api "repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments" --input -
