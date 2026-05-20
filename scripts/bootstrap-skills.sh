#!/usr/bin/env bash
set -euo pipefail

SHARED_DIR=""
LOCAL_DIR=""
OUT_DIR=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --shared-dir) SHARED_DIR="$2"; shift 2 ;;
    --local-dir)  LOCAL_DIR="$2";  shift 2 ;;
    --out-dir)    OUT_DIR="$2";    shift 2 ;;
    *) echo "Unknown option $1"; exit 1 ;;
  esac
done

# Build into a temp dir to avoid cp copying files onto themselves when
# local-dir and out-dir are the same path.
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Copy shared skills
if [[ -d "$SHARED_DIR" ]]; then
  cp -r "$SHARED_DIR"/* "$TMP_DIR/"
fi

# 2. Overlay local skills
if [[ -d "$LOCAL_DIR" ]]; then
  for skill in "$LOCAL_DIR"/*; do
    [[ -d "$skill" ]] || continue
    skill_name=$(basename "$skill")
    mkdir -p "$TMP_DIR/$skill_name"
    cp -r "$skill"/* "$TMP_DIR/$skill_name/"
  done
fi

# 3. Move merged result to output dir
mkdir -p "$OUT_DIR"
rm -rf "$OUT_DIR"/*
cp -r "$TMP_DIR"/* "$OUT_DIR/"

# 4. Bootstrap plugins (via staging dir to avoid cp-on-self when local=out)
# Shared plugins live at $SHARED_DIR/../plugins (e.g. .ai-workflows/.opencode/plugins/)
# Local plugins live at $LOCAL_DIR/../plugins (e.g. .opencode/plugins/)
SHARED_PLUGINS_DIR="${SHARED_DIR%/skills}/plugins"
LOCAL_PLUGINS_DIR="${LOCAL_DIR%/skills}/plugins"
OUT_PLUGINS_DIR="$OUT_DIR/../plugins"

if [ -d "$SHARED_PLUGINS_DIR" ] || [ -d "$LOCAL_PLUGINS_DIR" ]; then
  STAGING="$TMP_DIR/plugins-stage"
  mkdir -p "$STAGING"

  if [ -d "$SHARED_PLUGINS_DIR" ]; then
    cp -r "$SHARED_PLUGINS_DIR"/* "$STAGING/"
  fi

  if [ -d "$LOCAL_PLUGINS_DIR" ]; then
    cp -r "$LOCAL_PLUGINS_DIR"/* "$STAGING/"
  fi

  mkdir -p "$OUT_PLUGINS_DIR"
  rm -rf "$OUT_PLUGINS_DIR"/*
  cp -r "$STAGING"/* "$OUT_PLUGINS_DIR/"
fi

echo "Skills bootstrapped to $OUT_DIR"

# 5. Protect bootstrapped dirs from accidental commits
echo "*" > "$OUT_DIR/.gitignore"
if [ -n "${OUT_PLUGINS_DIR:-}" ] && [ -d "$OUT_PLUGINS_DIR" ]; then
  echo "*" > "$OUT_PLUGINS_DIR/.gitignore"
fi

# 6. Ensure /tmp/** is allowed in opencode permissions (for temp file writes used by skills)
if [ -f ".opencode.json" ]; then
  tmp_config=$(mktemp)
  jq '.permission.external_directory["/tmp/**"] = "allow"' .opencode.json > "$tmp_config"
  mv "$tmp_config" .opencode.json
else
  echo '{ "permission": { "external_directory": { "/tmp/**": "allow" } } }' > .opencode.json
fi
