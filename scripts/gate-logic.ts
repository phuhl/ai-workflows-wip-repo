export type CiStatus = "pending" | "passing" | "failing";

export interface GateState {
  should_run: boolean;
  has_conflicts: boolean;
  autofix_count: number;
  ci_status: CiStatus;
  implementation_complete: boolean | null;
  issue_number: string | null;
}

export type GateAction =
  | { type: "exit-no-auto-review" }
  | { type: "resolve-conflicts"; attempt: number }
  | { type: "exhaust-conflicts" }
  | { type: "plan-and-implement"; issue: string }
  | { type: "fix-pr"; attempt: number }
  | { type: "exhaust-ci" }
  | { type: "review-pr" };

export function decideGateAction(state: GateState): GateAction {
  if (!state.should_run) {
    return { type: "exit-no-auto-review" };
  }

  const exhausted = state.autofix_count >= 3;

  if (state.has_conflicts) {
    if (exhausted) return { type: "exhaust-conflicts" };
    return { type: "resolve-conflicts", attempt: state.autofix_count + 1 };
  }

  if (state.ci_status === "passing") {
    return { type: "review-pr" };
  }

  if (state.ci_status === "failing") {
    if (exhausted) return { type: "exhaust-ci" };

    if (state.implementation_complete === false) {
      return {
        type: "plan-and-implement",
        issue: state.issue_number ?? "?",
      };
    }

    return { type: "fix-pr", attempt: state.autofix_count + 1 };
  }

  return { type: "exit-no-auto-review" };
}
