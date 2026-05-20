#!/usr/bin/env bash
set -euo pipefail

ISSUE_NUMBER="${1:-}"
SUBTASK_TEXT="${2:-}"
REPO="${3:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")}"

if [ -z "$ISSUE_NUMBER" ] || [ -z "$SUBTASK_TEXT" ]; then
  echo "Usage: check-off-subtask.sh <issue-number> <subtask-text> [repo]"
  exit 1
fi

if [ -z "$REPO" ]; then
  echo "Error: could not determine repository. Pass it as the third argument."
  exit 2
fi

SUBTASK_INFO=$(gh issue view "$ISSUE_NUMBER" --json comments -q '.comments[] | select(.body | contains("## Subtasks")) | {id,body}' 2>/dev/null || echo "")

if [ -z "$SUBTASK_INFO" ]; then
  echo "No subtasks comment found on issue #${ISSUE_NUMBER}"
  exit 3
fi

COMMENT_ID=$(echo "$SUBTASK_INFO" | jq -r '.id')

UPDATED_BODY=$(echo "$SUBTASK_INFO" | jq -r '.body' | sed "s|- \[ \] ${SUBTASK_TEXT}|- [x] ${SUBTASK_TEXT}|g")

if [ "$UPDATED_BODY" = "$(echo "$SUBTASK_INFO" | jq -r '.body')" ]; then
  echo "Warning: subtask text '${SUBTASK_TEXT}' not found as unchecked item"
fi

gh api "repos/${REPO}/issues/comments/${COMMENT_ID}" -X PATCH -f body="${UPDATED_BODY}"
echo "Checked off: ${SUBTASK_TEXT}"
