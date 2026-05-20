#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/helpers.sh"

SYNC="$ROOT_DIR/.opencode/skills/_shared/scripts/sync-base-branch.sh"

echo "=== Testing sync-base-branch.sh ==="

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
  git branch --set-upstream-to=origin/master master
  cd - > /dev/null
}

# --- Test 1: Missing argument ---
echo "  Test: missing issue number"
set +e
output=$(bash "$SYNC" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 with no args"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 2: Empty argument ---
echo "  Test: empty issue number"
set +e
output=$(bash "$SYNC" "" 2>&1)
exit_code=$?
set -e
assert_exit 1 "$exit_code" "exits 1 with empty arg"
assert_contains "$output" "Usage:" "prints usage"

# --- Test 3: No PR found ---
echo "  Test: no PR found for issue"
TMP1=$(mktemp -d)
trap 'rm -rf "$TMP1"' RETURN

cd "$TMP1"
git init --quiet

MOCK1=$(mktemp -d)
trap 'rm -rf "$MOCK1" "$TMP1"' RETURN
cat > "$MOCK1/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"pr list"* ]]; then
  echo ""
fi
MOCKGH
chmod +x "$MOCK1/gh"

set +e
output=$(cd "$TMP1" && PATH="$MOCK1:$PATH" bash "$SYNC" 42 2>&1)
exit_code=$?
set -e
assert_exit 2 "$exit_code" "exits 2 when no PR found"
assert_contains "$output" "No open PR found" "reports no PR found"

cd "$ROOT_DIR"

# --- Test 4: Merge conflict ---
echo "  Test: merge conflict"
TMP2=$(mktemp -d)
trap 'rm -rf "$TMP2" "$MOCK1" "$TMP1"' RETURN

setup_repo_with_remote "$TMP2/workdir"
cd "$TMP2/workdir"

# Create feature branch with conflicting change
git checkout --quiet -b 42-my-feature
echo "feature content" > shared.txt
git add shared.txt
git commit -m "feature change" --quiet
git push --quiet origin 42-my-feature

# Back to master, make conflicting change
git checkout --quiet master
echo "different master content" > shared.txt
git add shared.txt
git commit -m "different master change" --quiet
git push --quiet origin master

MOCK2=$(mktemp -d)
trap 'rm -rf "$MOCK2" "$TMP2" "$MOCK1" "$TMP1"' RETURN
cat > "$MOCK2/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"pr list"* ]]; then
  echo "123"
elif [[ "$*" == *"pr view 123"* && "$*" == *"baseRefName"* ]]; then
  echo "master"
elif [[ "$*" == *"pr view 123"* && "$*" == *"headRefName"* ]]; then
  echo "42-my-feature"
fi
MOCKGH
chmod +x "$MOCK2/gh"

set +e
output=$(cd "$TMP2/workdir" && PATH="$MOCK2:$PATH" bash "$SYNC" 42 2>&1)
exit_code=$?
set -e
assert_exit 3 "$exit_code" "exits 3 on merge conflict"
assert_contains "$output" "Merge conflicts detected" "reports merge conflict"

cd "$ROOT_DIR"

# --- Test 5: Successful merge ---
echo "  Test: successful merge"
TMP3=$(mktemp -d)
trap 'rm -rf "$TMP3" "$MOCK2" "$TMP2" "$MOCK1" "$TMP1"' RETURN

setup_repo_with_remote "$TMP3/workdir"
cd "$TMP3/workdir"

# Create feature branch with non-conflicting change
git checkout --quiet -b 42-feat
echo "feature content" > g.txt
git add g.txt
git commit -m "feature work" --quiet
git push --quiet origin 42-feat

# Back to master, make unrelated change
git checkout --quiet master
echo "unrelated" > h.txt
git add h.txt
git commit -m "unrelated master change" --quiet
git push --quiet origin master

MOCK3=$(mktemp -d)
trap 'rm -rf "$MOCK3" "$TMP3" "$MOCK2" "$TMP2" "$MOCK1" "$TMP1"' RETURN

cat > "$MOCK3/gh" << 'MOCKGH'
#!/usr/bin/env bash
if [[ "$*" == *"pr list"* ]]; then
  echo "123"
elif [[ "$*" == *"pr view 123"* && "$*" == *"baseRefName"* ]]; then
  echo "master"
elif [[ "$*" == *"pr view 123"* && "$*" == *"headRefName"* ]]; then
  echo "42-feat"
fi
MOCKGH
chmod +x "$MOCK3/gh"

set +e
output=$(cd "$TMP3/workdir" && PATH="$MOCK3:$PATH" bash "$SYNC" 42 2>&1)
exit_code=$?
set -e
assert_exit 0 "$exit_code" "exits 0 on successful merge"
assert_contains "$output" "Base branch merged successfully" "reports success"

cd "$ROOT_DIR"

finish
