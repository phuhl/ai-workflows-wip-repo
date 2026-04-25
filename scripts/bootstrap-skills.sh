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

mkdir -p "$OUT_DIR"

# 1. Copy shared skills
if [[ -d "$SHARED_DIR" ]]; then
  cp -r "$SHARED_DIR"/* "$OUT_DIR/"
fi

# 2. Overlay local skills
if [[ -d "$LOCAL_DIR" ]]; then
  for skill in "$LOCAL_DIR"/*; do
    [[ -d "$skill" ]] || continue
    skill_name=$(basename "$skill")
    mkdir -p "$OUT_DIR/$skill_name"
    cp -r "$skill"/* "$OUT_DIR/$skill_name/"
  done
fi

echo "Skills bootstrapped to $OUT_DIR"
