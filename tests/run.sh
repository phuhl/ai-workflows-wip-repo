#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

FAILURES=0

echo "=========================================="
echo "  AI Workflows — Local Test Suite"
echo "=========================================="
echo ""

# --- 1. Structural validation ---
echo "--- 1. Structural validation ---"
echo ""

if bash tests/validate/check-skill-frontmatter.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/validate/check-references.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/validate/check-wrapper-consistency.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/validate/check-yaml-syntax.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

# --- 2. Shell script tests ---
echo ""
echo "--- 2. Shell script tests ---"
echo ""

if bash tests/scripts/test-bootstrap-skills.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/scripts/test-verify-bullet-length.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/scripts/test-verify-no-unresolved-comments.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/scripts/test-format-and-commit.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/scripts/test-sync-base-branch.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

echo ""
if bash tests/scripts/test-check-off-subtask.sh; then
  echo "  PASSED"
else
  FAILURES=$((FAILURES + 1))
  echo "  FAILED"
fi

# --- 3. Plugin tests (vitest) ---
echo ""
echo "--- 3. Plugin tests ---"
echo ""

if [ -d .opencode/node_modules/vitest ]; then
  if (cd .opencode && npx vitest run 2>&1); then
    echo "  PASSED"
  else
    FAILURES=$((FAILURES + 1))
    echo "  FAILED"
  fi
else
  echo "  SKIP: vitest not installed. Run: cd .opencode && npm install"
fi

echo ""
echo "=========================================="
if [ "$FAILURES" -eq 0 ]; then
  echo "  All tests passed."
  exit 0
else
  echo "  $FAILURES suite(s) failed."
  exit 1
fi
