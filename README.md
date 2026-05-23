# ai-workflows

Shared OpenCode skills and reusable GitHub Actions workflows for repositories owned by `apparts-js`.

## Purpose

This repository centralizes all repository-generic AI automation so individual repos don't have to duplicate skills and workflows. Repo-specific overrides remain possible via local files.

## Setup (target repos)

### 1. Install the GitHub App

Install the `ai-workflows` GitHub App on your target repository from the organization's GitHub App settings. The App provides the bot's write access (creating PRs, pushing commits, posting comments).

### 2. Configure repository secrets

Go to `Settings → Secrets and variables → Actions → Secrets` and add:

| Secret | Description |
|--------|-------------|
| `OPENCODE_API_KEY` | API key for the OpenCode AI service |
| `APP_ID` | GitHub App ID (from the ai-workflows App) |
| `APP_PRIVATE_KEY` | GitHub App private key (from the ai-workflows App) |

These are required by every reusable workflow. Without them, the OpenCode workflow will fail with `startup_failure`.

### 3. Configure repository variables

Go to `Settings → Secrets and variables → Actions → Variables` and optionally add:

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_ACTORS` | Comma-separated list of GitHub usernames permitted to trigger workflows | `phuhl` |
| `BYPASS_ACTOR_CHECK` | Set to `true` to skip actor gating entirely | `false` (private repos automatically bypass) |

Example:
```
ALLOWED_ACTORS = phuhl,other-user
BYPASS_ACTOR_CHECK = false
```

### 4. Copy the wrapper workflow

Copy **only** `wrappers/master/opencode-master.yml` into your repo's `.github/workflows/` (rename it however you like). It subscribes to every trigger and routes to the correct reusable workflow automatically.

```bash
cp wrappers/master/opencode-master.yml  <target-repo>/.github/workflows/opencode.yml
```

> **Note on permissions:** The master wrapper declares a **union** of all permissions (`contents: write`, `pull-requests: write`, `issues: write`, `checks: read`, `id-token: write`). Every routed job inherits this same broad set because GitHub Actions ignores `permissions` declared inside called reusable workflows.

> **Important:** The default wrapper listens for a CI workflow called `"Run API Tests"` (used by the complete-gate trigger). You **must** change this to the name of your repository's **longest-running required status check**:
> ```yaml
> workflow_run:
>   workflows: ["Your CI Workflow Name"]
>   types: [completed]
> ```
> The gate uses this trigger to know when to evaluate CI results. If you listen to a short workflow, the gate may run before other checks finish. If you prefer not to use `workflow_run`, remove it — the gate still works via the `pull_request: labeled` trigger (when `auto-review` is added).

### 5. Actor gating

By default, only the user `phuhl` can trigger workflows. To allow additional users, set the `ALLOWED_ACTORS` repository variable (comma-separated usernames). To bypass actor checks entirely (e.g., for private repos where all collaborators are trusted), set `BYPASS_ACTOR_CHECK` to `true` in repository variables. Private repos automatically bypass actor checks.

### 6. Optional local skill references (recommended for better performance)

Some skills reference customization files that are deliberately not included in this repo. Target repos can add these to give the AI repo-specific guidance:

- `.opencode/skills/code-review/references/checklist.md` — Repo-specific review checklist
- `.opencode/skills/verify-tests/references/coverage-map.md` — Test coverage expectations
- `.opencode/skills/verify-tests/references/gotchas.md` — Common testing gotchas

All are **optional**. If a file doesn't exist, the skill falls back to generic behavior.

## Commands

Post these as a comment on a pull request or issue (gated to allowed actors). Each also works with `/opencode` prefix.

| Command | What it does |
|---|---|
| `/oc plan` | Reads an issue and posts a structured implementation plan with risk analysis |
| `/oc code-review` | Runs automated code review (correctness, tests, guidelines) and posts findings as inline comments |
| `/oc fix-pr` | Fixes failing CI checks on the PR (reads logs, fixes root cause, pushes) |
| `/oc address-review` | Addresses all unresolved code-line review comments (fixes code or replies with explanations) |
| `/oc complete-gate` | Manually triggers the complete-gate evaluation (CI monitoring + review) |
| `/oc do <prompt>` | Executes an arbitrary prompt on an issue or PR |

See [`USER_GUIDE.md`](USER_GUIDE.md) for the full lifecycle walkthrough.

## Structure

```
apparts-js/ai-workflows/
├── .github/workflows/          # Reusable workflows consumed by target repos
│   ├── reusable-opencode-master.yml   # master router — calls the ones below
│   ├── reusable-opencode.yml          # /oc command dispatcher (generic commands)
│   ├── reusable-opencode-address-review.yml
│   ├── reusable-opencode-code-review.yml
│   ├── reusable-opencode-complete-gate.yml
│   ├── reusable-opencode-do.yml
│   ├── reusable-opencode-fix-pr.yml
│   ├── reusable-opencode-plan-and-implement.yml
│   └── reusable-opencode-plan.yml
├── .opencode/skills/           # Skills consumed by target repos (copied by bootstrap)
│   ├── _shared/                # Shared infrastructure (references, scripts)
│   ├── code-guidelines-check/
│   ├── code-review/
│   ├── deduplication-check/
│   ├── fix-pr/
│   ├── fix-pr-ci/
│   ├── plan/
│   ├── plan-and-implement/
│   ├── resolve-pr-conflicts/
│   ├── review-pr/
│   ├── user-do/
│   └── verify-tests/
├── src/skills/                  # Internal skills for ai-workflows development (NOT copied)
│   └── verify-e2e/              # E2E verification skill
├── .opencode/plugins/          # CLI runtime plugins
│   ├── file-hook.ts            # Post-write prettier/eslint/tsc
│   └── git-guard.ts            # Prevents staging protected directories
├── scripts/
│   ├── bootstrap-skills.ts
│   ├── verify-bullet-length.ts
│   └── verify-no-unresolved-comments.ts
├── tests/                      # Test suite
│   ├── run.ts                  # Test runner (unit + structural)
│   ├── validate/               # Structural validation tests
│   ├── scripts/                # Script unit tests
│   ├── fixtures/               # Test fixtures
│   └── e2e/                    # End-to-end tests
│       ├── run.ts              # E2E CLI entrypoint
│       ├── engine.ts           # GitHub API abstraction via gh CLI
│       ├── utils.ts            # Polling, retry, assertions
│       └── scenarios/          # 7 E2E test scenarios
├── wrappers/
│   └── master/
│       └── opencode-master.yml  # Wrapper template for target repos
├── opencode.json
├── package.json
├── AGENTS.md                   # AI-readable project documentation
├── README.md
└── USER_GUIDE.md               # End-user tutorial
```

## Skill overrides

Before OpenCode runs, the reusable workflow executes `npx tsx scripts/bootstrap-skills.ts`, which:

1. Copies all shared skills into `.opencode/skills/`.
2. Overlays any local skills on top (local files take precedence).
3. Never deletes local-only skills that have no shared counterpart.

This means a target repo can override individual skills or add repo-specific reference documents without forking the central repository.

## Local development (this repo)

### Unit and structural tests

```bash
npm test                 # or: npx tsx tests/run.ts
```

The suite has four layers:

1. **Structural validation** (`tests/validate/`) — Skill frontmatter, reference integrity, tool permission requirements, wrapper→workflow consistency, YAML syntax.
2. **Script tests** (`tests/scripts/`) — Unit tests for command scripts (mocked `gh` CLI).
3. **Plugin unit tests** (`.opencode/tests/`) — Vitest tests for runtime plugins.
4. **E2E tests** (`tests/e2e/`) — Integration tests against a dummy target repo.

### E2E tests

The E2E test suite simulates real user interactions against a dedicated dummy repository. It creates issues, labels them, posts `/oc` commands, and verifies the workflows and skills execute correctly end-to-end.

**Prerequisites:**
1. A dedicated test repo with the wrapper workflow, OpenCode config, dummy source code, and the GitHub App installed.
2. All required secrets and variables configured on the test repo.
3. A `.env` file in this repo's root:
   ```
   GITHUB_TOKEN=<tester-pat-with-read-write-access>
   TEST_REPO=owner/repo-name
   ```

**Usage:**
```bash
npm run test:e2e -- --repo <owner/repo> --all       # Run all scenarios
npm run test:e2e -- --repo <owner/repo> --scenario plan-only  # Run one
npm run test:e2e -- --list                           # List scenarios
```

See `AGENTS.md` for detailed E2E architecture documentation.

## Notes

- Actor gating is configurable per-repo via `ALLOWED_ACTORS` and `BYPASS_ACTOR_CHECK` variables (see Setup step 3).
- No version pinning — target repos always pull `@master` (or the default branch).
- The `complete-gate` workflow queries the branch protection API via the GitHub App token to verify required status checks, not just any reported check. This prevents false-positive "CI passing" labels when a required check hasn't reported yet.
- PR stacking is supported: if an issue comment says "stack on #42" or "base on #42", the `plan-and-implement` skill will use that PR's branch as the base instead of `master`.
- After every code commit, `npx eslint --fix` runs alongside `npx prettier --write` to catch lint errors locally, avoiding wasted CI cycles on formatting/lint failures.
