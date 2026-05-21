# Plan — Post detailed subtasks comment

## Goal
Analyze the issue and codebase, then post a detailed, task-specific subtasks comment that breaks the work into concrete, committable steps.

## Important
The original issue body must remain untouched. Subtasks are tracked in a separate bot comment.
The 5 mandatory top-level checkboxes must be present with exact text — they drive the state machine in SKILL.md:

- `- [ ] Open draft PR`
- `- [ ] Write stubs and failing tests`
- `- [ ] Implement logic to pass tests`
- `- [ ] Update docs / README if needed`
- `- [ ] Fix issues found in audit`

## Steps

### 1. Analyze the issue

Read the issue body and all comments (already in `$ISSUE_BODY` and `$ISSUE_COMMENTS`). Identify:
- What problem needs solving and what the expected outcome is
- Constraints, requirements, and non-goals stated in the issue
- Edge cases, error states, or validation rules mentioned
- Past discussion, decisions, or gotchas from the comments
- Any stacking/dependency instructions (already parsed as `$BASE_BRANCH`)

### 2. Explore the codebase

Search for files and modules relevant to the issue. Be thorough:

- **Find existing related code**: Use Grep to search for function names, type names, file paths, or patterns mentioned in the issue. Look for existing tests, components, utilities, or API routes.
- **Understand conventions**: Read a few neighboring files to understand code style, testing patterns (describe/it vs test()), import conventions, and naming.
- **Identify touchpoints**: What files will be created or modified? What imports will they need? What existing functions will they call?
- **Map dependencies**: If the issue involves integrating with an API, database, or external service, find the existing client/wrapper.

Do NOT read the entire codebase. Focus on the files and modules directly relevant to the issue.

### 3. Draft the subtasks comment

Compose a detailed task list using the mandatory template **augmented with task-specific sub-items** and, when helpful, additional standalone items.

**Required structure (sub-items are the key addition):**

```
## Subtasks
- [ ] Open draft PR
- [ ] Write stubs and failing tests
  - [ ] Create <specific file/function stub>
  - [ ] Add failing test for <specific scenario/edge case>
  - [ ] ...
- [ ] Implement logic to pass tests
  - [ ] Implement <concrete function/module>
  - [ ] Handle <specific error/edge case>
  - [ ] Add <validation/error message>
  - [ ] ...
- [ ] Update docs / README if needed
  - [ ] <specific doc file or section to update>
  - [ ] ...
- [ ] Fix issues found in audit
```

**Guidelines for writing sub-items:**

- **Be concrete**: Reference specific file paths, function names, type names, or API endpoints (e.g., "`src/services/auth.ts:validateToken`").
- **Be actionable**: Each sub-item should describe a single, focused change that can be committed independently.
- **Cover edge cases**: Include sub-items for error handling, validation, empty states, and boundary conditions mentioned in the issue.
- **Order matters**: List sub-items in the order they should be implemented (dependencies first, then dependent work).
- **Be exhaustive**: The sub-items under "Implement logic to pass tests" should cover everything needed to close the issue — if someone read only the sub-items they should know exactly what to build.
- **Keep mandatory items top-level**: The 5 mandatory checkboxes must be at the top level (no indentation). State detection and check-off scripts depend on finding them verbatim.
- **Use sub-items for detail**: Put all task-specific detail in 2-space-indented sub-items under each mandatory checkbox. This keeps the mandatory items scannable by the state machine while providing rich guidance.
- **If a category has no work**: Add a single sub-item explaining why (e.g., `  - [ ] No README changes needed — implementation is internal to existing module`). This shows the category was considered, not skipped. The implementation phase will then strikethrough the parent checkbox.

**Additional standalone items (optional):**

If the issue requires work that doesn't fit naturally under any mandatory checkbox (e.g., data migration, configuration changes, dependency updates), add them as additional top-level checkboxes. The implementation phase will handle these alongside the mandatory ones. Only do this when the work is substantial enough to warrant its own tracking checkbox.

### 4. Post the comment

```bash
gh issue comment "$ARGUMENTS" --body "$(cat <<'SUBTASKS_EOF'
## Subtasks
<detailed subtasks content>
SUBTASKS_EOF
)"
```

Ensure the entire comment is well-formatted, with proper line breaks and no shell injection issues. Use a heredoc (`cat <<'EOF'`) for safety.

### 5. Continue

Load `references/02-create-pr.md` and continue in this session.
