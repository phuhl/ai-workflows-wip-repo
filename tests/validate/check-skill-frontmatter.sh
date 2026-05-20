#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR=".opencode/skills"
PASSED=0
FAILED=0

echo "=== Skill frontmatter validation ==="

for skill_dir in "$SKILLS_DIR"/*/; do
  dir_name=$(basename "$skill_dir")
  skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    echo "FAIL: $dir_name — missing SKILL.md"
    FAILED=$((FAILED + 1))
    continue
  fi

  first_line=$(head -1 "$skill_file")
  if [ "$first_line" != "---" ]; then
    echo "FAIL: $dir_name — SKILL.md does not start with ---"
    FAILED=$((FAILED + 1))
    continue
  fi

  frontmatter=$(sed -n '/^---$/,/^---$/{//!p;}' "$skill_file")
  if [ -z "$frontmatter" ]; then
    echo "FAIL: $dir_name — no frontmatter found"
    FAILED=$((FAILED + 1))
    continue
  fi

  errors=()

  fm_name=$(echo "$frontmatter" | sed -n 's/^name:\s*//p' | head -1)
  if [ -z "$fm_name" ]; then
    errors+=("missing 'name'")
  elif [ "$fm_name" != "$dir_name" ]; then
    errors+=("name '$fm_name' does not match directory '$dir_name'")
  fi

  if ! echo "$frontmatter" | grep -q '^description:'; then
    errors+=("missing 'description'")
  fi

  if ! echo "$frontmatter" | grep -q '^allowed-tools:'; then
    errors+=("missing 'allowed-tools'")
  fi

  has_context=$(echo "$frontmatter" | grep -c '^context:' || true)
  has_agent=$(echo "$frontmatter" | grep -cE '^(agent|subagent_type):' || true)
  if [ "$has_context" -eq 0 ]; then
    echo "WARN: $dir_name — missing 'context'"
  fi
  if [ "$has_agent" -eq 0 ]; then
    echo "WARN: $dir_name — missing 'agent' or 'subagent_type'"
  fi

  if [ ${#errors[@]} -gt 0 ]; then
    for e in "${errors[@]}"; do
      echo "FAIL: $dir_name — $e"
    done
    FAILED=$((FAILED + 1))
  else
    echo "OK:   $dir_name"
    PASSED=$((PASSED + 1))
  fi
done

echo ""
echo "Skills checked: $((PASSED + FAILED)) | passed: $PASSED | failed: $FAILED"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
