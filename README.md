# ai-workflows

Shared OpenCode skills and reusable GitHub Actions workflows for repositories owned by `apparts-js`.

## Purpose

This repository centralizes all repository-generic AI automation so individual repos don't have to duplicate skills and workflows. Repo-specific overrides remain possible via local files.

## Structure

```
apparts-js/ai-workflows/
├── .github/workflows/          # Reusable workflows consumed by target repos
│   ├── reusable-opencode-master.yml   # master router — calls the ones below
│   ├── reusable-opencode.yml          # /oc command dispatcher (generic commands)
│   ├── reusable-opencode-address-review.yml
│   ├── reusable-opencode-code-review.yml
│   ├── reusable-opencode-complete-gate.yml
│   ├── reusable-opencode-fix-pr.yml
│   ├── reusable-opencode-plan-and-implement.yml
│   └── reusable-opencode-plan.yml     # /oc plan — reads issue & code, posts plan
├── .opencode/skills/           # Generic OpenCode skills
│   ├── code-guidelines-check/
│   ├── code-review/            # generic template
│   ├── fix-pr-ci/
│   ├── fix-pr/
│   ├── plan/                   # /oc plan — analysis & options (no implementation)
│   ├── plan-and-implement/
│   ├── resolve-pr-conflicts/
│   ├── review-pr/
│   └── verify-tests/           # generic template
├── scripts/
│   ├── bootstrap-skills.ts              # Merges shared + local skills at CI time
│   ├── verify-bullet-length.ts          # Checks summary bullets ≤ 200 chars
│   └── verify-no-unresolved-comments.ts # Verifies all code-line review comments addressed
├── wrappers/
│   ├── master/                 # Single wrapper that handles all triggers
│   │   └── opencode-master.yml
│   └── individual/             # Separate wrappers per trigger
│       ├── opencode.yml
│       ├── opencode-address-review.yml
│       ├── opencode-code-review.yml
│       ├── opencode-complete-gate.yml
│       ├── opencode-fix-pr.yml
│       ├── opencode-plan-and-implement.yml
│       └── opencode-plan.yml
├── opencode.json              # OpenCode config — auto-created for target repos by bootstrap
├── README.md
└── USER_GUIDE.md              # Tutorial on how to use the automation
```

## Tutorial

See [`USER_GUIDE.md`](USER_GUIDE.md) for a step-by-step walkthrough of the OpenCode workflow from a user's perspective — creating issues, automatic review, CI fixes, and manual review requests.

## How target repos consume this

### Option A — One master wrapper (recommended)

Copy **only** `wrappers/opencode-master.yml` into your repo's `.github/workflows/` (rename it however you like). It subscribes to every trigger and routes to the correct reusable workflow automatically.

```bash
cp wrappers/master/opencode-master.yml  <target-repo>/.github/workflows/opencode.yml
```

> **Note on permissions:** The master wrapper declares a **union** of all permissions (`contents: write`, `pull-requests: write`, `issues: write`, `checks: read`, `id-token: write`). Every routed job inherits this same broad set because GitHub Actions ignores `permissions` declared inside called reusable workflows. If you need finer-grained control per trigger, use Option B.

### Option B — Individual wrappers

If you prefer separate workflow files in the Actions UI, copy the individual wrappers instead:

```bash
cp wrappers/individual/opencode.yml                 <target-repo>/.github/workflows/
cp wrappers/individual/opencode-code-review.yml     <target-repo>/.github/workflows/
cp wrappers/individual/opencode-address-review.yml  <target-repo>/.github/workflows/
cp wrappers/individual/opencode-complete-gate.yml   <target-repo>/.github/workflows/
cp wrappers/individual/opencode-fix-pr.yml          <target-repo>/.github/workflows/
cp wrappers/individual/opencode-plan-and-implement.yml <target-repo>/.github/workflows/
cp wrappers/individual/opencode-plan.yml            <target-repo>/.github/workflows/
```

Each wrapper declares only the permissions that specific workflow needs.

> **Important:** The `opencode-complete-gate.yml` wrapper includes a `workflow_run` trigger that listens for a specific CI workflow to complete:
> ```yaml
> workflow_run:
>   workflows: ["Run API Tests"]
>   types: [completed]
> ```
> You **must** change `"Run API Tests"` to the name of your repository's **longest-running required status check**. The gate uses this trigger to know when to evaluate CI results. If you listen to a short workflow, the gate may run before other checks finish, causing concurrent or premature execution. If you do not have a suitable workflow or prefer not to use `workflow_run`, you can remove it — the gate will still work via the `pull_request: labeled` trigger (when the `auto-review` label is added).

### Optional local skill references (recommended for better performance)

Some skills reference customization files that are deliberately not included in this repo. Target repos can add these to give the AI repo-specific guidance instead of making it infer conventions from codebase exploration:

- `.opencode/skills/code-review/references/checklist.md` — Repo-specific review checklist
- `.opencode/skills/verify-tests/references/coverage-map.md` — Test coverage expectations
- `.opencode/skills/verify-tests/references/gotchas.md` — Common testing gotchas

All are **optional**. If a file doesn't exist, the skill falls back to generic behavior.

## Skill overrides

Before OpenCode runs, the reusable workflow executes `npx tsx scripts/bootstrap-skills.ts`, which:

1. Copies all shared skills into `.opencode/skills/`.
2. Overlays any local skills on top (local files take precedence).
3. Never deletes local-only skills that have no shared counterpart.

This means a target repo can override individual skills or add repo-specific reference documents without forking the central repository.

## Notes

- All workflows hardcode `phuhl` as the triggering actor/reviewer for now.
- No version pinning — target repos always pull `@master` (or the default branch).
- `.claude/skills/` is out of scope.
- The `complete-gate` workflow queries the branch protection API via the GitHub App token to verify required status checks, not just any reported check. This prevents false-positive "CI passing" labels when a required check hasn't reported yet.
- PR stacking is supported: if an issue comment says "stack on #42" or "base on #42", the `plan-and-implement` skill will use that PR's branch as the base instead of `master`.
- After every code commit, `npx eslint --fix` runs alongside `npx prettier --write` to catch lint errors locally, avoiding wasted CI cycles on formatting/lint failures.
