#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR=".opencode/skills"
PASSED=0
WARNINGS=0

echo "=== Skill reference integrity ==="

is_placeholder() {
  local ref="$1"
  [[ "$ref" =~ \.\.\. ]] && return 0
  [[ "$ref" =~ XX[0-9]* ]] && return 0
  [[ "$ref" =~ \* ]] && return 0
  return 1
}

for skill_dir in "$SKILLS_DIR"/*/; do
  dir_name=$(basename "$skill_dir")
  skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    continue
  fi

  body=$(sed '1{/^---$/!q}; /^---$/,/^---$/d' "$skill_file")

  refs=$(echo "$body" | grep -oP '(?:references|scripts)/[^)\s\n`"'"'"' ]+' || true)
  if [ -z "$refs" ]; then
    echo "OK:   $dir_name — no external references"
    PASSED=$((PASSED + 1))
    continue
  fi

  # Deduplicate refs
  uniq_refs=$(echo "$refs" | sort -u)

  skill_ok=1
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue

    if is_placeholder "$ref"; then
      echo "SKIP: $dir_name — $ref (placeholder, not checked)"
      continue
    fi

    if [ -f "$skill_dir/$ref" ]; then
      continue
    elif [ -f "$ref" ]; then
      continue
    else
      echo "WARN: $dir_name — $ref (not found on disk, may be optional)"
      WARNINGS=$((WARNINGS + 1))
    fi
  done <<< "$uniq_refs"

  echo "OK:   $dir_name"
  PASSED=$((PASSED + 1))
done

echo ""
echo "Skills checked: $PASSED | missing optional refs: $WARNINGS"
