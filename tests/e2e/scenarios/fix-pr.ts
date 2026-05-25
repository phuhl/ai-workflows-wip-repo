import type { ScenarioSpec, E2EContext } from "../types";
import {
  commentOnIssue,
  getPrComments,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
  createPrWithChanges,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const fixPr: ScenarioSpec = {
  name: "fix-pr",
  description:
    "Comment /oc fix-pr on a PR triggers the fix-pr skill and bot responds",
  timeoutMs: 600_000,
  checkJob: "fix-pr",
  setup: async (ctx) => {
    const branchName = `e2e/fix-pr-${Date.now()}`;
    ctx.branchName = branchName;

    const result = createPrWithChanges(
      ctx.repo,
      branchName,
      "Fix: add test for greet function edge case",
      "Add a test in tests/greet.test.ts that verifies greet with an empty string returns 'Hello '.",
      [
        {
          path: "tests/greet.test.ts",
          content: `import { greet } from "../src/greet";
import { describe, it, expect } from "vitest";

describe("greet", () => {
  it("returns 'Hello ' for empty string", () => {
    expect(greet("")).toBe("Hello ");
  });
});
`,
        },
      ],
    );
    ctx.prNumber = result.number;
  },
  trigger: async (ctx) => {
    commentOnIssue(
      ctx.repo,
      ctx.prNumber!,
      "/oc fix-pr Please review for edge case handling.",
    );
  },
  wait: async (ctx) => {
    const found = await waitFor(
      async () => {
        const comments = await getPrComments(ctx.repo, ctx.prNumber!);
        return comments.some(
          (c) =>
            isBot(c.author) &&
            (c.body.includes("fix-pr") ||
              c.body.includes("finished") ||
              c.body.includes("started")),
        );
      },
      300_000,
      15000,
    );
    if (!found) throw new Error("Timed out waiting for fix-pr bot comment");
  },
  assertions: async (ctx) => {
    const results = [];
    const comments = await getPrComments(ctx.repo, ctx.prNumber!);

    const botComment = comments.find(
      (c) =>
        isBot(c.author) &&
        (c.body.includes("fix-pr") || c.body.includes("OpenCode")),
    );
    results.push(assert(!!botComment, "Bot posted a fix-pr response"));

    const errorComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("encountered an error"),
    );
    results.push(assert(!errorComment, "No error comment from bot"));

    return results;
  },
  cleanup: async (ctx) => {
    if (ctx.prNumber) {
      await safeCleanup(async () => {
        const pr = await getPr(ctx.repo, ctx.prNumber!);
        await deleteBranch(ctx.repo, pr.headRefName);
      }, "delete branch");
      await safeCleanup(() => closePr(ctx.repo, ctx.prNumber!), "close PR");
    }
  },
};
