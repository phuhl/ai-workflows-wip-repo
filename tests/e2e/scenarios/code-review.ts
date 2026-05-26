import type { ScenarioSpec, E2EContext } from "../types";
import {
  commentOnIssue,
  getPrComments,
  getPrCommitCount,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
  createPrWithChanges,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const codeReview: ScenarioSpec = {
  name: "code-review",
  description:
    "Comment /oc code-review on a PR triggers review-pr and posts review comments",
  timeoutMs: 600_000,
  checkJob: "code-review",
  setup: async (ctx) => {
    const branchName = `e2e/code-review-${Date.now()}`;
    ctx.branchName = branchName;

    const result = createPrWithChanges(
      ctx.repo,
      branchName,
      "Review test: add JSDoc to greet function",
      "Add a JSDoc comment above the `greet` function in src/greet.ts explaining what it does.",
      [
        {
          path: "src/greet.ts",
          content: `/**
 * Greets a person by name.
 * @param name - The name to greet.
 * @returns A greeting string.
 */
export function greet(name: string): string {
  return "Hello " + name;
}
`,
        },
      ],
    );
    ctx.prNumber = result.number;
  },
  trigger: async (ctx) => {
    commentOnIssue(ctx.repo, ctx.prNumber!, "/oc code-review");
  },
  wait: async (ctx) => {
    const found = await waitFor(
      async () => {
        const comments = await getPrComments(ctx.repo, ctx.prNumber!);
        return comments.some(
          (c) =>
            isBot(c.author) &&
            (c.body.includes("code-review") || c.body.includes("finished")),
        );
      },
      300_000,
      15000,
    );
    if (!found)
      throw new Error("Timed out waiting for code-review bot comment");
  },
  assertions: async (ctx) => {
    const results = [];
    const issueComments = await getPrComments(ctx.repo, ctx.prNumber!);

    const botProgress = issueComments.find(
      (c) => isBot(c.author) && c.body.includes("code-review"),
    );
    results.push(
      assert(!!botProgress, "Bot posted a code-review progress comment"),
    );

    const errorComment = issueComments.find(
      (c) => isBot(c.author) && c.body.includes("encountered an error"),
    );
    results.push(assert(!errorComment, "No error comment from bot"));

    const commitCount = await getPrCommitCount(ctx.repo, ctx.prNumber!);
    results.push(
      assert(
        commitCount === 1,
        `code-review push no additional commits (initial: 1, current: ${commitCount})`,
      ),
    );

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
