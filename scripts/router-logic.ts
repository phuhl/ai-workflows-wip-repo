export type EventName =
  | "issue_comment"
  | "pull_request_review_comment"
  | "pull_request_review"
  | "pull_request"
  | "issues"
  | "workflow_dispatch"
  | "workflow_run";

export type WorkflowName =
  | "opencode-dispatcher"
  | "opencode-do"
  | "opencode-plan"
  | "opencode-fix-pr"
  | "opencode-code-review"
  | "opencode-address-review"
  | "opencode-complete-gate"
  | "opencode-plan-and-implement";

export const ALL_WORKFLOWS: WorkflowName[] = [
  "opencode-dispatcher",
  "opencode-do",
  "opencode-plan",
  "opencode-fix-pr",
  "opencode-code-review",
  "opencode-address-review",
  "opencode-complete-gate",
  "opencode-plan-and-implement",
];

export interface RouterEvent {
  event_name: EventName;
  actor: string;
  comment_body?: string;
  is_pr_comment?: boolean;
  review_user?: string;
  review_state?: "approved" | "changes_requested" | "commented";
  label_name?: string;
}

function hasCommand(body: string, command: string): boolean {
  return (
    body.includes(`/oc ${command}`) || body.includes(`/opencode ${command}`)
  );
}

function containsSlashCommand(body: string): boolean {
  return (
    body.startsWith("/oc") ||
    body.includes(" /oc") ||
    body.startsWith("/opencode") ||
    body.includes(" /opencode")
  );
}

export function routeEvent(event: RouterEvent): WorkflowName[] {
  const results: WorkflowName[] = [];
  const { event_name, actor, comment_body, is_pr_comment } = event;
  const isPhuhl = actor === "phuhl";

  // opencode-do
  if (
    (event_name === "issue_comment" ||
      event_name === "pull_request_review_comment") &&
    comment_body != null &&
    hasCommand(comment_body, "do") &&
    isPhuhl
  ) {
    results.push("opencode-do");
  }

  // opencode-plan
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "issue_comment" &&
      !is_pr_comment &&
      comment_body != null &&
      hasCommand(comment_body, "plan") &&
      isPhuhl)
  ) {
    results.push("opencode-plan");
  }

  // opencode-fix-pr
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "issue_comment" &&
      is_pr_comment &&
      comment_body != null &&
      hasCommand(comment_body, "fix-pr") &&
      isPhuhl)
  ) {
    results.push("opencode-fix-pr");
  }

  // opencode-code-review
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "issue_comment" &&
      is_pr_comment &&
      comment_body != null &&
      hasCommand(comment_body, "code-review") &&
      isPhuhl)
  ) {
    results.push("opencode-code-review");
  }

  // opencode-address-review
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "pull_request_review" &&
      event.review_user === "phuhl" &&
      (event.review_state === "changes_requested" ||
        event.review_state === "commented")) ||
    (event_name === "issue_comment" &&
      is_pr_comment &&
      comment_body != null &&
      hasCommand(comment_body, "address-review") &&
      isPhuhl)
  ) {
    results.push("opencode-address-review");
  }

  // opencode-complete-gate
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "pull_request" && event.label_name === "auto-review") ||
    event_name === "workflow_run" ||
    (event_name === "issue_comment" &&
      is_pr_comment &&
      comment_body != null &&
      hasCommand(comment_body, "complete-gate") &&
      isPhuhl)
  ) {
    results.push("opencode-complete-gate");
  }

  // opencode-plan-and-implement
  if (
    (event_name === "workflow_dispatch" && isPhuhl) ||
    (event_name === "issues" && event.label_name === "opencode" && isPhuhl)
  ) {
    results.push("opencode-plan-and-implement");
  }

  // opencode-dispatcher — generic /oc or /opencode, excluding specific commands
  if (
    (event_name === "issue_comment" ||
      event_name === "pull_request_review_comment") &&
    comment_body != null &&
    containsSlashCommand(comment_body) &&
    !hasCommand(comment_body, "code-review") &&
    !hasCommand(comment_body, "fix-pr") &&
    !hasCommand(comment_body, "plan") &&
    !hasCommand(comment_body, "address-review") &&
    !hasCommand(comment_body, "do") &&
    isPhuhl
  ) {
    results.push("opencode-dispatcher");
  }

  return results;
}
