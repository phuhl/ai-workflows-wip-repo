import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  labelIssue,
  getPrForIssue,
  getPrLabels,
  getPrFiles,
  getIssueComments,
  closeIssue,
  deleteBranch,
  closePr,
  getPr,
  safeCleanup,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const happyPath: ScenarioSpec = {
  name: "happy-path",
  description:
    "Issue labeled opencode → plan-and-implement → PR with bot-authored code → ready for review",
  timeoutMs: 600_000, // 10 minutes
  checkJob: "plan-and-implement",
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Add multiply function to src/add.ts",
      "Please add a `multiply` function that returns `a * b` to `src/add.ts`.",
    );
    ctx.issueNumber = issue.number;
    ctx.metadata.issueNumber = String(issue.number);
    ctx.metadata.issueTitle = "Add multiply function to src/add.ts";
  },
  trigger: async (ctx) => {
    labelIssue(ctx.repo, ctx.issueNumber!, "opencode");
  },
  wait: async (ctx) => {
    // Wait for a PR to be created for this issue
    const found = await waitFor(
      async () => {
        const pr = await getPrForIssue(ctx.repo, ctx.issueNumber!);
        if (pr) {
          ctx.prNumber = pr.number;
          return true;
        }
        return false;
      },
      600_000,
      20000,
    );
    if (!found) throw new Error("Timed out waiting for PR to be created");
  },
  assertions: async (ctx) => {
    const results = [];
    const pr = await getPr(ctx.repo, ctx.prNumber!);
    const files = await getPrFiles(ctx.repo, ctx.prNumber!);
    const comments = await getIssueComments(ctx.repo, ctx.issueNumber!);

    // PR was created by the bot
    results.push(
      assert(
        isBot(pr.author.login),
        `PR #${ctx.prNumber} authored by bot (${pr.author.login})`,
      ),
    );

    // PR is a draft initially
    results.push(assert(pr.isDraft === true, "PR is a draft"));

    // PR branch follows naming convention
    results.push(
      assert(
        pr.headRefName.startsWith("opencode-") ||
          pr.headRefName.includes(String(ctx.issueNumber)),
        `PR branch name follows convention: ${pr.headRefName}`,
      ),
    );

    // Source file was changed
    results.push(
      assert(files.includes("src/add.ts"), "src/add.ts was modified"),
    );

    // No files in protected directories
    const hasProtected = files.some(
      (f) => f.startsWith(".opencode/") || f.startsWith(".ai-workflows/"),
    );
    results.push(
      assert(
        !hasProtected,
        "No files in protected directories (.opencode/, .ai-workflows/)",
      ),
    );

    // A subtasks comment or progress comment exists from the bot
    const botComments = comments.filter((c) => isBot(c.author));
    results.push(
      assert(
        botComments.length > 0,
        "Bot posted at least one comment on the issue",
      ),
    );

    // Issue has a comment with a plan
    const planComment = comments.find(
      (c) =>
        isBot(c.author) &&
        (c.body.includes("plan") || c.body.includes("## Subtasks")),
    );
    results.push(assert(!!planComment, "Bot posted a plan/subtasks comment"));

    return results;
  },
  cleanup: async (ctx) => {
    if (ctx.prNumber) {
      await safeCleanup(async () => {
        const prInfo = await getPr(ctx.repo, ctx.prNumber!);
        await deleteBranch(ctx.repo, prInfo.headRefName);
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
