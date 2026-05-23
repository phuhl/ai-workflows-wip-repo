import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  commentOnIssue,
  getIssueComments,
  getPrForIssue,
  closeIssue,
  safeCleanup,
} from "../engine";
import { waitFor, sleep, assert, isBot } from "../utils";

export const planOnly: ScenarioSpec = {
  name: "plan-only",
  description:
    "Comment /oc plan on an issue triggers the plan skill (no PR created)",
  timeoutMs: 300_000,
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Plan test: add documentation",
      "Add JSDoc comments to all functions in src/.",
    );
    ctx.issueNumber = issue.number;
  },
  trigger: async (ctx) => {
    commentOnIssue(ctx.repo, ctx.issueNumber!, "/oc plan");
  },
  wait: async (ctx) => {
    // Wait for bot to respond with a plan comment
    const found = await waitFor(
      async () => {
        const comments = await getIssueComments(ctx.repo, ctx.issueNumber!);
        return comments.some((c) => isBot(c.author) && c.body.length > 100);
      },
      300_000,
      10000,
    );
    if (!found) throw new Error("Timed out waiting for plan comment from bot");
  },
  assertions: async (ctx) => {
    const results = [];
    const comments = await getIssueComments(ctx.repo, ctx.issueNumber!);

    // Bot posted a plan comment
    const planComment = comments.find(
      (c) => isBot(c.author) && c.body.length > 100,
    );
    results.push(assert(!!planComment, "Bot posted a plan comment"));

    // No PR was created for this issue
    const pr = await getPrForIssue(ctx.repo, ctx.issueNumber!);
    results.push(
      assert(
        pr === null,
        "No PR was created (plan skill only, not plan-and-implement)",
      ),
    );

    // Plan comment contains implementation detail
    if (planComment) {
      results.push(
        assert(
          planComment.body.length > 200,
          "Plan comment is substantial (>200 chars)",
        ),
      );
    }

    return results;
  },
  cleanup: async (ctx) => {
    if (ctx.issueNumber) {
      await safeCleanup(
        () => closeIssue(ctx.repo, ctx.issueNumber!),
        "close issue",
      );
    }
  },
};
