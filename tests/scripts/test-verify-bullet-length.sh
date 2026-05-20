#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/helpers.sh"

VERIFY="$ROOT_DIR/scripts/verify-bullet-length.sh"

echo "=== Testing verify-bullet-length.sh ==="

# --- Test 1: All bullets within limit ---
echo "  Test: bullets within limit"
set +e
output=$("$VERIFY" "short bullet" "another short one" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with short bullets"
assert_contains "$output" "All 2 bullets" "reports count"
assert_contains "$output" "within 200 char limit" "reports success"

# --- Test 2: Bullet exactly at limit ---
echo "  Test: bullet exactly at 200 chars"
bullet200=$(printf 'x%.0s' $(seq 1 200))
set +e
output=$("$VERIFY" "$bullet200" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with exactly 200 chars"

# --- Test 3: Bullet over limit ---
echo "  Test: bullet over 200 chars"
bullet201=$(printf 'x%.0s' $(seq 1 201))
set +e
output=$("$VERIFY" "$bullet201" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "fails with 201 chars"
assert_contains "$output" "FAIL:" "reports failure"
assert_contains "$output" "201 chars" "reports actual length"

# --- Test 4: Mix of pass and fail ---
echo "  Test: mix of pass and fail"
bullet201=$(printf 'x%.0s' $(seq 1 201))
set +e
output=$("$VERIFY" "ok bullet" "$bullet201" "also ok" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "fails when one bullet is too long"
assert_contains "$output" "Bullet 2" "identifies the failing bullet"

# --- Test 5: Unicode characters ---
echo "  Test: unicode multibyte characters"
unicode_bullet="This bullet has unicode chars: äöüñçé — it should count bytes"
set +e
output=$("$VERIFY" "$unicode_bullet" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with unicode (under 200 bytes)"

# --- Test 6: Empty input ---
echo "  Test: no bullets"
set +e
output=$("$VERIFY" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "passes with no bullets"
assert_contains "$output" "All 0 bullets" "reports zero bullets"

finish
