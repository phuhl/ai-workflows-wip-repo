import type { ScenarioSpec, E2EContext } from "../types";
import {
  createIssue,
  addPrLabel,
  getPrComments,
  getPrLabels,
  getPrForIssue,
  closeIssue,
  closePr,
  deleteBranch,
  getPr,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const completeGate: ScenarioSpec = {
  name: "complete-gate",
  description:
    "PR with auto-review label triggers complete-gate which processes and adds ready for review",
  timeoutMs: 900_000, // 15 minutes
  setup: async (ctx) => {
    const issue = createIssue(
      ctx.repo,
      "CompleteGate test: add JSDoc to add function",
      "Add a JSDoc comment above the `add` function in src/add.ts explaining what it does.",
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
    // Wait for either: ready for review label, autofix-exhausted, or a progress comment
    const found = await waitFor(
      async () => {
        const labels = await getPrLabels(ctx.repo, ctx.prNumber!);
        if (
          labels.includes("ready for review") ||
          labels.includes("autofix-exhausted")
        ) {
          return true;
        }

        const comments = await getPrComments(ctx.repo, ctx.prNumber!);
        const gateComments = comments.filter(
          (c) => isBot(c.author) && c.body.includes("Complete Gate"),
        );
        if (gateComments.length >= 2) {
          return true;
        }

        return false;
      },
      600_000,
      15000,
    );
    if (!found)
      throw new Error("Timed out waiting for complete-gate to process PR");
  },
  assertions: async (ctx) => {
    const results = [];
    const labels = await getPrLabels(ctx.repo, ctx.prNumber!);
    const comments = await getPrComments(ctx.repo, ctx.prNumber!);

    // Complete-gate posted a progress comment
    const gateComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("Complete Gate is processing"),
    );
    results.push(
      assert(!!gateComment, "Complete-gate posted a progress comment"),
    );

    // Either ready for review or autofix-exhausted label exists
    const terminalLabel = labels.some(
      (l) => l === "ready for review" || l === "autofix-exhausted",
    );
    results.push(
      assert(
        terminalLabel,
        "PR has terminal label (ready for review or autofix-exhausted)",
      ),
    );

    // Gate-running label should be removed (gate finished)
    results.push(
      assert(
        !labels.includes("gate-running"),
        "gate-running label was removed",
      ),
    );

    // No error
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
