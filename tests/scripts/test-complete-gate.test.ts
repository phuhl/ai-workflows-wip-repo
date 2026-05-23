import { describe, it, expect } from "vitest";
import {
  decideGateAction,
  type GateState,
  type GateAction,
} from "../../scripts/gate-logic";

type TestCase = {
  name: string;
  state: GateState;
  expected: GateAction;
};

const baseState: GateState = {
  should_run: true,
  has_conflicts: false,
  autofix_count: 0,
  ci_status: "passing",
  implementation_complete: null,
  issue_number: null,
};

const cases: TestCase[] = [
  // ── should_run guard ──────────────────────────────────────────
  {
    name: "should_run false → exit",
    state: { ...baseState, should_run: false },
    expected: { type: "exit-no-auto-review" },
  },

  // ── conflicts branch ──────────────────────────────────────────
  {
    name: "conflicts, count 0 → resolve (attempt 1)",
    state: {
      ...baseState,
      has_conflicts: true,
      autofix_count: 0,
      ci_status: "pending",
    },
    expected: { type: "resolve-conflicts", attempt: 1 },
  },
  {
    name: "conflicts, count 1 → resolve (attempt 2)",
    state: {
      ...baseState,
      has_conflicts: true,
      autofix_count: 1,
      ci_status: "pending",
    },
    expected: { type: "resolve-conflicts", attempt: 2 },
  },
  {
    name: "conflicts, count 2 → resolve (attempt 3)",
    state: {
      ...baseState,
      has_conflicts: true,
      autofix_count: 2,
      ci_status: "pending",
    },
    expected: { type: "resolve-conflicts", attempt: 3 },
  },
  {
    name: "conflicts, count 3 → exhausted",
    state: {
      ...baseState,
      has_conflicts: true,
      autofix_count: 3,
      ci_status: "pending",
    },
    expected: { type: "exhaust-conflicts" },
  },
  {
    name: "conflicts, count 4 → exhausted (safety clamp)",
    state: {
      ...baseState,
      has_conflicts: true,
      autofix_count: 4,
    },
    expected: { type: "exhaust-conflicts" },
  },

  // ── no conflicts + CI passing ─────────────────────────────────
  {
    name: "CI passing, count 0 → review-pr",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 0,
      ci_status: "passing",
    },
    expected: { type: "review-pr" },
  },
  {
    name: "CI passing, count 3 → review-pr (ignores count)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 3,
      ci_status: "passing",
    },
    expected: { type: "review-pr" },
  },

  // ── no conflicts + CI failing, incomplete implementation ──────
  {
    name: "CI failing, incomplete, count 0 → plan-and-implement",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 0,
      ci_status: "failing",
      implementation_complete: false,
      issue_number: "42",
    },
    expected: { type: "plan-and-implement", issue: "42" },
  },
  {
    name: "CI failing, incomplete, count 0, no issue → fallback ?",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 0,
      ci_status: "failing",
      implementation_complete: false,
      issue_number: null,
    },
    expected: { type: "plan-and-implement", issue: "?" },
  },

  // ── no conflicts + CI failing, complete implementation ────────
  {
    name: "CI failing, complete, count 0 → fix-pr (attempt 1)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 0,
      ci_status: "failing",
      implementation_complete: true,
    },
    expected: { type: "fix-pr", attempt: 1 },
  },
  {
    name: "CI failing, complete, count 1 → fix-pr (attempt 2)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 1,
      ci_status: "failing",
      implementation_complete: true,
    },
    expected: { type: "fix-pr", attempt: 2 },
  },
  {
    name: "CI failing, complete, count 2 → fix-pr (attempt 3)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 2,
      ci_status: "failing",
      implementation_complete: true,
    },
    expected: { type: "fix-pr", attempt: 3 },
  },

  // ── no conflicts + CI failing, exhausted ──────────────────────
  {
    name: "CI failing, complete, count 3 → exhausted",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 3,
      ci_status: "failing",
      implementation_complete: true,
    },
    expected: { type: "exhaust-ci" },
  },
  {
    name: "CI failing, incomplete, count 3 → exhausted (incomplete is irrelevant)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 3,
      ci_status: "failing",
      implementation_complete: false,
      issue_number: "42",
    },
    expected: { type: "exhaust-ci" },
  },

  // ── CI pending (no-op) ────────────────────────────────────────
  {
    name: "no conflicts, CI pending → exit (shouldn't occur in practice)",
    state: {
      ...baseState,
      has_conflicts: false,
      autofix_count: 0,
      ci_status: "pending",
    },
    expected: { type: "exit-no-auto-review" },
  },
];

describe("Complete-gate state machine", () => {
  it.each(cases)("$name", ({ state, expected }) => {
    const result = decideGateAction(state);
    expect(result).toEqual(expected);
  });
});
