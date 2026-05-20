#!/usr/bin/env bash
set -euo pipefail

WORKFLOWS_DIR=".github/workflows"
WRAPPERS_DIR="wrappers"
PASSED=0
FAILED=0

echo "=== Wrapper → reusable workflow consistency ==="

check_workflow_exists() {
  local source="$1"
  local workflow_name="$2"

  if [ -f "$WORKFLOWS_DIR/$workflow_name" ]; then
    echo "OK:   $source → $workflow_name"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: $source → $workflow_name (file not found)"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
echo "--- Wrappers ---"

while IFS= read -r -d '' wrapper; do
  rel="${wrapper#./}"
  uses=$(grep -E '^\s+uses:' "$wrapper" | head -1 | sed 's/.*uses:\s*//' | tr -d '\r')

  if [ -z "$uses" ]; then
    echo "WARN: $rel — no uses: line found"
    continue
  fi

  # Extract the workflow filename from the uses path
  # Handles: apparts-js/ai-workflows/.github/workflows/reusable-xxx.yml@master
  # And: ./.github/workflows/reusable-xxx.yml
  workflow_name=$(echo "$uses" | sed 's|.*/\.github/workflows/||' | sed 's|\.github/workflows/||' | sed 's/@.*//')
  check_workflow_exists "$rel" "$workflow_name"
done < <(find "$WRAPPERS_DIR" -name '*.yml' -print0)

echo ""
echo "--- Master router internal refs ---"

master_router="$WORKFLOWS_DIR/reusable-opencode-master.yml"
if [ -f "$master_router" ]; then
  refs=$(grep -E '^\s+uses:' "$master_router" | sed 's/.*uses:\s*//' | tr -d '\r')

  while IFS= read -r uses_line; do
    [ -z "$uses_line" ] && continue
    # Skip self-reference
    echo "$uses_line" | grep -q "reusable-opencode-master" && continue

    workflow_name=$(echo "$uses_line" | sed 's|.*/\.github/workflows/||' | sed 's|\.github/workflows/||' | sed 's/@.*//')
    check_workflow_exists "master-router" "$workflow_name"
  done <<< "$refs"
fi

echo ""
echo "Checked: $((PASSED + FAILED)) | passed: $PASSED | failed: $FAILED"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
