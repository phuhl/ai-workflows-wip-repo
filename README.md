# ai-workflows

Shared OpenCode skills and reusable GitHub Actions workflows for repositories owned by `apparts-js`.

## Purpose

This repository centralizes all repository-generic AI automation so individual repos don't have to duplicate skills and workflows. Repo-specific overrides remain possible via local files.

## Structure

```
apparts-js/ai-workflows/
├── .github/workflows/          # Reusable workflows consumed by target repos
│   ├── reusable-opencode-master.yml   # master router — calls the ones below
│   ├── reusable-opencode.yml
│   ├── reusable-opencode-address-review.yml
│   ├── reusable-opencode-code-review.yml
│   ├── reusable-opencode-complete-gate.yml
│   └── reusable-opencode-plan-and-implement.yml
├── .opencode/skills/           # Generic OpenCode skills
│   ├── code-guidelines-check/
│   ├── code-review/            # generic template
│   ├── fix-pr-ci/
│   ├── fix-pr/
│   ├── plan-and-implement/
│   ├── resolve-pr-conflicts/
│   ├── review-pr/
│   └── verify-tests/           # generic template
├── scripts/
│   └── bootstrap-skills.sh     # Merges shared + local skills at CI time
├── wrappers/
│   ├── master/                 # Single wrapper that handles all triggers
│   │   └── opencode-master.yml
│   └── individual/             # Separate wrappers per trigger
│       ├── opencode.yml
│       ├── opencode-address-review.yml
│       ├── opencode-code-review.yml
│       ├── opencode-complete-gate.yml
│       └── opencode-plan-and-implement.yml
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

### Option B — Individual wrappers

If you prefer separate workflow files in the Actions UI, copy the individual wrappers instead:

```bash
cp wrappers/individual/opencode.yml                 <target-repo>/.github/workflows/
cp wrappers/individual/opencode-code-review.yml     <target-repo>/.github/workflows/
cp wrappers/individual/opencode-address-review.yml  <target-repo>/.github/workflows/
cp wrappers/individual/opencode-complete-gate.yml   <target-repo>/.github/workflows/
cp wrappers/individual/opencode-plan-and-implement.yml <target-repo>/.github/workflows/
```

### Optional local skill references

For repo-specific checklists that override or extend the generic skills, add:
- `.opencode/skills/code-review/references/checklist.md`
- `.opencode/skills/verify-tests/references/coverage-map.md`
- `.opencode/skills/verify-tests/references/gotchas.md`

Then remove any duplicated generic skills/workflows from the target repo.

## Skill overrides

Before OpenCode runs, the reusable workflow executes `scripts/bootstrap-skills.sh`, which:

1. Copies all shared skills into `.opencode/skills/`.
2. Overlays any local skills on top (local files take precedence).
3. Never deletes local-only skills that have no shared counterpart.

This means a target repo can override individual skills or add repo-specific reference documents without forking the central repository.

## Notes

- All workflows hardcode `phuhl` as the triggering actor/reviewer for now.
- No version pinning — target repos always pull `@main` (or the default branch).
- `.claude/skills/` is out of scope.
