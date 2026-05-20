#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/helpers.sh"

VERIFY="$ROOT_DIR/scripts/verify-no-unresolved-comments.sh"
MOCK_GH="$ROOT_DIR/tests/helpers/mock-gh"
FIXTURES="$ROOT_DIR/tests/fixtures"

echo "=== Testing verify-no-unresolved-comments.sh ==="

MOCK_DIR=$(mktemp -d)
trap 'rm -rf "$MOCK_DIR"' EXIT

ln -s "$MOCK_GH" "$MOCK_DIR/gh"
chmod +x "$MOCK_GH"

run_verify() {
  local fixture="$1" repo="$2" bot_user="${3:-opencode[bot]}"
  export MOCK_GH_FIXTURE="$FIXTURES/$fixture"
  PATH="$MOCK_DIR:$PATH" "$VERIFY" 42 "$repo" "$bot_user" 2>&1
}

# --- Test 1: Missing PR number (empty string) ---
echo "  Test: missing PR number"
set +e
output=$("$VERIFY" "" "test-org/test-repo" 2>&1)
exit_code=$?
set -e
assert_exit 2 "$exit_code" "exits 2 when PR number is empty"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 2: Empty comments ---
echo "  Test: empty comments (no threads)"
set +e
output=$(run_verify "pr-comments-empty.json" "test-org/test-repo")
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with no comments"

# --- Test 3: Bot-only comments (bot starts and bot replies last) ---
echo "  Test: only opencode[bot] comments"
set +e
output=$(run_verify "pr-comments-bot-only.json" "test-org/test-repo")
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with only bot comments"
assert_contains "$output" "last reply is from opencode[bot]" "confirms bot resolution"

# --- Test 4: Unresolved human comments (no replies) ---
echo "  Test: unresolved human comments"
set +e
output=$(run_verify "pr-comments-unresolved.json" "test-org/test-repo")
exit_code=$?
set -e
assert_exit 1 "$exit_code" "fails with unresolved comments"
assert_contains "$output" "UNRESOLVED:" "flags unresolved"
assert_contains "$output" "src/foo.ts" "shows file path"

# --- Test 5: Resolved comments (last reply is opencode[bot]) ---
echo "  Test: resolved human comments"
set +e
output=$(run_verify "pr-comments-resolved.json" "test-org/test-repo")
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with addressed comments"

# --- Test 6: Resolved comments with custom bot name (fixture mismatch) ---
echo "  Test: custom bot name vs opencode[bot] fixture (mismatch)"
set +e
output=$(run_verify "pr-comments-resolved.json" "test-org/test-repo" "apparts-ai-workflow[bot]")
exit_code=$?
set -e
assert_exit 1 "$exit_code" "fails when bot name does not match fixture"

# --- Test 7: Resolved comments with custom bot name matching fixture ---
echo "  Test: custom bot name (apparts-ai-workflow[bot]) matching fixture"
set +e
output=$(run_verify "pr-comments-resolved-custom-bot.json" "test-org/test-repo" "apparts-ai-workflow[bot]")
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes when bot name matches fixture"
assert_contains "$output" "last reply is from apparts-ai-workflow[bot]" "uses custom bot name in output"

# --- Test 8: gh API failure gracefully handled ---
echo "  Test: gh API failure (missing fixture)"
set +e
output=$(MOCK_GH_FIXTURE="/nonexistent/file.json" PATH="$MOCK_DIR:$PATH" \
  "$VERIFY" 42 "test-org/test-repo" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "exits 0 gracefully when gh API fails"

finish
