# Report template

Output the verification report in this format. Replace `{{placeholder}}` with actual values.

```
# E2E Verification Report

## Scenario

**Name:** {{scenario-name}}
**Test repo:** {{test-repo}}
**Duration:** {{duration-seconds}}s
**Result:** {{PASS | FAIL}}

## Scenario Assertions

{{#each assertions}}
- [{{PASS | FAIL}}] {{message}}
{{/each}}

## Comment Quality

{{#each bot-comments}}
### Comment by {{author}} on {{issue-or-pr}}

- [{{PASS | FAIL}}] Run ID link present — {{evidence}}
- [{{PASS | FAIL}}] Updated in place — {{evidence}}
- [{{PASS | FAIL}}] No literal `\n` — {{evidence}}
- [{{PASS | FAIL}}] No raw JSON — {{evidence}}
- [{{PASS | FAIL}}] Summary inline — {{evidence}}

{{/each}}

## Log Findings

{{#each workflow-runs}}
### {{workflow-name}} (run {{run-id}}, event: {{event}})

- [{{PASS | FAIL}}] No failed API calls — {{evidence}}
- [{{PASS | FAIL}}] No permission issues — {{evidence}}
- [{{PASS | FAIL}}] Tools installed before use — {{evidence}}
- [{{PASS | FAIL}}] No unresolved expressions — {{evidence}}
- [{{PASS | FAIL}}] Bootstrap ran successfully — {{evidence}}
{{/each}}

## State Machine

- [{{PASS | FAIL}}] Label transitions correct — {{evidence}}
- [{{PASS | FAIL}}] No infinite loops — {{evidence}}
- [{{PASS | FAIL}}] Autofix attempts ≤ 3 — {{evidence}}
- [{{PASS | FAIL}}] Gate-running removed — {{evidence}}
- [{{PASS | FAIL}}] PR promoted after CI pass — {{evidence}}

## Context & Dispatch

- [{{PASS | FAIL}}] Pre-fetched context used — {{evidence}}
- [{{PASS | FAIL}}] Correct skill dispatched — {{evidence}}
- [{{PASS | FAIL}}] Skill used pre-fetched files, not gh calls — {{evidence}}
- [{{PASS | FAIL}}] Git safety — no protected dirs committed — {{evidence}}
- [{{PASS | FAIL}}] No CI deadlock — {{evidence}}

{{#if prompt}}
## Prompt-specific Checks

{{prompt-checks}}
{{/if}}

## Overall Verdict

**{{PASS | FAIL}}**

{{summary-paragraph}}
```
