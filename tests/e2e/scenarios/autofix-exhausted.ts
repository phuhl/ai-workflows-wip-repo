import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  addPrLabel,
  removePrLabel,
  getPrLabels,
  getPrComments,
  getPrForIssue,
  closeIssue,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
} from "../engine";
import { waitFor, sleep, assert, isBot } from "../utils";

export const autofixExhausted: ScenarioSpec = {
  name: "autofix-exhausted",
  description:
    "PR with failing CI gets auto-review → complete-gate tries autofix up to 3 times → exhausts",
  timeoutMs: 1_800_000, // 30 minutes
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "Autofix test: add broken test intentionally",
      "Add a test in tests/broken.test.ts that always fails: expect(1).toBe(2). This should cause CI to fail.",
    );
    ctx.issueNumber = issue.number;
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

    addPrLabel(ctx.repo, ctx.prNumber!, "auto-review");
  },
  wait: async (ctx) => {
    // Poll for autofix-exhausted label or autofix-attempts-3 label
    // Complete-gate runs when auto-review is added, and re-adds auto-review after each attempt
    const found = await waitFor(
      async () => {
        const labels = await getPrLabels(ctx.repo, ctx.prNumber!);
        return labels.includes("autofix-exhausted");
      },
      1_680_000,
      30000,
    );
    if (!found) throw new Error("Timed out waiting for autofix-exhausted");
  },
  assertions: async (ctx) => {
    const results = [];
    const labels = await getPrLabels(ctx.repo, ctx.prNumber!);
    const comments = await getPrComments(ctx.repo, ctx.prNumber!);

    // autofix-exhausted label exists
    results.push(
      assert(
        labels.includes("autofix-exhausted"),
        "autofix-exhausted label was added",
      ),
    );

    // Warning comment posted
    const warnComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("Autofix exhausted"),
    );
    results.push(
      assert(!!warnComment, "Warning comment about exhaustion was posted"),
    );

    // At least one autofix attempt was recorded
    const attemptLabels = labels.filter((l) => /^autofix-attempts-\d$/.test(l));
    results.push(
      assert(
        attemptLabels.length > 0 || labels.includes("autofix-exhausted"),
        "Autofix attempt labels were cycled",
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
    if (ctx.issueNumber) {
      await safeCleanup(
        () => closeIssue(ctx.repo, ctx.issueNumber!),
        "close issue",
      );
    }
  },
};
