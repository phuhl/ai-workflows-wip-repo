import type {
  ScenarioResult,
  ScenarioSpec,
  E2EContext,
  AssertionResult,
  WorkflowRun,
} from "./types";
import { getWorkflowRuns } from "./engine";

export function logHeader(text: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

export function logStep(text: string): void {
  console.log(`  → ${text}`);
}

export function logPass(text: string): void {
  console.log(`    ✅ ${text}`);
}

export function logFail(text: string): void {
  console.log(`    ❌ ${text}`);
}

export async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  return false;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyRunStarted(
  repo: string,
  branch: string,
  after: Date,
): Promise<WorkflowRun> {
  const timeoutMs = 120_000;

  while (Date.now() - after.getTime() < timeoutMs) {
    const runs = await getWorkflowRuns(repo, branch);
    const newRuns = runs.filter(
      (r) =>
        r.name === "OpenCode" &&
        new Date(r.createdAt).getTime() > after.getTime(),
    );

    if (newRuns.length > 0) {
      const latest = newRuns[0];

      if (latest.status === "completed" && latest.conclusion === "failure") {
        throw new Error(
          `Workflow run ${latest.id} failed at startup (no runner assigned, missing secrets, or invalid workflow). Check the run for details.`,
        );
      }

      if (
        latest.status === "queued" ||
        latest.status === "in_progress" ||
        latest.status === "waiting"
      ) {
        return latest;
      }
    }

    await sleep(10000);
  }

  throw new Error(
    `No workflow run "OpenCode" started on branch "${branch}" within ${timeoutMs}ms. The trigger may not have fired.`,
  );
}

export async function runScenario(
  scenario: ScenarioSpec,
  ctx: E2EContext,
): Promise<ScenarioResult> {
  const start = Date.now();
  logHeader(`Scenario: ${scenario.name}`);
  console.log(`  ${scenario.description}`);

  try {
    logStep("Running setup...");
    await scenario.setup(ctx);
    logPass("Setup complete");

    const triggerTime = new Date();

    logStep("Running trigger...");
    await scenario.trigger(ctx);
    logPass("Trigger complete");

    logStep("Verifying workflow started...");
    const startedRun = await verifyRunStarted(ctx.repo, "master", triggerTime);

    logStep(`Waiting (timeout: ${scenario.timeoutMs}ms)...`);
    await scenario.wait(ctx);
    logPass("Wait complete");

    logStep("Running assertions...");
    const assertions = await scenario.assertions(ctx);
    for (const a of assertions) {
      if (a.passed) {
        logPass(a.message);
      } else {
        logFail(a.message);
      }
    }

    const passed = assertions.every((a) => a.passed);
    return {
      name: scenario.name,
      passed,
      assertions,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    logFail(`Error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      name: scenario.name,
      passed: false,
      assertions: [],
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  } finally {
    try {
      logStep("Running cleanup...");
      await scenario.cleanup(ctx);
      logPass("Cleanup complete");
    } catch (e) {
      logFail(`Cleanup error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export function assert(condition: boolean, message: string): AssertionResult {
  return { name: message, passed: condition, message };
}

export function printSummary(results: ScenarioResult[]): void {
  logHeader("Test Run Summary");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const duration = (r.durationMs / 1000).toFixed(1);
    console.log(`  ${icon} ${r.name} (${duration}s)`);
    if (r.error) {
      console.log(`      Error: ${r.error}`);
    }
    for (const a of r.assertions.filter((a) => !a.passed)) {
      console.log(`      Failed: ${a.message}`);
    }
  }

  console.log(
    `\n  ${passed} passed, ${failed} failed, ${results.length} total`,
  );
}

export function isBot(author: string): boolean {
  return (
    author === "opencode[bot]" ||
    author.includes("[bot]") ||
    author.includes("/app")
  );
}
