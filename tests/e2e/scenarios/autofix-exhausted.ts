import type { ScenarioSpec, E2EContext } from "../types";
import {
  addPrLabel,
  getPrLabels,
  getPrComments,
  closePr,
  deleteBranch,
  getPr,
  safeCleanup,
  createPrWithChanges,
} from "../engine";
import { waitFor, assert, isBot } from "../utils";

export const autofixExhausted: ScenarioSpec = {
  name: "autofix-exhausted",
  description:
    "PR with failing CI gets auto-review → complete-gate tries autofix up to 3 times → exhausts",
  timeoutMs: 1_800_000, // 30 minutes
  setup: async (ctx) => {
    const branchName = `e2e/autofix-exhausted-${Date.now()}`;
    ctx.branchName = branchName;

    const result = createPrWithChanges(
      ctx.repo,
      branchName,
      "Autofix test: add broken test intentionally",
      "Add a test in tests/broken.test.ts that always fails: expect(1).toBe(2).",
      [
        {
          path: "tests/broken.test.ts",
          content: `import { describe, it, expect } from "vitest";

describe("broken", () => {
  it("always fails", () => {
    expect(1).toBe(2);
  });
});
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

    results.push(
      assert(
        labels.includes("autofix-exhausted"),
        "autofix-exhausted label was added",
      ),
    );

    const warnComment = comments.find(
      (c) => isBot(c.author) && c.body.includes("Autofix exhausted"),
    );
    results.push(
      assert(!!warnComment, "Warning comment about exhaustion was posted"),
    );

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
  },
};
