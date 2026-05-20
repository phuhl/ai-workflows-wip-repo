#!/usr/bin/env bash
set -euo pipefail

ISSUE_NUMBER="${1:-}"

if [ -z "$ISSUE_NUMBER" ]; then
  echo "Usage: sync-base-branch.sh <issue-number>"
  exit 1
fi

PR_NUMBER=$(gh pr list --state open --json number,headRefName -q ".[] | select(.headRefName | startswith(\"${ISSUE_NUMBER}-\")) | .number" 2>/dev/null || echo "")

if [ -z "$PR_NUMBER" ]; then
  echo "No open PR found for issue #${ISSUE_NUMBER}"
  exit 2
fi

BASE=$(gh pr view "$PR_NUMBER" --json baseRefName -q '.baseRefName')
HEAD=$(gh pr view "$PR_NUMBER" --json headRefName -q '.headRefName')

echo "PR #${PR_NUMBER}: merging origin/${BASE} into ${HEAD}"

git fetch origin
git checkout "$HEAD"
git pull origin "$HEAD" 2>/dev/null || true
git merge "origin/${BASE}" || {
  echo "Merge conflicts detected."
  exit 3
}

echo "Base branch merged successfully."
