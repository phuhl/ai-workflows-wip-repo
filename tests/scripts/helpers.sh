#!/usr/bin/env bash

PASSED=0
FAILED=0

assert_eq() {
  local expected="$1" actual="$2" msg="$3"
  if [ "$expected" = "$actual" ]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $msg"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $msg"
    echo "    expected: '$expected'"
    echo "    actual:   '$actual'"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $msg"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $msg"
    echo "    expected to contain: '$needle'"
    echo "    got: '$haystack'"
  fi
}

assert_exit() {
  local expected="$1" actual="$2" msg="$3"
  if [ "$expected" -eq "$actual" ]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $msg"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $msg"
    echo "    expected exit: $expected"
    echo "    actual exit:   $actual"
  fi
}

assert_file_exists() {
  local path="$1" msg="$2"
  if [ -f "$path" ]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $msg"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $msg — file '$path' does not exist"
  fi
}

assert_file_contains() {
  local path="$1" needle="$2" msg="$3"
  if grep -qF "$needle" "$path" 2>/dev/null; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $msg"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $msg — file '$path' does not contain '$needle'"
  fi
}

finish() {
  local total=$((PASSED + FAILED))
  echo ""
  echo "  $PASSED/$total passed"
  if [ "$FAILED" -gt 0 ]; then
    echo "  $FAILED failed"
    return 1
  fi
  return 0
}
