import type { ScenarioSpec, E2EContext } from "../types";
import {
  addPrLabel,
  getPrComments,
  getPrLabels,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
  createPrWithChanges,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const completeGate: ScenarioSpec = {
  name: "complete-gate",
  description:
    "PR with auto-review label triggers complete-gate which processes and adds ready for review",
  timeoutMs: 900_000, // 15 minutes
  setup: async (ctx) => {
    const branchName = `e2e/complete-gate-${Date.now()}`;
    ctx.branchName = branchName;

    const result = createPrWithChanges(
      ctx.repo,
      branchName,
      "CompleteGate test: add JSDoc to add function",
      "Add a JSDoc comment above the `add` function in src/add.ts explaining what it does.",
      [
        {
          path: "src/add.ts",
          content: `/**
 * Adds two numbers together.
 * @param a - The first number.
 * @param b - The second number.
 * @returns The sum of a and b.
 */
export function add(a: number, b: number): number {
  return a + b;
}
`,
        },
      ],
    );
    ctx.prNumber = result.number;
  },
  trigger: async (ctx) => {
    addPrLabel(ctx.repo, ctx.prNumber!, "auto-review");
  },
  wait: async (ctx) => {
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

    const gateComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("Complete Gate is processing"),
    );
    results.push(
      assert(!!gateComment, "Complete-gate posted a progress comment"),
    );

    const terminalLabel = labels.some(
      (l) => l === "ready for review" || l === "autofix-exhausted",
    );
    results.push(
      assert(
        terminalLabel,
        "PR has terminal label (ready for review or autofix-exhausted)",
      ),
    );

    results.push(
      assert(
        !labels.includes("gate-running"),
        "gate-running label was removed",
      ),
    );

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
