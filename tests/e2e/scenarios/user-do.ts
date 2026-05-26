import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  commentOnIssue,
  getIssueComments,
  getPrForIssue,
  closeIssue,
  safeCleanup,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const userDo: ScenarioSpec = {
  name: "user-do",
  description:
    "Comment /oc do on an issue triggers the user-do skill with a custom prompt",
  timeoutMs: 600_000,
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Do test: verify bot can follow instructions",
      "Use /oc do to verify the bot handles custom prompts.",
    );
    ctx.issueNumber = issue.number;
  },
  trigger: async (ctx) => {
    commentOnIssue(
      ctx.repo,
      ctx.issueNumber!,
      "/oc do Analyze the src/greet.ts file and post a comment on this issue describing what it does in one sentence.",
    );
  },
  wait: async (ctx) => {
    const found = await waitFor(
      async () => {
        const comments = await getIssueComments(ctx.repo, ctx.issueNumber!);
        const botComments = comments.filter((c) => isBot(c.author));
        return botComments.some(
          (c) =>
            !c.body.includes("OpenCode is running") &&
            !c.body.includes("/oc do finished") &&
            c.body.length > 20,
        );
      },
      300_000,
      10000,
    );
    if (!found) throw new Error("Timed out waiting for user-do bot response");
  },
  assertions: async (ctx) => {
    const results = [];
    const comments = await getIssueComments(ctx.repo, ctx.issueNumber!);

    const doResult = comments.find(
      (c) =>
        isBot(c.author) &&
        !c.body.includes("OpenCode is running") &&
        !c.body.includes("/oc do finished") &&
        c.body.length > 20,
    );
    results.push(
      assert(!!doResult, "Bot posted a response with the actual analysis"),
    );

    // Verify the response mentions the greet function
    if (doResult) {
      results.push(
        assert(
          doResult.body.toLowerCase().includes("greet"),
          "Bot response mentions the greet function",
        ),
      );
    }

    // No error
    const errorComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("encountered an error"),
    );
    results.push(assert(!errorComment, "No error comment from bot"));

    const pr = await getPrForIssue(ctx.repo, ctx.issueNumber!);
    results.push(
      assert(
        pr === null,
        "/oc do for analysis-only prompt did not create a PR",
      ),
    );

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
