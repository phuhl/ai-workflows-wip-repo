#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/helpers.sh"

CHECKOFF="$ROOT_DIR/.opencode/skills/_shared/scripts/check-off-subtask.sh"
FIXTURES="$ROOT_DIR/tests/fixtures"

echo "=== Testing check-off-subtask.sh ==="

# --- Test 1: Missing arguments ---
echo "  Test: missing arguments"
set +e
output=$(bash "$CHECKOFF" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 with no args"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 2: Missing subtask text ---
echo "  Test: missing subtask text"
set +e
output=$(bash "$CHECKOFF" "42" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 with no subtask text"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 3: No repo determinable ---
echo "  Test: no repo determinable"
MOCK1=$(mktemp -d)
trap 'rm -rf "$MOCK1"' EXIT

cat > "$MOCK1/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"repo view"* ]]; then
  echo "" >&2
  exit 1
fi
exit 1
MOCKGH
chmod +x "$MOCK1/gh"

set +e
output=$(PATH="$MOCK1:$PATH" bash "$CHECKOFF" "42" "Open draft PR" 2>&1)
exit_code=$?
set -e
assert_exit 2 "$exit_code" "exits 2 when repo not determinable"

# --- Test 4: No subtasks comment found ---
echo "  Test: no subtasks comment on issue"
MOCK2=$(mktemp -d)
trap 'rm -rf "$MOCK2" "$MOCK1"' EXIT

cat > "$MOCK2/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"repo view"* ]]; then
  echo "test-org/test-repo"
elif [[ "$*" == *"issue view"* ]]; then
  # gh issue view with -q filter: output nothing (null)
  echo ""
fi
MOCKGH
chmod +x "$MOCK2/gh"

set +e
output=$(PATH="$MOCK2:$PATH" bash "$CHECKOFF" "42" "Open draft PR" "test-org/test-repo" 2>&1)
exit_code=$?
set -e
assert_exit 3 "$exit_code" "exits 3 when no subtasks comment"
assert_contains "$output" "No subtasks comment found" "reports missing comment"

# --- Test 5: Successful check-off ---
echo "  Test: successful check-off"
MOCK3=$(mktemp -d)
trap 'rm -rf "$MOCK3" "$MOCK2" "$MOCK1"' EXIT

cat > "$MOCK3/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"repo view"* ]]; then
  echo "test-org/test-repo"
elif [[ "$*" == *"issue view"* ]]; then
  echo '{"id":"1","body":"## Subtasks\n- [ ] Write stubs and failing tests\n- [ ] Implement logic to pass tests\n- [ ] Update docs / README if needed\n- [ ] Open draft PR\n- [ ] Fix issues found in audit"}'
elif [[ "$*" == *"api"* ]]; then
  exit 0
fi
MOCKGH
chmod +x "$MOCK3/gh"

set +e
output=$(PATH="$MOCK3:$PATH" bash "$CHECKOFF" "42" "Open draft PR" "test-org/test-repo" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "exits 0 on successful check-off"
assert_contains "$output" "Checked off: Open draft PR" "reports check-off success"

# --- Test 6: Warning when subtask text not found ---
echo "  Test: warning when subtask text not found"
MOCK4=$(mktemp -d)
trap 'rm -rf "$MOCK4" "$MOCK3" "$MOCK2" "$MOCK1"' EXIT

cat > "$MOCK4/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"repo view"* ]]; then
  echo "test-org/test-repo"
elif [[ "$*" == *"issue view"* ]]; then
  echo '{"id":"1","body":"## Subtasks\n- [ ] Write stubs and failing tests\n- [ ] Implement logic to pass tests"}'
elif [[ "$*" == *"api"* ]]; then
  exit 0
fi
MOCKGH
chmod +x "$MOCK4/gh"

set +e
output=$(PATH="$MOCK4:$PATH" bash "$CHECKOFF" "42" "Nonexistent Task" "test-org/test-repo" 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "exits 0 even when text not found (warning only)"
assert_contains "$output" "Warning:" "reports warning for missing text"

finish
