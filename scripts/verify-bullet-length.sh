#!/usr/bin/env bash
# Verify that each bullet point does not exceed 200 characters.
# Usage: bash verify-bullet-length.sh "bullet1" "bullet2" ...
# Exits with 1 if any bullet exceeds 200 chars.

set -euo pipefail

MAX_LENGTH=200
FAILED=0
BULLET_NUM=0

echo "=== Bullet length check (max ${MAX_LENGTH} chars) ==="

for bullet in "$@"; do
  BULLET_NUM=$((BULLET_NUM + 1))
  LENGTH=$(printf '%s' "$bullet" | wc -c)
  if [ "$LENGTH" -gt "$MAX_LENGTH" ]; then
    echo "FAIL: Bullet ${BULLET_NUM} is ${LENGTH} chars (max ${MAX_LENGTH})"
    echo "  ${bullet}"
    FAILED=1
  else
    echo "OK:   Bullet ${BULLET_NUM} — ${LENGTH} chars"
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "One or more bullets exceed ${MAX_LENGTH} characters. Please shorten them."
  exit 1
fi

echo "All ${BULLET_NUM} bullets within ${MAX_LENGTH} char limit."
exit 0
