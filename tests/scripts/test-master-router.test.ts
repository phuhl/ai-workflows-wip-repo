import { describe, it, expect } from "vitest";
import { routeEvent, type RouterEvent, type WorkflowName } from "../../scripts/router-logic";

type TestCase = {
  name: string;
  event: RouterEvent;
  expected: WorkflowName[];
};

const phuhl = "phuhl";

const cases: TestCase[] = [
  // ── issue_comment on issues (not PR) ──────────────────────────
  {
    name: "/oc plan on issue",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc plan",
      is_pr_comment: false,
    },
    expected: ["opencode-plan"],
  },
  {
    name: "/opencode plan on issue",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/opencode plan",
      is_pr_comment: false,
    },
    expected: ["opencode-plan"],
  },
  {
    name: "/oc do on issue",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc do something",
      is_pr_comment: false,
    },
    expected: ["opencode-do"],
  },
  {
    name: "/oc code-review on issue (no PR) — nothing triggers",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc code-review",
      is_pr_comment: false,
    },
    expected: [],
  },
  {
    name: "/oc random-cmd on issue — dispatcher only",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc whatever",
      is_pr_comment: false,
    },
    expected: ["opencode-dispatcher"],
  },
  {
    name: "no slash command on issue",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "hello world",
      is_pr_comment: false,
    },
    expected: [],
  },
  {
    name: "slash command but wrong actor",
    event: {
      event_name: "issue_comment",
      actor: "someone-else",
      comment_body: "/oc plan",
      is_pr_comment: false,
    },
    expected: [],
  },
  {
    name: "/oc with leading space on issue — dispatcher",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "please run /oc analyze this",
      is_pr_comment: false,
    },
    expected: ["opencode-dispatcher"],
  },

  // ── issue_comment on PRs ──────────────────────────────────────
  {
    name: "/oc code-review on PR",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc code-review",
      is_pr_comment: true,
    },
    expected: ["opencode-code-review"],
  },
  {
    name: "/oc fix-pr on PR",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc fix-pr",
      is_pr_comment: true,
    },
    expected: ["opencode-fix-pr"],
  },
  {
    name: "/oc plan on PR — does not trigger plan (issues only)",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc plan",
      is_pr_comment: true,
    },
    expected: [],
  },
  {
    name: "/oc do on PR",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc do fix this bug",
      is_pr_comment: true,
    },
    expected: ["opencode-do"],
  },
  {
    name: "/oc address-review on PR",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc address-review",
      is_pr_comment: true,
    },
    expected: ["opencode-address-review"],
  },
  {
    name: "/oc complete-gate on PR — triggers both complete-gate and dispatcher",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc complete-gate",
      is_pr_comment: true,
    },
    expected: ["opencode-complete-gate", "opencode-dispatcher"],
  },
  {
    name: "/oc random-cmd on PR — dispatcher only",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc random-cmd",
      is_pr_comment: true,
    },
    expected: ["opencode-dispatcher"],
  },
  {
    name: "both /oc do and /oc code-review in same comment",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc code-review and /oc do stuff",
      is_pr_comment: true,
    },
    expected: ["opencode-do", "opencode-code-review"],
  },
  {
    name: "/oc code-review on PR with wrong actor",
    event: {
      event_name: "issue_comment",
      actor: "someone-else",
      comment_body: "/oc code-review",
      is_pr_comment: true,
    },
    expected: [],
  },

  // ── pull_request_review ───────────────────────────────────────
  {
    name: "phuhl submits changes_requested",
    event: {
      event_name: "pull_request_review",
      actor: phuhl,
      review_user: phuhl,
      review_state: "changes_requested",
    },
    expected: ["opencode-address-review"],
  },
  {
    name: "phuhl submits commented",
    event: {
      event_name: "pull_request_review",
      actor: phuhl,
      review_user: phuhl,
      review_state: "commented",
    },
    expected: ["opencode-address-review"],
  },
  {
    name: "phuhl submits approved",
    event: {
      event_name: "pull_request_review",
      actor: phuhl,
      review_user: phuhl,
      review_state: "approved",
    },
    expected: [],
  },
  {
    name: "other user submits changes_requested",
    event: {
      event_name: "pull_request_review",
      actor: "someone-else",
      review_user: "someone-else",
      review_state: "changes_requested",
    },
    expected: [],
  },

  // ── pull_request labeled ──────────────────────────────────────
  {
    name: "PR labeled auto-review",
    event: {
      event_name: "pull_request",
      actor: "github-actions",
      label_name: "auto-review",
    },
    expected: ["opencode-complete-gate"],
  },
  {
    name: "PR labeled bug",
    event: {
      event_name: "pull_request",
      actor: "github-actions",
      label_name: "bug",
    },
    expected: [],
  },

  // ── issues labeled ────────────────────────────────────────────
  {
    name: "issue labeled opencode by phuhl",
    event: {
      event_name: "issues",
      actor: phuhl,
      label_name: "opencode",
    },
    expected: ["opencode-plan-and-implement"],
  },
  {
    name: "issue labeled opencode by other",
    event: {
      event_name: "issues",
      actor: "someone-else",
      label_name: "opencode",
    },
    expected: [],
  },
  {
    name: "issue labeled bug",
    event: {
      event_name: "issues",
      actor: phuhl,
      label_name: "bug",
    },
    expected: [],
  },

  // ── workflow_dispatch ─────────────────────────────────────────
  {
    name: "workflow_dispatch by phuhl — triggers all 6",
    event: {
      event_name: "workflow_dispatch",
      actor: phuhl,
    },
    expected: [
      "opencode-plan",
      "opencode-fix-pr",
      "opencode-code-review",
      "opencode-address-review",
      "opencode-complete-gate",
      "opencode-plan-and-implement",
    ],
  },

  // ── workflow_run ──────────────────────────────────────────────
  {
    name: "workflow_run triggers complete-gate",
    event: {
      event_name: "workflow_run",
      actor: "github-actions",
    },
    expected: ["opencode-complete-gate"],
  },

  // ── pull_request_review_comment ───────────────────────────────
  {
    name: "/oc do on PR review comment",
    event: {
      event_name: "pull_request_review_comment",
      actor: phuhl,
      comment_body: "/oc do fix",
    },
    expected: ["opencode-do"],
  },
  {
    name: "/oc random-cmd on PR review comment — dispatcher",
    event: {
      event_name: "pull_request_review_comment",
      actor: phuhl,
      comment_body: "/oc analyze this",
    },
    expected: ["opencode-dispatcher"],
  },
  {
    name: "/oc code-review on PR review comment with wrong actor",
    event: {
      event_name: "pull_request_review_comment",
      actor: "someone-else",
      comment_body: "/oc code-review",
    },
    expected: [],
  },

  // ── edge: dispatcher exclusion integrity ──────────────────────
  {
    name: "/oc complete-gate is NOT excluded from dispatcher",
    event: {
      event_name: "issue_comment",
      actor: phuhl,
      comment_body: "/oc complete-gate",
      is_pr_comment: true,
    },
    expected: ["opencode-complete-gate", "opencode-dispatcher"],
  },
];

describe("Master router dispatch logic", () => {
  it.each(cases)("$name", ({ event, expected }) => {
    const result = routeEvent(event);
    // Sort both for deterministic comparison
    const sorted = (arr: string[]) => [...arr].sort();
    expect(sorted(result)).toEqual(sorted(expected));
  });
});
