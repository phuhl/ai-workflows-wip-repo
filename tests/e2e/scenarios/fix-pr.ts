import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  labelIssue,
  commentOnIssue,
  getPrComments,
  getPrForIssue,
  closeIssue,
  closePr,
  deleteBranch,
  getPr,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const fixPr: ScenarioSpec = {
  name: "fix-pr",
  description:
    "Comment /oc fix-pr on a PR triggers the fix-pr skill and bot responds",
  timeoutMs: 600_000,
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Fix: add test for greet function edge case",
      "Add a test in tests/greet.test.ts that verifies greet with an empty string returns 'Hello '.",
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
      try {
        const pr = await getPr(ctx.repo, ctx.prNumber);
        await deleteBranch(ctx.repo, pr.headRefName);
      } catch {
        /* ignore */
      }
      try {
        await closePr(ctx.repo, ctx.prNumber!);
      } catch {
        /* ignore */
      }
    }
    if (ctx.issueNumber) {
      try {
        await closeIssue(ctx.repo, ctx.issueNumber!);
      } catch {
        /* ignore */
      }
    }
  },
};
