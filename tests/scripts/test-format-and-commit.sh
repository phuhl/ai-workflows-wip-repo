#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/helpers.sh"

FAC="$ROOT_DIR/.opencode/skills/_shared/scripts/format-and-commit.sh"

echo "=== Testing format-and-commit.sh ==="

setup_repo_with_remote() {
  local dir="$1"
  mkdir -p "$dir"
  cd "$dir"
  git init --quiet
  git config user.email "test@test.com"
  git config user.name "Test"
  echo "initial" > README.md
  git add README.md
  git commit -m "initial" --quiet
  git init --quiet --bare "$dir/../remote.git"
  git remote add origin "$dir/../remote.git"
  git push --quiet origin master
  cd - > /dev/null
}

# --- Test 1: Missing arguments ---
echo "  Test: missing arguments"
set +e
output=$(bash "$FAC" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 with no args"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 2: Missing files (only commit message) ---
echo "  Test: missing files argument"
set +e
output=$(bash "$FAC" "my commit msg" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 when files missing"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 3: Successful commit and push ---
echo "  Test: successful commit and push"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' RETURN

setup_repo_with_remote "$TMP/workdir"
cd "$TMP/workdir"

echo "new content" > file1.txt
echo "more content" > file2.txt

set +e
output=$(bash "$FAC" "feat: test commit (#42)" file1.txt file2.txt 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "succeeds with valid args"

# Verify commit was created
COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null || echo "")
assert_eq "feat: test commit (#42)" "$COMMIT_MSG" "commit message matches"

# Verify files are committed
COMMITTED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null || echo "")
assert_contains "$COMMITTED_FILES" "file1.txt" "file1.txt was committed"
assert_contains "$COMMITTED_FILES" "file2.txt" "file2.txt was committed"

cd "$ROOT_DIR"

# --- Test 4: Single file commit ---
echo "  Test: single file commit"
TMP2=$(mktemp -d)
trap 'rm -rf "$TMP2" "$TMP"' RETURN

setup_repo_with_remote "$TMP2/workdir"
cd "$TMP2/workdir"

echo "single file content" > only.txt

set +e
output=$(bash "$FAC" "fix: single file test" only.txt 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "succeeds with single file"

COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null || echo "")
assert_eq "fix: single file test" "$COMMIT_MSG" "commit message correct for single file"

cd "$ROOT_DIR"

# --- Test 5: Commit message with special characters ---
echo "  Test: commit message with special characters"
TMP3=$(mktemp -d)
trap 'rm -rf "$TMP3" "$TMP2" "$TMP"' RETURN

setup_repo_with_remote "$TMP3/workdir"
cd "$TMP3/workdir"

echo "special" > f.txt

set +e
output=$(bash "$FAC" "fix: special chars — em-dash & quotes 'test' (#99)" f.txt 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "succeeds with special chars in message"

COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null || echo "")
assert_eq "fix: special chars — em-dash & quotes 'test' (#99)" "$COMMIT_MSG" "special chars preserved in commit message"

cd "$ROOT_DIR"

# --- Test 6: Non-existent files ---
echo "  Test: non-existent file"
TMP4=$(mktemp -d)
trap 'rm -rf "$TMP4" "$TMP3" "$TMP2" "$TMP"' RETURN

setup_repo_with_remote "$TMP4/workdir"
cd "$TMP4/workdir"

set +e
output=$(bash "$FAC" "fix: bad file" nonexistent.txt 2>&1)
exit_code=$?
set -e
assert_contains "$output" "did not match" "reports non-existent file error"

cd "$ROOT_DIR"

finish
