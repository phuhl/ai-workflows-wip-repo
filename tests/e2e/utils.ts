import type {
  ScenarioResult,
  ScenarioSpec,
  E2EContext,
  AssertionResult,
  WorkflowRun,
  TokenUsageEntry,
} from "./types";
import {
  getWorkflowRuns,
  getRunJobs,
  addResultLabel,
  postResultComment,
  extractTokenUsage,
} from "./engine";

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
  checkJob?: string,
): Promise<WorkflowRun> {
  const timeoutMs = 240_000;

  while (Date.now() - after.getTime() < timeoutMs) {
    const runs = await getWorkflowRuns(repo, branch);
    const newRuns = runs.filter(
      (r) =>
        r.name === "OpenCode" &&
        new Date(r.createdAt).getTime() > after.getTime(),
    );

    for (const latest of newRuns) {
      if (
        latest.status === "completed" &&
        (latest.conclusion === "failure" ||
          latest.conclusion === "startup_failure")
      ) {
        throw new Error(
          `Workflow run ${latest.databaseId} failed at startup (conclusion: ${latest.conclusion}). Check the run for details.`,
        );
      }

      if (
        latest.status === "completed" &&
        (latest.conclusion === "skipped" || latest.conclusion === "cancelled")
      ) {
        continue;
      }

      if (checkJob) {
        const jobs = await getRunJobs(repo, latest.databaseId);
        const targetJob = jobs.find((j) => j.name.includes(checkJob));
        if (!targetJob || targetJob.conclusion === "skipped") {
          continue;
        }
      }

      return latest;
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
    const startedRun = await verifyRunStarted(
      ctx.repo,
      "master",
      triggerTime,
      scenario.checkJob,
    );
    const workflowRunId = startedRun.databaseId;
    logPass(
      `Workflow run ${workflowRunId} started (status: ${startedRun.status})`,
    );

    let workflowConclusion: string | null = null;

    const waitPromise = (async () => {
      await scenario.wait(ctx);
      return "wait" as const;
    })();

    const pollPromise = (async () => {
      while (true) {
        await sleep(60_000);
        const runs = await getWorkflowRuns(ctx.repo, "master");
        const relevantRuns = runs.filter(
          (r) =>
            r.name === "OpenCode" &&
            new Date(r.createdAt).getTime() > triggerTime.getTime() &&
            !(
              r.status === "completed" &&
              (r.conclusion === "skipped" || r.conclusion === "cancelled")
            ),
        );
        if (relevantRuns.length === 0) continue;

        const latest = relevantRuns[0];
        if (latest.status === "completed" && latest.conclusion !== "skipped") {
          workflowConclusion = latest.conclusion;
          return "workflow" as const;
        }
      }
    })();

    const winner = await Promise.race([waitPromise, pollPromise]);

    if (winner === "workflow") {
      if (workflowConclusion === "failure") {
        throw new Error(
          `Workflow run ${startedRun.databaseId} finished with conclusion "${workflowConclusion}" before wait completed.`,
        );
      }
      logPass(
        `Workflow run ${startedRun.databaseId} completed (${workflowConclusion}) — giving wait function time to finish.`,
      );
      // Give the wait function a final chance to set up context (e.g. find the PR)
      try {
        await Promise.race([
          scenario.wait(ctx).catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 120_000)),
        ]);
        logPass("Wait complete");
      } catch {
        logPass("Wait timed out after workflow completion");
      }
    } else {
      logPass("Wait complete");
    }

    let tokenUsage: TokenUsageEntry[] = [];
    try {
      logStep("Extracting token usage from workflow logs...");
      tokenUsage = await extractTokenUsage(ctx.repo, workflowRunId);
      if (tokenUsage.length > 0) {
        for (const t of tokenUsage) {
          logPass(
            `Token usage — ${t.skill}: ${t.total_tokens.toLocaleString()} total tokens (${t.source})`,
          );
        }
      } else {
        logPass("No token usage data found in workflow logs");
      }
    } catch {
      logPass("Token usage extraction not available");
    }

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
    const targetNumber = ctx.prNumber ?? ctx.issueNumber;
    if (targetNumber) {
      addResultLabel(ctx.repo, targetNumber, passed);
      if (!passed) {
        postResultComment(
          ctx.repo,
          targetNumber,
          scenario.name,
          passed,
          undefined,
          assertions.filter((a) => !a.passed),
        );
      }
    }
    return {
      name: scenario.name,
      passed,
      assertions,
      durationMs: Date.now() - start,
      tokenUsage: tokenUsage.length > 0 ? tokenUsage : undefined,
    };
  } catch (e) {
    const eMsg = e instanceof Error ? e.message : String(e);
    logFail(`Error: ${eMsg}`);
    const targetNumber = ctx.prNumber ?? ctx.issueNumber;
    if (targetNumber) {
      addResultLabel(ctx.repo, targetNumber, false);
      postResultComment(ctx.repo, targetNumber, scenario.name, false, eMsg);
    }
    return {
      name: scenario.name,
      passed: false,
      assertions: [],
      error: eMsg,
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
