#!/usr/bin/env bash
set -euo pipefail

COMMIT_MSG="${1:-}"
shift 2>/dev/null || true

if [ -z "$COMMIT_MSG" ] || [ $# -eq 0 ]; then
  echo "Usage: format-and-commit.sh <commit-message> <file...>"
  exit 1
fi

git add "$@"

STAGED=$(git diff --cached --name-only 2>/dev/null || true)
if [ -n "$STAGED" ]; then
  if [ -x "node_modules/.bin/prettier" ]; then
    echo "$STAGED" | xargs node_modules/.bin/prettier --write 2>/dev/null || true
  else
    echo "$STAGED" | xargs npx prettier --write 2>/dev/null || true
  fi
  if [ -x "node_modules/.bin/eslint" ]; then
    echo "$STAGED" | xargs node_modules/.bin/eslint --fix 2>/dev/null || true
  else
    echo "$STAGED" | xargs npx eslint --fix 2>/dev/null || true
  fi
  git add $STAGED 2>/dev/null || true
fi

git commit -m "$COMMIT_MSG"
git push origin HEAD 2>/dev/null || echo "Warning: push failed" >&2
