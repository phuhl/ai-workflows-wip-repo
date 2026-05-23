import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  labelIssue,
  commentOnIssue,
  getPrReviewComments,
  getPrComments,
  getPrForIssue,
  closeIssue,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const codeReview: ScenarioSpec = {
  name: "code-review",
  description:
    "Comment /oc code-review on a PR triggers review-pr and posts review comments",
  timeoutMs: 600_000,
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Review test: add comment to greet function",
      "Add a JSDoc comment above the `greet` function in src/greet.ts explaining what it does.",
    );
    ctx.issueNumber = issue.number;

    labelIssue(ctx.repo, issue.number, "opencode");
  },
  trigger: async (ctx) => {
    await waitFor(
      async () => {
        const pr = await getPrForIssue(ctx.repo, ctx.issueNumber!);
        if (pr) {
          ctx.prNumber = pr.number;
          return true;
        }
        return false;
      },
      300_000,
      15000,
    );

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
    if (ctx.issueNumber) {
      await safeCleanup(
        () => closeIssue(ctx.repo, ctx.issueNumber!),
        "close issue",
      );
    }
  },
};
