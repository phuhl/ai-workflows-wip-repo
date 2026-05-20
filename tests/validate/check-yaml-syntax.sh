#!/usr/bin/env bash
set -euo pipefail

PASSED=0
FAILED=0
SKIPPED=0

echo "=== YAML syntax validation ==="

# Collect all YAML files to check
YAML_FILES=$(find .github/workflows wrappers -name '*.yml' -o -name '*.yaml' 2>/dev/null | sort)
SKILL_FILES=$(find .opencode/skills -name 'SKILL.md' 2>/dev/null | sort)

all_files=""
all_files+="$YAML_FILES"$'\n'
all_files+="$SKILL_FILES"

while IFS= read -r file; do
  [ -z "$file" ] && continue

  if [[ "$file" == */SKILL.md ]]; then
    # Extract just the YAML frontmatter for SKILL.md files
    frontmatter=$(sed -n '/^---$/,/^---$/{//!p;}' "$file")
    if [ -z "$frontmatter" ]; then
      echo "SKIP: $file (no frontmatter)"
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    echo "$frontmatter" > /tmp/yaml-check-$$
    check_target=/tmp/yaml-check-$$
  else
    check_target="$file"
  fi

  if python3 -c "
import sys, yaml
try:
    with open(sys.argv[1]) as f:
        yaml.safe_load(f)
except Exception as e:
    print(f'PARSE ERROR: {e}')
    sys.exit(1)
" "$check_target" 2>/dev/null; then
    echo "OK:   $file"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: $file (invalid YAML)"
    FAILED=$((FAILED + 1))
  fi

  rm -f /tmp/yaml-check-$$
done <<< "$all_files"

echo ""
echo "YAML files: $((PASSED + FAILED + SKIPPED)) | passed: $PASSED | failed: $FAILED | skipped: $SKIPPED"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
